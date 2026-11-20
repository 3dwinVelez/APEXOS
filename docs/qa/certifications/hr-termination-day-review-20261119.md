# Revision de dias sin marcacion en el retiro

## Comportamiento

El retiro usa el inicio efectivo del contrato, no la primera marcacion. El inicio pendiente se deriva del contrato y los documentos de nomina registrados; no se permite adelantarlo manualmente para omitir dias sin revisar.

La vista de prueba informa los dias pendientes de aclarar y muestra importes provisionales. El servidor y la interfaz bloquean la creacion o recalculo definitivo mientras haya dias sin justificar.

Clasificaciones: trabajado sin marcacion, induccion, descanso remunerado, permiso remunerado y ausencia no remunerada. Requieren observacion y responsable autenticado de la misma empresa. Una decision remunerada reconoce el basico diario una sola vez; una no remunerada resuelve la revision sin agregar salario.

Las decisiones se guardan en `th_nomina_ajustes`, tipo reservado `revision_dia`, con fecha, clasificacion, observacion, actor, fecha de revision e historial de cambios. La nomina y el retiro consumen el mismo registro. Los endpoints genericos no pueden crear ni anular estas revisiones saltandose el flujo. Los reintentos conservan el identificador y no duplican registros.

Una marcacion o novedad registrada posteriormente prevalece como soporte, sin pagar dos veces el mismo dia. Las vacaciones y licencias segmentadas ya registradas se consideran soportadas y conservan su calculo existente. Esta funcion resuelve el salario basico pendiente; no sustituye los registros especificos de novedades de seguridad social ni altera automaticamente las bases legales de prestaciones.

La consulta muestra dias reconocidos/no remunerados/pendientes, valor diario y salario basico pendiente con centavos. El documento guarda una copia de las decisiones para consultar las observaciones y responsables. No se modifican fichas ni pagos existentes automaticamente.

## Evidencia local

- 40 pruebas unitarias y de regresion aprobadas (revision de dias, prestaciones de retiro, deducciones, conceptos manuales, periodos, IBC y pantalla de talento humano).
- TypeScript de la pagina y componentes modificados: aprobado mediante `.local/hr-day-review/tsconfig.json`.
- Certificacion nueva: `scripts/certifications/hr-termination-day-review-local.js`, por el wrapper local aislado. **5/5 recorridos aprobados**, del 2026-11-19T23:01:04.269Z al 2026-11-19T23:01:56.327Z, base `apexos_cert_hr_assoc_1795129249613`, origen sin modificar y cero 5xx inesperados.
- Caso reproducido: contrato 3-nov, primera marcacion 4-nov, retiro 6-nov, salario mensual 2.000.000. La prueba provisional da basico 200.000 con un dia pendiente. Aprobar induccion el dia 3 produce basico 266.666,67. Se comprueban cambio a no remunerado, idempotencia, historial, otra empresa, permiso insuficiente, observacion obligatoria, bloqueo por dia soportado y rechazo del salto manual del inicio pendiente.
- Chrome ejecuta busqueda de empleado, vista provisional, justificativo, recarga, comparacion con nomina y guardado del retiro con auditoria. Capturas y JSON locales en `.local/hr-day-review/` (`provisional-missing-day.png`, `approved-salary.png`, `saved-review-audit.png`).
- Regresion integral `scripts/certifications/hr-termination-complete-local.js`: **13/13 recorridos aprobados**, del 2026-11-19T23:02:17.282Z al 2026-11-19T23:03:37.788Z, base `apexos_cert_hr_assoc_1795129321650`, cero 5xx inesperados. Incluye prestaciones, libranzas, recalculo, borrado, reingreso, conceptos manuales y exclusion de nomina. Los datos sinteticos justifican explicitamente los dias sin soporte; no se desactiva el bloqueo del producto.
- Se verifica historial salarial que inicia a mitad del periodo: la tarifa mensual se pondera sobre los dias cubiertos por el historial, antes de aplicar los dias reconocidos. La ficha con ingreso posterior al contrato conserva el dia revisado del contrato tanto en nomina como en retiro.

## Entrega

Trabajo local certificado en `desarrollo`. Sin migraciones, cambios remotos, push ni despliegue. Publicar requiere autorizacion expresa y los manifiestos y controles de alcance/pre-QA conforme a `desarrollo -> develop -> main`; esta certificacion local no autoriza promocion.
