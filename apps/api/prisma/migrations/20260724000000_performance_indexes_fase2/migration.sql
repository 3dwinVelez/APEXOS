-- Migración: Índices de rendimiento Fase 2
-- Fecha: 2026-07-24
-- Propósito: Agregar índices compuestos y trigram faltantes identificados en el análisis crítico.
-- Ejecutar con: npx prisma migrate deploy
-- O manualmente: psql -f migration.sql (con precaución en producción, usar CONCURRENTLY si es posible)

-- 1. Movement: índice para búsquedas por transaction_id (kardex joins)
CREATE INDEX IF NOT EXISTS "Movement_tenant_id_transaction_id_idx"
  ON "Movement"("tenant_id", "transaction_id");

-- 2. Movement: índice para búsquedas por rango de fecha (kardex time-range queries)
CREATE INDEX IF NOT EXISTS "Movement_tenant_id_created_at_idx"
  ON "Movement"("tenant_id", "created_at");

-- 3. Item: índice trigram para búsqueda textual por nombre (listItems con contains insensitive)
-- Requiere extensión pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Item_tenant_id_name_trgm_idx"
  ON "Item" USING gin ("name" gin_trgm_ops);

-- 4. Item: índice trigram para búsqueda textual por código
CREATE INDEX IF NOT EXISTS "Item_tenant_id_code_trgm_idx"
  ON "Item" USING gin ("code" gin_trgm_ops);

-- 5. Item: índice compuesto para alertas de stock mínimo
CREATE INDEX IF NOT EXISTS "Item_tenant_id_stock_current_stock_min_idx"
  ON "Item"("tenant_id", "stock_current", "stock_min");

-- 6. ServiceReference: índice trigram para búsqueda textual por código
CREATE INDEX IF NOT EXISTS "ServiceReference_tenant_id_code_trgm_idx"
  ON "ServiceReference" USING gin ("code" gin_trgm_ops);

-- 7. ServiceReference: índice trigram para búsqueda textual por nombre
CREATE INDEX IF NOT EXISTS "ServiceReference_tenant_id_name_trgm_idx"
  ON "ServiceReference" USING gin ("name" gin_trgm_ops);

-- 8. CxpCabdoc: índice para filtrado por estado
CREATE INDEX IF NOT EXISTS "cxp_cabdoc_tenant_id_status_idx"
  ON "cxp_cabdoc"("tenant_id", "status");

-- 9. Payroll: índice compuesto para búsqueda por empleado y período
CREATE INDEX IF NOT EXISTS "Payroll_tenant_id_employee_id_period_idx"
  ON "Payroll"("tenant_id", "employee_id", "period");

-- 10. WorkActivity: índice para consultas por línea de tiempo
CREATE INDEX IF NOT EXISTS "WorkActivity_tenant_id_occurred_at_idx"
  ON "WorkActivity"("tenant_id", "occurred_at");

-- 11. ServiceOrder: índice para búsqueda por reference_id
CREATE INDEX IF NOT EXISTS "ServiceOrder_tenant_id_reference_id_idx"
  ON "ServiceOrder"("tenant_id", "reference_id");

-- 12. TimePunch: índice adicional para procesamiento batch diario
CREATE INDEX IF NOT EXISTS "TimePunch_tenant_id_date_idx"
  ON "TimePunch"("tenant_id", "date");

-- 13. LedgerEntry: índice compuesto para balance sheets (cubre account_id + date + period)
-- (LedgerEntry_tenant_id_account_id_date_idx ya existe, agregamos variante con period)
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenant_id_account_id_period_idx"
  ON "LedgerEntry"("tenant_id", "account_id", "period");
