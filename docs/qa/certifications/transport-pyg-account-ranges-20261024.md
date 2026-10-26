# Certificación local: PYG por vehículo con fuente contable (rangos PUC configurables)

Fecha: 26 de octubre de 2026. Rama de implementación: `desarrollo`.

## Resultado final

El guion integral versionado `scripts/certifications/transport-pyg-account-ranges-browser-local.js` se ejecutó completo y **PASSED con 65 comprobaciones**. La evidencia `docs/qa/evidence/transport-pyg-account-ranges-20261024/browser-local.json` registra `status: passed` y `browser_coverage_completed: true`, generada el 2026-10-26. La revisión corrió con Chrome real, la API local en `http://127.0.0.1:3219`, la web local en `http://127.0.0.1:3011` y PostgreSQL loopback real, sin interceptar peticiones.

Las suites unitarias y de regresión sumaron **211 pruebas aprobadas**: 43 unitarias de API, 18 unitarias de web, 130 de regresión de API y 20 de regresión de web. La compilación de producción (`v2`) y el TypeScript pasaron. Tras corregir el guardado de la página, la repetición de las 38 pruebas unitarias y de regresión web aprobó.

## Cobertura del guion integral

El guion verifica, sin mocks, el flujo contable completo: registro de tenants aislados en plan `crown`, estructura de organización, creación de cuentas PUC únicamente por la API (con la cadena completa de padres por prefijo y verificación por `parent_id`), vehículos, documentos contables, presupuesto PUC contable, GET/PUT de configuración (válida e inválida con códigos específicos del validador puro), valores esperados del reporte por vehículo / sin asignar / corporativo, reconciliación, coberturas de presupuesto, avisos, RBAC 403/200 con rol no administrativo, invalidación de caché, re-login tras cambio de permisos y aislamiento entre empresas.

En navegador, de forma real sobre Chrome, cubre: selector "Contable · PUC" conservado, ausencia del panel "Producción vs. costo por placa", pestaña Presupuestos oculta en fuente contable, valores reales del DOM del consolidado, drill concepto > cuenta > centro con solo nombres (códigos únicamente en configuración), bloque sin vehículo, editor de configuración con propuesta del Excel, edición de nombre/orden, guardado y persistencia tras recarga, creación de concepto con rango y exclusión desde la UI, solo lectura y el regreso a la fuente operativa: el guion guarda primero el borrador (la UI rechaza volver con cambios sin guardar), verifica por API que la fuente operativa conserva los conceptos y recarga el legado intacto.

## Corrección del guardado de la página

El guion falló en momentos previos porque el editor se desmontaba mientras el reporte aun estaba cargando, por lo que las comprobaciones de guardado no podían completarse. La corrección mantuvo el editor montado mientras el reporte carga. El guion final usa el aviso de restauración real de la UI: al volver a la fuente operativa se muestra "Fuente operativa histórica restaurada; los rangos PUC guardados se conservan para cuando vuelvas a usar la estructura contable." Las 38 pruebas unitarias y de regresión web aprobaron tras esta corrección; el recorrido integral final aprobó 65 comprobaciones.

## Cuentas PUC creadas por la API

El catálogo versionado crea cada cuenta con su cadena completa de padres por prefijo. Para el impuesto, el grupo es `541005` y su auxiliar `54100501`, ambos bajo los padres `5410` y `54` (`54100501 <- 541005 <- 5410 <- 54 <- 5`); la auxiliar hereda el tipo `expense` del padre. Las cuentas existentes nunca se modifican: el guion las conserva tal como están. Las cuentas PUC preexistentes pueden admitir transacciones; solo las cuentas de agrupación **nuevamente creadas** por el guion heredan la restricción de no permitir movimientos, según lo que el propio guion dispone. Si se necesita el detalle exacto de la activación de cada grupo, este se consulta en el guion versionado; esta certificación no inventa ese dato.

## Correcciones de cobertura documentadas (conteos exactos)

No se afirma una ejecución comodín de "todas las pruebas" de API ni de web. Los conteos reales y los comandos son:

- Unitarias de API: **43 PASSED**. `node --test apps/api/test/transport-pyg-account-ranges.test.js apps/api/test/transport-pyg-report.test.js`
- Regresión de API: **130 PASSED**. Ejecución seleccionada de regresión contable, con 130 resultados en `api-regression.log`.
- Unitarias de web: **18 PASSED**. `node --test apps/web/test/transport-pyg-account-config.test.mjs apps/web/test/transport-pyg-vehicle-page.test.mjs apps/web/test/transport-pyg-account-config.component.test.mjs`
- Regresión de web: **20 PASSED**. `node --test apps/web/test/accounting-pyg-interactive.test.mjs apps/web/test/accounting-reversal-budget-import.test.mjs`.
- Build de producción (`v2`) y TSC passed.

Las pruebas de API usan modelos y dobles de Prisma; no son pruebas de flujo real. El guion integral versionado es la única prueba sin mocks (Chrome real, API local real y PostgreSQL loopback real).

## Configuración y reporte contable (resumen de comportamiento verificado)

La configuración vive en `Tenant.config.accounting.vehicle_pyg` (sin migraciones). El GET nunca escribe. El PUT valida todo (errores acumulados), conserva las demás claves de `Tenant.config` y escribe solo `accounting.vehicle_pyg` bajo el candado contable compartido `pg_advisory_xact_lock` (`${tenantId}:accounting-numbering`), con auditoría e invalidación de caché.

El reporte con fuente contable lee el libro una sola vez vía `getInteractivePyg` (sin modificarlo), extrae solo hojas terminales de centro de costo con cuenta PUC real y no vuelve a filtrar por tipo de cuenta, porque `getInteractivePyg` ya entrega clases PUC 4–7. La asignación por vehículo usa el árbol de organización (`cost_centers.vehicle_id`) y, solo como legado no ambiguo, la placa normalizada. Los asientos ambiguos o sin centro/sucursal no se duplican y generan avisos; los centros sin placa quedan en "Sin vehículo / sin asignar" y la reconciliación corporativa cubre todos los centros.

## Límites y publicación

No se modificaron el PUC interactivo protegido (`pyg-interactive.js`), las anulaciones, el importador de presupuesto, el esquema Prisma ni el CI. No se realizaron migraciones ni cambios remotos de infraestructura o secretos.

Este cambio **aun no se ha publicado en QA**. El usuario autorizó publicar con "publica en qa" el 2026-10-26, pero la publicación no se ha ejecutado. Faltan y quedan pendientes: el manifiesto pre-QA y su gate, el manifiesto de alcance exacto (con `scope_schema_version: 2` y el inventario exacto de archivos) contra el `develop` remoto vigente, y el aislamiento puntual de los commits que se promuevan. Las validaciones locales no autorizan producción, y no se ejecutó ninguna escritura remota.
