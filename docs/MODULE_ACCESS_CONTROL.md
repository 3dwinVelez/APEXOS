# Module Access Control

## Modelo

APEX OS separa visibilidad del modulo y permiso operativo.

- `modules`: catalogo global visible para frontend.
- `plans`: planes comerciales.
- `plan_modules`: modulos incluidos o bloqueados por plan.
- `company_modules`: excepciones por empresa. Si existe una fila aqui, esta prima sobre el plan.

## Modulos iniciales

Habilitados para el piloto QA:

- `talento_humano`
- `servicios`
- `configuracion`

Habilitados para SCJ QA:

- `talento_humano`
- `servicios`
- `transporte`
- `configuracion`
- `administracion_apex`

Visibles pero bloqueables inicialmente:

- `inventario`
- `crm`
- `ventas`
- `compras`
- `finanzas`
- `reportes`
- `wms`

## Modulos de plataforma

Los modulos con `visibility_scope = 'platform'` no pertenecen a una empresa normal.

Actualmente existe:

- `platform_admin`: administra empresas, suscripciones y modulos habilitados por empresa.

Solo usuarios activos en `public.platform_admins` pueden consultar u operar este submodulo.

## Regla operativa

Un modulo puede mostrarse bloqueado en frontend usando:

- `v_company_module_status`
- `v_company_enabled_modules`

Pero la operacion real debe validar siempre en backend/base de datos con:

```sql
app_private.has_company_module(company_id, 'codigo_modulo')
```

## Modulos prioritarios

`employees` exige modulo `talento_humano`.

`services` exige modulo `servicios`.

Si el modulo esta bloqueado, RLS impide consultar, insertar, editar o borrar datos reales aunque el usuario pertenezca a la empresa.

## Administracion por checks

El panel `/dashboard/administracion/suscripciones` permite habilitar o bloquear modulos por empresa usando checks. Cada cambio actualiza `public.company_modules`; las politicas RLS y helpers de modulo garantizan que lo bloqueado no se pueda operar aunque la pantalla exista en frontend.

## Catalogo completo APEXOS

La migracion `20260518102000_complete_apexos_module_catalog_and_company_setup.sql` completa el catalogo tenant de QA con los 27 modulos visibles en la plataforma web. El selector de empresas debe consultar todos los modulos tenant activos del catalogo, no solo los modulos prioritarios iniciales.

La migracion tambien crea `app_private.initialize_company_modules()` para inicializar automaticamente la matriz `company_modules` al crear una empresa nueva. Cada sociedad nace con su propio `company_id` y con sus modulos separados; por defecto quedan bloqueados salvo los que vengan habilitados por plan.

El frontend mapea todos los slugs visibles de APEXOS a codigos de Supabase para que el menu lateral, el tablero principal y el panel de suscripciones respeten los bloqueos de la empresa activa.

## Permisos de rol en navegacion

La visibilidad final de modulos en frontend combina dos capas:

- Modulos activos de la empresa.
- Permisos efectivos del rol del usuario.

El frontend debe preferir `role_metadata.legacy_permissions` cuando el contexto de rol fue refrescado por `/api/v1/auth/me` en la sesion actual. Si ese refresh no responde a tiempo, la pantalla no debe quedar bloqueada indefinidamente ni aplicar permisos viejos guardados en `localStorage`; debe continuar con modulos activos y controles backend/RLS, y reintentar el refresco en la siguiente carga.

Los usuarios `platform_admin` no deben ser filtrados por permisos de rol de empresa para la administracion de plataforma.

Actualizacion 2026-07-15: la carga de permisos para sesiones Supabase refresca `/api/v1/auth/me` en paralelo con la consulta de administradores de plataforma y empresas del usuario. Esto evita sumar el timeout de contexto de rol a la consulta de modulos, pero sigue esperando el contexto antes de aplicar permisos efectivos cuando no se trata de un administrador de plataforma.

## Grupos empresariales y sociedades

Una empresa puede representar un grupo empresarial, una sociedad legal, una unidad de negocio o una sucursal. La jerarquia se guarda en `companies.parent_company_id`.

La separacion operativa sigue siendo por `company_id`: aunque una sociedad pertenezca a un grupo, sus usuarios, modulos habilitados y datos reales se controlan por la empresa especifica. El acceso cruzado entre sociedades no debe asumirse por pertenecer al mismo grupo; debe concederse de forma explicita mediante usuarios, roles y permisos.
