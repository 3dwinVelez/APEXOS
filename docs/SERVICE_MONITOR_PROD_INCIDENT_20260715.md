# Service Monitor Production Incident - 2026-07-15

## Symptom

The user `servicioensamblemuebles@gmail.com` could open `/dashboard/servicios` for `IMPORTADORA SCJ SAS`, but the page showed `0 de 0 orden(es) visibles` while another user in the same company saw 3 service orders.

## Verified Root Causes

1. `service_role` in Supabase PROD did not have `SELECT` privileges on:
   - `public.service_orders`
   - `public.service_incidents`
   - `public.service_evidence`

   The Next.js monitor endpoint uses `service_role`, so `/api/services/monitor-orders` failed with PostgREST 403 and the frontend converted that failure into an empty list.

2. The affected user had inconsistent role state:
   - `employees.metadata.role_name = "Administrador de empresa"`
   - `employees.metadata.access.role_name = "Administrador de empresa"`
   - `company_users.role = "member"`

   `company_users.role` is the authoritative role for Supabase RLS/backend company scope.

## Production Fix Applied

Applied `supabase/production/20260715_prod_service_monitor_role_scope_fix.sql`.

Effects verified:

- `service_role` can read `service_orders`, `service_incidents`, and `service_evidence`.
- The affected user's `company_users.role` is now `admin`.
- The affected company has 3 service orders visible to the monitor:
  - `OS-00001` `agendado`
  - `OS-00002` `agendado`
  - `OS-00003` `agendado`

## Code Guardrail

`apps/web/app/dashboard/servicios/page.tsx` now throws monitor endpoint errors instead of silently returning an empty list, preventing false "no orders" screens when the backend query fails.
