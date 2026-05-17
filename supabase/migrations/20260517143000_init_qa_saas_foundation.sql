-- APEX OS QA SaaS foundation
-- Target environment: QA
-- Scope: multi-company access control, module gating, HR and services base tables.

create extension if not exists pgcrypto;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  price numeric default 0,
  billing_period text default 'monthly',
  is_active boolean default true,
  created_at timestamptz default now(),
  constraint plans_billing_period_check check (billing_period in ('monthly', 'yearly', 'one_time', 'free'))
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  email text,
  phone text,
  status text not null default 'active',
  plan_id uuid references public.plans(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint companies_status_check check (status in ('active', 'inactive', 'suspended', 'trial'))
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint profiles_status_check check (status in ('active', 'inactive', 'invited', 'suspended'))
);

create table if not exists public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_users_company_user_unique unique (company_id, user_id),
  constraint company_users_role_check check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint company_users_status_check check (status in ('active', 'inactive', 'invited', 'suspended'))
);

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  route text,
  icon text,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists public.plan_modules (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  enabled boolean default true,
  created_at timestamptz default now(),
  constraint plan_modules_plan_module_unique unique (plan_id, module_id)
);

create table if not exists public.company_modules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  enabled boolean default false,
  source text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_modules_company_module_unique unique (company_id, module_id),
  constraint company_modules_source_check check (source in ('manual', 'plan', 'trial', 'billing', 'system'))
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  document_type text,
  document_number text,
  email text,
  phone text,
  position text,
  department text,
  hire_date date,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint employees_company_document_unique unique (company_id, document_number),
  constraint employees_status_check check (status in ('active', 'inactive', 'terminated', 'suspended'))
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  category text,
  price numeric default 0,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint services_status_check check (status in ('active', 'inactive', 'archived'))
);

create index if not exists idx_companies_plan_id on public.companies(plan_id);
create index if not exists idx_companies_status on public.companies(status);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_company_users_company_id on public.company_users(company_id);
create index if not exists idx_company_users_user_id on public.company_users(user_id);
create index if not exists idx_company_users_company_user on public.company_users(company_id, user_id);
create index if not exists idx_company_modules_company_id on public.company_modules(company_id);
create index if not exists idx_company_modules_company_module on public.company_modules(company_id, module_id);
create index if not exists idx_plan_modules_plan_id on public.plan_modules(plan_id);
create index if not exists idx_plan_modules_module_id on public.plan_modules(module_id);
create index if not exists idx_modules_code on public.modules(code);
create index if not exists idx_employees_company_id on public.employees(company_id);
create index if not exists idx_employees_document_number on public.employees(document_number);
create index if not exists idx_employees_email on public.employees(email);
create index if not exists idx_employees_company_status on public.employees(company_id, status);
create index if not exists idx_employees_company_document on public.employees(company_id, document_number);
create index if not exists idx_services_company_id on public.services(company_id);
create index if not exists idx_services_status on public.services(status);
create index if not exists idx_services_name on public.services(name);
create index if not exists idx_services_company_status on public.services(company_id, status);
create index if not exists idx_services_company_name on public.services(company_id, name);

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_company_users_updated_at on public.company_users;
create trigger trg_company_users_updated_at
before update on public.company_users
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_company_modules_updated_at on public.company_modules;
create trigger trg_company_modules_updated_at
before update on public.company_modules
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
before update on public.employees
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
before update on public.services
for each row execute function public.update_updated_at_column();

create or replace function public.is_company_member(company_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_users cu
    where cu.company_id = company_uuid
      and cu.user_id = auth.uid()
      and cu.status = 'active'
  );
$$;

create or replace function public.is_company_admin(company_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_users cu
    where cu.company_id = company_uuid
      and cu.user_id = auth.uid()
      and cu.status = 'active'
      and cu.role in ('owner', 'admin')
  );
$$;

