# Certificación local: PYG individual a todo el ancho

Fecha: 28 de octubre de 2026, America/Bogota. Rama: `desarrollo`.

## Cambio

Se retira de la vista Por vehículo el panel «Matriz de ejecutados por placa». El estado de resultados de la placa seleccionada ocupa todo el ancho disponible. Se conservan el selector de placas, indicadores, desglose concepto → cuenta → centro, bloque sin vehículo y las demás vistas. No cambian consultas, cifras contables, configuración ni exportaciones.

## Resultado

Guion versionado `scripts/certifications/transport-pyg-ledger-only-browser-local.js`: **passed, 66 comprobaciones integrales**, `browser_coverage_completed: true`, finalizado `2026-10-29T00:13:35.758Z` (28 de octubre en Bogotá).

Chrome headless real, API y PostgreSQL loopback reales, con empresas y documentos sintéticos. Sin respuestas simuladas ni acceso de escritura a QA. El primer intento no llegó al PYG por vencimiento de una transacción local al registrar la empresa de prueba; la repetición completa terminó aprobada sin modificar la aplicación.

Cobertura añadida: una sola tabla de resultados, ausencia de la matriz lateral y ancho de la tabla al menos igual al 98% de su contenedor. Importes de la primera y segunda placa coinciden con el libro. Se abre el desglose de concepto y cuenta hasta el centro, se cambia de placa y se selecciona el bloque sin vehículo sin perder el reporte individual.

Se repite el resto del flujo contable protegido: conciliación del consolidado, presupuesto, configuración, guardado de rangos, permisos, aislamiento por empresa, mes compartido, respuesta tardía y actualización tras contabilizar un asiento nuevo.

## Comprobaciones adicionales

- 35 pruebas web aprobadas: página por vehículo, configuración, componente SSR y PYG interactivo. Sin fallos ni omisiones.
- Build de producción y TypeScript aprobados: `.next-single-vehicle-20261026`. Hash de la página compilada idéntico al código probado el 28 de octubre.
- ESLint de la página: cero errores y advertencias.
- Revisión independiente aprobada y `git diff --check` limpio.

## Evidencia y límites

Artefacto local: `docs/qa/evidence/transport-pyg-single-vehicle-20261028/browser-local.json`.

SHA-256: `db2593e2325405afa11d6192470ad0012635e215950068978ea6a6103ec12774`.

SHA-256 del guion: `1076599615890f55596c15220254dcd313f9a886d4286c06081c1fe22edff072`.

Captura de la vista individual: `pyg-single-vehicle-afd2643a90.png`, en el mismo directorio local de evidencia. JSON, capturas y registros quedan fuera del commit; se versiona este informe y el guion reproducible.

Sin archivos eliminados, cambios de API, migraciones, CI ni infraestructura. Pendiente autorización independiente para publicar, controles pre-QA y alcance exacto contra el `develop` vigente. Flujo obligatorio: `desarrollo -> develop -> main`. La certificación local no acredita pruebas funcionales en QA ni autoriza producción.
