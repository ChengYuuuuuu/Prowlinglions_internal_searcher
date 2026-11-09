import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productCode: text("product_code").notNull().unique(),
  name: text("name").notNull(), manufacturer: text("manufacturer"),
  modelNumber: text("model_number"), category: text("category"),
  rfqName: text("rfq_name"), recordDate: text("record_date"),
  description: text("description"), productUrl: text("product_url"),
  reviewStatus: text("review_status").notNull().default("verified"),
  sourceType: text("source_type").notNull().default("internal"), ...timestamps,
});

export const productSpecs = sqliteTable("product_specs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id),
  key: text("key").notNull(), value: text("value").notNull(), unit: text("unit"),
  sourceReferenceId: integer("source_reference_id"), confidence: real("confidence"), ...timestamps,
});

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplierCode: text("supplier_code").notNull().unique(),
  companyName: text("company_name").notNull(), website: text("website"),
  email: text("email"), telephone: text("telephone"), contactPerson: text("contact_person"),
  country: text("country"), dispatchLocation: text("dispatch_location"),
  verificationStatus: text("verification_status").notNull().default("review"),
  notes: text("notes"), ...timestamps,
});

export const offers = sqliteTable("offers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rfqItemId: integer("rfq_item_id").references(() => rfqItems.id),
  productId: integer("product_id").notNull().references(() => products.id),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  unitPrice: real("unit_price"), currency: text("currency").notNull().default("GBP"),
  vatStatus: text("vat_status").notNull().default("unknown"), quotationDate: text("quotation_date"),
  stockStatus: text("stock_status"), leadTime: text("lead_time"), shippingCost: real("shipping_cost"),
  shippingTerms: text("shipping_terms"), sourceUrl: text("source_url"), ...timestamps,
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectCode: text("project_code").notNull().unique(), customerName: text("customer_name"),
  customerContact: text("customer_contact"),
  title: text("title").notNull(), status: text("status").notNull().default("researching"),
  assignedTo: text("assigned_to"), receivedAt: text("received_at"), notes: text("notes"), ...timestamps,
});

export const rfqItems = sqliteTable("rfq_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => projects.id),
  sourceRow: integer("source_row"),
  productId: integer("product_id").references(() => products.id),
  requestedDescription: text("requested_description").notNull(),
  requestedQuantity: integer("requested_quantity").notNull().default(1),
  complianceStatus: text("compliance_status").notNull().default("not_confirmed"),
  knownDeviation: text("known_deviation"), ...timestamps,
});

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }), fileName: text("file_name").notNull(),
  importedBy: text("imported_by"), rowCount: integer("row_count").notNull().default(0),
  status: text("status").notNull().default("review"), warnings: integer("warnings").notNull().default(0), ...timestamps,
});

export const sourceReferences = sqliteTable("source_references", {
  id: integer("id").primaryKey({ autoIncrement: true }), entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(), sourceType: text("source_type").notNull(),
  sourceLabel: text("source_label"), sourceUrl: text("source_url"),
  importBatchId: integer("import_batch_id").references(() => importBatches.id),
  lastVerifiedAt: text("last_verified_at"), reviewStatus: text("review_status").notNull().default("review"), ...timestamps,
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }), actorId: text("actor_id"),
  action: text("action").notNull(), entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"), detail: text("detail"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
