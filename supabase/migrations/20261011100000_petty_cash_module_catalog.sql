-- Publish M-29 (Gastos Menores / Cajas Menores) in the tenant module catalog used by APEX
-- platform administration. Mirrors 20260903100000_commercial_management_module_catalog.sql:
-- the module is catalogued neutral (disabled by default) and a platform administrator enables
-- it per company from Administracion APEX.

insert into public.modules (code, name, description, route, icon, is_active, sort_order, visibility_scope)
values (
  'gastos_menores',
  'Gastos Menores',
  'Cajas menores con conceptos de egreso, anticipos al custodio y comprobantes de gasto contabilizados al momento.',
  '/dashboard/gastos-menores',
  'wallet',
  true,
  285,
  'tenant'
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  icon = excluded.icon,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  visibility_scope = excluded.visibility_scope;

insert into public.plan_modules (plan_id, module_id, enabled)
select p.id, m.id, false
from public.plans p
join public.modules m on m.code = 'gastos_menores'
on conflict (plan_id, module_id) do nothing;

insert into public.company_modules (company_id, module_id, enabled, source)
select
  c.id,
  m.id,
  coalesce(pm.enabled, false),
  case when pm.plan_id is null then 'manual' else 'plan' end
from public.companies c
join public.modules m on m.code = 'gastos_menores'
left join public.plan_modules pm on pm.plan_id = c.plan_id and pm.module_id = m.id
on conflict (company_id, module_id) do nothing;
