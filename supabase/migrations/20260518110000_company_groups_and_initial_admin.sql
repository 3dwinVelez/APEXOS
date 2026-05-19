-- Company hierarchy and initial admin onboarding support for APEXOS QA.

alter table public.companies
add column if not exists company_type text not null default 'company',
add column if not exists parent_company_id uuid null references public.companies(id) on delete restrict,
add column if not exists business_line text null,
add column if not exists country text null,
add column if not exists city text null,
add column if not exists address text null;

alter table public.companies
drop constraint if exists companies_company_type_check;

alter table public.companies
add constraint companies_company_type_check
check (company_type in ('business_group', 'company', 'business_unit', 'branch'));

create index if not exists idx_companies_parent_company_id on public.companies(parent_company_id);
create index if not exists idx_companies_company_type on public.companies(company_type);
create index if not exists idx_companies_country_city on public.companies(country, city);

create table if not exists public.company_admin_onboarding (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null references public.profiles(id) on delete set null,
  full_name text not null,
  email text not null,
  role text not null default 'admin',
  status text not null default 'created',
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_admin_onboarding_role_check check (role in ('owner', 'admin')),
  constraint company_admin_onboarding_status_check check (status in ('pending', 'created', 'failed', 'disabled')),
  constraint company_admin_onboarding_company_email_unique unique (company_id, email)
);

create index if not exists idx_company_admin_onboarding_company_id on public.company_admin_onboarding(company_id);
create index if not exists idx_company_admin_onboarding_email on public.company_admin_onboarding(email);
create index if not exists idx_company_admin_onboarding_status on public.company_admin_onboarding(status);

drop trigger if exists trg_company_admin_onboarding_updated_at on public.company_admin_onboarding;
create trigger trg_company_admin_onboarding_updated_at
before update on public.company_admin_onboarding
for each row execute function public.update_updated_at_column();

alter table public.company_admin_onboarding enable row level security;

drop policy if exists company_admin_onboarding_select_admin on public.company_admin_onboarding;
create policy company_admin_onboarding_select_admin
on public.company_admin_onboarding
for select
to authenticated
using (
  app_private.is_platform_admin()
  or app_private.is_company_admin(company_id)
);

drop policy if exists company_admin_onboarding_insert_platform_admin on public.company_admin_onboarding;
create policy company_admin_onboarding_insert_platform_admin
on public.company_admin_onboarding
for insert
to authenticated
with check (app_private.is_platform_admin());

drop policy if exists company_admin_onboarding_update_platform_admin on public.company_admin_onboarding;
create policy company_admin_onboarding_update_platform_admin
on public.company_admin_onboarding
for update
to authenticated
using (app_private.is_platform_admin())
with check (app_private.is_platform_admin());

create or replace view public.v_platform_companies
with (security_invoker = true)
as
select
  c.id as company_id,
  c.name as company_name,
  c.legal_name,
  c.tax_id,
  c.email,
  c.phone,
  c.company_type,
  c.parent_company_id,
  parent.name as parent_company_name,
  c.business_line,
  c.country,
  c.city,
  c.address,
  c.status,
  c.plan_id,
  p.code as plan_code,
  p.name as plan_name,
  count(cm.id) filter (where cm.enabled = true) as enabled_modules,
  count(cm.id) filter (where cm.enabled = false) as blocked_modules,
  c.created_at,
  c.updated_at
from public.companies c
left join public.companies parent on parent.id = c.parent_company_id
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
  c.company_type,
  c.parent_company_id,
  parent.name,
  c.business_line,
  c.country,
  c.city,
  c.address,
  c.status,
  c.plan_id,
  p.id,
  p.code,
  p.name,
  c.created_at,
  c.updated_at;

grant select on public.v_platform_companies to authenticated;
grant select, insert, update on public.company_admin_onboarding to authenticated;
