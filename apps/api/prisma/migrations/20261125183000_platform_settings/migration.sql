-- =====================================================================================
-- PLATAFORMA - Configuracion tecnica administrable por ambiente (platform_settings)
-- =====================================================================================
-- Respalda el modelo PlatformSetting. No es dato operativo de un cliente: es una clave de
-- plataforma con su valor, y como cada despliegue tiene su propia base, el valor queda por
-- ambiente. Hoy la usa un solo consumidor: la URL de la app movil que ofrece la pantalla
-- de acceso (apps/api/src/modules/admin/platform-config-service.js). El servicio restringe
-- que claves se pueden escribir; la tabla no es un almacen generico de preferencias.
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS "platform_settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_settings_key_key" ON "platform_settings"("key");
