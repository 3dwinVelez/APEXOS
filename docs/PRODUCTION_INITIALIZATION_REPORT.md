# Production Initialization Report - APEXOS/NYVORA

Fecha: 2026-07-01  
Ambiente: Produccion  
Commit inicial: `0012cbf`  
Backend PROD: `https://apexos-api-prod-production.up.railway.app`  
Frontend PROD: `https://apexos-web-prod-production.up.railway.app`  
Supabase PROD ref: `jzbwzmkidfthknsohhnr`

## Resultado final

ONBOARDING BLOQUEADO.

No se ejecuto la inicializacion real ni se creo Platform SuperAdmin porque los datos entregados no incluyen `Documento`, campo obligatorio del proceso oficial `platform:init`.

El bloqueo ocurrio antes de cualquier escritura en Supabase Auth, Prisma o tablas publicas.

## Validacion previa

Infraestructura:

- Backend PROD `/health`: OK 200, `{"status":"OK","version":"2.0","modules":13}`.
- Backend PROD `/version`: 404 controlado; endpoint no existe.
- Frontend PROD `/login`: OK 200.
- Supabase PROD estructura: OK.
- Prisma PROD por `validate:production:structure`: OK.

Estado productivo confirmado:

- `platform_admins = 0`.
- `companies = 0`.
- `auth.users = 0`.
- `Tenant = 0`.
- `User = 0`.
- `validate:production:structure`: `failures: []`.

## Datos recibidos para Platform SuperAdmin

- Nombre: Edwin Hernan.
- Apellidos: Velez Urrego.
- Usuario: `ehvelez`.
- Correo: `ehvelez092@gmail.com`.
- Documento: no suministrado.
- Contrasena temporal: no generada, porque el proceso se bloqueo antes de ejecucion real.

Nota: se normalizo la escritura sin tildes en el dry-run para evitar problemas de consola PowerShell; el dato final puede ingresarse con tildes cuando se ejecute con la informacion completa.

## Evidencia del bloqueo

Comando dry-run ejecutado sin documento:

```powershell
npm.cmd run platform:init -- --dry-run --first-name "Edwin Hernan" --last-name "Velez Urrego" --email "ehvelez092@gmail.com" --username "ehvelez" --password "[REDACTED]"
```

Resultado:

```text
[platform-initialize] Documento requerido.
```

## Registros creados

Ninguno.

- Platform SuperAdmin: no creado.
- Profile: no creado.
- Platform Admin: no creado.
- Tenant: no creado.
- Role: no creado.
- Permissions: no creados.
- Empresas: no creadas.
- Administrador cliente: no creado.
- Tecnicos: no creados.

## Motivo exacto del bloqueo

El inicializador oficial valida obligatoriamente:

- nombre;
- apellidos;
- documento;
- correo;
- usuario;
- contrasena temporal.

Al faltar `Documento`, continuar implicaria inventar un dato de identidad o crear un SuperAdmin incompleto, lo cual no es aceptable para produccion.

## Siguiente paso minimo

Suministrar el documento real del Platform SuperAdmin.

Luego ejecutar:

```powershell
$env:TARGET_ENV="production"
$env:CONFIRM_PLATFORM_INIT="true"
$env:DATABASE_URL="<supabase-prod-postgres-url>"
$env:SUPABASE_URL="https://jzbwzmkidfthknsohhnr.supabase.co"
$env:SUPABASE_ANON_KEY="<anon-key-prod>"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-prod>"
$env:JWT_SECRET="<jwt-secret-prod>"
$env:PLATFORM_INIT_FIRST_NAME="Edwin Hernan"
$env:PLATFORM_INIT_LAST_NAME="Velez Urrego"
$env:PLATFORM_INIT_DOCUMENT="<documento-real>"
$env:PLATFORM_INIT_EMAIL="ehvelez092@gmail.com"
$env:PLATFORM_INIT_USERNAME="ehvelez"
$env:PLATFORM_INIT_TEMP_PASSWORD="<contrasena-temporal-robusta>"
npm.cmd run platform:init -- --execute
```

Despues de crear el SuperAdmin:

