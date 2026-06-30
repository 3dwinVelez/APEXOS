# Auditoria senior de estabilidad productiva - APEXOS/NYVORA

Fecha: 2026-06-30  
Ambiente: Produccion  
Backend: `https://apexos-api-prod-production.up.railway.app`  
Frontend: `https://apexos-web-prod-production.up.railway.app`  
Supabase PROD ref: `jzbwzmkidfthknsohhnr`  
Commit base auditado: `2e458c6`

## Estado general

APTO CON OBSERVACIONES.

Produccion esta operativa a nivel infraestructura, schema, build y health-check. Se detecto un hallazgo critico de CORS en el backend desplegado: el preflight `OPTIONS /api/v1/auth/login` respondia 404 cuando el origen productivo no estaba incluido por la variable exacta `ALLOWED_ORIGINS`. Se corrigio el codigo para aceptar tambien `CORS_ORIGIN` y `FRONTEND_URL` como aliases de origen permitido, sin abrir comodines.

La correccion requiere despliegue del nuevo commit en Railway para quedar activa en PROD.

## Resumen ejecutivo

Validado:

- Backend PROD online: `/health` responde `{"status":"OK","version":"2.0","modules":13}`.
- Frontend PROD online: HTTP 200, titulo `APEX OS`.
- Supabase PROD: 112 tablas publicas, 0 tablas publicas sin RLS, 9 buckets privados, 0 usuarios Auth, 0 objetos Storage.
- Prisma Client contra Supabase PROD: modelos criticos accesibles (`Tenant`, `User`, `Role`, `Vehicle`, `ServiceOrder`) con conteos 0.
- Redis deshabilitado de forma controlada con `DISABLE_REDIS=true`; el backend usa colas noop, cache en memoria y no carga workers/crons.
- Frontend bundle inicial: contiene API PROD, no contiene ref QA ni localhost en chunks de aplicacion revisados. El polyfill de Next contiene texto `localhost`, no es configuracion APEXOS.
- Gates locales: Prisma validate, typecheck, lint y build frontend pasaron.

Bloqueo antes de entrega plena:

- Redeploy backend Railway con el commit que corrige CORS.
- Validar nuevamente preflight CORS en Railway despues del redeploy.
- Railway logs no pudieron validarse desde esta sesion porque no hay autenticacion CLI disponible.

## Hallazgos

| Severidad | Modulo | Archivo | Descripcion | Accion |
| --- | --- | --- | --- | --- |
| Critica | Backend/CORS | `apps/api/server.js` | El backend solo leia `ALLOWED_ORIGINS`. Si Railway tenia `CORS_ORIGIN` o `FRONTEND_URL`, el origen productivo quedaba no permitido y el preflight devolvia 404. | Corregido: `configuredOrigins` ahora lee `ALLOWED_ORIGINS`, `CORS_ORIGIN` y `FRONTEND_URL`. Validado localmente con `CORS_ORIGIN` solamente: 204 No Content. |
| Baja | Backend/Operabilidad | `apps/api/server.js` | Con Redis deshabilitado el log decia `QA mode`, aun en PROD. Podia inducir diagnosticos incorrectos. | Corregido a `Redis disabled: background workers and crons disabled`. |
| Media | Frontend server-side | `apps/web/app/api/**` | Hay rutas Next server-side que usan `SUPABASE_SERVICE_ROLE_KEY`. No se encontro exposicion client-side, pero aumenta el blast radius si esa key se configura en el runtime web. | Recomendacion: mantener service role solo en backend API cuando sea posible; si se conserva en web, verificar que nunca tenga prefijo `NEXT_PUBLIC_`. |
| Media | Observabilidad | Railway | Logs backend/frontend no fueron auditables desde CLI por falta de login/token Railway en esta sesion. | Pendiente operativo: validar logs en dashboard o CLI autenticado post-redeploy. |

## Errores silenciosos

Encontrados:

- `apps/web/app/layout.tsx`: script inline de tema contiene `catch(e){}`. Riesgo bajo; corre antes de React para evitar parpadeo visual. No se modifica por ser intencional y no afectar datos ni seguridad.
- `apps/web/app/dashboard/page.tsx`: usa `console.error` en fallos de carga de dashboard. Riesgo medio-bajo; el dashboard ya tiene degradacion visual. Recomendacion futura: enviar esos errores a `platform-logs/client`.
- `apps/api/src/core/tenantCache.js`: ignora errores Redis y cae a DB. Riesgo bajo y esperado; Redis es acelerador.

Corregidos:

- CORS preflight productivo con aliases de configuracion.
- Log confuso de Redis deshabilitado.

Pendientes:

- Centralizar errores frontend no criticos hacia el endpoint de logs tecnicos.

## Validacion de modulos

