-- =====================================================================================
-- TALENTO HUMANO (M-17) - Maestro de rostros para marcar jornada
-- =====================================================================================
-- Respalda el modelo HrFaceEnrollment.
--
-- Varios empleados marcan en el mismo celular: el lector de huella del telefono no
-- identifica a la persona, asi que cada empleado registra su rostro y cada selfie de
-- marcacion se compara con el (servidor: apps/api/src/modules/hr/face-identity.js).
--
-- Dato biometrico sensible (Ley 1581 de 2012): se guarda la version y el sha256 del
-- texto de autorizacion aceptado. Baja logica con active/revoked_*.
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS "hr_face_enrollments" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "embedding" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "reference_photo" JSONB NOT NULL,
    "consent_version" TEXT NOT NULL,
    "consent_text_sha256" TEXT NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enrolled_by" INTEGER,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by" INTEGER,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_face_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hr_face_enrollments_tenant_id_employee_id_active_idx" ON "hr_face_enrollments"("tenant_id", "employee_id", "active");
CREATE INDEX IF NOT EXISTS "hr_face_enrollments_tenant_id_active_idx" ON "hr_face_enrollments"("tenant_id", "active");