create or replace function public.has_company_module(company_uuid uuid, module_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with requested_module as (
    select m.id
    from public.modules m
    where m.code = module_code
      and m.is_active = true
    limit 1
  ),
  company_override as (
    select cm.enabled
    from public.company_modules cm
    join requested_module rm on rm.id = cm.module_id
    where cm.company_id = company_uuid
    limit 1
  ),
  plan_access as (
    select pm.enabled
    from public.companies c
    join public.plan_modules pm on pm.plan_id = c.plan_id
    join requested_module rm on rm.id = pm.module_id
    where c.id = company_uuid
    limit 1
  )
  select coalesce(
    (select enabled from company_override),
    (select enabled from plan_access),
    false
  );
$$;

grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_admin(uuid) to authenticated;
grant execute on function public.has_company_module(uuid, text) to authenticated;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_users enable row level security;
alter table public.company_modules enable row level security;
alter table public.employees enable row level security;
alter table public.services enable row level security;

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member
on public.companies
for select
to authenticated
using (public.is_company_member(id));

drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin
on public.companies
for update
to authenticated
using (public.is_company_admin(id))
with check (public.is_company_admin(id));

drop policy if exists profiles_select_self_or_company on public.profiles;
create policy profiles_select_self_or_company
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.company_users viewer
    join public.company_users target on target.company_id = viewer.company_id
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and target.user_id = profiles.id
      and target.status = 'active'
  )
);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists company_users_select_member_companies on public.company_users;
create policy company_users_select_member_companies
on public.company_users
for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists company_users_insert_admin on public.company_users;
create policy company_users_insert_admin
on public.company_users
for insert
to authenticated
with check (public.is_company_admin(company_id));

drop policy if exists company_users_update_admin on public.company_users;
create policy company_users_update_admin
on public.company_users
for update
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

drop policy if exists company_users_delete_admin on public.company_users;
create policy company_users_delete_admin
on public.company_users
for delete
to authenticated
using (public.is_company_admin(company_id));

drop policy if exists company_modules_select_member on public.company_modules;
create policy company_modules_select_member
on public.company_modules
for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists company_modules_insert_admin on public.company_modules;
create policy company_modules_insert_admin
on public.company_modules
for insert
to authenticated
with check (public.is_company_admin(company_id));

drop policy if exists company_modules_update_admin on public.company_modules;
create policy company_modules_update_admin
on public.company_modules
for update
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

drop policy if exists company_modules_delete_admin on public.company_modules;
create policy company_modules_delete_admin
on public.company_modules
for delete
to authenticated
using (public.is_company_admin(company_id));

drop policy if exists employees_select_member_enabled on public.employees;
create policy employees_select_member_enabled
on public.employees
for select
to authenticated
using (
  public.is_company_member(company_id)
  and public.has_company_module(company_id, 'talento_humano')
);

drop policy if exists employees_insert_admin_enabled on public.employees;
create policy employees_insert_admin_enabled
on public.employees
for insert
to authenticated
with check (
  public.is_company_admin(company_id)
  and public.has_company_module(company_id, 'talento_humano')
);

drop policy if exists employees_update_admin_enabled on public.employees;
create policy employees_update_admin_enabled
on public.employees
for update
to authenticated
using (
  public.is_company_admin(company_id)
  and public.has_company_module(company_id, 'talento_humano')
)
with check (
  public.is_company_admin(company_id)
  and public.has_company_module(company_id, 'talento_humano')
);

drop policy if exists employees_delete_admin_enabled on public.employees;
create policy employees_delete_admin_enabled
on public.employees
for delete
to authenticated
using (
  public.is_company_admin(company_id)
  and public.has_company_module(company_id, 'talento_humano')
);

drop policy if exists services_select_member_enabled on public.services;
create policy services_select_member_enabled
on public.services
for select
to authenticated
using (
  public.is_company_member(company_id)
  and public.has_company_module(company_id, 'servicios')
);

drop policy if exists services_insert_admin_enabled on public.services;
create policy services_insert_admin_enabled
on public.services
for insert
to authenticated
with check (
  public.is_company_admin(company_id)
  and public.has_company_module(company_id, 'servicios')
);

drop policy if exists services_update_admin_enabled on public.services;
create policy services_update_admin_enabled
on public.services
for update
to authenticated
using (
  public.is_company_admin(company_id)
  and public.has_company_module(company_id, 'servicios')
)
with check (
  public.is_company_admin(company_id)
  and public.has_company_module(company_id, 'servicios')
);

drop policy if exists services_delete_admin_enabled on public.services;
create policy services_delete_admin_enabled
on public.services
for delete
to authenticated
using (
  public.is_company_admin(company_id)
  and public.has_company_module(company_id, 'servicios')
);

create or replace view public.v_company_enabled_modules
with (security_invoker = true)
as
select
  c.id as company_id,
  c.name as company_name,
  m.id as module_id,
  m.code as module_code,
  m.name as module_name,
  m.route,
  m.icon,
  coalesce(cm.enabled, pm.enabled, false) as enabled,
  coalesce(cm.source, case when pm.id is not null then 'plan' else 'none' end) as source
from public.companies c
cross join public.modules m
left join public.company_modules cm on cm.company_id = c.id and cm.module_id = m.id
left join public.plan_modules pm on pm.plan_id = c.plan_id and pm.module_id = m.id
where m.is_active = true
  and public.is_company_member(c.id);

