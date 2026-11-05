import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const source = process.argv[2];
const destination = process.argv[3] || path.resolve("db/seed-products.json");

if (!source) throw new Error("Pass the source workbook path as the first argument.");

const workbook = XLSX.readFile(source, { cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });

const products = rows
  .map((row) => ({
    productCode: String(row.productCode || "").trim(),
    name: String(row.name || "").trim(),
    manufacturer: String(row.manufacturer || "").trim() || null,
    modelNumber: String(row.modelNumber || "").trim() || null,
    category: String(row.category || "").trim() || null,
    rfqName: String(row.rfqName || "").trim() || null,
    recordDate: String(row.date || "").trim() || null,
    description: String(row.description || "").trim() || null,
    productUrl: String(row.url || "").trim() || null,
    reviewStatus: "review",
    sourceType: "imported",
  }))
  .filter((row) => row.productCode && row.name);

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(products));
console.log(`Wrote ${products.length} products to ${destination}`);
