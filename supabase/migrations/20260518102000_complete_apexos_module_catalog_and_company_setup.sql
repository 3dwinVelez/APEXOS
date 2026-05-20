-- Complete APEXOS module catalog and initialize module matrix for new companies.

with module_catalog(code, name, description, route, icon, sort_order) as (
  values
    ('inventario', 'Inventario', 'Control de articulos, existencias, movimientos, kardex, minimos y alertas de reposicion.', '/dashboard/inventario', 'boxes', 10),
    ('compras', 'Compras', 'Ordenes de compra, recepcion de mercancia, proveedores y abastecimiento.', '/dashboard/compras', 'package-check', 20),
    ('ventas', 'Ventas', 'Cotizaciones, ordenes de venta, seguimiento comercial y conversion a factura.', '/dashboard/ventas', 'chart-no-axes-combined', 30),
    ('facturacion', 'Facturacion', 'Facturas, notas credito, numeracion, impuestos y documentos comerciales.', '/dashboard/facturacion', 'receipt-text', 40),
    ('punto_de_venta', 'Punto de venta', 'Ventas rapidas, caja, medios de pago y operacion de mostrador.', '/dashboard/punto-de-venta', 'credit-card', 50),
    ('cartera', 'Cartera', 'Cuentas por cobrar, vencimientos, aging y recordatorios de pago.', '/dashboard/cartera', 'badge-dollar-sign', 60),
    ('contabilidad', 'Contabilidad', 'Plan de cuentas, asientos automaticos, libro mayor y estados financieros.', '/dashboard/contabilidad', 'landmark', 70),
    ('tesoreria', 'Tesoreria', 'Flujo de caja, bancos, pagos programados y proyeccion de liquidez.', '/dashboard/tesoreria', 'banknote', 80),
    ('costos', 'Costos', 'Costeo, margen por articulo, margen por cliente y rentabilidad.', '/dashboard/costos', 'gauge', 90),
    ('presupuestos', 'Presupuestos', 'Presupuesto, planeacion financiera, escenarios y consolidacion.', '/dashboard/presupuestos', 'clipboard-list', 100),
    ('produccion', 'Produccion', 'Ordenes de trabajo, capacidad, avance de produccion y eficiencia.', '/dashboard/produccion', 'factory', 110),
    ('recetas', 'Recetas y listas de materiales', 'BOM, formulas, versiones, cambios de ingenieria y planeacion de materiales.', '/dashboard/recetas', 'clipboard-check', 120),
    ('calidad', 'Calidad', 'Inspecciones, trazabilidad, no conformidades y acciones correctivas.', '/dashboard/calidad', 'shield-check', 130),
    ('transporte', 'Transporte', 'Rutas, vehiculos, entregas, fletes y seguimiento logistico.', '/dashboard/transporte', 'truck', 140),
    ('devoluciones', 'Devoluciones', 'RMA, devoluciones de clientes, garantias y flujo de aprobacion.', '/dashboard/devoluciones', 'refresh-ccw', 150),
    ('comercio_exterior', 'Comercio exterior', 'Importaciones, exportaciones, aranceles, declaraciones y costos nacionalizados.', '/dashboard/comercio-exterior', 'route', 160),
    ('talento_humano', 'Talento humano', 'Empleados, contratos, nomina, ausencias, desempeno y marcaciones.', '/dashboard/talento-humano', 'users', 170),
    ('activos', 'Activos y mantenimiento', 'Activos, mantenimientos, sensores, umbrales y mantenimiento predictivo.', '/dashboard/activos', 'wrench', 180),
    ('proyectos', 'Proyectos', 'Proyectos, hitos, avance, CAPEX, costos y cronograma.', '/dashboard/proyectos', 'building-2', 190),
    ('crm', 'CRM', 'Clientes, contactos, campanas, retencion, segmentacion y oportunidades.', '/dashboard/crm', 'contact-round', 200),
    ('planeacion_demanda', 'Planeacion de demanda', 'Pronostico, S&OP, demanda futura y senales de inventario.', '/dashboard/planeacion-demanda', 'calendar-clock', 210),
    ('administracion_apex', 'Administracion APEX', 'Usuarios, roles, permisos y configuracion administrativa de la empresa.', '/dashboard/administracion', 'settings', 220),
    ('facturacion_electronica', 'Facturacion electronica', 'DIAN Colombia, XML, firma digital y PDF fiscal.', '/dashboard/facturacion-electronica', 'file-check-2', 230),
    ('configuracion_inicial', 'Configuracion inicial', 'Diagnostico guiado, clasificacion del negocio y activacion inicial.', '/dashboard/configuracion-inicial', 'brain', 240),
    ('suscripciones', 'Suscripciones', 'Planes, facturacion mensual, limites de uso y administracion de suscripciones.', '/dashboard/suscripciones', 'file-text', 250),
    ('servicios', 'Servicios', 'Ordenes de servicio, tecnicos, inspeccion, ejecucion, evidencias, firma y cierre.', '/dashboard/servicios', 'wrench', 260),
    ('apex_ai', 'APEX AI Core', 'Capa cognitiva transversal para recomendaciones, alertas, contexto y trazabilidad.', '/dashboard/apex-ai', 'brain', 270)
)
insert into public.modules (code, name, description, route, icon, is_active, sort_order, visibility_scope)
select code, name, description, route, icon, true, sort_order, 'tenant'
from module_catalog
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
cross join public.modules m
where m.visibility_scope = 'tenant'
  and m.is_active = true
on conflict (plan_id, module_id) do nothing;

insert into public.company_modules (company_id, module_id, enabled, source)
select
  c.id,
  m.id,
  coalesce(pm.enabled, false) as enabled,
  case when pm.id is null then 'manual' else 'plan' end as source
from public.companies c
cross join public.modules m
left join public.plan_modules pm on pm.plan_id = c.plan_id and pm.module_id = m.id
where m.visibility_scope = 'tenant'
  and m.is_active = true
on conflict (company_id, module_id) do nothing;

create or replace function app_private.initialize_company_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_modules (company_id, module_id, enabled, source)
  select
    new.id,
    m.id,
    coalesce(pm.enabled, false) as enabled,
    case when pm.id is null then 'manual' else 'plan' end as source
  from public.modules m
  left join public.plan_modules pm on pm.plan_id = new.plan_id and pm.module_id = m.id
  where m.visibility_scope = 'tenant'
    and m.is_active = true
  on conflict (company_id, module_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.initialize_company_modules() from public, anon, authenticated;

drop trigger if exists trg_initialize_company_modules on public.companies;
create trigger trg_initialize_company_modules
after insert on public.companies
for each row execute function app_private.initialize_company_modules();

drop view if exists public.v_platform_companies;

create view public.v_platform_companies
with (security_invoker = true)
as
select
  c.id as company_id,
  c.name as company_name,
  c.legal_name,
  c.tax_id,
  c.email,
  c.phone,
  c.status,
  c.plan_id,
  p.code as plan_code,
  p.name as plan_name,
  count(cm.id) filter (where cm.enabled = true) as enabled_modules,
  count(cm.id) filter (where cm.enabled = false) as blocked_modules,
  c.created_at,
  c.updated_at
from public.companies c
left join public.plans p on p.id = c.plan_id
left join public.company_modules cm on cm.company_id = c.id
where app_private.is_platform_admin()
group by
  c.id,
  c.name,
  c.legal_name,
  c.tax_id,
  c.email,
  c.phone,
  c.status,
  c.plan_id,
  p.id,
  p.code,
  p.name,
  c.created_at,
  c.updated_at;

grant select on public.v_platform_companies to authenticated;
