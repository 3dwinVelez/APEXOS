# Brief — Demora del monitor de marcaciones: piso por petición, no peso de la respuesta

- **ID**: `2026-11-24-monitor-marcaciones-latencia`
- **Fecha**: `2026-11-24`
- **Rama activa**: `desarrollo` (la primera ronda cerró en `8bb324c0`/`134816de`; §13 se escribe sobre el
  tip de `origin/desarrollo` del 2026-11-24)
- **Prompt de la segunda ronda** (§13): "procede con lo que hace falta y garantizame que todo quede
  implementado bajo las mejores practicas recomendables y lo que buscamos con la herramienta"
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

Quedaba declarado, sin tocar en T2: `refresh()` (`apps/api/src/modules/auth/service.js`) repetía el
mismo `include` inmediatamente después de `validateAuthorization`, y `login()` resolvía el correo con
un `findFirst` sobre un índice que no es global. **Se cerró el mismo día en una segunda ronda de esta
intervención — ver §13—**, después de verificar contra el tip que el cliente renueva la sesión al
abrir (no una vez por sesión, como aquí se supuso) y con el censo de correos ya medido.

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

### Alcance de la segunda ronda (§13, camino de sesión)

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/security/authorizationState.js` | snapshot dividido en `..._BODY` + `AUTHORIZATION_SNAPSHOT`; nace `readAuthorizationSnapshotsByEmail`; se exporta `noteAuthEvent` |
| `M` | `apps/api/src/modules/auth/service.js` | `login()` decide sobre el conjunto de filas del correo (bcrypt paralelo, 401 uniforme, cero sesión ambigua), `refresh()` y `fingerprintLogin()` resuelven el perfil en la sentencia del snapshot |
| `M` | `apps/api/test/auth-session-hardening.test.js` | fixture multicuenta + 4 controles nuevos: 1 lectura por login, empate → mismo 401 sin crear sesión con métrica, inactiva no tapa la activa, `refresh` en 1 sentencia con claim `role` intacto |
| `M` | `apps/api/test/auth-webauthn-login.test.js` | mock del snapshot + contadores: 1 lectura de perfil, 0 `include`, 0 lectura suelta de empresa |
| `M` | `apps/api/test/authorization-status-codes.test.js` | `DISABLE_REDIS` en el require (rojo ambiental que tapaba el contrato 401/403) |
| `A` | `scripts/security/auth-email-collision-census.js` | censo de solo lectura de correos en varias empresas, veredicto `COLISION_VIVA`/`SIN_COLISION`, control positivo por construcción, `--account-emails` |
| `A` | `scripts/security/auth-session-sql-guard.js` | guarda que captura las sentencias del código y las ejecuta `PREPARE`/`EXECUTE`/`\gdesc` contra la base del ambiente, con `--selftest` de 16 controles y negativos |
| — | `scripts/security/recovery-readiness.js` | **no cambia**: los dos instrumentos nuevos reusan el `parseEnv` que ya exporta (verificado con `grep module.exports`), para no sumar un lector de `.env` al repo |
| `A` | `docs/qa/evidence/auth-session-path-20261124/censo-correos-{qa,production}.json` | censo por ambiente con `escrituras: 0` |
| `A` | `docs/qa/evidence/auth-session-path-20261124/sentencias-{qa,production}.json` | forma (4 columnas), filas y `ms_servidor` de cada sentencia |
| `A` | `docs/qa/evidence/auth-session-path-20261124/suites-camino-sesion.json` | reconteo de los 7 archivos en dos modalidades (44/44 con `AUTH_STATUS_INTEGRATION=1`, 43 + 1 omitida sin ella), `--selftest` 16/16 y la atribución del único rojo de API |
| `M` | `docs/PERFORMANCE_ANTI_PATTERNS.md` | cuatro filas nuevas: `findFirst` por correo, recompra en el handler, SQL copiado en el fixture y «0 filas» aceptado como verde |
| `M` | `docs/briefs/2026-11-24-monitor-marcaciones-latencia.md` | §13, criterios 9-13, evidencia y autorizaciones |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` | regla 43 (`2.27.0 → 2.28.0`) y parche de errata (`2.29.0 → 2.29.1`: 44, no 50) |
| `M` | `.qoder/skills/apexos-seguridad/SKILL.md` | regla 54 (`2.39.0 → 2.40.0`) y regla 56 (`2.41.0 → 2.42.0`): el contrato de ingreso se certifica con `AUTH_STATUS_INTEGRATION=1` y la cifra declara sus omitidas |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | regla 33 (`2.24.0 → 2.25.0`) y parche de errata (`2.25.0 → 2.25.1`: 16/16, no 15/15) |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | regla 118 (`2.106.0 → 2.107.0`) y parche de errata (`2.108.0 → 2.108.1`: 44, no 50) |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | regla 74 (`2.62.0 → 2.63.0`) |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | regla 100 (`2.86.0 → 2.87.0`) y regla 102 (`2.88.0 → 2.89.0`, pasada de cierre): la evidencia posterior recalcula el inventario y cada cifra tiene artefacto |
| `M` | `.qoder/skills/apexos-git-guardian/SKILL.md` | regla 47 (`2.31.0 → 2.32.0`): residual del mismo blob viaja en el mismo manifiesto, stage por ruta con dos sesiones vivas y cifra sin artefacto = defecto de gobernanza |
| `M` | `agents/registry.json` + `agents/**` | controles nuevos y espejos regenerados por `npm run agents:sync` |

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
- ~~No se toca `refresh()` ni `login()`.~~ **Corregido el mismo día:** sí se tocaron, en la segunda
  ronda de esta intervención (§13). La exclusión se había escrito asumiendo que `refresh` pagaba el
  extra «una vez por sesión» —el cliente lo llama al abrir, no una vez— y antes de medir los correos
  con colisión. El alcance sigue siendo el mismo camino (`auth`), no un módulo nuevo.
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

