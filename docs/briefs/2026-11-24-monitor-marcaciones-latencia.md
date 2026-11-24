# Brief — Demora del monitor de marcaciones: piso por petición, no peso de la respuesta

- **ID**: `2026-11-24-monitor-marcaciones-latencia`
- **Fecha**: `2026-11-24`
- **Rama activa**: `desarrollo` (HEAD `8bb324c0`, sincronizado con `origin/desarrollo`)
- **Prompt crudo**: "lo que necesitamos reparar el la demora en la carga de los datos es bastante demorado, los horarios en si cargan su proprio peso lo que debemos identificar es como mejorar la experiencia de usuario, adicionalmente mejorar esas consultas frente a la base de datos que no podemos permitirnos que se persivan lentas.. para el caso de los horarios no se se me ocurre predefinir un filtro fijado de cada dia asi no tarda en cargar los datos del mismo dia y el usuario busca bajo demanda otra fecha puede ser una ayuda no se que tan funcional sea, identifica cual es el real problema y corrigelo de raiz monta un plan de intervencion completa para corregir todo lo que pueda estar fallando en cuanto a conexiones o consultas lentas entre las pantallas y la base o el api propia de apexos"

## 1. Veredicto de diagnóstico (medido, no inferido)

La premisa del prompt —"los horarios cargan su propio peso"— **quedó refutada con datos de
Producción de hoy**. Las tres lecturas del monitor viajaron con payload de 0 a 7 KB y aun así
el p95 siguió en 3,2-4,1 s. El peso ya no es el problema; **el problema es cuántos viajes al
pooler paga cada petición y cuántas sentencias dispara cada ruta**.

Desglose tomado del encabezado `Server-Timing` que el propio API emite
(`apps/api/server.js:239`), medido desde el host del API en Railway hacia el pooler
`aws-1-sa-east-1` el 2026-11-24:

| Lectura | app (ms) | auth (ms) | db (ms) | lectura |
|---|---|---|---|---|
| `GET /health` (público, sin sesión) | 663,2 | 0,0 | 662,6 | **un viaje al pooler ≈ 660 ms** |
| `POST /api/v1/auth/login` | 3.282,2 | 0,0 | 3.101,0 | no es bcrypt: son sentencias |
| `GET /api/v1/auth/me` (1 KB) | 3.274,7 | 1.312,1 | 3.273,3 | ≈1 sentencia de autorización + 4 del handler (ver T2) |
| `GET /api/v1/hr/routes?limit=500&date` | 1.967,0 | 662,4 | 2.599,0 | |
| `GET /api/v1/hr/routes/event-summaries?date` (7 KB) | 3.338,1 | 655,0 | **7.998,1** | ≈9 sentencias en paralelo |

Que `db` (7.998 ms) supere a `app` (3.338 ms) prueba que las sentencias corren en paralelo y que
el reloj no es la suma: el costo dominante es **por viaje** y por conexión tomada del pool de 25.

Medición HTTP desde el puesto (p50/p95, 3-5 muestras, mismo día): API directa
`/auth/me` 2.284/2.396 · `event-summaries?date` 3.044/3.500 · vía `https://www.apexos.com.co`
2.439/2.577 y 3.390/3.711 → el doble salto del proxy Next cuesta **~300 ms por petición**.

Base de Producción (solo lectura por el pooler de sesión, 2026-11-24):

- `TimePunch`: 2.679 filas · heap **2.664 kB** · TOAST **256 MB**.
- `metadata` > 4 KB en 170 filas (196 MB declarados); `extra_evidence` > 4 KB en 58 filas (51 MB).
- **No hay índice en `TimePunch.route_id`, y no hace falta**: el `EXPLAIN (ANALYZE, BUFFERS)` del
  agregado del monitor hace Seq Scan sobre 333 buffers con coste 358 (planes de 1 ms). Añadir
  índices aquí sería el error clásico: cambiar bytes por CPU sobre un problema de viajes.
- `pg_stat_user_tables`: 29.342 seq_scan en `TimePunch`, 17.424 en `WorkActivity`,
  12.585 en `ActivityEvidence` — muchedumbre de lecturas baratas, no una consulta cara.

