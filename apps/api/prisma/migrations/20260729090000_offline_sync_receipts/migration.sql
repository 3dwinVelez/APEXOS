CREATE TABLE IF NOT EXISTS "OfflineSyncReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "environment_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "installation_id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "result_status" TEXT NOT NULL,
  "result_code" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineSyncReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OfflineSyncReceipt_context_operation_key"
  ON "OfflineSyncReceipt"("environment_id", "tenant_id", "user_id", "operation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "OfflineSyncReceipt_context_idempotency_key"
  ON "OfflineSyncReceipt"("environment_id", "tenant_id", "user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "OfflineSyncReceipt_tenant_id_user_id_processed_at_idx"
  ON "OfflineSyncReceipt"("tenant_id", "user_id", "processed_at");
CREATE INDEX IF NOT EXISTS "OfflineSyncReceipt_expires_at_idx"
  ON "OfflineSyncReceipt"("expires_at");
