-- =====================================================================================
-- GASTOS MENORES / CAJAS MENORES - Capa de datos fundacional
-- =====================================================================================
-- Modulo ERP propio (slug "gastos-menores", area Finanzas). Crea las 5 tablas que
-- respaldan el contrato Prisma PettyCashConcept / PettyCashBox / PettyCashAdvance /
-- PettyCashVoucher / PettyCashVoucherLine, mas una siembra idempotente de conceptos
-- tipicos colombianos.
--
-- DDL verbatim de `prisma migrate diff` entre HEAD y el schema con los modelos nuevos,
-- para que los nombres de indices, constraints y claves queden identicos a los que
-- Prisma derivaria (y a los que espera el cliente de Prisma en runtime).
--
-- La migracion es IDEMPOTENTE a proposito: se puede reaplicar en QA local sin efectos
-- secundarios (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, foreign keys
-- protegidas con pg_constraint y siembra con ON CONFLICT DO NOTHING).
--
-- DECISIONES DE DISENO (no renegociables por tareas posteriores):
--   * Contabilizacion inmediata: no existe estado borrador. petty_cash_vouchers.status
--     arranca en 'posted' y su cnt_cabdoc se genera en la misma transaccion.
--   * Sin FK hacia "Tenant": sigue la convencion tenant-first del repositorio (solo
--     tenant_id TEXT, el aislamiento lo aplica el middleware de core/prisma.js).
--   * Sin FK cruzadas hacia "Party", "Account", "cnt_cabdoc" ni "ledger_entries":
--     igual que cnt_cuedoc y treasury_advances, se guardan snapshots de codigo
--     (account_code, concept_code, custodian_name) para que el documento contable sea
--     inmutable frente a cambios posteriores del maestro.
--   * Documentos inmutables: advances/vouchers/lines NO entran en SOFT_DELETE ni en
--     PHYSICAL_DELETE_ALLOWED. Se anulan por reverso (status = 'cancelled'), nunca se
--     borran. Solo los maestros (conceptos y cajas) tienen campo `active`.
--   * Fechas de negocio como TIMESTAMP(3), no DATE: el schema no usa @db.Date en ningun
--     modelo y un DATE forzado provocaria desfase UTC/Bogota al serializar. La semantica
--     de "fecha del gasto" se garantiza en la capa de aplicacion, igual que
--     cnt_cabdoc.posting_date.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1) Maestro de conceptos de egreso de caja menor
-- -------------------------------------------------------------------------------------
-- account_code debe resolver contra "Account" con type = 'expense' y allows_tx = true.
-- default_vat_code se valida contra Tenant.config.accounting.vat_masters (scope compras);
-- NULL significa "sin IVA sugerido", que NO es lo mismo que el maestro de IVA 0%:
-- el IVA real se decide linea a linea en petty_cash_voucher_lines.vat_code.
CREATE TABLE IF NOT EXISTS "petty_cash_concepts" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "account_id" INTEGER,
    "default_vat_code" TEXT,
    "advance_account_code" TEXT,
    "requires_supplier" BOOLEAN NOT NULL DEFAULT false,
    "requires_invoice_reference" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_concepts_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 2) Caja menor (ej. "Goliat")
-- -------------------------------------------------------------------------------------
-- account_code es la cuenta de activo que inicia por '11' (mismo criterio que usa
-- treasury/service.js para bancos). advance_account_code es la cuenta deudora del
-- anticipo al custodio, un activo '13xx' (PUC 1330 Anticipos y Avances).
-- require_advance obliga a digitar gastos unicamente contra anticipo;
-- block_unliquidated_advance impide girar un segundo anticipo mientras exista uno 'open'.
CREATE TABLE IF NOT EXISTS "petty_cash_boxes" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "account_id" INTEGER,
    "advance_account_code" TEXT NOT NULL,
    "custodian_party_id" INTEGER,
    "custodian_name" TEXT,
    "branch_code" TEXT,
    "cost_center_code" TEXT,
    "monthly_limit" DECIMAL(18,2),
    "require_advance" BOOLEAN NOT NULL DEFAULT false,
    "block_unliquidated_advance" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_boxes_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 3) Anticipos girados al custodio
