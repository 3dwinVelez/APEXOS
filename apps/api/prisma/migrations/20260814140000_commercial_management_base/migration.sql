CREATE TABLE "commercial_advisors" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "zone" TEXT,
  "user_id" INTEGER,
  "supervisor_user_id" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "external_advisor_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "commercial_advisors_tenant_id_code_key"
  ON "commercial_advisors"("tenant_id", "code");
CREATE UNIQUE INDEX "commercial_advisors_tenant_id_user_id_key"
  ON "commercial_advisors"("tenant_id", "user_id");
CREATE INDEX "commercial_advisors_tenant_id_supervisor_user_id_active_idx"
  ON "commercial_advisors"("tenant_id", "supervisor_user_id", "active");

CREATE TABLE "commercial_customers" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "legal_name" TEXT NOT NULL,
  "trade_name" TEXT,
  "identification" TEXT,
  "contact_name" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "city" TEXT,
  "zone" TEXT,
  "advisor_id" INTEGER NOT NULL,
  "segment" TEXT NOT NULL DEFAULT 'C',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "visit_frequency_days" INTEGER NOT NULL DEFAULT 30,
  "last_purchase_at" TIMESTAMP(3),
  "last_visit_at" TIMESTAMP(3),
  "external_customer_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_customers_advisor_id_fkey"
    FOREIGN KEY ("advisor_id") REFERENCES "commercial_advisors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "commercial_customers_tenant_id_code_key"
  ON "commercial_customers"("tenant_id", "code");
CREATE INDEX "commercial_customers_tenant_id_advisor_id_status_idx"
  ON "commercial_customers"("tenant_id", "advisor_id", "status");

CREATE TABLE "commercial_periods" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "commercial_periods_tenant_id_name_key"
  ON "commercial_periods"("tenant_id", "name");
CREATE INDEX "commercial_periods_tenant_id_status_start_date_end_date_idx"
  ON "commercial_periods"("tenant_id", "status", "start_date", "end_date");

CREATE TABLE "commercial_advisor_budgets" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "period_id" INTEGER NOT NULL,
  "advisor_id" INTEGER NOT NULL,
  "budget_amount" DECIMAL(18,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_advisor_budgets_period_id_fkey"
    FOREIGN KEY ("period_id") REFERENCES "commercial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_advisor_budgets_advisor_id_fkey"
    FOREIGN KEY ("advisor_id") REFERENCES "commercial_advisors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "commercial_advisor_budgets_tenant_id_period_id_advisor_id_key"
  ON "commercial_advisor_budgets"("tenant_id", "period_id", "advisor_id");

CREATE TABLE "commercial_customer_budgets" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "period_id" INTEGER NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "advisor_id" INTEGER NOT NULL,
  "budget_amount" DECIMAL(18,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_customer_budgets_period_id_fkey"
    FOREIGN KEY ("period_id") REFERENCES "commercial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_customer_budgets_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "commercial_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_customer_budgets_advisor_id_fkey"
    FOREIGN KEY ("advisor_id") REFERENCES "commercial_advisors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "commercial_customer_budgets_tenant_id_period_id_customer_id_key"
  ON "commercial_customer_budgets"("tenant_id", "period_id", "customer_id");
CREATE INDEX "commercial_customer_budgets_tenant_id_period_id_advisor_id_idx"
  ON "commercial_customer_budgets"("tenant_id", "period_id", "advisor_id");

CREATE TABLE "commercial_visits" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "advisor_id" INTEGER NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "visit_date" TIMESTAMP(3) NOT NULL,
  "visit_type" TEXT NOT NULL DEFAULT 'IN_PERSON',
  "result_code" TEXT NOT NULL,
  "notes" TEXT,
  "follow_up_required" BOOLEAN NOT NULL DEFAULT FALSE,
  "follow_up_date" TIMESTAMP(3),
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_visits_advisor_id_fkey"
    FOREIGN KEY ("advisor_id") REFERENCES "commercial_advisors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_visits_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "commercial_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "commercial_visits_tenant_id_advisor_id_visit_date_idx"
  ON "commercial_visits"("tenant_id", "advisor_id", "visit_date");
CREATE INDEX "commercial_visits_tenant_id_customer_id_visit_date_idx"
  ON "commercial_visits"("tenant_id", "customer_id", "visit_date");

CREATE TABLE "commercial_products" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "unit_price" DECIMAL(18,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "external_product_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "commercial_products_tenant_id_code_key"
  ON "commercial_products"("tenant_id", "code");
CREATE INDEX "commercial_products_tenant_id_active_name_idx"
  ON "commercial_products"("tenant_id", "active", "name");

CREATE TABLE "commercial_sales_orders" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "order_number" TEXT NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "advisor_id" INTEGER NOT NULL,
  "visit_id" INTEGER,
  "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(18,2) NOT NULL,
  "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL,
  "notes" TEXT,
  "external_sales_order_id" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_sales_orders_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "commercial_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_sales_orders_advisor_id_fkey"
    FOREIGN KEY ("advisor_id") REFERENCES "commercial_advisors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_sales_orders_visit_id_fkey"
    FOREIGN KEY ("visit_id") REFERENCES "commercial_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "commercial_sales_orders_tenant_id_order_number_key"
  ON "commercial_sales_orders"("tenant_id", "order_number");
CREATE INDEX "commercial_sales_orders_tenant_id_advisor_id_order_date_idx"
  ON "commercial_sales_orders"("tenant_id", "advisor_id", "order_date");
CREATE INDEX "commercial_sales_orders_tenant_id_customer_id_status_idx"
  ON "commercial_sales_orders"("tenant_id", "customer_id", "status");

CREATE TABLE "commercial_sales_order_lines" (
  "id" SERIAL PRIMARY KEY,
  "sales_order_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "product_code" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit_price" DECIMAL(18,2) NOT NULL,
  "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "commercial_sales_order_lines_sales_order_id_fkey"
    FOREIGN KEY ("sales_order_id") REFERENCES "commercial_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "commercial_sales_order_lines_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "commercial_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "commercial_sales_order_lines_sales_order_id_idx"
  ON "commercial_sales_order_lines"("sales_order_id");