Hallazgo lateral que sí explica "los datos no entran" en el dominio raíz:
`https://apexos.com.co` **falla el handshake TLS** y por `:80` responde una página
`Firewall Notification` de parking con resolución a `3.33.130.190 / 15.197.148.33` y **sin AAAA**.
El ápice sigue aparcado en el registrador: lo que se ve ahí es caché del navegador, no la
herramienta. `www.apexos.com.co` sí sirve. Las instrucciones de DNS quedaron en
`docs/briefs/2026-11-23-prod-dominio-cors-monitor.md`; se re-confirman, no se ejecutan
(cambiar DNS es infraestructura y pide autorización expresa).

## 2. Plan de intervención por capas

Ordenado por palanca/riesgo. **T1 y T2 están escritas y probadas en esta intervención** (código en
`desarrollo`). T3 y T5 necesitan autorización del dueño porque tocan escritura en la nube e
infraestructura: no se ejecutan por iniciativa de un agente. Ninguna se despliega acá.

### T1 — Código en `desarrollo` (hecha, con pruebas)

| Capa | Defecto | Corrección | Efecto medido |
|---|---|---|---|
| Backend | `event-summaries` ignoraba la fecha pedida y resumía 100 rutas de **todo** el historial | `listRouteEventSummaries` recibe `request.query` y acota con `boundedReportRange` (`apps/api/src/modules/hr/service.js:944`) | sobre el día gordo del cliente: 7.000 ms → ~500 ms servidor, 266 evidencias = 266 |
| Backend | Proyectar evidencia aplicaba `jsonb_set` a todas las filas, incluso las ligeras: cambiar bytes por CPU | `guardedEvidenceProjection`: solo se proyecta la columna si `pg_column_size(...) > 4096` (`apps/api/src/modules/hr/monitorEvidenceRows.js`) | payload del día 594 KB → 513 KB con el guard → 16 KB con el día fijado |
| Backend | Las filas con `base64: ""` se contaban como evidencia | guard de longitud `length(coalesce(...,'')) > 0` en SQL y su espejo en JS | censo de paridad 266 = 266 |
| Backend | Dos agregaciones de `TimePunch` (total y salidas) para el mismo dato | una sola `groupBy` por `route_id, type` y derivación en memoria (`apps/api/src/modules/hr/service.js:986`) | −1 viaje al pooler ≈ −660 ms de db acumulado y −1 conexión del pool |
| Frontend | La pantalla cargaba sin fecha y luego filtraba en cliente | día fijado por defecto (`useState(initialDate)`), el usuario pide otra fecha bajo demanda — **la idea del dueño, implementada** | el arranque deja de pedir el historial |
| Frontend | Abanico de evidencia sin tope y sin esperar | `EVIDENCE_FETCH_CONCURRENCY = 4` y dos intentos con salida temprana si la respuesta no es arreglo | menos peticiones concurrentes sobre el mismo piso |
| Frontend | "0 de 0" mentía cuando el día fijado estaba vacío | estado vacío honesto nombrando el día consultado | el operario distingue "día sin marcaciones" de "no cargó" |

### T2 — Los handlers recompraban lo que el middleware ya pagó (escrita y probada hoy)

**Primero, la corrección de un afirma que este brief llevó mal.** En el borrador se escribió que el
piso de autenticación (`19df3ca2`, la decisión en una sentencia) «solo vive en `desarrollo`» y que
Producción pagaba ~411 ms por petición por no haberlo desplegado. **No era cierto**: verificado por
**hash de blob** —no por ancestralidad, que ya había mentido el 2026-11-23 por la misma razón—,
`AUTHORIZATION_SNAPSHOT` está en `origin/develop`, en `origin/main` (`e68eed4c`) y en el commit que
Producción sirve hoy (`/health` → `e68eed4c63f4`). La decisión **sí** corre en una sentencia.

Lo que el `Server-Timing` de `/auth/me` mostraba (auth 1.312 ms sobre db 3.273 ms) no era deuda del
middleware sino del **handler**, que volvía a leer lo que el snapshot ya había traído:

