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
