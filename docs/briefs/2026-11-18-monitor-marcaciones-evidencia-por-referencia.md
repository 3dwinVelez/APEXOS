# Brief — Corrección de raíz del monitor de marcaciones: la evidencia viaja por referencia

- **ID**: `2026-11-18-monitor-marcaciones-evidencia-por-referencia`
- **Fecha**: `2026-11-18`
- **Rama activa**: `desarrollo`
- **Origen**: auditoría de solo lectura `docs/audits/2026-11-18-monitor-marcaciones-336/00-hallazgos-y-plan.md` (hallazgos MAR-101 a MAR-110, medición en producción contra el horario 336).
- **Prompt crudo**: «lo que necesito es llevar esta corrección hasta main pasando por los demás ambientes, monta el plan de intervención y comenzamos».

## 0. Naturaleza del corte y estado de la cuenta

Corte de **contrato de transporte de evidencia** en `apps/api/src/modules/hr/**` más su documentación y agentes. No es una promoción: este brief escribe el plan de las promociones y ejecuta únicamente la parte que vive en `desarrollo`.

Estado verificado a las 21:27 del 2026-11-18:

| Cosa | Medición |
|---|---|
| `HEAD` == `origin/desarrollo` | `4f5a6e4b` (fetch del preflight, sin `INTEGRAR_REMOTO` ni `CONFLICTO`) |
| Trabajo ajeno **sin commitear y activo** | 11 archivos de `apps/web/**` modificados, el último a las 21:26 (intervención de cargas de pantalla: respaldo de sondeo 5 s → 30 s en `rutas/page.tsx` y `mapa/page.tsx`, y `hr-monitor-refresh.test.mjs` adaptado) |
| Consecuencia para este corte | **Ninguna ruta de `apps/web/**` entra en este commit.** Se trabaja solo sobre `apps/api/**` y `scripts/**`, que están limpios. El frente de pantalla se despacha después, sobre el tip que incluya el commit ajeno. |
| Artefactos ajenos sin seguimiento en mis rutas previstas | `scripts/certifications/performance-budget-guard-local.cjs`, `scripts/certifications/screen-loading-real-local.cjs`, `scripts/hr-purge-rescued-base64.js`, `scripts/performance/timepunch-evidence-size-probe.js`, `scripts/align-databases.js`, `scripts/audit-*`, `tmp-*-probe.js|json|err` en la raíz. Se declaran fuera de alcance por ruta exacta (regla 18 de `apexos-brief`): no entran en `expected_changes` ni en `agents:coverage`. |

## 1. Objetivo

Que el monitor de marcaciones deje de mover megabytes para decir cuántas marcaciones hay, y que el usuario nunca vuelva a ver «sin marcaciones» donde el sistema quiere decir «todavía no sé».

Medido en producción el 2026-11-18 sobre la empresa del horario 336 (tenant `67a5dcb8-…`, una sola persona, cuatro marcaciones y una actividad): `GET /hr/operations-map` mueve alrededor de **36 MB** por llamada —20,3 MB de `TimePunch.metadata` en crudo del día y 16,1 MB de `GpsPing.metadata` leído sin ninguna proyección—, el cliente la repite cada 5 s mientras un horario está abierto, y la misma jornada sin los blobs pesa **15 KB**. El dato siempre estuvo bien; lo que falla es el transporte, y la consecuencia es que lentitud y «no hay datos» se ven idénticos en pantalla.

> Re-medido al cerrar el paquete 1 (2026-11-19, 300 filas por lectura, mismo tenant y mismo día): **44,4 MB** crudos —22,75 MB de `TimePunch.metadata` en 53 filas y 21,63 MB de `GpsPing.metadata` en 239— contra **154 KB** con la proyección (50,7 KB + 103,6 KB), con los mismos ids y las mismas evidencias contadas a los dos lados. La estimación de 36 MB se queda arriba como el número con el que se abrió el incidente; el de cierre es la tabla «Medición de cierre del paquete 1».

