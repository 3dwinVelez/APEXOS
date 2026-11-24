# Seguimiento de implementacion - Talento Humano

Fuente funcional: `C:/Users/manue/Downloads/APEX_OS_RUTA_TALENTO_HUMANO_NOVEDADES_MALLAS_NOMINA.md`

Este documento lleva el control de avance por fases. La ruta completa no autoriza saltar el flujo `desarrollo -> develop -> main`; cada fase debe cerrarse con pruebas y evidencia antes de proponer promocion.

## Estado general

| Fase | Alcance | Estado | Evidencia actual |
| --- | --- | --- | --- |
| 1 | Migraciones y catalogos base | En progreso | Migracion `20260917120000_hr_workday_novelties_foundation`; pruebas `hr-workday-novelties-*` |
| 2 | Maestro de empleados, usuarios y salarios | En progreso | Listado, vista y edicion basica de empleados; falta historial salarial operativo completo |
| 3 | Entidades laborales y enlace contable | En progreso | CRUD de entidades laborales y enlace a tercero contable en construccion |
| 4 | Afiliaciones del empleado | En progreso | Historial por tipo con vigencias y validacion de solapamiento en construccion |
| 5 | Plantillas y validaciones de mallas | Parcial | Validaciones de horario, rango, empleados, solapamiento por empleado; falta maestro completo de plantillas |
| 6 | Calendario laboral y parametros por vigencia | En progreso | Tablas, seeds iniciales Colombia, API y UI de configuracion laboral; falta calendario/importacion CSV/XLSX |
| 7 | Motor de segmentacion laboral | Parcial | Helper puro diurna/nocturna; falta integracion completa con jornadas reales |
| 8 | Submodulo de novedades y auditoria | Parcial | Catalogo, bandeja inicial, idempotencia base; falta flujo completo de estados y masivos |
| 9 | Cierre de jornada con kilometraje | Parcial | Cierre con vehiculo exige kilometraje y registra alerta inusual; falta UI de correcciones versionadas |
| 10 | Reportes, exportaciones y certificacion | Pendiente | Falta Excel, manifiesto y certificacion end-to-end |

## Criterios por cerrar

### Empleados
- [x] Listado operativo.
- [x] Ver informacion del empleado.
- [x] Editar datos laborales basicos.
- [ ] Asociar/desasociar usuario APEX desde UI.
- [ ] Historial salarial con vigencias sin solapamiento.
- [ ] Permiso separado para salario.

### Entidades laborales
- [ ] Crear EPS, pension, ARL, caja e ICBF.
- [ ] Editar datos, vigencia y estado.
- [ ] Enlazar tercero contable existente sin duplicarlo.
- [ ] Advertir diferencia de NIT con tercero.
- [ ] Mostrar estado enlazada/pendiente.

### Afiliaciones
- [ ] Registrar afiliacion por empleado, tipo y entidad.
- [ ] Mantener historial con `fecha_desde` y `fecha_hasta`.
- [ ] Rechazar vigencias superpuestas del mismo tipo.
- [ ] Permitir ICBF como opcional.

### Mallas y marcaciones
- [x] Rechazar jornadas que cruzan medianoche.
- [x] Rechazar hora final igual o anterior a inicial.
- [x] Permitir vehiculo compartido.
- [x] Rechazar solapamiento por empleado.
- [x] Kilometraje obligatorio al cerrar jornada con vehiculo.
- [ ] Correcciones de marcacion con auditoria completa.

### Novedades y motor laboral
- [x] Catalogo inicial de tipos.
- [x] Clave logica idempotente base.
- [ ] Reprocesamiento automatico por evento.
- [ ] Estados completos con historial visible.
- [ ] Aprobacion/rechazo individual y masiva.
- [ ] Exportacion Excel.

### Configuracion laboral
- [x] Parametrizar inicio y fin de jornada nocturna por vigencia.
- [x] Parametrizar maximos diarios y semanales de horas extra como alerta.
- [x] Parametrizar conceptos de recargo con porcentaje adicional, factor total o informativo.
- [x] Rechazar vigencias superpuestas por codigo, empresa y pais.
- [ ] Integrar resolucion completa de conceptos en el procesamiento real de jornadas.

## Lectura del monitor de marcaciones (estado 2026-11-24)

El peso del monitor ya no está en el binario: medido en Producción, las tres lecturas del panel
responden entre 0 y 7 KB. Lo que cuesta es el número de viajes al pooler por petición.

- `/hr/routes/event-summaries` acota por la fecha que la pantalla tiene seleccionada
  (`boundedReportRange`). Sin fecha sigue siendo válido —devuelve las 100 rutas más recientes de
  todo el historial y lo declara en `truncation.hint`— pero es camino de referencia, no del usuario.
- `TimePunch` se agrega una sola vez por `route_id, type`; el total y las salidas se derivan en
  memoria. Antes eran dos sentencias para el mismo escaneo.
- La proyección de evidencia solo reescribe la columna cuando pesa más de 4096 bytes
  (`guardedEvidenceProjection`); las filas ligeras se devuelven tal cual. Una fila con
  `base64: ""` cuenta como cero evidencias, no como una.
- El binario se pide por id a `/hr/monitor-evidence/:source/:id`. En Producción quedan 256 MB de
  TOAST en 2.679 filas (170 `metadata` y 58 `extra_evidence` por encima de 4 KB): se retiran con la
  Fase C.1 (`scripts/hr-evidence-backfill-storage.js`), que exige autorización del dueño.
- El piso también estaba en un handler, no en la base: `/auth/me` releía usuario, rol, permisos y
  tenant en cuatro sentencias cuando la única sentencia del snapshot de autorización ya los trae
  para el middleware. Hoy comparten `readAuthorizationSnapshot`
  (`apps/api/src/security/authorizationState.js`), y esa lectura es la que abre cada pantalla.
- No hay índice en `TimePunch.route_id` y no hace falta: el `EXPLAIN` del agregado lee 333 buffers
  con coste 358. Añadir índices sería atacar el problema equivocado.
- La pantalla de rutas abre fijada en el día de hoy; otras fechas se piden bajo demanda.

## Ultima actualizacion

- Fecha: 2026-11-24
- Rama de trabajo: `desarrollo`
- Nota: no se ha ejecutado certificacion end-to-end de promocion. El `DESPUES` del presupuesto de
  reloj queda pendiente de desplegar; ver `docs/briefs/2026-11-24-monitor-marcaciones-latencia.md`.
