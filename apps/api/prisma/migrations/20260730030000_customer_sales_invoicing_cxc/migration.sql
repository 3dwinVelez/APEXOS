-- Facturacion interna a clientes y cuentas por cobrar.
-- Migracion aditiva: no elimina ni transforma datos existentes.

CREATE TABLE IF NOT EXISTS "inv_sku_valuations" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "society_code" TEXT NOT NULL,
  "item_id" INTEGER NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inventory_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "average_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "inv_sku_valuations_tenant_id_society_code_item_id_key"
  ON "inv_sku_valuations"("tenant_id", "society_code", "item_id");
CREATE INDEX IF NOT EXISTS "inv_sku_valuations_tenant_id_society_code_idx"
  ON "inv_sku_valuations"("tenant_id", "society_code");

CREATE TABLE IF NOT EXISTS "sales_invoices" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "customer_id" INTEGER NOT NULL REFERENCES "Party"("id"),
  "place_id" INTEGER REFERENCES "Place"("id"),
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_date" TIMESTAMP(3) NOT NULL,
  "due_term" TEXT NOT NULL DEFAULT 'AP30',
  "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discount_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "retention_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "header_text" TEXT NOT NULL DEFAULT '',
  "society_code" TEXT NOT NULL DEFAULT '',
  "branch_code" TEXT NOT NULL DEFAULT '',
  "cost_center_code" TEXT NOT NULL DEFAULT '',
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "cnt_cabdoc"
  ADD COLUMN IF NOT EXISTS "referenced_document_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_reversal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cancelled_by" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "sales_invoice_lines" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "invoice_id" INTEGER NOT NULL REFERENCES "sales_invoices"("id") ON DELETE CASCADE,
  "line_no" INTEGER NOT NULL,
  "item_id" INTEGER REFERENCES "Item"("id"),
  "description" TEXT NOT NULL,
  "qty" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'UND',
  "unit_price" DOUBLE PRECISION NOT NULL,
  "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL,
  "place_id" INTEGER REFERENCES "Place"("id"),
  "customer_invoice_number" TEXT,
  "cost_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "cxc_cabdoc" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "document_kind" TEXT NOT NULL,
  "document_class" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "customer_reference" TEXT NOT NULL DEFAULT '',
  "posting_date" TIMESTAMP(3) NOT NULL,
  "due_term" TEXT NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "header_text" TEXT NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "customer_tax_id" TEXT,
  "society_code" TEXT NOT NULL,
  "associated_account_id" INTEGER NOT NULL,
  "associated_account_code" TEXT NOT NULL,
  "sales_invoice_id" INTEGER UNIQUE REFERENCES "sales_invoices"("id"),
  "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "retention_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "applied_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "accounting_document_id" INTEGER,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "cxc_cuedoc" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "cabdoc_id" INTEGER NOT NULL REFERENCES "cxc_cabdoc"("id") ON DELETE CASCADE,
  "line_no" INTEGER NOT NULL,
  "account_id" INTEGER NOT NULL,
  "account_code" TEXT NOT NULL,
  "branch_code" TEXT NOT NULL,
  "cost_center_code" TEXT NOT NULL,
  "movement" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "retention_code" TEXT,
  "retention_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "retention_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "cxc_payments" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "cabdoc_id" INTEGER REFERENCES "cxc_cabdoc"("id"),
  "customer_id" INTEGER,
  "type" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT,
  "account_id" INTEGER,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "retention_masters" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "account_code" TEXT NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL,
  "concept" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "document_kind" TEXT NOT NULL DEFAULT 'invoice';
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "document_class" TEXT NOT NULL DEFAULT 'FV';
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "source_order_id" INTEGER;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "referenced_invoice_id" INTEGER;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "accounting_document_id" INTEGER;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "import_batch_id" TEXT;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "retentions" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "is_reversal" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "is_cancelled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "posted_by" INTEGER;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "posted_at" TIMESTAMP(3);
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "cancelled_by" INTEGER;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

