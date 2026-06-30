# Certificacion productiva senior - APEXOS/NYVORA

Fecha: 2026-06-30  
Ambiente: Produccion  
Frontend PROD: `https://apexos-web-prod-production.up.railway.app`  
Backend PROD: `https://apexos-api-prod-production.up.railway.app`  
Supabase PROD ref: `jzbwzmkidfthknsohhnr`  
Rama productiva: `main`  
Commit base certificado: `d3568d0`  
Redis: deshabilitado intencionalmente

## Estado general

APTO CON OBSERVACIONES.

Produccion esta operativa para iniciar la preparacion de empresa y usuarios base, con una condicion operacional: desplegar el commit posterior a esta certificacion antes de crear usuarios reales, porque corrige marcas QA/demo en sincronizacion de tenant y fallback de usuarios.

## Resultado por frente

### 1. Infraestructura

- Frontend PROD `/login`: HTTP 200.
- Backend PROD `/health`: HTTP 200, `{"status":"OK","version":"2.0","modules":13}`.
- CORS productivo: `OPTIONS /api/v1/auth/login` desde `https://apexos-web-prod-production.up.railway.app` responde 204.
- Redis: deshabilitado de forma intencional; backend arranca sin `REDIS_URL`.
- Commit desplegado: comportamiento CORS confirma despliegue minimo de `d3568d0`.
- Logs Railway: no auditados por CLI desde esta sesion por limite de ejecucion/autenticacion disponible.

### 2. Integracion frontend-backend-Supabase

- Frontend online y servido por Railway.
- Backend online y con acceso DB evidenciado por `Server-Timing` en `/health`.
- Prisma local valida schema contra `apps/api/prisma/schema.prisma`.
- Prisma remoto PROD fue validado en la auditoria previa del mismo dia con 0 tablas/columnas faltantes.
- Auth y Storage PROD permanecen sin carga inicial: 0 usuarios Auth y 0 objetos Storage en la ultima validacion productiva previa.
- Flujo browser -> frontend -> API queda desbloqueado a nivel CORS.

### 3. Seguridad