### Criterios de la segunda ronda — camino de sesión completo (§13)

9. `node --test apps/api/test/auth-session-hardening.test.js` → **11/11** (conseguido): `login` paga
   **exactamente 1 lectura** al snapshot y cero lecturas sueltas de empresa; el empate entre dos
   empresas activas responde **el mismo 401 con el mismo texto**, **no crea sesión** (`created.length
   === 0`) y suma 1 a `LOGIN_CORREO_AMBIGUO`; la fila inactiva **no tapa** la empresa activa (entra
   por la activa y no ensucia la métrica); `refresh` decide en **1 sentencia** y conserva el claim
   `role`.
10. `node --test apps/api/test/auth-webauthn-login.test.js` → **7/7**.
    `apps/api/test/authorization-status-codes.test.js` corre **6 pruebas y la sexta está en gates por
    diseño**: sin `AUTH_STATUS_INTEGRATION=1` pasa 5 y **omite 1** (es la que levanta el servidor real);
    con la bandera → **6/6, 0 omitidas** (conseguido, medido el 2026-11-24). El camino de sesión completo
    son **siete archivos = 44 pruebas, 44 pasan con `AUTH_STATUS_INTEGRATION=1`** (11 + 7 + 6 + 6 + 6 + 5 + 3);
    sin la bandera son 43 pasan y 1 omitida. **No son 50**: el conteo publicado en los `SKILL.md` de
    backend/QA decía 50/50 y era un error de quien escribió el control, no del arnés — el texto quedó
    corregido en la pasada de cierre (§11) y este artefacto es el que lo respalda.
11. `node scripts/security/auth-email-collision-census.js --env-file config/qa.env|production.env` →
    veredicto con `escrituras: 0` y el conteo de correos compartidos (conseguido: QA
    `COLISION_VIVA` 7 correos / 550 usuarios / 27 empresas, Producción `SIN_COLISION` 0 / 211 / 9).
12. `node scripts/security/auth-session-sql-guard.js --selftest` → **16/16** y
    `--env-file=config/qa.env|production.env` → **`SENTENCIAS_VALIDAS`** con las cuatro columnas
    (`user`,`role`,`tenant`,`session`), `filas > 0` y `ms_servidor` consignado (conseguido: QA 2 filas
    / 242 ms y 1 fila / 164 ms; Producción 1 fila / 268 ms y 1 fila / 269 ms).
13. Ninguna cuenta de certificación (`config/*.env`) puede quedar fuera por este cambio: **censo
    ad hoc de las 9 cuentas de correo usadas por los arneses → 0 colisiones**, probado como control
    positivo del census (una cuenta en 2 empresas dispara `COLISION_VIVA`).

## 6. Evidencia y certificación exigida

- Pruebas unitarias y de contrato de las secciones anteriores + suites completas de API y web al cierre.
- **Suite de API completa al cierre de la segunda ronda** (§13): **1.414 pruebas, 1.410 pasan, 1 falla,
  3 omitidas**. El único rojo vuelve a ser `hr-face-identity.test.js` por `Cannot find module
  '@vladmandic/human'` (corrido aislado: 14 pruebas / 13 pasan / 1 falla) — hueco de dependencia local,
  ajeno a este diff. El diff de sesión no añadió ni un rojo: 1.404 → 1.414 pruebas son las
  10 pruebas nuevas del paquete (`auth-session-hardening` +4, `auth-webauthn-login` +3 y los tres
  controles contadores, `authorization-status-codes` sigue en 6).
