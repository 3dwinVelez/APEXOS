# Performance audit production/main

## Contexto

- Fecha: 2026-07-07
- Rama auditada: `codex-user-creation-agile-audit`
- Commit base: `f177bb47b67ed70700e6bbc97ac334b3c1ba1ad8`
- Empresa usada como referencia: Nyvora
- Alcance: frontend web, fallback Supabase, rutas criticas de Administracion, Usuarios, Roles, Talento Humano, Transporte y Servicios.
- Restricciones: no se ejecutaron seeds, no se borraron datos, no se cambiaron variables productivas y no se tocaron datos de otras empresas.

## Pantallas Evaluadas

- `/dashboard`
- `/dashboard/administracion`
- `/dashboard/talento-humano`
- `/dashboard/talento-humano/rutas`
- `/dashboard/talento-humano/mapa`
- `/dashboard/transporte`
- `/dashboard/servicios`
- `/dashboard/servicios/nuevo`
- `/dashboard/servicios/reportes`

## Endpoints Evaluados

- `/api/v1/admin/permissions/catalog`
- `/api/v1/admin/roles`
- `/api/v1/admin/users`
- `/api/v1/admin/user-master-data`
- `/api/v1/hr/employees`
- `/api/v1/hr/employees?active=true`
- `/api/v1/hr/routes`
- `/api/v1/hr/operations-map`
- `/api/v1/transport/vehicles`
- `/api/v1/services/orders?limit=200`
- `/api/v1/services/references?active=true`
- `/api/v1/services/technicians`
- `/api/v1/services/service-types`
- `/api/v1/services/service-stores`

## Medicion Antes

- Inventario estatico de requests: `npm run qa:request-map`.
- Pantalla Administracion: 11 requests literales detectados.
- Pantalla Talento Humano: 4 requests iniciales y polling cada 30 segundos.
- Pantalla Talento Humano > Rutas: 4 requests iniciales de lectura y polling cada 30 segundos.
- Pantalla Servicios: maestros cargaban en dos tandas: referencias/tecnicos primero y tipos/almacenes despues.
- Cliente API: no habia deduplicacion de GET concurrentes; dos componentes solicitando la misma ruta al mismo tiempo podian duplicar requests.
- Polling oculto: Talento Humano y Rutas seguian consultando aunque la pestana estuviera en segundo plano.

## Hallazgos

| Hallazgo | Severidad | Evidencia | Correccion |
| --- | --- | --- | --- |
| GET concurrentes duplicados en cliente API | Media | `api()` no tenia in-flight cache para GET. | Se agrego deduplicacion por ruta/proveedor mientras el request esta en curso. |
| Polling de Talento Humano en pestanas ocultas | Media | `setInterval(load, 30000)` ejecutaba 4 requests cada 30s por pestana. | Se pausa polling si `document.hidden` y se refresca al volver visible. |
| Polling de Rutas/Horarios en pestanas ocultas | Media | `setInterval(load, 30000)` ejecutaba empleados, vehiculos, rutas y mapa operacional. | Se aplica la misma pausa por visibilidad. |
| Carga secuencial parcial de maestros de Servicios | Baja | `loadMasters()` esperaba referencias/tecnicos antes de tipos/almacenes. | Se paralelizaron los 4 maestros con un solo `Promise.all`. |
| Consultas revisadas con limites existentes | Baja | Servicios usa `limit=200`, Transporte y HR tienen limites backend. | Sin cambio adicional; se documenta como control existente. |

## Medicion Despues

- GET concurrente duplicado: antes `N` requests simultaneos por la misma ruta; despues `1` request compartido mientras este en curso.
- Talento Humano oculto: antes 4 requests cada 30 segundos por pestana oculta; despues 0 requests periodicos mientras `document.hidden=true`.
- Rutas/Horarios oculto: antes 4 requests cada 30 segundos por pestana oculta; despues 0 requests periodicos mientras `document.hidden=true`.
- Servicios maestros: antes 2 olas de carga; despues 1 ola paralela de 4 requests, reduciendo espera encadenada.
- Build productivo despues: OK, 57 paginas generadas.
- Bundle relevante despues:
  - `/dashboard/administracion`: 21.9 kB, First Load JS 169 kB.
  - `/dashboard/talento-humano`: 6.08 kB, First Load JS 142 kB.
  - `/dashboard/talento-humano/rutas`: 10.7 kB, First Load JS 147 kB.
  - `/dashboard/servicios`: 11 kB, First Load JS 142 kB.
  - Shared JS: 103 kB.

## Archivos Modificados

- `apps/web/lib/api.ts`
- `apps/web/app/dashboard/talento-humano/page.tsx`
- `apps/web/app/dashboard/talento-humano/rutas/page.tsx`
- `apps/web/app/dashboard/servicios/page.tsx`
- `docs/audits/PERFORMANCE_AUDIT_PROD.md`

## Indices Creados O Recomendados

- No se crearon indices en esta intervencion porque no se ejecutaron migraciones ni cambios de base productiva.
- Recomendados para validar con `EXPLAIN` en Supabase antes de migrar:
  - `employees(company_id, status, created_at)` para listados de usuarios/HR.
  - `operational_routes(company_id, route_date)` para mapa operacional y horarios.
  - `time_punches(company_id, punch_date, punched_at)` para marcacion y reportes.
  - `gps_pings(company_id, source, captured_at)` para mapa en vivo/reportes.
  - `service_orders(company_id, created_at, status)` para listados de servicios.

## Riesgos Evitados

- No se cambio el modelo de permisos ni reglas de negocio.
- No se alteraron datos de empresas.
- No se agregaron seeds ni scripts destructivos.
- No se tocaron variables productivas.
- No se aplicaron indices sin medicion de base real.
- No se elimino logica funcional de fallback Supabase.

## Pruebas Ejecutadas

- `npm run qa:request-map` - OK.
- `npm --workspace apps/web run lint` - OK.
- `npm --workspace apps/web run typecheck` - OK.
- `npm --workspace apps/web run build` - OK.
- `npm run prisma:validate` - OK.

## Resultado De Pruebas

- El frontend compila correctamente.
- El typecheck no reporta errores.
- El build productivo genera 57 paginas.
- El esquema Prisma es valido.
- El inventario de requests confirma las superficies mas cargadas y deja una linea base para auditorias posteriores.

## Estado Final

Se corrigieron problemas reales de consumo innecesario en frontend y percepcion de velocidad:

- Menos requests duplicados concurrentes.
- Menos consumo de red/CPU en pestanas ocultas.
- Carga de maestros de Servicios mas agil.
- Sin cambios destructivos ni alteracion de datos.

## Recomendaciones Pendientes

- Ejecutar benchmark autenticado en produccion con usuario Nyvora y herramientas de navegador para obtener TTFB/LCP reales por pantalla.
- Revisar con Supabase `EXPLAIN ANALYZE` antes de crear indices recomendados.
- Reducir la carga inicial de Administracion separando logs tecnicos de la primera carga si el usuario no abre esa vista.
- Evaluar paginacion real en reportes de Talento Humano cuando el volumen supere 1000 marcaciones por rango.
- Revisar dashboard global para no cargar operaciones pesadas si el modulo no esta activo para la empresa.
