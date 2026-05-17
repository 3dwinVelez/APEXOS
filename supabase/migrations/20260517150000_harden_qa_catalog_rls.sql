-- Harden QA catalog tables and helper execution permissions.

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
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
  select
    auth.uid() is not null
    and public.is_company_member(company_uuid)
    and coalesce(
      (select enabled from company_override),
      (select enabled from plan_access),
      false
    );
$$;

revoke execute on function public.is_company_member(uuid) from public, anon;
revoke execute on function public.is_company_admin(uuid) from public, anon;
revoke execute on function public.has_company_module(uuid, text) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_admin(uuid) to authenticated;
grant execute on function public.has_company_module(uuid, text) to authenticated;

alter table public.plans enable row level security;
alter table public.modules enable row level security;
alter table public.plan_modules enable row level security;

drop policy if exists plans_select_authenticated on public.plans;
create policy plans_select_authenticated
on public.plans
for select
to authenticated
using (is_active = true);

drop policy if exists modules_select_authenticated on public.modules;
create policy modules_select_authenticated
on public.modules
for select
to authenticated
using (is_active = true);

drop policy if exists plan_modules_select_authenticated on public.plan_modules;
create policy plan_modules_select_authenticated
on public.plan_modules
for select
to authenticated
using (true);
