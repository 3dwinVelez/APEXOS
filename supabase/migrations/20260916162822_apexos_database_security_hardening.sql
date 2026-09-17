-- APEXOS database security baseline.
--
-- This migration intentionally does not mutate every table in public. Tables
-- without RLS are reported so their access contract can be reviewed without
-- unexpectedly cutting existing Data API traffic. Only the explicit backend-
-- owned allowlist below is quarantined from client roles.

do $inventory$
declare
  target record;
begin
  for target in
    select c.relname as relation_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
    order by c.relname
  loop
    raise notice 'SECURITY INVENTORY: public.% has RLS disabled; no privileges were changed',
      target.relation_name;
  end loop;
end
$inventory$;

-- These tables are served exclusively through the authenticated APEXOS API.
-- Prisma is their schema owner; direct anon/authenticated Data API access is
-- deliberately denied. Missing tables are skipped so runner order is safe.
do $backend_owned_allowlist$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'apex_heart_configs',
    'apex_heart_alert_rules',
    'apex_heart_alerts',
    'apex_heart_inventory_snapshots',
    'apex_heart_report_schedules'
  ]
  loop
    if pg_catalog.to_regclass(format('public.%I', relation_name)) is not null then
      execute format('alter table public.%I enable row level security', relation_name);
      execute format(
        'revoke all privileges on table public.%I from anon, authenticated',
        relation_name
      );
    end if;
  end loop;
end
$backend_owned_allowlist$;

-- Trigger functions do not need an exposed or mutable search path.
do $function_hardening$
begin
  if pg_catalog.to_regprocedure('public.touch_master_catalog_updated_at()') is not null then
    alter function public.touch_master_catalog_updated_at() set search_path = '';
  end if;

  if pg_catalog.to_regprocedure('public.apexos_reject_correction_change_mutation()') is not null then
    alter function public.apexos_reject_correction_change_mutation() set search_path = '';
  end if;

  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;

  if pg_catalog.to_regprocedure(
    'public.create_public_service_order(uuid,text,text,text,text,text,text,jsonb)'
  ) is not null then
    comment on function public.create_public_service_order(uuid, text, text, text, text, text, text, jsonb)
    is 'Intentional public preorder RPC. SECURITY DEFINER and anon execution require abuse-control and tenant-isolation certification before promotion.';
  end if;
end
$function_hardening$;
