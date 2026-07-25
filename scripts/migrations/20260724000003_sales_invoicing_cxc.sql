-- Migration: Sales Invoicing + Cuentas por Cobrar (CxC)
-- Fecha: 2026-07-24
-- Descripción: Agrega modelos para facturación de ventas sin pedido,
-- cuentas por cobrar (CxC), pagos de clientes y maestro de retenciones.

-- ============================================================
-- 1. FACTURA DE VENTA (Commercial Document)
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_invoices (
  id              SERIAL PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  number          TEXT NOT NULL,
  customer_id     INTEGER NOT NULL REFERENCES parties(id),
  place_id        INTEGER REFERENCES places(id),
  date            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date        TIMESTAMPTZ NOT NULL,
  due_term        TEXT NOT NULL DEFAULT 'AP30',
  subtotal        DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_total       DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount_total  DOUBLE PRECISION NOT NULL DEFAULT 0,
  retention_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  total           DOUBLE PRECISION NOT NULL DEFAULT 0,
  balance         DOUBLE PRECISION NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
  header_text     TEXT NOT NULL DEFAULT '',
  society_code    TEXT NOT NULL DEFAULT '',
  branch_code     TEXT NOT NULL DEFAULT '',
  cost_center_code TEXT NOT NULL DEFAULT '',
  notes           TEXT,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, number)
);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant_customer ON sales_invoices(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant_date ON sales_invoices(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant_status ON sales_invoices(tenant_id, status);

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id                      SERIAL PRIMARY KEY,
  tenant_id               TEXT NOT NULL,
  invoice_id              INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  line_no                 INTEGER NOT NULL,
  item_id                 INTEGER REFERENCES items(id),
  description             TEXT NOT NULL,
  qty                     DOUBLE PRECISION NOT NULL,
  unit                    TEXT NOT NULL DEFAULT 'UND',
  unit_price              DOUBLE PRECISION NOT NULL,
  discount                DOUBLE PRECISION NOT NULL DEFAULT 0,
  subtotal                DOUBLE PRECISION NOT NULL,
  tax_rate                DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_amount              DOUBLE PRECISION NOT NULL DEFAULT 0,
  total                   DOUBLE PRECISION NOT NULL,
  place_id                INTEGER REFERENCES places(id),
  customer_invoice_number TEXT,
  cost_value              DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_tenant_invoice ON sales_invoice_lines(tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_tenant_item ON sales_invoice_lines(tenant_id, item_id);

-- ============================================================
-- 2. CUENTAS POR COBRAR (CxC - Financial Document)
-- ============================================================

CREATE TABLE IF NOT EXISTS cxc_cabdoc (
  id                      SERIAL PRIMARY KEY,
  tenant_id               TEXT NOT NULL,
  document_kind           TEXT NOT NULL,
  document_class          TEXT NOT NULL,
  number                  TEXT NOT NULL,
  customer_reference      TEXT NOT NULL DEFAULT '',
  posting_date            TIMESTAMPTZ NOT NULL,
  due_term                TEXT NOT NULL,
  due_date                TIMESTAMPTZ NOT NULL,
  header_text             TEXT NOT NULL,
  customer_id             INTEGER NOT NULL,
  customer_tax_id         TEXT,
  society_code            TEXT NOT NULL,
  associated_account_id   INTEGER NOT NULL,
  associated_account_code TEXT NOT NULL,
  sales_invoice_id        INTEGER UNIQUE REFERENCES sales_invoices(id),
  subtotal                DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_total               DOUBLE PRECISION NOT NULL DEFAULT 0,
  total                   DOUBLE PRECISION NOT NULL DEFAULT 0,
  retention_total         DOUBLE PRECISION NOT NULL DEFAULT 0,
  applied_total           DOUBLE PRECISION NOT NULL DEFAULT 0,
  balance                 DOUBLE PRECISION NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'open',
  accounting_document_id  INTEGER,
  created_by              INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, number)
);

CREATE INDEX IF NOT EXISTS idx_cxc_cabdoc_tenant_customer ON cxc_cabdoc(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_cxc_cabdoc_tenant_customer_balance ON cxc_cabdoc(tenant_id, customer_id, balance);
CREATE INDEX IF NOT EXISTS idx_cxc_cabdoc_tenant_posting ON cxc_cabdoc(tenant_id, posting_date);
CREATE INDEX IF NOT EXISTS idx_cxc_cabdoc_tenant_due ON cxc_cabdoc(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_cxc_cabdoc_tenant_class ON cxc_cabdoc(tenant_id, document_class);

CREATE TABLE IF NOT EXISTS cxc_cuedoc (
  id                SERIAL PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  cabdoc_id         INTEGER NOT NULL REFERENCES cxc_cabdoc(id) ON DELETE CASCADE,
  line_no           INTEGER NOT NULL,
  account_id        INTEGER NOT NULL,
  account_code      TEXT NOT NULL,
  branch_code       TEXT NOT NULL,
  cost_center_code  TEXT NOT NULL,
  movement          TEXT NOT NULL,
  description       TEXT NOT NULL,
  amount            DOUBLE PRECISION NOT NULL DEFAULT 0,
  total             DOUBLE PRECISION NOT NULL DEFAULT 0,
  retention_code    TEXT,
  retention_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  retention_amount  DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cxc_cuedoc_tenant_cabdoc ON cxc_cuedoc(tenant_id, cabdoc_id);
CREATE INDEX IF NOT EXISTS idx_cxc_cuedoc_tenant_account ON cxc_cuedoc(tenant_id, account_code);

CREATE TABLE IF NOT EXISTS cxc_payments (
  id          SERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  cabdoc_id   INTEGER REFERENCES cxc_cabdoc(id),
  customer_id INTEGER,
  type        TEXT NOT NULL,
  method      TEXT NOT NULL,
  amount      DOUBLE PRECISION NOT NULL,
  date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference   TEXT,
  account_id  INTEGER,
  notes       TEXT,
  created_by  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cxc_payments_tenant_cabdoc ON cxc_payments(tenant_id, cabdoc_id);
CREATE INDEX IF NOT EXISTS idx_cxc_payments_tenant_customer ON cxc_payments(tenant_id, customer_id, date);

-- ============================================================
-- 3. MAESTRO DE RETENCIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS retention_masters (
  id           SERIAL PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  code         TEXT NOT NULL,
  description  TEXT NOT NULL,
  account_code TEXT NOT NULL,
  percent      DOUBLE PRECISION NOT NULL,
  concept      TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_retention_masters_tenant_active ON retention_masters(tenant_id, active);
