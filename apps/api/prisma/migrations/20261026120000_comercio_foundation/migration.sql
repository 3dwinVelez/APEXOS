-- =====================================================================================
-- COMERCIO (M-30) - Capa de datos fundacional del modulo aislado de comercio
-- =====================================================================================
-- Respalda el contrato Prisma ComercioProduct / ComercioCustomer / ComercioSale /
-- ComercioSaleItem / ComercioCredit / ComercioInstallment / ComercioPayment /
-- ComercioPurchase / ComercioExpense / ComercioStockMovement / ComercioSettings.
--
-- DDL verbatim de `prisma migrate diff` entre HEAD y el schema con los modelos nuevos,
-- para que los nombres de indices, constraints y claves queden identicos a los que
-- Prisma derivaria (y a los que espera el cliente de Prisma en runtime).
--
-- La migracion es IDEMPOTENTE a proposito: se puede reaplicar en QA local sin efectos
-- secundarios (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, foreign keys
-- protegidas con pg_constraint).
--
-- DECISIONES DE DISENO (no renegociables por tareas posteriores):
--   * MODULO AISLADO: Comercio es la herramienta de un pequeno comerciante y NO se
--     mescla con los datos del ERP. No existe ninguna FK hacia "Product", "Party",
--     "Account", "cnt_*" ni tablas de otros modulos. El unico vinculo externo es
--     tenant_id TEXT (convencion tenant-first; el aislamiento lo aplica
--     core/prisma.js via runWithTenant).
--   * Snapshots de nombre (product_name, customer_name) en documentos: al eliminar o
--     renombrar un maestro, el historial de ventas/compras/movimientos sigue legible.
--   * Documentos (ventas, creditos, cuotas, abonos, compras, gastos) NO se borran
--     fisicamente: se anulan por estado (status = 'voided'). Solo los maestros
--     (productos, clientes) tienen `active` para desactivar.
--   * Inventario en libro: todo cambio de stock de comercio_products queda trazado en
--     comercio_stock_movements con stock_before/stock_after en la misma transaccion.
--   * Costeo: costo promedio ponderado, recalculado en cada compra dentro de la misma
--     transaccion; cada venta congela su unit_cost (margen historico inmutable).
--   * Cuotas sin interes: el cronograma se genera en la aplicacion (semanal/quincenal/
--     mensual); la ultima cuota absorbe el redondeo para que la suma cierre exacta.
--   * Fechas de negocio como TIMESTAMP(3), no DATE: el schema no usa @db.Date en ningun
--     modelo y un DATE forzado provocaria desfase UTC/Bogota al serializar.
--   * preferences_json en comercio_settings guarda SOLO preferencias visuales del
--     usuario (tema, colores, densidad); nunca datos del negocio.
--   * Sin siembra de maestros: productos y clientes son especificos de cada comercio;
--     una siembra inventada contaminaria el catalogo del comerciante. El modulo arranca
--     vacio y se llena por pantalla.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1) Producto del catalogo propio del comerciante
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "comercio_products" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "price" DECIMAL(18,2) NOT NULL,
    "cost" DECIMAL(18,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "photo_path" TEXT,
    "photo_mime" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_products_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 2) Cliente de mostrador
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "comercio_customers" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_customers_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 3) Venta de mostrador (cabecera)
-- -------------------------------------------------------------------------------------
-- payment_type: 'cash' | 'credit'. status: 'active' | 'voided'.
-- cost_total = snapshot del costo promedio ponderado al momento de vender.
CREATE TABLE IF NOT EXISTS "comercio_sales" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "full_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customer_id" INTEGER,
    "customer_name" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "cost_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payment_type" TEXT NOT NULL,
    "method" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_sales_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 4) Lineas de venta (snapshot de producto y costo unitario)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "comercio_sale_items" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product_id" INTEGER,
    "product_code" TEXT,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "comercio_sale_items_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 5) Credito nacido de una venta a credito (cartera)