1. Validar login.
2. Confirmar que `platform:init --dry-run` ya no puede ejecutarse.
3. Crear `NYVORA INTERNAL` desde el flujo normal.
4. Crear `IMPORTADORA SCJ SAS` desde el flujo normal.
5. Crear administrador cliente y tecnicos base.
6. Ejecutar smoke test autenticado.

## Confirmacion

Platform Initialization no fue ejecutado por falta de documento obligatorio. Produccion permanece vacia y segura.

## Continuacion 2026-07-01

Se recibio el documento faltante del Platform SuperAdmin:

- Documento: `1039458720`

Se intento ejecutar nuevamente `platform:init --execute` de forma controlada, generando la contrasena temporal en memoria y sin imprimirla en logs.

Resultado:

```text
[platform-initialize]
Can't reach database server at `localhost:54320`
```

El intento aborto antes de crear registros. La causa fue que el proceso local cargo la configuracion de `.env`, donde:

- `DATABASE_URL` apunta a `localhost:54320`.
- `NEXT_PUBLIC_SUPABASE_URL` apunta a una referencia Supabase distinta de PROD.

Por seguridad, se descarto usar las llaves locales porque no corresponden al proyecto PROD `jzbwzmkidfthknsohhnr`.

Validaciones de seguridad realizadas:

- No se uso SQL manual.
- No se inserto ningun registro directo.
- No se imprimio ninguna contrasena.
- No se reutilizaron llaves QA.
- No se creo ningun usuario Auth.
- No se creo ninguna empresa.

Estado final tras la continuacion:

- Platform SuperAdmin: no creado.
- NYVORA INTERNAL: no creada.
- IMPORTADORA SCJ SAS: no creada.
- Administrador cliente: no creado.
- Tecnicos base: no creados.
- Produccion: permanece sin inicializar desde este proceso local.

Bloqueo actual:

Faltan variables PROD seguras disponibles en el proceso local, o una via aprobada para ejecutar el comando dentro del runtime Railway PROD:

```powershell
$env:DATABASE_URL="<postgres-prod-url-encoded>"
$env:SUPABASE_URL="https://jzbwzmkidfthknsohhnr.supabase.co"
$env:SUPABASE_ANON_KEY="<anon-key-prod>"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-prod>"
$env:JWT_SECRET="<jwt-secret-prod>"
```

Siguiente paso minimo:

Ejecutar `platform:init --execute` con esas variables PROD reales cargadas en el proceso, manteniendo:

```powershell
$env:TARGET_ENV="production"
$env:CONFIRM_PLATFORM_INIT="true"
$env:PLATFORM_INIT_FIRST_NAME="Edwin Hernan"
$env:PLATFORM_INIT_LAST_NAME="Velez Urrego"
$env:PLATFORM_INIT_DOCUMENT="1039458720"
$env:PLATFORM_INIT_EMAIL="ehvelez092@gmail.com"
$env:PLATFORM_INIT_USERNAME="ehvelez"
```

La contrasena temporal debe generarse en memoria durante la ejecucion y entregarse al operador fuera del repositorio.

## Continuacion segura con guardas PROD 2026-07-01

Se reforzo `scripts/platform-initialize.js` para evitar que `TARGET_ENV=production` pueda ejecutarse accidentalmente contra `.env` local, QA o localhost.

Guardas agregadas:

- Si `TARGET_ENV=production`, `DATABASE_URL` o `DIRECT_URL` debe contener `jzbwzmkidfthknsohhnr`.
- Si `TARGET_ENV=production`, `DATABASE_URL`/`DIRECT_URL` no puede apuntar a `localhost`, `127.0.0.1` ni a la referencia QA local detectada.
- Si `TARGET_ENV=production`, `SUPABASE_URL` debe ser exactamente `https://jzbwzmkidfthknsohhnr.supabase.co`.
- El script acepta `--env-file .env.production.local` para cargar variables productivas desde un archivo no versionado.

Prueba de bloqueo ejecutada con el `.env` local actual:

```powershell
$env:TARGET_ENV='production'
$env:CONFIRM_PLATFORM_INIT='true'
npm.cmd run platform:init -- --dry-run --first-name "Edwin Hernan" --last-name "Velez Urrego" --document "1039458720" --email "ehvelez092@gmail.com" --username "ehvelez"
```

Resultado esperado y confirmado:

```text
[platform-initialize] DATABASE_URL/DIRECT_URL debe apuntar a Supabase PROD jzbwzmkidfthknsohhnr.
```

No se ejecuto dry-run real contra PROD porque en el workspace no existe `.env.production.local` y no hay variables PROD reales disponibles en el proceso. Continuar sin esas variables implicaria riesgo de tocar QA o fallar contra localhost.

## Correccion service_role y ejecucion final 2026-07-01

### Causa exacta del 403

`platform:init:prod` ya cargaba exclusivamente `config/production.env` y `env:doctor:prod` validaba el proyecto PROD `jzbwzmkidfthknsohhnr`, pero Supabase REST devolvio:

```text
POST /rest/v1/profiles?on_conflict=id -> 403: permission denied for table profiles
```

El diagnostico de grants confirmo que `public.profiles` y `public.platform_admins` tenian RLS activo y policies para usuarios autenticados, pero `service_role` no tenia `SELECT`, `INSERT` ni `UPDATE` sobre esas tablas. Por eso PostgREST bloqueo la operacion antes del mirror server-side del SuperAdmin.

### Migracion aplicada

Archivo:

```text
supabase/production/20260701_prod_platform_init_service_role_grants.sql
```

SQL aplicado:

```sql
grant usage on schema public to service_role;

grant select, insert, update on table public.profiles to service_role;
grant select, insert, update on table public.platform_admins to service_role;
```

Auditoria previa:

- Sin `DROP`.
- Sin `TRUNCATE`.
- Sin `DELETE`.
- Sin `ALTER TABLE ... DROP`.
- Sin `prisma db push --accept-data-loss`.

### Validaciones de seguridad

- `env:doctor:prod`: OK.
- `service_role` tiene `select/insert/update` en `profiles`: OK.
- `service_role` tiene `select/insert/update` en `platform_admins`: OK.
- `anon` no tiene grant de `insert` en `profiles`: OK.
- `authenticated` no tiene grant directo de `insert` en `profiles`: OK.
- RLS permanece activo en `profiles` y `platform_admins`: OK.
- No se otorgaron permisos nuevos a `anon` ni a `authenticated`.
- No se tocaron datos QA.

La prueba negativa REST con `anon` fue omitida porque el revisor automatico bloqueo correctamente un intento de escritura falsa en PROD. Se dejo evidencia read-only por grants/RLS.

### Platform Initialization

Comando ejecutado:

```powershell
npm.cmd run platform:init:prod -- --execute --first-name "Edwin Hernan" --last-name "Velez Urrego" --document "1039458720" --email "ehvelez092@gmail.com" --username "ehvelez"
```

Resultado:

- Supabase Auth user creado: OK.
- Profile creado: OK.
- Platform Admin creado: OK.
- Tenant tecnico de plataforma creado: OK.
- Rol `APEX_PLATFORM_SUPERADMIN` creado: OK.
- Usuario Prisma creado: OK.
- Auditoria inicial creada: OK.
- Login Supabase: OK.
- Login local API/Prisma: OK.
- Acceso platform admin: OK.

Estado final PROD validado:

```json
{
  "auth_users": 1,
  "auth_user_target": 1,
  "profile_target": 1,
  "platform_admins": 1,
  "tenants": 1,
  "users": 1,
  "audit_logs": 1
}
```

La re-ejecucion de `platform:init:prod --dry-run` quedo bloqueada correctamente:

```text
La plataforma ya fue inicializada o no esta vacia: platform_admins=1, auth.users=1, Tenant=1, User=1.
```

La contrasena temporal no se imprimio en logs ni documentacion. Quedo guardada localmente en:

```text
config/platform-superadmin-credentials.env
```

Ese archivo esta ignorado por Git y no debe versionarse.

### Cierre

Platform SuperAdmin creado y validado. No se crearon empresas, administradores cliente ni tecnicos.
