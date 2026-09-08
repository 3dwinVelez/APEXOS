CREATE TABLE "TransportTmsConfig" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
  "default_currency" TEXT NOT NULL DEFAULT 'COP',
  "distance_unit" TEXT NOT NULL DEFAULT 'km',
  "weight_unit" TEXT NOT NULL DEFAULT 'kg',
  "road_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
  "gps_interval_seconds" INTEGER NOT NULL DEFAULT 30,
  "gps_retention_days" INTEGER NOT NULL DEFAULT 90,
  "mobile_config" JSONB NOT NULL DEFAULT '{}',
  "notification_config" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "updated_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportTmsConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportTmsConfig_tenant_id_key" ON "TransportTmsConfig"("tenant_id");
CREATE INDEX "TransportTmsConfig_tenant_id_updated_at_idx" ON "TransportTmsConfig"("tenant_id", "updated_at");