- **Suite de API de la primera ronda** (`DISABLE_REDIS=true node --test --test-force-exit --test-concurrency=4
  test/*.test.js`): **1.404 pruebas, 1.400 pasan, 1 falla, 3 omitidas**. La única falla era
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
- **Censo de correos compartidos** (§13): `docs/qa/evidence/auth-session-path-20261124/censo-correos-qa.json`
  (`COLISION_VIVA`: 27 empresas, 550 usuarios, **7 correos en varias empresas**, uno activo en 4, 419
  usuarios inactivos) y `censo-correos-production.json` (`SIN_COLISION`: 9 empresas, 211 usuarios, 0
  colisiones). Ambos con `escrituras: 0` y la transacción declarada de solo lectura en el servidor.
- **Guard del SQL de sesión** (§13): `sentencias-qa.json` y `sentencias-production.json` — las dos
  sentencias que el código manda de verdad, ejecutadas `PREPARE`/`EXECUTE` contra cada base, con
  `\gdesc` de las cuatro columnas, `ms_servidor` y conteo de filas (QA 2 filas en la lectura por
  correo: es la colisión real del censo, no un fixture).
- **Reconteo de suites del camino de sesión** (§13):
  `docs/qa/evidence/auth-session-path-20261124/suites-camino-sesion.json` — los siete archivos corridos
  archivo por archivo en dos modalidades (con y sin `AUTH_STATUS_INTEGRATION=1`), el `--selftest` del guard
  y la atribución del único rojo de la suite de API. Nace para sustituir la cifra «50/50» que quedó escrita
  en los controles commiteados de esta corrida.
- **Regla transversal de los dos instrumentos**: el `psql -c` del puesto pierde el `read only` del
  `BEGIN` explícito (lo manda como una sola consulta simple), así que el piso de solo lectura ahora lo
  pone el servidor con `PGOPTIONS=-c default_transaction_read_only=on` en los dos guardas.
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
- [ ] Promoción `desarrollo → develop` (**T1 + T2 + §13**, con `apps/api/src/security/authorizationState.js`
      y `apps/api/src/modules/auth/service.js` dentro del inventario exacto: son el camino de sesión y
      no pueden colarse como transversales) con manifiesto de alcance v2, `qa:promotion:scope`,
      `qa:preqa:evidence` y despliegue en QA. §13 **no se promociona aparte**: es el mismo módulo `auth`
      y las mismas dos rutas de producto, y separarlo produciría dos candidatos que tocan el mismo blob.
- [ ] **Preparación medida del manifiesto (2026-11-24, sin promocionar).** `docs/qa/manifests/
      monitor-latencia-sesion-20261124-scope.json` declara las **52 rutas exactas** del paquete
      (`41134bf4` + `ba00d9f7` + `ce654d10` + `f3e85f1a` + `0a902366`) contra el tip actual
      `origin/develop = b59f286d`, `allowed_deletions: []` y `approval.status: pendiente`.
      Dos hallazgos que cambian el método:
      **(a)** el portón corriendo el tip contra el tip responde `ALCANCE DE PROMOCION INVALIDO` con
      **1.043 rutas fuera de alcance** (`puerta-alcance-origin-develop.txt`): `desarrollo` va 252 commits por
      delante y `develop` tiene **119 propios**, así que no hay fusión de rama posible para este paquete;
      **(b)** **13 de las 51 rutas tienen avance propio en `develop` respecto del merge-base `36111a6a`**, y
      verificar por contenido (no por ancestro) encontró una regresión concreta: `cd3a88e5` —
      *reject schedule updates outside the authenticated tenant* — vive solo en `develop`, y
      `origin/desarrollo:apps/api/src/modules/hr/service.js` **no** contiene `HORARIO_NO_ENCONTRADO` ni el
      `where { id, tenant_id }` de `updateRoute`. Copiar archivos de `desarrollo` sobre `develop` borraría un
      arreglo de aislamiento de tenant. El método obligatorio queda escrito en el manifiesto: candidato
      reconstruido en worktree auxiliar con fusión a tres vías, jamás `git checkout desarrollo -- <ruta>`.
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

### Cierre de la segunda ronda (§13)

