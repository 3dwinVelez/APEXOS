ALTER TABLE "commercial_visits" ADD COLUMN "scheduled_end_at" TIMESTAMP(3);
ALTER TABLE "commercial_visits" ADD COLUMN "planned_duration_minutes" INTEGER NOT NULL DEFAULT 60;
UPDATE "commercial_visits" SET "scheduled_end_at" = "visit_date" + INTERVAL '60 minutes' WHERE "scheduled_end_at" IS NULL;

CREATE TABLE "commercial_visit_events" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "visit_id" INTEGER NOT NULL,
  "event_type" TEXT NOT NULL,
  "event_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduled_for" TIMESTAMP(3),
  "details" JSONB NOT NULL DEFAULT '{}',
  "created_by" INTEGER,
  CONSTRAINT "commercial_visit_events_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "commercial_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "commercial_visit_events_tenant_id_visit_id_event_at_idx" ON "commercial_visit_events"("tenant_id", "visit_id", "event_at");

INSERT INTO "commercial_visit_events" ("tenant_id", "visit_id", "event_type", "event_at", "scheduled_for", "details", "created_by")
SELECT "tenant_id", "id", 'SCHEDULED', "created_at", "visit_date", jsonb_build_object('backfilled', true), "created_by" FROM "commercial_visits";

CREATE TABLE "commercial_settings" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL UNIQUE,
  "default_visit_duration_minutes" INTEGER NOT NULL DEFAULT 60,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "commercial_settings" ("tenant_id", "updated_at") SELECT "id", CURRENT_TIMESTAMP FROM "Tenant" ON CONFLICT ("tenant_id") DO NOTHING;

ALTER TABLE "commercial_products" ADD COLUMN "classification_id" INTEGER;
ALTER TABLE "commercial_products" ADD COLUMN "subcategory" TEXT;
ALTER TABLE "commercial_products" ADD COLUMN "line" TEXT;
ALTER TABLE "commercial_products" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'UND';
ALTER TABLE "commercial_products" ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "commercial_products" ADD COLUMN "inventory_item_id" INTEGER;
ALTER TABLE "commercial_products" ADD CONSTRAINT "commercial_products_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_products" ADD CONSTRAINT "commercial_products_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "commercial_products_tenant_id_inventory_item_id_key" ON "commercial_products"("tenant_id", "inventory_item_id");
CREATE INDEX "commercial_products_tenant_id_source_type_active_idx" ON "commercial_products"("tenant_id", "source_type", "active");
