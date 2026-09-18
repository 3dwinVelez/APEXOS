-- Apex Heart database objects are owned exclusively by the Prisma migration
-- 20260907023000_apex_heart_foundation. This Supabase migration is limited to
-- catalog registration and a compatibility guard; it must never create a
-- second, incompatible company_id-based representation of the same tables.

do $apex_heart_contract$
declare
  target text;
begin
  foreach target in array array[
    'apex_heart_configs',
    'apex_heart_alert_rules',
    'apex_heart_alerts',
    'apex_heart_inventory_snapshots'
  ]
  loop
    if pg_catalog.to_regclass(format('public.%I', target)) is not null
       and not exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = target
           and column_name = 'tenant_id'
           and data_type = 'text'
       ) then
      raise exception
        'Apex Heart contract mismatch on public.%: expected tenant_id text owned by Prisma',
        target;
    end if;
  end loop;
end
$apex_heart_contract$;

insert into public.modules (code, name, description, route, icon, is_active, sort_order, visibility_scope)
values ('apex_heart', 'Apex Heart', 'Control gerencial transversal de productividad, margen, inventario, compras, ventas, cartera y caja.', '/dashboard/reportes/apex-heart', 'heart-pulse', true, 20, 'tenant')
on conflict (code) do update set name=excluded.name, description=excluded.description, route=excluded.route, icon=excluded.icon, is_active=true, sort_order=excluded.sort_order;

insert into public.plan_modules (plan_id, module_id, enabled)
select p.id, m.id, true from public.plans p join public.modules m on m.code='apex_heart'
on conflict (plan_id, module_id) do update set enabled=true;

insert into public.company_modules (company_id, module_id, enabled, source)
select c.id, m.id, true, 'plan' from public.companies c join public.modules m on m.code='apex_heart'
on conflict (company_id, module_id) do update set enabled=true;
