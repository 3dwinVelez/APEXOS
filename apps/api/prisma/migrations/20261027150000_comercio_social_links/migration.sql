-- Vitrina publica: enlaces de redes sociales configurables (Facebook e Instagram).
-- El WhatsApp de pedidos ya existe en catalog_whatsapp. Se suman dos columnas de texto
-- nulables para que el comercio publique sus perfiles en la vitrina publica.
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_facebook" TEXT;
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_instagram" TEXT;