- Frontend HTML PROD revisado: no expone `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, ref QA ni localhost.
- Endpoints protegidos rechazan sin token: `GET /api/v1/admin/users` devuelve 401 `TOKEN_INVALIDO`.
- RLS publicas y buckets privados fueron validados previamente en PROD: 112 tablas publicas, 0 sin RLS, 9 buckets privados, 20 storage policies.
- CORS responde solo al origen frontend productivo; no se valido comodin.
- Service role aparece como variable server-side, no como valor versionado.

### 4. Errores silenciosos y trazabilidad

Corregido:

- `apps/api/server.js`: logs de performance ya no usan nombre QA.
- `apps/web/app/dashboard/administracion/page.tsx`: texto visible de Supabase ya no dice QA.
- `apps/api/src/security/supabaseAuth.js`: tenants sincronizados en produccion usan sufijo `prod` y plan `production_sync`; QA conserva `qa_sync`.
- `apps/web/lib/api.ts`: fallback de usuarios ya no usa `Usuario demo`, `QA-*`, `is_demo=true` ni `demo_batch`.

Pendiente no bloqueante:

- Hay `catch(() => undefined)` y degradaciones controladas en UI para evitar pantallas blancas. Deben migrarse gradualmente a logs tecnicos client-side cuando haya usuarios reales.
- El script de tema en `apps/web/app/layout.tsx` mantiene `catch(e){}` intencional para no romper el primer render.

### 5. Usuarios y permisos base

No se crearon usuarios.

El sistema soporta el flujo siempre que se creen datos consistentes:

1. Crear empresa real en `companies`.
2. Crear usuario en Supabase Auth.
3. Asociar usuario en `company_users` con rol `owner`, `admin`, `superadmin` o rol operativo.
4. En primer login, `apps/api/src/security/supabaseAuth.js` sincroniza `Tenant`, `Role`, `Permission` y `User`.
5. Validar acceso con token real y tenant correcto.

Usuarios previstos:

- Superadministrador interno/fundador: rol global/plataforma.
- Administrador cliente: `owner` o `admin` limitado a su empresa.
- Tecnicos base: rol operativo, ficha `employees` cuando aplique, sin permisos administrativos.

### 6. Modulos funcionales minimos

Build productivo genero 56 rutas:

- Login: ruta estatica OK.
- Dashboard: ruta estatica OK.
- Administracion: ruta estatica OK; texto Supabase corregido.
- Usuarios/Roles/Maestros: disponibles por Administracion y rutas Next API.
- Servicios: rutas de dashboard y APIs publicas/monitor disponibles en build.
- Vehiculos/Transporte/Rutas: rutas de transporte y talento humano disponibles en build.
- Marcaciones: ruta `talento-humano/marcacion` disponible en build.
- Evidencias/Storage: helpers de Storage validan status y devuelven error controlado.
- Logs tecnicos: backend registra errores con `request_id`; endpoint protegido rechaza sin token.

Sin usuarios reales no se certifica navegacion autenticada por rol; queda para el primer smoke test post-creacion.

### 7. Preparacion de entrega al cliente

Listo para preparar go-live si se completa:

- Deploy del commit de certificacion en `main`.
- Confirmar health y CORS post-deploy.
- Validar logs Railway backend/frontend desde dashboard.
- Crear empresa real.
- Crear superadmin interno.
- Crear administrador cliente.
- Crear tecnicos base.
- Habilitar modulos contratados.
- Ejecutar smoke test autenticado.

## Comandos ejecutados

- `npm.cmd run prisma:validate`: OK.
- `npm.cmd --workspace apps/web run typecheck`: OK.
- `npm.cmd --workspace apps/web run lint`: OK.
- `npm.cmd --workspace apps/web run build`: OK, 56 rutas.
- `node --check apps/api/server.js`: OK.
- `node --check apps/api/src/security/supabaseAuth.js`: OK.
- `curl /health` backend PROD: OK 200.
- `curl OPTIONS /api/v1/auth/login` con origen frontend PROD: OK 204.
- `curl /api/v1/admin/users` sin token: OK 401 controlado.
- Scan de secretos en archivos tocados/docs: sin secretos literales; solo placeholders de documentacion.
- Scan QA/local: referencias activas corregidas en archivos tocados; quedan referencias locales solo para desarrollo/QA, docs o fallback no productivo.

## Hallazgos

| Severidad | Archivo | Descripcion | Correccion |
| --- | --- | --- | --- |
| Media | `apps/api/src/security/supabaseAuth.js` | Tenant mirror usaba dominio `.qa` y plan `qa_sync` tambien en produccion. | Ahora usa `prod`/`production_sync` cuando `APP_ENV`, `TARGET_ENV` o `NODE_ENV` son production. |
| Media | `apps/web/lib/api.ts` | Fallback de usuario podia generar `Usuario demo`, documento `QA-*` y metadata demo. | Se cambio a valores neutrales `Usuario`, `USR-*` y `source`. |
| Baja | `apps/api/server.js` | Log interno decia `QA performance logging`. | Texto cambiado a `performance logging`. |
| Baja | `apps/web/app/dashboard/administracion/page.tsx` | Texto UI decia `Conexion QA`. | Texto cambiado a `Conexion Auth, Storage y RLS`. |

## Riesgos antes de entregar

- Debe desplegarse el commit de esta certificacion antes de crear usuarios reales.
- Falta validar logs Railway backend/frontend con acceso al dashboard o CLI autenticado.
- Falta smoke test autenticado porque no se deben crear usuarios todavia.

## Riesgos menores post go-live

- Centralizar degradaciones frontend silenciosas hacia logs tecnicos.
- Validar modulo por modulo con usuario real y roles reales.
- Habilitar Redis productivo solo cuando existan provider, URL y monitoreo.

## Siguiente paso exacto

Para crear empresa y usuarios base se deben suministrar:

- Nombre legal y comercial de la empresa.
- NIT/documento, pais, ciudad, direccion y correo principal.
- Modulos contratados.
- Datos del superadministrador interno: nombre, email, documento y rol.
- Datos del administrador cliente: nombre, email, documento, telefono y rol.
- Lista de tecnicos base: nombre, email, documento, telefono, cargo, sede/base y permisos.

Confirmacion: Produccion lista para crear empresa y usuarios base despues de desplegar el commit de certificacion y ejecutar smoke test autenticado.
