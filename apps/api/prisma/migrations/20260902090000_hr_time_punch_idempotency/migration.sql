ALTER TABLE "TimePunch"
ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "TimePunch_tenant_id_idempotency_key_key"
ON "TimePunch"("tenant_id", "idempotency_key");

DO $$
BEGIN
  IF to_regclass('public.time_punches') IS NOT NULL THEN
    ALTER TABLE public.time_punches ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS time_punches_company_idempotency_key_unique
      ON public.time_punches(company_id, idempotency_key);
  END IF;
END $$;
