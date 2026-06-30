-- APEXOS PROD Prisma additive alignment.
-- Generated from apps/api/prisma/schema.prisma on 2026-06-30.
-- Scope: create only Prisma tables missing in Supabase PROD, plus indexes, safe FKs, RLS and service_role policies.
-- No destructive Prisma push.

begin;

-- Table: Tenant
CREATE TABLE IF NOT EXISTS "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT NOT NULL DEFAULT 'generic',
    "plan" TEXT NOT NULL DEFAULT 'seed',
    "active_modules" JSONB NOT NULL DEFAULT '[]',
    "config" JSONB NOT NULL DEFAULT '{}',
    "brain_model" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "tax_id" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- Table: User
CREATE TABLE IF NOT EXISTS "User" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role_id" INTEGER,
    "avatar" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Table: Role
CREATE TABLE IF NOT EXISTS "Role" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- Table: Permission
CREATE TABLE IF NOT EXISTS "Permission" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- Table: SoDRule
CREATE TABLE IF NOT EXISTS "SoDRule" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role_a" TEXT NOT NULL,
    "role_b" TEXT NOT NULL,
    "conflict_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "SoDRule_pkey" PRIMARY KEY ("id")
);

-- Table: AuditLog
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" INTEGER,
    "session_id" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Table: Party
CREATE TABLE IF NOT EXISTS "Party" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "tax_id" TEXT,
    "tax_type" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CO',
    "segment" TEXT,
    "credit_limit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- Table: Contact
CREATE TABLE IF NOT EXISTS "Contact" (
    "id" SERIAL NOT NULL,
    "party_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- Table: Item
CREATE TABLE IF NOT EXISTS "Item" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" INTEGER,
    "family_id" INTEGER,
    "family_code" TEXT,
    "society_code" TEXT,
    "branch_code" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'UND',
    "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costing_method" TEXT NOT NULL DEFAULT 'weighted_average',
    "unit_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock_current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock_min" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock_max" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume_m3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "abc_class" TEXT NOT NULL DEFAULT 'C',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- Table: inv_families
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

-- Table: inv_family_accounting
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

-- Table: inv_product_costs
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

-- Table: Category
CREATE TABLE IF NOT EXISTS "Category" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'item',

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- Table: Place
CREATE TABLE IF NOT EXISTS "Place" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CO',
    "society_code" TEXT,
    "branch_code" TEXT,
    "cost_center_code" TEXT,
    "warehouse_type" TEXT NOT NULL DEFAULT 'owned',
    "parent_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- Table: Location
CREATE TABLE IF NOT EXISTS "Location" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "place_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "aisle" TEXT,
    "rack" TEXT,
    "level" TEXT,
    "bin" TEXT,
    "zone" TEXT NOT NULL DEFAULT 'general',
    "abc_class" TEXT NOT NULL DEFAULT 'C',
    "capacity_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- Table: ItemLocation
CREATE TABLE IF NOT EXISTS "ItemLocation" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lot" TEXT,
    "serial" TEXT,
    "expiry" TIMESTAMP(3),
    "cost" DOUBLE PRECISION,

    CONSTRAINT "ItemLocation_pkey" PRIMARY KEY ("id")
);

-- Table: Transaction
CREATE TABLE IF NOT EXISTS "Transaction" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "party_id" INTEGER,
    "place_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "exchange_rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- Table: TransactionLine
CREATE TABLE IF NOT EXISTS "TransactionLine" (
    "id" SERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UND',
    "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "TransactionLine_pkey" PRIMARY KEY ("id")
);

-- Table: Movement
CREATE TABLE IF NOT EXISTS "Movement" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "item_id" INTEGER,
    "from_location" INTEGER,
    "to_location" INTEGER,
    "transaction_id" INTEGER,
    "qty" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lot" TEXT,
    "reason" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- Table: Resource
CREATE TABLE IF NOT EXISTS "Resource" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "place_id" INTEGER,
    "capacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'UND',
    "cost_per_hr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- Table: Document
CREATE TABLE IF NOT EXISTS "Document" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_url" TEXT,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "transaction_id" INTEGER,
    "party_id" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- Table: Event
CREATE TABLE IF NOT EXISTS "Event" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resource_id" INTEGER,
    "party_id" INTEGER,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assigned_to" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- Table: BOM
CREATE TABLE IF NOT EXISTS "BOM" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "yield_pct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "approved_by" INTEGER,
    "effective_dt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BOM_pkey" PRIMARY KEY ("id")
);

-- Table: BOMLine
CREATE TABLE IF NOT EXISTS "BOMLine" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "scrap_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "step" INTEGER,
    "notes" TEXT,

    CONSTRAINT "BOMLine_pkey" PRIMARY KEY ("id")
);

-- Table: WorkOrder
CREATE TABLE IF NOT EXISTS "WorkOrder" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "bom_id" INTEGER,
    "place_id" INTEGER,
    "qty_planned" DOUBLE PRECISION NOT NULL,
    "qty_produced" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty_rejected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "cost_actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- Table: Account
CREATE TABLE IF NOT EXISTS "Account" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parent_id" INTEGER,
    "level" INTEGER NOT NULL DEFAULT 1,
    "allows_tx" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- Table: LedgerEntry
CREATE TABLE IF NOT EXISTS "LedgerEntry" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "transaction_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- Table: cnt_cabdoc
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

-- Table: cnt_cuedoc
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

-- Table: cxp_cabdoc
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

-- Table: cxp_applications
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

-- Table: cxp_cuedoc
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

-- Table: pur_order_invoice_lines
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

-- Table: Employee
CREATE TABLE IF NOT EXISTS "Employee" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" INTEGER,
    "party_id" INTEGER,
    "code" TEXT,
    "user_type" TEXT NOT NULL DEFAULT 'operario',
    "position" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "salary_base" DOUBLE PRECISION NOT NULL,
    "salary_type" TEXT NOT NULL DEFAULT 'monthly',
    "hire_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "contract_type" TEXT NOT NULL DEFAULT 'indefinite',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- Table: WorkSchedule
CREATE TABLE IF NOT EXISTS "WorkSchedule" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "lunch_start_time" TEXT,
    "lunch_end_time" TEXT,
    "workable_days" JSONB NOT NULL DEFAULT '[0,1,2,3,4]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- Table: TimeRoute
CREATE TABLE IF NOT EXISTS "TimeRoute" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "vehicle_plate" TEXT,
    "employees" JSONB NOT NULL DEFAULT '[]',
    "start_time" TEXT,
    "end_time" TEXT,
    "tolerance_minutes" INTEGER NOT NULL DEFAULT 15,
    "per_diem" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeRoute_pkey" PRIMARY KEY ("id")
);

