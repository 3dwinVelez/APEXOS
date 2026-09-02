alter table public.time_punches
  add column if not exists idempotency_key text;

create unique index if not exists time_punches_company_idempotency_key_unique
  on public.time_punches(company_id, idempotency_key);