create or replace view public.v_user_companies
with (security_invoker = true)
as
select
  cu.user_id,
  cu.company_id,
  c.name as company_name,
  c.status as company_status,
  cu.role,
  cu.status as membership_status,
  c.plan_id,
  p.code as plan_code,
  p.name as plan_name
from public.company_users cu
join public.companies c on c.id = cu.company_id
left join public.plans p on p.id = c.plan_id
where cu.status = 'active'
  and cu.user_id = auth.uid()
  and public.is_company_member(cu.company_id);

create or replace view public.v_company_module_status
with (security_invoker = true)
as
select
  c.id as company_id,
  c.name as company_name,
  m.code as module_code,
  m.name as module_name,
  m.description,
  m.route,
  m.icon,
  m.sort_order,
  coalesce(cm.enabled, pm.enabled, false) as enabled,
  case
    when coalesce(cm.enabled, pm.enabled, false) then 'enabled'
    else 'blocked'
  end as access_status,
  coalesce(cm.source, case when pm.id is not null then 'plan' else 'none' end) as source
from public.companies c
cross join public.modules m
left join public.company_modules cm on cm.company_id = c.id and cm.module_id = m.id
left join public.plan_modules pm on pm.plan_id = c.plan_id and pm.module_id = m.id
where m.is_active = true
  and public.is_company_member(c.id);

grant select on public.plans to authenticated;
grant select on public.modules to authenticated;
grant select on public.plan_modules to authenticated;
grant select on public.v_company_enabled_modules to authenticated;
grant select on public.v_user_companies to authenticated;
grant select on public.v_company_module_status to authenticated;

insert into public.modules (code, name, description, route, icon, is_active, sort_order)
values
  ('talento_humano', 'Talento Humano', 'Empleados, marcaciones, rutas y nomina operativa.', '/dashboard/talento-humano', 'users', true, 10),
  ('servicios', 'Servicios', 'Gestion operativa de servicios, evidencias y cierre.', '/dashboard/servicios', 'briefcase', true, 20),
  ('inventario', 'Inventario', 'Productos, stock y movimientos.', '/dashboard/inventario', 'boxes', true, 30),
  ('crm', 'CRM', 'Prospectos, clientes y relacion comercial.', '/dashboard/crm', 'contact', true, 40),
  ('ventas', 'Ventas', 'Cotizaciones, pedidos y ventas.', '/dashboard/ventas', 'shopping-cart', true, 50),
  ('compras', 'Compras', 'Proveedores, ordenes y recepciones.', '/dashboard/compras', 'shopping-bag', true, 60),
  ('finanzas', 'Finanzas', 'Tesoreria, cartera y control financiero.', '/dashboard/finanzas', 'wallet', true, 70),
  ('reportes', 'Reportes', 'Indicadores, analitica y reportes ejecutivos.', '/dashboard/reportes', 'bar-chart', true, 80),
  ('wms', 'WMS', 'Operacion de bodega y logistica interna.', '/dashboard/inventario/wms', 'warehouse', true, 90),
  ('configuracion', 'Configuracion', 'Usuarios, roles, parametros y administracion.', '/dashboard/configuracion', 'settings', true, 100)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  icon = excluded.icon,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

insert into public.plans (code, name, description, price, billing_period, is_active)
values ('piloto_especial', 'Piloto Especial QA', 'Plan inicial de validacion QA para APEX OS.', 0, 'monthly', true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  billing_period = excluded.billing_period,
  is_active = excluded.is_active;

insert into public.plan_modules (plan_id, module_id, enabled)
select
  p.id,
  m.id,
  m.code in ('talento_humano', 'servicios', 'configuracion') as enabled
from public.plans p
cross join public.modules m
where p.code = 'piloto_especial'
on conflict (plan_id, module_id) do update set enabled = excluded.enabled;

insert into public.companies (name, legal_name, status, plan_id)
select 'Cliente Piloto QA', 'Cliente Piloto QA', 'active', p.id
from public.plans p
where p.code = 'piloto_especial'
  and not exists (
    select 1
    from public.companies c
    where c.name = 'Cliente Piloto QA'
  );

insert into public.company_modules (company_id, module_id, enabled, source)
select
  c.id,
  m.id,
  m.code in ('talento_humano', 'servicios', 'configuracion') as enabled,
  'manual' as source
from public.companies c
cross join public.modules m
where c.name = 'Cliente Piloto QA'
on conflict (company_id, module_id) do update set
  enabled = excluded.enabled,
  source = excluded.source,
  updated_at = now();
