-- Reemplaza el índice que incluía el blob Base64 y podía superar el límite
-- de 8 KB por entrada de índice en PostgreSQL.
DROP INDEX IF EXISTS "ServicePhoto_base64_pending_migration_idx";

CREATE INDEX IF NOT EXISTS "ServicePhoto_base64_pending_migration_idx"
  ON "ServicePhoto"("id")
  WHERE "base64_data" IS NOT NULL AND "storage_path" IS NULL;