## 2. Alcance exacto de este corte (paquete 1, en `desarrollo`)

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/modules/hr/monitorEvidenceRows.js` | Nueva guarda `evidenceFreeMetadata` (`pg_column_size(metadata) > 8192` → proyectar `identity_photo`, si no, no detoastear) aplicada a las **cuatro** lecturas de `TimePunch`, y lectura nueva `readDayGpsPings` con `GPS_COLUMNS` y la misma guarda para `GpsPing.metadata`. Se reescriben los comentarios que afirman «`metadata` mide 532/575 B de media»: medido en producción es 414 KB de media y 2,6 MB el peor caso. |
| `M` | `apps/api/src/modules/hr/service.js` | (a) `routeEventMetadata` se vuelve el único contrato de difusión: por default **no** propaga `identity_photo`, `extra_evidence` ni `photo`; la escritura de `TimePunch` se declara dueña con `{ owner: true }` (único sitio con esa bandera). Esto cierra a la vez el ping de marcación (`:3072`), el ping de actividad (`:2707`), la sesión y `createGpsPing` (`:3313`), que era el agujero descrito en MAR-104. (b) `getOperationsMap` lee el día y la huella extendida con `monitorEvidenceRows.readDayGpsPings`; ya no hay `prisma.gpsPing.findMany` en el mapa. |
| `A` | `apps/api/test/hr-gps-metadata-projection.test.js` | Seis contratos: `GPS_COLUMNS` contra `schema.prisma`, forma del SQL (tenant escrito, guarda por tamaño, `identity_photo` proyectado, orden y valores vinculados), dos lecturas del mapa y ninguna `findMany`, comportamiento de `createGpsPing` con selfie en el input (no la guarda, pero conserva `route_code`, `gps_required`, `employee_code` y `identity_aliases`), la bandera `owner: true` exactamente una vez, y el umbral contra la media medida (4.761 B). |
| `M` | `apps/api/test/hr-monitor-evidence-columns.test.js` | La aserción que fijaba el defecto (`"TimePunch"."metadata"::text` sin proyección) se reemplaza por el contrato nuevo: `extra_evidence` sigue sin abrirse (una sola referencia, solo `pg_column_size`) y `metadata` solo se abre en la fila gorda. Criterio 12 de `apexos-brief`: se corrige el candado viejo en el mismo corte. |
| `A` | `docs/audits/2026-11-18-monitor-marcaciones-336/00-hallazgos-y-plan.md` | La auditoría es de esta intervención y todavía no estaba en git, así que entra como `A`, no como `M`. Se le añade §7 «Cierre medido del paquete 1»: estado por hallazgo (MAR-101/102/104/106/108 cerrados con la medición de producción; MAR-103, MAR-107 y MAR-109 declarados abiertos con su paquete), la corrección de MAR-105 (44→45 filas, 27,8→29,3 MB) y el descarte de dos premisas: `gpsIngest.js` **nunca existió ni lo nombraba MAR-109** —era un error de este brief, que citaba además `createGpsPing:3289` y `:2692`, hoy `:3313` y `:2707`— y el `storage_path` fantasma de `ActivityEvidence`, que resultó ser la copia que el rescate no borró (106/106 con objeto real del mismo tamaño). |
| `A` | `docs/audits/2026-11-18-monitor-marcaciones-336/evidencia/medicion-production.json`, `medicion-db2-production.json`, `medicion-db3-production.json` | Evidencia anonimizada de la medición (47 KB, sin datos personales ni credenciales). |
| `A` | `docs/qa/evidence/hr-monitor-evidence-by-reference-20261118/` (8 archivos) | `api-suite.txt`, `projection-sql.txt`, `produccion-antes-despues-dia.json`, `produccion-evidencia-actividad.json`, `produccion-purga-preparada.json`, `script-antes-despues.txt`, `script-purga-preparada.txt`, `activity-evidence-rescue-check.script.txt`. Se añade `agents-gates.txt` al cerrar el frente de agentes. |
| `A` | `docs/briefs/2026-11-18-monitor-marcaciones-evidencia-por-referencia.md` | Este documento. |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` (regla 33, `2.16.0→2.17.0`), `apexos-seguridad` (regla 43, `2.28.0→2.29.0`), `apexos-qa` (regla 83, `2.70.0→2.71.0`), `equipo-apexos` (regla 56, `2.42.1→2.43.0`), `apexos-brief` (regla 72, `2.58.0→2.59.0`), `apexos-git-guardian` (regla 36, `2.19.2→2.20.0`) y sus espejos `agents/**` | Los seis controles del corte, uno por dueño que el preflight rutearon las rutas tocadas: propiedad del binario y guarda compartida; `storage_path` declarado no prueba objeto y `$queryRaw` escribe el tenant; certificación por paridad y no por rapidez; la recaída por lectura exige contrato y la cita ajena se re-grepea; `A`/`M` lo decide `git status`; y el `git add` con rutas exactas conviviendo con 25 carpetas `??` de otras sesiones. |
| `M` | `agents/registry.json` | Versiones, `updated_at`, `sha256` y los controles nuevos. |
| `M` | `agents/CHANGELOG.md` | Entrada `2026-11-18` del paquete 1, con la colisión de frentes declarada. |

