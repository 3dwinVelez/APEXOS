# Brief — Ventana de marcación sin horario y mapa de operaciones sin selfies

- **ID**: `2026-11-17-marcacion-sin-horario-y-mapa-sin-selfies`
- **Fecha**: `2026-11-17`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "primero debemos de enmascarar esos errores no deberia de dejarlo ni siquiera pasar a la ventana de marcaciones si no tiene un horario asignado deberia mostrarle un mensaje grande que indique sin horario asignado y evitamos mostrarle todos esos errores que se ven que al final tiene un sentido paero visualmente para el cliente significa que la herramienta falla. por otro lado necesitamos corergir si o si esas cargas de 12 a 20 sec al cargar el horario no deberia de tardarse tanto es extremadamente demorado minimo deberia estar en 2 sec como maximo"

## 1. Objetivo

Dos resultados observables:

1. Un usuario sin ficha laboral vinculada, o sin horario publicado para hoy, entra a `/dashboard/talento-humano/marcacion` y ve **un solo panel grande "Sin horario asignado"** con la acción que corresponde. No ve tarjetas de "Fallo técnico detectado": el 404 de la ficha es un estado de negocio, no una caída, y las cuatro lecturas que dependen de ella no se lanzan.
2. Las lecturas de marcación dejan de arrastrar el `jsonb` tostado `TimePunch.extra_evidence` cuando nadie lo pinta. Hay dos, y ambas se cortan aquí:
   - **La lectura diaria del monitor** (`getOperationsMap`, la repite cada 5 s mientras un horario está abierto). Medido en `pg_stat_statements` de producción el 2026-11-17: 4.271 llamadas, **media 3.917,91 ms, máximo 61.365,4 ms**, 615 filas por llamada y **78,8 % del tiempo de base medido**. Con `blocks_read_from_disk = 0`, el costo es transferir, no buscar.
   - **La línea de tiempo de la propia marcación** (`GET /hr/self/attendance`, más la jornada que se reconstruye desde las marcaciones del día y la comprobación de secuencia dentro de la transacción de la marcación). El cliente solo pinta tipo, hora, placa y ruta; cada fila viajaba con 106 KB de media y 2,8 MB en el peor caso.
