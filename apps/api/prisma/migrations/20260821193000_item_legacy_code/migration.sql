ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "legacy_code" TEXT;
CREATE INDEX IF NOT EXISTS "Item_tenant_id_legacy_code_idx" ON "Item"("tenant_id", "legacy_code");
