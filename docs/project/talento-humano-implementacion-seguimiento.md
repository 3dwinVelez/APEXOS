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

## Ultima actualizacion

- Fecha: 2026-09-17
- Rama de trabajo: `desarrollo`
- Nota: no se ha ejecutado certificacion end-to-end de promocion.
