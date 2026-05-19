# Supabase Connection

## Proyecto QA

- Proyecto: `APEX-OS`
- Ref: `jbirkghkekuifgfsgquq`
- URL: `https://jbirkghkekuifgfsgquq.supabase.co`
- Ambiente: QA

No se tocaron proyectos legacy ni produccion.

## Variables

Frontend:

```env
NEXT_PUBLIC_SUPABASE_URL=https://jbirkghkekuifgfsgquq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Servidor APEXOS:

```env
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` se usa solo en rutas server-side para operaciones administrativas de Supabase Auth, por ejemplo crear el administrador inicial de una empresa. Nunca debe tener prefijo `NEXT_PUBLIC_`, nunca debe usarse desde componentes cliente y nunca debe compartirse en documentacion versionada.

Reglas validadas:

- `.env.local` no existe y no esta versionado.
- `.env` esta ignorado por Git.
- `.env.example` no contiene llaves reales.
- No se encontro `service_role` en frontend.
- `.env.example` incluye solo el nombre de `SUPABASE_SERVICE_ROLE_KEY`, sin valor real.

## Cliente centralizado

Archivo:

```text
apps/web/lib/supabaseClient.ts
```

Responsabilidades:

- Centralizar URL y publishable/anon key.
- Leer token de sesion desde `localStorage.token`.
- Enviar `Authorization: Bearer`.
- Exponer helpers REST seguros para Auth, Database y Storage.

Helpers de consulta QA:

```text
apps/web/lib/supabaseQa.ts
```

Incluye consultas paginadas para:

- `modules`
- `plans`
- `v_user_companies`
- `v_company_module_status`

## Auth

Estado actual:

- Existen usuarios QA reales en Supabase Auth.
- Login real validado con token para `admin@apexos.qa` y `scj@apexos.qa`.
- La relacion `profiles` y `company_users` esta activa.
- La tabla `platform_admins` tiene activo el usuario admin global.

Usuarios QA:

- `admin@apexos.qa`: admin global.
- `scj@apexos.qa`: admin de empresa SCJ.

Pruebas:

1. Probar login con `supabaseAuth.signInWithPassword`.
2. Probar sesion con `supabaseAuth.getUser`.
3. Probar logout con `supabaseAuth.signOut`.

Para admin plataforma, iniciar sesion y abrir `/dashboard/administracion/suscripciones`.

## Reconexion para migraciones QA

Para que Codex pueda aplicar las migraciones pendientes al proyecto `APEX-OS`, debe existir una de estas rutas funcionando:

1. Conector Supabase reautenticado en Codex.
   - Debe volver a exponer herramientas MCP de Supabase.
   - El ultimo intento fallo con `Reauthentication required`.

2. Cadena directa correcta de base QA.
   - Debe apuntar al proyecto `jbirkghkekuifgfsgquq`.
   - Debe tener tablas como `public.modules`, `public.companies`, `public.company_modules`.
   - El `DATABASE_URL` actual local no sirve para QA porque respondio que `public.modules` no existe.

3. Verificacion minima antes de aplicar:

```sql
select current_database();
select exists (
  select 1
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'modules'
) as has_modules;
```

Solo si `has_modules = true` y el host corresponde a Supabase QA se deben ejecutar las migraciones pendientes.

Migraciones pendientes de aplicar en QA:

- `20260518102000_complete_apexos_module_catalog_and_company_setup.sql`
- `20260518110000_company_groups_and_initial_admin.sql`

## Estado validado 2026-05-18

Con la nueva `SUPABASE_SERVICE_ROLE_KEY` en `.env`:

- `Auth settings` con publishable key: OK.
- `Auth Admin` con service role: OK.
- `REST modules` con service role: OK.
- Catalogo de modulos cargado por REST: OK.
- Modulos tenant activos en QA: 31.
- Empresas con matriz `company_modules`: 31 filas por empresa.

El `DATABASE_URL` local aun no apunta a Supabase QA. La comprobacion SQL mostro base `apexos` y `public.modules = false`, por lo que no se debe usar para migraciones QA.

Pendiente SQL real:

- Aplicar columnas de grupos empresariales en `companies`.
- Crear tabla `company_admin_onboarding`.
- Crear/actualizar vista `v_platform_companies` con campos de jerarquia.
- Crear trigger `app_private.initialize_company_modules()` para futuras empresas.

Para completar esto se requiere una de estas dos opciones:

- Reautenticar el conector Supabase MCP de Codex.
- Reemplazar `DATABASE_URL` por la cadena Postgres directa/pooler del proyecto QA `jbirkghkekuifgfsgquq`.

## Database

Validado:

- Lectura de `modules`: correcta.
- Lectura de `plans`: correcta.
- Lectura de modulos por empresa via vista: correcta con usuario simulado.
- Empresa piloto QA existe.
- RLS bloquea acceso sin membresia.

## Storage

Validado:

- Buckets privados existen.
- Politicas sobre `storage.objects` existen.
- RLS activo en `storage.objects`.
- Helpers frontend usan el cliente centralizado.

Prueba real de subida binaria queda pendiente hasta crear usuario QA real.
