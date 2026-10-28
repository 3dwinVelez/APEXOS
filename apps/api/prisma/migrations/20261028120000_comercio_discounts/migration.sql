-- Comercio (M-30): descuentos parametrizables y curaduria de la vitrina publica.
-- comercio_products: discount_percent es el descuento del producto sobre su precio de
-- lista (el precio nunca se reescribe, el descuento se deriva); catalog_featured marca
-- los productos que encabezan los rieles de la vitrina.
ALTER TABLE "comercio_products" ADD COLUMN IF NOT EXISTS "discount_percent" NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "comercio_products" ADD COLUMN IF NOT EXISTS "catalog_featured" BOOLEAN NOT NULL DEFAULT false;

-- comercio_settings: campana de descuento de toda la tienda con etiqueta y vigencia.
-- Compite con el descuento del producto: la vitrina y el mostrador aplican el mayor.
-- catalog_tagline es el eslogan corto que se muestra en el hero de la vitrina.
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_tagline" TEXT;
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_promo_label" TEXT;
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_promo_percent" NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_promo_start" TIMESTAMP(3);
ALTER TABLE "comercio_settings" ADD COLUMN IF NOT EXISTS "catalog_promo_end" TIMESTAMP(3);
