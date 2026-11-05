import { asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { auditLogs, importBatches, offers, products, suppliers } from "../../../db/schema";
import seedCatalog from "../../../db/seed-catalog.json";

async function seedInitialCatalog() {
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM products) AS product_count,
      (SELECT COUNT(*) FROM suppliers) AS supplier_count,
      (SELECT COUNT(*) FROM offers) AS offer_count
  `).first<{ product_count: number; supplier_count: number; offer_count: number }>();
  if (counts?.product_count === seedCatalog.products.length && counts?.supplier_count === seedCatalog.suppliers.length && counts?.offer_count === seedCatalog.offers.length) return;

  await env.DB.batch([
    env.DB.prepare("DELETE FROM offers"),
    env.DB.prepare("DELETE FROM suppliers"),
    env.DB.prepare("DELETE FROM products"),
  ]);

  const productIds = new Map(seedCatalog.products.map((product, index) => [product.productCode, index + 1]));
  const supplierIds = new Map(seedCatalog.suppliers.map((supplier, index) => [supplier.supplierCode, index + 1]));
  const statements: D1PreparedStatement[] = [];
  seedCatalog.products.forEach((product, index) => statements.push(env.DB.prepare(`
    INSERT INTO products (id, product_code, name, manufacturer, model_number, category, rfq_name, record_date, description, product_url, review_status, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(index + 1, product.productCode, product.name, product.manufacturer, product.modelNumber, product.category, product.rfqName, product.recordDate, null, product.productUrl, product.reviewStatus, product.sourceType)));
  seedCatalog.suppliers.forEach((supplier, index) => statements.push(env.DB.prepare(`
    INSERT INTO suppliers (id, supplier_code, company_name, verification_status)
    VALUES (?, ?, ?, ?)
  `).bind(index + 1, supplier.supplierCode, supplier.companyName, supplier.verificationStatus)));
  seedCatalog.offers.forEach((offer, index) => statements.push(env.DB.prepare(`
    INSERT INTO offers (id, product_id, supplier_id, unit_price, currency, vat_status, quotation_date, shipping_cost, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(index + 1, productIds.get(offer.productCode), supplierIds.get(offer.supplierCode), offer.unitPrice, offer.currency, offer.vatStatus, offer.quotationDate, offer.shippingCost, offer.sourceUrl)));

  const batchSize = 100;
  for (let index = 0; index < statements.length; index += batchSize) {
    await env.DB.batch(statements.slice(index, index + batchSize));
  }
}

export async function GET() {
  try {
    await seedInitialCatalog();
    const db = getDb();
    return Response.json({
      products: await db.select().from(products).orderBy(asc(products.name)),
      suppliers: await db.select().from(suppliers).orderBy(asc(suppliers.companyName)),
      offers: await db.select().from(offers),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load catalog" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "The public catalogue is read-only." }, { status: 403 });
    }
    const payload = await request.json() as { fileName?: string; rows?: Array<Record<string, string>> };
    const rows = payload.rows ?? [];
    if (!rows.length) return Response.json({ error: "No rows supplied" }, { status: 400 });
    const db = getDb();
    const [batch] = await db.insert(importBatches).values({ fileName: payload.fileName || "pasted-data.csv", rowCount: rows.length, status: "review", warnings: rows.filter((row) => !row.name || !row.modelNumber).length }).returning();
    let imported = 0;
    for (const [index, row] of rows.entries()) {
      const name = (row.name || row.product || row["Product Name"] || "").trim();
      if (!name) continue;
      const productCode = (row.productCode || row.id || `IMP-${batch.id}-${index + 1}`).trim();
      if ((await db.select({ id: products.id }).from(products).where(eq(products.productCode, productCode)).limit(1)).length) continue;
      await db.insert(products).values({
        productCode,
        name,
        manufacturer: row.manufacturer || row.brand || null,
        modelNumber: row.modelNumber || row.model || null,
        category: row.category || "Uncategorised",
        rfqName: row.rfqName || row["RFQ name"] || row.rfq || null,
        recordDate: row.date || row.recordDate || null,
        description: row.description || null,
        productUrl: row.url || row.productUrl || null,
        reviewStatus: "review",
        sourceType: "imported",
      });
      imported++;
    }
    await db.insert(auditLogs).values({ action: "import", entityType: "import_batch", entityId: batch.id, detail: `${imported} products imported from ${batch.fileName}` });
    return Response.json({ batch, imported, skipped: rows.length - imported }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
