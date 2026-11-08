-- Publish M-30 (Comercio) in the tenant module catalog used by APEX platform administration.
-- Mirrors 20261011100000_petty_cash_module_catalog.sql: the module is catalogued neutral and a
-- platform administrator enables it per company from Administracion APEX > Suscripciones.
-- Without this row the module cannot be switched on anywhere, because the activation list is
-- companies cross join public.modules, not the frontend module registry.

insert into public.modules (code, name, description, route, icon, is_active, sort_order, visibility_scope)
values (
  'comercio',
  'Comercio',
  'Gestión autónoma para tiendas y pequeños comercios: productos con fotos, punto de venta, crédito con cuotas, cartera, compras de mercancía, gastos y reportes.',
  '/dashboard/comercio',
  'shopping-cart',
  true,
  290,
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
join public.modules m on m.code = 'comercio'
on conflict (plan_id, module_id) do nothing;

insert into public.company_modules (company_id, module_id, enabled, source)
select
  c.id,
  m.id,
  coalesce(pm.enabled, false),
  case when pm.plan_id is null then 'manual' else 'plan' end
from public.companies c
join public.modules m on m.code = 'comercio'
left join public.plan_modules pm on pm.plan_id = c.plan_id and pm.module_id = m.id
on conflict (company_id, module_id) do nothing;
