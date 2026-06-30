# APEXOS Production Main + Own Domain Runbook

## Status Executed Locally

Date: 2026-06-28 America/Bogota
Branch: desarrollo
Working tree before changes: clean

Completed validations:
- `npm.cmd run workflow:status`: branch `desarrollo`, clean tree, local branches `desarrollo`, `develop`, `main`, remotes `origin/desarrollo`, `origin/develop`, `origin/main`.
- `npm.cmd run prisma:validate`: Prisma schema valid.
- `npm.cmd --workspace apps/web run typecheck`: passed.
- `npm.cmd --workspace apps/web run lint`: passed.
- `npm.cmd --workspace apps/web run build`: passed before the deterministic suite; 56 routes generated.
- `node --check apps/api/server.js`: passed.
- `node --check apps/api/src/security/supabaseAuth.js`: passed after Supabase module sync hardening.
- `node --check scripts/validate-production-structure.js`: passed.
- `node --check scripts/seed-production-initial.js`: passed.
- `npm.cmd run qa:deterministic-validation`: API and Supabase module validation reached OK; final frontend build stopped with `ENOSPC` because local disk had no write space for webpack cache.

Blocked or pending:
- `npm audit --audit-level=high` needs explicit approval because it sends dependency metadata to the public npm audit endpoint.
- Repeat full `qa:deterministic-validation` after freeing local disk space.
- External production setup needs Railway, Supabase PROD and DNS provider access.

## Reliability Finding Fixed In This Pass

Risk: Supabase tenant module synchronization was cumulative. If a module had been enabled before and later disabled in Supabase, the Prisma tenant mirror could keep the old module in `active_modules`, allowing API routes to remain accessible.

Change made:
- Existing and newly mirrored Supabase tenants now synchronize `active_modules` exactly from `v_company_module_status` instead of merging old and new values.
- Tenant cache is invalidated after module synchronization.

Production impact:
- RBAC module gates now follow the current Supabase entitlement state.
- This is required before connecting `main` to the production environment.

## Phase 1 - Branch Gate To Main

1. Confirm `desarrollo` is clean:
   - `npm.cmd run workflow:status`
   - `git status --short`
2. Run local gates:
   - `npm.cmd run prisma:validate`
   - `npm.cmd --workspace apps/web run typecheck`
   - `npm.cmd --workspace apps/web run lint`
   - `npm.cmd --workspace apps/web run build`
   - `node --check apps/api/server.js`
   - `npm.cmd run qa:deterministic-validation`
3. Promote using repo workflow only after gates pass:
   - `npm.cmd run sync-desarrollo`
   - promote `desarrollo -> develop`
   - promote `develop -> main`
4. `main` must be the only branch connected to production deployments.

## Phase 2 - Supabase Production

1. Create a dedicated Supabase PROD project, separate from QA.
2. Use a paid plan for predictable limits, backups and operational support.
3. Store secrets in a secret manager, not in git. For local operational work, use `.env.production.local`; it is ignored by git through `.env.*`:
   - `APP_ENV=production`
   - `NODE_ENV=production`
   - `TARGET_ENV=production`
   - `CONFIRM_PROD_VALIDATE=true`
   - `NEXT_PUBLIC_SUPABASE_PROJECT_REF`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`
4. Required confirmations before any write to Supabase PROD:
   - Project ref matches the production project, not QA.
   - `DATABASE_URL` points to the production database, preferably the pooler URL for deployed runtimes.
   - The project is empty or every existing table/data set has been documented.
   - Auth Site URL and Redirect URLs are known for the production domain.
   - A backup/snapshot strategy exists before first production write.
   - The operator has explicitly approved the write step.
5. Read-only preflight:
   - Confirm current database, user, Postgres version and schema list.
   - Confirm migration table/history state.
   - Count existing tables in `public`, `storage`, and auth-adjacent schemas without dumping data.
   - Confirm required extensions.
   - Confirm no QA project ref, QA URL or QA seeded company is present.
6. Apply schema in order only after preflight passes:
   - Supabase migrations under `supabase/migrations`.
   - Prisma push against PROD only after migration review.
7. Remove QA/demo data:
   - `supabase/production/cleanup_prod_seed_data.sql`
8. Validate empty production structure:
   - `npm.cmd run validate:production:structure`
9. Do not run demo seeds in PROD.

Production write policy:
- No destructive SQL without a dated backup/snapshot and a rollback note.
- No `service_role` key in browser/client environments.
- No `NEXT_PUBLIC_` prefix for service-role or database credentials.
- No localhost or QA redirect URLs left in Supabase Auth after the validation window.
- Every exposed public table must be reviewed for RLS and grants before opening access.

## Phase 3 - Railway Production

Recommended services:
- `apexos-web-production` from `main`.
- `apexos-api-production` from `main`.
- Redis production service or managed Redis URL.

API production env:
- `APP_ENV=production`
- `NODE_ENV=production`
- `PORT=<railway provided>`
- `DATABASE_URL=<supabase prod pooled url>`
- `SUPABASE_URL=<prod url>`
- `NEXT_PUBLIC_SUPABASE_URL=<prod url>`
- `SUPABASE_ANON_KEY=<prod anon>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<prod anon>`
- `SUPABASE_SERVICE_ROLE_KEY=<prod service role>`
- `JWT_SECRET=<strong generated secret>`
- `FRONTEND_URL=https://app.<domain>`
- `ALLOWED_ORIGINS=https://app.<domain>`
- `CORS_ORIGIN=https://app.<domain>` si Railway usa ese nombre; la API lo acepta como alias.
- `DISABLE_REDIS=true` para la primera salida productiva sin Redis.
- `REDIS_DISABLED=true` opcional/equivalente.
- No definir `REDIS_URL` hasta habilitar Redis productivo.

