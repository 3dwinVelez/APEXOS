# Revision local: digitacion de Gastos Menores

La implementacion se realizo en `desarrollo` mediante Qoder CLI con DeepSeek; Codex reviso el codigo y ejecuto las validaciones. El candidato funcional original es `1b036e4f4b645946b4dbdffe5e715d072fcf7906`.

## Alcance revisado

Captura compacta con cabecera alineada, soportes por linea visibles cuando son obligatorios, observacion plegable, busqueda por texto y Enter, repeticion de datos sin importe, identidad estable de filas y limite de 100 lineas. El proveedor se busca por nombre o NIT opcional. La captura excluye el historial flotante de FieldProductivity para que no cubra Contabilizar gasto; el historial conserva su comportamiento en las demas pantallas.

No cambia el contrato del comprobante, los calculos del servidor, las migraciones ni la configuracion de QA. El alcance de producto consta de tres componentes, dos archivos de pruebas y un script de certificacion.

## Evidencia ejecutada y revisada

- Compilacion de produccion Next.js 16.3.5 con webpack: aprobada, 123 paginas generadas.
- `node --test apps/api/test/petty-cash-vouchers.test.js apps/api/test/petty-cash-masters.test.js apps/api/test/petty-cash-reports.test.js`: 124 aprobadas.
- `node --test apps/web/test/gastos-menores-entry-ux.test.mjs apps/web/test/gastos-menores-operations.test.mjs apps/web/test/gastos-menores-masters.test.mjs apps/web/test/gastos-menores-reports.test.mjs`: 78 aprobadas.
- `scripts/certifications/gastos-menores-entry-ux-browser-local.js`: 65 comprobaciones aprobadas, sin fallos, contra Chromium, API y PostgreSQL locales reales. Ejecucion final revisada: 2026-10-20T20:01:48.520Z. Las huellas del resultado coinciden con los seis archivos del candidato original.

El flujo real cubre login, entrada por texto, buscador con Enter y Escape, foco, soportes obligatorios, IVA opcional, repeticion sin valor, preservacion de texto invalido al eliminar filas, bloqueo de guardado invalido, anticipo obligatorio y exclusion de anticipos de otra caja. Se verificaron 1366x900 y 390x844 sin desbordamiento horizontal de pagina.

Se contabilizaron dos lineas reales con bases 12500 y 2500: base total 15000, IVA 2850 y total 17850. PostgreSQL confirmo ambas lineas con proveedor, factura y centro; el asiento tiene debitos y creditos de 17850. El anticipo paso de 500000 a 482150. Listado, recarga y detalle conservaron el comprobante exacto. La anulacion desde la interfaz genero reversa contable balanceada y restauro 500000. Un usuario sin permisos no obtuvo formulario ni accion de contabilizar.

Las pruebas de helpers verifican identidades distintas al repetir, ausencia de importe copiado, maximo de 100 filas, soportes que nunca se ocultan si son requeridos o invalidos, proveedores sin NIT y proteccion de campos sensibles del historial. La carga del listado, permisos contables y payload cerrado permanecen protegidos. No hubo APIs simuladas ni interceptacion de solicitudes.

Los JSON de ejecucion y capturas son artefactos locales en `docs/qa/evidence/gastos-entry-ux-20261020/`; no se incorporan logs, datos de entorno ni credenciales al commit. Este documento es una revision humana de resultados reales, no una certificacion de QA remoto.

## Promocion autorizada

El usuario autorizo desplegar en QA y crear `codex/qa-gastos-ux-20261020` para promocion puntual desde `desarrollo` hacia `develop`, conservando el destino actual. La autorizacion no incluye `main`, nuevas migraciones remotas, secretos ni infraestructura. Antes de publicar se deben aprobar pre-QA, inventario v2 contra el destino actualizado y la certificacion sobre la integracion actual; sus manifiestos conservan el estado de QA funcional pendiente.
