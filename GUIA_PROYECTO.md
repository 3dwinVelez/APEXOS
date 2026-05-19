# Guia de proyecto - APEXOS

Esta guia explica como preparar e iniciar APEXOS en ambiente local paso por paso.

## 1. Programas necesarios

Instalar y verificar estos programas antes de iniciar:

- Git
- Node.js LTS con npm
- Docker Desktop
- Windows PowerShell
- Python 3.11 o superior, solo si se va a correr el servicio BRAIN fuera de Docker

Comandos rapidos para validar:

```powershell
git --version
node --version
npm --version
docker --version
```

Docker Desktop debe estar abierto y con el engine iniciado antes de ejecutar los comandos del proyecto.

## 2. Ubicacion del proyecto

Ruta local del proyecto:

```powershell
cd C:\Users\pc\Documents\2026\APEXOS
```

## 3. Variables de entorno

Si el archivo `.env` no existe, crearlo desde el ejemplo:

```powershell
copy .env.example .env
```

El archivo `.env.example` ya trae valores locales para:

- API en puerto `3000`
- Web en puerto `3001`
- PostgreSQL en puerto `55432`
- Redis en puerto `6379`
- MinIO en puertos `9000` y `9001`
- BRAIN en puerto `8000`

## 4. Instalacion inicial

Ejecutar este comando una sola vez al preparar el ambiente:

```powershell
npm run setup:local
```

Este comando realiza:

- Instalacion de dependencias npm.
- Validacion local del ambiente.
- Inicio de infraestructura Docker: PostgreSQL, Redis, MinIO y BRAIN.
- Generacion de Prisma Client.
- Sincronizacion de base de datos.
- Carga de datos demo.

## 5. Iniciar el proyecto cada dia

Para iniciar APEXOS en modo local:

```powershell
npm run start:local
```

Esto valida el ambiente, levanta la infraestructura Docker y ejecuta API + Web.

En Windows tambien se puede usar:

```powershell
npm run start:local:windows
```

Si ya estaba corriendo y se necesita reiniciar:

```powershell
npm run restart:local:windows
```

## 6. URLs locales

Abrir en el navegador:

- Web: http://localhost:3001
- API health: http://localhost:3000/health
- BRAIN health: http://localhost:8000/health
- MinIO consola: http://localhost:9001

Usuario demo:

```text
demo@apex.local
test1234
```

## 7. Comandos utiles

Validar Prisma:

```powershell
npm run prisma:validate
```

Generar Prisma Client:

```powershell
npm run prisma:generate
```

Sincronizar base de datos:

```powershell
npm run db:push
```

Cargar datos demo:

```powershell
npm run seed:demo
```

Ejecutar typecheck del frontend:

```powershell
npm --workspace apps/web run typecheck
```

Validar que los estilos CSS del frontend esten servidos correctamente:

```powershell
npm run verify:web-assets
```

Compilar frontend:

```powershell
npm --workspace apps/web run build
```

## 8. Infraestructura Docker

Levantar solo infraestructura:

```powershell
npm run infra:up
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

Para desarrollo local normal, los scripts usan principalmente PostgreSQL, Redis, MinIO y BRAIN.

## 9. Ejecutar BRAIN fuera de Docker

Solo usar esta opcion si se necesita desarrollar directamente el servicio Python:

```powershell
cd services/brain
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Luego volver a la raiz del proyecto:

```powershell
cd C:\Users\pc\Documents\2026\APEXOS
```

## 10. Problemas comunes

Si aparece error de Docker:

```text
Docker Desktop no esta corriendo o no responde.
```

Abrir Docker Desktop, esperar a que el engine este listo y ejecutar de nuevo:

```powershell
npm run start:local
```

Si falta `.env`:

```powershell
copy .env.example .env
npm run start:local
```

Si la base de datos esta vacia o faltan tablas:

```powershell
npm run db:push
npm run seed:demo
```

Si el frontend no compila:

```powershell
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
```

Si la pagina carga pero aparece sin estilos:

```powershell
npm run verify:web-assets
npm run restart:local:windows
```

El arranque web de desarrollo usa `.next-dev` y el build usa `.next`. Esto evita que una compilacion de produccion borre los assets CSS que el servidor de desarrollo esta usando.

## 11. Flujo recomendado para trabajar

1. Abrir Docker Desktop.
2. Abrir PowerShell.
3. Entrar a la ruta del proyecto.
4. Ejecutar `npm run start:local`.
5. Abrir `http://localhost:3001`.
6. Iniciar sesion con el usuario demo.
7. Antes de cerrar cambios importantes, ejecutar typecheck, validacion de assets y build del frontend.


Super usuario admin
Correo: admin@apexos.qa
Clave: ApexOS-QA-Admin-2026!
Acceso: admin global APEX OS, panel de empresas/suscripciones y owner de empresas QA.



Usuario empresa SCJ
Correo: scj@apexos.qa
Clave: ApexOS-QA-SCJ-2026!
Acceso: empresa SCJ como admin.
Módulos habilitados: talento_humano, servicios, transporte, configuracion, administracion_apex.