| Modulo | Prueba | Resultado | Observacion |
| --- | --- | --- | --- |
| Infra backend | `GET /health` PROD | OK | API responde version 2.0, 13 modulos. |
| Infra frontend | `GET /login` PROD | OK | HTTP 200, sin QA/local en HTML inicial. |
| Auth | `POST /api/v1/auth/login {}` | OK controlado | HTTP 400 con `request_id`. |
| Auth/permisos | `GET /api/v1/admin/users` sin token | OK controlado | HTTP 401 JSON `TOKEN_INVALIDO`. |
| Servicios | `GET /api/v1/services/references` token invalido | OK controlado | HTTP 401 JSON `TOKEN_INVALIDO`. |
| Dashboard/login frontend | Bundle login | OK con observacion | API PROD detectada en chunks de app; sin QA/local en chunks de aplicacion revisados. |
| Redis | Arranque local production sin `REDIS_URL` y `DISABLE_REDIS=true` | OK | Colas noop, workers/crons deshabilitados. |
| Prisma | Prisma Client contra PROD | OK | Tablas criticas accesibles, conteos 0. |

## Seguridad

RLS:

- `tables_without_rls = 0`.
- 112 tablas publicas.
- 145 policies publicas.

Storage:

- 9 buckets privados.
- 20 storage policies.
- 0 objetos storage.

Auth:

- 0 usuarios Auth en PROD.
- No se crearon usuarios durante esta auditoria.

Secrets:

- No se detectaron passwords crudos ni service role JWTs versionados en codigo de runtime.
- La migracion SQL productiva contiene policies `service_role`, no secretos.
- `SUPABASE_SERVICE_ROLE_KEY` aparece en scripts/server routes como variable de entorno, no como valor.

CORS:

- Hallazgo critico corregido en codigo.
- Requerido en Railway backend: `ALLOWED_ORIGINS` o `CORS_ORIGIN` o `FRONTEND_URL` con el dominio frontend productivo.
- No usar comodines.

Tenant isolation:

- API usa middleware Prisma con `tenant_id` para modelos tenant-aware.
- Supabase RLS esta activo en tablas publicas.
- Pendiente funcional real: crear usuarios base y validar permisos con tenants reales.

## Validacion usuarios base

No se crearon usuarios.

El sistema soporta el flujo requerido, condicionado a configurar correctamente Supabase PROD y crear registros consistentes:

1. Crear usuario en Supabase Auth.
2. Crear/validar `companies` o tenant empresarial.
3. Crear membership en `company_users`.
4. En primer login Supabase, `apps/api/src/security/supabaseAuth.js` sincroniza espejo Prisma:
   - `Tenant`
   - `Role`
   - `Permission`
   - `User`
5. Validar permisos desde API protegida con token real.

Usuarios a preparar:

- Superadministrador interno: rol plataforma/global admin, acceso transversal controlado. Requiere definir si vive en `platform_admins`, Prisma `Role` `APEX_ADMIN`, o ambos.
- Administrador cliente: owner/admin en `company_users`, tenant/empresa definida y modulos contratados activos.
- Tecnicos base: membership de empresa, permisos operativos sin permisos administrativos, relacion opcional a `employees`.

Riesgos:

- Usuarios huerfanos si Auth se crea pero falla `company_users`/perfil.
- Service role mal ubicado en frontend runtime.
- RLS debe validarse con tokens reales una vez existan usuarios.

## Comandos ejecutados

- `Invoke-RestMethod https://apexos-api-prod-production.up.railway.app/health`: OK.
- `Invoke-WebRequest https://apexos-web-prod-production.up.railway.app`: OK 200.
- SQL Supabase PROD: tablas/RLS/buckets/Auth/Storage: OK.
- `npm.cmd run prisma:validate`: OK.
- `npm.cmd --workspace apps/web run typecheck`: OK.
- `npm.cmd --workspace apps/web run lint`: OK.
- `npm.cmd --workspace apps/web run build`: OK.
- `node --check apps/api/server.js`: OK.
- `curl GET /api/v1/admin/users` sin token: 401 controlado.
- `curl GET /api/v1/services/references` token invalido: 401 controlado.
- `curl POST /api/v1/auth/login {}`: 400 controlado con `request_id`.
- `curl OPTIONS /api/v1/auth/login` en PROD actual: 404 antes del redeploy correctivo.
- Arranque local backend production con `CORS_ORIGIN` y `DISABLE_REDIS=true`: preflight 204 validado.
- Prisma Client contra Supabase PROD: OK.

## Archivos modificados

- `apps/api/server.js`: agrega aliases `CORS_ORIGIN` y `FRONTEND_URL` para CORS productivo; corrige log de Redis deshabilitado.
- `docs/PRODUCTION_STABILITY_AUDIT_20260630.md`: reporte de auditoria.
- `docs/ENVIRONMENT_VARIABLES_QA_PROD.md`: actualizado para reflejar aliases CORS y salida inicial sin Redis.

## Confirmacion final

Produccion lista para crear usuarios base despues de redeploy del backend con la correccion CORS y verificacion de logs Railway post-deploy.
