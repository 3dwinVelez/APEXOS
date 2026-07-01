# Onboarding productivo - IMPORTADORA SCJ SAS

Fecha: 2026-07-01  
Ambiente: Produccion  
Cliente: IMPORTADORA SCJ SAS  
NIT: `901406939`  
Backend PROD: `https://apexos-api-prod-production.up.railway.app`  
Frontend PROD: `https://apexos-web-prod-production.up.railway.app`  
Supabase PROD ref: `jzbwzmkidfthknsohhnr`  
Commit base: `72113ce`

## Estado

ONBOARDING BLOQUEADO.

No se creo empresa, tenant, usuarios, roles ni modulos porque el flujo productivo real requiere una sesion valida de superadministrador de plataforma y la base productiva aun no tiene ningun usuario Auth ni registro `platform_admins`. Crear esos registros por SQL directo violaria la restriccion explicita del onboarding: no insertar datos directamente en tablas y usar el mismo flujo que utilizaran los usuarios en produccion.

## Validacion previa ejecutada

Infraestructura:

- Backend PROD `/health`: OK 200, `{"status":"OK","version":"2.0","modules":13}`.
- Backend PROD `/version`: no existe, 404 controlado `Route GET:/version not found`.
- Frontend PROD `/login`: OK 200.
- CORS PROD: OK 204 para `OPTIONS /api/v1/auth/login` desde el frontend productivo.
- Endpoint protegido `/api/v1/admin/users` sin token: OK 401 `TOKEN_INVALIDO`.

Supabase PROD:

- `validate:production:structure`: OK.
- Tablas publicas: 112.
- Public policies: 145.
- Storage policies: 20.
- Buckets: 9.
- Funciones `app_private`: 16.
- Fallas: `[]`.

Estado de datos productivos antes del onboarding:

- `auth.users`: 0.
- `public.companies`: 0.
- `public.platform_admins`: 0.
- `public.company_users`: 0.
- `public.employees`: 0.
- Consulta por NIT/nombre `901406939` / `IMPORTADORA SCJ`: 0 filas.

Frontend publico:

- HTML `/login` no expone `DATABASE_URL`.
- HTML `/login` no expone `SUPABASE_SERVICE_ROLE_KEY`.
- HTML `/login` no expone `JWT_SECRET`.
- HTML `/login` no contiene ref QA ni localhost.

Checks locales:

- `npm.cmd run prisma:validate`: OK.
- `npm.cmd --workspace apps/web run typecheck`: OK.
- `npm.cmd --workspace apps/web run lint`: OK.
- `npm.cmd --workspace apps/web run build`: OK, 56 rutas.
- `node --check` en rutas criticas backend/frontend: OK.

## Flujo real identificado

Empresa cliente:

- La creacion de empresa productiva se realiza por `POST /api/platform/companies`.
- Esta ruta exige `Authorization: Bearer <token>` de un superadministrador con acceso a `v_platform_companies`.
- La ruta crea la empresa, crea el usuario Auth del administrador cliente y relaciona `profiles`, `company_users` y `company_admin_onboarding`.

Usuarios:

- La creacion de usuarios operativos se realiza por `POST /api/admin/users`.
- Esta ruta exige token de administrador de empresa y valida nombre, apellidos, correo, documento, rol, cargo/area y clave temporal cuando aplica.

Modulos:

- La activacion de modulos se gestiona desde administracion/suscripciones usando las APIs/vistas de plataforma.
- Requiere sesion de superadministrador.

## Bloqueos exactos

1. No existe superadministrador productivo para iniciar el flujo real.
2. No existe token de plataforma para ejecutar `POST /api/platform/companies`.
3. No fueron suministrados datos reales del superadministrador interno:
   - nombre completo,
   - correo,
   - documento,
   - clave temporal,
   - confirmacion de rol.
4. No fueron suministrados datos reales del administrador cliente:
   - nombre completo,
   - correo,
   - documento,
   - clave temporal.
5. Para los 10 tecnicos solo se suministraron usuarios/correos temporales. El flujo real exige tambien:
   - nombres,
   - apellidos,
   - documentos,
   - cargo,
   - area/departamento,
   - clave temporal o regla aprobada para generarla.
6. No se puede crear el primer superadmin por SQL directo porque el alcance lo prohibe.
7. No se puede crear empresa por POST anonimo o con datos fabricados porque podria dejar registros productivos inconsistentes.

## Datos listos para usar cuando se desbloquee

Empresa:

- Razon social: IMPORTADORA SCJ SAS.
- NIT: `901406939`.
- Estado: activa.
- Ambiente: produccion.
- Correo empresa: temporal pendiente de confirmar.

Modulos a activar:

- Inicio.
- Administracion APEX.
- Talento Humano.
- Transporte.
- Servicios.

Modulos restantes:

- Visibles.
- Bloqueados.
- No ocultos.

Tecnicos base solicitados:

- `tecnicoapex01` / `tecnico01@apex.local`.
- `tecnicoapex02` / `tecnico02@apex.local`.
- `tecnicoapex03` / `tecnico03@apex.local`.
- `tecnicoapex04` / `tecnico04@apex.local`.
- `tecnicoapex05` / `tecnico05@apex.local`.
- `tecnicoapex06` / `tecnico06@apex.local`.
- `tecnicoapex07` / `tecnico07@apex.local`.
- `tecnicoapex08` / `tecnico08@apex.local`.
- `tecnicoapex09` / `tecnico09@apex.local`.
- `tecnicoapex10` / `tecnico10@apex.local`.

## Siguiente paso minimo

Desbloquear el bootstrap inicial con una de estas dos opciones aprobadas:

1. Crear el superadministrador interno desde el flujo real ya autenticado, suministrando token/sesion valida de plataforma.
2. Autorizar por escrito un procedimiento excepcional de bootstrap productivo para crear el primer superadministrador, documentado, auditado y sin datos demo.

Una vez exista el superadministrador:

1. Crear IMPORTADORA SCJ SAS por `POST /api/platform/companies`.
2. Crear administrador cliente por el mismo flujo de empresa o por `POST /api/admin/users`.
3. Crear rol `tecnico_servicios` si no existe.
4. Crear los 10 tecnicos con datos completos.
5. Activar modulos contratados.
6. Ejecutar smoke test autenticado con superadmin, admin cliente y `tecnicoapex01`.

## Confirmacion

ONBOARDING BLOQUEADO por falta de superadministrador/sesion productiva y datos obligatorios para crear usuarios usando el flujo real. No se crearon registros productivos.
