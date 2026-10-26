-- Comercio (M-30): la tabla comercio_payments se creó sin la columna allocations que
-- declara schema.prisma (snapshot oldest-first {installment_id: monto} de cada abono).
-- Sin ella, toda lectura/escritura de abonos falla con P2022. Migración hacia adelante:
-- nunca se reescribe 20261026120000_comercio_foundation porque ya está aplicada localmente.

ALTER TABLE "comercio_payments" ADD COLUMN IF NOT EXISTS "allocations" JSONB;
