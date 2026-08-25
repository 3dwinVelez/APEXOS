CREATE TABLE IF NOT EXISTS "inv_adjustments" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "society_code" TEXT NOT NULL,
  "warehouse_id" INTEGER NOT NULL,
  "posting_date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "accounting_document_id" INTEGER,
  "idempotency_key" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "inv_adjustment_lines" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "adjustment_id" INTEGER NOT NULL REFERENCES "inv_adjustments"("id") ON DELETE CASCADE,
  "item_id" INTEGER NOT NULL REFERENCES "Item"("id"),
  "qty" DOUBLE PRECISION NOT NULL,
  "unit_cost" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "inv_adjustments_tenant_id_number_key" ON "inv_adjustments"("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "inv_adjustments_tenant_id_idempotency_key_key" ON "inv_adjustments"("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "inv_adjustments_tenant_id_posting_date_document_type_idx" ON "inv_adjustments"("tenant_id", "posting_date", "document_type");
CREATE INDEX IF NOT EXISTS "inv_adjustments_tenant_id_warehouse_id_idx" ON "inv_adjustments"("tenant_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "inv_adjustment_lines_tenant_id_adjustment_id_idx" ON "inv_adjustment_lines"("tenant_id", "adjustment_id");
CREATE INDEX IF NOT EXISTS "inv_adjustment_lines_tenant_id_item_id_idx" ON "inv_adjustment_lines"("tenant_id", "item_id");