-- -------------------------------------------------------------------------------------
-- Movimiento contable: debito advance_account_code / credito account_code de la caja.
-- balance = amount - applied_total; el anticipo pasa a 'liquidated' cuando los gastos lo
-- consumen y el sobrante (refund_amount) vuelve a la caja. shortfall_amount cubre el caso
-- inverso: el gasto supero el anticipo y la caja pone la diferencia.
-- accounting_document_id y reversal_accounting_document_id apuntan a cnt_cabdoc.id.
CREATE TABLE IF NOT EXISTS "petty_cash_advances" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "box_id" INTEGER NOT NULL,
    "document_type" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "full_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "custodian_party_id" INTEGER,
    "custodian_name" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "applied_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT,
    "accounting_document_id" INTEGER,
    "reversal_accounting_document_id" INTEGER,
    "liquidated_at" TIMESTAMP(3),
    "refund_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shortfall_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_advances_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 4) Cabecera del comprobante de gasto menor
-- -------------------------------------------------------------------------------------
-- period tiene formato 'YYYY-MM' y se valida contra el cierre de periodo contable
-- (accounting/service.js assertPeriodOpen). accounting_document_id enlaza el cnt_cabdoc
-- generado en la misma transaccion del guardado.
CREATE TABLE IF NOT EXISTS "petty_cash_vouchers" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "box_id" INTEGER NOT NULL,
    "advance_id" INTEGER,
    "document_type" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "full_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "posting_date" TIMESTAMP(3) NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "accounting_document_id" INTEGER,
    "reversal_accounting_document_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_vouchers_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 5) Lineas de gasto
-- -------------------------------------------------------------------------------------
-- account_code y vat_account_code son snapshot al momento de contabilizar, igual que
-- cnt_cuedoc.account_code. vat_code NULL = gasto sin IVA.
-- advance_applied es la porcion de la linea imputada al anticipo (reduce
-- petty_cash_advances.balance); el resto se acredita directamente contra la cuenta de la
-- caja. ledger_entry_id permite rastrear el asiento del libro mayor derivado.
CREATE TABLE IF NOT EXISTS "petty_cash_voucher_lines" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "voucher_id" INTEGER NOT NULL,
    "line_number" INTEGER NOT NULL,
    "concept_id" INTEGER NOT NULL,
    "concept_code" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost_center_code" TEXT,
    "branch_code" TEXT,
    "supplier_party_id" INTEGER,
    "invoice_reference" TEXT,
    "base_amount" DECIMAL(18,2) NOT NULL,
    "vat_code" TEXT,
    "vat_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_account_code" TEXT,
    "total" DECIMAL(18,2) NOT NULL,
    "advance_applied" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ledger_entry_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_voucher_lines_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- Indices (nombres derivados por Prisma desde el nombre mapeado de la tabla)
-- -------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "petty_cash_concepts_tenant_id_active_idx" ON "petty_cash_concepts"("tenant_id", "active");

CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_concepts_tenant_id_code_key" ON "petty_cash_concepts"("tenant_id", "code");

CREATE INDEX IF NOT EXISTS "petty_cash_boxes_tenant_id_active_idx" ON "petty_cash_boxes"("tenant_id", "active");