- `apps/api/src/modules/auth/service.js` — `me()` hacía `findUnique` con
  `include: { role: { include: { permissions: true } } }` (usuario + rol + permisos) y **una cuarta**
  sentencia para `tenant.findUnique`. `AUTHORIZATION_SNAPSHOT`
  (`apps/api/src/security/authorizationState.js:96-109`) ya devuelve `user`, `role` con
  `permissions` y `tenant` en **una**.

Corrección: se extrajo `readAuthorizationSnapshot(userId, sid)` en `authorizationState.js` —la misma
sentencia parametrizada con la que se decide— y `me()` la usa. No es una caché ni un dato más viejo:
es **la misma lectura viva** con la que el middleware autorizó la petición, proyectada por
`publicUser`/`publicTenant`. De 4 sentencias a 1, ~2,6 s menos sobre un piso de 3,27 s.

Por qué importa tanto: `/auth/me` no es una ruta exótica —lo llama el servidor en cada página del
dashboard (`apps/web/lib/moduleAccess.ts:411`) y la pantalla de Servicios
(`apps/web/app/dashboard/servicios/page.tsx:566`)—, así que esas cuatro sentencias se sumaban a la
apertura de **toda** pantalla.

Tres condiciones cerradas con prueba (`apps/api/test/auth-me-single-statement.test.js`, 6/6):
(a) **ningún campo crudo sale al cliente** —el snapshot es `to_jsonb(u)` y trae la clave hasheada—,
se verifica sobre el JSON serializado de la respuesta; (b) el `active` se sigue comprobando en el
handler, pero **sin fingir que es el guard principal**: `authorizationDecision` devuelve
`USER_REVOKED` para una cuenta inactiva y ese motivo está en la lista que se rechaza siempre, con
enforcement apagado — la guarda del handler es defensa por profundidad, porque `me()` es una función
del servicio alcanzable desde otro camino; (c) la proyección queda **idéntica** campo por campo, y
`me()` sin tenant devuelve `tenant: null` en vez de reventar. Tipos verificados contra el esquema:
`User.id` y `role_id` son `Int`, `tenant_id` es `String` y `preferences`/`active_modules` son `Json`,
así que `to_jsonb` devuelve lo mismo que Prisma y no hay `BigInt` que rompa la serialización.

Queda declarado, sin tocar: `refresh()` (`apps/api/src/modules/auth/service.js:231-235`) repite el
mismo `include` inmediatamente después de `validateAuthorization`. Es la misma corrección, pero
refresca una vez por sesión, no por pantalla; meterlo acá habría ampliado el diff del camino de
sesión sin medición que lo pida.

### T3 — Sacar el binario de la base (pide autorización de escritura en la nube)

256 MB de TOAST colgando de 2.679 filas es una bomba de tiempo: con el día sin datos no se nota,
en un día gordo el `detoast` vuelve a la pantalla. Herramienta escrita y probada en **solo
lectura**: `scripts/hr-evidence-backfill-storage.js` (Fase C.1) — dry por defecto, aborta si el
`project ref` no es el declarado, sube, **re-descarga y compara SHA-256 antes de escribir**, y
deja la fila intacta si algo falla. Secuencia: C.1 backfill (`--pilot` primero) → habilitar
`HR_EVIDENCE_STORAGE_ENABLED` (acepta `503 STORAGE_UPLOAD_FAILED` si el almacén titubea) →
C.2 purga → C.3 `VACUUM`. Masas en juego: ~240 MB en 226 objetos (168 selfies + 58 extras).

### T4 — Percepción (siguiente intervención, sin bloqueo de autorización)

Un panel por pantalla: `event-summaries` hoy son ≈9 sentencias para responder 7 KB. Consolidar en
una lectura única elimina viajes y conexiones del pool. Sumar esqueleto de carga en lugar de "0 de
0" y revisar el doble salto del proxy (~300 ms por petición).

### T5 — Dominio (pide autorización de infraestructura)

Señalar el ápice a Railway (o publicar el 301 del registrador) según las instrucciones ya
entregadas. Mientras tanto el acceso operativo correcto es `www.apexos.com.co`.

