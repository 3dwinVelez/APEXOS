CREATE TABLE "treasury_banks" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "account_id" INTEGER NOT NULL,
  "account_code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "treasury_banks_tenant_id_code_key" ON "treasury_banks"("tenant_id", "code");
CREATE INDEX "treasury_banks_tenant_id_active_name_idx" ON "treasury_banks"("tenant_id", "active", "name");

CREATE TABLE "treasury_payments" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "document_number" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "posting_date" TIMESTAMP(3) NOT NULL,
  "party_id" INTEGER NOT NULL,
  "party_tax_id" TEXT,
  "bank_id" INTEGER NOT NULL,
  "society_code" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "accounting_document_id" INTEGER NOT NULL,
  "reversal_accounting_document_id" INTEGER,
  "cancelled_by" INTEGER,
  "cancelled_at" TIMESTAMP(3),
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "treasury_payments_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "treasury_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "treasury_payments_tenant_id_document_type_document_number_key" ON "treasury_payments"("tenant_id", "document_type", "document_number");
CREATE UNIQUE INDEX "treasury_payments_tenant_id_number_key" ON "treasury_payments"("tenant_id", "number");
CREATE INDEX "treasury_payments_tenant_id_direction_posting_date_idx" ON "treasury_payments"("tenant_id", "direction", "posting_date");
CREATE INDEX "treasury_payments_tenant_id_party_id_posting_date_idx" ON "treasury_payments"("tenant_id", "party_id", "posting_date");
CREATE INDEX "treasury_payments_tenant_id_bank_id_posting_date_idx" ON "treasury_payments"("tenant_id", "bank_id", "posting_date");
CREATE INDEX "treasury_payments_tenant_id_status_idx" ON "treasury_payments"("tenant_id", "status");

CREATE TABLE "treasury_payment_applications" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "payment_id" INTEGER NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" INTEGER NOT NULL,
  "source_number" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "balance_before" DOUBLE PRECISION NOT NULL,
  "balance_after" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "treasury_payment_applications_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "treasury_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "treasury_payment_applications_tenant_payment_source_key" ON "treasury_payment_applications"("tenant_id", "payment_id", "source_type", "source_id");
CREATE INDEX "treasury_payment_applications_tenant_source_idx" ON "treasury_payment_applications"("tenant_id", "source_type", "source_id");
