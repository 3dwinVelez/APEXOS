# Certificación local: PYG por vehículo desde el libro contable

Fecha local: 26 de octubre de 2026 (America/Bogota). Implementación en `desarrollo`.

## Resultado y comportamiento

Certificación integral **passed**, 61 comprobaciones y `browser_coverage_completed: true`, finalizada en `2026-10-27T01:28:04Z`. Script: `scripts/certifications/transport-pyg-ledger-only-browser-local.js`.

El reporte por vehículo consulta siempre los asientos publicados del mes solicitado mediante el lector contable existente. No requiere activar una fuente, no consulta la alternativa operativa y no escribe configuración al leer. Conserva los conceptos personalizados, incluidos los guardados con la bandera operativa anterior; sin configuración utiliza la propuesta de rangos en memoria. La configuración solo agrupa cuentas por conceptos, rangos y exclusiones.

Contable · PUC y Por vehículo comparten período. Se rechazan respuestas de otra fuente o período; las respuestas obsoletas no reemplazan el período actual. Durante la carga o tras un error no se muestra ni exporta el reporte anterior. Las lecturas de reporte y configuración omiten la caché del cliente para consultar datos actuales.

## Cobertura real

Chrome headless real, API local y PostgreSQL loopback reales; tenants sintéticos aislados. Ninguna escritura en QA. El guion crea estructura, cuentas y documentos, y contrasta la utilidad del reporte por vehículo con el PYG contable del mismo mes. Cubre ausencia de configuración con asientos existentes, configuración heredada, persistencia sin alterar otras claves, validaciones, permisos y aislamiento por empresa, presupuesto, centros sin vehículo, drill por nombres, edición y guardado de rangos y exclusiones.

En navegador verifica período compartido, agosto y julio separados, estado de carga sin exportación, y respuesta tardía: retiene una petición real de agosto hasta que julio está visible y después libera la petición para confirmar que julio sigue mostrando 777.000. No fabrica respuestas. Publica un asiento adicional de julio en el entorno local y pulsa Actualizar: el total cambia de 777.000 a 827.000 sin recargar la página. Finalmente vuelve a agosto y concilia nuevamente su utilidad de 2.465.000.

## Comprobaciones adicionales

- 52 pruebas API: `node --test apps/api/test/transport-pyg-account-ranges.test.js apps/api/test/transport-pyg-report.test.js`.
- 130 pruebas de regresión API: saldos iniciales, presupuesto PUC, PYG interactivo y anulaciones (`accounting-opening-balances`, `accounting-pyg-budget-import`, `accounting-pyg-interactive`, `accounting-reversal`).
- 42 pruebas web: configuración PYG, página por vehículo, componente SSR, PYG interactivo y anulación/importación de presupuesto.
- Compilación de producción y TypeScript aprobados: `.next-pyg-ledger-only-v2`. Cuatro archivos funcionales web comparados con la compilación: hashes idénticos.
- ESLint de los cuatro archivos funcionales web: cero errores, dos advertencias existentes en el cliente API.

Total de pruebas unitarias y regresión: **224 aprobadas**, sin fallos ni omisiones. Estas pruebas no sustituyen el guion integral real.

## Evidencia y límites

Artefacto local: `docs/qa/evidence/transport-pyg-ledger-only-20261026/browser-local.json`.

SHA-256 del artefacto: `5ab83658a48cf8dbbf2482b673934d8797611538e97eb8bc32a1c56d5e93dc45`.

SHA-256 del guion ejecutado: `3894ef4a9d6767707aace8083d6315c03c014624e10a8978309a1d30060765bd`.

El artefacto incluye hashes de las fuentes, resultados y rutas de cuatro capturas. JSON crudo, capturas, registros y datos de pruebas permanecen locales, fuera del commit. Los intentos previos fallidos no constituyen la certificación final: se corrigieron referencias del guion, una exclusión inválida del fixture y la caché funcional detectada en el recorrido.

No cambia Prisma, migraciones, CI, secretos ni infraestructura. No se modifica el lector canónico del PYG contable, la anulación ni el importador de presupuesto. El cambio puntual del cliente API se limita a las dos lecturas del módulo.

## Publicación

Pendiente de autorización independiente y de los controles pre-QA y alcance exacto contra el `develop` vigente. Flujo obligatorio: `desarrollo -> develop -> main`. Este documento acredita pruebas locales; no acredita despliegue, validación funcional en QA ni autorización de producción.
