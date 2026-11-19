# Certificación de la pierna `develop → main` — el monitor de marcaciones pide la evidencia por referencia

- **Cambio:** `hr-monitor-evidence-by-reference-20261119-main`
- **Candidato:** `8a71ff0c` sobre `origin/main` (`45069dd9`), rama auxiliar `codex/qa-hr-monitor-budget-main-20261119`
- **Contenido certificado en QA:** `9c82fca1` (tip de `origin/develop`, PR #95), que a su vez reconstruye `edffcb1e`
- **Ambiente de certificación:** QA desplegado (`apexos-api-qa-production`, `/health` reporta `9c82fca1a392`)
- **Fecha:** 2026-11-19
- **Autorización del dueño:** «procede con mi autorizacion y no pares hasta garantizar que el ambiente main este complemtanete desplegado con la correcion». Cubre el mecanismo de promoción y el despliegue; no salta compuertas.

## 1. Qué se promote y por qué no es un merge de `develop`

El diff neto `origin/main..origin/develop` mide **935 archivos**. Ahí vive trabajo de otros frentes que nunca pasó su compuerta de producción: la liquidación con conceptos manuales, los pagos finales de prestaciones y el vínculo usuario-empleado (PRs #93 y #94). `AGENTS.md` lo prohíbe en términos exactos: *«Branch-wide merges are forbidden when their net diff contains files, modules, migrations, deletions, or generated evidence outside the approved scope manifest»*, y exige reconstruir primero los commits puntuales.

Además, el guard de CI tiene una regla dura para PRs hacia `main`: solo aceptan head `develop` (`scripts/git-governance-guard.js:69`). La forma que la propia historia de `main` usa desde la ronda del 2026-11-17 es **replay de commits puntuales con push directo**, autorizada por el dueño y trazada con `-x` para conservar la referencia al commit certificado.

Eso es exactamente este candidato: `git cherry-pick -x edffcb1e` sobre `45069dd9`, sin conflictos declarados por git.

## 2. Equivalencia con lo ya certificado (la prueba que reemplaza el merge)

`docs/qa/evidence/hr-monitor-evidence-by-reference-main-20261119/equivalencia-blob-main-develop.txt`

- De las 22 rutas de producto y scripts del commit, **20 son blob-idénticas** a `origin/develop`.
- Solo dos derivan: `apps/api/src/modules/hr/service.js` y `package.json`.
- La deriva no es del monitor: comparando el **contenido** de los hunks (no los números de línea, que corren por otros frentes), el replay sobre `main` produce `4e0577d297c4e2b0` con 185 líneas `+/-`, y el commit certificado sobre `develop` produce `4e0577d297c4e2b0` con las mismas 185 líneas. `package.json` repite el mismo hash (`4cabe201a6b85194`).
- La deriva residual de `service.js` (66/230 líneas) y de `package.json` (3/5) corresponde a liquidación, prestaciones, vínculo usuario-empleado y scripts de Comercio/Transporte que `main` nunca tuvo.

Consecuencia: el código que se despliega en producción en la región del monitor **es byte por byte el que ya se midió en QA**.

## 3. Suites ejecutadas sobre el candidato de main

| Suite | Comando | Resultado |
|---|---|---|
| API completa | `cd apps/api && DISABLE_REDIS=true node --test "test/*.test.js"` | 1158 pruebas · 1153 pass · **2 fail** · 3 skip |
| Web completa | `cd apps/web && node --test "test/*.test.js" "test/*.test.mjs"` | 820 pruebas · 820 pass · **0 fail** |
| HR objetivo | `node --test "test/hr-*.test.js"` / `"test/hr-*.test.mjs"` | API 266/266 · Web 143/143 |
| Seis archivos de contrato del monitor | `hr-monitor-evidence-columns`, `hr-monitor-evidence-demand`, `hr-marking-concurrency`, `hr-operations-map-contract`, `hr-evidence-storage-gate`, `hr-gps-metadata-projection` | 41/41 |
| Typecheck web | `npm run typecheck` | exit 0, sin errores |
| Selftest del gate de presupuesto | `npm run certify:hr-monitor-budget:selftest` | aprobado: el gate falla con binario inline, latencia o volumen fuera de presupuesto y pasa con el aviso por referencia |

Atribución de los dos rojos del API: son exactamente los dos de deuda ERP que ya estaban en la baseline de `main` (`accounting-routes-contract.test.js:71` y `transport-tms-foundation.test.js:130`, documentados en `docs/qa/evidence/hr-marking-gate-main-20261117/api-suite-base-main.txt`: 1128 pruebas, 2 fail). El candidato suma 30 pruebas y no suma fallas. En Web no hay rojo: el artefacto de junction de la ronda anterior no se reprodujo y el rojo de `command-palette-module-functions` que sí existe en `develop` tampoco existe en `main`.

Dato relevante del contraste entre ramas: `hr-marking-concurrency.test.js:224` exige 0 `pg_advisory_xact_lock` y 4 `acquireBoundedScopeLocks(` en el `service.js` de Talento Humano. Medido por rama: `desarrollo` 0/4, **`develop` 6/4**, `main` 0/4, candidato 0/4. Es decir, la deuda de concurrencia es del frente de liquidación en `develop`; la pierna main no la arrastra y su suite sale verde.

## 4. Estado del ambiente, medido antes de empujar

`docs/qa/evidence/hr-monitor-evidence-by-reference-main-20261119/ambiente-producto-antes.txt`

- Producción corre `45069dd980c1`, todavía sin el corte.
- QA corre `9c82fca1a392`, con el corte; es el build contra el que se ejecutaron `hr-monitor-evidence-demand-qa.js` (10/10) y `hr-monitor-byte-budget.js` (presupuesto verde: 1044 ms / 794 ms / 524 ms).
- `apexos-api-prod` está conectado a `3dwinVelez/APEXOS`, así que el push a `main` es el disparador del despliegue, igual que el merge a `develop` disparó el de QA.
- El lector de evidencia se activa con `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (`evidenceStorage.js:32-34`); ambas variables existen en los dos ambientes. **No hace falta tocar ninguna variable para que la corrección opere en producción.**
- `HR_EVIDENCE_STORAGE_ENABLED` está ausente en QA y en PROD. Solo gobierna la *escritura* (`evidenceStorage.js:28-30`): sin ella las marcaciones nuevas siguen guardando el base64 inline, igual que hoy. Su cambio es modificación de infraestructura y pide autorización explícita independiente; se reporta como pendiente con su comando, no se ejecuta.

## 5. Qué se exige después del despliegue

1. `/health` de `apexos-api-prod` reportando el commit de `main` con el corte.
2. Gate de presupuesto ejecutado contra producción en el día real del horario 336: el listado debe anunciar referencias (sin binarios inline) y la apertura debe bajar los bytes desde Storage o desde la columna inline según el estado de la fila.
3. Registro de la medición como `docs/qa/evidence/hr-monitor-evidence-by-reference-main-20261119/produccion-despues-*.json` en un commit documental posterior, siguiendo el patrón de la ronda `45069dd9`.

Mientras el lector no esté desplegado y medido en producción no se ejecuta la purga C.2 (retirar el base64 inline de las filas), aunque el rescate ya esté completo en los dos ambientes (`rescue-prod-execute`: 124 subidas verificadas, 308 ya rescatadas, 12 sin base64 real, 0 errores).
