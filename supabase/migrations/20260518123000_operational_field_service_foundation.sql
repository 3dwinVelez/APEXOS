-- Operational field-service foundation for Supabase QA.
-- Scope: service references, vehicles, routes, punches, GPS, service orders, evidence and overtime MVP.

alter table public.employees
add column if not exists user_id uuid references public.profiles(id) on delete set null;

alter table public.employees
add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_employees_company_user_unique
on public.employees(company_id, user_id)
where user_id is not null;

create index if not exists idx_employees_company_position on public.employees(company_id, position);

create table if not exists public.service_references (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  category text default 'general',
  description text,
  estimated_minutes int default 60,
  brand text,
  model text,
  active boolean default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint service_references_company_code_unique unique (company_id, code)
);

create table if not exists public.service_reference_parts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference_id uuid not null references public.service_references(id) on delete cascade,
  name text not null,
  quantity numeric default 1,
  unit text default 'und',
  description text,
  display_order int default 0,
  created_at timestamptz default now()
  ,
  constraint service_reference_parts_reference_name_unique unique (reference_id, name)
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plate text not null,
  brand text,
  model text,
  type text,
  year int,
  color text,
  mileage int default 0,
  owner text,
  status text default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint vehicles_company_plate_unique unique (company_id, plate),
  constraint vehicles_status_check check (status in ('active', 'inactive', 'maintenance', 'retired'))
);

create table if not exists public.operational_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  route_date date not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_plate text,
  start_time time,
  end_time time,
  tolerance_minutes int default 15,
  status text default 'active',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint operational_routes_company_code_unique unique (company_id, code),
  constraint operational_routes_status_check check (status in ('planned', 'active', 'closed', 'cancelled'))
);

create table if not exists public.route_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid not null references public.operational_routes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  role text default 'operator',
  status text default 'active',
  created_at timestamptz default now(),
  constraint route_assignments_route_employee_unique unique (route_id, employee_id),
  constraint route_assignments_status_check check (status in ('active', 'inactive', 'replaced'))
);

create table if not exists public.time_punches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  route_id uuid references public.operational_routes(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  user_name text not null,
  punch_type text not null,
  punched_at timestamptz not null default now(),
  punch_date date not null default current_date,
  punch_time time not null default current_time,
  latitude numeric,
  longitude numeric,
  accuracy_meters numeric,
  extra_minutes int default 0,
  extra_reason text,
  extra_detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint time_punches_type_check check (punch_type in ('entrada', 'inicio_almuerzo', 'fin_almuerzo', 'salida'))
);

create table if not exists public.gps_pings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  route_id uuid references public.operational_routes(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  user_name text not null,
  latitude numeric not null,
  longitude numeric not null,
  accuracy_meters numeric,
  source text default 'mobile',
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  reference_id uuid references public.service_references(id) on delete set null,
  technician_employee_id uuid references public.employees(id) on delete set null,
  technician_user_id uuid references public.profiles(id) on delete set null,
  service_type text default 'montaje',
  status text default 'pendiente',
  customer_name text not null,
  customer_address text not null,
  customer_phone text,
  invoice_number text,
  scheduled_date date,
  started_at timestamptz,
  closed_at timestamptz,
  start_latitude numeric,
  start_longitude numeric,
  close_latitude numeric,
  close_longitude numeric,
  duration_minutes int,
  notes text,
  no_execution_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint service_orders_company_number_unique unique (company_id, number),
  constraint service_orders_status_check check (status in ('pendiente', 'en_curso', 'inspeccion', 'ejecucion', 'cerrada', 'no_ejecutada', 'cancelada'))
);

create table if not exists public.service_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.service_orders(id) on delete cascade,
  type text default 'novedad',
  description text not null,
  action text,
  photo_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.service_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.service_orders(id) on delete cascade,
  evidence_type text not null,
  file_url text,
  storage_bucket text default 'service-images',
  storage_path text,
  mime_type text,
  size_bytes int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint service_evidence_type_check check (evidence_type in ('fachada', 'producto_abierto', 'producto_cerrado', 'cliente', 'firma_cliente', 'no_ejecutada', 'novedad'))
);