CREATE INDEX IF NOT EXISTS "petty_cash_boxes_tenant_id_active_name_idx" ON "petty_cash_boxes"("tenant_id", "active", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_boxes_tenant_id_code_key" ON "petty_cash_boxes"("tenant_id", "code");

CREATE INDEX IF NOT EXISTS "petty_cash_advances_tenant_id_box_id_status_idx" ON "petty_cash_advances"("tenant_id", "box_id", "status");

CREATE INDEX IF NOT EXISTS "petty_cash_advances_tenant_id_date_idx" ON "petty_cash_advances"("tenant_id", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_advances_tenant_id_document_type_number_key" ON "petty_cash_advances"("tenant_id", "document_type", "number");

CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_advances_tenant_id_full_number_key" ON "petty_cash_advances"("tenant_id", "full_number");

CREATE INDEX IF NOT EXISTS "petty_cash_vouchers_tenant_id_box_id_date_idx" ON "petty_cash_vouchers"("tenant_id", "box_id", "date");

CREATE INDEX IF NOT EXISTS "petty_cash_vouchers_tenant_id_period_idx" ON "petty_cash_vouchers"("tenant_id", "period");

CREATE INDEX IF NOT EXISTS "petty_cash_vouchers_tenant_id_advance_id_idx" ON "petty_cash_vouchers"("tenant_id", "advance_id");

CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_vouchers_tenant_id_document_type_number_key" ON "petty_cash_vouchers"("tenant_id", "document_type", "number");

CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_vouchers_tenant_id_full_number_key" ON "petty_cash_vouchers"("tenant_id", "full_number");

CREATE INDEX IF NOT EXISTS "petty_cash_voucher_lines_tenant_id_voucher_id_idx" ON "petty_cash_voucher_lines"("tenant_id", "voucher_id");

CREATE INDEX IF NOT EXISTS "petty_cash_voucher_lines_tenant_id_concept_code_idx" ON "petty_cash_voucher_lines"("tenant_id", "concept_code");

CREATE INDEX IF NOT EXISTS "petty_cash_voucher_lines_tenant_id_supplier_party_id_idx" ON "petty_cash_voucher_lines"("tenant_id", "supplier_party_id");

CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_voucher_lines_tenant_id_voucher_id_line_number_key" ON "petty_cash_voucher_lines"("tenant_id", "voucher_id", "line_number");

-- -------------------------------------------------------------------------------------
-- Foreign keys internas del modulo, protegidas para ejecucion repetible en QA.
-- ON DELETE RESTRICT en box_id: una caja con historia no se puede eliminar.
-- ON DELETE SET NULL en advance_id: liquidar/anular un anticipo no debe arrastrar el
--   comprobante ya contabilizado.
-- ON DELETE CASCADE en voucher_id: las lineas no tienen vida propia, pero en la practica
--   el middleware de core/prisma.js bloquea el borrado fisico del comprobante.
-- -------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'petty_cash_advances_box_id_fkey') THEN
    ALTER TABLE "petty_cash_advances" ADD CONSTRAINT "petty_cash_advances_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "petty_cash_boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'petty_cash_vouchers_box_id_fkey') THEN
    ALTER TABLE "petty_cash_vouchers" ADD CONSTRAINT "petty_cash_vouchers_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "petty_cash_boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'petty_cash_vouchers_advance_id_fkey') THEN
    ALTER TABLE "petty_cash_vouchers" ADD CONSTRAINT "petty_cash_vouchers_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "petty_cash_advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'petty_cash_voucher_lines_voucher_id_fkey') THEN
    ALTER TABLE "petty_cash_voucher_lines" ADD CONSTRAINT "petty_cash_voucher_lines_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "petty_cash_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- =====================================================================================
