CREATE TABLE IF NOT EXISTS "inv_sku_valuations" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "society_code" TEXT NOT NULL,
  "item_id" INTEGER NOT NULL REFERENCES "Item"("id"),
  "quantity_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "value_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "average_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "inv_product_costs" ADD COLUMN IF NOT EXISTS "society_code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "inv_sku_valuations_tenant_id_society_code_item_id_key" ON "inv_sku_valuations"("tenant_id", "society_code", "item_id");
CREATE INDEX IF NOT EXISTS "inv_sku_valuations_tenant_id_society_code_item_id_idx" ON "inv_sku_valuations"("tenant_id", "society_code", "item_id");

CREATE TABLE IF NOT EXISTS "inv_warehouse_transfers" (
  "id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "number" TEXT NOT NULL, "society_code" TEXT NOT NULL,
  "origin_place_id" INTEGER NOT NULL, "destination_place_id" INTEGER NOT NULL, "transit_location_id" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'draft', "reason" TEXT, "correlation_id" TEXT, "idempotency_key" TEXT,
  "created_by" INTEGER, "dispatched_by" INTEGER, "received_by" INTEGER, "dispatched_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "inv_warehouse_transfers_tenant_id_number_key" ON "inv_warehouse_transfers"("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "inv_warehouse_transfers_tenant_id_idempotency_key_key" ON "inv_warehouse_transfers"("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "inv_warehouse_transfers_tenant_id_society_code_status_idx" ON "inv_warehouse_transfers"("tenant_id", "society_code", "status");

CREATE TABLE IF NOT EXISTS "inv_warehouse_transfer_lines" (
  "id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "transfer_id" INTEGER NOT NULL REFERENCES "inv_warehouse_transfers"("id") ON DELETE CASCADE,
  "item_id" INTEGER NOT NULL REFERENCES "Item"("id"), "qty" DOUBLE PRECISION NOT NULL, "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lot" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "inv_warehouse_transfer_lines_tenant_id_transfer_id_idx" ON "inv_warehouse_transfer_lines"("tenant_id", "transfer_id");
CREATE INDEX IF NOT EXISTS "inv_warehouse_transfer_lines_tenant_id_item_id_idx" ON "inv_warehouse_transfer_lines"("tenant_id", "item_id");

ALTER TABLE "Movement" ADD COLUMN IF NOT EXISTS "society_code" TEXT;
ALTER TABLE "Movement" ADD COLUMN IF NOT EXISTS "source_type" TEXT;
ALTER TABLE "Movement" ADD COLUMN IF NOT EXISTS "source_id" INTEGER;
ALTER TABLE "Movement" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE "Movement" ADD COLUMN IF NOT EXISTS "correlation_id" TEXT;
ALTER TABLE "Movement" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
ALTER TABLE "Movement" ADD COLUMN IF NOT EXISTS "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "Movement_tenant_id_idempotency_key_key" ON "Movement"("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "Movement_tenant_id_society_code_item_id_effective_at_idx" ON "Movement"("tenant_id", "society_code", "item_id", "effective_at");

INSERT INTO "inv_sku_valuations" ("tenant_id", "society_code", "item_id", "quantity_balance", "value_balance", "average_cost")
SELECT i."tenant_id", p."society_code", i."id", COALESCE(SUM(il."qty"), 0),
       COALESCE(SUM(il."qty"), 0) * i."unit_cost", i."unit_cost"
FROM "Item" i
JOIN "ItemLocation" il ON il."item_id" = i."id"
JOIN "Location" l ON l."id" = il."location_id"
JOIN "Place" p ON p."id" = l."place_id"
WHERE p."society_code" IS NOT NULL AND p."type" = 'warehouse'
GROUP BY i."tenant_id", p."society_code", i."id", i."unit_cost"
ON CONFLICT ("tenant_id", "society_code", "item_id") DO NOTHING;
