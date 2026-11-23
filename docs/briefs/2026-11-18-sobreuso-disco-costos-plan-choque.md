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
- [ ] Encender `HR_EVIDENCE_STORAGE_ENABLED=true` en `config/production.env` y `config/qa.env` — medido el 2026-11-23: la variable no existe en ningún env del repo, así que la barrera de escritura está apagada por configuración y el base64 sigue entrando (125 filas nuevas, 194 MB entre el 19 y el 23 de noviembre). Sin este paso, promover la Fase D no cierra la fuga.
- [ ] Fase F (sección 12) — es código de `desarrollo` y no pide autorización nueva; su beneficio en campo queda sujeto a los tres puntos anteriores.

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

**Cierre del anexo F (2026-11-23), en su propio commit**: cinco dueños ruteados por `agents:preflight -- --paths` (veredicto `OK_CON_ADVERTENCIAS`) — `apexos-frontend`, `apexos-qa`, `apexos-brief`, `equipo-apexos`, `apexos-git-guardian`. El inventario efectivamente publicado es el de 12.3, no el de la sección 2 original: dos de sus rutas (`lib/api.ts`, `reportes/page.tsx`) se cancelaron por medición y `scripts/certifications/hr-map-inline-evidence-artifact-local.js` entró nuevo.

## 12. Anexo de evaluación (2026-11-23): carga de imágenes bajo demanda en el monitor de mallas

- **Prompt crudo del anexo**: «podríamos evaluar que en el monitor de mallas que claramente es el que está pesado, dejar bajo demanda la carga de las imágenes y solo mostrar de manera eficiente las marcaciones para que el monitor no sufra al cargarse y que solo bajo petición abra la imagen que el usuario desee visualizar… para incluirlo en el plan de cierre de esta novedad».
- **Veredicto**: la arquitectura que el dueño propone **ya está escrita y desplegada en producción**; no es un trabajo nuevo. El alivio que se espera de ella —que el monitor deje de sufrir al cargarse— **no lo produce**: medido, el monitor de mallas con el bajo demanda ya certificado entrega 0-7 KB por listado, y lo que queda de latencia es el piso de `auth` (que vive en `desarrollo` sin promocionar) y la descompresión del TOAST (que quita C.2). La Fase F se reduce entonces a dos cosas que sí valen la firma: cerrar la mochila de 194 MB del respaldo de asistencia (modo degradado) y retirar código muerto que finge ser una filtración.

### 12.0bis Respuesta a la pregunta de valor («¿realmente serviría, o el precio no cambiaría?»')

No serviría para el monitor: **el precio del monitor no cambiaría**. Tres medidas lo dicen:

1. El bajo demanda no es deuda pendiente: `956f2d239158`, desplegado en Producción el 2026-11-19, pasó los tres listados del monitor de 44,4 MB a 0-7 KB con cero binarios inline, y la proyección ligera aparece ejecutándose en `pg_stat_statements` (`1.911 llamadas`, `media 1.871 ms`). Nada de la Fase F toca ese camino.
2. La línea del mapa que parecía una filtración está muerta: `metadata.evidence` no existe en ninguna de las 2.620 filas de `TimePunch` en producción. Quitarla ordena el código y no ahorra un byte.
3. Lo que el dueño percibe como «el monitor sufre» se descompone en dos costos ajenos al binario: el piso de autenticación (arreglado en `19df3ca2`, ausente de `develop` y `main`) y el `detoast` de 1.9 s (solo C.2). Ninguno se arregla con carga bajo demanda.

Valor real de la Fase F, dicho sin inflarla: **seguro en modo degradado** (194 MB que solo viajan cuando el API falla, y que entonces agravan la falla) + **higiene de dos archivos**. Es una intervención de una tarde, no de un ciclo. El orden que sí mueve la aguja, con su costo:

| Prioridad | Acción | Qué baja | Puerta |
|---|---|---|---|
| 1 | Prender `HR_EVIDENCE_STORAGE_ENABLED=true` | El chorro nuevo: 40-74 MB/día de base64 a la base | Config de ambiente + deploy (autorización) |
| 2 | Promover y desplegar `19df3ca2` + Fase D | El piso de `auth` por petición, que es lo que se siente al abrir el monitor | Autorización de promoción |
| 3 | Rescate de las 125 filas nuevas y purga C.2 | Los 1.9 s de `detoast` y ~194 MB de la base | Autorización de purga |
| 4 | Fase F (F.1 guard del respaldo, F.2/F.3 limpieza) | 194 MB del viaje degradado de Reportes | Ninguna: es `desarrollo` |