## 3. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/modules/hr/routes.js` | `GET /hr/routes/event-summaries` pasa `request.query` al servicio |
| `M` | `apps/api/src/modules/hr/service.js` | acote por fecha en `listRouteEventSummaries`; fusión 2→1 de las agregaciones de `TimePunch` con derivación en memoria |
| `M` | `apps/api/src/modules/hr/monitorEvidenceRows.js` | `guardedEvidenceProjection` (`pg_column_size > 4096`), guard de cadena vacía en `shrinkKey`, encabezado con el censo del 2026-11-24 |
| `M` | `apps/api/src/security/authorizationState.js` | se extrae `readAuthorizationSnapshot(userId, sid)` (la misma sentencia parametrizada del snapshot) y `validateAuthorization` la reusa: ningún cambio de decisión |
| `M` | `apps/api/src/modules/auth/service.js` | `me()` resuelve usuario+rol+permisos+tenant en esa única lectura; proyección `publicUser`/`publicTenant` intacta y 401 por cuenta inactiva conservado |
| `M` | `apps/api/test/hr-monitor-evidence-columns.test.js` | controles del guard en los tres lectores, delegación a una sola regla de stub, bounds del umbral y paridad de conteo (`{base64:""}` → 0, `{base64:"", storage_path}` → 1) |
| `A` | `apps/api/test/auth-me-single-statement.test.js` | 6 controles: una sola sentencia y cero `findUnique`, proyección campo por campo, ni hash ni `authorization_version` en el JSON serializado, inactiva → 401, sin fila → 401, sin tenant → `null` |
| `M` | `apps/api/test/hr-list-truncation.test.js` | control que no puede pasar en falso: una sola agregación con filas reales de dos rutas y dos tipos (total 5, salidas 2, último evento 18:00) |
| `M` | `apps/web/app/dashboard/talento-humano/rutas/page.tsx` | día fijado por defecto, carga por día, abanico de evidencia a concurrencia 4 con rebote, efectos de montaje separados, estado vacío honesto |
| `M` | `apps/web/test/hr-monitor-refresh.test.mjs` | guardas del día fijado, concurrencia, efectos separados y prohibición del `void loadTimelineEvidence(event)` |
| `A` | `scripts/hr-evidence-backfill-storage.js` | Fase C.1: backfill de `metadata.identity_photo` y `extra_evidence` a Storage, dry por defecto, guarda de `project ref`, verificación SHA-256 obligatoria |
| `A` | `apps/api/test/hr-evidence-backfill-tool.test.js` | contrato del guion: dry por defecto, `--keep-inline` solo sobre escritura, validación de tenant/rama, aborta con exit 2 sobre proyecto ajeno, un `SET` por columna, ambas grafías del binario |
| `M` | `scripts/certifications/hr-monitor-byte-budget.js` | tabla separada: `event_summaries_day` goberna, `event_summaries_all` es referencia exenta; el selftest comprueba las dos direcciones y el cableado; `day_scope` en la evidencia |
| `M` | `docs/PERFORMANCE_ANTI_PATTERNS.md` | anti-patrón nuevo: fan-out de sentencias por pantalla |
| `M` | `docs/project/talento-humano-implementacion-seguimiento.md` | cómo se lee hoy la evidencia y cuál es el piso real |
| `A` | `docs/qa/evidence/hr-monitor-byte-budget-20261124-production/presupuesto-antes.json` | ANTES desplegado: 0-7 KB con p95 3.246-3.500 ms → puerta en rojo por reloj |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-production-1795528571910.json` | corrida verde de hoy sobre datos de Producción (549→138 ms, 0 divergencias) |
| `A` | `docs/qa/evidence/hr-evidence-backfill-20261124/*.json` | dry-runs de QA y Producción (escrituras: 0) |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` | control: el piso es por viaje al pooler; agregar por tipo y derivar en memoria |
| `M` | `.qoder/skills/apexos-db-nube/SKILL.md` | control: medir heap vs TOAST y plan antes de proponer un índice |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | control: día fijado + abanico acotado + estado vacío que nombra el filtro |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | control: leer `Server-Timing` antes de optimizar a ciegas |
| `M` | `.qoder/skills/apexos-seguridad/SKILL.md` | control del guion de backfill: verificación SHA-256 obligatoria y abortar por proyecto |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | control: una compuerta con camino exento debe probar los dos sentidos |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | control: el diagnóstico se escritura, no se supone |
| `M` | `agents/**` y `agents/registry.json` | regenerados por `npm run agents:sync` |
| `M` | `agents/CHANGELOG.md` | entrada de la intervención |

### Módulos (`change_intent.modules`)

- `talento-humano`
- `auth`
- `rendimiento`
- `platform-seguridad`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 4. Fuera de alcance

- No se promociona a `develop` ni a `main`, no se despliega, no se ejecuta DDL ni escritura en la
  nube. T3 y T5 quedan con su autorización pendiente y declarada.
- No se toca `refresh()` ni `login()`, aunque repiten el mismo `include` del snapshot: `refresh` paga
  el extra una vez por sesión y no por pantalla, y ampliar el diff del camino de sesión sin medición
  que lo pida sería exactamente el tipo de cambio transversal que el gobierno de ramas prohíbe. Queda
  escrito en T2 como siguiente candado.
- No se habilita `HR_EVIDENCE_STORAGE_ENABLED` en ningún ambiente.
- No se añaden índices: el plan medido cuesta 358 y lee 333 buffers.
- No se toca `apps/control-tower/**`.
- No se escribe en la base de Producción para medir: toda la evidencia de esta intervención es de
  lectura, salvo los JSON de `docs/qa/evidence/`.

## 5. Criterios de aceptación

1. `node --test apps/api/test/hr-list-truncation.test.js apps/api/test/hr-monitor-evidence-columns.test.js apps/api/test/hr-evidence-backfill-tool.test.js apps/api/test/hr-operations-map-contract.test.js` → **35/35 verdes** (conseguido).
2. `node --test apps/web/test/hr-monitor-refresh.test.mjs` → 7/7 verdes, incluidas las guardas del día fijado y de la concurrencia (conseguido).
3. `npm run certify:hr-monitor-budget:selftest` → 9 casos, con `dia-fijado-rojo` y `referencia-exenta` fallando/pasando en sus sentidos correctos (conseguido).
4. `npm run certify:hr-auth-latency:production` → VERDE sobre datos de Producción (conseguido hoy:
   factor 0,25, 18 casos, 0 divergencias). **Lo que prueba esta corrida no es que falte desplegar el
   piso de autenticación** —ese ya corre en `e68eed4c63f4`—: reafirma el contrato de la decisión de
   una sentencia contra el binario servido y deja la línea base (138 ms) para que T2 se mida encima.
5. Un `EXPLAIN` del agregado del monitor no puede invocar un índice nuevo ni subir de 1 ms de trabajo: se comprueba antes de proponer DDL (conseguido, ver §1).
6. `node --test apps/api/test/auth-me-single-statement.test.js apps/api/test/auth-session-hardening.test.js apps/api/test/authorization-observe.test.js apps/api/test/security-authorization-revocation.test.js` → **24/24 verdes** (conseguido): el snapshot extraído no cambió ninguna decisión y `/auth/me` sale de una sola sentencia.
7. **Después de desplegar T1+T2**, `certify:hr-monitor-budget:production` debe salir en verde de reloj, `Server-Timing` de `event-summaries?date` por debajo de 1.500 ms de `app` y `/auth/me` por debajo de ~1.000 ms de `db` (hoy 3.273 ms). Estos criterios **no pueden certificarse hoy**: el binario desplegado todavía ignora `date` en esa ruta y hace las cuatro lecturas del handler, así que no hay forma de pedirle lo que no sabe hacer. Se declaran pendientes y no se fingen. Lo que sí se midió como sustituto más cercano, sin desplegar nada:
   - **El payload del día gordo ya no viaja**: `docs/qa/evidence/hr-monitor-byte-budget-20261124-production/presupuesto-antes.json`,
     campo `day_scope` — 7.000 ms y 608.256 bytes antes contra 500 ms y 16.384 bytes después, mismo día
     y tenant, `266 evidencias = 266`. Medición ad hoc complementaria desde el puesto (no la produce el
     instrumento, no se cita como evidencia): la respuesta de `event-summaries?date=2026-11-23` comprimida
     por gzip ocupó **415 bytes**.
   - **A/B sobre el mismo proxy nginx** (registro `/var/log/nginx/access.log` del host web, leído por
     SSH; vive fuera del repositorio, así que se consigna como observación y no como artefacto
     versionado): `?date=2026-11-23` sirvió **3.473 y 3.919 ms** mientras las llamadas sin fecha de los
     días 21 y 22 registraron **12.377 y 14.056 ms**.
8. **Lo que no se pudo verificar en navegador**: la sesión del puesto quedó `401 Token invalido`
   contra Producción y **no se volvió a iniciar** (no es cuenta de este agente y abrir sesión ajena
   rota la del operario). El día fijado, el estado vacío y la concurrencia 4 quedan probados por las
   guardas de `apps/web/test/hr-monitor-refresh.test.mjs` (7/7) y por `next build`, no por un clic.
   Se remide en QA al desplegar.

## 6. Evidencia y certificación exigida

- Pruebas unitarias y de contrato de las secciones anteriores + suites completas de API y web al cierre.
- **Suite de API completa** (`DISABLE_REDIS=true node --test --test-force-exit --test-concurrency=4
  test/*.test.js`): **1.404 pruebas, 1.400 pasan, 1 falla, 3 omitidas**. La única falla es
  `hr-face-identity.test.js:255` — *humo: el modelo real (Human wasm)* — por `Cannot find module
  '@vladmandic/human'`: el paquete está declarado en `apps/api/package.json` (`3.3.6`) pero no instalado
  en este puesto. Es hueco de dependencia local, no fallo de producto ni de este cambio (la ruta no toca
  identidad facial). Cero fallos de base de datos en la corrida: sin `Can't reach database`, sin `54320`,
  sin `P1001`. El estancamiento de la corrida anterior (145/173 archivos sin resumen) eran los
  `setInterval` de los cron que no dejaban cerrar el runner; `--test-force-exit` lo resuelve.
- **Suite de web completa** (`node --test test/*.test.mjs`): **894 pruebas, 889 pasan, 5 fallan**. Las
  cinco (`accounting-pyg-interactive`, `command-palette-module-functions`, `hr-offline-marking`,
  `transport-master-access`, `transport-vehicle-master-catalogs`) se reprodujeron **exactamente iguales**
  en un worktree despegado en el HEAD limpio `8bb324c0`, así que son preexistentes y ajenas a este diff.
- `npm run certify:hr-monitor-budget:selftest` y `npm run certify:hr-auth-latency:production`.
- `npm run certify:hr-monitor-budget:production` contra el ambiente desplegado → `presupuesto-antes.json`.
- Dry-runs del backfill (`qa-dry-*.json`, `prod-dry-*.json`) con `escrituras: 0`.
- `certification_status`: **`local_passed_qa_pending`**. La puerta end-to-end del monitor queda
  pendiente de promoción y despliegue; el `DESPUÉS` se remide contra el artefacto servido.

## 7. Capacidades protegidas

- **Conteo de evidencias** — el acote por día no puede perder marcaciones: 266 = 266 y las
  guardas del constructor puro viajan con filas reales, no con stubs vacíos.
- **Aislamiento multi-tenant** — `runWithTenant` sigue envolviendo la lectura; la agregación
  fusionada conserva el predicado `route_id in (rutas del tenant)`.
- **Revocación de sesión** — esta intervención no toca el camino de decisión; el contrato se
  reafirmó contra el binario desplegado: 18 casos, 0 divergencias.
- **Integridad de la evidencia antes de purgar** — el guion no escribe si la re-descarga no
  coincide en SHA-256; `--keep-inline` no borra bytes.

## 8. Riesgos y rollback

- Riesgo: fusionar las agregaciones altera un conteo → Mitigación: test con dos rutas y dos tipos
  que fija total, salidas y último evento; el constructor puro no se tocó.
- Riesgo: el guard de tamaño deja fuera una fila pesada mal clasificada → Mitigación: umbral
  acotado por prueba (≤ `METADATA_SHRINK_MIN_BYTES`, < 10240) y paridad de conteo censada.
- Riesgo: el backfill escribe en el proyecto equivocado → Mitigación: `EXPECTED_REFS` por rama,
  aborta con exit 2 antes de conectar (probado por spawn, no solo por función).
- Riesgo: medir un ambiente y declarar el otro → Mitigación: `--env-file` obligatorio, el origen
  explícito no puede contradecir al archivo, y la evidencia se autoatribuye el archivo resuelto.
- Rollback: `git revert` de los commits de producto (nunca reset, nunca squash).

## 9. Supuestos y preguntas abiertas

- Supuesto confirmado: el costo es por viaje al pooler (≈660 ms desde Railway), no por trabajo SQL.
- **Afirmación retirada tras verificarla**: este brief sostuvo que el piso de una sentencia
  (`19df3ca2`) no estaba en Producción y que `/auth/me` pagaba ~411 ms por desplegarlo. El blob de
  `authorizationState.js` en el commit servido (`/health` → `e68eed4c63f4`, igual a `origin/main`)
  dice lo contrario: **sí está**. La `auth;dur` de 1.312 ms es una sentencia, y el resto del `db`
  son las cuatro del handler (T2). Lección escrita en los agentes: antes de afirmar «eso falta
  desplegarlo» se compara el blob contra el commit que el ambiente sirve, no contra la lista de
  ancestros —la ancestralidad ya había mentido el 2026-11-23 por el mismo motivo.
- Supuesto por confirmar al desplegar T2: cuánto baja de verdad `/auth/me`. La línea base servida hoy
  es 3.273 ms de `db` y p50 HTTP 2.284 ms; el contrato en una sentencia predice ~1.000 ms de `db`
  (un viaje), y eso lo dicta `certify:hr-monitor-budget:production` sobre el artefacto desplegado, no
  el verde de las suites.
- Pregunta para el dueño (no bloquea nada): ¿T1 y T2 viajan juntas en la próxima promoción del paquete
  HR, o se promociona primero T1 (pantalla de rutas) y T2 (camino de sesión) en la ventana siguiente?

## 10. Autorizaciones requeridas

- [x] Trabajar en `desarrollo` y publicar con `git push origin desarrollo` (autorización permanente acotada).
- [ ] Promoción `desarrollo → develop` (**T1 + T2**, con `apps/api/src/security/authorizationState.js`
      y `apps/api/src/modules/auth/service.js` dentro del inventario exacto: son el camino de sesión y
      no pueden colarse como transversales) con manifiesto de alcance v2, `qa:promotion:scope`,
      `qa:preqa:evidence` y despliegue en QA.
- [ ] Promoción `develop → main` con `qa:approval:evidence` y aprobación funcional de QA.
- [ ] Habilitar `HR_EVIDENCE_STORAGE_ENABLED` en QA/Producción (variables de Railway/Supabase).
- [ ] Ejecutar el backfill C.1 con `--execute --pilot` y luego la purga C.2 y `VACUUM` C.3 en la nube.
- [ ] Cambiar el DNS del ápice `apexos.com.co` (registrador o Railway).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `Veredicto: OK` (2026-11-24, con las 10 rutas del cierre). Ruteo:
  `apexos-backend`, `apexos-seguridad` y `apexos-qa`: `apps/api/src/modules/hr/{service,routes,monitorEvidenceRows}.js`
  **y** `apps/api/src/{security/authorizationState,modules/auth/service}.js`;
  `apexos-frontend`: `apps/web/app/dashboard/talento-humano/rutas/page.tsx`;
  `equipo-apexos`: `scripts/hr-evidence-backfill-storage.js` y `scripts/certifications/hr-monitor-byte-budget.js`
  más `agents/CHANGELOG.md`; `apexos-brief` y `apexos-git-guardian`: `agents/CHANGELOG.md` y este brief;
  `apexos-performance` por `docs/PERFORMANCE_ANTI_PATTERNS.md` y `apexos-db-nube` por el censo de
  heap/TOAST consignado en el documento del módulo.
- **Agentes efectivamente actualizados al cierre**: `apexos-backend` `2.25.0 → 2.26.0` (regla 42, cuatro
  correcciones medidas), `apexos-seguridad` `2.37.0 → 2.38.1` (reglas 52 y 53: integridad del backfill y
  la fila cruda del snapshot nunca sale al cliente), `apexos-qa` `2.104.0 → 2.105.0` (regla 117: compuerta
  con camino exento, `DESPUÉS` no medible y el stub desmontado a medias), `apexos-frontend`
  `2.43.0 → 2.44.0` (regla 59), `apexos-performance` `2.22.0 → 2.23.0` (regla 32), `apexos-db-nube`
  `2.8.0 → 2.9.0` (regla 20), `equipo-apexos` `2.60.0 → 2.61.0` (regla 73), `apexos-brief`
  `2.84.0 → 2.85.0` (regla 99) y `apexos-git-guardian` `2.28.0 → 2.29.0` (regla 45). Nueve agentes: los
  siete del ruteo original más los dos que cubren el brief y el manifiesto.
- **Registro**: `agents/registry.json` regenerado por `npm run agents:sync` y entrada en
  `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<las rutas del preflight>"` en verde.
- **Secuencia de cierre**: `npm run agents:sync` → `agents:check` → `agents:preflight` →
  `agents:coverage` → suites de API y web → commit → `git push origin desarrollo`.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde
- [ ] Sin secretos ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit

## 12. Cómo se le habla al dueño (instrucción expresa del 2026-11-24)

El dueño pidió, después de cerrar la intervención de latencia: **«de ahora en adelante háblame en lenguaje
natural, gentileza, colombiano o latino; el lenguaje técnico lo puedes dejar para ti»**, y que la instrucción
quedara escrita para que **todos** los agentes respondan así. No es un comentario de estilo sobre este informe:
es una regla de idioma y registro del equipo, y por eso se versionó.

- **Dónde quedó la regla canónica:** `AGENTS.md`, sección *Como se le habla al dueno*. Es el archivo que todo
  agente, experto, auditor u orquestador carga antes de trabajar, así que la regla aplica a los once agentes y a
  los que lleguen después, no solo a los que participaron aquí.
- **Dónde quedó por agente:** los once `SKILL.md` con la sección *Como se le habla al dueno* (cuatro viñetas) y
  `updated_at: 2026-11-24`. Versiones: `apexos-backend` `2.26.0 → 2.27.0`, `apexos-seguridad` `2.38.1 → 2.39.0`,
  `apexos-qa` `2.105.0 → 2.106.0`, `apexos-frontend` `2.44.0 → 2.45.0`, `apexos-performance` `2.23.0 → 2.24.0`,
  `apexos-db-nube` `2.9.0 → 2.10.0`, `equipo-apexos` `2.61.0 → 2.62.0`, `apexos-brief` `2.85.0 → 2.86.0`,
  `apexos-git-guardian` `2.29.0 → 2.30.0`, `apexos-auditor-marcaciones` `2.0.0 → 2.1.0` y
  `apexos-auditor-nomina` `2.0.0 → 2.1.0`. Los once son **minor**: se agrega un control nuevo (el registro del
  reporte), no se cambia el rol. `agents/registry.json` registró además el control `lenguaje-cercano-al-dueno`
  en los once y `AGENTS.md` pasó a `2026-11-24` dentro de los documentos gobernados.
- **Qué cambia en los hechos:** el chat se escribe en prosa y en español latino — primero qué está pasando y qué
  hay que hacer, con las cifras en número. La jerga técnica no se elimina del trabajo: se queda en este brief, en
  `agents/CHANGELOG.md`, en los `SKILL.md`, en la evidencia y en el código, que son los artefactos donde otra
  sesión o un auditor tienen que poder reproducir el hallazgo. Un nombre de archivo, una bandera o un hash solo se
  cita cuando el dueño lo necesita para accionar.
- **Lo que NO cambia:** el nivel de exigencia. «Cambió cómo se cuenta, no qué se mide»: sigue siendo obligatorio
  medir antes de afirmar, certify con instrumento versionado, evidencia en `docs/qa/evidence/**` y no promover sin
  autorización. Una respuesta amable nunca puede sustituir un rojo declarado.

