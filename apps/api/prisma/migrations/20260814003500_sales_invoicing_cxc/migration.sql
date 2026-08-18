CREATE TABLE "sales_invoices" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "place_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) NOT NULL,
    "due_term" TEXT NOT NULL DEFAULT 'AP30',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retention_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "header_text" TEXT NOT NULL DEFAULT '',
    "society_code" TEXT NOT NULL DEFAULT '',
    "branch_code" TEXT NOT NULL DEFAULT '',
    "cost_center_code" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_invoice_lines" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" INTEGER,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UND',
    "unit_price" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "place_id" INTEGER,
    "customer_invoice_number" TEXT,
    "cost_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cxc_cabdoc" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_kind" TEXT NOT NULL,
    "document_class" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_reference" TEXT NOT NULL DEFAULT '',
    "posting_date" TIMESTAMP(3) NOT NULL,
    "due_term" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "header_text" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "customer_tax_id" TEXT,
    "society_code" TEXT NOT NULL,
    "associated_account_id" INTEGER NOT NULL,
    "associated_account_code" TEXT NOT NULL,
    "sales_invoice_id" INTEGER,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retention_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "applied_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "accounting_document_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cxc_cabdoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cxc_cuedoc" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cabdoc_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "account_code" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "cost_center_code" TEXT NOT NULL,
    "movement" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retention_code" TEXT,
    "retention_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retention_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cxc_cuedoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cxc_payments" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cabdoc_id" INTEGER,
    "customer_id" INTEGER,
    "type" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "account_id" INTEGER,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cxc_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retention_masters" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "concept" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "retention_masters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_invoices_tenant_id_customer_id_idx" ON "sales_invoices"("tenant_id", "customer_id");
CREATE INDEX "sales_invoices_tenant_id_date_idx" ON "sales_invoices"("tenant_id", "date");
CREATE INDEX "sales_invoices_tenant_id_status_idx" ON "sales_invoices"("tenant_id", "status");
CREATE UNIQUE INDEX "sales_invoices_tenant_id_number_key" ON "sales_invoices"("tenant_id", "number");
CREATE INDEX "sales_invoice_lines_tenant_id_invoice_id_idx" ON "sales_invoice_lines"("tenant_id", "invoice_id");
CREATE INDEX "sales_invoice_lines_tenant_id_item_id_idx" ON "sales_invoice_lines"("tenant_id", "item_id");
CREATE UNIQUE INDEX "cxc_cabdoc_sales_invoice_id_key" ON "cxc_cabdoc"("sales_invoice_id");
CREATE INDEX "cxc_cabdoc_tenant_id_customer_id_idx" ON "cxc_cabdoc"("tenant_id", "customer_id");
CREATE INDEX "cxc_cabdoc_tenant_id_customer_id_balance_idx" ON "cxc_cabdoc"("tenant_id", "customer_id", "balance");
CREATE INDEX "cxc_cabdoc_tenant_id_posting_date_idx" ON "cxc_cabdoc"("tenant_id", "posting_date");
CREATE INDEX "cxc_cabdoc_tenant_id_due_date_idx" ON "cxc_cabdoc"("tenant_id", "due_date");
CREATE INDEX "cxc_cabdoc_tenant_id_document_class_idx" ON "cxc_cabdoc"("tenant_id", "document_class");
CREATE UNIQUE INDEX "cxc_cabdoc_tenant_id_number_key" ON "cxc_cabdoc"("tenant_id", "number");
CREATE INDEX "cxc_cuedoc_tenant_id_cabdoc_id_idx" ON "cxc_cuedoc"("tenant_id", "cabdoc_id");
CREATE INDEX "cxc_cuedoc_tenant_id_account_code_idx" ON "cxc_cuedoc"("tenant_id", "account_code");
CREATE INDEX "cxc_payments_tenant_id_cabdoc_id_idx" ON "cxc_payments"("tenant_id", "cabdoc_id");
CREATE INDEX "cxc_payments_tenant_id_customer_id_date_idx" ON "cxc_payments"("tenant_id", "customer_id", "date");
CREATE INDEX "retention_masters_tenant_id_active_idx" ON "retention_masters"("tenant_id", "active");
CREATE UNIQUE INDEX "retention_masters_tenant_id_code_key" ON "retention_masters"("tenant_id", "code");

ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cxc_cabdoc" ADD CONSTRAINT "cxc_cabdoc_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cxc_cuedoc" ADD CONSTRAINT "cxc_cuedoc_cabdoc_id_fkey" FOREIGN KEY ("cabdoc_id") REFERENCES "cxc_cabdoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cxc_payments" ADD CONSTRAINT "cxc_payments_cabdoc_id_fkey" FOREIGN KEY ("cabdoc_id") REFERENCES "cxc_cabdoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;
