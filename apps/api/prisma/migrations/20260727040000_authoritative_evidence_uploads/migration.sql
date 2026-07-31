CREATE TABLE IF NOT EXISTS "evidence_upload_authorizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT,
  "order_key" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "supabase_user_id" TEXT,
  "purpose" TEXT NOT NULL,
  "expected_mime_type" TEXT NOT NULL,
  "expected_size_bytes" INTEGER NOT NULL,
  "client_upload_id" TEXT NOT NULL,
  "quarantine_path" TEXT NOT NULL,
  "final_path" TEXT,
  "status" TEXT NOT NULL DEFAULT 'authorized',
  "rejection_reason" TEXT,
  "detected_mime_type" TEXT,
  "detected_size_bytes" INTEGER,
  "detected_width" INTEGER,
  "detected_height" INTEGER,
  "checksum_sha256" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evidence_upload_authorizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evidence_upload_authorizations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "evidence_upload_authorizations_status_check"
    CHECK ("status" IN ('authorized', 'uploaded', 'validated', 'rejected', 'expired', 'cleaned'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "evidence_upload_authorizations_quarantine_path_key"
  ON "evidence_upload_authorizations"("quarantine_path");
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_upload_authorizations_tenant_user_client_key"
  ON "evidence_upload_authorizations"("tenant_id", "user_id", "client_upload_id");
CREATE INDEX IF NOT EXISTS "evidence_upload_authorizations_tenant_order_status_idx"
  ON "evidence_upload_authorizations"("tenant_id", "order_key", "status");
CREATE INDEX IF NOT EXISTS "evidence_upload_authorizations_status_expires_idx"
  ON "evidence_upload_authorizations"("status", "expires_at");
