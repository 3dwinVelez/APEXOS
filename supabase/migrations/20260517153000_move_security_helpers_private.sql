-- Move security-definer helpers out of the exposed public schema.

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.is_company_member(company_uuid uuid)
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

create or replace function app_private.is_company_admin(company_uuid uuid)
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

create or replace function app_private.has_company_module(company_uuid uuid, module_code text)
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
  select
    auth.uid() is not null
    and app_private.is_company_member(company_uuid)
    and coalesce(
      (select enabled from company_override),
      (select enabled from plan_access),
      false
    );
$$;

revoke all on function app_private.is_company_member(uuid) from public, anon;
revoke all on function app_private.is_company_admin(uuid) from public, anon;
revoke all on function app_private.has_company_module(uuid, text) from public, anon;
grant execute on function app_private.is_company_member(uuid) to authenticated;
grant execute on function app_private.is_company_admin(uuid) to authenticated;
grant execute on function app_private.has_company_module(uuid, text) to authenticated;

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member
on public.companies
for select
to authenticated
using (app_private.is_company_member(id));

drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin
on public.companies
for update
to authenticated
using (app_private.is_company_admin(id))
with check (app_private.is_company_admin(id));

drop policy if exists company_users_select_member_companies on public.company_users;
create policy company_users_select_member_companies
on public.company_users
for select
to authenticated
using (app_private.is_company_member(company_id));

drop policy if exists company_users_insert_admin on public.company_users;
create policy company_users_insert_admin
on public.company_users
for insert
to authenticated
with check (app_private.is_company_admin(company_id));

drop policy if exists company_users_update_admin on public.company_users;
create policy company_users_update_admin
on public.company_users
for update
to authenticated
using (app_private.is_company_admin(company_id))
with check (app_private.is_company_admin(company_id));

drop policy if exists company_users_delete_admin on public.company_users;
create policy company_users_delete_admin
on public.company_users
for delete
to authenticated
using (app_private.is_company_admin(company_id));

drop policy if exists company_modules_select_member on public.company_modules;
create policy company_modules_select_member
on public.company_modules
for select
to authenticated
using (app_private.is_company_member(company_id));

drop policy if exists company_modules_insert_admin on public.company_modules;
create policy company_modules_insert_admin
on public.company_modules
for insert
to authenticated
with check (app_private.is_company_admin(company_id));

drop policy if exists company_modules_update_admin on public.company_modules;
create policy company_modules_update_admin
on public.company_modules
for update
to authenticated
using (app_private.is_company_admin(company_id))
with check (app_private.is_company_admin(company_id));

drop policy if exists company_modules_delete_admin on public.company_modules;
create policy company_modules_delete_admin
on public.company_modules
for delete
to authenticated
using (app_private.is_company_admin(company_id));

drop policy if exists employees_select_member_enabled on public.employees;
create policy employees_select_member_enabled
on public.employees
for select
to authenticated
using (
  app_private.is_company_member(company_id)
  and app_private.has_company_module(company_id, 'talento_humano')
);

drop policy if exists employees_insert_admin_enabled on public.employees;
create policy employees_insert_admin_enabled
on public.employees
for insert
to authenticated
with check (
  app_private.is_company_admin(company_id)
  and app_private.has_company_module(company_id, 'talento_humano')
);

drop policy if exists employees_update_admin_enabled on public.employees;
create policy employees_update_admin_enabled
on public.employees
for update
to authenticated
using (
  app_private.is_company_admin(company_id)
  and app_private.has_company_module(company_id, 'talento_humano')
)
with check (
  app_private.is_company_admin(company_id)
  and app_private.has_company_module(company_id, 'talento_humano')
);

drop policy if exists employees_delete_admin_enabled on public.employees;
create policy employees_delete_admin_enabled
on public.employees
for delete
to authenticated
using (
  app_private.is_company_admin(company_id)
  and app_private.has_company_module(company_id, 'talento_humano')
);

drop policy if exists services_select_member_enabled on public.services;
create policy services_select_member_enabled
on public.services
for select
to authenticated
using (
  app_private.is_company_member(company_id)
  and app_private.has_company_module(company_id, 'servicios')
);

drop policy if exists services_insert_admin_enabled on public.services;
create policy services_insert_admin_enabled
on public.services
for insert
to authenticated
with check (
  app_private.is_company_admin(company_id)
  and app_private.has_company_module(company_id, 'servicios')
);

drop policy if exists services_update_admin_enabled on public.services;
create policy services_update_admin_enabled
on public.services
for update
to authenticated
using (
  app_private.is_company_admin(company_id)
  and app_private.has_company_module(company_id, 'servicios')
)
with check (
  app_private.is_company_admin(company_id)
  and app_private.has_company_module(company_id, 'servicios')
);

drop policy if exists services_delete_admin_enabled on public.services;
create policy services_delete_admin_enabled
on public.services
for delete
to authenticated
using (
  app_private.is_company_admin(company_id)
  and app_private.has_company_module(company_id, 'servicios')
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
  and app_private.is_company_member(c.id);

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
  and app_private.is_company_member(cu.company_id);

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
  and app_private.is_company_member(c.id);

drop function if exists public.has_company_module(uuid, text);
drop function if exists public.is_company_admin(uuid);
drop function if exists public.is_company_member(uuid);