Cuando Redis productivo este listo:

- `DISABLE_REDIS=false`
- `REDIS_DISABLED=false`
- `REDIS_URL=<prod redis url>`

Web production env:
- `APP_ENV=production`
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://api.<domain>`
- `NEXT_PUBLIC_WS_URL=wss://api.<domain>`
- `NEXT_PUBLIC_SUPABASE_URL=<prod url>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<prod anon>`
- `NEXT_PUBLIC_SUPABASE_PROJECT_REF=<prod ref>`

Hard rules:
- No wildcard CORS in production.
- No QA origins after cutover.
- Service role key only server-side.

## Phase 4 - Own Domain

Recommended DNS shape:
- `app.<domain>` -> APEXOS web application.
- `api.<domain>` -> APEXOS API.
- `www.<domain>` -> optional marketing/redirect.
- `solicitudes.<domain>` -> optional public services portal if we want isolation later.

Railway domain process:
1. Add custom domain in Railway for the web service: `app.<domain>`.
2. Add custom domain in Railway for the API service: `api.<domain>`.
3. Copy the DNS records Railway provides, normally CNAME and verification records.
4. Create those DNS records in the registrar or DNS provider.
5. Wait for propagation and Railway SSL provisioning.
6. Verify:
   - `https://app.<domain>/login`
   - `https://api.<domain>/health`
   - `wss://api.<domain>` if websocket is used from the browser.

Supabase Auth settings:
- Site URL: `https://app.<domain>`.
- Redirect URLs: login/callback URLs used by the app.
- Remove localhost and QA URLs from PROD after validation.

## Phase 5 - Production Smoke Tests

Before opening access:
- API `/health` returns OK.
- Web `/login` loads from `app.<domain>`.
- Login with initial production admin works.
- Unauthorized protected endpoints return 401/403.
- Disabled module endpoint returns `MODULO_NO_HABILITADO`.
- Dashboard loads with empty or intentional initial data only.
- No demo tenants, users, projects, orders or QA records.
- File upload/download works with tenant isolation.
- Mobile widths 360, 390, 414, 768 render without overlap.
- Logs show no secret leakage.

## Phase 6 - Seed Policy

Only after production structure is validated:
- Create one production owner/admin.
- Create required company tenant metadata.
- Do not seed demo operational records.
- Record seed execution date, executor and script hash.

## Phase 7 - Cutover And Rollback

Cutover:
- Freeze production deploys during DNS switch.
- Deploy `main` to Railway production.
- Point DNS to Railway-provided records.
- Smoke test before notifying users.

Rollback:
- Revert Railway deployment to previous successful build.
- Keep previous DNS records documented before change.
- Keep Supabase backup/snapshot before first production write.

## Open Decisions Needed

- Final domain name and DNS provider.
- Whether the app lives at `app.<domain>` or root domain.
- Railway project/team access.
- Supabase PROD project credentials.
- Redis production provider and plan.
- Approval to run external `npm audit` from this private repo.
- Local disk cleanup to rerun full deterministic suite.
