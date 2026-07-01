# Certificacion final GO-LIVE - APEXOS/NYVORA

Fecha local: 2026-06-30  
Ambiente: Produccion  
Frontend PROD: `https://apexos-web-prod-production.up.railway.app`  
Backend PROD: `https://apexos-api-prod-production.up.railway.app`  
Supabase PROD ref: `jzbwzmkidfthknsohhnr`  
Rama objetivo: `main`  
Redis: deshabilitado intencionalmente

## Estado general

APTO CON OBSERVACIONES.

APEXOS/NYVORA queda listo para GO-LIVE tecnico despues de desplegar el commit generado por esta certificacion en Railway y ejecutar un smoke test autenticado con el primer usuario real. No se crearon usuarios, no se cargaron seeds/demo y no se modifico Supabase de forma destructiva.

## Resumen ejecutivo

- Backend PROD online: `/health` responde 200 con `{"status":"OK","version":"2.0","modules":13}`.
- Frontend PROD online: `/login` responde 200.
- CORS PROD correcto: preflight desde frontend productivo responde 204 con `access-control-allow-origin` exacto.
- Endpoint protegido sin token rechaza correctamente con 401 `TOKEN_INVALIDO`.
- Supabase PROD no destructivo: 112 tablas publicas, 145 policies publicas, 20 storage policies, 9 buckets, 16 funciones `app_private`, 0 fallas.
- Build productivo frontend: OK, 56 rutas.
- Secrets en HTML/chunks publicos: no se exponen `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ni `JWT_SECRET`.
- Referencias QA/local en frontend PROD: no hay ref QA ni localhost en HTML/chunks de aplicacion; solo polyfill de Next contiene texto `localhost`.

## Correcciones aplicadas

| Archivo | Modulo | Riesgo | Descripcion | Correccion | Resultado |
| --- | --- | --- | --- | --- | --- |
| `apps/api/src/modules/projects/service.js` | Proyectos | Medio | `listProjects` podia crear automaticamente un proyecto demo si la tabla estaba vacia. | `ensureDemo` queda deshabilitado en produccion salvo `ALLOW_DEMO_DATA=true`. | Produccion no crea datos demo por navegacion. |
| `apps/api/src/modules/hr/service.js` | Talento humano | Bajo | Catalogo inicial de tipos de actividad se marcaba con `is_demo=true`. | Metadata cambiada a `source: apexos_operational_traceability`. | Catalogo inicial deja de quedar clasificado como demo. |
| `apps/web/app/api/admin/users/route.ts` | Usuarios | Medio | Si faltaba documento, el fallback generaba `QA-*`. | Fallback cambiado a `USR-*`. | Creacion productiva no arrastra prefijo QA. |

## Pruebas ejecutadas

Locales:

- `npm.cmd run prisma:validate`: OK.
- `npm.cmd --workspace apps/web run typecheck`: OK.
- `npm.cmd --workspace apps/web run lint`: OK.
- `npm.cmd --workspace apps/web run build`: OK, 56 rutas.
- `node --check apps/api/server.js`: OK.
- `node --check apps/api/src/security/supabaseAuth.js`: OK.
- `node --check apps/api/src/modules/projects/service.js`: OK.
- `node --check apps/api/src/modules/hr/service.js`: OK.
- `node --check scripts/validate-production-structure.js`: OK.
- `node --check scripts/seed-production-initial.js`: OK.
- `git diff --check`: OK, solo avisos LF/CRLF del entorno Windows.

Remotas PROD:

- `GET /health` backend PROD: 200 OK.
- `OPTIONS /api/v1/auth/login` con origen frontend PROD: 204 OK.
- `HEAD /login` frontend PROD: 200 OK.
- `GET /api/v1/admin/users` sin token: 401 controlado.
- `npm.cmd run validate:production:structure` contra Supabase PROD: OK, `failures: []`.
- HTML `/login`: sin `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, ref QA ni localhost.
- Chunks JS publicos: chunks de aplicacion con API PROD, sin ref QA, sin secretos; polyfill Next contiene texto `localhost` no operativo.

## Hallazgos no bloqueantes

- Railway logs backend/frontend no se auditaron por CLI autenticado. Se recomienda revisarlos en dashboard tras el deploy final.
- No se ejecuto smoke test autenticado por restriccion expresa de no crear usuarios todavia.
- Existen degradaciones controladas `catch(() => undefined)` en UI y helpers. No bloquearon build ni flujo publico; deben migrarse gradualmente a telemetria client-side con usuarios reales.

## Riesgos criticos antes de entregar

- Deploy final de `main` con el commit GO-LIVE.
- Confirmar en Railway que backend y frontend quedaron en el hash GO-LIVE.
- Crear primer usuario real y ejecutar smoke test autenticado.

## Checklist de entrega cliente

1. Desplegar `main` en Railway.
2. Validar `/health` y CORS post-deploy.
3. Revisar logs Railway backend/frontend por 10-15 minutos.
4. Crear empresa real.
5. Crear superadministrador interno.
6. Crear administrador cliente.
7. Crear tecnicos base.
8. Validar login real, dashboard, administracion, usuarios, roles, maestros, servicios, vehiculos, transporte, marcaciones, evidencias/storage y logs tecnicos.
9. Mantener monitoreo activo durante el primer dia operativo.

## Confirmacion

APEXOS/NYVORA CERTIFICADO PARA GO-LIVE con observaciones operativas controladas.
