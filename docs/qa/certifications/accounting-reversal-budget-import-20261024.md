# Certificación local: anulaciones contables e importación de presupuesto

Fecha: 24 de octubre de 2026. Rama de implementación: `desarrollo`.
Resultado local: aprobado. QA: pendiente de promoción autorizada por `desarrollo -> develop`; no autoriza `main`.

## Comportamiento certificado

- Asientos permite solicitar una anulación con motivo y fecha de período abierto. La API valida nuevamente el origen y genera un documento enlazado con débitos y créditos invertidos, conservando cuenta, tercero, sucursal y centro de costo. El original se conserva anulado y queda auditoría.
- Solo son elegibles los documentos manuales con evidencia de origen creada por el servidor y los saldos históricos identificables del importador. Se rechazan documentos generados por otros módulos, documentos ya anulados, reversiones y orígenes no verificables. Una anulación requiere permiso de escritura en Contabilidad y respeta el tenant.
- Se comprueba la estructura del documento antes de emitir el espejo. La numeración y las escrituras de configuración usan el mismo bloqueo contable que el presupuesto. La fecha contable se muestra sin desplazamiento de día por zona horaria.
- PYG / Presupuesto PUC ofrece plantilla Excel, validación con errores por fila, previsualización y confirmación. Columnas: `periodo` (YYYY-MM), `cuenta`, `centro_costo`, `sucursal`, `presupuesto`; no incluye tercero.
- El presupuesto es mensual y usa valores no negativos y cuentas transaccionales activas PUC 4–7. Los códigos se resuelven sin sensibilidad a mayúsculas y minúsculas; las coincidencias ambiguas se rechazan. Sucursal y centro deben corresponder a la estructura del tenant.
- La importación agrega tuplas nuevas sin sobrescribir presupuestos existentes; duplicados, reimportaciones y archivos inválidos se rechazan. No escribe movimientos de libro. Los importes alimentan el almacén existente del PYG, sus agregados PUC, filtros y comparativos, conservando el año anterior.

## Validación ejecutada

1. **150 pruebas automatizadas aprobadas**, sin fallos ni omisiones: reversión, importación de presupuesto, regresión de saldos iniciales y PYG, API e interfaz. Incluye una regresión que ejecuta la contabilización de saldos con configuración de tenant para evitar la referencia a una variable antes de inicializarse.
2. **80 comprobaciones integrales aprobadas**, sin fallos, mediante el guion versionado `scripts/certifications/accounting-reversal-budget-import-browser-local.js`: Chrome real, API real y PostgreSQL local. Finalizó el 24 de octubre a las 08:57:33 de Colombia (`2026-10-24T13:57:33.500Z`).
3. La certificación ejercita creación y reversión de documentos manuales y saldos históricos, espejo en el libro sin borrados, auditoría, rechazo de repetición, cierre y reapertura de período, origen de Compras, origen no acreditado, permisos y aislamiento entre empresas. En navegador confirma el documento inverso y las fechas visibles.
4. Descarga real del Excel a disco en Chrome, lectura de sus encabezados, carga, validación, confirmación, persistencia y visualización del presupuesto en las columnas de la matriz PYG. Incluye agregación a la clase PUC y filtros por sucursal y centro, conservación de otros meses y año anterior y comprobación de ausencia de movimientos contables por importar presupuesto.
5. Compilación de producción web y TypeScript aprobados. Las tres fuentes web compiladas coinciden por hash con las fuentes revisadas. Los doce hashes de fuentes registrados en la evidencia integral coinciden con los archivos finales.

Los datos empleados son sintéticos y pertenecen a tenants aislados de la base local. La API se ejecutó en loopback 3218 y la compilación final en loopback 3010. No se ejecutaron pruebas con escrituras en QA ni producción.

## Evidencia local generada

El JSON y las capturas permanecen como artefactos locales, fuera del commit:

- `docs/qa/evidence/accounting-reversal-budget-import-20261024/browser-local.json` (`status: passed`, 80 comprobaciones).
- `rv-budget-matrix-comparative-287ee3e25b.png`: presupuesto visible en la matriz.
- `rv-budget-validate-preview-287ee3e25b.png` y `rv-budget-import-success-287ee3e25b.png`: previsualización e importación.
- `rv-asientos-reversed-287ee3e25b.png`: documento inverso, original anulado y fechas.
- `rv-asientos-reversal-ineligible-287ee3e25b.png` y `rv-budget-readonly-287ee3e25b.png`: restricciones de origen y permisos.

## Límites y publicación

Los asientos antiguos sin evidencia suficiente de origen no se reclasifican automáticamente como manuales. El endpoint legado `/accounting/journal` crea líneas de libro sin cabecera documental y no se incorpora a este botón de anulación. No se realizaron migraciones ni cambios remotos de infraestructura o secretos.

Esta certificación no equivale a despliegue. Antes de promover el candidato a QA faltan la autorización independiente, el manifiesto pre-QA y su gate, y el manifiesto de alcance exacto contra el `develop` remoto vigente. Las validaciones locales no autorizan publicación ni producción.
