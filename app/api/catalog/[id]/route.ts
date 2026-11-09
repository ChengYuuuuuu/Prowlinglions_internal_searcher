import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { products } from "../../../../db/schema";

type ProductUpdate = {
  productCode: string;
  name: string;
  manufacturer: string | null;
  modelNumber: string | null;
  category: string | null;
  rfqName: string | null;
  recordDate: string | null;
  description: string | null;
  productUrl: string | null;
  reviewStatus: string;
};

type SpecificationUpdate = { key: string; value: string; unit: string | null };

const productFields: Array<keyof ProductUpdate> = [
  "productCode",
  "name",
  "manufacturer",
  "modelNumber",
  "category",
  "rfqName",
  "recordDate",
  "description",
  "productUrl",
  "reviewStatus",
];

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return Response.json({ error: "Invalid product ID." }, { status: 400 });
    }

    const payload: unknown = await request.json();
    if (!isRecord(payload) || !isRecord(payload.product) || !Array.isArray(payload.specifications)) {
      return Response.json({ error: "Product details and specifications are required." }, { status: 400 });
    }

    const product = {} as ProductUpdate;
    for (const field of productFields) {
      const value = payload.product[field];
      if (field === "productCode" || field === "name" || field === "reviewStatus") {
        if (typeof value !== "string" || !value.trim()) {
          return Response.json({ error: `${field} is required.` }, { status: 400 });
        }
        product[field] = value.trim();
      } else {
        if (value !== null && typeof value !== "string") {
          return Response.json({ error: `${field} must be text.` }, { status: 400 });
        }
        product[field] = typeof value === "string" ? value.trim() || null : null;
      }
    }

    const limits: Record<keyof ProductUpdate, number> = {
      productCode: 255,
      name: 500,
      manufacturer: 500,
      modelNumber: 500,
      category: 250,
      rfqName: 500,
      recordDate: 100,
      description: 10000,
      productUrl: 2000,
      reviewStatus: 30,
    };
    for (const field of productFields) {
      if (typeof product[field] === "string" && product[field].length > limits[field]) {
        return Response.json({ error: `${field} is too long.` }, { status: 400 });
      }
    }
    if (!["verified", "review"].includes(product.reviewStatus)) {
      return Response.json({ error: "Review status must be verified or review." }, { status: 400 });
    }

    if (payload.specifications.length > 100) {
      return Response.json({ error: "A product can have at most 100 specifications." }, { status: 400 });
    }
    const specifications: SpecificationUpdate[] = [];
    for (const [index, specification] of payload.specifications.entries()) {
      if (!isRecord(specification) || typeof specification.key !== "string" || typeof specification.value !== "string") {
        return Response.json({ error: `Specification ${index + 1} needs a name and value.` }, { status: 400 });
      }
      const key = specification.key.trim();
      const value = specification.value.trim();
      const unit = specification.unit == null ? null : typeof specification.unit === "string" ? specification.unit.trim() || null : undefined;
      if (!key || !value || unit === undefined || key.length > 120 || value.length > 2000 || (unit?.length ?? 0) > 50) {
        return Response.json({ error: `Specification ${index + 1} has invalid or oversized fields.` }, { status: 400 });
      }
      specifications.push({ key, value, unit });
    }

    const db = getDb();
    const existing = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
    if (!existing.length) return Response.json({ error: "Product not found." }, { status: 404 });
    const duplicate = await db.select({ id: products.id }).from(products).where(eq(products.productCode, product.productCode)).limit(1);
    if (duplicate.length && duplicate[0].id !== id) {
      return Response.json({ error: "That product code is already in use." }, { status: 409 });
    }

    const database = getDatabaseBinding();
    const statements = [
      database.prepare(`
        UPDATE products
        SET product_code = ?, name = ?, manufacturer = ?, model_number = ?, category = ?,
            rfq_name = ?, record_date = ?, description = ?, product_url = ?,
            review_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        product.productCode,
        product.name,
        product.manufacturer,
        product.modelNumber,
        product.category,
        product.rfqName,
        product.recordDate,
        product.description,
        product.productUrl,
        product.reviewStatus,
        id,
      ),
      database.prepare("DELETE FROM product_specs WHERE product_id = ?").bind(id),
      ...specifications.map((specification) =>
        database.prepare("INSERT INTO product_specs (product_id, `key`, value, unit) VALUES (?, ?, ?, ?)")
          .bind(id, specification.key, specification.value, specification.unit),
      ),
      database.prepare("INSERT INTO audit_logs (action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?)")
        .bind("update", "product", id, `Updated ${product.productCode}; ${specifications.length} specifications saved.`),
    ];
    await database.batch(statements);

    return Response.json({ product, specifications });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update product." }, { status: 500 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDatabaseBinding() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}
