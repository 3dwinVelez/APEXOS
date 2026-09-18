ALTER TABLE "commercial_customers" ADD COLUMN "credit_capacity" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE TABLE "commercial_customer_commitments" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "advisor_id" INTEGER NOT NULL,
  "visit_id" INTEGER,
  "description" TEXT NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "completed_at" TIMESTAMP(3),
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_customer_commitments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "commercial_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_customer_commitments_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "commercial_advisors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "commercial_customer_commitments_tenant_id_advisor_id_status_due_date_idx" ON "commercial_customer_commitments"("tenant_id", "advisor_id", "status", "due_date");
CREATE INDEX "commercial_customer_commitments_tenant_id_customer_id_status_idx" ON "commercial_customer_commitments"("tenant_id", "customer_id", "status");