### Decisión de diseño tomada al ejecutar el paquete 1

El plan inicial proponía `prepareGpsPingEvidence` (subir la selfie del ping a Storage antes de escribir) y una rama `gps_ping` en `resolveReference`. Al medir, ese trabajo queda **fuera**: la medición clave por clave del 2026-11-18 dejó ver que `GpsPing.metadata.identity_photo` no es una evidencia con dueño propio, sino la **copia** del mismo binario que `TimePunch` ya guardó en el mismo envío (28,5 MB en 44 filas duplicando los 29,7 MB de la marcación, con el mismo `sha256` por construcción). Subir esa copia a Storage crearía un segundo objeto idéntico que ninguna pantalla pide: `getMonitorEvidence` y `mobile-identity` resuelven la selfie por el id de la marcación. El contrato correcto es de **propiedad**, no de almacenamiento: una fila dueña del binario (`TimePunch`, declarada con `owner: true`) y las derivadas sin sustento. Se documenta aquí porque cambia dos criterios de aceptación y el paquete 5.

Medición de cierre del paquete 1 (producción, solo lectura, día 2026-11-18, 300 filas por lectura, mismo conjunto de `id` a los dos lados):

| Lectura | Antes | Después | Paridad |
|---|---|---|---|
| `TimePunch` del día | 22.752.445 B, 7.743 ms | 50.735 B, 941 ms | 53 ids iguales, 27 evidencias desde `metadata` en ambos lados, 0 filas con binario largo |
| `GpsPing` del día | 21.629.022 B, 9.790 ms | 103.640 B, 1.055 ms | 239 ids iguales, 25 evidencias en ambos lados, 0 filas con binario largo |
| Día del monitor (dos lecturas) | ~44,4 MB y ~17,5 s | ~154 KB y ~2,0 s | el viaje repetido cada 5 s por cliente |

Y una verificación que cambia el riesgo de la purga: `ActivityEvidence` del tenant tiene 106 filas, las 106 con `base64_data` en claro (72.968.693 B), las 106 con `storage_path` **y** las 106 con la bandera `hr_evidence_rescue`; muestreadas las tres más pesadas, el objeto descargado pesa exactamente los mismos 2.494.899 B que la columna. Es decir, ese bloque ya está rescatado y es purgable sin destruir nada, mientras que la copia de `GpsPing` no está rescatada en Storage y solo es segura de retirar contra el `sha256` de la marcación emparejada.

### Módulos (`change_intent.modules`)

- `hr-marcaciones`
- `hr-evidencia-storage`
- `gobernanza-agentes`

### Borrados autorizados (`allowed_deletions`)

Ninguno.

## 3. Fuera de alcance (con su motivo)