-- Table: RoutePreoperationalChecklist
CREATE TABLE IF NOT EXISTS "RoutePreoperationalChecklist" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "route_id" INTEGER,
    "shift_id" INTEGER,
    "punch_id" INTEGER,
    "driver_id" INTEGER,
    "driver_name" TEXT,
    "user_id" INTEGER,
    "vehicle_id" INTEGER,
    "plate" TEXT NOT NULL,
    "sede" TEXT,
    "checklist_status" TEXT NOT NULL DEFAULT 'pendiente',
    "risk_level" TEXT NOT NULL DEFAULT 'sin_riesgo',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "created_by" INTEGER,
    "location_lat" DOUBLE PRECISION,
    "location_lng" DOUBLE PRECISION,
    "digital_signature" TEXT,
    "mileage_initial" INTEGER,
    "fuel_level" TEXT,
    "observations" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePreoperationalChecklist_pkey" PRIMARY KEY ("id")
);

-- Table: RoutePreoperationalChecklistAnswer
CREATE TABLE IF NOT EXISTS "RoutePreoperationalChecklistAnswer" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "checklist_id" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "blocks_route" BOOLEAN NOT NULL DEFAULT false,
    "evidence_required" BOOLEAN NOT NULL DEFAULT false,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutePreoperationalChecklistAnswer_pkey" PRIMARY KEY ("id")
);

-- Table: RoutePreoperationalChecklistEvidence
CREATE TABLE IF NOT EXISTS "RoutePreoperationalChecklistEvidence" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "checklist_id" INTEGER NOT NULL,
    "item_key" TEXT,
    "evidence_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT,
    "storage_path" TEXT,
    "base64_data" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "RoutePreoperationalChecklistEvidence_pkey" PRIMARY KEY ("id")
);

-- Table: RoutePreoperationalFinding
CREATE TABLE IF NOT EXISTS "RoutePreoperationalFinding" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "checklist_id" INTEGER NOT NULL,
    "route_id" INTEGER,
    "plate" TEXT NOT NULL,
    "driver_id" INTEGER,
    "item_key" TEXT,
    "finding_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'abierta',
    "responsible" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePreoperationalFinding_pkey" PRIMARY KEY ("id")
);

-- Table: RouteStartAuthorization
CREATE TABLE IF NOT EXISTS "RouteStartAuthorization" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "route_id" INTEGER,
    "checklist_id" INTEGER,
    "driver_id" INTEGER,
    "plate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'bloqueada',
    "reason" TEXT,
    "authorized_by" INTEGER,
    "authorized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "RouteStartAuthorization_pkey" PRIMARY KEY ("id")
);

-- Table: RouteBlockEvent
CREATE TABLE IF NOT EXISTS "RouteBlockEvent" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "route_id" INTEGER,
    "checklist_id" INTEGER,
    "driver_id" INTEGER,
    "plate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "RouteBlockEvent_pkey" PRIMARY KEY ("id")
);

-- Table: GpsPing
CREATE TABLE IF NOT EXISTS "GpsPing" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "employee_id" INTEGER,
    "vehicle_plate" TEXT,
    "route_id" INTEGER,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'mobile',
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "GpsPing_pkey" PRIMARY KEY ("id")
);

-- Table: Vehicle
CREATE TABLE IF NOT EXISTS "Vehicle" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "model" TEXT,
    "type" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "line" TEXT,
    "year" INTEGER,
    "color" TEXT,
    "vin_chassis" TEXT,
    "engine_displacement" TEXT,
    "cylinder_capacity" TEXT,
    "load_capacity" TEXT,
    "capacity_value" DOUBLE PRECISION,
    "capacity_unit" TEXT,
    "volume_available" DOUBLE PRECISION,
    "fuel" TEXT,
    "body_type" TEXT,
    "axle_count" INTEGER,
    "mileage" INTEGER NOT NULL DEFAULT 0,
    "serial_number" TEXT,
    "engine_number" TEXT,
    "soat_issued_at" TIMESTAMP(3),
    "soat_expires" TIMESTAMP(3),
    "technical_review_issued_at" TIMESTAMP(3),
    "technical_review_expires" TIMESTAMP(3),
    "property_card" TEXT,
    "contractual_policy_expires" TIMESTAMP(3),
    "extra_contractual_policy_expires" TIMESTAMP(3),
    "cargo_registry" TEXT,
    "special_permits" TEXT,
    "normative_restrictions" TEXT,
    "insurance_expires" TIMESTAMP(3),
    "owner" TEXT,
    "ownership_type" TEXT,
    "legal_owner" TEXT,
    "owner_document" TEXT,
    "linked_company" TEXT,
    "cost_center" TEXT,
    "base_site" TEXT,
    "authorized_driver_id" INTEGER,
    "authorized_driver_name" TEXT,
    "authorized_driver_document" TEXT,
    "authorized_driver_code" TEXT,
    "linked_at" TIMESTAMP(3),
    "unlinked_at" TIMESTAMP(3),
    "legal_notes" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'activo',
    "master_status" TEXT NOT NULL DEFAULT 'pendiente_documentacion',
    "document_status" TEXT NOT NULL DEFAULT 'pendiente_documentacion',
    "master_score" INTEGER NOT NULL DEFAULT 0,
    "critical_expiry_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- Table: VehicleDocument
CREATE TABLE IF NOT EXISTS "VehicleDocument" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "plate" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT,
    "storage_path" TEXT,
    "base64_data" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "document_status" TEXT NOT NULL DEFAULT 'pendiente_validacion',
    "uploaded_by" INTEGER,
    "validated_by" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMP(3),
    "observations" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDocument_pkey" PRIMARY KEY ("id")
);

-- Table: VehicleMasterAuditLog
CREATE TABLE IF NOT EXISTS "VehicleMasterAuditLog" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "plate" TEXT NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleMasterAuditLog_pkey" PRIMARY KEY ("id")
);

-- Table: TimePunch
CREATE TABLE IF NOT EXISTS "TimePunch" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" INTEGER,
    "user_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "punched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "vehicle_plate" TEXT,
    "route_id" INTEGER,
    "extra_minutes" INTEGER NOT NULL DEFAULT 0,
    "extra_reason" TEXT,
    "extra_detail" TEXT,
    "extra_evidence" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimePunch_pkey" PRIMARY KEY ("id")
);

