ALTER TABLE "treasury_banks" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "treasury_advances" (
  "id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "direction" TEXT NOT NULL,
  "document_type" TEXT NOT NULL, "document_number" INTEGER NOT NULL, "number" TEXT NOT NULL,
  "posting_date" TIMESTAMP(3) NOT NULL, "party_id" INTEGER NOT NULL, "party_tax_id" TEXT,
  "bank_id" INTEGER NOT NULL, "society_code" TEXT NOT NULL, "account_id" INTEGER NOT NULL,
  "account_code" TEXT NOT NULL, "original_amount" DOUBLE PRECISION NOT NULL,
  "applied_amount" DOUBLE PRECISION NOT NULL DEFAULT 0, "balance" DOUBLE PRECISION NOT NULL,
  "reference" TEXT, "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'open',
  "accounting_document_id" INTEGER NOT NULL, "reversal_accounting_document_id" INTEGER,
  "cancelled_by" INTEGER, "cancelled_at" TIMESTAMP(3), "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "treasury_advances_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "treasury_banks"("id")
);
CREATE UNIQUE INDEX "treasury_advances_tenant_id_document_type_document_number_key" ON "treasury_advances"("tenant_id", "document_type", "document_number");
CREATE UNIQUE INDEX "treasury_advances_tenant_id_number_key" ON "treasury_advances"("tenant_id", "number");
CREATE INDEX "treasury_advances_tenant_id_direction_party_id_status_idx" ON "treasury_advances"("tenant_id", "direction", "party_id", "status");

CREATE TABLE "treasury_advance_applications" (
  "id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "advance_id" INTEGER NOT NULL,
  "source_type" TEXT NOT NULL, "source_id" INTEGER NOT NULL, "source_number" TEXT NOT NULL,
  "document_type" TEXT NOT NULL, "document_number" INTEGER NOT NULL, "number" TEXT NOT NULL,
  "posting_date" TIMESTAMP(3) NOT NULL, "amount" DOUBLE PRECISION NOT NULL,
  "advance_balance_before" DOUBLE PRECISION NOT NULL, "advance_balance_after" DOUBLE PRECISION NOT NULL,
  "source_balance_before" DOUBLE PRECISION NOT NULL, "source_balance_after" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted', "accounting_document_id" INTEGER NOT NULL,
  "reversal_document_id" INTEGER, "cancelled_by" INTEGER, "cancelled_at" TIMESTAMP(3),
  "created_by" INTEGER, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "treasury_advance_applications_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "treasury_advances"("id")
);
CREATE UNIQUE INDEX "treasury_advance_applications_tenant_id_number_key" ON "treasury_advance_applications"("tenant_id", "number");
CREATE INDEX "treasury_advance_applications_tenant_id_advance_id_status_idx" ON "treasury_advance_applications"("tenant_id", "advance_id", "status");

CREATE TABLE "pur_imports" (
  "id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "purchase_order_id" INTEGER NOT NULL,
  "number" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft', "allocation_method" TEXT NOT NULL DEFAULT 'value',
  "estimated_total" DOUBLE PRECISION NOT NULL DEFAULT 0, "actual_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costs_confirmed_at" TIMESTAMP(3), "costs_confirmed_by" INTEGER, "received_at" TIMESTAMP(3),
  "created_by" INTEGER, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "pur_imports_tenant_id_purchase_order_id_key" ON "pur_imports"("tenant_id", "purchase_order_id");
CREATE UNIQUE INDEX "pur_imports_tenant_id_number_key" ON "pur_imports"("tenant_id", "number");

CREATE TABLE "pur_import_costs" (
  "id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "import_id" INTEGER NOT NULL,
  "concept" TEXT NOT NULL, "supplier_id" INTEGER NOT NULL, "classification" TEXT NOT NULL,
  "estimated_amount" DOUBLE PRECISION NOT NULL, "actual_amount" DOUBLE PRECISION,
  "account_code" TEXT NOT NULL, "clearing_account_code" TEXT NOT NULL, "cxp_cabdoc_id" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'estimated', "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pur_import_costs_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "pur_imports"("id") ON DELETE CASCADE
);
CREATE INDEX "pur_import_costs_tenant_id_import_id_supplier_id_idx" ON "pur_import_costs"("tenant_id", "import_id", "supplier_id");
