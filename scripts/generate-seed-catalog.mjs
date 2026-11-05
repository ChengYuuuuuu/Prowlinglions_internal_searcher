import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const source = process.argv[2];
const destination = process.argv[3] || path.resolve("db/seed-catalog.json");
if (!source) throw new Error("Pass the original source workbook path as the first argument.");

const workbook = XLSX.readFile(source, { cellDates: true });
const sheet = workbook.Sheets["Suppliers by Category"];
if (!sheet) throw new Error("The 'Suppliers by Category' worksheet was not found.");

const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
const text = (value) => String(value ?? "").trim();
const normalise = (value) => text(value).replace(/\s+/g, " ").toLowerCase();
const itemName = (value) => text(value).replace(/\s*[-–—]?\s*https?:\/\/\S+\s*$/i, "").trim();
const number = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replaceAll(",", "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const currency = (value) => {
  const raw = text(value).toUpperCase();
  if (!raw) return "UNKNOWN";
  if (raw.includes("EUR") || raw === "€") return "EUR";
  if (raw.includes("USD") || raw === "$") return "USD";
  if (raw.includes("SCR")) return "SCR";
  if (raw.includes("GBP") || raw === "£") return "GBP";
  return raw.slice(0, 3);
};

const sourceRows = rows
  .map((row, index) => ({ ...row, __sourceRow: index + 2 }))
  .filter((row) => text(row["Item Name"]));

// One product represents one item from one supplier in one original RFQ context.
// Exact same-supplier duplicates are collapsed to the most complete source row.
const productGroups = new Map();
for (const row of sourceRows) {
  const key = [row.Date, row["RFQ Name"], row["Customer Company"], itemName(row["Item Name"]), row.Supplier]
    .map(normalise)
    .join("|");
  const score = [row.Link, row.Currency, row.Quantity, row["Unit Cost (Ex VAT)"], row.Shipping]
    .filter((value) => text(value)).length;
  if (!productGroups.has(key) || score > productGroups.get(key).score) productGroups.set(key, { row, score });
}

const supplierNames = [...new Set(sourceRows.map((row) => text(row.Supplier)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b));
const supplierCodeByName = new Map(supplierNames.map((name, index) => [normalise(name), `PL-SUP-${String(index + 1).padStart(4, "0")}`]));
const suppliers = supplierNames.map((companyName) => ({
  supplierCode: supplierCodeByName.get(normalise(companyName)),
  companyName,
  verificationStatus: "review",
}));

const products = [];
const offers = [];
for (const { row: first } of productGroups.values()) {
  const productCode = `PL-ITEM-${String(first.__sourceRow).padStart(6, "0")}`;
  const flagged = Boolean(text(first["Data Quality Flags"]));
  const firstLink = text(first.Link) || null;
  products.push({
    productCode,
    name: itemName(first["Item Name"]),
    manufacturer: null,
    modelNumber: null,
    category: text(first.Category) || null,
    rfqName: text(first["RFQ Name"]) || null,
    recordDate: text(first.Date) || null,
    description: null,
    productUrl: firstLink,
    reviewStatus: flagged ? "review" : "verified",
    sourceType: "imported",
  });

  const supplierName = text(first.Supplier);
  if (supplierName) {
    offers.push({
      productCode,
      supplierCode: supplierCodeByName.get(normalise(supplierName)),
      unitPrice: number(first["Unit Cost (Ex VAT)"]),
      currency: currency(first.Currency),
      vatStatus: "excluded",
      quotationDate: text(first.Date) || null,
      shippingCost: number(first.Shipping),
      sourceUrl: text(first.Link) || null,
    });
  }
}

const catalog = { products, suppliers, offers, sourceRowCount: sourceRows.length };
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(catalog));
console.log(JSON.stringify({ sourceRows: sourceRows.length, products: products.length, suppliers: suppliers.length, offers: offers.length }));