-- Table: ProcessedWorkday
CREATE TABLE IF NOT EXISTS "ProcessedWorkday" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "schedule_id" INTEGER,
    "route_id" INTEGER,
    "vehicle_plate" TEXT,
    "entry_at" TIMESTAMP(3),
    "exit_at" TIMESTAMP(3),
    "lunch_start_at" TIMESTAMP(3),
    "lunch_end_at" TIMESTAMP(3),
    "total_minutes" INTEGER NOT NULL DEFAULT 0,
    "lunch_minutes" INTEGER NOT NULL DEFAULT 0,
    "ordinary_day_minutes" INTEGER NOT NULL DEFAULT 0,
    "ordinary_night_minutes" INTEGER NOT NULL DEFAULT 0,
    "ordinary_sunday_holiday_day_minutes" INTEGER NOT NULL DEFAULT 0,
    "ordinary_sunday_holiday_night_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_day_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_night_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_sunday_holiday_day_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_sunday_holiday_night_minutes" INTEGER NOT NULL DEFAULT 0,
    "alerts" JSONB NOT NULL DEFAULT '[]',
    "inconsistent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWorkday_pkey" PRIMARY KEY ("id")
);

-- Table: ServiceOrder
CREATE TABLE IF NOT EXISTS "ServiceOrder" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "reference_item_id" INTEGER,
    "reference_id" INTEGER,
    "technician_id" INTEGER,
    "service_type" TEXT NOT NULL DEFAULT 'montaje',
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "customer_name" TEXT NOT NULL,
    "customer_address" TEXT NOT NULL,
    "customer_phone" TEXT,
    "invoice_number" TEXT,
    "scheduled_date" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "start_latitude" DOUBLE PRECISION,
    "start_longitude" DOUBLE PRECISION,
    "close_latitude" DOUBLE PRECISION,
    "close_longitude" DOUBLE PRECISION,
    "duration_minutes" INTEGER,
    "notes" TEXT,
    "no_execution_reason" TEXT,
    "created_by" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- Table: ServiceReference
CREATE TABLE IF NOT EXISTS "ServiceReference" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'muebles',
    "description" TEXT,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 60,
    "brand" TEXT,
    "model" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceReference_pkey" PRIMARY KEY ("id")
);

-- Table: ServiceReferencePart
CREATE TABLE IF NOT EXISTS "ServiceReferencePart" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reference_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'und',
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceReferencePart_pkey" PRIMARY KEY ("id")
);

-- Table: ServiceIncident
CREATE TABLE IF NOT EXISTS "ServiceIncident" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'averia',
    "action" TEXT,
    "photo_url" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceIncident_pkey" PRIMARY KEY ("id")
);

-- Table: ServicePhoto
CREATE TABLE IF NOT EXISTS "ServicePhoto" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "file_url" TEXT,
    "base64_data" TEXT,
    "size_bytes" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePhoto_pkey" PRIMARY KEY ("id")
);

-- Table: Payroll
CREATE TABLE IF NOT EXISTS "Payroll" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "days_worked" DOUBLE PRECISION NOT NULL,
    "overtime_hrs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "absences" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL,
    "deductions" DOUBLE PRECISION NOT NULL,
    "net" DOUBLE PRECISION NOT NULL,
    "employer_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- Table: OKR
CREATE TABLE IF NOT EXISTS "OKR" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "objective" TEXT NOT NULL,
    "key_results" JSONB NOT NULL,
    "period" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "OKR_pkey" PRIMARY KEY ("id")
);

-- Table: Payment
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transaction_id" INTEGER,
    "party_id" INTEGER,
    "type" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "account_id" INTEGER,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Table: Subscription
CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "price_monthly" DOUBLE PRECISION NOT NULL,
    "billing_day" INTEGER NOT NULL DEFAULT 1,
    "trial_ends" TIMESTAMP(3),
    "next_billing" TIMESTAMP(3),
    "payment_method" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- Table: SubscriptionInvoice
CREATE TABLE IF NOT EXISTS "SubscriptionInvoice" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- Table: BrainEvent
CREATE TABLE IF NOT EXISTS "BrainEvent" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "suggestion" JSONB,
    "accepted" BOOLEAN,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainEvent_pkey" PRIMARY KEY ("id")
);

-- Table: BrainMetric
CREATE TABLE IF NOT EXISTS "BrainMetric" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainMetric_pkey" PRIMARY KEY ("id")
);

-- Table: Workflow
CREATE TABLE IF NOT EXISTS "Workflow" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "states" JSONB NOT NULL,
    "transitions" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- Table: CustomField
CREATE TABLE IF NOT EXISTS "CustomField" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- Table: Threshold
CREATE TABLE IF NOT EXISTS "Threshold" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "sensor" TEXT NOT NULL,
    "min_val" DOUBLE PRECISION,
    "max_val" DOUBLE PRECISION,
    "alert_type" TEXT NOT NULL DEFAULT 'warning',

    CONSTRAINT "Threshold_pkey" PRIMARY KEY ("id")
);

-- Table: SensorReading
CREATE TABLE IF NOT EXISTS "SensorReading" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "sensor" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorReading_pkey" PRIMARY KEY ("id")
);

-- Table: EInvoiceConfig
CREATE TABLE IF NOT EXISTS "EInvoiceConfig" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "dian_software_id" TEXT,
    "dian_software_pin" TEXT,
    "dian_test_set_id" TEXT,
    "dian_resolution_num" TEXT,
    "dian_resolution_date" TIMESTAMP(3),
    "dian_prefix" TEXT,
    "dian_from_num" INTEGER,
    "dian_to_num" INTEGER,
    "dian_current_num" INTEGER NOT NULL DEFAULT 0,
    "sat_rfc" TEXT,
    "sat_cert_b64" TEXT,
    "sat_key_b64" TEXT,
    "sat_cert_pass" TEXT,
    "sat_regime" TEXT,
    "sunat_ruc" TEXT,
    "sunat_user" TEXT,
    "sunat_pass" TEXT,
    "sunat_ose" TEXT,
    "cert_pkcs12_b64" TEXT,
    "cert_password" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoiceConfig_pkey" PRIMARY KEY ("id")
);

-- Table: EInvoice
CREATE TABLE IF NOT EXISTS "EInvoice" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "country" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prefix" TEXT,
    "number" INTEGER NOT NULL,
    "full_number" TEXT NOT NULL,
    "cufe" TEXT,
    "qr_code" TEXT,
    "uuid" TEXT,
    "sat_seal" TEXT,
    "cdr_content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "xml_url" TEXT,
    "pdf_url" TEXT,
    "signed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoice_pkey" PRIMARY KEY ("id")
);