-- SIEMBRA DE CONCEPTOS (solo tenants existentes, idempotente)
-- =====================================================================================
-- RAZONAMIENTO DE LA DECISION:
--   SI se siembran conceptos de egreso: son un catalogo generico y estable del dominio
--   colombiano (peajes, combustible, alimentacion, parqueadero, utiles, viaje, tramites)
--   y dejan el modulo usable desde el primer dia. Sin el seed, T5/T6 tendrian que crear
--   maestros a mano en cada tenant antes de poder digitar un solo gasto.
--   NO se siembran cajas: una caja menor es especifica de cada empresa y exige custodio,
--   cuenta de activo y cuenta de anticipo validas; una caja inventada produciria
--   contabilizaciones inviables. Las cajas se crean por pantalla en T6.
--
-- GUARDAS DE SEGURIDAD DE LA SIEMBRA:
--   * Solo para tenants que YA tienen la cuenta 5395 ('Otros Gastos', la unica cuenta de
--     gasto generica del PUC simplificado de accounting/service.js) activa y con
--     allows_tx = true. Se resuelve via DISTINCT ON sobre "Account", asi account_id queda
--     poblado y no se genera maestro huerfano ni colgante.
--   * ON CONFLICT (tenant_id, code) DO NOTHING: reaplicar la migracion no duplica ni
--     sobrescribe conceptos que la empresa ya haya editado.
--   * NO se siembra para tenants creados despues: esos reciben el catalogo por pantalla o
--     por un seed posterior. Es aceptable porque un tenant nuevo aun no tiene plan de
--     cuentas cargado y la guarda anterior filtraria de todos modos.
--   * default_vat_code NULL en casi todos los conceptos: en Colombia peajes, alimentacion
--     y parqueaderos tipicamente no dan derecho a IVA descontable. Combustible si lleva
--     'COMPRAS-19'. NULL se interpreta como "sin IVA sugerido" y el usuario decide en la
--     linea; no fuerza un IVA 0%.
--   * advance_account_code NULL: se hereda de la caja (petty_cash_boxes), que es donde la
--     cuenta de anticipo tiene sentido operativo.
--
-- Nota: esta migracion NO crea ni altera "Account"; asume el plan de cuentas existente
-- creado por 20260602_accounting_inventory_purchases_payroll. Si un tenant no tiene la
-- cuenta 5395 util, simplemente no recibe conceptos (subconsulta vacia) y los creara por
-- pantalla.
INSERT INTO "petty_cash_concepts" (
    "tenant_id", "code", "name", "account_code", "account_id", "default_vat_code",
    "requires_supplier", "requires_invoice_reference", "notes", "updated_at"
)
SELECT
    acc.tenant_id,
    item.code,
    item.name,
    acc.code,
    acc.id,
    item.default_vat_code,
    item.requires_supplier,
    item.requires_invoice_reference,
    item.notes,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (a."tenant_id") a."tenant_id", a."id", a."code"
    FROM "Account" a
    WHERE a."code" = '5395'
      AND a."type" = 'expense'
      AND a."active" = true
      AND a."allows_tx" = true
    ORDER BY a."tenant_id", a."id"
) AS acc
CROSS JOIN (VALUES
    ('PEAJES',          'Peajes',                          NULL,          false, false, 'Concepto sugerido por APEXOS; editable por la empresa.'),
    ('COMBUSTIBLE',     'Combustible y lubricantes',       'COMPRAS-19',  true,  true,  'Concepto sugerido por APEXOS; editable por la empresa.'),
    ('ALIMENTACION',    'Alimentacion',                    NULL,          false, false, 'Concepto sugerido por APEXOS; editable por la empresa.'),
    ('ESTACIONAMIENTO', 'Estacionamiento y parqueaderos',  NULL,          false, false, 'Concepto sugerido por APEXOS; editable por la empresa.'),
    ('UTILES',          'Utiles y elementos de oficina',   NULL,          false, true,  'Concepto sugerido por APEXOS; editable por la empresa.'),
    ('GASTOS_VIAJE',    'Gastos de viaje y viaticos',      NULL,          false, false, 'Concepto sugerido por APEXOS; editable por la empresa.'),
    ('TRAMITES',        'Notaria y tramites',              NULL,          false, true,  'Concepto sugerido por APEXOS; editable por la empresa.')
) AS item(code, name, default_vat_code, requires_supplier, requires_invoice_reference, notes)
ON CONFLICT ("tenant_id", "code") DO NOTHING;