- **Preflight**: `npm run agents:preflight -- --paths "apps/api/src/modules/auth/service.js,
  apps/api/src/security/authorizationState.js,apps/api/test/auth-session-hardening.test.js,
  apps/api/test/auth-webauthn-login.test.js,apps/api/test/authorization-status-codes.test.js,
  scripts/security/auth-email-collision-census.js,scripts/security/auth-session-sql-guard.js,
  docs/qa/evidence/auth-session-path-20261124,docs/briefs/2026-11-24-monitor-marcaciones-latencia.md,
  docs/PERFORMANCE_ANTI_PATTERNS.md,agents/CHANGELOG.md"` → **`Veredicto: OK`**, ruteando siete dueños:
  `equipo-apexos`, `apexos-brief`, `apexos-git-guardian`, `apexos-backend`, `apexos-seguridad`,
  `apexos-performance`, `apexos-qa`. Los siete `SKILL.md` fueron lectura obligatoria antes de editar.
- **Agentes actualizados y publicados**: `apexos-backend` `2.27.0 → 2.28.0` (regla 43), `apexos-seguridad`
  `2.39.0 → 2.40.0` (regla 54), `apexos-performance` `2.24.0 → 2.25.0` (regla 33), `apexos-qa`
  `2.106.0 → 2.107.0` (regla 118), `equipo-apexos` `2.62.0 → 2.63.0` (regla 74) y `apexos-brief`
  `2.86.0 → 2.87.0` (regla 100). Los seis son **minor**: control nuevo, rol intacto. Controles
  registrados en `agents/registry.json`: `camino-sesion-una-sentencia-por-lectura`,
  `login-no-es-oraculo-de-correos`, `sql-capturado-y-validado-contra-la-base`,
  `rojo-del-arnes-se-atribuye-y-se-cura`, `residuo-declarado-se-cierra-en-el-mismo-paquete`,
  `instrumento-nuevo-entra-al-inventario`.
- **Control de `apexos-git-guardian`: declarado pendiente y publicado en la pasada de cierre.** El ruteo con
  `agents/CHANGELOG.md` sumó a `apexos-git-guardian`, y el hallazgo le pertenece: **un residual cerrado sobre
  el mismo blob del paquete ya inventariado viaja en ese manifiesto, no como segundo candidato**
  (`auth/service.js` y `authorizationState.js` ya estaban en el inventario de T2; dos candidatos sobre el
  mismo archivo reproducen el tip que no es el certificado), junto con que el índice se arma **por ruta
  nombrada** cuando hay dos sesiones vivas y que una cifra sin artefacto es un defecto de gobernanza. No se
  subió en la primera pasada porque `npm run agents:sync` abortaba con el árbol ajeno sucio (la sesión
  concurrente del paquete selfie tenía sin commitear las reglas 44/119/55/60, y bumpiar un `SKILL.md` ajeno
  para destrabar el sync propio está prohibido). En cuanto esa sesión publicó `21a99f47`, el árbol quedó
  limpio y la regla salió como **`2.31.0 → 2.32.0`, control `residual-mismo-blob-mismo-manifiesto`**.
- **Errata de las cifras, aplicada también en el texto del control.** Los `SKILL.md` decían «suite de auth
  completo **50/50** en siete archivos» (`apexos-backend` regla 43 y `apexos-qa` regla 118) y «`--selftest` →
  **15/15**» (`apexos-performance` regla 33). Recontado archivo por archivo (artefacto
  `docs/qa/evidence/auth-session-path-20261124/suites-camino-sesion.json`), el camino de sesión son **44
  pruebas y 44 pasan con `AUTH_STATUS_INTEGRATION=1`** (11 + 7 + 6 + 6 + 6 + 5 + 3; sin la bandera,
  `authorization-status-codes` aporta 5 + 1 omitida por diseño) y el guard reporta **16/16 controles**. Los
  tres se arreglaron con bump **parche** (`2.29.0 → 2.29.1`, `2.108.0 → 2.108.1`, `2.25.0 → 2.25.1`):
  corregir una cifra no suma control, y un bump inflado falsearía el historial del agente.
