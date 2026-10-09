-- AlterTable
-- Alcance geografico del tarifario: origen (departamento/ciudad/municipio) y municipio de destino.
-- NULL en cualquier campo = comodin (aplica a cualquier valor del contexto).
ALTER TABLE "TransportRateCard" ADD COLUMN "origin_department" TEXT;
ALTER TABLE "TransportRateCard" ADD COLUMN "origin_city" TEXT;
ALTER TABLE "TransportRateCard" ADD COLUMN "origin_municipality" TEXT;
ALTER TABLE "TransportRateCard" ADD COLUMN "destination_municipality" TEXT;

-- AlterTable
-- Municipio de destino del detalle de liquidacion para que el motor pueda compararlo.
ALTER TABLE "TransportSettlementItem" ADD COLUMN "destination_municipality" TEXT;
