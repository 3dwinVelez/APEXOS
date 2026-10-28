-- =====================================================================================
-- COMERCIO (M-30) - Promociones y campanas con audiencia
-- =====================================================================================
-- Respald a los modelos ComercioPromotion / ComercioPromotionCategory /
-- ComercioPromotionProduct / ComercioPromotionSend.
--
-- La campana unica que vivia en comercio_settings (catalog_promo_*) pasa a ser una
-- promocion mas: se permiten varias simultaneas, segmentadas por categorias o
-- productos, con borrador/pausa/archivo y bitacora de envio por cliente.
--
-- Reglas de precio (aplicadas por el servicio, no por la base):
--   * El cliente paga el mejor precio: el mayor entre el descuento propio del producto
--     y el de las promociones que le aplican. Los descuentos NUNCA se suman.
--   * La vitrina y el mostrador usan la misma regla.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, FKs protegidas con pg_constraint e
-- insercion de la campana heredada condicionada a que no exista ya.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS "comercio_promotions" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "percent" DECIMAL(5,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "message" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercio_promotions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "comercio_promotion_categories" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "comercio_promotion_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "comercio_promotion_products" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_code" TEXT,

    CONSTRAINT "comercio_promotion_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "comercio_promotion_sends" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "customer_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercio_promotion_sends_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "comercio_promotions_tenant_id_status_idx" ON "comercio_promotions"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "comercio_promotions_tenant_id_start_date_idx" ON "comercio_promotions"("tenant_id", "start_date");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_promotion_categories_tenant_id_promotion_id_category_key" ON "comercio_promotion_categories"("tenant_id", "promotion_id", "category");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_promotion_products_tenant_id_promotion_id_product_id_key" ON "comercio_promotion_products"("tenant_id", "promotion_id", "product_id");

CREATE UNIQUE INDEX IF NOT EXISTS "comercio_promotion_sends_tenant_id_promotion_id_customer_id_key" ON "comercio_promotion_sends"("tenant_id", "promotion_id", "customer_id");
CREATE INDEX IF NOT EXISTS "comercio_promotion_sends_tenant_id_promotion_id_sent_at_idx" ON "comercio_promotion_sends"("tenant_id", "promotion_id", "sent_at");

-- Las filas hijas no tienen vida propia: caen con su promocion.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comercio_promotion_categories_promotion_id_fkey') THEN
    ALTER TABLE "comercio_promotion_categories" ADD CONSTRAINT "comercio_promotion_categories_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "comercio_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comercio_promotion_products_promotion_id_fkey') THEN
    ALTER TABLE "comercio_promotion_products" ADD CONSTRAINT "comercio_promotion_products_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "comercio_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comercio_promotion_sends_promotion_id_fkey') THEN
    ALTER TABLE "comercio_promotion_sends" ADD CONSTRAINT "comercio_promotion_sends_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "comercio_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- Campana heredada: solo se migra si tenia descuento real (> 0%). Una etiqueta sin
-- porcentaje no descontaba nada y no amerita una promocion activa.
-- -------------------------------------------------------------------------------------
INSERT INTO "comercio_promotions"
  ("tenant_id", "name", "scope", "percent", "status", "start_date", "end_date", "message", "created_at", "updated_at")
SELECT
  s."tenant_id",
  COALESCE(NULLIF(BTRIM(s."catalog_promo_label"), ''), 'Promocion de la vitrina'),
  'all',
  s."catalog_promo_percent",
  'active',
  s."catalog_promo_start",
  s."catalog_promo_end",
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "comercio_settings" s
WHERE s."catalog_promo_percent" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "comercio_promotions" p
    WHERE p."tenant_id" = s."tenant_id"
      AND p."name" = COALESCE(NULLIF(BTRIM(s."catalog_promo_label"), ''), 'Promocion de la vitrina')
      AND p."percent" = s."catalog_promo_percent"
  );

-- La configuracion deja de ser el lugar de las campanas.
ALTER TABLE "comercio_settings" DROP COLUMN IF EXISTS "catalog_promo_label";
ALTER TABLE "comercio_settings" DROP COLUMN IF EXISTS "catalog_promo_percent";
ALTER TABLE "comercio_settings" DROP COLUMN IF EXISTS "catalog_promo_start";
ALTER TABLE "comercio_settings" DROP COLUMN IF EXISTS "catalog_promo_end";
