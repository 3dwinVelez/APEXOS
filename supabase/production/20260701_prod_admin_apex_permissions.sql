-- APEXOS/NYVORA PROD - Administracion APEX permissions certification
-- Scope: grants/usages/default privileges only. No data mutation.
-- Objective: allow the official Administration APEX flow to pass through
-- Supabase REST + RLS without permission denied errors.

begin;

-- Schema access required by Supabase REST and RLS helper functions.
grant usage on schema public to authenticated, service_role;
grant usage on schema app_private to authenticated, service_role;

-- Authenticated user surface.
-- These grants only expose tables to the Data API; RLS remains enabled and
-- policies keep access limited to platform admins or company-scoped admins.
grant select on table
  public.companies,
  public.modules,
  public.plans,
  public.plan_modules,
  public.company_modules,
  public.company_users,
  public.platform_admins,
  public.profiles,
  public.employees,
  public.company_admin_onboarding,
  public.v_platform_companies,
  public.v_platform_company_module_access,
  public.v_user_companies
to authenticated;

grant insert on table public.companies to authenticated;
grant insert, update on table public.company_modules to authenticated;
grant insert, update on table public.profiles to authenticated;

-- Server-side Administration APEX surface.
-- Used only by Next.js API routes with SUPABASE_SERVICE_ROLE_KEY.
grant select, insert, update on table
  public.companies,
  public.company_modules,
  public.company_users,
  public.company_admin_onboarding,
  public.profiles,
  public.platform_admins,
  public.employees,
  public.modules,
  public.plans,
  public.plan_modules,
  public.user_master_documents,
  public.user_master_audit_events
to service_role;

grant select, insert, update on table
  public."Tenant",
  public."User",
  public."Role",
  public."Permission"
to service_role;

grant select on table
  public.v_platform_companies,
  public.v_platform_company_module_access,
  public.v_user_companies
to service_role;

-- Sequences used by Prisma/core user, role, permission and user-master audit tables.
grant usage, select, update on sequence
  public."User_id_seq",
  public."Role_id_seq",
  public."Permission_id_seq",
  public.user_master_audit_events_id_seq
to service_role;

-- Helper functions used by RLS policies and company module initialization.
grant execute on function app_private.is_platform_admin() to authenticated, service_role;
grant execute on function app_private.is_company_member(uuid) to authenticated, service_role;
grant execute on function app_private.is_company_admin(uuid) to authenticated, service_role;
grant execute on function app_private.has_company_module(uuid, text) to authenticated, service_role;
grant execute on function app_private.initialize_company_modules() to service_role;

-- Keep future postgres-owned operational objects usable by server-side flows.
-- No anon default privileges are added here.
alter default privileges for role postgres in schema public
  grant select, insert, update on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

commit;
