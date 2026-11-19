# Certificación del candidato: el monitor de marcaciones deja de arrastrar binarios (2026-11-19)

**Cambio certificado.** `desarrollo` → `develop`, pierna `desarrollo → develop` para QA.
**Candidato:** rama auxiliar `codex/qa-hr-monitor-budget-20261119` (worktree `apexos-cand-hr-monitor-develop`).
**Origen del código:** `2f8907af`, `c826bba8` y `b6f3d35d`, los tres ancestros verificados de `origin/desarrollo`.
**Base del destino:** `origin/develop` = `5fcc2ed1`.
**Empresa de la evidencia funcional:** NYVORA (QA), con fixtures propias del certificador.

## Qué se prometió

Con el horario 336 de producción como testigo: que el monitor cargue y actualice los datos sin retraso,
que al explorar un horario la evidencia se vea sin sensación de espera, y que la pantalla no mienta
mostrando «sin marcaciones» cuando en realidad no pudo leer.

## El antes, medido en producción (solo lectura)

Lectura del día 2026-11-18 del tenant del cliente, 300 filas por lectura. «Cruda» es el comportamiento
anterior: `SELECT` con `metadata` en claro. «Proyectada» es `monitorEvidenceRows` con la guarda de
`pg_column_size`. Evidencia: `../evidence/hr-monitor-evidence-by-reference-20261118/produccion-antes-despues-dia.json`.

| Lectura | Antes | Después | Factor |
| --- | --- | --- | --- |
| `TimePunch` (53 filas) | 7 743 ms · 22 752 445 bytes | 941 ms · 50 735 bytes | 448,5× menos bytes · 8,2× más rápida |
| `GpsPing` (239 filas) | 9 790 ms · 21 629 022 bytes | 1 055 ms · 103 640 bytes | 208,7× menos bytes · 9,3× más rápida |
| Las dos juntas | 17 533 ms · 44,38 MB | 1 996 ms · 154 KB | la pantalla ya no baja un adjunto por conexión |

## Contratos que sostienen la promesa

1. **La evidencia viaja por referencia.** El listado anuncia `{ id, source, has_base64_data, available }` y los
   bytes solo salen de `GET /api/v1/hr/monitor-evidence/:source/:id`. Probado en vivo contra QA:
   `../evidence/hr-monitor-evidence-by-reference-develop-20261119/certificacion-evidencia-bajo-demanda-qa.json`.
2. **Ningún contador se pinta como cero sin lectura.** `punch_count: number | null`; `event_count` nulo se
   conserva nulo. `apps/web/test/hr-monitor-stale-read.test.mjs`.
3. **El reintento es automático y el aviso lo dice.** Cadena del backstop bajada de 5 s a 30 s
   (`ROUTES_BACKSTOP_POLL_MS`) para que las lecturas pesadas no compitan entre sí, con el texto
   «La pantalla reintenta sola». `apps/web/test/hr-monitor-refresh.test.mjs`.
4. **El reporte y el cierre de jornada también cortan el binario**, no solo el monitor.
   `apps/api/test/hr-reports-range.test.js` y `apps/web/test/hr-report-punch-selfie.test.mjs`.
5. **El binario queda en una sola fila.** `evidenceStorage` escribe la selfie en Storage
   (bucket `operational-evidence`) y la fila conserva la referencia; `hr-evidence-storage-gate.test.js`
   y `hr-gps-metadata-projection.test.js` cierran la difusión de identidad en los escritores de GPS.

## Suites del candidato (ejecutadas sobre el árbol de la rama auxiliar)

- API: `# tests 1168 · # pass 1164 · # fail 1 · # skipped 3`.
- Web: `# tests 820 · # pass 819 · # fail 1`.
- Typecheck web: `tsc -p tsconfig.typecheck.json --noEmit` sin errores.
- HR dirigido: 30/30 en las pruebas de marcaciones, evidencia y reporte.
- Selftest del gate de presupuesto: 4/4, con sus tres rojos provocados (gordo, lento y binario inline),
  porque un gate que no puede fallar no certifica nada.

Los dos rojos son deuda del destino y **no** los produce este candidato; cada uno con su prueba:

- `fix concurrencia: ninguna escritura de Talento Humano deja un lock bloqueante`
  (`apps/api/test/hr-marking-concurrency.test.js:224`). `origin/develop` tiene **6** sitios con
  `pg_advisory_xact_lock` reintroducidos por el código más nuevo de liquidación y libranza; `origin/desarrollo`
  tiene **0**. El candidato heredó los 6 de su base y no tocó ninguno de esos hunks. Es la misma clase de
  bloqueo que la contención de octubre retiró en `desarrollo`, y se reporta por separado a su dueño.
- `el registro de funciones cubre todas las rutas del dashboard`
  (`apps/web/test/command-palette-module-functions.test.mjs:57`). Falta `/dashboard/contabilidad/pyg/ampliado`
  en el registro de la paleta: deuda del frente de PYG/Contabilidad, ajena a Talento Humano.

Detalle con salidas: `../evidence/hr-monitor-evidence-by-reference-develop-20261119/suites-y-medicion.txt`.

## Puerta de presupuesto (bytes y latencia)

El gate `scripts/certifications/hr-monitor-byte-budget.js` exige listado ≤ 4 MB, p95 ≤ 3 000 ms y máximo
8 192 caracteres de binario inline.

- **Línea base del destino desplegado, medida hoy con la misma sesión:** mapa del día 33 KB · p95 1 044 ms;
  contadores 4 KB · p95 794 ms; reporte de asistencia 15 KB · p95 524 ms. **VERDE.**
  Evidencia: `../evidence/hr-monitor-evidence-by-reference-develop-20261119/presupuesto-qa-desplegada-lineabase.json`.
- **Candidato servido en el puesto:** mismos bytes (33 KB / 4 KB / 14 KB, cero binarios inline) pero p95 de
  3 259 ms y 4 185 ms. **El rojo es del arnés, no del lector:** el pooler de sesión de QA limita a 15 clientes,
  la API desplegada ya sostiene su pool de 10, y una segunda API en el puesto obliga a bajar a 3 conexiones
  donde las cinco lecturas paralelas del mapa se encolan cruzando el internet. Con `connection_limit=10` el
  mismo código deja de ser lento y falla con `EMAXCONNSESSION`; con 3 conecta y mide la cola. Atribución
  completa: `../evidence/hr-monitor-evidence-by-reference-develop-20261119/arnes-pooler-atribucion.txt`.

Consecuencia registrada a propósito: **la latencia se certifica contra el build desplegado**, primero en QA
y después sobre el horario 336 en producción. Ningún puesto local compartido con el pooler de QA es
instrumento de latencia, y este cierre no finge que lo fue.

## Qué queda abierto con esta firma

1. Desplegar el candidato en QA y repetir el gate y la certificación bajo demanda contra ese build.
2. Certificación de navegador del flujo del incidente (abrir el horario, ver la evidencia, sin espera).
3. Nube: rescate pendiente, purga de lo ya verificado por SHA-256 (≈330,3 MB), `VACUUM`, `VALIDATE` de la
   `CHECK … NOT VALID` e índice `(tenant_id, route_id)` en `TimePunch`, este último solo con el lector desplegado.
4. Pierna `develop → main` con su aprobación funcional de QA.