-- -------------------------------------------------------------------------------------
-- financed_amount = total - down_payment. frequency: 'weekly' | 'biweekly' | 'monthly'.
-- status: 'open' | 'paid' | 'voided'. La mora se deriva (cuota vencida no pagada).
CREATE TABLE IF NOT EXISTS "comercio_credits" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "full_number" TEXT NOT NULL,
    "sale_id" INTEGER,
    "customer_id" INTEGER NOT NULL,
    "customer_name" TEXT NOT NULL,
    "financed_amount" DECIMAL(18,2) NOT NULL,
    "down_payment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "installment_count" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL,
    "first_due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_credits_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 6) Cuotas del cronograma
-- -------------------------------------------------------------------------------------
-- paid_amount acumula abonos; status: 'open' | 'partial' | 'paid'.
CREATE TABLE IF NOT EXISTS "comercio_installments" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "credit_id" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_installments_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 7) Abonos recibidos sobre creditos
-- -------------------------------------------------------------------------------------
-- allocations = snapshot {installment_id: monto} del reparto oldest-first del abono.
CREATE TABLE IF NOT EXISTS "comercio_payments" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "credit_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "created_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercio_payments_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 8) Compras de mercancia (actualizan costo promedio y stock via servicio)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "comercio_purchases" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "full_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "product_id" INTEGER,
    "product_code" TEXT,
    "product_name" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_purchases_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 9) Gastos operativos del negocio
-- -------------------------------------------------------------------------------------
-- status: 'active' | 'voided' (los gastos no se borran, se anulan).
CREATE TABLE IF NOT EXISTS "comercio_expenses" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "full_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "concept" TEXT NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_expenses_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 10) Libro de movimientos de inventario
-- -------------------------------------------------------------------------------------
-- reason: 'initial' | 'purchase' | 'sale' | 'sale_void' | 'adjustment'.
CREATE TABLE IF NOT EXISTS "comercio_stock_movements" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" INTEGER,
    "product_code" TEXT,
    "product_name" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "stock_before" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercio_stock_movements_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- 11) Perfil operativo del comercio por tenant (1 fila)
-- -------------------------------------------------------------------------------------
-- preferences_json: solo preferencias visuales, separadas de los datos del negocio.
CREATE TABLE IF NOT EXISTS "comercio_settings" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "store_name" TEXT NOT NULL DEFAULT 'Mi negocio',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "receipt_note" TEXT,
    "preferences_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_settings_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------------------------------
