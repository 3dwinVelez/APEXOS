# Bootstrap offline de solo lectura

Estado: implementado en Fase 3, desactivado por defecto.

`GET /api/v1/offline/bootstrap` construye una proyeccion minima para el usuario
autenticado. El servidor deriva ambiente, empresa, tenant, usuario y tecnico de
la sesion; el cliente no puede seleccionar esos valores.

## Alcance

- Requiere capacidad offline autorizada y permiso de lectura de servicios.
- Exige un empleado activo con `user_type=tecnico` y rol exacto `Tecnico`.
- Incluye ordenes asignadas en `en_curso`, `inspeccion` o `ejecucion`.
- Incluye ordenes `pendiente` programadas hasta siete dias en el futuro.
- No incluye evidencias, credenciales, notas internas ni campos de otros tenants.
- Usa dos consultas acotadas: tecnico y ordenes con sus partes de referencia.

La respuesta contiene `schemaVersion`, contexto, vencimiento, checkpoint opaco,
ordenes, actividades derivadas, checklists y catalogos utilizados. Los limites
por defecto son 100 ordenes, 500 actividades, 1000 checklists, 100 catalogos,
1 MiB y cinco segundos. `hasMore=true` obliga a tratar el snapshot como
incompleto; no existe pull incremental en esta fase.

## Revision temporal

La revision usa el milisegundo de `updated_at` del servidor. Es suficiente para
reemplazo determinista de una proyeccion de solo lectura, pero no es una version
monotona apta para conflictos o sincronizacion bidireccional. Antes de Fase 4/5
se requiere aprobar una version autoritativa persistida.

## Hidratacion

El cliente valida contrato, schema, contexto, usuario, empresa, ambiente y TTL
antes de abrir IndexedDB. La escritura del snapshot ocurre en una transaccion;
una descarga invalida no reemplaza el snapshot util anterior.

