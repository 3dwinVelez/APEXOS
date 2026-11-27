# Evidencia QA — promoción develop→main, módulo Talento Humano (nómina y horarios)

- Candidato: `3543b3252aa5cc59348f5584e10bc0e98ab88f3a` (worktree `.tmp/wt-hr-main-20261126`, detached sobre `origin/main` = `0ec1cff04c1b48a8a7d76b1219223efc76689164`)
- Fecha de ejecución: 2026-11-26
- Arnés: `node --test <archivo>` por archivo, Node v22.23.1. El worktree no tiene `node_modules` propio; la resolución sube hasta el `node_modules` raíz del repositorio (`C:/Users/mq1/Documents/Proyectos/APEXOS/node_modules`). No se copió ni enlazó nada.
- Logs crudos de cada corrida: `C:/Users/mq1/Documents/Proyectos/APEXOS/.tmp/qa-hr-logs/` (API: `<nombre>.log`, web: `web-<nombre>.log`).
- Transporte deliberado SIN frente biométrico: `service.js`, `routes.js`, `schema.js` y `reportes/page.tsx` son fusión (blob de develop menos bloques biométricos); los archivos biométricos no existen en el candidato a propósito. Inventario de 40 rutas: `.tmp/hr-candidate-inventory.txt`.

## Totales

| Lado | Archivos | Tests | Pass | Fail |
|---|---|---|---|---|
| API (`apps/api/test/hr-*.test.js`) | 52 | 337 | 334 | 3 |
| Web (8 `.mjs` del inventario) | 8 | 47 | 46 | 1 |
| **Total** | **60** | **384** | **380** | **4** |

Los 4 rojos corresponden a 2 archivos y ninguno es falla nueva del candidato (ver clasificaciones).

## API — tabla por archivo

| Archivo | Tests | Pass | Fail |
|---|---|---|---|
| hr-accumulated-ordinary-time.test.js | 4 | 4 | 0 |
| hr-adjustment-calendar-concept.test.js | 5 | 5 | 0 |
| hr-administrative-punch-correction.test.js | 6 | 6 | 0 |
| hr-banks.test.js | 2 | 2 | 0 |
| hr-contract-calendar-date.test.js | 3 | 3 | 0 |
| hr-date-assignments.test.js | 2 | 2 | 0 |
| hr-davivienda-bank-file.test.js | 7 | 7 | 0 |
| hr-day-review.test.js | 5 | 5 | 0 |
| hr-deferred-marking-offline.test.js | 9 | 9 | 0 |
| hr-employee-organization.test.js | 7 | 7 | 0 |
| hr-employee-user-link.test.js | 8 | 8 | 0 |
| **hr-evidence-backfill-tool.test.js** | **7** | **4** | **3** |
| hr-evidence-resilience.test.js | 20 | 20 | 0 |
| hr-evidence-storage-gate.test.js | 7 | 7 | 0 |
| hr-gps-metadata-projection.test.js | 6 | 6 | 0 |
| hr-ibc-caps-floors.test.js | 7 | 7 | 0 |
| hr-labor-rates-vigencia.test.js | 4 | 4 | 0 |
| hr-list-truncation.test.js | 9 | 9 | 0 |
| hr-marking-concurrency-certificate.test.js | 3 | 3 | 0 |
| hr-marking-concurrency.test.js | 9 | 9 | 0 |
| hr-marking-declared-employee.test.js | 7 | 7 | 0 |
| hr-marking-kilometraje-conflict.test.js | 4 | 4 | 0 |
| hr-marking-only-rbac.test.js | 4 | 4 | 0 |
| hr-mobile-identity.test.js | 40 | 40 | 0 |
| hr-monitor-evidence-columns.test.js | 16 | 16 | 0 |
| hr-monitor-evidence-demand.test.js | 6 | 6 | 0 |
| hr-monitor-silent-failures.test.js | 7 | 7 | 0 |
| hr-nomina-legal-2026.test.js | 9 | 9 | 0 |
| hr-operations-map-contract.test.js | 3 | 3 | 0 |
| hr-payroll-adjustment-lock.test.js | 3 | 3 | 0 |
| hr-payroll-adjustment-permission.test.js | 3 | 3 | 0 |
| hr-payroll-close-provisions.test.js | 2 | 2 | 0 |
| hr-payroll-period.test.js | 13 | 13 | 0 |
| hr-payroll-receipt-pdf.test.js | 4 | 4 | 0 |
| hr-payroll-social-contributions-bulk.test.js | 7 | 7 | 0 |
| hr-payroll-workdays.test.js | 7 | 7 | 0 |
| hr-punch-mobile-evidence.test.js | 5 | 5 | 0 |
| hr-reports-range.test.js | 2 | 2 | 0 |
| hr-route-assignment-lock.test.js | 8 | 8 | 0 |
| hr-route-event-summaries.test.js | 5 | 5 | 0 |
| hr-route-physical-deletion-contract.test.js | 8 | 8 | 0 |
| hr-route-physical-deletion.test.js | 11 | 11 | 0 |
| hr-single-active-schedule-certificate.test.js | 3 | 3 | 0 |
| hr-single-selfie-gate.test.js | 4 | 4 | 0 |
| hr-social-contribution-segments.test.js | 21 | 21 | 0 |
| hr-termination-benefits.test.js | 3 | 3 | 0 |
| hr-termination-deductions.test.js | 4 | 4 | 0 |
| hr-termination-manual-adjustments.test.js | 1 | 1 | 0 |
| hr-user-association.test.js | 3 | 3 | 0 |
| hr-workday-novelties-contract.test.js | 24 | 24 | 0 |
| hr-workday-novelties-policy.test.js | 5 | 5 | 0 |
| hr-workdays-projection.test.js | 2 | 2 | 0 |

