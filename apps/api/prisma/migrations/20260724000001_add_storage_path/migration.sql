-- Migración: Agregar storage_path a ServicePhoto
-- Fecha: 2026-07-24
-- Propósito: Almacenar ruta de Supabase Storage en vez de base64 en la BD

ALTER TABLE "ServicePhoto" ADD COLUMN IF NOT EXISTS "storage_path" TEXT;

-- Índice para búsquedas por storage_path (consultas de verificación de migración)
CREATE INDEX IF NOT EXISTS "ServicePhoto_storage_path_idx" ON "ServicePhoto"("storage_path");

-- Índice para identificar registros pendientes de migrar (base64 sin storage_path)
CREATE INDEX IF NOT EXISTS "ServicePhoto_base64_pending_migration_idx"
  ON "ServicePhoto"("id")
  WHERE "base64_data" IS NOT NULL AND "storage_path" IS NULL;
