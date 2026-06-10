# Variables por ambiente - QA y Produccion

Fecha: 2026-05-31  
Rama: `develop`

## Principios

- QA y produccion deben usar proyectos Supabase separados.
- Ninguna clave sensible debe versionarse.
- `SUPABASE_SERVICE_ROLE_KEY` solo puede existir en runtimes server-side y scripts operativos seguros.
- Ninguna variable privada debe tener prefijo `NEXT_PUBLIC_`.
- `APP_ENV` debe declarar explicitamente `local`, `qa` o `production`.

## Frontend Railway QA

Requeridas:

- `APP_ENV=qa`
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://<api-qa>`
- `NEXT_PUBLIC_WS_URL=wss://<api-qa>`
- `NEXT_PUBLIC_SUPABASE_URL=https://<supabase-qa-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-qa>`
- `NEXT_PUBLIC_SUPABASE_PROJECT_REF=<supabase-qa-ref>`
- `NEXT_PUBLIC_API_TIMEOUT_MS=20000`
- `NEXT_PUBLIC_SUPABASE_TIMEOUT_MS=20000`
- `NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES=45`

Server-side en frontend solo si se usan rutas Next administrativas:

- `SUPABASE_SERVICE_ROLE_KEY=<service-role-qa>`

## Backend Railway QA

Requeridas:

- `APP_ENV=qa`
- `NODE_ENV=production`
- `PORT=<railway-port>`
- `DATABASE_URL=<supabase-qa-postgres-url>`
- `JWT_SECRET=<secret-qa>`
- `FRONTEND_URL=https://<frontend-qa>`
- `ALLOWED_ORIGINS=https://<frontend-qa>`
- `REDIS_DISABLED=true`
- `DISABLE_REDIS=true`
- `NEXT_PUBLIC_SUPABASE_URL=https://<supabase-qa-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-qa>`
- `SUPABASE_URL=https://<supabase-qa-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<anon-key-qa>`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-qa>`

Opcionales segun modulo:

- `BRAIN_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `API_BODY_LIMIT_BYTES`
- `LOGIN_MAX_ATTEMPTS`
- `LOGIN_WINDOW_MINUTES`
- `LOGIN_LOCK_MINUTES`
- `MAX_EVIDENCE_BYTES`
- `MAX_DOCUMENT_BYTES`

## Supabase QA

Requeridas:

- Proyecto QA separado.
- RLS activo.
- Buckets privados.
- Datos demo marcados como QA/demo.
- Backups disponibles segun plan.

No debe contener datos reales de clientes.

## Frontend Railway Produccion

Requeridas:

- `APP_ENV=production`
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://<api-prod>`
- `NEXT_PUBLIC_WS_URL=wss://<api-prod>`
- `NEXT_PUBLIC_SUPABASE_URL=https://<supabase-prod-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-prod>`
- `NEXT_PUBLIC_SUPABASE_PROJECT_REF=<supabase-prod-ref>`
- `NEXT_PUBLIC_API_TIMEOUT_MS=20000`
- `NEXT_PUBLIC_SUPABASE_TIMEOUT_MS=20000`
- `NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES=45`

Server-side en frontend solo si aplica:

- `SUPABASE_SERVICE_ROLE_KEY=<service-role-prod>`

## Backend Railway Produccion

Requeridas:

- `APP_ENV=production`
- `NODE_ENV=production`
- `PORT=<railway-port>`
- `DATABASE_URL=<supabase-prod-postgres-url>`
- `JWT_SECRET=<secret-prod-rotado>`
- `FRONTEND_URL=https://<frontend-prod>`
- `ALLOWED_ORIGINS=https://<frontend-prod>`
- `CORS_ORIGIN=https://<frontend-prod>` si el proveedor exige ese nombre; mapearlo a `ALLOWED_ORIGINS`.
- `REDIS_DISABLED=false`
- `DISABLE_REDIS=false`
- `REDIS_URL=<redis-prod-url>`
- `NEXT_PUBLIC_SUPABASE_URL=https://<supabase-prod-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-prod>`
- `SUPABASE_URL=https://<supabase-prod-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<anon-key-prod>`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-prod>`

## Seed Produccion

Requeridas:

- `TARGET_ENV=production`
- `CONFIRM_PROD_SEED=true`
- `SUPABASE_URL=https://<supabase-prod-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-prod>`
- `INITIAL_USER_PASSWORD=<temporary-strong-password>` o `PROD_SEED_FILE=<secure-json-path>` con `temporary_password` por usuario.

Opcional:

- `PROD_SEED_FILE=<secure-json-path>`

## Supabase Produccion

Requeridas:

- Proyecto Supabase independiente de QA.
- Migraciones aplicadas en orden.
- RLS activo en tablas sensibles.
- Buckets privados y policies validadas.
- Backups diarios activos.
- PITR habilitado si el plan elegido lo permite.
- Datos demo excluidos.
- Secrets rotados y separados de QA.

## Validacion de secretos

Busqueda local ejecutada durante QA:

- No se encontro service role expuesta en componentes cliente.
- Los usos de `SUPABASE_SERVICE_ROLE_KEY` estan en rutas server-side, scripts operativos y documentacion sin valores reales.
- `.env.example` contiene nombres de variables, no valores reales.

## Checklist previo a produccion

- Rotar `JWT_SECRET` para produccion.
- Usar service role productiva distinta a QA.
- Confirmar `ALLOWED_ORIGINS` sin comodines.
- Confirmar `DATABASE_URL` productiva con SSL y pooler adecuado.
- Confirmar Redis real si se habilitan workers/crons.
- Confirmar que `REDIS_DISABLED` quede en `false` solo cuando `REDIS_URL` exista.