- **Dos controles nuevos que `agents:coverage` exigió al reconsolidar el ruteo.** `apexos-seguridad`
  `2.41.0 → 2.42.0` (regla 56: un contrato de ingreso se certifica con la prueba de servidor real levantada
  y la cifra publicada declara sus omitidas) y `apexos-brief` `2.88.0 → 2.89.0` (regla 102: la evidencia que
  nace después de publicado el alcance recalcula el inventario `A/M/D` y toda cifra del brief tiene un
  artefacto que la reproduce). La cobertura volvió a `BLOQUEADO` con ellos en `in-sync` aunque hubieran
  bumpiado horas antes en la misma intervención: **la frescura se mide contra `origin/desarrollo`, y ese ya
  contenía el bump previo**. Controles añadidos a mano en `agents/registry.json`:
  `residual-mismo-blob-mismo-manifiesto`, `contrato-con-prueba-de-servidor-real`,
  `cifra-de-brief-con-artefacto-reproducible`.
- **No se toca** en esta ronda: `apexos-frontend` (ninguna pantalla cambió), `apexos-db-nube` (ningún
  esquema ni migración) y los dos auditores (dictamen, no dueños de este diff).

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

## 13. Segunda ronda: el camino de sesión cerrado (2026-11-24, pedido «procede con lo que hace falta»)

**Qué se pidió y cómo se interpretó.** Después del cierre publicado (`134816de`) el dueño dijo:
*«procede con lo que hace falta y garantizame que todo quede implementado bajo las mejores prácticas
recomendables y lo que buscamos con la herramienta»*. Con `AGENTS.md` delante, eso autoriza **seguir en
`desarrollo`** y cerrar los residuales que la propia intervención declaró; no autoriza promover,
desplegar, encender banderas, correr el backfill ni tocar DNS. Los residuales se clasificaron antes de
tocar nada: **construibles por el equipo** (el camino de sesión) y **del dueño** (promoción, bandera +
C.1/C.2/C.3, ápice en el registrador, el clic en navegador con la sesión del operario intacta).

### 13.1 El pendiente que no estaba medido: ¿un correo puede pertenecer a varias empresas?

`login()` resolvía la identidad con una lectura **suelta** por correo. En este esquema eso no es un
detalle de estilo: el único índice único de `User` es `@@unique([tenant_id, email])`, así que **la misma
dirección puede existir en varias empresas**, y sobre un índice así «la primera fila que aparezca» es una
decisión al azar. Antes de tocar el código se midió con un instrumento nuevo y de solo lectura,
`scripts/security/auth-email-collision-census.js`:

| Ambiente | Veredicto | Empresas | Usuarios | Correos en varias empresas | Detalle |
|---|---|---|---|---|---|
| QA | `COLISION_VIVA` | 27 | 550 | **7** | uno activo en **4** empresas; 419 usuarios inactivos |
| Producción | `SIN_COLISION` | 9 | 211 | **0** | el riesgo es latente, no teórico |

Tres consecuencias que corrigieron el enfoque: (a) **la multiplicidad hay que manejarla, no
simplemente rechazarla** —un 401 del tipo «tu correo está en varias empresas» sería un aviso de
existencia y cerraría el ingreso de esas 7 personas—; (b) el desempate se hace **con la clave**, que es
lo único que distingue a la persona; si la clave no desempata, salida uniforme; (c) se verificó el
riesgo operativo del cambio: **las 9 cuentas de correo que usan los arneses de certificación no
colisionan** (una colisión ahí habría roto certificaciones de HR, transporte, torre, marketing y
comercio en silencio, con el mismo 401 y sin pista).

### 13.2 Lo que se cambió (tres cosas, no dos)

| Archivo / función | Antes | Después |
|---|---|---|
| `apps/api/src/security/authorizationState.js` | `AUTHORIZATION_SNAPSHOT` atado a `where u.id = cast($2 as int4)` | se divide en `AUTHORIZATION_SNAPSHOT_BODY` + `AUTHORIZATION_SNAPSHOT`; nace `readAuthorizationSnapshotsByEmail(email, limite = 8)` con la **misma** proyección de cuatro columnas, `where lower(u.email) = $2 order by u.id limit cast($3 as int)` |
| `login()` en `apps/api/src/modules/auth/service.js` | lectura suelta de correo + `bcrypt` sobre la fila elegida al azar | **1 sentencia** con todas las filas del correo; `bcrypt.compare` **en paralelo** contra cada hash (o `DUMMY_PASSWORD_HASH` si no hay filas, para que el login no sea un oráculo de correos); `admitidas = coinciden && user.active && tenant.active`; si `admitidas.length !== 1` → **el mismo 401 con el mismo texto, cero sesión creada**, y `LOGIN_CORREO_AMBIGUO` se telemetrya solo cuando coinciden más de una admitida |
| `refresh()` en el mismo archivo | snapshot (vía `validateAuthorization`) **+ 3 lecturas** de usuario/rol/empresa | **1 sentencia**: `rotateSession` recibe `{ id, tenant_id }` y el claim `role` sale del payload que `validateAuthorization` ya devolvió. La guarda `!user || !user.active` que se quitó está **subsumida**: `USER_REVOKED`, `TENANT_REVOKED` y `AUTHORIZATION_STATE_MISSING` se rechazan siempre, no solo con enforcement |
| `fingerprintLogin()` en el mismo archivo | snapshot **+ 4 lecturas** (`findFirst` con `include` de rol) | **1 sentencia**, y el contraste de empresa que hacía el `where { id, tenant_id }` se hace sobre el perfil del snapshot |

