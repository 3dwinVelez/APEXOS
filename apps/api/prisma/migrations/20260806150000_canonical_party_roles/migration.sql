-- Additive transition: keep Party.type and Party.balance for legacy consumers.
ALTER TABLE "Party"
  ADD COLUMN "receivable_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "payable_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "Party"
SET
  "receivable_balance" = CASE WHEN "type" = 'customer' THEN "balance" ELSE 0 END,
  "payable_balance" = CASE WHEN "type" = 'supplier' THEN "balance" ELSE 0 END,
  "metadata" = jsonb_set(
    COALESCE("metadata", '{}'::jsonb),
    ARRAY['role_flags', "type"],
    'true'::jsonb,
    true
  )
WHERE "type" IN ('customer', 'supplier', 'employee');