### 12.1 Lo que ya está hecho, medido en el código vigente

| Pieza | Dónde | Qué garantiza |
|---|---|---|
| El listado del monitor no trae bytes | `apps/web/lib/hrScheduleMonitor.ts:60-71` (`scheduleMonitorPunchEvidenceSummary`) | Anuncia `has_base64_data` / `storage_path` y descarta el contenido. |
| El lote por ruta es un índice | `apps/api/src/modules/hr/service.js:306-340` (`getMonitorEvidenceBatch`) | Dice qué evidencia existe y cuánto pesa, nunca arrastra el archivo. |
| El archivo se pide uno por uno | `apps/web/app/dashboard/talento-humano/rutas/page.tsx:636-655` (`loadTimelineEvidence`) | `GET /api/v1/hr/monitor-evidence/:source/:id` por evento. |
| Solo se pide lo visible | `rutas/page.tsx:991-999` | El efecto recorre `visibleTimeline`, no el histórico completo. |
| Lectura a la base ya proyectada | `apps/api/src/modules/hr/monitorEvidenceRows.js:134-143,256-278,289-302` | Ni `TimePunch` ni `GpsPing` entregan el binario en la lectura del monitor. |
| El monitor no cae al respaldo Supabase | `apps/web/lib/hrScheduleMonitor.ts:3-8` + `apps/web/lib/api.ts:4700,4745` | `operations-map`, `routes`, `event-summaries` y `monitor-evidence` están excluidos del fallback, así que la mochila REST de 106 MB no es camino del monitor. |
| El respaldo por referencia es prueba fijada | `apps/web/test/hr-monitor-identity-selfie.test.mjs` | Asevera que la pantalla **no** consume el lote de ruta. |

Producción responde hoy con el build `4be0dd5a3262`, que ya contiene el monitor por referencia: en `pg_stat_statements` la variante ligera registra 1.911 ejecuciones a 1.871 ms de media frente a las 4.271 a 3.918 ms de la variante antigua. El bajo demanda y la proyección **ya recortaron el tiempo casi a la mitad**; el piso de 1.9 s que queda es descomprimir el TOAST para poder recortarlo, y eso solo desaparece cuando la columna deje de tener bytes (C.2).

### 12.2 Las dos filtraciones que el anexo encontró, re-medidas el mismo día

1. **Reporte de asistencia por respaldo (AFIRMACIÓN REFUTADA POR MEDICIÓN, ver 12.5).** `apps/web/lib/api.ts:2534-2562` pide `/rest/v1/time_punches?select=...,extra_evidence,metadata&limit=5000` y re-emite `metadata` crudo (`api.ts:2550`, `api.ts:2750`). La mochila de 194.3 MB se midió sobre `TimePunch`, que es la tabla que consume el API; la ruta de respaldo golpea **otra tabla distinta**, `time_punches`, y allí la ventana de 30 días está vacía en las dos nubes. La pantalla lee ese inline en `reportes/page.tsx:152-157` (`punchSelfie`). A diferencia del monitor, esta lectura **no** está en la lista de caminos que prohíben el respaldo (`hrScheduleMonitor.ts:3-8`), así que el alcance condicional sigue siendo cierto: el respaldo solo se invoca cuando el API responde `!ok` (`api.ts:4745`). Lo que cambia es el signo del daño: no agrava la falla con 194 MB, la disimula con un reporte vacío.
2. **Mapa del día (MUERTO, no es filtración).** `apps/web/app/dashboard/talento-humano/mapa/page.tsx:693` arma `<Image src>` con `selectedMark.metadata.evidence[0].base64_data`. Medido en producción sobre las 2.623 filas de `TimePunch` y sobre las 1.380 del tenant en 30 días: **la rama `metadata.evidence` existe en 0 filas**, y la única rama de `metadata` que lleva binario es `identity_photo` (126 filas); `metadata.photo` y `metadata.extra_evidence` están en 0. El `src` de esa línea nunca se pintó ni se pinta: es código muerto sobre un estado que el producto no escribe. Su valor es de limpieza, no de costo. **Ejecutado el 2026-11-23**, con su guard y su sonda de artefacto (ver 12.5).

### 12.2bis Lo que sí hace sufrir al monitor, medido