### 13.3 El guard que valida el SQL contra la base real

`scripts/security/auth-session-sql-guard.js` carga `security/authorizationState.js` con `core/prisma`
stubbeado en `require.cache` para **capturar las sentencias que el código manda** (si mañana cambia el
SQL, cambia lo que se verifica; una copia en el fixture se oxida sin avisar) y las ejecuta
`PREPARE` + `EXECUTE` + `\gdesc` dentro de `BEGIN READ ONLY` contra el ambiente del `--env-file`.
Evidencia en `docs/qa/evidence/auth-session-path-20261124/`:

- **QA** `SENTENCIAS_VALIDAS` — `login_por_correo` **2 filas / 242 ms**, `perfil_por_id` 1 fila / 164 ms.
  Dos filas no son un defecto: es el correo con colisión real que la propia base escogió para probar.
- **Producción** `SENTENCIAS_VALIDAS` — 1 fila / 268 ms y 1 fila / 269 ms, con la sesión viva resuelta
  dentro de la lectura por id.
- Con los valores **del fixture** (`muestra@apexos.test` y un UUID sintético) ambas dan 0 filas — por eso
  el instrumento elige los valores dentro de la transacción con `\gset` y exige `filas > 0`.

Tres trampas de psql quedaron escritas en el propio archivo, porque son las que producen un falso verde:
`EXECUTE` no acepta parámetros que sean subconsulta; `-R` es separador de **registros** (con él las
cuatro columnas del snapshot se volvían una línea ilegible y el parseo contaba 0 filas) → es `-F`; y
`psql -c` manda el bloque como una sola consulta simple, así que el `read only` del `BEGIN` explícito se
pierde con un aviso → el piso lo pone el servidor con `PGOPTIONS=-c default_transaction_read_only=on`,
medida que también se aplicó al censo. El `--selftest` del guard (16 controles) incluye los negativos:
un `update` inyectado en el script debe rechazarlo el guard y una columna perdida del snapshot debe
declarar la sentencia inválida.

### 13.4 El rojo del arnés que no era de este cambio (y por eso se curó igual)

`apps/api/test/authorization-status-codes.test.js` llegó rojo con `REDIS_URL is required`. Atribución en
tres pasos: `git stash push` **solo mis archivos** → sigue rojo; `git worktree` despegado en HEAD (que
**no trae `config/*.env`**, aviso para la próxima atribución) → mismo rojo; y la traza apunta al `require`
de `middleware/tenancy` → `core/tenantCache` → `fabric/redisConfig`. Rojo **ambiental y preexistente**,
que además tapaba el contrato 401/403 que ese archivo protege, así que se curó en el mismo paquete con
`process.env.DISABLE_REDIS = "true"` y su comentario del porqué. Un rojo del arnés que solo se declara y
se deja, vuelve a tapar el rojo real siguiente.

### 13.5 Lo que queda después de esta ronda

- **Promoción** de T1 + T2 + §13 a `develop` y luego a `main`: **dueño**. El manifiesto v2 tiene que
  declarar el módulo `auth` y el inventario exacto de este §13 (dos `src`, tres `test`, dos
  `scripts/security`, cuatro JSON de evidencia, brief, anti-patrones y los seis `SKILL.md` + `agents/`).
- **`DESPUÉS` sobre el artefacto servido** (`certify:hr-auth-latency` y la puerta de presupuesto contra
  QA): **`apexos-performance` + `apexos-qa`**. Esta máquina no puede certificar el binario desplegado.
- **Clic en navegador** con la cuenta de prueba y la sesión del operario intacta: **dueño**.
- **Bandera `HR_EVIDENCE_STORAGE_ENABLED` + C.1/C.2/C.3** y **ápice DNS**: **dueño**, sin cambio desde §10.


## 14. La promoción a `develop`: el `develop` promovido no era el árbol que se creía

