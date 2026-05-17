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

## Instalacion inicial

```powershell
npm run setup:local
```

Este comando instala dependencias, valida ambiente, inicia infraestructura local, genera Prisma Client, sincroniza base de datos y carga datos demo.

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

## Si el frontend carga sin estilos

```powershell
npm run verify:web-assets
npm run restart:local:windows
```

El servidor de desarrollo usa `.next-dev` y el build usa `.next`; esto evita que una compilacion borre assets CSS usados por el dev server.
