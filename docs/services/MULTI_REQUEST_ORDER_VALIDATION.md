# Validacion local: multiples solicitudes por orden

Fecha: 2026-08-12
Rama permitida: `desarrollo`
Estado: implementacion y certificacion local aprobadas; promocion pendiente de QA.

## Alcance

- Una orden admite entre 1 y 20 solicitudes independientes.
- El editor administrativo permite agregar, modificar o retirar solicitudes mientras ninguna haya iniciado ni tenga trazabilidad.
- Cada articulo agregado representa una solicitud independiente; la cantidad operativa se fija en `1` para evitar ambiguedad en la interfaz.
- Cada solicitud conserva referencia, tipo de servicio, observacion, estado, version, inspeccion, incidentes y evidencias.
- Las ordenes antiguas se leen como una solicitud sintetica sin migracion destructiva.
- El encabezado mantiene referencia y tipo de la primera solicitud para clientes antiguos.
- No se modificaron `develop`, `main`, Railway, QA ni produccion.

## Migracion

- Migracion aditiva: `20260811203000_service_order_items`.
- Crea `ServiceOrderItem` y agrega `item_id` nullable en fotos e incidentes.
- No reescribe ordenes, fotos ni incidentes existentes.
- Fue ejecutada solamente en PostgreSQL local `localhost:55432`.
- Rollback previo a promocion: retirar el codigo consumidor; las columnas nullable y la tabla pueden permanecer sin afectar el modelo legado. Un rollback fisico debe exportar primero los items y eliminar llaves, columnas y tabla en orden inverso.

## Evidencia automatizada

Comando principal:

```powershell
npm run certify:service-order-items:local
```

Resultado certificado:

```json
{
  "certification_version": "service-order-items-local-v3",
  "ok": true,
  "requests": 3,
  "administrative_edit_save": true,
  "technician_multi_item_flow": true,
  "evidence_required_error": true,
  "evidence": 6,
  "tenant_isolation": true,
  "optimistic_concurrency": true,
  "elapsed_ms": 1011.8
}
```

El certificador rechaza hosts distintos de `localhost` y `127.0.0.1`, crea datos aislados y los desactiva/limpia al finalizar.

Filtros aprobados:

- Prisma schema: valido.
- Prisma Client: generado.
- TypeScript web: aprobado.
- ESLint sobre las dos pantallas intervenidas: aprobado.
- Servicios y regresion administrativa: 31/31.
- Offline y seguridad del almacenamiento local: 49/49.
- Flujo real local de tres solicitudes: aprobado.
- Guardado administrativo real de una orden con tres solicitudes: aprobado.
- Edicion real local de una preorden de dos a tres solicitudes: aprobada; encabezado sincronizado y datos temporales eliminados.
- Aislamiento entre tenants: aprobado.
- Conflicto de version: aprobado con 409.
- `git diff --check` y sintaxis Node: aprobados.
- Build Next.js: aprobado; 64 paginas generadas en 256,4 s.

## Prueba manual local

1. Iniciar Docker Desktop.
2. Confirmar que `DATABASE_URL` apunta a `localhost:55432`.
3. Aplicar la migracion solo en local.
4. Ejecutar `npm run certify:service-order-items:local` y exigir `ok: true`.
5. Iniciar APEXOS local con `npm run start:desarrollo:windows`.
6. Entrar como administrador a Servicios y crear una orden con tres solicitudes usando referencias y tipos diferentes.
7. Confirmar que el monitor muestra una orden y el contador `0/3`.
8. Entrar como el tecnico asignado, seleccionar cada solicitud y comprobar que cambian referencia, piezas y evidencia visible.
9. Completar inspeccion y cargar producto abierto/cerrado para la primera solicitud. Confirmar que las otras dos siguen pendientes y no muestran esas fotos.
10. Repetir para las solicitudes dos y tres; confirmar progresion `1/3`, `2/3`, `3/3`.
11. Intentar finalizar una solicitud sin ambas fotos y exigir rechazo.
12. Intentar reutilizar un `item_id` de otra orden o tenant y exigir 404.
13. Verificar en anchos 390 px y 1440 px que selector, formularios y botones no se solapan.

## Criterio de aprobacion

No crear commit, no hacer push y no proponer promocion mientras el build completo no finalice con codigo cero. Despues de resolver ese bloqueo se debe repetir toda esta matriz y conservar la evidencia antes de seguir `desarrollo -> develop -> main` con autorizaciones independientes.
# Certificacion local

