import { asc, eq, isNotNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { auditLogs, importBatches, offers, productSpecs, products, projects, rfqItems, suppliers } from "../../../db/schema";
import seedCatalog from "../../../db/seed-catalog.json";

async function seedInitialCatalog() {
  const database = getDatabaseBinding();
  const counts = await database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM products) AS product_count,
      (SELECT COUNT(*) FROM suppliers) AS supplier_count,
      (SELECT COUNT(*) FROM offers) AS offer_count
  `).first<{ product_count: number; supplier_count: number; offer_count: number }>();
  if ((counts?.product_count ?? 0) > 0 || (counts?.supplier_count ?? 0) > 0 || (counts?.offer_count ?? 0) > 0) return;

  await database.batch([
    database.prepare("DELETE FROM offers"),
    database.prepare("DELETE FROM suppliers"),
    database.prepare("DELETE FROM products"),
  ]);

  const productIds = new Map(seedCatalog.products.map((product, index) => [product.productCode, index + 1]));
  const supplierIds = new Map(seedCatalog.suppliers.map((supplier, index) => [supplier.supplierCode, index + 1]));
  const statements: D1PreparedStatement[] = [];
  seedCatalog.products.forEach((product, index) => statements.push(database.prepare(`
    INSERT INTO products (id, product_code, name, manufacturer, model_number, category, rfq_name, record_date, description, product_url, review_status, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(index + 1, product.productCode, product.name, product.manufacturer, product.modelNumber, product.category, product.rfqName, product.recordDate, null, product.productUrl, product.reviewStatus, product.sourceType)));
  seedCatalog.suppliers.forEach((supplier, index) => statements.push(database.prepare(`
    INSERT INTO suppliers (id, supplier_code, company_name, verification_status)
    VALUES (?, ?, ?, ?)
  `).bind(index + 1, supplier.supplierCode, supplier.companyName, supplier.verificationStatus)));
  seedCatalog.offers.forEach((offer, index) => statements.push(database.prepare(`
    INSERT INTO offers (id, product_id, supplier_id, unit_price, currency, vat_status, quotation_date, shipping_cost, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(index + 1, productIds.get(offer.productCode), supplierIds.get(offer.supplierCode), offer.unitPrice, offer.currency, offer.vatStatus, offer.quotationDate, offer.shippingCost, offer.sourceUrl)));

  const batchSize = 100;
  for (let index = 0; index < statements.length; index += batchSize) {
    await database.batch(statements.slice(index, index + batchSize));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDatabaseBinding() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeHeader(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const headerAliases: Record<string, string[]> = {
  recordDate: ["date", "recorddate", "quotationdate"],
  rfqName: ["rfq", "rfqname", "project", "projectname", "requestname"],
  productCode: ["productcode", "code", "itemcode", "itemreference", "sku"],
  name: ["name", "product", "productname", "item", "itemname", "descriptionofgoods"],
  manufacturer: ["manufacturer", "brand", "make"],
  modelNumber: ["model", "modelnumber", "partnumber", "partno", "mpn"],
  category: ["category", "productcategory"],
  supplierName: ["supplier", "suppliername", "vendor", "vendorname"],
  customerCompany: ["customer", "customercompany", "customername", "client", "clientcompany", "company"],
  customerContact: ["customercontact", "contact", "contactperson", "clientcontact"],
  productUrl: ["url", "link", "producturl", "itemurl"],
  currency: ["currency", "currencycode"],
  quantity: ["quantity", "qty"],
  unitCostExVat: ["unitcostexvat", "unitcost", "price", "unitprice", "cost"],
  shipping: ["shipping", "shippingcost", "deliverycost", "freight"],
  sourceRow: ["sourcerow", "row", "rownumber", "originalrow"],
  description: ["notes", "description", "comment", "comments"],
};

const headerFieldByAlias = new Map(
  Object.entries(headerAliases).flatMap(([field, aliases]) => aliases.map((alias) => [alias, field] as const)),
);

function normalizeImportRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    const text = value == null ? "" : String(value).trim();
    const canonicalHeader = normalizeHeader(header);
    const field = headerFieldByAlias.get(canonicalHeader);
    if (field) {
      if (text) normalized[field] = text;
      continue;
    }
    const specUnit = /^specunit(.+)$/.exec(canonicalHeader);
    if (specUnit && text) {
      normalized[`specunit:${specUnit[1]}`] = text;
      continue;
    }
    const spec = /^(?:spec|specification|specs)(.+)$/.exec(canonicalHeader);
    if (spec && text) normalized[`spec:${spec[1]}`] = text;
  }
  for (const field of Object.keys(headerAliases)) normalized[field] ??= "";
  return normalized;
}

function normalizeDate(value: string): string | null {
  if (!value) return null;
  const serial = Number(value);
  if (/^\d{4,6}(?:\.0+)?$/.test(value) && serial >= 20000 && serial <= 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.trunc(serial) * 86400000).toISOString().slice(0, 10);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 100) : date.toISOString().slice(0, 10);
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const negative = /^\s*\(.*\)\s*$/.test(value);
  const parsed = Number(value.replace(/[(),\s£$€,A-Za-z]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (currency === "£") return "GBP";
  if (currency === "€") return "EUR";
  if (currency === "$" || currency === "US$") return "USD";
  if (currency === "¥") return "JPY";
  return /^[A-Z]{3}$/.test(currency) ? currency : "UNKNOWN";
}

export async function GET() {
  try {
    await seedInitialCatalog();
    const db = getDb();
    const customerAssociations = await db.select({
      productId: rfqItems.productId,
      rfqItemId: rfqItems.id,
      rfqName: projects.title,
      customerCompany: projects.customerName,
      customerContact: projects.customerContact,
      quantity: rfqItems.requestedQuantity,
      sourceRow: rfqItems.sourceRow,
    }).from(rfqItems)
      .innerJoin(projects, eq(rfqItems.projectId, projects.id))
      .where(isNotNull(rfqItems.productId));
    return Response.json({
      products: await db.select().from(products).orderBy(asc(products.name)),
      specifications: await db.select().from(productSpecs),
      suppliers: await db.select().from(suppliers).orderBy(asc(suppliers.companyName)),
      offers: await db.select().from(offers),
      customerAssociations,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load catalog" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    if (!isRecord(payload) || !Array.isArray(payload.rows)) {
      return Response.json({ error: "Upload rows as a spreadsheet row array." }, { status: 400 });
    }
    const rows = payload.rows;
    if (!rows.length) return Response.json({ error: "No rows supplied" }, { status: 400 });
    if (rows.length > 100) return Response.json({ error: "Import at most 100 rows at a time." }, { status: 400 });
    if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      return Response.json({ error: "Every import row must be an object." }, { status: 400 });
    }
    const validRows = rows.filter(isRecord).map(normalizeImportRow);
    if (!validRows.length) return Response.json({ error: "No usable spreadsheet rows were found." }, { status: 400 });
    const db = getDb();
    const fileName = typeof payload.fileName === "string" ? payload.fileName.slice(0, 255) : "pasted-data.csv";
    const [batch] = await db.insert(importBatches).values({ fileName: fileName || "pasted-data.csv", rowCount: validRows.length, status: "review", warnings: validRows.filter((row) => !row.name || !row.productCode).length }).returning();
    const [existingProducts, existingSuppliers, existingProjects, existingItems, existingOffers] = await Promise.all([
      db.select().from(products),
      db.select().from(suppliers),
      db.select().from(projects),
      db.select().from(rfqItems),
      db.select().from(offers),
    ]);
    const productsByCode = new Map(existingProducts.map((product) => [normalizeText(product.productCode), product]));
    const productsByNameAndRfq = new Map<string, typeof existingProducts>();
    for (const product of existingProducts) {
      const key = `${normalizeText(product.name)}|${normalizeText(product.rfqName)}`;
      const candidates = productsByNameAndRfq.get(key) ?? [];
      candidates.push(product);
      productsByNameAndRfq.set(key, candidates);
    }
    const usedNameMatches = new Set<number>();
    const suppliersByName = new Map(existingSuppliers.map((supplier) => [normalizeText(supplier.companyName), supplier]));
    const projectsByKey = new Map(existingProjects.map((project) => [`${normalizeText(project.title)}|${normalizeText(project.customerName)}`, project]));
    const itemsByKey = new Map(existingItems.filter((item) => item.productId != null).map((item) => [
      item.sourceRow == null
        ? `${item.projectId}|${item.productId}`
        : `${item.projectId}|${item.productId}|${item.sourceRow}`,
      item,
    ]));
    const offersByItemAndSupplier = new Map(existingOffers.filter((offer) => offer.rfqItemId != null).map((offer) => [
      `${offer.rfqItemId}|${offer.supplierId}`,
      offer,
    ]));
    const offersByProductSupplier = new Map(existingOffers.map((offer) => [`${offer.productId}|${offer.supplierId}`, offer]));
    let imported = 0;
    let updated = 0;
    for (const [index, row] of validRows.entries()) {
      if (Object.entries(row).some(([key, value]) => key.length > 255 || value.length > 10000)) continue;
      const name = row.name.slice(0, 500);
      if (!name) continue;
      const rfqName = row.rfqName.slice(0, 500);
      const productCode = (row.productCode || `IMP-${batch.id}-${index + 1}`).slice(0, 255);
      const sourceCodeMatch = /^PL-SRC-(.+)$/i.exec(productCode);
      const alternateCodeProduct = sourceCodeMatch
        ? productsByCode.get(normalizeText(`PL-ITEM-${sourceCodeMatch[1]}`))
        : undefined;
      const nameAndRfqKey = `${normalizeText(name)}|${normalizeText(rfqName)}`;
      const nameMatchCandidates = productsByNameAndRfq.get(nameAndRfqKey) ?? [];
      const nameMatchProduct = nameMatchCandidates.length === 1 && !usedNameMatches.has(nameMatchCandidates[0].id)
        ? nameMatchCandidates[0]
        : undefined;
      const existingProduct = productsByCode.get(normalizeText(productCode))
        ?? (alternateCodeProduct && (!alternateCodeProduct.name || normalizeText(alternateCodeProduct.name) === normalizeText(name))
          ? alternateCodeProduct
          : undefined)
        ?? nameMatchProduct
        ?? (!rfqName && (productsByNameAndRfq.get(`${normalizeText(name)}|`) ?? []).length === 1
          ? productsByNameAndRfq.get(`${normalizeText(name)}|`)?.[0]
          : undefined);
      const productValues = {
        productCode,
        name,
        manufacturer: row.manufacturer.slice(0, 500) || null,
        modelNumber: row.modelNumber.slice(0, 500) || null,
        category: row.category.slice(0, 250) || null,
        rfqName: rfqName || null,
        recordDate: normalizeDate(row.recordDate),
        productUrl: row.productUrl.slice(0, 2000) || null,
        description: row.description.slice(0, 10000) || null,
      };
      let productId: number;
      if (existingProduct) {
        productId = existingProduct.id;
        if (!productsByCode.has(normalizeText(productCode)) && existingProduct === nameMatchProduct) {
          usedNameMatches.add(existingProduct.id);
        }
        const merged = {
          productCode: row.productCode ? productCode : existingProduct.productCode,
          name,
          manufacturer: productValues.manufacturer ?? existingProduct.manufacturer,
          modelNumber: productValues.modelNumber ?? existingProduct.modelNumber,
          category: productValues.category ?? existingProduct.category,
          rfqName: productValues.rfqName ?? existingProduct.rfqName,
          recordDate: productValues.recordDate ?? existingProduct.recordDate,
          productUrl: productValues.productUrl ?? existingProduct.productUrl,
          description: productValues.description ?? existingProduct.description,
          updatedAt: new Date().toISOString(),
        };
        if (row.productCode) {
          const conflictingCode = productsByCode.get(normalizeText(productCode));
          if (conflictingCode && conflictingCode.id !== productId) merged.productCode = existingProduct.productCode;
        }
        await db.update(products).set(merged).where(eq(products.id, productId));
        const updatedProduct = { ...existingProduct, ...merged };
        productsByCode.set(normalizeText(merged.productCode), updatedProduct);
        const oldNameAndRfqKey = `${normalizeText(existingProduct.name)}|${normalizeText(existingProduct.rfqName)}`;
        const oldCandidates = productsByNameAndRfq.get(oldNameAndRfqKey)?.filter((product) => product.id !== productId) ?? [];
        productsByNameAndRfq.set(oldNameAndRfqKey, oldCandidates);
        const updatedKey = `${normalizeText(name)}|${normalizeText(merged.rfqName)}`;
        const updatedCandidates = productsByNameAndRfq.get(updatedKey) ?? [];
        updatedCandidates.push(updatedProduct);
        productsByNameAndRfq.set(updatedKey, updatedCandidates);
        updated++;
      } else {
        const [created] = await db.insert(products).values({
          ...productValues,
          name,
          productCode,
          reviewStatus: "review",
          sourceType: "imported",
        }).returning();
        productId = created.id;
        productsByCode.set(normalizeText(productCode), created);
        const key = `${normalizeText(name)}|${normalizeText(rfqName)}`;
        const candidates = productsByNameAndRfq.get(key) ?? [];
        candidates.push(created);
        productsByNameAndRfq.set(key, candidates);
        imported++;
      }

      const specifications = Object.entries(row)
        .filter(([key, value]) => key.startsWith("spec:") && value.trim())
        .map(([key, value]) => ({
          productId,
          key: key.slice(5, 125),
          value: value.slice(0, 2000),
          unit: row[`specunit:${key.slice(5)}`]?.slice(0, 50) || null,
        }))
        .filter((specification) => specification.key);
      if (specifications.length) {
        await db.delete(productSpecs).where(eq(productSpecs.productId, productId));
        await db.insert(productSpecs).values(specifications);
      }

      const customerCompany = row.customerCompany.slice(0, 500);
      const customerContact = row.customerContact.slice(0, 500);
      const supplierName = row.supplierName.slice(0, 500);
      let rfqItemId: number | null = null;
      if (rfqName || customerCompany) {
        const key = `${normalizeText(rfqName)}|${normalizeText(customerCompany)}`;
        let project = projectsByKey.get(key);
        if (!project) {
          const [createdProject] = await db.insert(projects).values({
            projectCode: `IMP-${batch.id}-${index + 1}`,
            customerName: customerCompany || null,
            customerContact: customerContact || null,
            title: rfqName || `Imported request ${index + 1}`,
            status: "researching",
          }).returning();
          project = createdProject;
          projectsByKey.set(key, project);
        } else if (customerContact && !project.customerContact) {
          await db.update(projects).set({ customerContact }).where(eq(projects.id, project.id));
          project.customerContact = customerContact;
        }

        const quantity = Math.max(1, Math.min(1000000, Math.trunc(parseNumber(row.quantity) ?? 1)));
        const sourceRow = parseNumber(row.sourceRow);
        const normalizedSourceRow = sourceRow == null ? null : Math.trunc(sourceRow);
        const itemKey = normalizedSourceRow == null
          ? `${project.id}|${productId}`
          : `${project.id}|${productId}|${normalizedSourceRow}`;
        let item = itemsByKey.get(itemKey);
        if (!item) {
          const [createdItem] = await db.insert(rfqItems).values({
            projectId: project.id,
            productId,
            requestedDescription: name,
            requestedQuantity: quantity,
            sourceRow: normalizedSourceRow,
          }).returning();
          item = createdItem;
          itemsByKey.set(itemKey, item);
        } else {
          await db.update(rfqItems).set({
            requestedDescription: name,
            requestedQuantity: quantity,
            sourceRow: normalizedSourceRow ?? item.sourceRow,
          }).where(eq(rfqItems.id, item.id));
        }
        rfqItemId = item.id;
      }

      if (supplierName) {
        const supplierKey = normalizeText(supplierName);
        let supplier = suppliersByName.get(supplierKey);
        if (!supplier) {
          const [createdSupplier] = await db.insert(suppliers).values({
            supplierCode: `IMP-${batch.id}-${index + 1}`,
            companyName: supplierName,
            verificationStatus: "review",
          }).returning();
          supplier = createdSupplier;
          suppliersByName.set(supplierKey, supplier);
        }
        const unitPrice = parseNumber(row.unitCostExVat);
        const shippingCost = parseNumber(row.shipping);
        const currency = normalizeCurrency(row.currency);
        const productSupplierOffer = offersByProductSupplier.get(`${productId}|${supplier.id}`);
        const existingOffer = (rfqItemId ? offersByItemAndSupplier.get(`${rfqItemId}|${supplier.id}`) : undefined)
          ?? (productSupplierOffer?.rfqItemId == null ? productSupplierOffer : undefined);
        const offerValues = {
          rfqItemId: rfqItemId ?? existingOffer?.rfqItemId ?? null,
          productId,
          supplierId: supplier.id,
          unitPrice: unitPrice ?? existingOffer?.unitPrice ?? null,
          currency: row.currency ? currency : existingOffer?.currency ?? "UNKNOWN",
          vatStatus: existingOffer?.vatStatus === "unknown" || !existingOffer ? "ex_vat" : existingOffer.vatStatus,
          quotationDate: normalizeDate(row.recordDate) ?? existingOffer?.quotationDate ?? null,
          shippingCost: shippingCost ?? existingOffer?.shippingCost ?? null,
          sourceUrl: row.productUrl.slice(0, 2000) || existingOffer?.sourceUrl || null,
        };
        if (existingOffer) {
          await db.update(offers).set(offerValues).where(eq(offers.id, existingOffer.id));
          const updatedOffer = { ...existingOffer, ...offerValues };
          if (rfqItemId) offersByItemAndSupplier.set(`${rfqItemId}|${supplier.id}`, updatedOffer);
          offersByProductSupplier.set(`${productId}|${supplier.id}`, updatedOffer);
        } else {
          const [createdOffer] = await db.insert(offers).values(offerValues).returning();
          if (rfqItemId) offersByItemAndSupplier.set(`${rfqItemId}|${supplier.id}`, createdOffer);
          offersByProductSupplier.set(`${productId}|${supplier.id}`, createdOffer);
        }
      }
    }

    await db.insert(auditLogs).values({ action: "import", entityType: "import_batch", entityId: batch.id, detail: `${imported} products added, ${updated} updated from ${batch.fileName}` });
    return Response.json({ batch, imported, updated, skipped: validRows.length - imported - updated }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