- **`apps/web/**` en este commit.** Hay una intervención activa, sin commitear, sobre `rutas/page.tsx`, `mapa/page.tsx`, `lib/api.ts` y `hr-monitor-refresh.test.mjs`. Tocar las mismas rutas ahora mezclaría dos alcances en un diff y obligaría a commitear trabajo ajeno. El paquete 3 (contrato de estados en pantalla) se despacha sobre el tip que ya incluya su commit.
- **`scripts/certifications/performance-budget-guard-local.cjs`.** Ruta sin seguimiento de otro frente. El presupuesto de bytes del monitor entra en una gate nueva y propia (`hr-monitor-payload-budget-local.js`), no editando el arnés ajeno.
- **La purga del base64, el `VACUUM FULL`, el índice `(tenant_id, route_id)` y el rescate de `GpsPing` en la nube.** Son escrituras en ambientes compartidos: cada una es autorización independiente y va en los paquetes 5 a 7.
- **Alinear los grants de `service_role` entre QA y producción (MAR-107).** Es un `GRANT`/`REVOKE` en la base de producción, no un cambio de código.
- **Retocar el resto del módulo HR, los pendientes de Transporte o el portafolio.** Otros dueños.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre. Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Este paquete **no cambia el comportamiento con el almacén apagado** —es decir, no cambia lo que corren hoy QA y producción— salvo por la proyección de lectura, que solo quita bytes que nadie consume. Su riesgo de regresión es el de una columna que se deja de pedir, y lo cubren las pruebas del dominio.
- `routeEventMetadata` deja de difundir `identity_photo`: es un cambio de contrato de escritura. Se afirma por prueba, no por revisión, y el handoff a `apexos-frontend` declara que ningún cliente debe depender de recibir la selfie dentro del metadata de un ping.
- Sin secretos ni datos personales en el brief ni en la evidencia. Guards de project ref en todo guion que toque la nube (`jbirkghkekuifgfsgquq` QA, `jzbwzmkidfthknsohhnr` PROD); la service role nunca se imprime.
- Aislamiento multi-tenant intacto: toda lectura cruda conserva su `tenant_id` escrito, y toda resolución de referencia valida el `tenant_id` de la fila antes de tocar Storage.
- Comentarios de código sin tildes; prosa visible y documentación en español correcto.

## 5. Criterios de aceptación

**Paquete 1 — contrato de bytes (este corte, `desarrollo`):**

1. `cd apps/api && node --test test/hr-gps-metadata-projection.test.js` → verde. El SQL emitido por las **cinco** lecturas crudas (`readDayEvidencePunches`, `readDayGpsPings`, `readRouteEvidence`, `readRoutePunchEvidence`, `readUnlinkedEvidence`) proyecta `identity_photo` bajo la guarda `pg_column_size(metadata) > umbral`, conserva su `tenant_id` escrito y no vuelve a emitir `"metadata"::text` sin `jsonb_set`. **Medido: 6/6 en verde; `projection-sql.txt` muestra los cinco flag checks en `true` y `metadata cruda sin guarda: false`.**
2. `cd apps/api && node --test test/hr-gps-metadata-projection.test.js` (casos de escritura) → `createGpsPing` recibido un `metadata.identity_photo` con 4 KB de base64 no lo persiste, y `routeEventMetadata` conserva el binario **solo** en la escritura de `TimePunch` (`{ owner: true }`, exactamente una vez en el servicio). El caso de subida fallida → 503 con cero `gpsPing.create` se retira de este paquete: con el contrato de propiedad el ping nunca tiene sustento que subir (ver la decisión de arriba); el 503 de la marcación sigue fijado por `test/hr-evidence-storage-gate.test.js`. **Medido: verde.**
3. `cd apps/api && node --test test/hr-*.test.js` → 0 fallos. **Medido: 262/262.** La línea base se registró por conteo de pruebas del único archivo reescrito (7 en `HEAD` y 7 en el árbol de trabajo, mismo denominator): 256 antes y 256 + 6 nuevas = 262. Ninguna roja heredada se borró.
4. `cd apps/api && node --test test/hr-monitor-evidence-columns.test.js test/hr-punch-mobile-evidence.test.js test/hr-evidence-storage-gate.test.js` → verde (las tres fijan contratos previos que este corte no puede romper: el lote sin binarios y la subida antes de la transacción). **Medido: 25/25 en la corrida combinada con `hr-operations-map-contract` y `hr-list-truncation`.**
4b. Paridad medida contra producción en solo lectura: el índice de evidencia (`punchPhotoItems` sobre `metadata`) y el conjunto de `id` leídos coinciden antes y después en las dos tablas, y ninguna fila proyectada conserva una cadena base64 de más de 256 caracteres. **Medido: 27 = 27 y 25 = 25, `ids_iguales: true`, `filas_con_binario_largo: 0` (`produccion-antes-despues-dia.json`).**
5. `npm run agents:sync && npm run agents:check && npm run test:agents && npm run agents:preflight && npm run agents:coverage -- --paths "<inventario de la sección 2>"` → los cinco en verde.

