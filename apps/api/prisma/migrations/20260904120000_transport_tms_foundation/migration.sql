CREATE TABLE "TransportCarrier" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "code" TEXT NOT NULL, "legal_name" TEXT NOT NULL,
  "trade_name" TEXT, "tax_id" TEXT, "supplier_id" INTEGER, "phone" TEXT, "email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'activo', "service_levels" JSONB NOT NULL DEFAULT '[]',
  "operating_zones" JSONB NOT NULL DEFAULT '[]', "vehicle_types" JSONB NOT NULL DEFAULT '[]',
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0, "metadata" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "TransportCarrier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportDriver" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "code" TEXT NOT NULL, "document" TEXT NOT NULL,
  "name" TEXT NOT NULL, "phone" TEXT, "employee_id" INTEGER, "carrier_id" INTEGER,
  "license_number" TEXT, "license_category" TEXT, "license_expires_at" TIMESTAMP(3),
  "certifications" JSONB NOT NULL DEFAULT '[]', "status" TEXT NOT NULL DEFAULT 'disponible',
  "metadata" JSONB NOT NULL DEFAULT '{}', "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportDriver_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportDeliveryPoint" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "customer_party_id" INTEGER, "commercial_customer_id" INTEGER, "address" TEXT NOT NULL, "city" TEXT NOT NULL,
  "department" TEXT, "country" TEXT NOT NULL DEFAULT 'CO', "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION, "timezone" TEXT NOT NULL DEFAULT 'America/Bogota', "window_start" TEXT,
  "window_end" TEXT, "receiving_days" JSONB NOT NULL DEFAULT '[]', "service_minutes" INTEGER NOT NULL DEFAULT 30,
  "access_restrictions" TEXT, "appointment_required" BOOLEAN NOT NULL DEFAULT false,
  "geofence_radius_m" INTEGER NOT NULL DEFAULT 150, "instructions" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "TransportDeliveryPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportNeed" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "code" TEXT NOT NULL, "source_type" TEXT NOT NULL,
  "source_id" TEXT, "source_reference" TEXT, "sales_order_id" INTEGER, "origin_place_id" INTEGER,
  "origin_name" TEXT NOT NULL, "delivery_point_id" INTEGER NOT NULL, "available_at" TIMESTAMP(3) NOT NULL,
  "due_at" TIMESTAMP(3) NOT NULL, "priority" TEXT NOT NULL DEFAULT 'normal',
  "service_level" TEXT NOT NULL DEFAULT 'normal', "weight_kg" DOUBLE PRECISION NOT NULL,
  "volume_m3" DOUBLE PRECISION NOT NULL, "pallets" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "packages" INTEGER NOT NULL DEFAULT 0, "temperature_min_c" DOUBLE PRECISION,
  "temperature_max_c" DOUBLE PRECISION, "required_vehicle_type" TEXT,
  "cargo_value" DECIMAL(18,2) NOT NULL DEFAULT 0, "customer_freight" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'COP', "status" TEXT NOT NULL DEFAULT 'pendiente',
  "validation_errors" JSONB NOT NULL DEFAULT '[]', "metadata" JSONB NOT NULL DEFAULT '{}', "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportNeed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportNeedLine" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "need_id" INTEGER NOT NULL, "item_id" INTEGER,
  "sku" TEXT NOT NULL, "description" TEXT, "quantity" DECIMAL(18,4) NOT NULL, "unit" TEXT NOT NULL,
  "weight_kg" DOUBLE PRECISION NOT NULL DEFAULT 0, "volume_m3" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pallets" DOUBLE PRECISION NOT NULL DEFAULT 0, "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "TransportNeedLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportTrip" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'borrador', "origin_place_id" INTEGER, "origin_name" TEXT NOT NULL,
  "carrier_id" INTEGER, "vehicle_id" INTEGER, "vehicle_plate" TEXT, "driver_id" INTEGER,
  "planned_departure" TIMESTAMP(3), "actual_departure" TIMESTAMP(3), "planned_arrival" TIMESTAMP(3),
  "actual_arrival" TIMESTAMP(3), "total_weight_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_volume_m3" DOUBLE PRECISION NOT NULL DEFAULT 0, "total_pallets" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimated_cost" DECIMAL(18,2) NOT NULL DEFAULT 0, "committed_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "actual_cost" DECIMAL(18,2) NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'COP',
  "service_level" TEXT NOT NULL DEFAULT 'normal', "version" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB NOT NULL DEFAULT '{}', "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportTrip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportTripNeed" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "trip_id" INTEGER NOT NULL, "need_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TransportTripNeed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportStop" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "trip_id" INTEGER NOT NULL, "need_id" INTEGER,
  "delivery_point_id" INTEGER, "sequence" INTEGER NOT NULL, "stop_type" TEXT NOT NULL DEFAULT 'entrega',
  "status" TEXT NOT NULL DEFAULT 'pendiente', "planned_arrival" TIMESTAMP(3), "actual_arrival" TIMESTAMP(3),
  "service_started_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3), "address_snapshot" TEXT,
  "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION, "instructions" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}', CONSTRAINT "TransportStop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportTripEvent" (
  "id" BIGSERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "trip_id" INTEGER NOT NULL, "stop_id" INTEGER,
  "event_type" TEXT NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'usuario', "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION,
  "actor_id" INTEGER, "device_id" TEXT, "observation" TEXT, "data" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TransportTripEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportDeliveryAttempt" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "trip_id" INTEGER NOT NULL, "stop_id" INTEGER NOT NULL,
  "need_id" INTEGER, "attempt_number" INTEGER NOT NULL, "result" TEXT NOT NULL, "cause_code" TEXT,
  "responsible" TEXT, "evidence" JSONB NOT NULL DEFAULT '[]', "delivered_lines" JSONB NOT NULL DEFAULT '[]',
  "additional_cost" DECIMAL(18,2) NOT NULL DEFAULT 0, "recoverable" BOOLEAN NOT NULL DEFAULT false,
  "next_attempt_at" TIMESTAMP(3), "approved_by" INTEGER, "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observations" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransportDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportPod" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "attempt_id" INTEGER NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL, "receiver_name" TEXT NOT NULL, "receiver_document" TEXT,
  "signature" TEXT, "photos" JSONB NOT NULL DEFAULT '[]', "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION, "observations" TEXT, "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TransportPod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportSettlement" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "code" TEXT NOT NULL, "trip_id" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'borrador', "estimated_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "committed_cost" DECIMAL(18,2) NOT NULL DEFAULT 0, "liquidated_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'COP', "approved_by" INTEGER, "approved_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}', "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransportSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportSettlementLine" (
  "id" SERIAL NOT NULL, "tenant_id" TEXT NOT NULL, "settlement_id" INTEGER NOT NULL, "concept" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1, "unit_rate" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL DEFAULT 0, "source" TEXT, "support" JSONB NOT NULL DEFAULT '{}',
  "recoverable" BOOLEAN NOT NULL DEFAULT false, "approved_by" INTEGER, "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TransportSettlementLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportCarrier_tenant_id_code_key" ON "TransportCarrier"("tenant_id", "code");
