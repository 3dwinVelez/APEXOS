-- =====================================================================================
-- TALENTO HUMANO (M-17) - Huella propia (WebAuthn) para marcar jornada desde el navegador
-- =====================================================================================
-- Respalda el modelo HrWebauthnCredential. Cada empleado registra una llave de acceso
-- ES256 (llave publica SPKI en base64) desbloqueada con la huella del celular; cada
-- marcacion web va firmada con ella (apps/api/src/modules/hr/personal-webauthn.js).
-- Baja logica con active/revoked_*. Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS "hr_webauthn_credentials" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "key_algorithm" TEXT NOT NULL DEFAULT 'WEBAUTHN_ES256',
    "sign_count" INTEGER NOT NULL DEFAULT 0,
    "rp_id" TEXT NOT NULL,
    "device_label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_by" INTEGER,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_webauthn_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hr_webauthn_credentials_tenant_id_credential_id_key" ON "hr_webauthn_credentials"("tenant_id", "credential_id");
CREATE INDEX IF NOT EXISTS "hr_webauthn_credentials_tenant_id_employee_id_active_idx" ON "hr_webauthn_credentials"("tenant_id", "employee_id", "active");