**Paquetes siguientes (cada uno con su propia puerta, no se certifican por anticipado):**

6. Paquete 2 — presupuesto medible: gate versionada que afirma que la respuesta de `operations-map` de un día real del tenant del cliente pesa menos de 200 KB y que ninguna lectura cruda devuelve `;base64,`; la gate se demuestra **pudiendo fallar** (rojo provocado con la proyección desactivada).
7. Paquete 3 — contrato de estados (`apps/web/**`): `punch_count`/`event_count` pasan a `null` cuando la fuente todavía no respondió, `0` solo cuando la fuente afirmó cero; `catch` silencioso eliminado en `loadMonitor`/`loadEventSummaries`; la pantalla distingue *cargando*, *sin datos* y *no pude leer* en el DOM. Aceptación por navegador: abrir el horario del cliente y certificar los tres estados, no solo el camino feliz.
8. Paquete 4 — migración `CHECK` sobre `metadata` (ni `TimePunch` ni `GpsPing` admiten un `base64_data`/`base64` no vacío) declarada `NOT VALID` en el despliegue; alinear `GpsPing` (`tenant_id` por deflector y el índice de su lectura del día) en migración separada; la `VALIDATE` solo después de las purgas del paquete 5, porque hoy 46 filas de `TimePunch` y 44 de `GpsPing` la violarían.
9. Paquete 5 — purga con verificación por contenido, en dos frentes que ya no son el mismo trabajo:
   - `ActivityEvidence`: sus 106 filas están rescatadas (bandera `hr_evidence_rescue`, `storage_path` y objeto descargado del mismo tamaño que la columna, medido el 2026-11-19). Se vacía `base64_data` conservando la referencia; recupera ~73 MB.
   - `GpsPing`: la copia **no** está en Storage. Solo se retira `identity_photo` de las filas cuyo `sha256` del binario coincida con el de la marcación emparejada (o con un objeto ya rescatado); la que no coincida se rescata primero con el mismo procedimiento de C.1 y su evidencia de corrida. Nunca se purga por «existe `storage_path`»: la columna `declaredEvidencePath` se escribía aunque el almacén estuviera apagado.
10. Paquete 6 — despliegue del lector y del contrato de bytes en QA y producción, certificación E2E con la empresa del cliente, y solo después C.2 (purgas) + `VACUUM` + `VALIDATE CONSTRAINT` + índice. La puerta de la purga se midió el 2026-11-19 sobre **todo el ambiente de producción** (`produccion-purga-preparada.json`), no sobre el tenant del cliente:

    | Dónde vive el binario | Filas con base64 | MB en claro | MB purgables hoy (rescatados) | MB que aún necesitan rescate |
    |---|---|---|---|---|
    | `TimePunch.extra_evidence` | 278 | 242,1 | 235,9 (270 filas) | 6,3 |
    | `TimePunch.metadata.identity_photo` | 47 | 30,4 | 21,9 (38 filas) | 8,6 |
    | `ActivityEvidence.base64_data` | 136 | 72,5 | 72,5 (124 filas) | 0 |
    | `GpsPing.metadata.identity_photo` | 45 | 29,3 | 0 — sin bandera: la copia no está en Storage | ver paquete 5 |

    Lo que dominan los tamaños es `TimePunch.extra_evidence`, no la metadata: 242 MB de los ~374 MB de binario en claro. Con el lector desplegado, C.2 recupera **330,3 MB** sin tocar una sola fila pendiente de rescate, y el `VACUUM` se mide por `pg_total_relation_size` antes y después (hoy: `TimePunch` 299,6 MB con 296,4 de TOAST, `ActivityEvidence` 75,5, `GpsPing` 38,0).
11. Paquete 7 — paridad: `evidenceStorage.js` hoy **no existe** en `main` ni en `develop` (ver §9), y `service.js`/`punchEvidence.js`/`mobile-identity.js` difieren. Se certifica por hash de blob contra el destino, no por rama.

## 6. Evidencia y certificación exigida

