-- Publish M-27 in the tenant module catalog used by APEX platform administration.

insert into public.modules (code, name, description, route, icon, is_active, sort_order, visibility_scope)
values (
  'gestion_comercial',
  'Gestion Comercial',
  'Agenda comercial, clientes, visitas, cotizaciones, pedidos, presupuestos y seguimiento gerencial por empresa.',
  '/dashboard/gestion-comercial',
  'contact-round',
  true,
  280,
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
join public.modules m on m.code = 'gestion_comercial'
on conflict (plan_id, module_id) do nothing;

insert into public.company_modules (company_id, module_id, enabled, source)
select
  c.id,
  m.id,
  coalesce(pm.enabled, false),
  case when pm.plan_id is null then 'manual' else 'plan' end
from public.companies c
join public.modules m on m.code = 'gestion_comercial'
left join public.plan_modules pm on pm.plan_id = c.plan_id and pm.module_id = m.id
on conflict (company_id, module_id) do nothing;
