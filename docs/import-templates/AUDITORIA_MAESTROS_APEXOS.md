# Auditoria de maestros APEXOS

## Fuentes revisadas

- Prisma: `apps/api/prisma/schema.prisma`.
- Supabase: migraciones en `supabase/migrations`.
- API: `admin`, `hr`, `transport`, `services`, `inventory`, `accounting`, `sales`, `purchases`.
- Frontend: formularios de Administracion, Transporte, Servicios, Inventario, Contabilidad, Ventas, Compras y Talento Humano.

## Maestros existentes

| Maestro | Estado actual | Ambito | Observacion |
| --- | --- | --- | --- |
| Empresas | Tabla Supabase `companies` | Global/plataforma | Existe para tenant/company. |
| Roles/perfiles | Prisma `Role`; UI Admin | Por tenant | Existe, pero debe cargarse antes de usuarios. |
| Modulos | Supabase `modules`, `company_modules` | Global + empresa | Ya existe para control de acceso. |
| Usuarios | Prisma `User`; Supabase Auth + `company_users` | Por empresa | Debe ser maestro principal. |
| Empleados | Prisma `Employee`; Supabase `employees` | Extension de usuario | Debe quedar como perfil laboral asociado a usuario, no maestro paralelo. |
| Categorias de item | Prisma `Category` | Por tenant | Existe en API local, no esta plenamente conectada al frontend. |
| Sedes/bodegas/ubicaciones | Prisma `Place`, `Location` | Por tenant | Existe parcialmente para inventario/WMS. |
| Terceros | Prisma `Party` | Por tenant | Existe. |
| Tipos de documento | Metadata contable con defaults DIAN | Global/config | Existe como config, no como tabla normalizada. |
| Ciudades DANE | Metadata contable con defaults DANE | Global/config | Existe como config. |
| Vehiculos | Prisma `Vehicle`; Supabase `vehicles` | Por empresa | Existe, pero varios clasificadores son texto libre. |
| Tipos de actividad | Prisma `ActivityType` | Por tenant | Existe; tambien hay defaults quemados en API. |
| Referencias de servicio | `ServiceReference` | Por empresa/tenant | Existe. |
| Productos/inventario | Prisma `Item` | Por tenant | Existe. |
| Centros de costo | Config contable `organization_tree` | Por tenant | Existe como metadata, no como tabla dedicada. |

## Maestros faltantes o incompletos

| Maestro | Estado | Recomendacion |
| --- | --- | --- |
| Tipos de usuario | Quemado/libre en formularios y metadata | Crear catalogo `user_types`. |
| Cargos | Texto libre | Crear catalogo por empresa `positions`. |
| Areas | Texto libre | Crear catalogo por empresa `areas`. |
| Sedes operativas | Parcial en `Place`/metadata | Unificar como catalogo o `Place(type='site')`. |
| Bodegas | Parcial en `Place`/WMS demo | Unificar como `Place(type='warehouse')`. |
| Tipos de tercero | Quemado (`customer`, `supplier`, `employee`) | Catalogo global `third_party_types`. |
| Tipos de vehiculo | Texto libre | Catalogo mixto `vehicle_types`. |
| Marcas de vehiculo | Texto libre | Catalogo por empresa o global extendible. |
| Tipos de servicio | Quemado (`montaje`, `desmontaje`, `ambos`) | Catalogo mixto `service_types`. |
| Categorias de producto | Algunas quemadas en UI | Usar `Category` o catalogo `product_categories`. |
| Unidades de medida | Texto/libre (`UND`, `KG`, `und`) | Catalogo global `units_of_measure`. |
| Marcas de producto | Metadata libre | Catalogo mixto `product_brands`. |
| Metodos de pago | Quemado en contabilidad | Catalogo global `payment_methods`. |
| Bancos | Campo libre en usuario | Catalogo por pais/global. |
| Estados operativos | Quemados por modulo | Documentar por modulo antes de normalizar. |
| Tipos de evidencia | Quemados en servicios/transporte | Catalogo global/por modulo. |

## Valores quemados detectados

- `apps/web/app/dashboard/administracion/page.tsx`: tipos de documento, estados de usuario, contrato, MFA/sesion, banco y perfil operativo.
- `apps/web/app/dashboard/transporte/page.tsx`: tipo de propiedad, estado vehicular, tipos documentales.
- `apps/web/app/dashboard/servicios/referencias/page.tsx`: categorias de referencia.
- `apps/web/app/dashboard/servicios/nuevo/page.tsx`: tipos de servicio.
- `apps/web/app/dashboard/inventario/productos/nuevo/page.tsx`: templates de producto, tipos de item, unidades, perfiles WMS/compra/venta/costeo.
- `apps/api/src/modules/hr/service.js`: tipos de actividad por defecto, tipos de marcacion y checklist preoperacional.
- `apps/api/src/modules/inventory/service.js`: tipos de item validos.
- `apps/api/src/modules/accounting/service.js`: tipos de documento DIAN, ubicaciones DANE y metodos de pago.

## Cambios aplicados

- Se reemplazo la documentacion anterior por documentacion enfocada solo en maestros.
- Se agrego la migracion no destructiva `supabase/migrations/20260527120000_master_catalogs_foundation.sql`.
- Se crearon plantillas CSV maestras con codigos cruzados, sin ids tecnicos.
- Se documento que usuarios es el maestro principal y empleados debe ser extension laboral.

## Cambios recomendados siguientes

1. Crear API para listar catalogos (`/api/v1/master-data/catalogs`).
2. Conectar selects del frontend a catalogos, con fallback temporal a valores actuales.
3. Migrar valores existentes a items de catalogo.
4. Normalizar employees como extension de user, evitando empleados sin usuario cuando el flujo requiera acceso.
5. Definir si `Category`, `Place` y config contable se mantienen o se mapean al nuevo catalogo generico.
