import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, importBatches, offers, products, suppliers } from "../../../db/schema";
import seedProducts from "../../../db/seed-products.json";

async function seedInitialCatalog() {
  const db = getDb();
  if ((await db.select({ id: products.id }).from(products).limit(1)).length) return;
  const batchSize = 60;
  for (let index = 0; index < seedProducts.length; index += batchSize) {
    await db.insert(products).values(seedProducts.slice(index, index + batchSize));
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
