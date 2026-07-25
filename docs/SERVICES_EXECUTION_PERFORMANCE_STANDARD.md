# Services Execution Performance Standard

Fecha: 2026-07-23

## Presupuestos

| Accion | Presupuesto |
| --- | ---: |
| Respuesta visual al tocar | <100 ms |
| Abrir orden | <1000 ms ideal |
| Guardar respuesta sin archivo | p95 <600 ms |
| Avanzar paso | p95 <800 ms |
| Preview fotografia | Inmediata |
| Confirmacion visual evidencia | <500 ms cuando sea seguro |

## Reglas Permanentes

- No recargar la orden completa despues de cada accion operativa.
- Toda fotografia debe tener vista previa local antes de subir.
- Las imagenes deben optimizarse antes de cargarse y conservar valor probatorio.
- Cada archivo debe tener progreso y estado independiente.
- Las subidas no deben bloquear toda la orden.
- Toda accion debe prevenir duplicados con bloqueo localizado e idempotencia.
- Las respuestas de backend deben ser minimas para la accion.
- Las invalidaciones de cache deben ser especificas por orden, paso o evidencia.
- El siguiente paso debe precargarse cuando aplique.
- Toda accion operativa debe tener presupuesto de rendimiento.
- Toda funcionalidad de campo debe probarse en red movil estable y lenta.
- Toda regresion de duplicados, recarga completa o bloqueo global debe bloquear el release.

## Clasificacion De Operaciones

| Operacion | Tipo | Regla |
| --- | --- | --- |
| Validacion local de respuesta | Bloqueante obligatoria | Debe ocurrir antes de enviar |
| Guardado de texto/checklist | Optimista controlada | Reflejar localmente y confirmar servidor |
| Cambio de paso | Bloqueante minima | Validar integridad, luego navegar |
| Subida de foto | No bloqueante | Preview y cola local, progreso por archivo |
| Auditoria secundaria | Diferida | No debe bloquear transicion |
| Historial completo | Diferida/lazy | No cargar en cada accion |
| Finalizar orden | Bloqueante obligatoria | Requiere evidencias, encuesta/firma y permisos |

## Evidencias

- `client_upload_id` es obligatorio para cada carga.
- En error de red, la foto capturada debe permanecer visible.
- El usuario debe poder reintentar sin duplicar registros.
- La galeria no debe recargarse completa tras cada upload.
- Las miniaturas deben cargarse bajo demanda cuando la lista crezca.

## Release Gate

Antes de liberar Servicios:

1. Ejecutar `npm run qa:services-performance`.
2. Ejecutar una orden Nyvora completa con perfil tecnico.
3. Registrar p50/p95 de apertura, guardado, avance, foto y cierre.
4. Probar al menos una red movil lenta o simulada.
5. Confirmar que no hay solicitudes duplicadas ni recarga completa injustificada.