## Web — tabla por archivo

| Archivo | Tests | Pass | Fail |
|---|---|---|---|
| payroll-display.test.mjs | 3 | 3 | 0 |
| hr-time-report.test.mjs | 6 | 6 | 0 |
| hr-schedule-timeline-view.test.mjs | 11 | 11 | 0 |
| hr-davivienda-bank-file-ui.test.mjs | 3 | 3 | 0 |
| hr-workday-novelties-ui.test.mjs | 14 | 14 | 0 |
| hr-reports-xlsx.test.mjs | 3 | 3 | 0 |
| **hr-landing-information-architecture.test.mjs** | **5** | **4** | **1** |
| hr-punch-mobile-evidence.test.mjs | 2 | 2 | 0 |

Todos los 8 ejecutables en este arnés (los `.mjs leen fuentes por URL relativa; no requirieron `node_modules` de Next).

## Rojos y clasificación

### 1. `apps/api/test/hr-evidence-backfill-tool.test.js` — 3 fallos

Tests fallidos:
- "sin ambiente declarado no hay corrida, y el modo por defecto es dry"
- "--keep-inline solo existe sobre una escritura declarada"
- "el tenant y la rama se validan antes de leer configuracion"

Error crudo (los tres): `no existe config\qa.env para el ambiente qa` — `resolveRuntime(["--env","qa"]).problems` devuelve ese problema donde el test espera `[]`.

Clasificación: **(b) preexistente en origin/main + (c) limitación del arnés**.
- El blob del test es idéntico entre `origin/main` y el candidato (`git diff --stat origin/main HEAD -- apps/api/test/hr-evidence-backfill-tool.test.js` vacío), y `scripts/hr-evidence-backfill-storage.js` tampoco difiere.
- Reproducción contra main: se extrajo el test exacto de `origin/main` con `git show` y se ejecutó desde una copia temporal dentro de `apps/api/test/` (ruta necesaria porque el test resuelve `../../../scripts/...` relativo a `__dirname`; el intento desde fuera del repo falló con `Cannot find module`, error de arnés, no de producto). Resultado idéntico: 7 tests / 4 pass / 3 fail, mismas 3 pruebas. Copia temporal eliminada después.
- Causa raíz: `config/qa.env` está gitignoreado (`.gitignore:7: config/*.env`); solo existe `config/qa.env.example`. Un checkout limpio de main, sin ese archivo local, produce exactamente estos 3 rojos. No es regresión del candidato.

### 2. `apps/web/test/hr-landing-information-architecture.test.mjs` — 1 fallo

Test fallido: "mallas conserva planeacion, monitor y reportes sin acceso para marcar".

Error crudo: `The input was expected to not match the regular expression /href: "\/dashboard\/talento-humano\/marcacion"/` — la portada `page.tsx` aún expone el acceso a Marcaciones.

Clasificación: **(b) preexistente en origin/main, en forma espejo**.
- `apps/web/app/dashboard/talento-humano/page.tsx` está idéntico en main y en el candidato (md5 `b2c61d52cfacae61183de45a6924d661` en ambos; `git diff --stat` vacío). El rojo no lo introduce el candidato.
- El candidato reescribió el test (diff de 5 líneas) para reflejar el transporte sin biométricos: ahora exige que NO haya href a `/marcacion`. Como la pantalla sí lo tiene, el test nuevo rojo.
- Se reprodujo el test versión main contra el mismo `page.tsx`: también 5/4/1, pero el rojo inverso ("la portada expone como acceso cada pantalla…", exige href literal `/talento-humano/mallas"` que ninguna versión de `page.tsx` — main ni candidato — contiene; `grep -c 'talento-humano/mallas"'` = 0 en ambas). Es decir: en main ya había un rojo de desalineación test↔pantalla; el candidato movió el rojo, no lo creó ni lo curó.
- Nota de alcance: `page.tsx` no está en el inventario de 40 rutas del candidato, por lo que alinearlo excedería el manifiesto de alcance de esta promoción. Queda como pendiente explícito para el dueño (ajustar la portada o el test en una intervención posterior), no como defecto del código promovido.

## Veredicto

- 0 rojos clasificados como (a) falla del candidato en 384 tests ejecutados.
- Los 4 rojos son preexistentes en `origin/main` (reproducidos contra el blob exacto de main) y agravan con una limitación de arnés (ausencia de `config/qa.env` local, archivo gitignoreado).
- Ningún rojo bloquea la promoción desde el punto de vista de calidad del código del candidato; el rojo web deja una prueba de contrato desalineada con la portada que debe resolverse en una intervención acotada (fuera del alcance de este transporte).

---

## Corrección medida sobre la punta final del candidato (`05886b09`)

Esta sección anula dos afirmaciones de la sección anterior. Se mide sobre el árbol
definitivo del candidato, no sobre `3543b325`.

**1. Los 3 rojos de `hr-evidence-backfill-tool.test.js` eran del arnés, no de `main`.**
El worktree auxiliar no trae `config/qa.env` porque está gitignoreado
(`.gitignore:7: config/*.env`), así que `resolveRuntime(["--env","qa"])` devolvía
`no existe config\qa.env para el ambiente qa`. Se copió el archivo real del checkout
principal al worktree (queda ignorado, nunca se commitea) y se re-corrió:

```
node --test apps/api/test/hr-evidence-backfill-tool.test.js
# tests 7 / # pass 7 / # fail 0
```

Subtotal API del frente HR corregido: **337 tests / 337 pasan / 0 fallan** en 52 archivos.

**2. El candidato NO reescribió el test de la portada.** Los hashes de blob lo prueban:

| Archivo | `origin/main` | candidato `05886b09` | `origin/develop` |
|---|---|---|---|
| `apps/web/test/hr-landing-information-architecture.test.mjs` | `ec85d10c` | `ec85d10c` (idéntico) | `040c44fd` |
| `apps/web/app/dashboard/talento-humano/page.tsx` | `b60fe540` | `b60fe540` (idéntico) | — |

El test que viaja es el de `main` y la pantalla que queda es la de `main`: el transporte
no tocó ninguno de los dos. La prueba fallida es, en ambos árboles, la misma:

```
not ok 2 - la portada expone como acceso cada pantalla del modulo, incluida nomina
# tests 5 / # pass 4 / # fail 1
```

Corrida de contraste en el worktree línea base `.tmp/wt-hr-main-antes` (árbol puro de
`0ec1cff0`, sin una sola línea del candidato): **misma prueba, mismo fallo, 4/1**. Es un
rojo que Producción ya tiene hoy entre su test de arquitectura de Información y su
portada, no una regresión de este transporte. Se declara como hallazgo del destino y
requiere su propio manifiesto (ajustar portada o test), no se arregla de contrabando
dentro de esta promoción.

**Totales corregidos del frente HR sobre el candidato:**

| Lado | Archivos | Tests | Pass | Fail |
|---|---|---|---|---|
| API `apps/api/test/hr-*.test.js` | 52 | 337 | **337** | **0** |
| Web (8 `.mjs`) | 8 | 47 | 46 | 1 (preexistente en `main`, probado por blob y por corrida en la línea base) |

El rojo de la portada queda como único rojo del frente y está documentado con su
responsable en el brief (§riesgos) y en el manifiesto de aprobación.

---

## Cierre de la compuerta: arbol completo y campo de QA medidos sobre la punta final

Dos medidas que faltaban para poder afirmar "no dane funciones ajenas": la suite del
árbol entero (no solo el subset del frente) antes y después, y la corrida de campo
contra el ambiente QA con el instrumento corregido.

**Árbol completo (`suites-arbol-completo.json`).** Línea base = árbol puro de
`0ec1cff0` (lo que Producción sirve hoy); candidato = `05886b09`.

| Lado | ANTES | DESPUÉS | Rojos por archivo ANTES | DESPUÉS |
|---|---|---|---|---|
| API | 1256 / 1268 (162 archivos) | **1277 / 1288** (166) | 9 | **8** |
| Web | 860 / 868 (117 archivos) | **885 / 892** (121) | 5 | **4** |

Cero rojos nuevos en las dos mitades. Se curan dos que ya estaban rojos en Producción:
`apps/api/test/hr-marking-concurrency.test.js` y
`apps/web/test/hr-punch-mobile-evidence.test.mjs`. El candidato añade 8 archivos de
prueba del frente y no elimina ninguno.

**Campo de QA (`qa-campo-campo-escritura-corregido.json`): 25 de 26 piernas verdes.**
La corrida nocturna marcaba 16/26 por dos defectos del instrumento, no del negocio: el
reloj del puesto cruzaba medianoche dentro de la ventana (`hhmm` envolvía el minuto y el
ambiente respondía con razón `HORARIO_CRUZA_MEDIANOCHE`, cascando 5 piernas de mallas) y
la comparación de anclaje trataba "ausente contra ausente" como divergencia. Corregido el
arnés —ventana alterna 08:00–17:00 y anclaje conforme cuando ambos lados faltan—, las
piernas de mallas, contención P2028, idempotencia, RBAC de nómina, aislamiento de tenant y
retiro por estado quedan verdes. Escrituras: solo cuentas y mallas efímeras de la corrida,
retiradas por el propio endpoint al final (`DELETE` físico responde 400 sin la bandera).

**La pierna roja que queda es preexistente y ajena a este transporte.**
`punch_selfie_no_imagen_400`: el ambiente acepta un PDF como selfie de marcación
(responde 200) en lugar de rechazarlo. Sale roja igual en la corrida nocturna y en la
corregida, y el módulo que valida el contenido de la foto (`mobile-identity.js`) es byte a
byte idéntico en `origin/main`, `origin/develop` y el candidato (`863bd6a6`), con el
anclaje vivo en `service.js`. Es decir: la compuerta de contenido no existe en ninguna
rama, así que ni la trae ni la quita este viaje. Pertenece al frente biométrico excluido y
se entrega como hallazgo con dueño (`apexos-seguridad`), no como defecto curado en silencio.
Detalle con su evidencia en `atribucion-qa-campo.json`.