- **El piso de autenticación, que no está desplegado.** `19df3ca2` (2026-11-19, `perf(security): la decisión de autorización cabe en una sentencia y su piso baja 4x`) mete la decisión de autorización en una sola sentencia (`apps/api/src/security/authorizationState.js:87-96`) y bajó el piso medido de 572 ms a 144 ms en producción y de 2.009 ms a 532 ms en QA. Verificado contra las remotas: ese commit está en `origin/desarrollo` y **NO** en `origin/develop` ni en `origin/main`. Por eso Producción sigue pagando el piso viejo de `auth` de 2.2-3.5 s por petición autenticada, que el monitor multiplica porque son varias peticiones por apertura más el sondeo cada 30 s (`rutas/page.tsx:53`).
- **La descompresión del TOAST, que solo quita la purga.** Con la proyección ligera vigente, la lectura del monitor cuesta 1.871 ms de media (1.911 ejecuciones) frente a 3.918 ms de la variante antigua (4.271). La proyección recorta el tiempo a la mitad pero no lo lleva a cero: hay que inflar el `jsonb` para poder recortarlo. El piso que queda se va con C.2, no con el bajo demanda.

### 12.3 Alcance de la Fase F (inventario A/M exacto, cerrado el 2026-11-23)

El inventario original pedía cuatro archivos. La medición de 12.5 canceló dos de ellos antes de escribir código, así que el alcance publicado es este:

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/dashboard/talento-humano/mapa/page.tsx` | Se retira el bloque muerto de `:693`: en producción no existe una sola fila con `metadata.evidence`, así que no hay pintura que conservar. La foto del detalle queda en `HrTimelineEvidence` (`:694`), que ya es el camino por referencia. |
| `A` | `apps/web/test/hr-map-no-inline-evidence.test.mjs` | Guard estructural del retiro, con control positivo: la línea quitada se re-cuelga como fixture y el detector tiene que marcarla; un fuente limpio no puede dar nada; el `import { Image }` no queda huérfano. |
| `A` | `scripts/certifications/hr-map-inline-evidence-artifact-local.js` | Sonda de artefacto servido: el alt retirado no puede aparecer en ninguno de los bundles de `.next/static` ni `.next/server`, y la pantalla del mapa sí aparece. Lleva `--selftest` con dos corpora sintéticos y aborta si el corpus está vacío. |
| `M` | `scripts/certifications/hr-monitor-byte-budget.js` | El ambiente pasa a ser obligatorio: sin `--env-file=config/<ambiente>.env` el certificador aborta en vez de elegir QA por default. Se agrega el control rojo correspondiente al `--selftest`. **Ya publicado fuera de este commit**: la sesión paralela lo barrió en `56b0c097` con su evidencia (`selftest-6-casos.txt`, `rojo-provocado-sin-env-file.txt`), así que no forma parte del inventario que se cierra aquí; se registra porque es la puerta que mide la Fase C. |
| `M` | `docs/briefs/2026-11-18-sobreuso-disco-costos-plan-choque.md` | Este anexo: refutación de F.1, corte de cierre e inventario real. |

- **Cancelado por medición (no se implementó)**: el `M` de `apps/web/lib/api.ts` (proyección por referencia del respaldo de `hr/attendance`) y el `M` de `reportes/page.tsx` (`punchSelfie` consumiendo referencia). Las dos premisas decían «194 MB viajando en modo degradado»; la tabla que el respaldo consulta está vacía en la ventana activa (12.5), así que escribir esa proyección habría añadido código muerto encima de un almacén muerto. El nombre `hr-fallback-no-inline-evidence.test.mjs` desaparece con ellas; el guard que quedó es `hr-map-no-inline-evidence.test.mjs`, que protege lo que sí cambió.
- **Fuera de alcance de F**: miniaturas reales (requiere un pipeline de redimensión que no existe y no se inventa aquí), el lector bajo demanda del monitor (ya está, sección 12.1) y la purga de la base (es C.2, con su propia compuerta de autorización).
- **Criterios de aceptación observables, con su resultado**:
  1. ~~`mb_en_la_mochila` del respaldo pasa de 194.3 MB a < 5 MB~~. **No aplica**: la mochila del respaldo ya era 0.0 MB por estar la tabla vacía. El criterio se reemplazó por el hallazgo nuevo de 12.5 y su dueño.
  2. `cd apps/web && node --test test/hr-map-no-inline-evidence.test.mjs` → 4/4 con el control positivo demostrado, y `node --test test/hr-*.test.mjs` → 166/166. Verificado el 2026-11-23.
  3. `node scripts/certifications/hr-map-inline-evidence-artifact-local.js --selftest` → SELFTEST OK (3/3), y sobre el build `cy3GbaZZL0HPF3JcOKYEu` → 4/4 con 1.203 archivos leídos, 0 coincidencias del alt retirado y el marcador de la pantalla presente en los chunks. Verificado el 2026-11-23.
  4. `npx tsc -p tsconfig.typecheck.json --noEmit` exit 0 y `eslint` de los dos archivos con 0 errores (queda un aviso `react-hooks/exhaustive-deps` en `mapa/page.tsx:431`, anterior al retiro y ajeno a la línea cambiada). Verificado el 2026-11-23.
  5. `npm run agents:sync && npm run agents:check && npm run agents:preflight && npm run agents:coverage -- --paths "<rutas de la sección 2>"` en verde. Verificado el 2026-11-23.
  - **Limitación declarada**: no hubo certificación en navegador de la pantalla del mapa. Lo verificado es el fuente y el artefacto servido; el criterio 3 del plan original («la foto aparece al hacer clic, `HrTimelineEvidence` muestra el spinner») queda sin ejecutar en navegador y se declara como tal, no se infiere del build.
- **Riesgo y rollback**: al retirar el `src` inline no se tocó ningún otro camino de evidencia; el panel ya mostraba la foto por referencia en `:694` y esa línea sigue intacta, medida en el artefacto. El rollback es un revert puntual del archivo de pantalla, sin tocar la base ni el contrato del monitor.
- **Efecto esperado, dicho con honestidad**: F no quita transferencia (la mochila del respaldo estaba en 0 por tabla vacía) y no quita los 1.9 s de descompresión. Quita código muerto que fingía ser una filtración y deja constancia de un defecto distinto: el reporte degradado lee un almacén que nadie escribe. Para que «el monitor no sufra al cargarse» hacen falta C.2 y la promoción/despliegue de `19df3ca2`, ninguna de las dos es esta fase.

### 12.4 Autorizaciones y lectura de panel

- F es trabajo de `desarrollo` y no pide autorización nueva. Su beneficio en campo queda sujeto a las tres casillas abiertas de la sección 10 (promoción + despliegue, bandera `HR_EVIDENCE_STORAGE_ENABLED` y purga C.2).
- Nota de consumo declarada: `pg_stat_statements` registra 120 lecturas REST `SELECT id, tenant_id, metadata, extra_evidence FROM "TimePunch" ORDER BY id ASC LIMIT 1 OFFSET n`, sin filtro de tenant y con ≈2.518 bloques (≈20 MB) por lectura. Es navegación fila por fila de la tabla (panel de Supabase o inspección manual), no el monitor ni ninguna ruta del cliente; se deja constancia porque **hojear `TimePunch` en el panel cuesta ~20 MB por fila** mientras el binario esté en la tabla. Otra vez: el argumento a favor de C.2.

### 12.5 Corte de cierre de la Fase F (2026-11-23): la refutación que canceló F.1

La Fase F se escribió sobre una cifra medida en la tabla equivocada. El respaldo del reporte de asistencia no consulta `TimePunch`: consulta `/rest/v1/time_punches`, y esa es otra tabla base (no es vista), con otras columnas (`company_id`, `punch_date`, `user_id`). Medida de solo lectura sobre el pooler de sesión, declarando el project ref esperado en cada corrida (`node "$TEMP/db-inspect-20261123-k.js" <produccion|qa>`, ventana de 30 días, `pg_column_size(metadata) + pg_column_size(extra_evidence)`):

| Ambiente | Almacén | Filas totales | Último dato | Ventana 30 días | Mochila | Selfie inline |
|---|---|---|---|---|---|---|
| Producción (`jzbwzmkidfthknsohhnr`) | `time_punches` (REST, el que lee el respaldo) | 25 | 2026-07-14 | **0 filas** | **0,0 MB** | 0 |
| Producción | `TimePunch` (Prisma, el que lee el API) | 2.623 | 2026-11-23 | 1.380 filas | 196,2 MB | 126 |
| QA (`jbirkghkekuifgfsgquq`) | `time_punches` | 229 | 2026-05-23 | **0 filas** | **0,0 MB** | 0 |
| QA | `TimePunch` | 963 | 2026-11-23 | 110 filas | 0,2 MB | 2 |

Tres consecuencias, en el orden en que se aceptaron:

1. **F.1 se cancela por medición, no por pereza.** El plan decía «dejar de seleccionar binarios en el respaldo para bajar 194,3 MB». El respaldo selecciona binarios de una tabla vacía: no hay 194 MB que bajar, y la proyección por referencia habría sido código nuevo sobre un almacén muerto. Se retiran del inventario los dos `M` (`lib/api.ts`, `reportes/page.tsx`) y el guard proyectado; queda lo que sí estaba vivo (12.3).
2. **El chorro nuevo sigue abierto y su número subió.** `TimePunch` pasó de 125 filas con selfie inline (corte del 2026-11-23 por la mañana, §10) a **126** con 196,2 MB de jsonb en 30 días. Es el mismo defecto medido dos veces el mismo día: la barrera de la Fase D sigue apagada porque `HR_EVIDENCE_STORAGE_ENABLED` no existe en ningún ambiente. No es una predicción, es una fila más desde la última vez que se miró.
3. **Aparece un defecto distinto y más incómodo que el que se buscaba.** Si el API cae o congestiona a 503, el reporte de asistencia entra en modo degradado, consulta `time_punches`, recibe **cero filas** y pinta un reporte vacío sin decir que está vacío: `.catch(() => [])` en `reportes/page.tsx:496` convierte la falla en un «no hubo marcaciones». El cliente no paga 194 MB de más; se le oculta la información. Ese es el hallazgo real del anexo y **no se corrige en esta intervención**: requiere decidir si el respaldo se retira, se apunta a la tabla viva o se declara el vacío como sospecha.

- **Dueños declarados del hallazgo nuevo** (no ejecutados, porque ninguno es trabajo de F): `apexos-frontend` y `apexos-backend` deciden el contrato del silencio (qué debe mostrar la pantalla cuando el respaldo devuelve 0 filas), `apexos-db-nube` explica por qué `time_punches` lleva seis meses sin que nadie escriba y si conviene retirarla del todo, y `apexos-qa` exige que cualquier arreglo traiga el control positivo (una caída de API simulada que produzca el aviso, no un listado vacío).
- **Matiz de la puerta de cobertura, medido aquí y no asumido**: `agents:coverage` exige el **dueño de contexto** de cada ruta (la lista `owners` de `scripts/agents/lib/agent-routing.js`), un conjunto más angosto que el ruteo de `agents:preflight` (lista `agents`). La cobertura de estas ocho rutas nombró dos agentes (`apexos-brief`, `apexos-frontend`) mientras el preflight ruteaba cinco. Se avanzaron los cinco de todos modos, y la puerta se comprobó con su rojo provocado: `npm run agents:coverage -- --paths apps/api/prisma/schema.prisma` sale `FALTA · sin bump local frente a origin` porque `apexos-db-nube` no intervino en esta intervención. Un verde de cobertura solo vale sabiendo a quién dejó fuera.
- **Hallazgo secundario de acceso, sin acción**: la sonda REST con `service_role` contra `/rest/v1/time_punches` responde **403 `42501` permission denied for table time_punches** en Producción, mientras en QA la misma proyección por ruta jsonb funciona (`base64_vuela=false`, texto plano devuelto como `"false"`). Es un diferencial de grants entre las dos nubes, no un defecto del cliente: se declara para que `apexos-db-nube` lo valore, y ninguna pantalla depende de ese camino porque la tabla está vacía.
- **Incidente de árbol compartido, con su lección**: entre el primer y el segundo `agents:preflight` de este cierre, el tip de `desarrollo` pasó de `6e6331fd` a `56b0c097` (sesión paralela, mismo puesto de trabajo) y ese commit **se llevó puesto** el cambio que yo tenía en el árbol de trabajo sobre `hr-monitor-byte-budget.js`, con su evidencia. No hay pérdida ni conflicto, pero el inventario de 12.3 deja de ser cierto si se redacta contra el baseline que uno recuerda: lo publicado es lo que está en la remota, no lo que alguien escribió. Se revalidó `git rev-parse HEAD` / `origin/desarrollo` y el `git status` por archivo antes de firmar, y la fila del certificador se reetiquetó como «ya publicado fuera de este commit».
- **Lo publicado en `desarrollo`**: el retiro del `src` muerto con su guard (4/4), la sonda de artefacto con su `--selftest` (3/3 y 4/4 sobre 1.203 archivos), la obligación de declarar el ambiente en `hr-monitor-byte-budget.js` con su control rojo, y este anexo. Evidencia en `docs/qa/evidence/hr-map-inline-evidence-20261123/`.
- **Lo que sigue bloqueado, con la puerta que lo suelta**: prender `HR_EVIDENCE_STORAGE_ENABLED` (config de ambiente + despliegue), promocionar y desplegar `19df3ca2` y la Fase D (autorización de promoción), rescatar las 126 filas nuevas y correr la purga C.2 con su VACUUM (autorización de purga). Ninguna de las tres es alcanzable desde `desarrollo`, y ninguna se «aprovecha» de paso.
