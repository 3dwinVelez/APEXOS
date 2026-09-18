CREATE TABLE "TransportOrigin" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "department" TEXT,
  "country" TEXT NOT NULL DEFAULT 'CO',
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
  "operation_start" TEXT,
  "operation_end" TEXT,
  "service_minutes" INTEGER NOT NULL DEFAULT 60,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportOrigin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportRateCard" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'borrador',
  "carrier_id" INTEGER,
  "origin_id" INTEGER,
  "destination_city" TEXT,
  "destination_department" TEXT,
  "service_level" TEXT,
  "vehicle_type" TEXT,
  "valid_from" TIMESTAMP(3) NOT NULL,
  "valid_to" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'COP',
  "base_rate" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "minimum_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "price_per_km" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "price_per_kg" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "price_per_m3" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "price_per_stop" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "fuel_surcharge_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "tolls_flat" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportRateCard_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TransportNeed" ADD COLUMN "origin_id" INTEGER;
ALTER TABLE "TransportTrip" ADD COLUMN "origin_id" INTEGER;
ALTER TABLE "TransportTrip" ADD COLUMN "planned_distance_km" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "TransportTrip" ADD COLUMN "planned_duration_minutes" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "TransportOrigin_tenant_id_code_key" ON "TransportOrigin"("tenant_id", "code");
CREATE INDEX "TransportOrigin_tenant_id_city_active_idx" ON "TransportOrigin"("tenant_id", "city", "active");
CREATE UNIQUE INDEX "TransportRateCard_tenant_id_code_version_key" ON "TransportRateCard"("tenant_id", "code", "version");
CREATE INDEX "TransportRateCard_tenant_status_valid_idx" ON "TransportRateCard"("tenant_id", "status", "valid_from", "valid_to");
CREATE INDEX "TransportRateCard_tenant_carrier_active_idx" ON "TransportRateCard"("tenant_id", "carrier_id", "active");
CREATE INDEX "TransportRateCard_tenant_origin_destination_idx" ON "TransportRateCard"("tenant_id", "origin_id", "destination_city");
CREATE INDEX "TransportNeed_tenant_id_origin_id_status_idx" ON "TransportNeed"("tenant_id", "origin_id", "status");
CREATE INDEX "TransportTrip_tenant_id_origin_id_status_idx" ON "TransportTrip"("tenant_id", "origin_id", "status");

ALTER TABLE "TransportRateCard" ADD CONSTRAINT "TransportRateCard_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "TransportCarrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportRateCard" ADD CONSTRAINT "TransportRateCard_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "TransportOrigin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportNeed" ADD CONSTRAINT "TransportNeed_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "TransportOrigin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "TransportOrigin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
