# PROD Administration APEX Permissions Audit

Date: 2026-07-01

## Scope

This audit covers the production permission blocker reported while using
Administracion APEX as the official flow for creating companies.

Production guardrails used:

- Environment file: `config/production.env`
- Supabase project: `jzbwzmkidfthknsohhnr`
- Backend: `https://apexos-api-prod-production.up.railway.app`
- Frontend: `https://apexos-web-prod-production.up.railway.app`
- QA project `jbirkghkekuifgfsgquq` was not used.
- No companies, users, demo data, or real customer data were created.

## Cause

Two blockers were found during the final production validation.
The post-deploy UI validation also surfaced one frontend access-state issue.

### Permission Grant Blocker

The first blocker was caused by a mismatch between RLS policies and table grants.

`public.companies` had RLS policies allowing platform administrators to insert,
select, and update rows, but the database role used through PostgREST did not
have the required table-level DML privilege. PostgreSQL requires both:

- a table grant, and
- a matching RLS policy.

Without the table grant, the request fails before RLS can authorize it:

```text
permission denied for table companies
```

### First Company Authorization Blocker

After the permission fix, a second blocker was found in the company endpoint
guard. `requirePlatformAdmin()` authorized the caller by reading
`public.v_platform_companies`. In a freshly initialized production environment,
`public.companies = 0`, so the view legitimately returned zero rows even though
the Platform SuperAdmin existed and was active. That made the first company
creation impossible.

The guard now validates the authenticated Supabase user against
`public.platform_admins` using `service_role` after reading `/auth/v1/user` from
the caller token. Only rows with `status = 'active'` pass.

### Frontend Module Access State

The dashboard and sidebar also used `public.v_platform_companies` to infer
whether the active Supabase session belonged to a Platform SuperAdmin. With
`public.companies = 0`, the session authenticated correctly but showed zero
active modules.

The frontend module-access resolver now reads `public.platform_admins` with the
authenticated user session and checks for an active row. Platform SuperAdmins can
see Administracion APEX and the platform navigation before the first company is
created.

## Tables And Views Audited

Audited tables and views used by the Administracion APEX company/user flow:

- `public.companies`
- `public.company_admin_onboarding`
- `public.company_modules`
- `public.company_users`
- `public.employees`
- `public.modules`
- `public.platform_admins`
- `public.profiles`
- `auth.users`
- `public.v_platform_companies`
- `public.v_platform_company_module_access`
- `public.v_company_module_status`

Requested names not present as lowercase public tables in PROD during this
audit: `tenants`, `users`, `roles`, `permissions`, `role_permissions`,
`audit_logs`.

## Correction Applied

Migration applied:

```text
supabase/production/20260701_prod_administration_apex_permissions.sql
```

Application hardening applied:

- `apps/web/app/api/platform/companies/route.ts` now inserts `companies` with
  `service_role` after `requirePlatformAdmin(token)` succeeds.
- `requirePlatformAdmin(token)` no longer depends on
  `public.v_platform_companies`; it verifies the caller's Auth user id against
  `public.platform_admins.status = 'active'`.
- `loadModuleAccess()` no longer infers Platform SuperAdmin status from company
  visibility; it checks `public.platform_admins.status = 'active'` for the
  authenticated session.

Permission changes:

- Kept RLS enabled on all touched public tables.
- Granted `service_role` `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the
  server-side administration tables.
- Granted `authenticated` only `SELECT` on the tables/views needed for scoped
  reads and platform-admin checks.
- Revoked write DML from `authenticated` on the flow tables.
- Revoked `TRUNCATE` from `anon`, `authenticated`, and `service_role` on the
  flow tables.
- Did not grant anonymous write access.

## Safety Validation

Validated after applying the migration:

- `npm run env:doctor:prod`: OK.
- Backend PROD `/health`: `{"status":"OK","version":"2.0","modules":13}`.
- `npm run prisma:validate`: OK.
- RLS remains enabled on the touched tables.
- `anon` cannot `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` `public.companies`.
- `authenticated` can `SELECT` `public.companies` but cannot `INSERT`
  `public.companies`.
- `authenticated` cannot `INSERT` or `UPDATE`
  `public.company_admin_onboarding`.
- `service_role` can `INSERT` into `public.companies`, `public.company_users`,
  `public.profiles`, and `public.company_admin_onboarding`.
- No company rows were created: `public.companies = 0`.
- No onboarding rows were created: `public.company_admin_onboarding = 0`.
- Existing production bootstrap remained: `auth.users = 1`.
- The production Platform SuperAdmin can pass the new non-destructive
  authorization check even while `public.companies = 0`.
- The production Platform SuperAdmin can resolve platform module access while
  `public.companies = 0`.

`npm run validate:production:structure` ran and reported the expected non-empty
bootstrap tables because Platform Initialization has already been completed:

- `profiles = 1`
- `platform_admins = 1`
- `User = 1`
- `auth.users = 1`

That validation failure is not a permission regression; the script still expects
an empty pre-initialization production database.

## Final State

Administracion APEX is ready for the next controlled UI test to create the first
company in production. No production company or customer user was created during
this audit.

## Next Steps

1. Deploy the application change so company creation uses `service_role` only
   after Platform SuperAdmin validation.
2. Log in as the production Platform SuperAdmin.
3. From Administracion APEX, create `NYVORA INTERNAL`.
4. From Administracion APEX, create `IMPORTADORA SCJ SAS`.
5. Verify each company and administrator through the UI and audit logs.
