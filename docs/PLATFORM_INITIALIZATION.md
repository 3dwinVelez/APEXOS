# Platform Initialization

Este documento describe el proceso oficial para inicializar APEXOS/NYVORA cuando una instalacion productiva esta completamente vacia.

## Objetivo

Crear el primer Platform SuperAdmin usando un comando interno, no expuesto a Internet, y reutilizando servicios internos de plataforma para crear:

- usuario Supabase Auth;
- `profiles`;
- `platform_admins`;
- tenant tecnico de plataforma en Prisma;
- rol global minimo;
- permisos globales;
- usuario Prisma;
- auditoria inicial.

No crea empresas cliente, no crea usuarios tecnicos y no activa modulos de cliente.

## Cuando puede ejecutarse

Solo puede ejecutarse si todas estas condiciones son verdaderas:

- `public.platform_admins = 0`;
- `public.companies = 0`;
- `auth.users = 0`;
- `Tenant = 0`;
- `User = 0`.

Si cualquiera no se cumple, el comando aborta y reporta que la plataforma ya fue inicializada o no esta vacia.

## Comando

Script interno:

```powershell
npm.cmd run platform:init -- --dry-run
```

Para produccion local, usar un archivo no versionado `.env.production.local` y cargarlo explicitamente:

```powershell
TARGET_ENV=production
CONFIRM_PLATFORM_INIT=true
DATABASE_URL=<postgres-prod-url-encoded-con-project-ref-jzbwzmkidfthknsohhnr>
SUPABASE_URL=https://jzbwzmkidfthknsohhnr.supabase.co
SUPABASE_ANON_KEY=<anon-key-prod>
SUPABASE_SERVICE_ROLE_KEY=<service-role-prod>
JWT_SECRET=<jwt-secret-prod>
```

Ejecucion real:

```powershell
$env:TARGET_ENV="production"
$env:CONFIRM_PLATFORM_INIT="true"
$env:DATABASE_URL="<supabase-prod-postgres-url-encoded>"
$env:SUPABASE_URL="https://jzbwzmkidfthknsohhnr.supabase.co"
$env:SUPABASE_ANON_KEY="<anon-key>"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
$env:JWT_SECRET="<jwt-secret>"
$env:PLATFORM_INIT_FIRST_NAME="<nombre>"
$env:PLATFORM_INIT_LAST_NAME="<apellidos>"
$env:PLATFORM_INIT_DOCUMENT="<documento>"
$env:PLATFORM_INIT_EMAIL="<correo>"
$env:PLATFORM_INIT_USERNAME="<usuario>"
$env:PLATFORM_INIT_TEMP_PASSWORD="<clave-temporal>"
npm.cmd run platform:init -- --env-file .env.production.local --execute
```

Tambien se pueden pasar parametros por CLI:

```powershell
npm.cmd run platform:init -- --env-file .env.production.local --execute --first-name "<nombre>" --last-name "<apellidos>" --document "<documento>" --email "<correo>" --username "<usuario>" --password "<clave-temporal>"
```

Comando oficial para el primer SuperAdmin productivo:

```powershell
$temporaryPassword = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 28 | ForEach-Object {[char]$_})
$env:PLATFORM_INIT_TEMP_PASSWORD=$temporaryPassword
npm.cmd run platform:init -- --env-file .env.production.local --dry-run --first-name "Edwin Hernan" --last-name "Velez Urrego" --document "1039458720" --email "ehvelez092@gmail.com" --username "ehvelez"
npm.cmd run platform:init -- --env-file .env.production.local --execute --first-name "Edwin Hernan" --last-name "Velez Urrego" --document "1039458720" --email "ehvelez092@gmail.com" --username "ehvelez"
```

## Seguridad

- No existe endpoint publico de bootstrap.
- No usa SQL para crear usuarios.
- No crea empresas.
- No crea datos demo.
- No imprime la clave temporal en salida.
- Requiere `CONFIRM_PLATFORM_INIT=true` para produccion.
- En produccion bloquea la ejecucion si `DATABASE_URL`/`DIRECT_URL` no contiene `jzbwzmkidfthknsohhnr`.
- En produccion bloquea la ejecucion si `SUPABASE_URL` no es exactamente `https://jzbwzmkidfthknsohhnr.supabase.co`.
- Por defecto corre en modo dry-run si no se pasa `--execute`.
- Si detecta plataforma no vacia, aborta antes de escribir.

## Railway Runtime

Puede ejecutarse desde Railway siempre que el servicio tenga las variables PROD reales configuradas. La ventaja es que no se copian secretos al equipo local. El comando debe ejecutarse en el runtime del backend, no en frontend publico:

```powershell
npm.cmd run platform:init -- --dry-run --first-name "Edwin Hernan" --last-name "Velez Urrego" --document "1039458720" --email "ehvelez092@gmail.com" --username "ehvelez" --password "<clave-temporal>"
npm.cmd run platform:init -- --execute --first-name "Edwin Hernan" --last-name "Velez Urrego" --document "1039458720" --email "ehvelez092@gmail.com" --username "ehvelez" --password "<clave-temporal>"
```

El runtime debe tener `TARGET_ENV=production`, `CONFIRM_PLATFORM_INIT=true`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `JWT_SECRET`.

## Validaciones posteriores

El comando valida:

- login Supabase con el usuario creado, si `SUPABASE_ANON_KEY` esta configurada;
- login local API/Prisma, si `JWT_SECRET` esta configurado;
- existencia de `platform_admins` activo;
- estado posterior de inicializacion.

Luego ejecutar:

```powershell
npm.cmd run prisma:validate
npm.cmd --workspace apps/web run typecheck
npm.cmd --workspace apps/web run lint
npm.cmd --workspace apps/web run build
curl.exe -i https://apexos-api-prod-production.up.railway.app/health
```

## Validacion dry-run ejecutada

El 2026-07-01 se ejecuto `npm.cmd run platform:init -- --dry-run` contra Supabase PROD con credenciales ficticias no persistidas. Resultado:

- `platform_admins = 0`;
- `companies = 0`;
- `auth_users = 0`;
- `tenants = 0`;
- `users = 0`;
- escritura realizada: ninguna;
- estado: apto para ejecutar inicializacion real cuando el operador suministre datos reales del primer Platform SuperAdmin.

## Segunda fase

Cuando el Platform SuperAdmin exista:

1. iniciar sesion en el frontend productivo;
2. abrir Administracion / Suscripciones;
3. crear empresa real desde el flujo normal;
4. activar modulos contratados;
5. crear administrador cliente;
6. crear usuarios tecnicos desde Administracion;
7. ejecutar smoke test autenticado.

## Estado irreversible

Despues de crear el primer Platform SuperAdmin, el inicializador queda logicamente deshabilitado porque `platform_admins`, `auth.users`, `Tenant` y `User` dejan de ser cero.
