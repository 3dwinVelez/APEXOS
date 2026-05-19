-- Platform administration, tenant module visibility and SCJ QA seed.

alter table public.modules
add column if not exists visibility_scope text not null default 'tenant';

alter table public.modules
drop constraint if exists modules_visibility_scope_check;

alter table public.modules
add constraint modules_visibility_scope_check
check (visibility_scope in ('tenant', 'platform'));

create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint platform_admins_user_unique unique (user_id),
  constraint platform_admins_status_check check (status in ('active', 'inactive', 'suspended'))
);

create index if not exists idx_platform_admins_user_id on public.platform_admins(user_id);
create index if not exists idx_platform_admins_status on public.platform_admins(status);

drop trigger if exists trg_platform_admins_updated_at on public.platform_admins;
create trigger trg_platform_admins_updated_at
before update on public.platform_admins
for each row execute function public.update_updated_at_column();

alter table public.platform_admins enable row level security;

create or replace function app_private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.status = 'active'
  );
$$;

revoke all on function app_private.is_platform_admin() from public, anon;
grant execute on function app_private.is_platform_admin() to authenticated;

drop policy if exists platform_admins_select_platform_admin on public.platform_admins;
create policy platform_admins_select_platform_admin
on public.platform_admins
for select
to authenticated
using (app_private.is_platform_admin());

drop policy if exists platform_admins_insert_platform_admin on public.platform_admins;
create policy platform_admins_insert_platform_admin
on public.platform_admins
for insert
to authenticated
with check (app_private.is_platform_admin());

drop policy if exists platform_admins_update_platform_admin on public.platform_admins;
create policy platform_admins_update_platform_admin
on public.platform_admins
for update
to authenticated
using (app_private.is_platform_admin())
with check (app_private.is_platform_admin());

drop policy if exists platform_admins_delete_platform_admin on public.platform_admins;
create policy platform_admins_delete_platform_admin
on public.platform_admins
for delete
to authenticated
using (app_private.is_platform_admin());

drop policy if exists modules_select_authenticated on public.modules;
create policy modules_select_authenticated
on public.modules
for select
to authenticated
using (
  is_active = true
  and (
    visibility_scope = 'tenant'
    or app_private.is_platform_admin()
  )
);

drop policy if exists companies_select_platform_admin on public.companies;
create policy companies_select_platform_admin
on public.companies
for select
to authenticated
using (app_private.is_platform_admin());

drop policy if exists companies_insert_platform_admin on public.companies;
create policy companies_insert_platform_admin
on public.companies
for insert
to authenticated
with check (app_private.is_platform_admin());

drop policy if exists companies_update_platform_admin on public.companies;
create policy companies_update_platform_admin
on public.companies
for update
to authenticated
using (app_private.is_platform_admin())
with check (app_private.is_platform_admin());

drop policy if exists profiles_select_platform_admin on public.profiles;
create policy profiles_select_platform_admin
on public.profiles
for select
to authenticated
using (app_private.is_platform_admin());

drop policy if exists company_users_select_platform_admin on public.company_users;
create policy company_users_select_platform_admin
on public.company_users
for select
to authenticated
using (app_private.is_platform_admin());

drop policy if exists company_users_insert_platform_admin on public.company_users;
create policy company_users_insert_platform_admin
on public.company_users
for insert
to authenticated
with check (app_private.is_platform_admin());

drop policy if exists company_users_update_platform_admin on public.company_users;
create policy company_users_update_platform_admin
on public.company_users
for update
to authenticated
using (app_private.is_platform_admin())
with check (app_private.is_platform_admin());

drop policy if exists company_users_delete_platform_admin on public.company_users;
create policy company_users_delete_platform_admin
on public.company_users
for delete
to authenticated
using (app_private.is_platform_admin());

drop policy if exists company_modules_select_platform_admin on public.company_modules;
create policy company_modules_select_platform_admin
on public.company_modules
for select
to authenticated
using (app_private.is_platform_admin());