El `desarrollo` certificado iba 254 commits adelante y el `origin/develop` servido 119 adelante del
antepasado común (`36111a6a`). Copiar los archivos de desarrollo sobre develop —el método que se usó en
otras promociones— habría borrado el aislamiento de tenant de `cd3a88e5` y los módulos de liquidación que
nunca bajaron a desarrollo. El método que se usó:

- Retro-integrar a **desarrollo** el guard de tenant de `updateRoute` con su prueba y su control de
  mutación (`31a36e77`), para que el portón de origen compare contra el baseline real y no contra una
  versión vieja de la misma ruta.
- Reconstruir el candidato por **fusión a tres vías por ruta** sobre el tip de `origin/develop`, registrar
  el linaje con `git merge -s ours origin/desarrollo` (el árbol publicado declara los commits certificados
  sin arrastrar el resto de la rama) y tomar de desarrollo el texto canónico de los `SKILL.md` para que los
  `sha256` del `registry.json` cuadren.
- Certificar **el árbol del candidato**, no el de trabajo: suitas del paquete 70/70, suite web del monitor
  7/7, `auth-session-sql-guard --selftest` 16/16, presupuesto de reloj con selftest aprobado,
  `node --check` en las tres rutas JS de fusión y parseo TSX con 0 diagnósticos frente a 1 de control de
  mutación. El inventario quedó en 61 rutas y solo 3 salieron con excepción nominal de origen.

La fusión medida cayó dos veces y las dos se corrigieron antes de publicar: el presupuesto de evidencia del
monitor perdió la carga del archivo de ambiente (`--env-file=...`) y el párrafo del estado vacío quedó con
un ternario envuelto en llaves, JSX inválido. Ninguno de los dos lo habría avisado un `git diff --stat`.

### 14.1 Los rojos de la suite completa: atribuidos, no absorbidos

Sobre el árbol ya fusionado con el `develop` nuevo (`6a503dd6`), el candidato corre 1.327 pruebas de API
(**1.323 pasan**, 2 rojos, 2 omitidas) y 767 de web (**753 pasan**, 14 rojos). El baseline de web en el árbol
de trabajo es 885/894. Cada rojo tiene nombre y causa en
`docs/qa/evidence/auth-session-path-20261124/suite-plataforma-candidato.json`: siete son
`ERR_MODULE_NOT_FOUND` o `ENOENT` de raíz porque la worktree despegada no tiene `node_modules` (ESM ignora
`NODE_PATH`), uno es la guarda del propio arnés que solo pasa en un árbol instalado, uno es
`@vladmandic/human` declarado y no instalado en esta máquina —cae igual en el árbol de trabajo—, cuatro son
deuda de portada/nómina que cae **también** en el baseline, y uno es real pero **heredado de la rama
destino**.

Ese último es el que valía la pena medir: la prueba `fix concurrencia` prohíbe `pg_advisory_xact_lock` en
`apps/api/src/modules/hr/service.js`. Hoy hay **6** en `origin/develop` y los mismos **6** en `origin/main`
(`runPayrollLiquidation`, `runEmployeeTerminationLiquidation`, `deleteEmployeeTerminationLiquidation`,
`runSocialBenefitProvisions`, `runSocialBenefitPayments`, `deleteSocialBenefitPaymentDocument`), y el
candidato conserva los 6 blobs sin añadir ninguno. En desarrollo la prueba pasa 8/8 por una razón que no es
un avance: esas funciones nunca bajaron a desarrollo. Un candado bloqueante no avisa al operario —espera
hasta que Prisma aborta y sale como 500—, así que la deuda es de verdad, pero es de la rama que ya la tenía
y se promueve como está.

### 14.2 Pendientes con dueño y con lo que hay que decidir

- **Migrar los 6 `pg_advisory_xact_lock` de liquidación al helper acotado `acquireBoundedScopeLocks`** (los
  5 sitios que sí conozco ya están migrados): **dueño del paquete de nómina/liquidación**, que es quien
  tiene esas funciones en su rama. Intervención propia con su manifiesto, su prueba y su control de
  mutación. Se mide con `grep -c pg_advisory_xact_lock apps/api/src/modules/hr/service.js`.
