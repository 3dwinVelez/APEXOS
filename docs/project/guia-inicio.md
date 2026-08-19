# Guia de inicio - APEXOS

Esta guia resume como preparar e iniciar APEXOS en ambiente local.

## Programas necesarios

- Git
- Node.js LTS con npm
- Docker Desktop
- Windows PowerShell
- Python 3.11 o superior si se ejecuta BRAIN fuera de Docker

Validacion rapida:

```powershell
git --version
node --version
npm --version
docker --version
```

## Ruta del proyecto

```powershell
cd C:\Users\pc\Documents\2026\APEXOS
```

## Variables de entorno

Si `.env` no existe:

```powershell
copy .env.example .env
```

Valores locales habituales:

- API: `3000`
- Web: `3001`
- PostgreSQL: `55432`
- Redis: `6379`
- MinIO: `9000` y `9001`
- BRAIN: `8000`

## Instalacion inicial

```powershell
npm run setup:local
```

Este comando instala dependencias, valida ambiente, inicia infraestructura local, genera Prisma Client, sincroniza base de datos y carga datos demo.

## Comandos utiles

```powershell
npm run prisma:validate
npm run prisma:generate
npm run db:push
npm run seed:demo
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
npm run verify:web-assets
```

## Infraestructura Docker

Levantar solo infraestructura:

```powershell
npm run infra:up
```

Este comando levanta solo dependencias de apoyo para desarrollo local:

- `postgres`
- `redis`
- `minio`
- `brain`

No levanta `api` ni `web` para evitar conflictos con el modo desarrollo local.

Si necesitas levantar todo el stack Dockerizado, usa:

```powershell
npm run infra:up:full
```

Detener infraestructura:

```powershell
npm run infra:down
```

Servicios definidos en `infra/docker-compose.yml`:

- `postgres`
- `redis`
- `minio`
- `brain`
- `api`
- `web`
- `nginx`
- `prometheus`
- `grafana`

## Inicio diario

```powershell
npm run start:local
```

En Windows:

```powershell
npm run start:local:windows
```

Reinicio:

```powershell
npm run restart:local:windows
```

## URLs locales

- Web: http://localhost:3001
- API health: http://localhost:3000/health
- BRAIN health: http://localhost:8000/health
- MinIO consola: http://localhost:9001

Usuario demo:

```text
demo@apex.local
test1234
```

## Validaciones utiles

```powershell
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
npm run verify:web-assets
npm run prisma:validate
npm run db:push
npm run seed:demo
```

Orden recomendado para frontend:

1. `npm --workspace apps/web run typecheck`
2. `npm --workspace apps/web run build`
3. `npm run verify:web-assets`

## Si el frontend carga sin estilos

```powershell
npm run verify:web-assets
npm run restart:local:windows
```

El servidor de desarrollo usa `.next-dev` y el build usa `.next`; esto evita que una compilacion borre assets CSS usados por el dev server.

## Problemas comunes

Si Docker no responde, abrir Docker Desktop y volver a ejecutar `npm run start:local`.

Si faltan tablas o la base esta vacia:

```powershell
npm run db:push
npm run seed:demo
```

Si falla el frontend:

```powershell
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
```
# Infraestructura local minima

El arranque local conecta el servicio `brain` directamente a PostgreSQL. PgBouncer queda reservado para el stack completo y no debe bloquear `ARRANCAR_APEXOS.bat` si su imagen opcional no esta disponible.
