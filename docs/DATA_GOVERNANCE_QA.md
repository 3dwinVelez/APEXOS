# Gobierno de datos QA - Prisma / Supabase

Fecha: 2026-05-31  
Rama: `develop`  
Objetivo: declarar fuente de verdad por modulo activo y evitar que QA avance con datos duplicados sin control.

## Regla de estabilizacion

No se eliminan tablas legacy en QA sin migracion controlada, respaldo y prueba funcional. Cuando existan dos superficies de datos, una queda como fuente operativa y la otra como compatibilidad temporal/deprecada.

## Fuente de verdad por modulo

| Modulo | Fuente operativa QA | Tablas principales | Tablas compatibilidad/deprecadas | Estado |
| --- | --- | --- | --- | --- |
| Autenticacion API | Prisma/API | `User`, `Role`, `Permission`, `Tenant` | `profiles`, `company_users` para Supabase Auth y frontend server routes | Dual controlado |
| Administracion APEX | Supabase + rutas server-side Next | `companies`, `profiles`, `company_users`, `company_modules`, `modules` | `Tenant` cuando se usa API Prisma | Requiere mapa explicito tenant/company |
| Roles y permisos API | Prisma/API | `Role`, `Permission`, `SoDRule` | `company_users.role` como rol Supabase simple | Dual controlado |
| Usuarios maestros | Supabase Auth + Supabase public | `profiles`, `company_users`, `employees` | `User`, `Employee` como espejo API | Requiere sincronizacion |
| Servicios | Prisma/API para API; Supabase para frontend fallback | `ServiceOrder`, `ServiceReference`, `ServicePhoto`, `ServiceIncident` | `service_orders`, `service_references`, `service_evidence` | Sincronizado para SCJ |
| Transporte | Prisma/API para API; Supabase para frontend fallback | `Vehicle`, `VehicleDocument`, `VehicleMasterAuditLog` | `vehicles`, `vehicle_documents` | Sincronizado para SCJ |
| Talento humano / Marcaciones | Supabase para RLS/frontend; Prisma para API operativa | `employees`, `time_punches`, `gps_pings` | `Employee`, `TimePunch`, `GpsPing`, `WorkSession`, `WorkActivity` | Dual, con RLS validado |
| Proyectos | Prisma/API | `Project`, `ProjectCommitment`, `ProjectDeliverable`, `ProjectRisk`, `ProjectResourceAssignment` | `projects`, `project_commitments` no existen como REST snake_case | Fuente Prisma |
| Storage/evidencias | Supabase Storage | `storage.objects`, buckets privados | metadata en tablas operativas | Fuente Supabase |
| Catalogos maestros | Supabase | `master_catalogs`, `master_catalog_items` | enums/hardcodes en formularios existentes | Fuente Supabase |

## Hallazgos

- Existen tablas Prisma CamelCase y tablas Supabase snake_case para varios dominios activos.
- La duplicidad no rompe QA cuando los datos estan sincronizados por tenant, pero si puede causar pantallas vacias si el usuario entra por una empresa sin espejo o si una pantalla consulta la fuente alterna.
- SCJ tiene datos sincronizados en `ServiceOrder/service_orders` y `Vehicle/vehicles`.
- Proyectos usa fuente Prisma. Las tablas snake_case `projects` y `project_commitments` no existen como REST directo.
- `WorkSession` y `WorkActivity` existen en Prisma pero estan sin datos; el flujo QA actual de marcaciones se apoya principalmente en `employees`, `time_punches` y `gps_pings`.

## Correcciones aplicadas en QA

- Se habilito `proyectos` en `active_modules` de `SCJ` y `Empresa Demo APEX-OS`.
- Se habilitaron modulos `talento_humano`, `servicios`, `transporte` y `proyectos` en empresas `QA Empresa A RLS` y `QA Empresa B RLS` para pruebas reales de RLS.
- Se conservaron tablas legacy/snake_case como compatibilidad; no se borro informacion.

## Decision tecnica

Para produccion piloto, cada modulo debe tener una sola fuente oficial:

1. Modulos API transaccionales nuevos: Prisma/API.
2. Seguridad, tenancy, Auth, Storage y configuracion administrada por Supabase: Supabase.
3. Frontend no debe escribir en dos fuentes para el mismo evento sin un puente idempotente.
4. Toda tabla marcada como compatibilidad debe tener plan de migracion o sincronizacion documentado.

## Pendiente antes de produccion

- Definir si `Tenant` y `companies` se fusionan logicamente o si una se vuelve espejo estrictamente derivado.
- Definir puente unico para usuarios: Supabase Auth/profile/company_users como fuente de identidad y Prisma `User` como usuario API derivado, o migrar API completamente a Supabase identity.
- Crear job/script idempotente de verificacion de espejo para `Vehicle`, `ServiceOrder`, `Employee`, `TimePunch` y `GpsPing`.
- Eliminar fallbacks demo en pantallas productivas cuando haya datos reales.