La certificacion reproducible de esta intervencion es
`npm run certify:service-order-items:local`. Su salida identifica la version
`service-order-items-local-v3`, falla con un codigo distinto de cero ante una
ejecucion parcial y elimina los datos temporales al finalizar.

Esta certificacion local no reemplaza la aprobacion funcional en QA ni autoriza
por si sola la promocion `desarrollo -> develop -> main`.

## Incidente de guardado por tenant

Hallazgo del 2026-08-12: una sesion local de `Demo APEX` combinaba sus ordenes
con solicitudes publicas de `SCJ`. La orden ajena aparecia editable, pero el
`PUT /api/v1/services/orders/:id` la rechazaba con 404 al aplicar correctamente
el aislamiento del backend.

Correccion certificada:

- Las sesiones locales consumen exclusivamente la API autenticada del tenant.
- El monitor auxiliar solo consulta PostgreSQL local cuando valida una identidad
  Supabase y una membresia activa para la empresa solicitada.
- El enlace de solicitud externa obtiene el nombre de empresa desde
  `GET /api/v1/auth/me`; no reutiliza un nombre obsoleto de otra sesion.
- Los errores de acceso permanecen en el formulario y no se presentan como una
  ventana secundaria de campos faltantes.
- Prueba funcional en navegador: el enlace cambio de `SCJ` a `Demo APEX`, el
  monitor mostro solo 3 ordenes del tenant autenticado y el guardado real de
  `SOL-2026-00003` finalizo sin 404.

La orden `SOL-2026-00011` pertenece a `SCJ` y, por aislamiento, solo puede ser
gestionada con una sesion administrativa de `SCJ`. No se traslado ni modifico
esa orden desde la sesion de `Demo APEX`.

## Incidente del flujo tecnico multi-solicitud

Hallazgo del 2026-08-12 en la orden local `SOL-2026-00003`: el panel seguia el
estado global de la orden y no el estado de la solicitud seleccionada. Cuando
una referencia llegaba a ejecucion, las demas dejaban de mostrar su inspeccion.
Adicionalmente, la accion de finalizar estaba disponible antes de capturar las
dos evidencias y producia un 422 evitable.

Correccion y evidencia:

- Cada solicitud abre su propio paso de inicio, inspeccion o ejecucion.
- La inspeccion y sus piezas se leen desde los metadatos de la referencia
  seleccionada, sin reutilizar el resultado de otra solicitud.
- `Finalizar solicitud` solo se habilita cuando producto abierto y producto
  cerrado estan persistidos para esa solicitud.
- Al finalizar, se selecciona automaticamente la siguiente solicitud sin
  terminar; el cierre general aparece unicamente al completar todas.
- Los errores se muestran con estado visual de error y no como confirmaciones.
- Cada carga fija el `item_id` antes de iniciar, lo incorpora a la clave
  idempotente y actualiza en memoria tanto la evidencia de la orden como la de
  la solicitud seleccionada.
- Al cambiar manual o automaticamente de solicitud se limpian las capturas
  temporales; una foto persistida en una referencia no se muestra en otra.
- Prueba funcional real: la solicitud 1 de la orden `54` avanzo de `en_curso` a
  `ejecucion`, mostro sus controles de captura y mantuvo la finalizacion
  deshabilitada sin evidencias.
- Validacion de persistencia sobre la orden `54`: las evidencias `190` y `191`
  quedaron asociadas exclusivamente al `item_id 52`; el `item_id 53` con cero
  evidencias se presento vacio despues de corregir el estado temporal.
- Certificacion aislada `service-order-items-local-v3`: tres solicitudes,
  guardado administrativo, inspeccion, ejecucion, rechazo 422 esperado sin
  evidencia, seis fotos, cierre individual, aislamiento y concurrencia; aprobada
  en 1011,8 ms.

## Agrupacion de soportes y piezas por referencia

Hallazgo del 2026-08-12: el historial y el PDF recorrian las evidencias de la
orden como una sola coleccion. En una orden con varias solicitudes esto mezclaba
fotografias, novedades y la validacion de piezas de referencias diferentes.

Correccion aplicada:

- El historial presenta una seccion independiente por solicitud y referencia.
- Al ingresar a una orden cerrada o no ejecutada se abre directamente el
  historial; no se conserva erroneamente el panel de ejecucion.
- Cada seccion usa exclusivamente fotos y novedades cuyo `item_id` pertenece a
  esa solicitud, junto con la inspeccion almacenada en sus propios metadatos.
- Los soportes administrativos sin `item_id` permanecen en una seccion general
  y no se atribuyen artificialmente a una referencia.
