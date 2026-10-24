# Saldos iniciales: validación de estructura y resolución por lotes

Estado: implementación y certificación local aprobadas. Publicación y validación funcional en QA pendientes. No declara resuelto el incidente en QA.

## Incidente observado

El usuario reportó «La plataforma no respondio a tiempo. Reintenta en unos segundos.» al cargar un Excel histórico. El cliente web tiene un tiempo máximo predeterminado de 20 segundos. La preparación del archivo consultaba cada cuenta y tercero secuencialmente, repitiendo consultas incluso cuando el código aparecía en varias filas.

Se probó la acción **Validar plantilla** en QA sobre `0d3dd725`, con la sesión autorizada de Cliente Piloto QA y el archivo original sin modificar. En ese intento no se repitió el timeout: la respuesta visible fue un 404 controlado, `Fila 5: cuenta 41450501 inexistente, inactiva o no transaccional`. No se confirmó contabilización ni se alteraron maestros en QA. La captura generada está en `docs/qa/evidence/opening-balances-timeout-20261023/qa-original-validation.jpg` y no se incluye en el commit.

El archivo tiene 142 filas de datos y 18 códigos de cuenta distintos. Contiene 16 filas con un corte y 126 con otro. La suma global es cero, pero cada corte por separado está desbalanceado. El contrato vigente exige una sola fecha de corte y un asiento balanceado; por tanto no se puede dividir ni unificar fechas automáticamente. No se incluyen importes ni registros del archivo del usuario en esta documentación versionada. El archivo original no se modifica, copia ni versiona.

## Cambio acotado

- Validar fechas, importes y campos obligatorios antes de consultar maestros; un archivo con dos cortes debe devolver `OPENING_BALANCE_SINGLE_DATE` sin recorrer consultas por fila.
- Validar sucursal, centro y sociedad con el árbol de la empresa en memoria.
- Resolver las cuentas del archivo con una consulta agrupada, manteniendo coincidencia exacta antes de insensible a mayúsculas, ambigüedad con número de fila, cuenta activa y transaccional y código canónico persistido.
- Resolver terceros por conjuntos, manteniendo NIT activo antes de identificador interno legacy, límites int32, tercero opcional y bloqueo de fallback cuando existe un NIT numérico inactivo.
- Mantener mapas por operación, sin cachés compartidas entre empresas. Conservar duplicado por hash, bloqueo asesor, fecha UTC, balance, numeración y atomicidad del documento.

No se amplía el timeout global, no se modifica el Excel del usuario y no se crean cuentas contables automáticamente. No requiere migraciones, cambios de configuración ni infraestructura. Los cambios locales anteriores de Gastos, PUC y workflow se preservan.

## Validación ejecutada

- **77 pruebas de regresión aprobadas**, cero fallos: saldos iniciales API, PYG API, árbol contable API y página web de saldos iniciales. `node --check` del servicio y del nuevo certificador aprobado. No hay cambios de frontend que requieran una nueva compilación.
- Certificación existente `scripts/certifications/opening-balances-nit-browser-local.js`: **80 comprobaciones aprobadas**, cero fallos. API, PostgreSQL y Chrome reales en loopback; contempla tercero opcional, NIT exacto y legacy, errores sin 500, ambigüedad, códigos canónicos sin distinguir mayúsculas, relaciones exactas de sucursal-centro, UTC, balance y duplicados. Evidencia generada: `docs/qa/evidence/opening-balances-timeout-20261023/regression-browser.json`, finalizada `2026-10-24T02:50:12.609Z`.
- Nuevo certificador versionado `scripts/certifications/opening-balances-volume-local.js`: **40 comprobaciones aprobadas**, cero fallos. Registra empresas de prueba aisladas en la API local, prepara 18 cuentas y nueve centros, genera un archivo sintético con **142 tuplas distintas** y tercero por NIT en todas las filas. No reduce el ensayo a un documento pequeño por agrupación.
- Validación HTTP del lote: **108,33 ms**. Confirmación HTTP: **1.414,45 ms**, documento de 142 líneas, 142 entradas enlazadas en el mayor y balance comprobado. Reintento del mismo archivo devuelve 409 sin crear más documentos. La preparación instrumentada sobre PostgreSQL real usa **3 consultas**, con **82,56 ms** acumulados de base de datos. Son mediciones locales, no una garantía de latencia remota.
- El navegador carga el adjunto original y muestra el error controlado de una sola fecha, sin contabilizarlo. El SHA256 del archivo original permanece idéntico. Después carga un segundo archivo sintético de 142 líneas, valida y confirma mediante el diálogo real: HTTP 201, banner de éxito y documento persistido de 142 líneas. El tenant de prueba termina con dos documentos y 284 entradas en el mayor; no se crean documentos en QA.
- La cuenta que existe únicamente en otra empresa se rechaza desde la empresa principal. El NIT numérico tiene prioridad sobre el identificador interno coincidente, y la línea de crédito sin tercero permanece opcional.
- Evidencia de volumen generada: `docs/qa/evidence/opening-balances-timeout-20261023/volume-local.json`. Incluye hashes de servicio, prueba API y ambos certificadores. Capturas `opening-volume-error.png`, `opening-volume-desktop.png` y `opening-volume-posted.png`, revisada visualmente la de confirmación. Evidencia y fixtures generados quedan excluidos de commits.

Las escrituras de contabilización conservan su implementación transaccional, sin cambios de timeout ni optimización bulk adicional: el ensayo real de 142 líneas terminó dentro del presupuesto local. La medición y aceptación funcional de rendimiento en QA siguen pendientes de un despliegue autorizado y de maestros válidos. El archivo original requiere resolver sus cortes distintos y la cuenta rechazada; no se altera automáticamente.

## Publicación

Trabajo únicamente en `desarrollo`, sobre el commit de QA `0d3dd7256f42d94c80d085a650307b6c03a64477`. Sin push, PR ni despliegue de esta corrección. Una publicación posterior exige certificación integral aprobada, autorización independiente y manifiestos pre-QA y de alcance exacto contra el destino vigente, siguiendo `desarrollo → develop → main`.
