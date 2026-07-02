# Aislamiento multiempresa de datos

Este documento define la regla oficial para que cada dato operativo de APEXOS sea unico y visible solo dentro de su empresa.

## Regla base

Todo dato de negocio pertenece a una empresa. En Supabase operativo la columna canonica es `company_id`; en el modelo Prisma historico la columna equivalente es `tenant_id`.

Ninguna pantalla, endpoint, RPC, job, importador o reporte debe leer, crear, actualizar o eliminar datos operativos sin resolver primero la empresa activa del usuario y aplicar ese identificador en la operacion.

## Capas obligatorias

La proteccion debe existir en tres capas al mismo tiempo:

1. Base de datos:
   - RLS habilitado en tablas operativas.
   - Politicas `select`, `insert`, `update` y `delete` basadas en membresia activa de empresa.
   - Indices unicos compuestos con `company_id` o `tenant_id`.
   - Foreign keys que preserven la misma empresa entre cabecera y detalle cuando aplique.

2. API:
   - Resolver empresa activa desde sesion, `company_users`, `employees` o flujo Platform Admin.
   - No aceptar `company_id` arbitrario enviado por el navegador para datos operativos.
   - Incluir `company_id=eq.<empresa>` o `tenant_id=<empresa>` en cada consulta operativa.
   - Al recibir IDs relacionados, validar que esos IDs pertenecen a la misma empresa antes de guardarlos.

3. Frontend:
   - Consumir endpoints que ya devuelvan datos filtrados por empresa.
   - Si una pantalla consulta Supabase directo, debe incluir el `company_id` activo y seguir dependiendo de RLS.
   - Nunca mezclar datos de dos empresas en selects, tablas, graficas, reportes ni caches locales.

## Datos globales permitidos

Solo pueden ser globales los catalogos de plataforma que no representan informacion operativa de un cliente:

- `modules`
- `plans`
- catalogos base con `company_id is null`
- permisos y definiciones tecnicas de plataforma
- `platform_admins`

Cuando un catalogo tenga version global y version por empresa, la consulta debe buscar:

```sql
company_id = <empresa_activa> or company_id is null
```

La escritura desde una empresa solo puede afectar la fila con `company_id = <empresa_activa>`.

## Unicidad por empresa

Los campos identificadores de negocio deben ser unicos por empresa, no globales, salvo autenticacion o entidades realmente globales.

Patron obligatorio:

```sql
create unique index if not exists <tabla>_<campo>_company_unique
on public.<tabla> (company_id, <campo>);
```

Ejemplos:

- Empleados: `(company_id, document_number)` y/o `(company_id, employee_code)`.
- Vehiculos: `(company_id, plate)`.
- Referencias de servicio: `(company_id, code)`.
- Ordenes de servicio: `(company_id, number)`.
- Rutas operativas: `(company_id, code)` cuando el codigo exista.
- Catalogos maestros: `(company_id, code)` permitiendo `company_id is null` para catalogos globales.
- Items de catalogo: `(catalog_id, code)`, donde el catalogo ya esta asociado a empresa o es global.

Los correos de `auth.users` son globales por naturaleza de Supabase Auth. Si una persona necesita pertenecer a varias empresas, se representa con varias filas en `company_users` y, si aplica, fichas `employees` por empresa.

## Relaciones entre tablas

Cuando una tabla hija depende de una cabecera, debe guardar tambien `company_id` para filtrar, auditar e indexar.

Ejemplo:

```sql
service_orders.company_id
service_incidents.company_id
service_evidence.company_id
service_reference_parts.company_id
```

La aplicacion debe crear la hija con el mismo `company_id` de la cabecera. Antes de insertar una hija se debe validar que la cabecera existe en esa empresa.

## Patrón de consulta seguro

Lectura de lista:

```ts
const companyId = await currentSupabaseCompanyId();
await supabaseFetch(`/rest/v1/employees?select=*&company_id=eq.${companyId}`);
```

Lectura por ID:

```ts
await supabaseFetch(`/rest/v1/vehicles?id=eq.${vehicleId}&company_id=eq.${companyId}&select=*`);
```

Validacion de relacion:

```ts
await supabaseFetch(`/rest/v1/employees?id=eq.${technicianId}&company_id=eq.${companyId}&status=eq.active&limit=1`);
```

Mutacion:

```ts
const payload = { ...bodyWithoutCompanyId, company_id: companyId };
```

El `company_id` se deriva de sesion; no se toma del `body`.

## Revisiones aplicadas

Se reforzaron rutas y pantallas sensibles para filtrar por empresa activa:

- Tecnicos de Servicios.
- Ordenes de Servicio por ID y por listado.
- Referencias y piezas de Servicio.
- Monitor publico de ordenes de Servicio.
- Empleados de Talento Humano.
- Marcaciones, GPS, mapa operativo y metricas preoperacionales.
- Vehiculos de Transporte.
- Rutas operativas.
- Reportes de Talento Humano con consulta directa a Supabase.

## Checklist para futuros modulos

Antes de entregar un modulo nuevo:

- La tabla principal tiene `company_id` o `tenant_id` obligatorio.
- Las tablas hijas repiten `company_id` o `tenant_id`.
- Existen indices por empresa para listados frecuentes.
- Los identificadores de negocio usan unique compuesto por empresa.
- RLS esta habilitado.
- Las politicas validan membresia activa o rol Platform Admin cuando aplique.
- El endpoint resuelve la empresa activa desde sesion.
- El endpoint no acepta empresa arbitraria desde el cliente.
- Cada lectura lista por empresa.
- Cada lectura por ID incluye empresa.
- Cada relacion enviada por ID se valida contra la misma empresa.
- Las pantallas no consultan Supabase directo sin filtro por empresa.
- Los reportes, dashboards y graficas se alimentan solo de datos de la empresa activa.
- Los archivos en Storage usan ruta con empresa como primer segmento: `<company_id>/<module>/<entity>/<id>/<file>`.

## Regla de cierre

Si una entidad representa operacion, configuracion, usuario interno, documento, inventario, servicio, compra, venta, contabilidad, transporte, talento humano, reporte, evidencia o metrica de una empresa, entonces debe estar aislada por empresa desde base de datos, API y UI.

Si no puede demostrarse a que empresa pertenece un dato, ese dato no debe mostrarse ni mutarse.
