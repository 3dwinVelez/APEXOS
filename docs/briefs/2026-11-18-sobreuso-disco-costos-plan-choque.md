# Brief — Plan de choque: sobreuso de disco local y costos de Supabase

- **ID**: `2026-11-18-sobreuso-disco-costos-plan-choque`
- **Fecha**: `2026-11-18`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: «necesito hacer una verificaicon de consumo ya que veo que los costos de supabase y el uso de la maquina ah estado al tope […] solo tengo 1 cliente en operacion […] ya supere los 250 gb que tiene disponible mi maquina […] realiza un analisis y diagnostico» + «construir un plan de choque para depurar cualquier daño qe este incrementando el costo o sobre uso de la maquina con basura» + «proced econ el plan con toda mi autorizaicon» + «docker esta abierto en este momento, valida y continua con la intervencion».

## 1. Objetivo

Eliminar la basura que inflaba el disco del puesto y el almacenamiento de Supabase sin destruir evidencia operativa: liberar worktrees muertas, rescatar la evidencia de marcación incrustada en la base hacia Storage (verificada por SHA-256), dejar escrita la barrera que impide que vuelvan a entrar base64 a la base, y dejar la purga de producción lista pero deliberadamente aplazada hasta que el lector de Storage esté desplegado. Con un solo cliente en operación, el crecimiento no era uso legítimo: eran bytes duplicados entre `jsonb` y el historial de payloads por pantalla.

## 2. Alcance exacto