- `docs/qa/evidence/hr-monitor-evidence-by-reference-20261118/` con `api-suite.txt` (salida de la suite del dominio), `projection-sql.txt` (el SQL de las cinco lecturas crudas con sus banderas), `agents-gates.txt` (sync/check/test/preflight/coverage), `produccion-antes-despues-dia.json` (medición de solo lectura antes/después con su paridad) y `produccion-evidencia-actividad.json` + `activity-evidence-rescue-check.script.txt` (verificación de que las 106 filas de `ActivityEvidence` ya están rescatadas y su objeto pesa lo mismo que la columna).
- `certification_status` esperado del paquete 1: **`local_passed_qa_pending`**. La certificación de navegador, la medición contra el build desplegado y la paridad de ramas pertenecen a los paquetes 3, 6 y 7; ninguna de ellas se da por cerrada con este commit.
- Ninguna promoción se afirma con unit tests, typecheck o build: `desarrollo → develop` exige `npm run qa:preqa:evidence -- <manifiesto>` y `develop → main` exige `npm run qa:approval:evidence -- <manifiesto>` con aprobación funcional explícita y firma de responsable.

## 7. Capacidades protegidas

- `lote-monitor-sin-binarios` — el lote del monitor sigue anunciando sin arrastrar bytes (`hr-punch-mobile-evidence.test.js`).
- `marcacion-nunca-inline-sin-almacen` — subida fallida ⇒ 503 y la marcación no se crea; este corte extiende la misma afirmación al ping de GPS.
- `evidencia-marcacion-tenant` — 404 entre tenants sin leer Storage y 404 limpio cuando el objeto ya no existe (`hr-evidence-storage-gate.test.js`).
- `lectura-historica-sin-despliegue-nuevo` — la resolución de referencias de `TimePunch` no cambia de conducta en este corte: las 124 filas rescatadas en producción y las 66 de QA siguen visibles.
- `kilometraje-de-marcacion` y `jornada-procesada-sin-marcaciones` — el corte no toca cálculos; la suite del dominio es la no-regresión.
- `aislamiento-tenant-en-lecturas-crudas` — ninguna proyección puede relajar el `tenant_id` escrito en el SQL.

## 8. Plan de promoción por paquetes y autorizaciones

Cada fila es un acto con su propia puerta. Ninguna está otorgada; la orden genérica de «llevar hasta main» autoriza a **preparar**, no a promover.

| # | Paquete | Rama/ambiente | Compuerta | Autorización que falta |
|---|---|---|---|---|
| 1 | Contrato de bytes (API) | `desarrollo` | suites + gates de agentes | ninguna (push acotado permanente) |
| 2 | Gate de presupuesto | `desarrollo` | gate con rojo provocado | ninguna |
| 3 | Contrato de estados (web) | `desarrollo` | certificación de navegador | esperar el commit del frente de cargas; luego ninguna |
| 4 | Migración `CHECK NOT VALID` + `GpsPing` alineado | `desarrollo` (versionada) + base local | `prisma validate`, cadena dos veces | aplicar en QA y PROD es acto aparte |
| 5 | Rescate C.1 de `GpsPing` | QA y PROD (escritura en Storage + banderas) | SHA-256 por objeto + evidencia | **escritura en la nube** |
| 6 | Despliegue del lector + certificación E2E | QA primero, PROD después | `/health` con el commit, medición real | **despliegue** |
| 7 | Purga C.2 + `VACUUM FULL` + `VALIDATE` + índice `(tenant_id, route_id)` | QA y PROD | depende de 6; `allowed_deletions` exacto | **borrado de datos productivos** |
| P-A | `desarrollo → develop` | `develop` | manifiesto v2 + `qa:preqa:evidence` + `ci-promotion` en rama `codex/qa-*` | **promoción** |
| P-B | `develop → main` | `main` | manifiesto v2 + `qa:approval:evidence` + `qa:promotion:scope` + approval policy | **promoción a producción** |

Orden impuesto por dependencia, no por conveniencia: 6 antes que 7 (purgar sin lector deja al cliente sin su historial y no hay `VACUUM` que lo recupere) y 5 antes que 7 (el rescate nunca recorrió `GpsPing`). El paquete 4 entra antes que 5-7 porque `NOT VALID` es inerte y deja la barrera escrita; la `VALIDATE` es la que espera.

## 9. Paridad de ramas medida (2026-11-18, por hash de blob)