CREATE INDEX "TransportCarrier_tenant_id_status_active_idx" ON "TransportCarrier"("tenant_id", "status", "active");
CREATE INDEX "TransportCarrier_tenant_id_tax_id_idx" ON "TransportCarrier"("tenant_id", "tax_id");
CREATE UNIQUE INDEX "TransportDriver_tenant_id_code_key" ON "TransportDriver"("tenant_id", "code");
CREATE UNIQUE INDEX "TransportDriver_tenant_id_document_key" ON "TransportDriver"("tenant_id", "document");
CREATE INDEX "TransportDriver_tenant_id_carrier_id_status_idx" ON "TransportDriver"("tenant_id", "carrier_id", "status");
CREATE INDEX "TransportDriver_tenant_id_employee_id_idx" ON "TransportDriver"("tenant_id", "employee_id");
CREATE UNIQUE INDEX "TransportDeliveryPoint_tenant_id_code_key" ON "TransportDeliveryPoint"("tenant_id", "code");
CREATE INDEX "TransportDeliveryPoint_tenant_id_customer_party_id_active_idx" ON "TransportDeliveryPoint"("tenant_id", "customer_party_id", "active");
CREATE INDEX "TransportDeliveryPoint_commercial_customer_active_idx" ON "TransportDeliveryPoint"("tenant_id", "commercial_customer_id", "active");
CREATE INDEX "TransportDeliveryPoint_tenant_id_city_active_idx" ON "TransportDeliveryPoint"("tenant_id", "city", "active");
CREATE UNIQUE INDEX "TransportNeed_tenant_id_code_key" ON "TransportNeed"("tenant_id", "code");
CREATE INDEX "TransportNeed_tenant_id_status_due_at_idx" ON "TransportNeed"("tenant_id", "status", "due_at");
CREATE INDEX "TransportNeed_tenant_id_source_type_source_id_idx" ON "TransportNeed"("tenant_id", "source_type", "source_id");
CREATE INDEX "TransportNeed_tenant_id_delivery_point_id_due_at_idx" ON "TransportNeed"("tenant_id", "delivery_point_id", "due_at");
CREATE INDEX "TransportNeedLine_tenant_id_need_id_idx" ON "TransportNeedLine"("tenant_id", "need_id");
CREATE INDEX "TransportNeedLine_tenant_id_item_id_idx" ON "TransportNeedLine"("tenant_id", "item_id");
CREATE UNIQUE INDEX "TransportTrip_tenant_id_code_key" ON "TransportTrip"("tenant_id", "code");
CREATE INDEX "TransportTrip_tenant_id_status_planned_departure_idx" ON "TransportTrip"("tenant_id", "status", "planned_departure");
CREATE INDEX "TransportTrip_tenant_id_carrier_id_status_idx" ON "TransportTrip"("tenant_id", "carrier_id", "status");
CREATE INDEX "TransportTrip_tenant_id_vehicle_id_status_idx" ON "TransportTrip"("tenant_id", "vehicle_id", "status");
CREATE UNIQUE INDEX "TransportTripNeed_trip_id_need_id_key" ON "TransportTripNeed"("trip_id", "need_id");
CREATE INDEX "TransportTripNeed_tenant_id_trip_id_idx" ON "TransportTripNeed"("tenant_id", "trip_id");
CREATE INDEX "TransportTripNeed_tenant_id_need_id_idx" ON "TransportTripNeed"("tenant_id", "need_id");
CREATE UNIQUE INDEX "TransportStop_trip_id_sequence_key" ON "TransportStop"("trip_id", "sequence");
CREATE INDEX "TransportStop_tenant_id_trip_id_status_idx" ON "TransportStop"("tenant_id", "trip_id", "status");
CREATE INDEX "TransportStop_tenant_id_delivery_point_id_idx" ON "TransportStop"("tenant_id", "delivery_point_id");
CREATE INDEX "TransportTripEvent_tenant_id_trip_id_occurred_at_idx" ON "TransportTripEvent"("tenant_id", "trip_id", "occurred_at");
CREATE INDEX "TransportTripEvent_tenant_id_stop_id_occurred_at_idx" ON "TransportTripEvent"("tenant_id", "stop_id", "occurred_at");
CREATE INDEX "TransportTripEvent_tenant_id_event_type_occurred_at_idx" ON "TransportTripEvent"("tenant_id", "event_type", "occurred_at");
CREATE UNIQUE INDEX "TransportDeliveryAttempt_stop_id_attempt_number_key" ON "TransportDeliveryAttempt"("stop_id", "attempt_number");
CREATE INDEX "TransportDeliveryAttempt_tenant_id_trip_id_occurred_at_idx" ON "TransportDeliveryAttempt"("tenant_id", "trip_id", "occurred_at");
CREATE INDEX "TransportDeliveryAttempt_tenant_id_result_occurred_at_idx" ON "TransportDeliveryAttempt"("tenant_id", "result", "occurred_at");
CREATE UNIQUE INDEX "TransportPod_attempt_id_key" ON "TransportPod"("attempt_id");
CREATE INDEX "TransportPod_tenant_id_received_at_idx" ON "TransportPod"("tenant_id", "received_at");
CREATE UNIQUE INDEX "TransportSettlement_tenant_id_code_key" ON "TransportSettlement"("tenant_id", "code");
CREATE INDEX "TransportSettlement_tenant_id_trip_id_status_idx" ON "TransportSettlement"("tenant_id", "trip_id", "status");
CREATE INDEX "TransportSettlementLine_tenant_id_settlement_id_idx" ON "TransportSettlementLine"("tenant_id", "settlement_id");
CREATE INDEX "TransportSettlementLine_tenant_id_concept_idx" ON "TransportSettlementLine"("tenant_id", "concept");