- La firma del cliente se clasifica siempre como soporte general de cierre,
  incluso si un registro historico conserva el `item_id` de la ultima solicitud.
- Las ordenes heredadas, que no tienen solicitudes persistidas, conservan todas
  sus evidencias dentro de su unica referencia sintetica sin duplicarlas.
- El PDF reproduce el mismo orden: referencia, tipo, estado, validacion de
  piezas, soportes y novedades de cada solicitud; al final incorpora solo los
  soportes generales.

Evidencia automatizada:

- `node --test apps/web/test/service-order-support-grouping.test.mjs`: aprobado.
- Pruebas de dominio, seguridad y agrupacion: 20/20 aprobadas.
- `npm run certify:service-order-items:local`: `ok: true`, tres referencias,
  una validacion de piezas por referencia, dos fotos por referencia y PDF con
  los tres codigos; ultima ejecucion en 1250,79 ms.

La aprobacion local certifica el comportamiento reproducible, pero no sustituye
la validacion funcional en QA ni autoriza por si sola una promocion.

## Validacion y novedades independientes por solicitud

Ampliacion del 2026-08-12:

- La decision de inspeccion se conserva y se muestra por solicitud aun cuando la
  referencia no tenga piezas configuradas; este caso ya no aparece como una
  inspeccion inexistente.
- Para cada pieza se presentan estado, comentario y accion registrada. Las
  piezas en estado `averiada` o `faltante` permanecen dentro de la referencia
  inspeccionada junto con su soporte fotografico.
- Cada solicitud recupera el menu desplegable `Ver detalle de las N piezas`.
  Las alertas se muestran antes del menu y el desplegable conserva el listado
  completo de piezas revisadas sin mezclar inspecciones de otras referencias.
- Las novedades operativas se vinculan mediante `item_id` y se presentan en una
  subseccion propia de cada solicitud. Las novedades sin `item_id` permanecen
  como generales y no se mezclan con referencias.
- Un cierre no ejecutado transmite y valida la solicitud seleccionada. Su motivo
  queda asociado a esa solicitud y la evidencia `no_ejecutada` debe pertenecer
  al mismo `item_id`; la firma sigue siendo un soporte general de la orden.
- El PDF imprime por referencia la decision y validacion de piezas, sus soportes
  y una tabla con tipo, descripcion, accion y fecha de cada novedad.

Certificacion reproducible:

- Pruebas de dominio, seguridad, presentacion y reporte: 21/21 aprobadas.
- `npm run certify:service-order-items:local`: `ok: true`, tres inspecciones,
  tres novedades independientes, seis evidencias y los detalles de las tres
  novedades presentes en el PDF; ultima ejecucion en 1416,15 ms.

## Contrato contenedor, productos y cierre

El modelo funcional queda definido de forma explicita:

- La orden es el contenedor unico. Conserva cliente, tecnico, encuesta, firma y
  cierre general.
- Cada solicitud representa un producto o servicio independiente. Conserva su
  referencia, inspeccion, piezas, novedades y evidencias de producto abierto y
  cerrado.
- Cada solicitud debe finalizar con sus propias evidencias antes de habilitar el
  cierre del contenedor. Al final se solicita una sola encuesta y una sola firma.
- La firma se almacena sin `item_id` como soporte general y nunca se atribuye a
  la ultima referencia seleccionada.
- Si una orden historica contiene firmas duplicadas, la plataforma y el PDF
  presentan una sola firma canonica, seleccionando el registro mas reciente.
- Cuando una referencia no tiene despiece configurado, el producto completo se
  usa como unidad minima de inspeccion. Esto permite registrar y recuperar la
  validacion sin fabricar un catalogo de componentes inexistente.
- La plataforma y el PDF reproducen esta jerarquia: orden, solicitudes,
  validacion de producto/piezas, novedades y evidencias; encuesta y firma quedan
  una sola vez en el nivel de la orden.

## Estructura visual del PDF

El reporte sigue una paginacion determinista para facilitar lectura y auditoria:

- La primera pagina contiene identificacion de la orden, datos del cliente,
  control operativo, linea de tiempo y cantidad total de productos.
- Cada producto comienza en una pagina propia con encabezado contextual. Dentro
  de esa pagina se presentan, en orden, validacion de piezas, evidencias y
  novedades de la referencia.
- La ultima seccion comienza en una pagina independiente y contiene solamente
  novedades generales, encuesta y soportes del contenedor, incluida la firma.
- Todas las paginas repiten orden, contexto y numero de pagina para evitar que
  una tabla separada por salto de pagina pierda su referencia.