drop policy if exists company_modules_insert_platform_admin on public.company_modules;
create policy company_modules_insert_platform_admin
on public.company_modules
for insert
to authenticated
with check (app_private.is_platform_admin());

drop policy if exists company_modules_update_platform_admin on public.company_modules;
create policy company_modules_update_platform_admin
on public.company_modules
for update
to authenticated
using (app_private.is_platform_admin())
with check (app_private.is_platform_admin());

drop policy if exists company_modules_delete_platform_admin on public.company_modules;
create policy company_modules_delete_platform_admin
on public.company_modules
for delete
to authenticated
using (app_private.is_platform_admin());

insert into public.modules (code, name, description, route, icon, is_active, sort_order, visibility_scope)
values
  ('transporte', 'Transporte', 'Vehiculos, rutas, entregas y control logistico.', '/dashboard/transporte', 'truck', true, 25, 'tenant'),
  ('administracion_apex', 'Administracion APEX', 'Usuarios, roles, permisos y configuracion administrativa de la empresa.', '/dashboard/administracion', 'shield', true, 105, 'tenant'),
  ('platform_admin', 'Admin Plataforma APEX', 'Administracion global de empresas, suscripciones y modulos habilitados.', '/dashboard/administracion/suscripciones', 'key-round', true, 1000, 'platform')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  route = excluded.route,
  icon = excluded.icon,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  visibility_scope = excluded.visibility_scope;

update public.modules
set visibility_scope = 'tenant'
where code <> 'platform_admin';

insert into public.plans (code, name, description, price, billing_period, is_active)
values ('scj_operacion_inicial', 'SCJ Operacion Inicial', 'Plan QA SCJ con Talento Humano, Transporte, Servicios y Administracion APEX.', 0, 'monthly', true)
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
  m.code in ('talento_humano', 'transporte', 'servicios', 'configuracion', 'administracion_apex') as enabled
from public.plans p
cross join public.modules m
where p.code = 'scj_operacion_inicial'
  and m.visibility_scope = 'tenant'
on conflict (plan_id, module_id) do update set enabled = excluded.enabled;

insert into public.companies (name, legal_name, status, plan_id)
select 'SCJ', null, 'active', p.id
from public.plans p
where p.code = 'scj_operacion_inicial'
  and not exists (
    select 1
    from public.companies c
    where c.name = 'SCJ'
  );

update public.companies c
set plan_id = p.id
from public.plans p
where c.name = 'SCJ'
  and p.code = 'scj_operacion_inicial';

insert into public.company_modules (company_id, module_id, enabled, source)
select
  c.id,
  m.id,
  m.code in ('talento_humano', 'transporte', 'servicios', 'configuracion', 'administracion_apex') as enabled,
  'manual' as source
from public.companies c
cross join public.modules m
where c.name = 'SCJ'
  and m.visibility_scope = 'tenant'
on conflict (company_id, module_id) do update set
  enabled = excluded.enabled,
  source = excluded.source,
  updated_at = now();

create or replace view public.v_platform_companies
with (security_invoker = true)
as
select
  c.id as company_id,
  c.name as company_name,
  c.legal_name,
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
group by c.id, p.id;

create or replace view public.v_platform_company_module_access
with (security_invoker = true)
as
select
  cm.id as company_module_id,
  c.id as company_id,
  c.name as company_name,
  m.id as module_id,
  m.code as module_code,
  m.name as module_name,
  m.description,
  m.route,
  m.icon,
  m.sort_order,
  coalesce(cm.enabled, false) as enabled,
  coalesce(cm.source, 'manual') as source,
  c.plan_id,
  p.code as plan_code,
  p.name as plan_name
from public.companies c
cross join public.modules m
left join public.company_modules cm on cm.company_id = c.id and cm.module_id = m.id
left join public.plans p on p.id = c.plan_id
where app_private.is_platform_admin()
  and m.visibility_scope = 'tenant'
  and m.is_active = true;

grant select on public.v_platform_companies to authenticated;
grant select on public.v_platform_company_module_access to authenticated;
