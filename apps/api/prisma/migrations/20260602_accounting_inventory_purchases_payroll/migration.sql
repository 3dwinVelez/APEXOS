-- APEXOS QA controlled migration
-- Scope: accounting, inventory, purchases payable integration, payroll configuration support.
-- Safety: no drops, no destructive renames, no data deletion.

-- Existing inventory item extensions.
ALTER TABLE "Item"
  ADD COLUMN IF NOT EXISTS "branch_code" TEXT,
  ADD COLUMN IF NOT EXISTS "costing_method" TEXT NOT NULL DEFAULT 'weighted_average',
  ADD COLUMN IF NOT EXISTS "family_code" TEXT,
  ADD COLUMN IF NOT EXISTS "family_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "society_code" TEXT;

-- Existing place/warehouse extensions.
ALTER TABLE "Place"
  ADD COLUMN IF NOT EXISTS "branch_code" TEXT,
  ADD COLUMN IF NOT EXISTS "cost_center_code" TEXT,
  ADD COLUMN IF NOT EXISTS "society_code" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse_type" TEXT NOT NULL DEFAULT 'owned';

-- Inventory family master and accounting mapping.
CREATE TABLE IF NOT EXISTS "inv_families" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "society_code" TEXT,
  "branch_code" TEXT,
  "code_start" TEXT,
  "code_end" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inv_families_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inv_family_accounting" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "family_id" INTEGER NOT NULL,
  "goods_receipt_account_code" TEXT NOT NULL,
  "gr_ir_account_code" TEXT NOT NULL,
  "sales_cost_account_code" TEXT NOT NULL,
  "sales_revenue_account_code" TEXT NOT NULL,
  "return_revenue_account_code" TEXT NOT NULL,
  "manual_in_account_code" TEXT NOT NULL,
  "manual_out_account_code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inv_family_accounting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inv_product_costs" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "item_id" INTEGER NOT NULL,
  "costing_method" TEXT NOT NULL DEFAULT 'weighted_average',
  "quantity_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "value_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "average_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "last_unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source_type" TEXT,
  "source_id" INTEGER,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inv_product_costs_pkey" PRIMARY KEY ("id")
);

-- Accounting document header/lines.
CREATE TABLE IF NOT EXISTS "cnt_cabdoc" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "document_number" INTEGER NOT NULL,
  "full_number" TEXT NOT NULL,
  "posting_date" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "header_text" TEXT NOT NULL,
  "society_code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "total_debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cnt_cabdoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cnt_cuedoc" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "cabdoc_id" INTEGER NOT NULL,
  "line_no" INTEGER NOT NULL,
  "account_id" INTEGER NOT NULL,
  "account_code" TEXT NOT NULL,
  "branch_code" TEXT NOT NULL,
  "cost_center_code" TEXT NOT NULL,
  "party_id" INTEGER NOT NULL,
  "party_tax_id" TEXT,
  "movement" TEXT NOT NULL,
  "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL,
  "ledger_entry_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cnt_cuedoc_pkey" PRIMARY KEY ("id")
);

