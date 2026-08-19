# Ordenes de servicio con multiples solicitudes

## Modelo actual

`ServiceOrder` contiene directamente una referencia, un tipo de servicio, estado, tecnico, cliente y datos de cierre. `ServicePhoto` y `ServiceIncident` pertenecen solamente a la orden. La inspeccion se conserva en `ServiceOrder.metadata.inspection`. `ServiceReferencePart` representa piezas del catalogo y no una unidad de trabajo.

## Modelo propuesto

`ServiceOrder` continua como cabecera comercial y operativa. `ServiceOrderItem` representa cada solicitud ejecutable y contiene referencia, tipo de servicio, cantidad, descripcion, observacion, estado, version y marcas de inicio/finalizacion. Fotografias y novedades pueden pertenecer a un item o permanecer a nivel general de la orden.

```text
ServiceOrder 1 -> N ServiceOrderItem
ServiceOrderItem 0 -> N ServicePhoto
ServiceOrderItem 0 -> N ServiceIncident
```

No se usa JSON como almacenamiento primario de solicitudes. El JSON existente conserva solamente inspecciones y metadatos compatibles.

## Reglas de negocio y estados

- Estados de item: `pendiente`, `en_curso`, `inspeccion`, `ejecucion`, `completada`, `no_ejecutada`, `bloqueada`.
- Una transicion exige `expected_version`; una actualizacion concurrente falla con `409`.
- La OS conserva su maquina actual. Si todos los items estan pendientes queda `pendiente`; cualquier item activo coloca la OS en el estado activo mas avanzado; items terminados con pendientes mantienen la OS en `ejecucion`; todos terminados habilitan el cierre normal de la OS.
- No se agrega un estado global nuevo. El progreso parcial se expone como resumen calculado.
- Un item solo puede editarse o eliminarse antes de iniciar. El ultimo item no puede eliminarse.
- Una evidencia o novedad con `item_id` debe pertenecer a la misma OS y empresa.

## Compatibilidad legacy

- Los campos `reference_id` y `service_type` de la OS se mantienen y reflejan el primer item.
- Una orden sin filas en `ServiceOrderItem` se expone como un item legacy sintetico de solo lectura; usa sin cambios los endpoints y flujo actuales.
- No se requiere backfill para leer, ejecutar, cerrar, reportar o exportar ordenes existentes.
- La migracion es aditiva: tabla nueva, dos llaves foraneas opcionales e indices. Su rollback elimina primero esas columnas y luego la tabla, sin modificar datos legacy.

## Evidencias

Las evidencias generales conservan `item_id = null`. Las evidencias especificas requieren un item de la misma orden. Se conservan autorizacion, MIME, firma binaria, limite, bucket privado, cuarentena, checksum, idempotencia y URL firmada existentes.

## Seguridad y auditoria

Todos los accesos parten de `accessibleOrder`, que aplica tenant y alcance del tecnico. La consulta del item siempre incluye `order_id` y `tenant_id`. Creacion, edicion, eliminacion y transiciones generan `AuditLog`. IDs manipulados o de otra OS retornan `404`.

## Offline

No se habilitan escrituras offline nuevas. El snapshot continua incluyendo la OS y sus etapas legacy. Los items se incluyen como datos de lectura cuando esten disponibles; su ejecucion offline queda fuera de esta fase y debe rechazarse por el contrato actual.

## Rendimiento

Detalle y lista cargan items y conteos mediante includes agrupados. Evidencias se consultan en una sola operacion por OS y se agrupan por `item_id`; no hay consultas por item. Los indices cubren tenant/orden/estado y orden/item/activo. Limite funcional inicial: 20 items por orden.

## Migracion local

La migracion propuesta se valida solamente en local. No debe ejecutarse en QA ni produccion dentro de esta intervencion.

## Riesgos y pruebas

El principal riesgo es mezclar evidencia por IDs manipulados; se cubre validando orden, tenant e item en la misma consulta. Se prueban 1, 3, 10 y 20 items, aislamiento, idempotencia, concurrencia, estados agregados, cierre parcial/completo, evidencia/novedad independiente y orden legacy.