- **Dos candidatos sobre la misma ruta, resuelto absorbiendo y no pisando** (ya no es pendiente: se cerró en
  esta misma corrida). La sesión concurrente del selfie promovió su paquete a `develop` (`52a8d9a7` → tip
  `6b42b365`) mientras este candidato estaba armado, y compartía **una sola ruta** con el mío:
  `apps/api/src/modules/hr/service.js`. Empujar el candidato viejo sobre el tip nuevo habría revivido
  `webPunchSelfie.js` y revertido su compuerta única, así que el candidato **absorbió el tip del destino por
  fusión** (`6a503dd6`) y volvió a certificarse entero sobre ese árbol. Verificado por blob:
  `mobile-identity.js` y `hr-single-selfie-gate.test.js` idénticos a `origin/develop`, `webPunchSelfie.js`
  ausente en los dos, y `service.js` sin una sola referencia a esa compuerta.
- **`DESPUÉS` end-to-end sobre el artefacto desplegado en QA** (`certify:auth-session`,
  `certify:hr-monitor-budget:qa`, `certify:hr-auth-latency:qa`): **dueño**, porque `config/qa.env` no
  declara `CERT_LOGIN_EMAIL` / `CERT_LOGIN_PASSWORD` y el certificado necesita una cuenta real de QA. Se
  construye la cuenta si hace falta; la bandera `HR_EVIDENCE_STORAGE_ENABLED` y el ápice DNS siguen sin
  cambio desde §10.

### 14.3 El portón de replay: el `--ref` elige qué árbol se mide, y medir el destino da 51 rojos falsos

Reincertificado el replay sobre el árbol congelado, el instrumento devolvió `ROTO carry` en las cinco
rutas de producto del paquete. No era el candidato: era la forma de llamarlo. La compuerta compara

```js
const wanted = blobAt(item.from_ref || spec.origin_ref, item.file, cwd);   // el blob de origin/desarrollo
const actual = currentBlob(item.file, cwd, against, ref);                  // el arbol que se mide
```

y el `--ref origin/develop` que se le pasó en la primera corrida selecciona **el árbol medido**, no el de
referencia. Con esa bandera el portón comparaba `origin/develop` contra `origin/desarrollo` —dos ramas que
sí divergen— y reportaba 51 invariantes rotas sobre un candidato que no había tocado ninguna de esas rutas.
La corrida válida es `--against commit --ref HEAD --cwd <worktree-del-candidato>`, desde dentro del árbol
congelado, y devuelve **51/51 carry válidas, 0 deletes, 0 edits por hunks**
(`docs/qa/evidence/auth-session-path-20261124/replay-arbol-candidato-develop.json`). Las dos corridas con
`--ref origin/develop` se descartaron y no quedan como evidencia.

La lección no es del instrumento sino del protocolo: un `ROTO carry` masivo (todas las rutas del inventario,
incluidas las que nadie tocó) es señal de que se midió el árbol equivocado, no de que el paquete revierta
trabajo ajeno. Un rojo que aparece en rutas que el candidato no modificó hay que atribuirlo antes de
creérselo.

### 14.4 Las compuertas rojas por forma: un `allowed_paths` sin barra y dos `script` mal relativos

`qa:promotion:gates` respondió `rutas fuera de alcance` **listando las 61 rutas del paquete**, incluida
`apps/api/src/modules/auth/service.js`, que estaba declarada en el inventario y en `allowed_paths`. La causa
no era el candidato: `scripts/validate-promotion-scope.js:13` (`matchesAllowed`) solo perdona el prefijo
cuando la entrada termina en `/`, y este manifiesto declaraba `apps/api/test`, `scripts/certifications`,
`.qoder/skills` sin ella —ninguna ruta del paquete podía coincidir—. Antes de tocar el árbol se midió el
invariante real: el diff neto `origin/develop..candidato` dio **61 entradas idénticas** a `expected_changes`,
cero sobrantes y cero faltantes, así que el inventario era cierto y el documento estaba mal escrito. Se corrigió
`allowed_paths` a las 61 rutas exactas (la lectura estricta de «rutas puntuales») y **no** se ensanchó permiso
ni se rehízo el candidato, que era la tentación de menor resistencia.

El segundo rojo venía del pre-QA: `certification.script` y `regression_certification.script` decían
`../../certifications/...`, pero `validate-preqa-promotion-evidence.js:19,36` resuelve contra **el directorio
del manifiesto** (`docs/qa/manifests`), así que apuntaban a `docs/certifications/...`. Con
`../../../scripts/certifications/...` la compuerta pasó.

Cierre medido, sobre el árbol congelado `bb2b29f6`: `ALCANCE DE PROMOCION VALIDO: monitor-latencia-sesion-20261124
(61 rutas, origen verificado contra origin/desarrollo)`, `AUTORIZACION PRE-QA VALIDA: monitor-latencia-sesion-20261124`
y `INVARIANTES DE REPLAY VALIDAS: 51/51`.
