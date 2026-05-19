-- Optimize QA RLS policies and missing FK index reported by Supabase Advisor.

create index if not exists idx_company_modules_module_id on public.company_modules(module_id);

drop policy if exists profiles_select_self_or_company on public.profiles;
create policy profiles_select_self_or_company
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
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

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