create index if not exists idx_service_references_company on public.service_references(company_id);
create index if not exists idx_service_references_company_active on public.service_references(company_id, active);
create index if not exists idx_service_reference_parts_reference on public.service_reference_parts(reference_id);
create index if not exists idx_vehicles_company on public.vehicles(company_id);
create index if not exists idx_vehicles_company_status on public.vehicles(company_id, status);
create index if not exists idx_operational_routes_company_date on public.operational_routes(company_id, route_date);
create index if not exists idx_operational_routes_company_status on public.operational_routes(company_id, status);
create index if not exists idx_route_assignments_route on public.route_assignments(route_id);
create index if not exists idx_route_assignments_employee on public.route_assignments(company_id, employee_id);
create index if not exists idx_time_punches_company_date on public.time_punches(company_id, punch_date);
create index if not exists idx_time_punches_employee_date on public.time_punches(company_id, employee_id, punch_date);
create index if not exists idx_time_punches_user_date on public.time_punches(company_id, user_id, punch_date);
create index if not exists idx_gps_pings_company_route_time on public.gps_pings(company_id, route_id, captured_at);
create index if not exists idx_gps_pings_employee_time on public.gps_pings(company_id, employee_id, captured_at);
create index if not exists idx_service_orders_company_status on public.service_orders(company_id, status);
create index if not exists idx_service_orders_company_scheduled on public.service_orders(company_id, scheduled_date);
create index if not exists idx_service_orders_technician on public.service_orders(company_id, technician_employee_id);
create index if not exists idx_service_incidents_order on public.service_incidents(order_id);
create index if not exists idx_service_evidence_order on public.service_evidence(order_id);
create index if not exists idx_service_evidence_type on public.service_evidence(company_id, evidence_type);

drop trigger if exists trg_service_references_updated_at on public.service_references;
create trigger trg_service_references_updated_at before update on public.service_references for each row execute function public.update_updated_at_column();
drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at before update on public.vehicles for each row execute function public.update_updated_at_column();
drop trigger if exists trg_operational_routes_updated_at on public.operational_routes;
create trigger trg_operational_routes_updated_at before update on public.operational_routes for each row execute function public.update_updated_at_column();
drop trigger if exists trg_service_orders_updated_at on public.service_orders;
create trigger trg_service_orders_updated_at before update on public.service_orders for each row execute function public.update_updated_at_column();

alter table public.service_references enable row level security;
alter table public.service_reference_parts enable row level security;
alter table public.vehicles enable row level security;
alter table public.operational_routes enable row level security;
alter table public.route_assignments enable row level security;
alter table public.time_punches enable row level security;
alter table public.gps_pings enable row level security;
alter table public.service_orders enable row level security;
alter table public.service_incidents enable row level security;
alter table public.service_evidence enable row level security;

-- Services module policies.
drop policy if exists service_references_select_member on public.service_references;
create policy service_references_select_member on public.service_references for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));
drop policy if exists service_references_write_admin on public.service_references;
create policy service_references_write_admin on public.service_references for all to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'servicios'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'servicios'));

drop policy if exists service_reference_parts_select_member on public.service_reference_parts;
create policy service_reference_parts_select_member on public.service_reference_parts for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));
drop policy if exists service_reference_parts_write_admin on public.service_reference_parts;
create policy service_reference_parts_write_admin on public.service_reference_parts for all to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'servicios'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'servicios'));

drop policy if exists service_orders_select_member on public.service_orders;
create policy service_orders_select_member on public.service_orders for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));
drop policy if exists service_orders_insert_member on public.service_orders;
create policy service_orders_insert_member on public.service_orders for insert to authenticated
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));
drop policy if exists service_orders_update_member on public.service_orders;
create policy service_orders_update_member on public.service_orders for update to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'))
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));
drop policy if exists service_orders_delete_admin on public.service_orders;
create policy service_orders_delete_admin on public.service_orders for delete to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'servicios'));

