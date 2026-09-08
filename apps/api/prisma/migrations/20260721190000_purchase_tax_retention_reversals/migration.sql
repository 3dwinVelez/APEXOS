ALTER TABLE "Movement" ADD COLUMN IF NOT EXISTS "purchase_order_line_id" INTEGER;

ALTER TABLE "cnt_cabdoc"
  ADD COLUMN IF NOT EXISTS "is_reversal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reversed_document_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "reversal_document_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancelled_by" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

ALTER TABLE "cnt_cuedoc"
  ADD COLUMN IF NOT EXISTS "tax_type" TEXT,
  ADD COLUMN IF NOT EXISTS "tax_code" TEXT,
  ADD COLUMN IF NOT EXISTS "tax_base" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "cxp_cabdoc"
  ADD COLUMN IF NOT EXISTS "retention_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "gross_total" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "cxp_cuedoc"
  ADD COLUMN IF NOT EXISTS "tax_type" TEXT,
  ADD COLUMN IF NOT EXISTS "tax_code" TEXT,
  ADD COLUMN IF NOT EXISTS "tax_base" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Movement_tenant_id_purchase_order_line_id_idx" ON "Movement"("tenant_id", "purchase_order_line_id");
CREATE INDEX IF NOT EXISTS "cnt_cabdoc_tenant_id_is_cancelled_idx" ON "cnt_cabdoc"("tenant_id", "is_cancelled");
CREATE INDEX IF NOT EXISTS "cnt_cuedoc_tenant_id_tax_type_tax_code_idx" ON "cnt_cuedoc"("tenant_id", "tax_type", "tax_code");