ALTER TABLE "TransportDriver" ADD CONSTRAINT "TransportDriver_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "TransportCarrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportNeed" ADD CONSTRAINT "TransportNeed_delivery_point_id_fkey" FOREIGN KEY ("delivery_point_id") REFERENCES "TransportDeliveryPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportNeedLine" ADD CONSTRAINT "TransportNeedLine_need_id_fkey" FOREIGN KEY ("need_id") REFERENCES "TransportNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "TransportCarrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportTripNeed" ADD CONSTRAINT "TransportTripNeed_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportTripNeed" ADD CONSTRAINT "TransportTripNeed_need_id_fkey" FOREIGN KEY ("need_id") REFERENCES "TransportNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_need_id_fkey" FOREIGN KEY ("need_id") REFERENCES "TransportNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_delivery_point_id_fkey" FOREIGN KEY ("delivery_point_id") REFERENCES "TransportDeliveryPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportTripEvent" ADD CONSTRAINT "TransportTripEvent_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportTripEvent" ADD CONSTRAINT "TransportTripEvent_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "TransportStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportDeliveryAttempt" ADD CONSTRAINT "TransportDeliveryAttempt_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportDeliveryAttempt" ADD CONSTRAINT "TransportDeliveryAttempt_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "TransportStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportDeliveryAttempt" ADD CONSTRAINT "TransportDeliveryAttempt_need_id_fkey" FOREIGN KEY ("need_id") REFERENCES "TransportNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportPod" ADD CONSTRAINT "TransportPod_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "TransportDeliveryAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportSettlement" ADD CONSTRAINT "TransportSettlement_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportSettlementLine" ADD CONSTRAINT "TransportSettlementLine_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "TransportSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