-- Accounts payable documents and purchase invoice linkage.
CREATE TABLE IF NOT EXISTS "cxp_cabdoc" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "document_kind" TEXT NOT NULL,
  "document_class" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "supplier_reference" TEXT NOT NULL DEFAULT '',
  "referenced_invoice_id" INTEGER,
  "posting_date" TIMESTAMP(3) NOT NULL,
  "due_term" TEXT NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "header_text" TEXT NOT NULL,
  "supplier_id" INTEGER NOT NULL,
  "supplier_tax_id" TEXT,
  "society_code" TEXT NOT NULL,
  "associated_account_id" INTEGER NOT NULL,
  "associated_account_code" TEXT NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "applied_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "accounting_document_id" INTEGER,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cxp_cabdoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cxp_applications" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "credit_note_id" INTEGER NOT NULL,
  "invoice_id" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cxp_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cxp_cuedoc" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "cabdoc_id" INTEGER NOT NULL,
  "line_no" INTEGER NOT NULL,
  "account_id" INTEGER NOT NULL,
  "account_code" TEXT NOT NULL,
  "branch_code" TEXT NOT NULL,
  "cost_center_code" TEXT NOT NULL,
  "movement" TEXT NOT NULL,
  "vat_code" TEXT,
  "vat_concept" TEXT,
  "vat_account_code" TEXT,
  "vat_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vat_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cxp_cuedoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pur_order_invoice_lines" (
  "id" SERIAL NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "purchase_order_id" INTEGER NOT NULL,
  "purchase_order_line_id" INTEGER NOT NULL,
  "cxp_cabdoc_id" INTEGER NOT NULL,
  "item_id" INTEGER NOT NULL,
  "document_kind" TEXT NOT NULL,
  "qty" DOUBLE PRECISION NOT NULL,
  "unit_cost" DOUBLE PRECISION NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pur_order_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- Indexes and unique constraints.
CREATE INDEX IF NOT EXISTS "inv_families_tenant_id_society_code_branch_code_idx" ON "inv_families"("tenant_id", "society_code", "branch_code");
CREATE INDEX IF NOT EXISTS "inv_families_tenant_id_active_idx" ON "inv_families"("tenant_id", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "inv_families_tenant_id_code_key" ON "inv_families"("tenant_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "inv_family_accounting_family_id_key" ON "inv_family_accounting"("family_id");
CREATE INDEX IF NOT EXISTS "inv_family_accounting_tenant_id_idx" ON "inv_family_accounting"("tenant_id");
CREATE INDEX IF NOT EXISTS "inv_product_costs_tenant_id_item_id_created_at_idx" ON "inv_product_costs"("tenant_id", "item_id", "created_at");
CREATE INDEX IF NOT EXISTS "inv_product_costs_tenant_id_source_type_source_id_idx" ON "inv_product_costs"("tenant_id", "source_type", "source_id");

CREATE INDEX IF NOT EXISTS "cnt_cabdoc_tenant_id_posting_date_idx" ON "cnt_cabdoc"("tenant_id", "posting_date");
CREATE INDEX IF NOT EXISTS "cnt_cabdoc_tenant_id_society_code_idx" ON "cnt_cabdoc"("tenant_id", "society_code");
CREATE UNIQUE INDEX IF NOT EXISTS "cnt_cabdoc_tenant_id_document_type_document_number_key" ON "cnt_cabdoc"("tenant_id", "document_type", "document_number");
CREATE UNIQUE INDEX IF NOT EXISTS "cnt_cabdoc_tenant_id_full_number_key" ON "cnt_cabdoc"("tenant_id", "full_number");
CREATE INDEX IF NOT EXISTS "cnt_cuedoc_tenant_id_cabdoc_id_idx" ON "cnt_cuedoc"("tenant_id", "cabdoc_id");
CREATE INDEX IF NOT EXISTS "cnt_cuedoc_tenant_id_account_code_idx" ON "cnt_cuedoc"("tenant_id", "account_code");
CREATE INDEX IF NOT EXISTS "cnt_cuedoc_tenant_id_party_id_idx" ON "cnt_cuedoc"("tenant_id", "party_id");
CREATE INDEX IF NOT EXISTS "cnt_cuedoc_tenant_id_branch_code_cost_center_code_idx" ON "cnt_cuedoc"("tenant_id", "branch_code", "cost_center_code");

CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_document_class_supplier_id_supplier_re_idx" ON "cxp_cabdoc"("tenant_id", "document_class", "supplier_id", "supplier_reference");
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_supplier_id_idx" ON "cxp_cabdoc"("tenant_id", "supplier_id");
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_supplier_id_balance_idx" ON "cxp_cabdoc"("tenant_id", "supplier_id", "balance");
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_referenced_invoice_id_idx" ON "cxp_cabdoc"("tenant_id", "referenced_invoice_id");
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_document_class_idx" ON "cxp_cabdoc"("tenant_id", "document_class");
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_posting_date_idx" ON "cxp_cabdoc"("tenant_id", "posting_date");
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_due_date_idx" ON "cxp_cabdoc"("tenant_id", "due_date");
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_society_code_idx" ON "cxp_cabdoc"("tenant_id", "society_code");
CREATE UNIQUE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_number_key" ON "cxp_cabdoc"("tenant_id", "number");
CREATE INDEX IF NOT EXISTS "cxp_applications_tenant_id_credit_note_id_idx" ON "cxp_applications"("tenant_id", "credit_note_id");
CREATE INDEX IF NOT EXISTS "cxp_applications_tenant_id_invoice_id_idx" ON "cxp_applications"("tenant_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "cxp_cuedoc_tenant_id_cabdoc_id_idx" ON "cxp_cuedoc"("tenant_id", "cabdoc_id");
CREATE INDEX IF NOT EXISTS "cxp_cuedoc_tenant_id_account_code_idx" ON "cxp_cuedoc"("tenant_id", "account_code");
CREATE INDEX IF NOT EXISTS "cxp_cuedoc_tenant_id_branch_code_cost_center_code_idx" ON "cxp_cuedoc"("tenant_id", "branch_code", "cost_center_code");

CREATE INDEX IF NOT EXISTS "pur_order_invoice_lines_tenant_id_purchase_order_id_idx" ON "pur_order_invoice_lines"("tenant_id", "purchase_order_id");
CREATE INDEX IF NOT EXISTS "pur_order_invoice_lines_tenant_id_purchase_order_line_id_idx" ON "pur_order_invoice_lines"("tenant_id", "purchase_order_line_id");
CREATE INDEX IF NOT EXISTS "pur_order_invoice_lines_tenant_id_cxp_cabdoc_id_idx" ON "pur_order_invoice_lines"("tenant_id", "cxp_cabdoc_id");

CREATE INDEX IF NOT EXISTS "Item_tenant_id_family_code_idx" ON "Item"("tenant_id", "family_code");
CREATE INDEX IF NOT EXISTS "Item_tenant_id_society_code_branch_code_idx" ON "Item"("tenant_id", "society_code", "branch_code");
CREATE INDEX IF NOT EXISTS "Place_tenant_id_society_code_branch_code_cost_center_code_idx" ON "Place"("tenant_id", "society_code", "branch_code", "cost_center_code");

-- Foreign keys guarded for repeatable QA execution.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Item_family_id_fkey') THEN
    ALTER TABLE "Item" ADD CONSTRAINT "Item_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "inv_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inv_family_accounting_family_id_fkey') THEN
    ALTER TABLE "inv_family_accounting" ADD CONSTRAINT "inv_family_accounting_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "inv_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inv_product_costs_item_id_fkey') THEN
    ALTER TABLE "inv_product_costs" ADD CONSTRAINT "inv_product_costs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cnt_cuedoc_cabdoc_id_fkey') THEN
    ALTER TABLE "cnt_cuedoc" ADD CONSTRAINT "cnt_cuedoc_cabdoc_id_fkey" FOREIGN KEY ("cabdoc_id") REFERENCES "cnt_cabdoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cxp_cuedoc_cabdoc_id_fkey') THEN
    ALTER TABLE "cxp_cuedoc" ADD CONSTRAINT "cxp_cuedoc_cabdoc_id_fkey" FOREIGN KEY ("cabdoc_id") REFERENCES "cxp_cabdoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