| Archivo | `desarrollo` | `develop` | `main` |
|---|---|---|---|
| `apps/api/src/modules/hr/evidenceStorage.js` | existe | **no existe** | **no existe** |
| `apps/api/src/modules/hr/service.js` | `4f5a6e4b` | distinto de `desarrollo` | igual a `develop` |
| `apps/api/src/modules/hr/punchEvidence.js` | con items solo-referencia | sin items solo-referencia | igual a `develop` |
| `apps/api/src/modules/hr/mobile-identity.js` | `available` acepta referencia | sin ese contrato | igual a `develop` |
| `apps/api/src/modules/hr/monitorEvidenceRows.js` | `86af38acb019` | `86af38acb019` | `86af38acb019` |

Consecuencia que gobierna el plan: **los ambientes liberados no pueden purgar ni projectar lo que no tienen**. Promover el paquete 1 sin el paquete Fase D completo (`2f8907af`) a `develop`/`main` dejaría a QA y producción con el lector ausente y el rescate ya marcado. Por eso P-A se pide como un solo paquete (Fase D + este corte), no como dos.

## 10. Autorizaciones requeridas

- [x] «monta el plan de intervención y comenzamos» — cubre el paquete 1 (y el 2) en `desarrollo`, con su push acotado.
- [ ] Paquete 3 (web) — se ejecuta sobre el tip que incluya el commit del frente de cargas de pantalla; no se le escribe encima.
- [ ] Paquete 4 en la nube — aplicar migraciones en QA y producción.
- [ ] Paquete 5 — rescate de `GpsPing` en QA y producción (subidas a Storage + banderas).
- [ ] Paquete 6 — despliegue del lector en QA y producción.
- [ ] Paquete 7 — purga C.2, `VACUUM FULL`, `VALIDATE CONSTRAINT`, índice nuevo.
- [ ] P-A promoción a `develop` (con la ventana de su despliegue).
- [ ] P-B promoción a `main` (con su aprobación funcional firmada).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight**: `npm run agents:preflight -- --paths "<inventario exacto de la sección 2>"` (regla 53 de `equipo-apexos`: con archivos exactos, no con directorios). Veredicto del ruteo amplio ya obtenido el 2026-11-18: `OK_CON_ADVERTENCIAS`, sin `INTEGRAR_REMOTO` ni `CONFLICTO`, contra `origin/desarrollo @ 4f5a6e4b`.
- **Agentes a actualizar en este corte**:
  - `apexos-backend` — control nuevo: *toda lectura cruda del monitor proyecta la rama de evidencia, incluida `metadata.identity_photo`, y todo escritor de GPS pasa por la barrera; la premise «`metadata` es barata» se mide, no se hereda*.
  - `apexos-seguridad` — control nuevo: *una proyección que recorta bytes no puede recortar el filtro de `tenant_id`, y el contrato de escritura de GPS deja de difundir identidad biométrica por propagación*.
  - `apexos-qa` — control nuevo: *un contrato de transporte se certifica por el peso de la respuesta y por SQL emitido, no por el tiempo de la pantalla*.
  - `equipo-apexos` — control nuevo: *dos frentes activos sobre el mismo checkout se despachan por separado y el commit se arma con inventario propio*.
  - `apexos-brief` — regula la sección 0 (estado de la cuenta del índice compartido); sin corte propio no se bumperea.
- **Colisión declarada** (regla 53c): si el frente de cargas de pantalla publica bumpes de `apexos-frontend`, `apexos-qa` o `apexos-performance` por encima del baseline publicado, **no se le escriben encima ni se le adoptan sus números**; la colisión queda nombrada en `agents/CHANGELOG.md` para que quien publique después re-versione sobre esta entrada.
- **Registro**: `agents/registry.json` regenerado por `agents:sync`; entrada `2026-11-18` en `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `test:agents` → `agents:preflight` → `agents:coverage` → suites de la sección 5 → commit con inventario explícito de rutas (nunca el índice ajeno) → `git push origin desarrollo`.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO` sobre el inventario exacto
- [ ] Cobertura de contexto en verde (`agents:coverage`) con las rutas de la sección 2
- [ ] Suites del dominio y gates en verde, con su salida versionada
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
- [ ] `git push origin desarrollo` (no cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura)
