ALTER TABLE "commercial_settings"
ADD COLUMN "default_quote_validity_days" INTEGER NOT NULL DEFAULT 15;

CREATE TABLE "commercial_quotations" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "quotation_number" TEXT NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "advisor_id" INTEGER NOT NULL,
  "visit_id" INTEGER,
  "quotation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "subtotal" DECIMAL(18,2) NOT NULL,
  "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL,
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "commercial_customers"("id"),
  CONSTRAINT "commercial_quotations_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "commercial_advisors"("id"),
  CONSTRAINT "commercial_quotations_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "commercial_visits"("id")
);

CREATE UNIQUE INDEX "commercial_quotations_tenant_id_quotation_number_key" ON "commercial_quotations"("tenant_id", "quotation_number");
CREATE INDEX "commercial_quotations_tenant_id_advisor_id_status_valid_until_idx" ON "commercial_quotations"("tenant_id", "advisor_id", "status", "valid_until");
CREATE INDEX "commercial_quotations_tenant_id_customer_id_quotation_date_idx" ON "commercial_quotations"("tenant_id", "customer_id", "quotation_date");

CREATE TABLE "commercial_quotation_lines" (
  "id" SERIAL PRIMARY KEY,
  "quotation_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "product_code" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit_price" DECIMAL(18,2) NOT NULL,
  "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "commercial_quotation_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "commercial_quotations"("id") ON DELETE CASCADE,
  CONSTRAINT "commercial_quotation_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commercial_products"("id")
);

CREATE INDEX "commercial_quotation_lines_quotation_id_idx" ON "commercial_quotation_lines"("quotation_id");

ALTER TABLE "commercial_sales_orders" ADD COLUMN "quotation_id" INTEGER;
CREATE UNIQUE INDEX "commercial_sales_orders_quotation_id_key" ON "commercial_sales_orders"("quotation_id");
ALTER TABLE "commercial_sales_orders" ADD CONSTRAINT "commercial_sales_orders_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "commercial_quotations"("id");
