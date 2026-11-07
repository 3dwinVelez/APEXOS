-- Comercio (M-30): vitrina publica por codigo corto + ingreso distinto de ventas.
-- comercio_settings: catalog_enabled activa la vitrina; catalog_code es el link corto
-- revocable/regenerable (unico a nivel global para poder resolverlo sin exponer tenant);
-- catalog_whatsapp es el numero destino del boton de pedido.
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_code" TEXT;
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_whatsapp" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_settings_catalog_code_key" ON "comercio_settings" ("catalog_code");

-- comercio_expenses: direction separa egresos operativos ("expense") de ingresos
-- fuera del catalogo ("income": recargas, servicios cobrados por fuera de ventas).
ALTER TABLE "comercio_expenses" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'expense';