drop policy if exists service_incidents_select_member on public.service_incidents;
create policy service_incidents_select_member on public.service_incidents for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));
drop policy if exists service_incidents_write_member on public.service_incidents;
create policy service_incidents_write_member on public.service_incidents for all to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'))
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));

drop policy if exists service_evidence_select_member on public.service_evidence;
create policy service_evidence_select_member on public.service_evidence for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));
drop policy if exists service_evidence_write_member on public.service_evidence;
create policy service_evidence_write_member on public.service_evidence for all to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'))
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'servicios'));

-- HR / transport policies.
drop policy if exists vehicles_select_member on public.vehicles;
create policy vehicles_select_member on public.vehicles for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'transporte'));
drop policy if exists vehicles_write_admin on public.vehicles;
create policy vehicles_write_admin on public.vehicles for all to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'transporte'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'transporte'));

drop policy if exists operational_routes_select_member on public.operational_routes;
create policy operational_routes_select_member on public.operational_routes for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));
drop policy if exists operational_routes_write_admin on public.operational_routes;
create policy operational_routes_write_admin on public.operational_routes for all to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists route_assignments_select_member on public.route_assignments;
create policy route_assignments_select_member on public.route_assignments for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));
drop policy if exists route_assignments_write_admin on public.route_assignments;
create policy route_assignments_write_admin on public.route_assignments for all to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists time_punches_select_member on public.time_punches;
create policy time_punches_select_member on public.time_punches for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));
drop policy if exists time_punches_insert_member on public.time_punches;
create policy time_punches_insert_member on public.time_punches for insert to authenticated
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));
drop policy if exists time_punches_update_admin on public.time_punches;
create policy time_punches_update_admin on public.time_punches for update to authenticated
using (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'))
with check (app_private.is_company_admin(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

drop policy if exists gps_pings_select_member on public.gps_pings;
create policy gps_pings_select_member on public.gps_pings for select to authenticated
using (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));
drop policy if exists gps_pings_insert_member on public.gps_pings;
create policy gps_pings_insert_member on public.gps_pings for insert to authenticated
with check (app_private.is_company_member(company_id) and app_private.has_company_module(company_id, 'talento_humano'));

grant select, insert, update, delete on
  public.service_references,
  public.service_reference_parts,
  public.vehicles,
  public.operational_routes,
  public.route_assignments,
  public.time_punches,
  public.gps_pings,
  public.service_orders,
  public.service_incidents,
  public.service_evidence
to authenticated;

create or replace view public.v_service_order_summary
with (security_invoker = true)
as
select
  so.company_id,
  so.id,
  so.number,
  so.status,
  so.customer_name,
  so.customer_address,
  so.scheduled_date,
  sr.code as reference_code,
  sr.name as reference_name,
  e.first_name || ' ' || e.last_name as technician_name,
  count(distinct se.id) as evidence_count,
  count(distinct si.id) as incident_count
from public.service_orders so
left join public.service_references sr on sr.id = so.reference_id
left join public.employees e on e.id = so.technician_employee_id
left join public.service_evidence se on se.order_id = so.id
left join public.service_incidents si on si.order_id = so.id
where app_private.is_company_member(so.company_id)
  and app_private.has_company_module(so.company_id, 'servicios')
group by so.id, sr.id, e.id;

create or replace view public.v_operations_route_tracking
with (security_invoker = true)
as
select
  r.company_id,
  r.id as route_id,
  r.code as route_code,
  r.route_date,
  r.vehicle_plate,
  r.start_time,
  r.end_time,
  r.status,
  count(distinct ra.employee_id) as assigned_people,
  count(distinct tp.id) as punch_count,
  count(distinct gp.id) as gps_count,
  max(gp.captured_at) as last_gps_at
from public.operational_routes r
left join public.route_assignments ra on ra.route_id = r.id
left join public.time_punches tp on tp.route_id = r.id
left join public.gps_pings gp on gp.route_id = r.id
where app_private.is_company_member(r.company_id)
  and app_private.has_company_module(r.company_id, 'talento_humano')
group by r.id;

grant select on public.v_service_order_summary to authenticated;
grant select on public.v_operations_route_tracking to authenticated;