-- Indexes for newly created Prisma tables.
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_domain_key" ON "Tenant"("domain");
CREATE INDEX IF NOT EXISTS "User_tenant_id_idx" ON "User"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "User_tenant_id_email_key" ON "User"("tenant_id", "email");
CREATE INDEX IF NOT EXISTS "Role_tenant_id_idx" ON "Role"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Role_tenant_id_name_key" ON "Role"("tenant_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Permission_role_id_module_action_key" ON "Permission"("role_id", "module", "action");
CREATE INDEX IF NOT EXISTS "SoDRule_tenant_id_idx" ON "SoDRule"("tenant_id");
CREATE INDEX IF NOT EXISTS "AuditLog_tenant_id_module_timestamp_idx" ON "AuditLog"("tenant_id", "module", "timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_tenant_id_entity_entity_id_idx" ON "AuditLog"("tenant_id", "entity", "entity_id");
CREATE INDEX IF NOT EXISTS "Party_tenant_id_type_idx" ON "Party"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "Party_tenant_id_type_active_name_idx" ON "Party"("tenant_id", "type", "active", "name");
CREATE INDEX IF NOT EXISTS "Party_tenant_id_tax_id_idx" ON "Party"("tenant_id", "tax_id");
CREATE INDEX IF NOT EXISTS "Item_tenant_id_type_idx" ON "Item"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "Item_tenant_id_family_code_idx" ON "Item"("tenant_id", "family_code");
CREATE INDEX IF NOT EXISTS "Item_tenant_id_society_code_branch_code_idx" ON "Item"("tenant_id", "society_code", "branch_code");
CREATE INDEX IF NOT EXISTS "Item_tenant_id_active_idx" ON "Item"("tenant_id", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "Item_tenant_id_code_key" ON "Item"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "inv_families_tenant_id_society_code_branch_code_idx" ON "inv_families"("tenant_id", "society_code", "branch_code");
CREATE INDEX IF NOT EXISTS "inv_families_tenant_id_active_idx" ON "inv_families"("tenant_id", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "inv_families_tenant_id_code_key" ON "inv_families"("tenant_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "inv_family_accounting_family_id_key" ON "inv_family_accounting"("family_id");
CREATE INDEX IF NOT EXISTS "inv_family_accounting_tenant_id_idx" ON "inv_family_accounting"("tenant_id");
CREATE INDEX IF NOT EXISTS "inv_product_costs_tenant_id_item_id_created_at_idx" ON "inv_product_costs"("tenant_id", "item_id", "created_at");
CREATE INDEX IF NOT EXISTS "inv_product_costs_tenant_id_source_type_source_id_idx" ON "inv_product_costs"("tenant_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "Category_tenant_id_idx" ON "Category"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Category_tenant_id_name_type_key" ON "Category"("tenant_id", "name", "type");
CREATE INDEX IF NOT EXISTS "Place_tenant_id_type_idx" ON "Place"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "Place_tenant_id_society_code_branch_code_cost_center_code_idx" ON "Place"("tenant_id", "society_code", "branch_code", "cost_center_code");
CREATE UNIQUE INDEX IF NOT EXISTS "Place_tenant_id_code_key" ON "Place"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "Location_tenant_id_idx" ON "Location"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Location_tenant_id_place_id_code_key" ON "Location"("tenant_id", "place_id", "code");
CREATE INDEX IF NOT EXISTS "ItemLocation_tenant_id_idx" ON "ItemLocation"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ItemLocation_item_id_location_id_lot_key" ON "ItemLocation"("item_id", "location_id", "lot");
CREATE INDEX IF NOT EXISTS "Transaction_tenant_id_type_status_idx" ON "Transaction"("tenant_id", "type", "status");
CREATE INDEX IF NOT EXISTS "Transaction_tenant_id_party_id_idx" ON "Transaction"("tenant_id", "party_id");
CREATE INDEX IF NOT EXISTS "Transaction_tenant_id_created_at_idx" ON "Transaction"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "Transaction_tenant_id_type_created_at_idx" ON "Transaction"("tenant_id", "type", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_tenant_id_type_number_key" ON "Transaction"("tenant_id", "type", "number");
CREATE INDEX IF NOT EXISTS "Movement_tenant_id_item_id_created_at_idx" ON "Movement"("tenant_id", "item_id", "created_at");
CREATE INDEX IF NOT EXISTS "Movement_tenant_id_type_created_at_idx" ON "Movement"("tenant_id", "type", "created_at");
CREATE INDEX IF NOT EXISTS "Resource_tenant_id_type_idx" ON "Resource"("tenant_id", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "Resource_tenant_id_code_key" ON "Resource"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "Document_tenant_id_type_idx" ON "Document"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "Document_tenant_id_created_at_idx" ON "Document"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "Event_tenant_id_type_start_at_idx" ON "Event"("tenant_id", "type", "start_at");
CREATE INDEX IF NOT EXISTS "Event_tenant_id_status_idx" ON "Event"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "BOM_tenant_id_item_id_idx" ON "BOM"("tenant_id", "item_id");
CREATE INDEX IF NOT EXISTS "WorkOrder_tenant_id_status_idx" ON "WorkOrder"("tenant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_tenant_id_number_key" ON "WorkOrder"("tenant_id", "number");
CREATE INDEX IF NOT EXISTS "Account_tenant_id_type_idx" ON "Account"("tenant_id", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "Account_tenant_id_code_key" ON "Account"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenant_id_account_id_date_idx" ON "LedgerEntry"("tenant_id", "account_id", "date");
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenant_id_period_idx" ON "LedgerEntry"("tenant_id", "period");
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
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_document_class_posting_date_idx" ON "cxp_cabdoc"("tenant_id", "document_class", "posting_date");
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_supplier_id_due_date_idx" ON "cxp_cabdoc"("tenant_id", "supplier_id", "due_date");
CREATE UNIQUE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_number_key" ON "cxp_cabdoc"("tenant_id", "number");
CREATE INDEX IF NOT EXISTS "cxp_applications_tenant_id_credit_note_id_idx" ON "cxp_applications"("tenant_id", "credit_note_id");
CREATE INDEX IF NOT EXISTS "cxp_applications_tenant_id_invoice_id_idx" ON "cxp_applications"("tenant_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "cxp_cuedoc_tenant_id_cabdoc_id_idx" ON "cxp_cuedoc"("tenant_id", "cabdoc_id");
CREATE INDEX IF NOT EXISTS "cxp_cuedoc_tenant_id_account_code_idx" ON "cxp_cuedoc"("tenant_id", "account_code");
CREATE INDEX IF NOT EXISTS "cxp_cuedoc_tenant_id_branch_code_cost_center_code_idx" ON "cxp_cuedoc"("tenant_id", "branch_code", "cost_center_code");
CREATE INDEX IF NOT EXISTS "pur_order_invoice_lines_tenant_id_purchase_order_id_idx" ON "pur_order_invoice_lines"("tenant_id", "purchase_order_id");
CREATE INDEX IF NOT EXISTS "pur_order_invoice_lines_tenant_id_purchase_order_line_id_idx" ON "pur_order_invoice_lines"("tenant_id", "purchase_order_line_id");
CREATE INDEX IF NOT EXISTS "pur_order_invoice_lines_tenant_id_cxp_cabdoc_id_idx" ON "pur_order_invoice_lines"("tenant_id", "cxp_cabdoc_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_user_id_key" ON "Employee"("user_id");
CREATE INDEX IF NOT EXISTS "Employee_tenant_id_active_idx" ON "Employee"("tenant_id", "active");
CREATE INDEX IF NOT EXISTS "Employee_tenant_id_user_type_idx" ON "Employee"("tenant_id", "user_type");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenant_id_code_key" ON "Employee"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "WorkSchedule_tenant_id_active_idx" ON "WorkSchedule"("tenant_id", "active");
CREATE INDEX IF NOT EXISTS "TimeRoute_tenant_id_date_idx" ON "TimeRoute"("tenant_id", "date");
CREATE INDEX IF NOT EXISTS "TimeRoute_tenant_id_status_idx" ON "TimeRoute"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalChecklist_tenant_id_route_id_checklist_s_idx" ON "RoutePreoperationalChecklist"("tenant_id", "route_id", "checklist_status");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalChecklist_tenant_id_driver_id_started_at_idx" ON "RoutePreoperationalChecklist"("tenant_id", "driver_id", "started_at");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalChecklist_tenant_id_plate_started_at_idx" ON "RoutePreoperationalChecklist"("tenant_id", "plate", "started_at");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalChecklistAnswer_tenant_id_checklist_id_idx" ON "RoutePreoperationalChecklistAnswer"("tenant_id", "checklist_id");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalChecklistAnswer_tenant_id_item_key_idx" ON "RoutePreoperationalChecklistAnswer"("tenant_id", "item_key");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalChecklistEvidence_tenant_id_checklist_id_idx" ON "RoutePreoperationalChecklistEvidence"("tenant_id", "checklist_id");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalChecklistEvidence_tenant_id_evidence_typ_idx" ON "RoutePreoperationalChecklistEvidence"("tenant_id", "evidence_type");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalFinding_tenant_id_severity_status_idx" ON "RoutePreoperationalFinding"("tenant_id", "severity", "status");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalFinding_tenant_id_plate_idx" ON "RoutePreoperationalFinding"("tenant_id", "plate");
CREATE INDEX IF NOT EXISTS "RoutePreoperationalFinding_tenant_id_driver_id_idx" ON "RoutePreoperationalFinding"("tenant_id", "driver_id");
CREATE INDEX IF NOT EXISTS "RouteStartAuthorization_tenant_id_route_id_status_idx" ON "RouteStartAuthorization"("tenant_id", "route_id", "status");
CREATE INDEX IF NOT EXISTS "RouteStartAuthorization_tenant_id_plate_idx" ON "RouteStartAuthorization"("tenant_id", "plate");
CREATE INDEX IF NOT EXISTS "RouteBlockEvent_tenant_id_route_id_created_at_idx" ON "RouteBlockEvent"("tenant_id", "route_id", "created_at");
CREATE INDEX IF NOT EXISTS "RouteBlockEvent_tenant_id_plate_idx" ON "RouteBlockEvent"("tenant_id", "plate");
CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_user_name_captured_at_idx" ON "GpsPing"("tenant_id", "user_name", "captured_at");
CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_route_id_captured_at_idx" ON "GpsPing"("tenant_id", "route_id", "captured_at");
CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_captured_at_idx" ON "GpsPing"("tenant_id", "captured_at");
CREATE INDEX IF NOT EXISTS "Vehicle_tenant_id_vin_chassis_idx" ON "Vehicle"("tenant_id", "vin_chassis");
CREATE INDEX IF NOT EXISTS "Vehicle_tenant_id_status_idx" ON "Vehicle"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "Vehicle_tenant_id_master_status_idx" ON "Vehicle"("tenant_id", "master_status");
CREATE INDEX IF NOT EXISTS "Vehicle_tenant_id_base_site_idx" ON "Vehicle"("tenant_id", "base_site");
CREATE INDEX IF NOT EXISTS "Vehicle_tenant_id_authorized_driver_id_idx" ON "Vehicle"("tenant_id", "authorized_driver_id");
CREATE INDEX IF NOT EXISTS "Vehicle_tenant_id_ownership_type_idx" ON "Vehicle"("tenant_id", "ownership_type");
CREATE INDEX IF NOT EXISTS "Vehicle_tenant_id_type_idx" ON "Vehicle"("tenant_id", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_tenant_id_plate_key" ON "Vehicle"("tenant_id", "plate");
CREATE INDEX IF NOT EXISTS "VehicleDocument_tenant_id_vehicle_id_idx" ON "VehicleDocument"("tenant_id", "vehicle_id");
CREATE INDEX IF NOT EXISTS "VehicleDocument_tenant_id_plate_idx" ON "VehicleDocument"("tenant_id", "plate");
CREATE INDEX IF NOT EXISTS "VehicleDocument_tenant_id_document_type_expires_at_idx" ON "VehicleDocument"("tenant_id", "document_type", "expires_at");
CREATE INDEX IF NOT EXISTS "VehicleDocument_tenant_id_document_status_idx" ON "VehicleDocument"("tenant_id", "document_status");
CREATE INDEX IF NOT EXISTS "VehicleMasterAuditLog_tenant_id_vehicle_id_created_at_idx" ON "VehicleMasterAuditLog"("tenant_id", "vehicle_id", "created_at");
CREATE INDEX IF NOT EXISTS "VehicleMasterAuditLog_tenant_id_plate_idx" ON "VehicleMasterAuditLog"("tenant_id", "plate");
CREATE INDEX IF NOT EXISTS "TimePunch_tenant_id_employee_id_date_idx" ON "TimePunch"("tenant_id", "employee_id", "date");
CREATE INDEX IF NOT EXISTS "TimePunch_tenant_id_user_name_date_idx" ON "TimePunch"("tenant_id", "user_name", "date");
CREATE INDEX IF NOT EXISTS "ProcessedWorkday_tenant_id_date_idx" ON "ProcessedWorkday"("tenant_id", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessedWorkday_tenant_id_employee_id_date_key" ON "ProcessedWorkday"("tenant_id", "employee_id", "date");
CREATE INDEX IF NOT EXISTS "ServiceOrder_tenant_id_status_idx" ON "ServiceOrder"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "ServiceOrder_tenant_id_scheduled_date_idx" ON "ServiceOrder"("tenant_id", "scheduled_date");
CREATE INDEX IF NOT EXISTS "ServiceOrder_tenant_id_created_at_idx" ON "ServiceOrder"("tenant_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceOrder_tenant_id_number_key" ON "ServiceOrder"("tenant_id", "number");
CREATE INDEX IF NOT EXISTS "ServiceReference_tenant_id_category_idx" ON "ServiceReference"("tenant_id", "category");
CREATE INDEX IF NOT EXISTS "ServiceReference_tenant_id_active_idx" ON "ServiceReference"("tenant_id", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceReference_tenant_id_code_key" ON "ServiceReference"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "ServiceReferencePart_tenant_id_reference_id_idx" ON "ServiceReferencePart"("tenant_id", "reference_id");
CREATE INDEX IF NOT EXISTS "ServiceIncident_tenant_id_order_id_idx" ON "ServiceIncident"("tenant_id", "order_id");
CREATE INDEX IF NOT EXISTS "ServicePhoto_tenant_id_order_id_idx" ON "ServicePhoto"("tenant_id", "order_id");
CREATE INDEX IF NOT EXISTS "ServicePhoto_tenant_id_type_idx" ON "ServicePhoto"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "Payroll_tenant_id_status_idx" ON "Payroll"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "Payroll_tenant_id_created_at_idx" ON "Payroll"("tenant_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_employee_id_period_key" ON "Payroll"("employee_id", "period");
CREATE INDEX IF NOT EXISTS "OKR_tenant_id_period_idx" ON "OKR"("tenant_id", "period");
CREATE INDEX IF NOT EXISTS "Payment_tenant_id_type_date_idx" ON "Payment"("tenant_id", "type", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_tenant_id_key" ON "Subscription"("tenant_id");
CREATE INDEX IF NOT EXISTS "BrainEvent_tenant_id_module_created_at_idx" ON "BrainEvent"("tenant_id", "module", "created_at");
CREATE INDEX IF NOT EXISTS "BrainMetric_tenant_id_metric_period_idx" ON "BrainMetric"("tenant_id", "metric", "period");
CREATE INDEX IF NOT EXISTS "Workflow_tenant_id_entity_idx" ON "Workflow"("tenant_id", "entity");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomField_tenant_id_entity_name_key" ON "CustomField"("tenant_id", "entity", "name");
CREATE INDEX IF NOT EXISTS "SensorReading_resource_id_sensor_timestamp_idx" ON "SensorReading"("resource_id", "sensor", "timestamp");
CREATE INDEX IF NOT EXISTS "SensorReading_tenant_id_idx" ON "SensorReading"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "EInvoiceConfig_tenant_id_key" ON "EInvoiceConfig"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "EInvoice_transaction_id_key" ON "EInvoice"("transaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "EInvoice_cufe_key" ON "EInvoice"("cufe");
CREATE UNIQUE INDEX IF NOT EXISTS "EInvoice_uuid_key" ON "EInvoice"("uuid");
CREATE INDEX IF NOT EXISTS "EInvoice_tenant_id_status_idx" ON "EInvoice"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "EInvoice_tenant_id_created_at_idx" ON "EInvoice"("tenant_id", "created_at");

-- Foreign keys whose source table is newly created. Source tables start empty, so validation is safe.
-- Referential action clauses are intentionally omitted to satisfy the production audit.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'User_role_id_fkey') then
    ALTER TABLE "User" ADD CONSTRAINT "User_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Permission_role_id_fkey') then
    ALTER TABLE "Permission" ADD CONSTRAINT "Permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Contact_party_id_fkey') then
    ALTER TABLE "Contact" ADD CONSTRAINT "Contact_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "Party"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Item_category_id_fkey') then
    ALTER TABLE "Item" ADD CONSTRAINT "Item_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Item_family_id_fkey') then
    ALTER TABLE "Item" ADD CONSTRAINT "Item_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "inv_families"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inv_family_accounting_family_id_fkey') then
    ALTER TABLE "inv_family_accounting" ADD CONSTRAINT "inv_family_accounting_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "inv_families"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inv_product_costs_item_id_fkey') then
    ALTER TABLE "inv_product_costs" ADD CONSTRAINT "inv_product_costs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Location_place_id_fkey') then
    ALTER TABLE "Location" ADD CONSTRAINT "Location_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "Place"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ItemLocation_item_id_fkey') then
    ALTER TABLE "ItemLocation" ADD CONSTRAINT "ItemLocation_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ItemLocation_location_id_fkey') then
    ALTER TABLE "ItemLocation" ADD CONSTRAINT "ItemLocation_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "Location"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Transaction_party_id_fkey') then
    ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "Party"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'TransactionLine_transaction_id_fkey') then
    ALTER TABLE "TransactionLine" ADD CONSTRAINT "TransactionLine_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Movement_item_id_fkey') then
    ALTER TABLE "Movement" ADD CONSTRAINT "Movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Movement_transaction_id_fkey') then
    ALTER TABLE "Movement" ADD CONSTRAINT "Movement_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Document_transaction_id_fkey') then
    ALTER TABLE "Document" ADD CONSTRAINT "Document_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Event_resource_id_fkey') then
    ALTER TABLE "Event" ADD CONSTRAINT "Event_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'BOMLine_bom_id_fkey') then
    ALTER TABLE "BOMLine" ADD CONSTRAINT "BOMLine_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "BOM"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'BOMLine_item_id_fkey') then
    ALTER TABLE "BOMLine" ADD CONSTRAINT "BOMLine_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'LedgerEntry_account_id_fkey') then
    ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cnt_cuedoc_cabdoc_id_fkey') then
    ALTER TABLE "cnt_cuedoc" ADD CONSTRAINT "cnt_cuedoc_cabdoc_id_fkey" FOREIGN KEY ("cabdoc_id") REFERENCES "cnt_cabdoc"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cxp_cuedoc_cabdoc_id_fkey') then
    ALTER TABLE "cxp_cuedoc" ADD CONSTRAINT "cxp_cuedoc_cabdoc_id_fkey" FOREIGN KEY ("cabdoc_id") REFERENCES "cxp_cabdoc"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Employee_user_id_fkey') then
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'RoutePreoperationalChecklist_route_id_fkey') then
    ALTER TABLE "RoutePreoperationalChecklist" ADD CONSTRAINT "RoutePreoperationalChecklist_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "TimeRoute"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'RoutePreoperationalChecklist_driver_id_fkey') then
    ALTER TABLE "RoutePreoperationalChecklist" ADD CONSTRAINT "RoutePreoperationalChecklist_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "Employee"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'RoutePreoperationalChecklistAnswer_checklist_id_fkey') then
    ALTER TABLE "RoutePreoperationalChecklistAnswer" ADD CONSTRAINT "RoutePreoperationalChecklistAnswer_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "RoutePreoperationalChecklist"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'RoutePreoperationalChecklistEvidence_checklist_id_fkey') then
    ALTER TABLE "RoutePreoperationalChecklistEvidence" ADD CONSTRAINT "RoutePreoperationalChecklistEvidence_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "RoutePreoperationalChecklist"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'RoutePreoperationalFinding_checklist_id_fkey') then
    ALTER TABLE "RoutePreoperationalFinding" ADD CONSTRAINT "RoutePreoperationalFinding_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "RoutePreoperationalChecklist"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'RouteStartAuthorization_route_id_fkey') then
    ALTER TABLE "RouteStartAuthorization" ADD CONSTRAINT "RouteStartAuthorization_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "TimeRoute"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'RouteBlockEvent_route_id_fkey') then
    ALTER TABLE "RouteBlockEvent" ADD CONSTRAINT "RouteBlockEvent_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "TimeRoute"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Vehicle_authorized_driver_id_fkey') then
    ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_authorized_driver_id_fkey" FOREIGN KEY ("authorized_driver_id") REFERENCES "Employee"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'VehicleDocument_vehicle_id_fkey') then
    ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'VehicleMasterAuditLog_vehicle_id_fkey') then
    ALTER TABLE "VehicleMasterAuditLog" ADD CONSTRAINT "VehicleMasterAuditLog_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'TimePunch_employee_id_fkey') then
    ALTER TABLE "TimePunch" ADD CONSTRAINT "TimePunch_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ProcessedWorkday_employee_id_fkey') then
    ALTER TABLE "ProcessedWorkday" ADD CONSTRAINT "ProcessedWorkday_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ProcessedWorkday_schedule_id_fkey') then
    ALTER TABLE "ProcessedWorkday" ADD CONSTRAINT "ProcessedWorkday_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "WorkSchedule"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ServiceOrder_reference_id_fkey') then
    ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "ServiceReference"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ServiceReferencePart_reference_id_fkey') then
    ALTER TABLE "ServiceReferencePart" ADD CONSTRAINT "ServiceReferencePart_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "ServiceReference"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ServiceIncident_order_id_fkey') then
    ALTER TABLE "ServiceIncident" ADD CONSTRAINT "ServiceIncident_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ServiceOrder"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ServicePhoto_order_id_fkey') then
    ALTER TABLE "ServicePhoto" ADD CONSTRAINT "ServicePhoto_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ServiceOrder"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Payroll_employee_id_fkey') then
    ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'OKR_employee_id_fkey') then
    ALTER TABLE "OKR" ADD CONSTRAINT "OKR_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Payment_transaction_id_fkey') then
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Subscription_tenant_id_fkey') then
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'SubscriptionInvoice_subscription_id_fkey') then
    ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'Threshold_resource_id_fkey') then
    ALTER TABLE "Threshold" ADD CONSTRAINT "Threshold_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id");
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'EInvoice_transaction_id_fkey') then
    ALTER TABLE "EInvoice" ADD CONSTRAINT "EInvoice_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id");
  end if;
end $$;

-- RLS and minimal privileged policy for Prisma/server-side tables.
alter table "Tenant" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Tenant' and policyname = 'Tenant_service_role_all') then
    create policy "Tenant_service_role_all" on "Tenant" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "User" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'User' and policyname = 'User_service_role_all') then
    create policy "User_service_role_all" on "User" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Role" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Role' and policyname = 'Role_service_role_all') then
    create policy "Role_service_role_all" on "Role" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Permission" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Permission' and policyname = 'Permission_service_role_all') then
    create policy "Permission_service_role_all" on "Permission" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "SoDRule" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'SoDRule' and policyname = 'SoDRule_service_role_all') then
    create policy "SoDRule_service_role_all" on "SoDRule" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "AuditLog" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'AuditLog' and policyname = 'AuditLog_service_role_all') then
    create policy "AuditLog_service_role_all" on "AuditLog" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Party" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Party' and policyname = 'Party_service_role_all') then
    create policy "Party_service_role_all" on "Party" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Contact" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Contact' and policyname = 'Contact_service_role_all') then
    create policy "Contact_service_role_all" on "Contact" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Item" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Item' and policyname = 'Item_service_role_all') then
    create policy "Item_service_role_all" on "Item" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "inv_families" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inv_families' and policyname = 'inv_families_service_role_all') then
    create policy "inv_families_service_role_all" on "inv_families" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "inv_family_accounting" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inv_family_accounting' and policyname = 'inv_family_accounting_service_role_all') then
    create policy "inv_family_accounting_service_role_all" on "inv_family_accounting" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "inv_product_costs" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inv_product_costs' and policyname = 'inv_product_costs_service_role_all') then
    create policy "inv_product_costs_service_role_all" on "inv_product_costs" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Category" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Category' and policyname = 'Category_service_role_all') then
    create policy "Category_service_role_all" on "Category" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Place" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Place' and policyname = 'Place_service_role_all') then
    create policy "Place_service_role_all" on "Place" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Location" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Location' and policyname = 'Location_service_role_all') then
    create policy "Location_service_role_all" on "Location" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "ItemLocation" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ItemLocation' and policyname = 'ItemLocation_service_role_all') then
    create policy "ItemLocation_service_role_all" on "ItemLocation" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Transaction" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Transaction' and policyname = 'Transaction_service_role_all') then
    create policy "Transaction_service_role_all" on "Transaction" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "TransactionLine" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'TransactionLine' and policyname = 'TransactionLine_service_role_all') then
    create policy "TransactionLine_service_role_all" on "TransactionLine" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Movement" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Movement' and policyname = 'Movement_service_role_all') then
    create policy "Movement_service_role_all" on "Movement" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Resource" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Resource' and policyname = 'Resource_service_role_all') then
    create policy "Resource_service_role_all" on "Resource" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Document" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Document' and policyname = 'Document_service_role_all') then
    create policy "Document_service_role_all" on "Document" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Event" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Event' and policyname = 'Event_service_role_all') then
    create policy "Event_service_role_all" on "Event" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "BOM" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'BOM' and policyname = 'BOM_service_role_all') then
    create policy "BOM_service_role_all" on "BOM" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "BOMLine" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'BOMLine' and policyname = 'BOMLine_service_role_all') then
    create policy "BOMLine_service_role_all" on "BOMLine" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "WorkOrder" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'WorkOrder' and policyname = 'WorkOrder_service_role_all') then
    create policy "WorkOrder_service_role_all" on "WorkOrder" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Account" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Account' and policyname = 'Account_service_role_all') then
    create policy "Account_service_role_all" on "Account" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "LedgerEntry" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'LedgerEntry' and policyname = 'LedgerEntry_service_role_all') then
    create policy "LedgerEntry_service_role_all" on "LedgerEntry" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "cnt_cabdoc" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cnt_cabdoc' and policyname = 'cnt_cabdoc_service_role_all') then
    create policy "cnt_cabdoc_service_role_all" on "cnt_cabdoc" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "cnt_cuedoc" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cnt_cuedoc' and policyname = 'cnt_cuedoc_service_role_all') then
    create policy "cnt_cuedoc_service_role_all" on "cnt_cuedoc" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "cxp_cabdoc" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cxp_cabdoc' and policyname = 'cxp_cabdoc_service_role_all') then
    create policy "cxp_cabdoc_service_role_all" on "cxp_cabdoc" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "cxp_applications" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cxp_applications' and policyname = 'cxp_applications_service_role_all') then
    create policy "cxp_applications_service_role_all" on "cxp_applications" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "cxp_cuedoc" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cxp_cuedoc' and policyname = 'cxp_cuedoc_service_role_all') then
    create policy "cxp_cuedoc_service_role_all" on "cxp_cuedoc" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "pur_order_invoice_lines" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pur_order_invoice_lines' and policyname = 'pur_order_invoice_lines_service_role_all') then
    create policy "pur_order_invoice_lines_service_role_all" on "pur_order_invoice_lines" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Employee" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Employee' and policyname = 'Employee_service_role_all') then
    create policy "Employee_service_role_all" on "Employee" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "WorkSchedule" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'WorkSchedule' and policyname = 'WorkSchedule_service_role_all') then
    create policy "WorkSchedule_service_role_all" on "WorkSchedule" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "TimeRoute" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'TimeRoute' and policyname = 'TimeRoute_service_role_all') then
    create policy "TimeRoute_service_role_all" on "TimeRoute" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "RoutePreoperationalChecklist" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'RoutePreoperationalChecklist' and policyname = 'RoutePreoperationalChecklist_service_role_all') then
    create policy "RoutePreoperationalChecklist_service_role_all" on "RoutePreoperationalChecklist" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "RoutePreoperationalChecklistAnswer" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'RoutePreoperationalChecklistAnswer' and policyname = 'RoutePreoperationalChecklistAnswer_service_role_all') then
    create policy "RoutePreoperationalChecklistAnswer_service_role_all" on "RoutePreoperationalChecklistAnswer" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "RoutePreoperationalChecklistEvidence" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'RoutePreoperationalChecklistEvidence' and policyname = 'RoutePreoperationalChecklistEvidence_service_role_all') then
    create policy "RoutePreoperationalChecklistEvidence_service_role_all" on "RoutePreoperationalChecklistEvidence" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "RoutePreoperationalFinding" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'RoutePreoperationalFinding' and policyname = 'RoutePreoperationalFinding_service_role_all') then
    create policy "RoutePreoperationalFinding_service_role_all" on "RoutePreoperationalFinding" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "RouteStartAuthorization" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'RouteStartAuthorization' and policyname = 'RouteStartAuthorization_service_role_all') then
    create policy "RouteStartAuthorization_service_role_all" on "RouteStartAuthorization" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "RouteBlockEvent" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'RouteBlockEvent' and policyname = 'RouteBlockEvent_service_role_all') then
    create policy "RouteBlockEvent_service_role_all" on "RouteBlockEvent" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "GpsPing" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'GpsPing' and policyname = 'GpsPing_service_role_all') then
    create policy "GpsPing_service_role_all" on "GpsPing" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Vehicle" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Vehicle' and policyname = 'Vehicle_service_role_all') then
    create policy "Vehicle_service_role_all" on "Vehicle" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "VehicleDocument" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'VehicleDocument' and policyname = 'VehicleDocument_service_role_all') then
    create policy "VehicleDocument_service_role_all" on "VehicleDocument" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "VehicleMasterAuditLog" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'VehicleMasterAuditLog' and policyname = 'VehicleMasterAuditLog_service_role_all') then
    create policy "VehicleMasterAuditLog_service_role_all" on "VehicleMasterAuditLog" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "TimePunch" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'TimePunch' and policyname = 'TimePunch_service_role_all') then
    create policy "TimePunch_service_role_all" on "TimePunch" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "ProcessedWorkday" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ProcessedWorkday' and policyname = 'ProcessedWorkday_service_role_all') then
    create policy "ProcessedWorkday_service_role_all" on "ProcessedWorkday" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "ServiceOrder" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ServiceOrder' and policyname = 'ServiceOrder_service_role_all') then
    create policy "ServiceOrder_service_role_all" on "ServiceOrder" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "ServiceReference" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ServiceReference' and policyname = 'ServiceReference_service_role_all') then
    create policy "ServiceReference_service_role_all" on "ServiceReference" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "ServiceReferencePart" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ServiceReferencePart' and policyname = 'ServiceReferencePart_service_role_all') then
    create policy "ServiceReferencePart_service_role_all" on "ServiceReferencePart" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "ServiceIncident" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ServiceIncident' and policyname = 'ServiceIncident_service_role_all') then
    create policy "ServiceIncident_service_role_all" on "ServiceIncident" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "ServicePhoto" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ServicePhoto' and policyname = 'ServicePhoto_service_role_all') then
    create policy "ServicePhoto_service_role_all" on "ServicePhoto" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Payroll" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Payroll' and policyname = 'Payroll_service_role_all') then
    create policy "Payroll_service_role_all" on "Payroll" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "OKR" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'OKR' and policyname = 'OKR_service_role_all') then
    create policy "OKR_service_role_all" on "OKR" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Payment" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Payment' and policyname = 'Payment_service_role_all') then
    create policy "Payment_service_role_all" on "Payment" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Subscription" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Subscription' and policyname = 'Subscription_service_role_all') then
    create policy "Subscription_service_role_all" on "Subscription" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "SubscriptionInvoice" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'SubscriptionInvoice' and policyname = 'SubscriptionInvoice_service_role_all') then
    create policy "SubscriptionInvoice_service_role_all" on "SubscriptionInvoice" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "BrainEvent" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'BrainEvent' and policyname = 'BrainEvent_service_role_all') then
    create policy "BrainEvent_service_role_all" on "BrainEvent" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "BrainMetric" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'BrainMetric' and policyname = 'BrainMetric_service_role_all') then
    create policy "BrainMetric_service_role_all" on "BrainMetric" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Workflow" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Workflow' and policyname = 'Workflow_service_role_all') then
    create policy "Workflow_service_role_all" on "Workflow" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "CustomField" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'CustomField' and policyname = 'CustomField_service_role_all') then
    create policy "CustomField_service_role_all" on "CustomField" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "Threshold" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Threshold' and policyname = 'Threshold_service_role_all') then
    create policy "Threshold_service_role_all" on "Threshold" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "SensorReading" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'SensorReading' and policyname = 'SensorReading_service_role_all') then
    create policy "SensorReading_service_role_all" on "SensorReading" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "EInvoiceConfig" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'EInvoiceConfig' and policyname = 'EInvoiceConfig_service_role_all') then
    create policy "EInvoiceConfig_service_role_all" on "EInvoiceConfig" for all to service_role using (true) with check (true);
  end if;
end $$;
alter table "EInvoice" enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'EInvoice' and policyname = 'EInvoice_service_role_all') then
    create policy "EInvoice_service_role_all" on "EInvoice" for all to service_role using (true) with check (true);
  end if;
end $$;

commit;

-- Summary: 66 tables, 151 indexes, 46 foreign keys, 66 RLS policies.