Commit de código y evidencia: `2f8907af` (publicado en `origin/desarrollo`). Commit de cierre documental: este brief, los `SKILL.md`, `agents/registry.json`, `agents/CHANGELOG.md` y el resguardo de artefactos huérfanos de las intervenciones `base-datos-cargas-pantallas` y `base-datos-auditoria-intervencion`.

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/hr/evidenceStorage.js` | Capa Storage: subida previa a la transacción, resolución de referencias (bandera de rescate → legado → `storage_path` declarado), descarga como data URL, saneado de claves no-ASCII. |
| `M` | `apps/api/src/modules/hr/service.js` | `getMonitorEvidence` recupera bytes desde Storage para filas purgadas; el lote anuncia `has_base64_data`/`storage_path` sin arrastrar binarios; escritores de actividad/preoperacional y `createPunch` gated por `writeEnabled()`. |
| `M` | `apps/api/src/modules/hr/mobile-identity.js` | La selfie ya no necesita bytes inline para anunciarse: `available` acepta `storage_path` o bandera de rescate; `identityEvidenceOf` emite referencia cuando no hay contenido inline. |
| `M` | `apps/api/src/modules/hr/punchEvidence.js` | El lector canónico emite items solo-referencia (`storage_path`) sin bytes y deduplica por `storage:<ruta>`; `punchEvidenceCount` cuenta la referencia una sola vez y conserva las cabeceras huérfanas. |
| `M` | `apps/api/src/modules/hr/punchEvidence.d.ts` | `PunchPhoto` declara `storage_path?: string`. |
| `A` | `apps/api/test/hr-evidence-storage-gate.test.js` | Gate del contrato: independencia de banderas, precedencia de rutas, 503 en subida fallida, referencias anunciadas sin bytes y recuperación de fila rescatada+purgada con red stubbeada (7/7). |
| `M` | `apps/web/lib/hrScheduleMonitor.ts` | El contrato del cliente pasa `storage_path` y ya no asume bytes en el lote. |
| `M` | `apps/web/app/dashboard/talento-humano/reportes/page.tsx` | La línea de tiempo del reporte pide los bytes por `id` + `source` cuando el item solo trae referencia. |
| `M` | `apps/web/components/hr/HrTimelineEvidence.tsx` | Ídem en la evidencia del timeline: announce sin binario, fetch perezoso por evento. |
| `A` | `scripts/hr-rescue-inline-base64-to-storage.js` | Rescate C.1: índice ligero sin columna TOAST + lectura de bytes fila por fila, verificación SHA-256 post-subida, banderas por componente, dry-run/execute, guard de project ref y evidencia JSON. |
| `A` | `docs/qa/evidence/hr-evidence-rescue-20261118/*` | 4 reportes JSON + 2 logs de las corridas QA y PROD (2026-11-18). |
| `A` | `docs/briefs/2026-11-18-sobreuso-disco-costos-plan-choque.md` | Este documento. |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` + `apexos-seguridad` + `apexos-frontend` + `apexos-qa` + `apexos-db-nube` + `apexos-git-guardian` + `apexos-brief` + `equipo-apexos` (y sus espejos `agents/**`) | Controles nuevos de la Fase C.1/D y del incidente del árbol, con bump semver. |
| `M` | `agents/registry.json` | Versiones, `updated_at`, `sha256` y los ocho controles nuevos. |
| `M` | `agents/CHANGELOG.md` | Entrada `2026-11-18` con las cinco fases, el incidente y los pendientes con su puerta. |

### Módulos (`change_intent.modules`)

- `hr-marcaciones`
- `hr-evidencia-storage`
- `gobernanza-agentes`

### Borrados autorizados (`allowed_deletions`)

- Solo worktrees de `%TEMP%` del puesto local (16 directorias, ≈6 GB): `APEXOS-{lobby-v4,qa-review,postdeploy,uiux2,watch,ship-20261106,corte-main-20261107,comercio-cand,ux-cand,ux-r2,ux-promote-develop,ux-promote-main,preqa,ci-gate,ci-gate2,pr89}`. Ninguna contiene commits inalcanzables salvo la excepción declarada abajo.
- Ningún borrado en la nube: la purga C.2 no se ejecutó en este corte (sección 3).

## 3. Fuera de alcance

- **Purga del base64 en producción (C.2).** Aplicada por diseño más adelante: hasta que el lector de `evidenceStorage` esté desplegado en QA/PROD, borrar los inline dejaría al cliente en vivo sin su historial de evidencia. El rescate ya marcó las filas; la purga espera despliegue y autorización independiente.
- **`VACUUM FULL` de `TimePunch`/`ActivityEvidence`.** Solo tiene sentido después de C.2.
- **Promociones `develop`/`main` y cualquier despliegue.** La autorización permanente cubre únicamente `git push origin desarrollo`.
- **Worktrees conservadas:** `APEXOS-candidate` (contiene los commits `8fcbc738` del prototipo Comercio que no existen en ninguna remota — borrarla perdería trabajo), `APEXOS-comercio-develop`, `APEXOS-comercio-main`, y los datos `%TEMP%\apexos-pg-data`, `%TEMP%\apexos-railway-cfg`, `%TEMP%\apexos-railway-link`, `%TEMP%\qoder-cli`.
- **Artefactos huérfanos de otras intervenciones, declarados y no absorbidos.** Tras el barrido del árbol quedaron sin versionar ~103 MB en `docs/qa/evidence/base-datos-auditoria-20261115/` (65 archivos, dos instantáneos de esquema de 15 MB), `base-datos-atribucion-20261117/`, nueve directorios `screen-loading-*` de `base-datos-cargas-pantallas`, el brief `2026-11-15-base-datos-auditoria-intervencion.md` (156 KB) y el guion `scripts/align-databases.js`. Ninguno se cita desde documentación ya publicada y ninguno pertenece al alcance de este corte, así que **no** entran en estos commits: esta intervención existe precisamente para dejar de pagar almacenamiento inflado, y meter 103 MB de volcados generados sin referencia sería contradecir su propio objetivo. Quedan a disposición de sus dueños (`apexos-qa`/`apexos-db-nube` para la evidencia de carga y auditoría; la decisión que corresponde es conservar los resúmenes pequeños y regenerar los volcados con el comando anotado, no versionarlos). Se declaran aquí para que la próxima sesión sepa que existen y de quién son, no para que esta los publique.
- Retocar la deuda de 6 orígenes basura QA y los demás pendientes de Transporte: otras intervenciones con dueños distintos.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre. Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Escrituras en la nube limitadas a subir objetos al bucket privado `operational-evidence` y marcar banderas de rescate en `metadata`; ninguna fila borrada ni modificada en su contenido operativo.
- Guards de project ref en todo script de nube (`jbirkghkekuifgfsgquq` QA, `jzbwzmkidfthknsohhnr` PROD); la service role nunca se imprime ni viaja en evidencia.
- Aislamiento multi-tenant intacto: toda resolución de referencia valida el `tenant_id` de la fila antes de tocar Storage (404 sin lectura para foráneos, fijado por el gate).
- Sin secretos ni credenciales en el brief ni en el diff (los env files de `config/` no se conmutan; los JSON de evidencia verificados sin patrones de credencial).
- Comentarios de código sin tildes; prosa visible y documentación en español correcto.

## 5. Criterios de aceptación

1. `cd apps/api && node --test test/hr-evidence-storage-gate.test.js` → 7/7.
2. `cd apps/api && node --test test/hr-*.test.js` → 256/256, 0 fallos (incluye `hr-punch-mobile-evidence` 32/32 con el lote sin bytes).
3. `cd apps/web && node --experimental-strip-types --test test/hr-schedule-monitor.test.mjs test/hr-punch-mobile-evidence.test.mjs test/hr-monitor-refresh.test.mjs test/hr-monitor-identity-selfie.test.mjs test/hr-report-punch-selfie.test.mjs test/hr-marking-lateness-selfie.test.mjs` → 37/37. La barrida completa del dominio, `node --experimental-strip-types --test test/hr-*.test.mjs` → 136/136.
4. `cd apps/web && npx tsc -p tsconfig.typecheck.json --noEmit` → exit 0.
5. Rescate PROD (`node scripts/hr-rescue-inline-base64-to-storage.js --env prod --execute`): resumen `omitido (ya rescatado) 308 · subido y verificado 124 · sin base64 real 12`, filas marcadas 124, errores 0, evidencia JSON escrita. QA: 66 filas marcadas, 0 errores.
6. Disco del puesto: `df` antes 41 GB libres → después ≈47 GB libres tras desmontar las 16 worktrees.
7. `npm run agents:sync && npm run agents:check && npm run agents:preflight && npm run agents:coverage` → los cuatro en verde sobre las rutas de la sección 2.

## 6. Evidencia y certificación exigida

- Pruebas: secciones 5.1–5.4 (salidas de `node --test` y `tsc`, archivadas en esta intervención).
- Rescate: `docs/qa/evidence/hr-evidence-rescue-20261118/` (4 JSON + `rescue-prod-rerun.log` con los dos abortos 57014 y `rescue-prod-rerun2.log` con la corrida final limpia).
- `certification_status` esperado: `local_passed_qa_pending` — la certificación de navegador y la corrida contra el build desplegado quedan pendientes del despliegue del lector; sin ese despliegue no se certifica `qa_approved` ni se purga.

## 7. Capacidades protegidas

- `evidencia-marcacion-tenant` — el gate fija 404 entre tenants sin leer Storage y 404 limpio cuando el objeto ya no existe (`hr-evidence-storage-gate.test.js`).
- `marcacion-nunca-inline-sin-almacen` — subida fallida ⇒ 503 `STORAGE_UPLOAD_FAILED` y la marcación no se crea (gate + `preparePunchEvidence`).
- `lote-monitor-sin-binarios` — `JSON.stringify(batch)` sin `;base64,` y contadores por referencia (`hr-punch-mobile-evidence.test.js`).
- `lectura-historica-sin-despliegue-nuevo` — lector activo solo con credenciales de nube, independiente del flag de escritura (gate de banderas).

## 8. Riesgos y rollback

- Riesgo: el despliegue del lector se demora y la purga queda aplazada con el base64 ocupando disco en la nube → Mitigación: el rescate ya verificó SHA-256 de cada objeto; la purga es un paso mecánico pendiente de despliegue, no de investigación. Rollback: revert de `2f8907af` (los objetos de Storage quedan huérfanos pero inofensivos; el comportamiento inline viejo no se pierde hasta C.2).
- Riesgo: escritura nueva con flag activo en un ambiente sin bucket → Mitigación: `HR_EVIDENCE_STORAGE_ENABLED` no se enciende en este corte; sin la variable todo sigue igual que antes. Rollback: quitar la variable.
- Riesgo: otra pérdida del árbol de trabajo (sección 9.2) → Mitigación: checkpoint inmediato: el código se commitió y publicó el mismo día que se recuperó.

## 9. Supuestos, incidentes y preguntas abiertas

### 9.1 Timeout 57014 en el rescate de producción

Las dos primeras corridas del rescate PROD murieron al pagarinar `ActivityEvidence` con 100 filas que arrastraban `base64_data` de hasta 2,5 MB: PostgREST excedió el statement timeout de 5 s. Corregido con índice ligero (select sin columna TOAST) + fetch de bytes fila por fila solo para candidatas sin bandera de rescate. La corrida final cerró 124/124 subidos y verificados, 0 errores. Ambas corridas abortadas quedan en `rescue-prod-rerun.log` para que nadie vuelva a "intentar de nuevo igual".

### 9.2 Barrido inexplicado del árbol de trabajo (incidente, 2026-11-18)

A mitad de la intervención, 1.161 archivos rastreados bajo `apps/` y `packages/` desaparecieron del disco — misma firma que las worktrees de `%TEMP%` que se encontraron vacías al inicio. Ningún comando de esta sesión apuntó a la raíz del repositorio; la causa quedó sin identificar y sigue siendo un riesgo vivo. Recuperación: `git restore -- apps packages` para la baseline, replay del transcript de la operación por operación con normalización CRLF→LF y casamiento exacto (una sola ambigüedad, resuelta a mano), reescritura de los dos archivos nunca commiteados (`evidenceStorage.js` y su gate). Reconstruido y en verde el mismo día, se publicó de inmediato (`2f8907af`) en lugar de esperar el cierre de la Fase E. Lección fijada como control de `apexos-git-guardian` y `equipo-apexos`: lo que no está commiteado, no existe.

### 9.3 Lo que ningún recurso de este puesto puede construir

- Gráfica real de consumo Supabase por período (requiere acceso al dashboard de la organización; desde el puesto solo se miden tamaños por tabla y bucket).
- El despliegue del lector en QA/PROD que destraba la purga C.2 (autorización de promoción + deploy, apartes de este corte).

## 10. Autorizaciones requeridas

- [x] «proced econ el plan con toda mi autorizaicon» — cubre A (liberación de worktrees locales), B (medición), C.1 (rescate a Storage con verificación) y D (barrera de escritura + lector) sobre `desarrollo`.
- [ ] C.2 purga del base64 en QA y producción — pendiente de despliegue del lector y de autorización explícita en su momento.
- [ ] Promoción a `develop` del paquete Fase D — autorización explícita e independiente.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "<22 rutas de la sección 2>"` → veredicto `OK`, sin `INTEGRAR_REMOTO` ni `CONFLICTO`. Dueños ruteados: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`, `apexos-brief`, `apexos-git-guardian`; además `apexos-db-nube`, bumped por el rescate C.1 y las banderas de purga en la nube aunque su ruta (`apps/api/prisma/**`) no haya cambiado.
- **Agentes a actualizar**:
  - `apexos-backend` 2.15.0 → 2.16.0 — control `evidencia-storage-antes-de-transaccion`.
  - `apexos-seguridad` 2.27.0 → 2.28.0 — control `almacen-privado-rutas-saneadas`.
  - `apexos-frontend` 2.31.0 → 2.32.0 — control `evidencia-perezosa-por-referencia`.
  - `apexos-qa` 2.69.0 → 2.70.0 — control `purga-se-certifica-con-lector-stubbeado`.
  - `apexos-db-nube` 2.6.0 → 2.7.0 — control `rescate-jsonb-indice-ligero-sha256`.
  - `apexos-git-guardian` 2.18.0 → 2.19.2 — control `checkpoint-anti-barrido`.
  - `equipo-apexos` 2.41.0 → 2.42.1 — control `arbol-barrido-se-reconstruye-y-se-publica`.
  - `apexos-brief` 2.57.0 → 2.58.0 — control `brief-post-checkpoint-narra-incidente-y-aplazamientos`.
- **Registro**: `agents/registry.json` con `version`, `updated_at` y `sha256` regenerados por `agents:sync`; entrada `2026-11-18` en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<rutas de la sección 2>"` → verde antes del commit de cierre.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → pruebas de la sección 5 → commit → push.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`) · sync/check/preflight/coverage y `test:agents` 46/46 el 2026-11-18
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit (brief + 8 `SKILL.md` + `registry.json` + `CHANGELOG.md` + 8 espejos `agents/**`)