-- Indices (nombres derivados por Prisma desde el nombre mapeado de la tabla)
-- -------------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "comercio_products_tenant_id_code_key" ON "comercio_products"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "comercio_products_tenant_id_active_idx" ON "comercio_products"("tenant_id", "active");
CREATE INDEX IF NOT EXISTS "comercio_products_tenant_id_active_name_idx" ON "comercio_products"("tenant_id", "active", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_customers_tenant_id_code_key" ON "comercio_customers"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "comercio_customers_tenant_id_active_name_idx" ON "comercio_customers"("tenant_id", "active", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_sales_tenant_id_number_key" ON "comercio_sales"("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "comercio_sales_tenant_id_full_number_key" ON "comercio_sales"("tenant_id", "full_number");
CREATE INDEX IF NOT EXISTS "comercio_sales_tenant_id_date_idx" ON "comercio_sales"("tenant_id", "date");
CREATE INDEX IF NOT EXISTS "comercio_sales_tenant_id_status_date_idx" ON "comercio_sales"("tenant_id", "status", "date");
CREATE INDEX IF NOT EXISTS "comercio_sales_tenant_id_customer_id_idx" ON "comercio_sales"("tenant_id", "customer_id");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_sale_items_tenant_id_sale_id_line_number_key" ON "comercio_sale_items"("tenant_id", "sale_id", "line_number");
CREATE INDEX IF NOT EXISTS "comercio_sale_items_tenant_id_sale_id_idx" ON "comercio_sale_items"("tenant_id", "sale_id");
CREATE INDEX IF NOT EXISTS "comercio_sale_items_tenant_id_product_id_idx" ON "comercio_sale_items"("tenant_id", "product_id");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_credits_tenant_id_number_key" ON "comercio_credits"("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "comercio_credits_tenant_id_full_number_key" ON "comercio_credits"("tenant_id", "full_number");
CREATE INDEX IF NOT EXISTS "comercio_credits_tenant_id_customer_id_idx" ON "comercio_credits"("tenant_id", "customer_id");
CREATE INDEX IF NOT EXISTS "comercio_credits_tenant_id_status_idx" ON "comercio_credits"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "comercio_credits_tenant_id_sale_id_idx" ON "comercio_credits"("tenant_id", "sale_id");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_installments_tenant_id_credit_id_number_key" ON "comercio_installments"("tenant_id", "credit_id", "number");
CREATE INDEX IF NOT EXISTS "comercio_installments_tenant_id_credit_id_idx" ON "comercio_installments"("tenant_id", "credit_id");
CREATE INDEX IF NOT EXISTS "comercio_installments_tenant_id_due_date_idx" ON "comercio_installments"("tenant_id", "due_date");

CREATE INDEX IF NOT EXISTS "comercio_payments_tenant_id_credit_id_idx" ON "comercio_payments"("tenant_id", "credit_id");
CREATE INDEX IF NOT EXISTS "comercio_payments_tenant_id_date_idx" ON "comercio_payments"("tenant_id", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_purchases_tenant_id_number_key" ON "comercio_purchases"("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "comercio_purchases_tenant_id_full_number_key" ON "comercio_purchases"("tenant_id", "full_number");
CREATE INDEX IF NOT EXISTS "comercio_purchases_tenant_id_date_idx" ON "comercio_purchases"("tenant_id", "date");
CREATE INDEX IF NOT EXISTS "comercio_purchases_tenant_id_product_id_idx" ON "comercio_purchases"("tenant_id", "product_id");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_expenses_tenant_id_number_key" ON "comercio_expenses"("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "comercio_expenses_tenant_id_full_number_key" ON "comercio_expenses"("tenant_id", "full_number");
CREATE INDEX IF NOT EXISTS "comercio_expenses_tenant_id_date_idx" ON "comercio_expenses"("tenant_id", "date");
CREATE INDEX IF NOT EXISTS "comercio_expenses_tenant_id_status_date_idx" ON "comercio_expenses"("tenant_id", "status", "date");

CREATE INDEX IF NOT EXISTS "comercio_stock_movements_tenant_id_product_id_occurred_at_idx" ON "comercio_stock_movements"("tenant_id", "product_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "comercio_stock_movements_tenant_id_occurred_at_idx" ON "comercio_stock_movements"("tenant_id", "occurred_at");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_settings_tenant_id_key" ON "comercio_settings"("tenant_id");

-- -------------------------------------------------------------------------------------
-- Foreign keys internas del modulo (solo dentro de comercio_*), protegidas para
-- ejecucion repetible en QA.
-- ON DELETE CASCADE: las lineas/cuotas/abonos no tienen vida propia fuera de su
-- documento padre. En la practica el servicio nunca borra documentos: los anula por
-- estado, y el middleware de core/prisma.js bloquea el borrado fisico.
-- -------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comercio_sale_items_sale_id_fkey') THEN
    ALTER TABLE "comercio_sale_items" ADD CONSTRAINT "comercio_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "comercio_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comercio_installments_credit_id_fkey') THEN
    ALTER TABLE "comercio_installments" ADD CONSTRAINT "comercio_installments_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "comercio_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comercio_payments_credit_id_fkey') THEN
    ALTER TABLE "comercio_payments" ADD CONSTRAINT "comercio_payments_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "comercio_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