3. Presupuesto del dueño: la apertura de un horario no puede pasar de **2 s**. Este corte ataca la parte de base y alambrado; se mide con `scripts/performance/selfie-payload-probe.js`, que ahora reporta también el par antes/después de la lectura propia.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/hr/monitorEvidenceRows.js` | Lectura cruda del día con `pg_column_size(extra_evidence)` como aviso de presencia (`EVIDENCE_PRESENT_MIN_BYTES`), `metadata` en texto sin decodificar y `extra_evidence` fuera del SELECT. Contiene también las lecturas por ruta y sin vínculo, y `SELF_PUNCH_SELECT`: la fila de marcación completa menos la evidencia, para las lecturas propias de la pantalla. |
| `M` | `apps/api/src/modules/hr/service.js` | `monitorPunchEvidenceFlag` reemplaza el resumen con bytes en los dos consumidores del mapa del día. `listOwnAttendance`, `latestPunchesForEmployee` (jornada reconstruida) y la lectura de `punchesToday` dentro de la transacción de `createPunch` usan `SELF_PUNCH_SELECT`. |
| `M` | `apps/api/test/hr-monitor-evidence-demand.test.js` | El lote se certifica como índice: contadores y banderas, cero bytes. |
| `M` | `apps/api/test/hr-operations-map-contract.test.js` | Guarda de fuente: el mapa no vuelve a construir el resumen desde los bytes. |
| `M` | `apps/api/test/hr-punch-mobile-evidence.test.js` | La selfie móvil se lee por demanda en el monitor; el lote sigue siendo índice. |
| `A` | `apps/api/test/hr-monitor-evidence-columns.test.js` | `PUNCH_COLUMNS` y `SELF_PUNCH_SELECT` contra `schema.prisma`, SQL de la lectura del día (prohibido abrir el `jsonb`), cota del umbral, guarda de fuente de las tres lecturas propias de la marcación y fijación explícita de que `listAttendance` NO proyecta porque reportes sí pinta la foto. |
| `M` | `apps/api/test/hr-list-truncation.test.js` | El stub de Prisma declara `$queryRaw`: `listRouteEventSummaries` hoy trae los conteos de evidencia desde la lectura cruda y sin esa llave el test reventaba antes de llegar al truncamiento. |
| `M` | `apps/api/test/hr-deferred-marking-offline.test.js` | Los payloads de marcación propia declaran la selfie y el sustento de llegada tarde que `6e3a795f` empezó a exigir. Rojos preexistentes en HEAD, cerrados aquí (sección 6). |
| `M` | `apps/web/test/hr-route-write-fallback.test.mjs` | Las dos guardas de fuente de la condición de respaldo dejan de anclar su final y exigen que el guard sea la primera condición y se consulte antes de `supabaseApiFallback`. |
| `M` | `apps/web/app/dashboard/talento-humano/marcacion/page.tsx` | La ficha se resuelve sola y primero con `silentFailureAlert`; corte por 404; panel único que desmonta pestañas, ventana de marcado e historial. |
| `M` | `apps/web/app/dashboard/talento-humano/mapa/page.tsx` | El detalle de la marcación muestra el soporte con `HrTimelineEvidence` (peticion por id) en lugar de una `<img>` que leía bytes ya retirados del contrato. |
| `M` | `apps/web/app/dashboard/talento-humano/rutas/page.tsx` | `hasEvidenceFile` delega al predicado compartido y se desmonta el lote de evidencia de la ruta (`loadRouteEvidenceBatch`, `loadingBatch`, `batchLoadedRef` y su insignia): cada evento visible se pide por id, que es lo que ya hacía el respaldo por evento. |
| `M` | `apps/web/lib/hrScheduleMonitor.ts` | `scheduleMonitorHasEvidenceFile`: una sola regla para mapa y rutas. |
| `M` | `apps/web/test/hr-monitor-identity-selfie.test.mjs` | Contratos de identidad/selfie del monitor ajustados al aviso por id. |
| `M` | `apps/web/test/hr-offline-marking.test.mjs` | El contrato del arranque en frío pasa por la lectura individual de la ficha; la participación en el snapshot se sigue exigiendo. |
| `A` | `apps/web/test/hr-marking-unassigned-gate.test.mjs` | Guarda de fuente del corte, del panel único y de que el modo respaldo nunca bloquea. |
| `M` | `scripts/certifications/hr-monitor-ui-modernization-qa.js` | Ajustado al contrato de evidencia por id. |
| `M` | `scripts/certifications/hr-monitor-ux-fixes-qa.js` | Ajustado al contrato de evidencia por id. |
| `M` | `scripts/certifications/hr-punch-mobile-evidence-local.js` | Ajustado al contrato de evidencia por id. |
| `A` | `scripts/certifications/hr-marking-unassigned-gate-local.js` | Certificación Chromium, cinco aperturas de pantalla en cuatro escenas de negocio: sin ficha (`/hr/self` 404), ficha sin horario publicado, ficha con horario del día y caída real (sin conexión con respaldo del día y sin respaldo). `/api/v1/auth/me` se responde con el contexto de sesión que exige `RouteAccessGuard`; las lecturas sin mapear devuelven 500 a propósito para que una tarjeta de fallo técnico aparezca si el corte falla. |
| `A` | `scripts/performance/selfie-payload-probe.js` | Instrumento versionado de la medición: sembrado fiel al reparto de producción y comparación antes/después de la misma corrida, ahora en dos lecturas (mapa del día y marcaciones propias de un empleado). La tabla de sonda declara NOT NULL las columnas no anulables del modelo, porque la lee también el delegador de Prisma. |
| `A` | `scripts/performance/timepunch-evidence-size-probe.js` | Sonda de solo lectura del tamaño real de la evidencia en la base apuntada. |
| `A` | `docs/briefs/2026-11-17-marcacion-sin-horario-y-mapa-sin-selfies.md` | Este brief. |
| `A` | `docs/qa/evidence/hr-carga-horarios-20261117/selfie-payload-probe.json` (+`.err`) | Medición antes/después con la distribución sembrada. |
| `A` | `docs/qa/evidence/hr-marking-unassigned-gate-20261117/` | `certification.json`, cinco capturas y el log del servidor. |

### Módulos (`change_intent.modules`)

- `hr-monitor-evidence`
- `hr-marking-window`

### Borrados autorizados (`allowed_deletions`)

- ninguno. Los residuos de sondeo `tmp-*-probe.js` y `tmp-probe-*.{json,err}` del puesto de trabajo se eliminan sin commit (nunca estuvieron versionados).

## 3. Fuera de alcance

- `apps/api/src/modules/hr/service.js` → `listAttendance` (`GET /hr/attendance`) y `getRouteTracking` siguen trayendo `extra_evidence` completo, y `processDay` sigue leyendo las marcaciones del día con todas sus columnas. `reportes/page.tsx` pinta la foto desde el payload de `listAttendance` (`page.tsx:147` y `:154`), así que proyectarla ahí borraría un dato visible: migrar reportes a la petición por id es trabajo propio con su certificación de pantalla. `processDay` es dominio de nómina y de los auditores: no se toca sin su dictamen.
- El respaldo del cliente en `apps/web/lib/api.ts:2478` (`supabaseApiFallback` sobre `/rest/v1/time_punches`) sigue seleccionando `extra_evidence` para el rango de reporte de la empresa. Es el camino que se usa cuando el API rechaza, alimenta la misma pantalla de reportes y quedó fuera por la misma razón.
- `getMonitorEvidenceBatch` (abrir una ruta en el monitor) sigue proyectando con `md5()` sobre el `jsonb` abierto. Es una ruta por evento visible, no las 615 filas del día; queda como siguiente corte.
- `prisma.workSession.create()` dentro de `GET /hr/self/work-session`: escritura en una lectura, se trata aparte por su riesgo de idempotencia.
- `latestPunchesForUser` (`service.js:3605`) no se modifica: no tiene llamadores. Se deja su estado como deuda menor, no se borra en esta intervención.
- No se toca el esquema ni se crea migración: el aviso se calcula con `pg_column_size`, sin columna nueva.
- No se promociona a `develop` ni a `main`, no se despliega y no se aplican cambios en Railway/Supabase.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 12).
- `$queryRaw` no pasa por el middleware de tenant: la lectura declara `"tenant_id" = ${tenantId}` de forma explícita y la prueba lo fija.
- El orden de los parámetros vinculados es el del SQL: el umbral va primero porque vive en el `SELECT`.
- Aislamiento multi-tenant y RBAC intactos; la evidencia completa sigue pidiéndose por `/api/v1/hr/monitor-evidence/:source/:id` con `requirePermission("hr", "read")`.
- Sin secretos ni credenciales en el brief ni en el diff.

## 5. Criterios de aceptación

1. `node --test apps/api/test/hr-monitor-evidence-columns.test.js apps/api/test/hr-monitor-evidence-demand.test.js apps/api/test/hr-operations-map-contract.test.js apps/api/test/hr-punch-mobile-evidence.test.js` → 21/21 en el corte de evidencia y verde en la regresión `hr-*`.
2. `node --experimental-strip-types --test apps/web/test/hr-marking-unassigned-gate.test.mjs apps/web/test/hr-marking-only-access.test.mjs apps/web/test/hr-offline-marking.test.mjs` → 41/41.
3. `npm run typecheck` en `apps/web` → exit 0.
4. `node scripts/certifications/hr-marking-unassigned-gate-local.js` → 14 verificaciones en cinco aperturas: con `/api/v1/hr/self` en 404 solo se lanza esa petición, el panel `section[role="status"]` dice "Sin horario asignado", no aparece "Fallo técnico detectado" y las pestañas Marcar/Historial no están en el DOM. Con horario del día la pantalla sigue igual. En la caída real con respaldo del día se avisa de conexión y se sigue marcando; en la caída sin respaldo el aviso dice que no hay horario guardado y el panel de bloqueo **no** aparece.
5. `node scripts/performance/selfie-payload-probe.js --rows 2200 --limit 615` → `seed_is_faithful: true` y las dos lecturas (mapa del día y marcaciones propias) por debajo de la sexta parte de su costo en bytes, con el payload del día reducido a menos de 1 MB.
6. Regresión ampliada, corrida sobre el **candidato aislado** (`codex/qa-hr-marking-gate-20261117` sobre `origin/desarrollo` `6e3a795f`, solo las 24 rutas de este corte): `node --test apps/api/test/hr-*.test.js` → **249/249** (los cuatro rojos que aparecieron al correrla se cerraron en esta intervención, sección 6) y, desde `apps/web`, `node --experimental-strip-types --test test/*.test.mjs` → **821 pruebas, 820 pasan y 1 falla** (`el registro de funciones cubre todas las rutas del dashboard`), con un solo rojo ajeno al alcance. El directorio no se pasa como argumento suelto (`node --test test`): el runner de este puesto lo toma como un falso archivo llamado `test` y reporta un solo fallo que no existe.
7. Por qué los conteos cambiaron respecto a la lectura inicial (257 y 830/831): esas cifras se tomaron en el `checkout` compartido, que carga alcance ajeno. La diferencia está medida, no supuesta: `apps/api/test/hr-scope-unique-index-remediation.test.js` existe solo en ese árbol y aporta **8** pruebas (249 + 8 = 257), y `apps/web/test/accounting-pyg-interactive.test.mjs` está modificado por la intervención PYG con **21** pruebas frente a las **11** de la versión publicada (821 + 10 = 831). Ambas carpetas tienen los mismos 35 `hr-*.test.js` versionados y los mismos 111 `.mjs`. La evidencia archivada es la del candidato: el árbol compartido no certifica este corte.

## 6. Los cuatro rojos de la regresión, atribuidos antes de tocar nada

Correr `hr-*` completo sacó cuatro pruebas en rojo. Dos eran de este corte y dos venían en rojo desde `origin/desarrollo`; se separaron con `git show HEAD:...` antes de editar, porque un rojo heredado corregido como propio ensucia el alcance ajeno.

| Prueba | Causa medida | Dueño | Cierre |
|---|---|---|---|
| `hr-list-truncation.test.js` (2) | El stub de Prisma no tenía `$queryRaw` y `listRouteEventSummaries` ahora pide los conteos de evidencia por lectura cruda. | Este corte | `$queryRaw: async () => []` en `summaryPrisma`, con su porqué. |
| `hr-deferred-marking-offline.test.js` (2) | `SELFIE_REQUERIDA` y `JUSTIFICACION_LLEGADA_TARDE_REQUERIDA`: los dos payloads de `createOwnPunch` marcan "entrada" sin selfie ni sustento. El gate ya estaba en HEAD (`service.js:3114` y `mobile-identity.js:199` con `git show`), así que el rojo es de `6e3a795f`, no de este corte. | Heredado, en la ventana de marcación | `webSelfie()` y `lateJustification()` en los payloads; la prueba sigue certificando la ventana diferida, no el recargo. |
| `hr-route-write-fallback.test.mjs` (2) | Guardas de fuente que anclaban el final exacto de la condición de `apiInternal`; HEAD le agregó `!scheduleMonitorUsesOperationalSource(...)` y el `assert.match` dejó de casar. `lib/api.ts` está intacto en el índice, así que el rojo es preexistente. | Heredado (respaldo de rutas) | Se exige que el guard sea la primera condición y se consulte antes del respaldo, sin anclar las cláusulas siguientes. El patrón `[^\r\n]` es obligatorio: el archivo es CRLF y `$` con `\r` pendiente daba rojo falso. |
| `command-palette-module-functions.test.mjs` (1) | `/dashboard/contabilidad/pyg/ampliado` (entrada en `67683a77`, transporte/PYG) no está registrado en `lib/moduleFunctions.ts`. | **Ajeno**: alcance PYG del compañero en curso | No se toca: meter el registro en un commit de Talento Humano mezclaba módulos, prohibido por `AGENTS.md`. Queda declarado como pendiente del dueño. |


## 7. Evidencia y certificación exigida

- Pruebas: las de la sección 5. La regresión `hr-*` de la API corre entera con stubs (`257/257`), pero el resto de `apps/api/test` necesita una base viva en `DATABASE_URL` y el puesto apunta a `localhost:54320` (puerto muerto): queda declarado como pendiente, no como verde. No se redirige la variable hacia la base de trabajo del repositorio porque las suites escriben en ella y ahí está el alcance del compañero.
- Instrumento: `scripts/performance/selfie-payload-probe.js` → `docs/qa/evidence/hr-carga-horarios-20261117/selfie-payload-probe.json`.
- Certificación de pantalla: `node scripts/certifications/hr-marking-unassigned-gate-local.js` → `docs/qa/evidence/hr-marking-unassigned-gate-20261117/`.
- Re-certificación tras la limpieza del estado muerto (12:06): `bootstrapDone` se añadió en este corte sin que nadie lo leyera; el aviso de lint se cerró cortando la declaración sin mirar los dos `setBootstrapDone(true)` que sí quedaban, porque el grep con `b` minúscula no encuentra el setter (`BootstrapDone`). Retirados los tres, el render lo sigue fijando `blocked` en las dos salidas de `load()`. Después de eso: `npm run typecheck` en `apps/web` exit 0, `eslint` del archivo exit 0, 41/41 en las tres pruebas de pantalla y 14/14 en la certificación de navegador (evidencia de esa corrida, no de la anterior).
- Corrección de conteos publicada el mismo día: la regresión ampliada se volvió a correr sobre el candidato aislado y dio **249/249** en `hr-*` de la API y **821 (820 pasan / 1 falla)** en la suite web, con el rojo heredado del registro de funciones. Las cifras anteriores (257 y 830/831) pertenecían al árbol compartido y ya están explicadas en la sección 5, punto 7.
- `certification_status` esperado: `local_passed_qa_pending`.

### Medición archivada (2026-11-17, `--rows 2200 --limit 615`, seed fiel: 234 MB, `extra_evidence` media 106.166 B y máximo 2.835.161 B)

| Lectura | Antes | Después | Ahorro |
|---|---|---|---|
| Mapa del día (615 filas) | 62,70 MB · 2.098,7 ms pared | 0,44 MB · 20,2 ms pared | 141,4× en bytes · 2.078,5 ms locales |
| Marcaciones propias (55 filas del seed) | 8,24 MB · 214,9 ms | 0,03 MB · 14 ms | 262,2× · 157.072 B → 599 B por marcación |

Lo que sostiene el presupuesto de 2 s en la lectura propia es la última cifra: una jornada real de cuatro marcaciones pasa de **614 KB a 2 KB** por apertura. El seed concentra las 2.200 filas en un solo día, así que la lectura de un empleado trae 55 marcaciones cuando la realidad trae 4; por eso el reporte publica los bytes por fila y su proyección, no solo el total.

Qué NO afirma esta tabla: el tiempo absoluto local es piso, no techo —corroe por loopback sobre una base recién `VACUUM`ed y varió entre 1.900 y 3.254 ms en dos corridas del mismo seed, mientras la razón de bytes se mantuvo en 140-141×—. El número de producción es el de `pg_stat_statements` (`production_reference` en el JSON: 3.917,91 ms de media con `blocks_read_from_disk = 0`), y la pared final de 2 s del lado del usuario solo se puede certificar contra un ambiente desplegado, que sigue pendiente de autorización.

## 8. Capacidades protegidas

- **Marcación offline y horario degradado** — `hr-offline-marking.test.mjs` sigue exigiendo que la ficha participe del snapshot; el panel nunca aparece en modo respaldo (escenario `sin_conexion` de la certificación).
- **Identidad y selfie de la marcación** — `hr-punch-mobile-evidence.test.js` y `hr-monitor-identity-selfie.test.mjs`: el bytes-inmune cambio de contrato conserva la foto de identidad dentro de `metadata` y la subida por demanda.
- **Aislamiento de tenant en la evidencia** — `hr-monitor-evidence-demand.test.js`: la lectura cruda filtra por `tenant_id` y un tenant distinto devuelve colecciones vacías.
- **Sustento de la hora extra y la llegada tarde** — el mapa conserva `late_minutes`, alias e identidades porque `metadata` viaja cruda y se parsea en el lector.

## 9. Riesgos y rollback

- Riesgo: el aviso es un tamaño de columna, no contenido. Un `jsonb` vacío (`{}`, `[]`, `null`) mide 8-12 bytes y no anuncia; la referencia más corta que escribe el producto mide 75 bytes y sí anuncia. Mitigación: la cota queda fijada por prueba entre 13 y 74 y el umbral se comenta con las cifras medidas.
- Riesgo: una pantalla que aún dependa de los bytes del resumen vería el aviso sin el archivo. Mitigación: `mapa/page.tsx` y `rutas/page.tsx` usan el mismo predicado `scheduleMonitorHasEvidenceFile` y piden por id; `reportes` quedó fuera del alcance precisamente por consumir bytes.
- Riesgo: producción no está confirmada con la sonda directa (el `ca_sha256` fijado no está en el puesto). Se declara como pendiente, no como verificado.
- Rollback: `git revert` de los commits de esta intervención. No hay migración que revertir.

## 10. Supuestos y preguntas abiertas

- Supuesto: la evidencia real de marcación es una fotografía (media medida en producción: 106.459 bytes), por eso el archivo se pide al abrir el evento y nunca se lista con el día.
- Supuesto: el 404 `EMPLEADO_NO_ASOCIADO` es la única fuente de "sin ficha" en la ventana de marcación.
- Pregunta (no altera el alcance): si Talento Humano quiere que el operario vea su propia foto desde el historial de marcación, hace falta un endpoint `self` de evidencia; hoy solo existe el de supervisor con permiso `hr`.

## 11. Autorizaciones requeridas

- [x] Ninguna para implementar y certificar en local.
- [x] Promoción `desarrollo -> develop`: autorizada por el dueño el 2026-11-17, ejecutada por rama auxiliar `codex/qa-hr-marking-gate-20261117` con manifiesto v2 (`75071f3f`) y puerta `qa:preqa:evidence`; el merge `58c8554f` es la punta de `develop`.
- [x] Despliegue en Railway QA y corrida contra el ambiente: el build desplegado es `58c8554fd181` y sobre él corrieron `certify:hr-monitor-evidence:qa` (10 controles) y `certify:hr-marking-gate:qa` (12 controles), ambos `passed`. Evidencia y procedimiento en `docs/qa/certifications/hr-marking-gate-qa-20261117.md`.
- [ ] Promoción `develop -> main`, con manifiestos `docs/qa/manifests/hr-marking-gate-20261117-main-scope.json` y `docs/qa/manifests/hr-marking-gate-20261117-main-approval.json` sobre un worktree desmontable de `origin/main`. La autorización del dueño del 2026-11-17 cubre la promoción; el despliegue en producción después del push es un acto aparte.
- [ ] Ejecución de `scripts/performance/timepunch-evidence-size-probe.js` contra producción (necesita el CA fijado) y, si se decide, la aplicación de las migraciones pendientes en la nube.

## 12. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/api/src/modules/hr/...,apps/web/app/dashboard/talento-humano/...,apps/web/lib/hrScheduleMonitor.ts,scripts/performance/selfie-payload-probe.js,scripts/certifications/hr-marking-unassigned-gate-local.js"` → **Veredicto: OK**, 8 rutas ruteadas.
- **Agentes consultados**: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-performance`, `apexos-qa`.
- **Documentación a actualizar**: este brief, `docs/qa/evidence/hr-carga-horarios-20261117/`, `docs/qa/evidence/hr-marking-unassigned-gate-20261117/`, `docs/qa/evidence/hr-marking-gate-main-20261117/` y `docs/qa/certifications/hr-marking-gate-qa-20261117.md`.
- **Agentes a actualizar**: `apexos-backend` 2.15.1 → (control: la lectura diaria del monitor anuncia la evidencia sin abrir el `jsonb` tostado y la cota del aviso queda fijada por prueba), `apexos-frontend` 2.31.5 → (control: un 404 de negocio no se presenta como fallo técnico; el estado "sin horario" desmonta la superficie, no la oculta con CSS), `apexos-performance` 2.17.1 → (control: la medición `pg_stat_statements` y el instrumento sembrado con el reparto de producción), `apexos-qa` 2.72.0 → (control: la certificación de navegador con lecturas sustituidas se declara como prueba de pantalla, no como flujo autenticado), `apexos-seguridad` 2.28.0 → (control: `$queryRaw` conserva el filtro explícito de tenant cuando el listado deja de traer el archivo), `equipo-apexos` 2.42.0 → (control: el cierre en un índice de trabajo con alcance ajeno en curso).
- **Registro**: `agents/registry.json` (versión, `updated_at`, `sha256`) y sección nueva en `agents/CHANGELOG.md`.
- **Cierre del bloqueo conocido**: el alcance ajeno que estaba en el índice de trabajo aterrizó en `origin/desarrollo`, y el corte con su documentación y sus agentes ya está publicado (`c2242320`, `4ad781de`). La corrida en QA quedó trabada por otra causa, y esa causa era del arnés: `certify:hr-monitor-evidence:qa` pedía una entrada sin selfie y una jornada 00:01-00:02, dos cosas que el contrato promovido rechaza. Se reparó el arnés sin borrar ningún control y se agregó un control negativo (`entrada_sin_selfie_rechazada`) para que la exigencia de foto no vuelva a caerse en silencio. Detalle en `docs/qa/certifications/hr-marking-gate-qa-20261117.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → pruebas de la sección 5 → commit → push.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit

## 13. Paquete de evidencia en QA (cierre de la intervención)

| Archivo | Acción |
|---|---|
| `scripts/certifications/hr-marking-gate-qa.js` | A — certificación nueva del gate contra el build desplegado en QA (12 controles, presupuesto de latencia y ausencia de fotos en el mapa) |
| `scripts/certifications/hr-monitor-evidence-demand-qa.js` | M — arnés reparado contra el contrato de selfie y de sustento de la llegada tarde, con control negativo |
| `package.json` | M — script `certify:hr-marking-gate:qa` |
| `docs/qa/evidence/hr-marking-gate-main-20261117/qa-gate-certification.json` | A — corrida del gate, `passed`, `api_commit 58c8554fd181` |
| `docs/qa/evidence/hr-marking-gate-main-20261117/qa-monitor-evidence.json` | A — regresión del monitor, `passed`, mismo commit |
| `docs/qa/certifications/hr-marking-gate-qa-20261117.md` | A — qué se probó, cómo se reproduce, qué repara del arnés y qué no cubre |
| `docs/briefs/2026-11-17-marcacion-sin-horario-y-mapa-sin-selfies.md` | M — autorizaciones y cierre del bloqueo de publicación |
