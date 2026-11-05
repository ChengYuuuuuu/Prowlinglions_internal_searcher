# Prowling Lions Procurement Intelligence — Step 1

## MVP boundary

Step 1 is a search-first internal knowledge base. It stores products, structured specifications, suppliers, historical offers, RFQs, source references, imports and audit events. It deliberately excludes semantic search, external supplier discovery, automated email and generated compliance conclusions.

## Architecture

- Vinext / Next.js-compatible React + TypeScript UI
- Cloudflare Worker server routes
- Sites-owned private authentication
- D1 relational database through Drizzle ORM
- Source files remain separate from product, supplier and offer entities
- Browser import parsing with server-side validation and review status

The schema is intentionally portable to PostgreSQL/Supabase. D1 is used for the hosted MVP to avoid duplicate authentication and infrastructure.

## Core relationships

- Product 1—N ProductSpec
- Product 1—N Offer N—1 Supplier
- Project 1—N RFQItem N—0..1 Product
- ImportBatch 1—N SourceReference
- Every mutable entity can be represented in AuditLog

Historical offers are appended, never overwritten. Unknown values remain null and records receive a review status.

## Pages and journeys

1. Smart Search — universal exact/keyword search with evidence state.
2. Product Library — product records and product detail tabs.
3. Suppliers — supplier identity, dispatch and verification details.
4. Projects & RFQs — customer requirements and product associations.
5. Data Import — paste/CSV validation, duplicate handling and human review.
6. Overview / Analytics — bounded operational summaries, not AI claims.

Primary journey: search → inspect product → inspect historical supplier offer → verify source.

Import journey: upload/paste → map fields → validate → flag ambiguity → approve → append records.

## Milestones and acceptance tests

### M1 — Data foundation
- Schema migration applies successfully.
- Products, suppliers and historical offers remain separate.
- Demonstration records are labelled DEMO.

### M2 — Search and inspection
- Search matches names, models, brands, categories and descriptions.
- Category filtering works.
- Product drawer exposes evidence/review state.

### M3 — Import and audit
- CSV/TSV paste accepts mapped headers.
- Missing names are rejected; duplicate product codes are skipped.
- Imported records are marked for review.
- An import batch and audit event are recorded.

### M4 — Deployment
- Production build succeeds.
- Private Site requires platform authentication.
- D1 migrations are applied before the Worker becomes live.

## Next stage, not implemented

Hybrid semantic search, unit normalisation, PDF extraction, URL ingestion, alternatives, deterministic compliance rules and external supplier discovery belong to Step 2/3.
