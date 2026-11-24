-- =====================================================================================
-- TALENTO HUMANO (M-17) - Maestro de celulares compartidos para marcar jornada
-- =====================================================================================
-- Respalda el modelo HrSharedDevice.
--
-- Un camion tiene un celular que usan dos empleados. El celular se registra con una
-- llave WebAuthn (ES256, llave publica SPKI en base64): la firma de cada marcacion
-- prueba el celular autorizado y la selfie prueba la persona. La tripulacion que puede
-- marcar sale de las mallas del dia con la misma placa (no se guarda aqui).
--
-- Baja logica con active/revoked_*: un celular revocado conserva su historial.
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS "hr_shared_devices" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "key_algorithm" TEXT NOT NULL DEFAULT 'WEBAUTHN_ES256',
    "sign_count" INTEGER NOT NULL DEFAULT 0,
    "rp_id" TEXT NOT NULL,
    "vehicle_plate" TEXT NOT NULL,
    "label" TEXT,
    "device_model" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enrolled_by" INTEGER,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by" INTEGER,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_shared_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hr_shared_devices_tenant_id_device_id_key" ON "hr_shared_devices"("tenant_id", "device_id");
CREATE UNIQUE INDEX IF NOT EXISTS "hr_shared_devices_tenant_id_credential_id_key" ON "hr_shared_devices"("tenant_id", "credential_id");
CREATE INDEX IF NOT EXISTS "hr_shared_devices_tenant_id_vehicle_plate_active_idx" ON "hr_shared_devices"("tenant_id", "vehicle_plate", "active");