ALTER TABLE "sales_invoice_lines" ADD COLUMN IF NOT EXISTS "movement_id" INTEGER;
ALTER TABLE "sales_invoice_lines" ADD COLUMN IF NOT EXISTS "source_order_line_id" INTEGER;

ALTER TABLE "cxc_cabdoc" ADD COLUMN IF NOT EXISTS "referenced_document_id" INTEGER;
ALTER TABLE "cxc_cabdoc" ADD COLUMN IF NOT EXISTS "is_reversal" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "cxc_cabdoc" ADD COLUMN IF NOT EXISTS "is_cancelled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "cxc_cabdoc" ADD COLUMN IF NOT EXISTS "cancelled_by" INTEGER;
ALTER TABLE "cxc_cabdoc" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

ALTER TABLE "cxc_cuedoc" ADD COLUMN IF NOT EXISTS "tax_type" TEXT;
ALTER TABLE "cxc_cuedoc" ADD COLUMN IF NOT EXISTS "tax_code" TEXT;
ALTER TABLE "cxc_cuedoc" ADD COLUMN IF NOT EXISTS "tax_base" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "cxc_cuedoc" ADD COLUMN IF NOT EXISTS "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "cxc_cuedoc" ADD COLUMN IF NOT EXISTS "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "cxc_payments" ADD COLUMN IF NOT EXISTS "group_id" TEXT;
ALTER TABLE "cxc_payments" ADD COLUMN IF NOT EXISTS "accounting_document_id" INTEGER;
ALTER TABLE "cxc_payments" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE "cxc_payments" ADD COLUMN IF NOT EXISTS "reversed_payment_id" INTEGER;
ALTER TABLE "cxc_payments" ADD COLUMN IF NOT EXISTS "cancelled_by" INTEGER;
ALTER TABLE "cxc_payments" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

ALTER TABLE "retention_masters" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'sales';
ALTER TABLE "retention_masters" ADD COLUMN IF NOT EXISTS "retention_type" TEXT NOT NULL DEFAULT 'retefuente';
ALTER TABLE "retention_masters" ADD COLUMN IF NOT EXISTS "minimum_base" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "retention_masters" ADD COLUMN IF NOT EXISTS "base_type" TEXT NOT NULL DEFAULT 'subtotal';

CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoices_tenant_id_number_key" ON "sales_invoices"("tenant_id", "number");
CREATE INDEX IF NOT EXISTS "sales_invoices_tenant_customer_idx" ON "sales_invoices"("tenant_id", "customer_id");
CREATE INDEX IF NOT EXISTS "sales_invoices_tenant_status_idx" ON "sales_invoices"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "sales_invoices_source_order_idx" ON "sales_invoices"("tenant_id", "source_order_id");
CREATE INDEX IF NOT EXISTS "sales_invoice_lines_invoice_idx" ON "sales_invoice_lines"("tenant_id", "invoice_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cxc_cabdoc_tenant_id_number_key" ON "cxc_cabdoc"("tenant_id", "number");
CREATE INDEX IF NOT EXISTS "cxc_cabdoc_customer_balance_idx" ON "cxc_cabdoc"("tenant_id", "customer_id", "balance");
CREATE INDEX IF NOT EXISTS "cxc_cabdoc_due_date_idx" ON "cxc_cabdoc"("tenant_id", "due_date");
CREATE INDEX IF NOT EXISTS "cxc_cuedoc_cabdoc_idx" ON "cxc_cuedoc"("tenant_id", "cabdoc_id");
CREATE INDEX IF NOT EXISTS "cxc_payments_group_idx" ON "cxc_payments"("tenant_id", "group_id");
CREATE INDEX IF NOT EXISTS "cxc_payments_customer_date_idx" ON "cxc_payments"("tenant_id", "customer_id", "date");

DROP INDEX IF EXISTS "retention_masters_tenant_id_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "retention_masters_tenant_scope_code_key" ON "retention_masters"("tenant_id", "scope", "code");
