-- Merge platform-admin access into tenant policies to avoid multiple permissive RLS paths.

drop policy if exists companies_select_platform_admin on public.companies;
drop policy if exists companies_update_platform_admin on public.companies;

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member
on public.companies
for select
to authenticated
using (
  app_private.is_company_member(id)
  or app_private.is_platform_admin()
);

drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin
on public.companies
for update
to authenticated
using (
  app_private.is_company_admin(id)
  or app_private.is_platform_admin()
)
with check (
  app_private.is_company_admin(id)
  or app_private.is_platform_admin()
);

drop policy if exists profiles_select_platform_admin on public.profiles;

drop policy if exists profiles_select_self_or_company on public.profiles;
create policy profiles_select_self_or_company
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or app_private.is_platform_admin()
  or exists (
    select 1
    from public.company_users viewer
    join public.company_users target on target.company_id = viewer.company_id
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and target.user_id = profiles.id
      and target.status = 'active'
  )
);

drop policy if exists company_users_select_platform_admin on public.company_users;
drop policy if exists company_users_insert_platform_admin on public.company_users;
drop policy if exists company_users_update_platform_admin on public.company_users;
drop policy if exists company_users_delete_platform_admin on public.company_users;

drop policy if exists company_users_select_member_companies on public.company_users;
create policy company_users_select_member_companies
on public.company_users
for select
to authenticated
using (
  app_private.is_company_member(company_id)
  or app_private.is_platform_admin()
);

drop policy if exists company_users_insert_admin on public.company_users;
create policy company_users_insert_admin
on public.company_users
for insert
to authenticated
with check (
  app_private.is_company_admin(company_id)
  or app_private.is_platform_admin()
);

drop policy if exists company_users_update_admin on public.company_users;
create policy company_users_update_admin
on public.company_users
for update
to authenticated
using (
  app_private.is_company_admin(company_id)
  or app_private.is_platform_admin()
)
with check (
  app_private.is_company_admin(company_id)
  or app_private.is_platform_admin()
);

drop policy if exists company_users_delete_admin on public.company_users;
create policy company_users_delete_admin
on public.company_users
for delete
to authenticated
using (
  app_private.is_company_admin(company_id)
  or app_private.is_platform_admin()
);

drop policy if exists company_modules_select_platform_admin on public.company_modules;
drop policy if exists company_modules_insert_platform_admin on public.company_modules;
drop policy if exists company_modules_update_platform_admin on public.company_modules;
drop policy if exists company_modules_delete_platform_admin on public.company_modules;

drop policy if exists company_modules_select_member on public.company_modules;
create policy company_modules_select_member
on public.company_modules
for select
to authenticated
using (
  app_private.is_company_member(company_id)
  or app_private.is_platform_admin()
);

drop policy if exists company_modules_insert_admin on public.company_modules;
create policy company_modules_insert_admin
on public.company_modules
for insert
to authenticated
with check (
  app_private.is_company_admin(company_id)
  or app_private.is_platform_admin()
);

drop policy if exists company_modules_update_admin on public.company_modules;
create policy company_modules_update_admin
on public.company_modules
for update
to authenticated
using (
  app_private.is_company_admin(company_id)
  or app_private.is_platform_admin()
)
with check (
  app_private.is_company_admin(company_id)
  or app_private.is_platform_admin()
);

drop policy if exists company_modules_delete_admin on public.company_modules;
create policy company_modules_delete_admin
on public.company_modules
for delete
to authenticated
using (
  app_private.is_company_admin(company_id)
  or app_private.is_platform_admin()
);
