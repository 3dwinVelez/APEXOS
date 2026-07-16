-- Align the platform contract: an active user with an active module and matching RLS
-- policy must not receive empty data only because the SQL role is missing table grants.
-- Physical delete remains an explicit application permission: delete_physical_records.

grant usage on schema public to authenticated, service_role;
grant usage on schema app_private to authenticated, service_role;

do $$
declare
  table_name text;
  table_reg regclass;
  has_rls boolean;
begin
  foreach table_name in array array[
    'public.companies',
    'public.profiles',
    'public.company_users',
    'public.company_modules',
    'public.employees',
    'public.services',
    'public.master_catalogs',
    'public.master_catalog_items',
    'public.service_references',
    'public.service_reference_parts',
    'public.vehicles',
    'public.vehicle_documents',
    'public.vehicle_master_audit_log',
    'public.operational_routes',
    'public.route_assignments',
    'public.route_preoperational_checklists',
    'public.route_preoperational_checklist_answers',
    'public.route_preoperational_checklist_evidence',
    'public.route_preoperational_findings',
    'public.route_start_authorizations',
    'public.route_block_events',
    'public.time_punches',
    'public.gps_pings',
    'public.service_orders',
    'public.service_incidents',
    'public.service_evidence',
    'public.user_master_documents',
    'public.user_master_audit_events',
    'public."WorkSession"',
    'public."ActivityType"',
    'public."WorkActivity"',
    'public."ActivityEvidence"',
    'public."Project"',
    'public."ProjectCommitment"',
    'public."ProjectDeliverable"',
    'public."ProjectRisk"',
    'public."ProjectResourceAssignment"',
    'public."ProjectComment"',
    'public."ProjectEvidence"',
    'public."ProjectAlert"',
    'public."ProjectLog"'
  ] loop
    table_reg := to_regclass(table_name);
    if table_reg is not null then
      select c.relrowsecurity into has_rls
      from pg_class c
      where c.oid = table_reg;
      if has_rls then
        execute format('grant select on table %s to authenticated', table_reg);
      end if;
      execute format('grant select on table %s to service_role', table_reg);
      execute format('grant insert, update, delete on table %s to service_role', table_reg);
    end if;
  end loop;
end $$;

update public.company_users cu
set role = case
  when lower(coalesce(e.metadata ->> 'role_name', e.metadata #>> '{access,role_name}', '')) like '%owner%'
    or lower(coalesce(e.metadata ->> 'role_type', e.metadata #>> '{access,role_type}', '')) like '%owner%'
    then 'owner'
  when lower(coalesce(e.metadata ->> 'role_name', e.metadata #>> '{access,role_name}', '')) like any (array['%admin%', '%coordinador%'])
    or lower(coalesce(e.metadata ->> 'role_type', e.metadata #>> '{access,role_type}', '')) like any (array['%admin%', '%superadmin%', '%coordinador%', '%soporte%'])
    or coalesce((e.metadata #>> '{permissions,usuarios,manage_users}')::boolean, false)
    or coalesce((e.metadata #>> '{permissions,roles,manage_roles}')::boolean, false)
    or coalesce((e.metadata #>> '{permissions,configuracion,administer}')::boolean, false)
    or coalesce((e.metadata #>> '{permissions,configuracion,configure}')::boolean, false)
    then 'admin'
  when lower(coalesce(e.metadata ->> 'role_name', e.metadata #>> '{access,role_name}', '')) like any (array['%viewer%', '%consulta%'])
    or lower(coalesce(e.metadata ->> 'role_type', e.metadata #>> '{access,role_type}', '')) like '%lectura%'
    then 'viewer'
  else coalesce(nullif(cu.role, ''), 'member')
end
from public.employees e
where e.company_id = cu.company_id
  and e.user_id = cu.user_id
  and coalesce(e.status, 'active') = 'active'
  and cu.role is distinct from case
    when lower(coalesce(e.metadata ->> 'role_name', e.metadata #>> '{access,role_name}', '')) like '%owner%'
      or lower(coalesce(e.metadata ->> 'role_type', e.metadata #>> '{access,role_type}', '')) like '%owner%'
      then 'owner'
    when lower(coalesce(e.metadata ->> 'role_name', e.metadata #>> '{access,role_name}', '')) like any (array['%admin%', '%coordinador%'])
      or lower(coalesce(e.metadata ->> 'role_type', e.metadata #>> '{access,role_type}', '')) like any (array['%admin%', '%superadmin%', '%coordinador%', '%soporte%'])
      or coalesce((e.metadata #>> '{permissions,usuarios,manage_users}')::boolean, false)
      or coalesce((e.metadata #>> '{permissions,roles,manage_roles}')::boolean, false)
      or coalesce((e.metadata #>> '{permissions,configuracion,administer}')::boolean, false)
      or coalesce((e.metadata #>> '{permissions,configuracion,configure}')::boolean, false)
      then 'admin'
    when lower(coalesce(e.metadata ->> 'role_name', e.metadata #>> '{access,role_name}', '')) like any (array['%viewer%', '%consulta%'])
      or lower(coalesce(e.metadata ->> 'role_type', e.metadata #>> '{access,role_type}', '')) like '%lectura%'
      then 'viewer'
    else coalesce(nullif(cu.role, ''), 'member')
  end;
