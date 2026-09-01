CREATE TABLE "commercial_zones" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "city" TEXT,
  "department" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "commercial_zones_tenant_id_code_key" ON "commercial_zones"("tenant_id", "code");
CREATE INDEX "commercial_zones_tenant_id_active_name_idx" ON "commercial_zones"("tenant_id", "active", "name");

CREATE TABLE "commercial_customer_categories" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "commercial_customer_categories_tenant_id_code_key" ON "commercial_customer_categories"("tenant_id", "code");
CREATE INDEX "commercial_customer_categories_tenant_id_active_name_idx" ON "commercial_customer_categories"("tenant_id", "active", "name");

ALTER TABLE "commercial_advisors" ADD COLUMN "zone_id" INTEGER;
ALTER TABLE "commercial_customers" ADD COLUMN "category_id" INTEGER;
ALTER TABLE "commercial_advisors" ADD CONSTRAINT "commercial_advisors_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "commercial_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_customers" ADD CONSTRAINT "commercial_customers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "commercial_customer_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "commercial_advisors_tenant_id_zone_id_active_idx" ON "commercial_advisors"("tenant_id", "zone_id", "active");
CREATE INDEX "commercial_customers_tenant_id_category_id_status_idx" ON "commercial_customers"("tenant_id", "category_id", "status");

INSERT INTO "commercial_zones" ("tenant_id", "code", "name", "city", "department", "updated_at")
SELECT DISTINCT "tenant_id", UPPER(REGEXP_REPLACE(TRIM("zone"), '[^A-Za-z0-9]+', '-', 'g')), TRIM("zone"), TRIM("zone"), NULL, CURRENT_TIMESTAMP
FROM "commercial_advisors" WHERE NULLIF(TRIM("zone"), '') IS NOT NULL
ON CONFLICT ("tenant_id", "code") DO NOTHING;

UPDATE "commercial_advisors" a SET "zone_id" = z."id"
FROM "commercial_zones" z WHERE z."tenant_id" = a."tenant_id" AND LOWER(z."name") = LOWER(TRIM(a."zone"));

INSERT INTO "commercial_customer_categories" ("tenant_id", "code", "name", "description", "updated_at")
SELECT DISTINCT "tenant_id", "segment", 'Categoria ' || "segment", 'Migrada desde la segmentacion comercial existente', CURRENT_TIMESTAMP
FROM "commercial_customers"
ON CONFLICT ("tenant_id", "code") DO NOTHING;

UPDATE "commercial_customers" c SET "category_id" = cc."id"
FROM "commercial_customer_categories" cc WHERE cc."tenant_id" = c."tenant_id" AND cc."code" = c."segment";
