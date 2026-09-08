CREATE TABLE "TransportGpsPosition" (
  "id" BIGSERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "trip_id" INTEGER NOT NULL,
  "stop_id" INTEGER,
  "driver_id" INTEGER,
  "device_id" TEXT NOT NULL,
  "client_event_id" TEXT NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracy_m" DOUBLE PRECISION,
  "altitude_m" DOUBLE PRECISION,
  "speed_kph" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "battery_pct" DOUBLE PRECISION,
  "is_mocked" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "TransportGpsPosition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportGpsPosition_tenant_device_event_key"
  ON "TransportGpsPosition"("tenant_id", "device_id", "client_event_id");
CREATE INDEX "TransportGpsPosition_tenant_trip_recorded_idx"
  ON "TransportGpsPosition"("tenant_id", "trip_id", "recorded_at" DESC);
CREATE INDEX "TransportGpsPosition_tenant_driver_recorded_idx"
  ON "TransportGpsPosition"("tenant_id", "driver_id", "recorded_at" DESC);
CREATE INDEX "TransportGpsPosition_tenant_recorded_idx"
  ON "TransportGpsPosition"("tenant_id", "recorded_at" DESC);

ALTER TABLE "TransportGpsPosition" ADD CONSTRAINT "TransportGpsPosition_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportGpsPosition" ADD CONSTRAINT "TransportGpsPosition_stop_id_fkey"
  FOREIGN KEY ("stop_id") REFERENCES "TransportStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportGpsPosition" ADD CONSTRAINT "TransportGpsPosition_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
