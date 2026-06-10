# Proyecto Local - APEXOS

Usa este documento como manual operativo para levantar APEXOS en local.

## Resumen de 30 segundos

Si necesitas iniciar APEXOS rapido en Windows, ejecuta exactamente esto:

```powershell
cd C:\Users\pc\Documents\2026\APEXOS
npm install
npm run start:local:windows
```

Cuando termine, valida:

- Web: `http://localhost:3001`
- API: `http://localhost:3000/health`

Ingresa con:

```text
demo@apex.local
test1234
```

## Ruta principal

Sigue estos pasos en este orden. No saltes pasos la primera vez.

### 1. Verifica prerequisitos

Antes de iniciar, confirma que tienes instalado:

- Git
- Node.js `22.x`
- npm
- Docker Desktop
- PowerShell en Windows
- PostgreSQL CLI en Windows si vas a usar `npm run start:local:windows`

Ejecuta:

```powershell
git --version
node --version
npm --version
docker --version
```

Si vas a usar el arranque Windows, estos binarios deben existir en `PATH`:

- `initdb`
- `pg_ctl`
- `createdb`
- `postgres`

### 2. Entra al proyecto

```powershell
cd C:\Users\pc\Documents\2026\APEXOS
```

### 3. Instala dependencias

```powershell
npm install
```

### 4. Inicia APEXOS localmente

En Windows, este es el comando principal:

```powershell
npm run start:local:windows
```

Este comando deja listo casi todo el entorno local automaticamente.

Durante el arranque, el script hace esto:

- detiene contenedores Docker conflictivos de `api`, `web` y `nginx`
- crea `.env` desde `.env.example` si falta
- actualiza variables locales necesarias
- fuerza `DISABLE_REDIS=1`
- configura `NEXT_PUBLIC_API_URL=http://127.0.0.1:3000`
- levanta PostgreSQL local en `.local/postgres`
- ejecuta `prisma:generate`
- ejecuta `db:push`
- ejecuta `seed:demo`
- inicia API
- inicia Web
- ejecuta verificacion CSS del frontend

### 5. Valida que el entorno subio

Cuando el arranque termine, abre estas rutas:

- Web: `http://localhost:3001`
- Dashboard: `http://localhost:3001/dashboard`
- API health: `http://localhost:3000/health`

### 6. Ingresa al sistema

```text
demo@apex.local
test1234
```

## Puertos del entorno local

Estos son los puertos que debes conocer:

- Web: `3001`
- API: `3000`
- BRAIN: `8000`
- PostgreSQL Windows local: `54320`
- PostgreSQL Docker: `55432`
- Redis: `6379`
- MinIO API: `9000`
- MinIO consola: `9001`
- Grafana: `4000`

Ten en cuenta:

- `54320` es el puerto usado por `start:local:windows`
- `55432` es el puerto expuesto por Docker en `infra/docker-compose.yml`

## Variables locales clave

El arranque Windows asegura al menos estas variables:

```env
DATABASE_URL=postgresql://apex:apex_dev_password@localhost:54320/apexos
REDIS_URL=redis://localhost:6379
DISABLE_REDIS=1
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000
```

Notas:

- el `.env` raiz es la fuente compartida del entorno local
- la API busca el `.env` subiendo desde el directorio actual

## Si es la primera vez y algo falla

Si `start:local:windows` no logra dejar el entorno listo, ejecuta esta preparacion completa:

```powershell
npm run setup:local
```

Ese comando hace esto:

- instala dependencias
- valida ambiente
- levanta infraestructura Docker
- genera Prisma Client
- sincroniza base de datos
- carga datos demo

Cuando termine, vuelve a ejecutar:

```powershell
npm run start:local:windows
```

## Reinicio del entorno

Si el entorno ya habia arrancado y quieres reiniciarlo:

```powershell
npm run restart:local:windows
```

## Verificacion despues del arranque

Ejecuta estas comprobaciones para confirmar que el entorno quedo sano:

```powershell
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
npm run verify:web-assets
npm run prisma:validate
```

Hazlo en este orden para frontend:

1. `npm --workspace apps/web run typecheck`
2. `npm --workspace apps/web run build`
3. `npm run verify:web-assets`

## Problemas comunes

### La API no responde en `3000`

Revisa esto:

- que PostgreSQL local haya subido
- que `DATABASE_URL` apunte al puerto correcto
- que `NEXT_PUBLIC_API_URL` sea `http://127.0.0.1:3000`
- que hayan corrido `prisma:generate`, `db:push` y `seed:demo`

### La Web no responde en `3001`

Ejecuta:

```powershell
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
npm run verify:web-assets
```

### El frontend abre sin estilos

Ejecuta:

```powershell
npm run verify:web-assets
npm run restart:local:windows
```

### El script Windows no logra levantar PostgreSQL

Revisa que estos binarios existan en `PATH`:

- `initdb`
- `pg_ctl`
- `createdb`
- `postgres`

### Docker no responde

- abre Docker Desktop
- espera a que termine de iniciar
- vuelve a ejecutar `npm run setup:local` o `npm run start:local`

## Logs utiles

Si necesitas diagnosticar el arranque Windows, revisa estos archivos:

- `logs/postgres-local.log`
- `logs/postgres-local.err.log`
- `logs/api-dev.out.log`
- `logs/api-dev.err.log`
- `logs/web-dev.out.log`
- `logs/web-dev.err.log`

## Flujos alternos

Usa esta seccion solo si no vas a seguir la ruta principal.

### Arranque general con Docker

```powershell
npm run start:local
```

Este flujo usa `infra:up`, que ahora levanta solo dependencias auxiliares y deja `api`/`web` para el modo desarrollo del repo.

### Levantar solo infraestructura Docker

```powershell
npm run infra:up
```

Esto levanta solo:

- `postgres`
- `redis`
- `minio`
- `brain`

Si necesitas toda la plataforma dentro de Docker, usa:

```powershell
npm run infra:up:full
```

Detener infraestructura:

```powershell
npm run infra:down
```

### Levantar solo API

```powershell
npm --workspace apps/api run dev
```

### Levantar solo Web

```powershell
npm --workspace apps/web run dev
```

Nota del frontend:

- no reemplazar este comando por `next dev` directo
- el wrapper oficial usa `scripts/dev-web.js`
- desarrollo usa `NEXT_DIST_DIR=.next-dev`
- build usa `.next`

### Levantar solo BRAIN

```powershell
cd services/brain
uvicorn main:app --reload --port 8000
```

Health de BRAIN:

- `http://localhost:8000/health`

## Checklist de validacion final

Usa esta lista al terminar el arranque local:

- [ ] `npm run start:local:windows` terminó sin error bloqueante
- [ ] `http://localhost:3000/health` responde correctamente
- [ ] `http://localhost:3001` carga correctamente
- [ ] `http://localhost:3001/dashboard` abre
- [ ] puedes iniciar sesion con `demo@apex.local`
- [ ] la clave `test1234` funciona
- [ ] `npm --workspace apps/web run typecheck` termina sin errores
- [ ] `npm --workspace apps/web run build` termina sin errores
- [ ] `npm run verify:web-assets` termina correctamente
