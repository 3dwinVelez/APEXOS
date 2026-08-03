ALTER TABLE "ServiceOrder"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "billing_status" TEXT NOT NULL DEFAULT 'UNBILLED',
  ADD COLUMN IF NOT EXISTS "billing_blocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "administratively_modified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ServicePhoto"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "administratively_added" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "added_by_correction_id" UUID,
  ADD COLUMN IF NOT EXISTS "withdrawn_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "withdrawn_by" INTEGER,
  ADD COLUMN IF NOT EXISTS "withdrawal_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "withdrawn_by_correction_id" UUID;

CREATE TABLE IF NOT EXISTS "ServiceOrderCorrection" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "order_id" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reason_code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "expected_version" INTEGER NOT NULL,
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "financial_impact" BOOLEAN NOT NULL DEFAULT false,
  "idempotency_key" TEXT,
  "requested_by" INTEGER NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_by" INTEGER,
  "applied_at" TIMESTAMP(3),
  "approved_by" INTEGER,
  "approved_at" TIMESTAMP(3),
  "rejected_by" INTEGER,
  "rejected_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOrderCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceOrderCorrection_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderCorrection_status_check" CHECK ("status" IN ('DRAFT','APPLIED','PENDING_APPROVAL','APPROVED','REJECTED','REVERTED'))
);

CREATE TABLE IF NOT EXISTS "ServiceOrderCorrectionChange" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "correction_id" UUID NOT NULL,
  "change_type" TEXT NOT NULL,
  "field_name" TEXT,
  "old_value" JSONB,
  "new_value" JSONB,
  "old_status" TEXT,
  "new_status" TEXT,
  "evidence_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOrderCorrectionChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceOrderCorrectionChange_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "ServiceOrderCorrection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderCorrectionChange_type_check" CHECK ("change_type" IN ('FIELD_UPDATED','EVIDENCE_ADDED','EVIDENCE_REMOVED','STATUS_CHANGED','ORDER_REOPENED','ORDER_FORCE_CLOSED','OBSERVATION_ADDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceOrderCorrection_tenant_order_idempotency_key"
  ON "ServiceOrderCorrection"("tenant_id", "order_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "ServiceOrderCorrection_tenant_order_created_idx"
  ON "ServiceOrderCorrection"("tenant_id", "order_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ServiceOrderCorrection_tenant_status_created_idx"
  ON "ServiceOrderCorrection"("tenant_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ServiceOrderCorrectionChange_tenant_correction_created_idx"
  ON "ServiceOrderCorrectionChange"("tenant_id", "correction_id", "created_at");
CREATE INDEX IF NOT EXISTS "ServiceOrderCorrectionChange_tenant_evidence_idx"
  ON "ServiceOrderCorrectionChange"("tenant_id", "evidence_id");
CREATE INDEX IF NOT EXISTS "ServicePhoto_tenant_order_active_idx"
  ON "ServicePhoto"("tenant_id", "order_id", "active");

DO $$ BEGIN
  ALTER TABLE "ServicePhoto" ADD CONSTRAINT "ServicePhoto_added_by_correction_id_fkey"
    FOREIGN KEY ("added_by_correction_id") REFERENCES "ServiceOrderCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ServicePhoto" ADD CONSTRAINT "ServicePhoto_withdrawn_by_correction_id_fkey"
    FOREIGN KEY ("withdrawn_by_correction_id") REFERENCES "ServiceOrderCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION apexos_reject_correction_change_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ServiceOrderCorrectionChange is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ServiceOrderCorrectionChange_immutable" ON "ServiceOrderCorrectionChange";
CREATE TRIGGER "ServiceOrderCorrectionChange_immutable"
  BEFORE UPDATE OR DELETE ON "ServiceOrderCorrectionChange"
  FOR EACH ROW EXECUTE FUNCTION apexos_reject_correction_change_mutation();
