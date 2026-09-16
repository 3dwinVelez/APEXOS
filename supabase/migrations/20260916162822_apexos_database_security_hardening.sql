-- APEXOS database security baseline.
--
-- This migration is intentionally deny-by-default. Existing tables that were
-- created in the exposed public schema without RLS are quarantined from client
-- roles. Legitimate Data API access must be restored explicitly with both a
-- role grant and an operation-specific RLS policy.

do $hardening$
declare
  target record;
begin
  for target in
    select n.nspname as schema_name, c.relname as relation_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
    order by c.relname
  loop
    execute format(
      'alter table %I.%I enable row level security',
      target.schema_name,
      target.relation_name
    );
    execute format(
      'revoke all privileges on table %I.%I from anon, authenticated',
      target.schema_name,
      target.relation_name
    );
  end loop;
end
$hardening$;

-- New tables and functions must opt in to client access explicitly.
alter default privileges in schema public
  revoke all privileges on tables from anon, authenticated;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Trigger functions do not need an exposed or mutable search path.
do $hardening$
begin
  if pg_catalog.to_regprocedure('public.touch_master_catalog_updated_at()') is not null then
    alter function public.touch_master_catalog_updated_at() set search_path = '';
  end if;

  if pg_catalog.to_regprocedure('public.apexos_reject_correction_change_mutation()') is not null then
    alter function public.apexos_reject_correction_change_mutation() set search_path = '';
  end if;

  -- This production-only helper is not part of the versioned APEXOS API.
  -- Keep it available to privileged maintenance roles while removing client
  -- execution until its definition and lifecycle are formally versioned.
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$hardening$;

comment on function public.create_public_service_order(uuid, text, text, text, text, text, text, jsonb)
is 'Intentional public preorder RPC. SECURITY DEFINER and anon execution require abuse-control and tenant-isolation certification before promotion.';
