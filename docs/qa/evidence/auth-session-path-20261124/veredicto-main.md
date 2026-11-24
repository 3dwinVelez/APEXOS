# Veredicto de la pata `develop -> main` — paquete de latencia del monitor y camino de sesión

Change id: `monitor-latencia-sesion-main-20261124`. Candidato: rama auxiliar local
`codex/qa-monitor-latencia-sesion-main-20261124`, funcional `82664fee9947e01edbc91e86cb078d936e8e98ea` sobre
`origin/main b08699e3214a41f946cf3080b313cbfe637e33dd`.

## Por qué replay y no fusión

`git rev-list --count origin/main..origin/develop` = **859**. `origin/main` conserva fusiones productivas que
`develop` no tiene y `develop` conserva frentes que nunca se promocionaron. Llevar los blobs de `develop` sobre
`main` habría hecho cuatro cosas, todas medidas antes de commitear:

1. Caer el API en Producción: `auth/service.js` de develop pide `require("../hr/personal-webauthn")` y esa ruta
   no existe en `main`.
2. Revertir el motor de liquidación y el retiro: el candidato conserva `pg_advisory_xact_lock` **6** veces y
   `buildEmployeeTerminationLiquidation` **4** porque parte del blob de `main`.
3. Promocionar tres migraciones sin aplicar a la base de Producción (`hr_shared_devices`, `hr_face_enrollments`,
   `hr_webauthn_credentials`) con sus módulos y sus dos pantallas.
4. Dejar en el árbol promovido dos instrumentos que revientan al ejecutarlos
   (`auth-session-sql-guard.js` y `auth-email-collision-census.js`, ambos con `./recovery-readiness.js` ausente).

## Qué se transportó

| Capa | Rutas | Prueba |
|---|---|---|
| carry desde `origin/desarrollo` | 50 | blob igual, archivo por archivo (`candidato-main.txt`) |
| carry desde `origin/develop` | 1 · `talento-humano/rutas/page.tsx` | `c79f3da7`, el blob que QA sirvió; `desarrollo` tiene `df9fd61d` con 53 líneas de otro frente |
| replay por hunks sobre el blob de `main` | 3 · `auth/service.js`, `hr/routes.js`, `hr/service.js` | 0 líneas añadidas huérfanas + paridad de cuerpo de función |
| capa de documentación (viaja dentro del carry) | 4 | los dos manifiestos, este veredicto y el reporte del replay, en su propio commit encima del funcional |

Invariante del replay (`npm run qa:promotion:migration`, `--against index` sobre las 54 rutas del índice):
**73/73 válidas** — 49 `carry` (48 desde `origin/desarrollo` y 1 desde `origin/develop`) y 24 `delete` de rutas
ajenas que siguen ausentes en lo que se publica. El reporte viaja en `replay-arbol-candidato-main.json`; la
re-medición contra la punta commiteada (`--against commit`) es `replay-punta-main.json`, salida declarada que
no puede viajar en el commit que describe y se sube con la evidencia del DESPUÉS.

Fusión medida en `invariantes-replay-main.json`:

| Archivo | Añadidas | Huérfanas | Cuerpos de función byte a byte |
|---|---|---|---|
| `hr/service.js` | 32 | 0 | `listRouteEventSummaries` 5.445 caracteres |
| `auth/service.js` | 46 | 0 | `login` 1.899 · `startSession` 711 · `me` 353 · `refresh` 2.610 |
| `hr/routes.js` | 1 | 0 | la línea de `/hr/routes/event-summaries` exacta |
| `rutas/page.tsx` | 41 | 0 | `EVIDENCE_FETCH_CONCURRENCY` presente |

Suitas sobre el árbol candidato: **70 pruebas, 69 pasan, 0 fallan, 1 `SKIP` explícito y preexistente**
(`authorization-status-codes.test.js`). `node --check` y resolución de `require` sobre las rutas JS del
candidato: **0 módulos huérfanos**.

## ANTES / DESPUÉS del negocio, en cifras

| Lectura | ANTES | DESPUÉS |
|---|---|---|
| Resumen de eventos del monitor (mismo día y tenant, 266 = 266 marcaciones) | 7.000 ms · 608.256 bytes | 500 ms · 16.384 bytes |
| Ronda gruesa auditada (mismo día, mismos ids, 27 = 27 y 25 = 25 evidencias) | 46.557.744 bytes · 7.740/9.790 ms | 157.696 bytes · 940/1.060 ms |
| Camino de sesión (`/auth/me`, login, refresh) | 4 sentencias por petición | 1 sentencia reutilizando el snapshot de autorización |
| Latencia diferencial en QA | mediana 1.538 ms | mediana 407 ms · factor **0,26** · 18 casos, 0 divergencias |

## Lo que no viaja, declarado

- El árbol de gobernanza del paquete (20 rutas de `agents/**` y `.qoder/skills/**`): `main` no tiene `agents/` y
  su canon de `skills` es anterior. La canonía vive en `desarrollo` y `develop`.
- La reparación de `scripts/certifications/hr-monitor-evidence-demand-qa.js`: `main` conserva `726ee951`, la
  reparación `6208f982` queda en `desarrollo`. La evidencia **12/12** que produjo sí viaja, y se remide con
  `npm run certify:hr-monitor-evidence:qa -- --env-file=config/qa.env`.
- Los dos instrumentos de seguridad del camino de sesión y su helper `recovery-readiness.js`.
- `apps/api/test/auth-webauthn-login.test.js` (171 líneas ajenas) y la regla de selfie en las cuatro
  marcaciones web: `mobile-identity.js` no entra al inventario y conserva su blob de `main` (`756b0572`).
  **Con esta promoción Producción no va a exigir selfie en las cuatro marcaciones web.**
- La pantalla `dispositivos-marcacion` y `rostros`, el módulo de identidad de dispositivo compartido y las tres
  migraciones citadas.

## DESPUÉS de Producción: medido sobre la punta servida

`GET https://apexos-api-prod-production.up.railway.app/health` devuelve
`{"modules":19,"commit":"cf2adc59d446","service_certification":"products-v2"}`: el binario en pie es el
candidato promovido, no el anterior. Con ese ancla se corrieron los dos instrumentos.

**Presupuesto de reloj** (`certify:hr-monitor-budget:production`, día 2026-11-24, 3 muestras por lectura,
`despues-produccion.json`):

| Lectura | ANTES (2026-11-24T13:51) | DESPUÉS (2026-11-24T18:54) |
|---|---|---|
| Contadores del día fijado (`event-summaries?date=`) | 6,5 KB · p50 3.238 · p95 3.500 ms | **0,1 KB · p50 1.850 · p95 1.851 ms** |
| Mapa del día | 0,3 KB · p50 1.873 · p95 3.246 ms | 0,3 KB · p50 1.974 · p95 **3.405 ms** |
| Reporte de asistencia (un día) | <0,1 KB · p50 1.261 · p95 1.364 ms | 5,7 KB · p50 1.281 · p95 1.282 ms |
| Contadores sin fecha (referencia) | 6,5 KB · p95 4.129 ms | 6,5 KB · p95 3.410 ms · referencia sin veredicto |

Cero binarios inline en las cuatro lecturas, en los dos lados de la mesa. La compuerta quedó **en rojo por una
sola razón**: el mapa del día con p95 de 3.405 ms contra un presupuesto de 3.000 ms. Esa lectura ya estaba roja
en el ANTES (3.246 ms) y no es una ruta de este paquete: el mapa no cambió de código, y su piso es el viaje al
pooler por petición autenticada.

**Camino de sesión** (`certify:auth-session`, `despues-auth-produccion.json`): `login` 200, `/auth/me` 200,
consulta autenticada 200 y **5 de 5 rechazos en 401** (sin token, token basura, `alg none`, firma con clave
ajena, firma alterada). `revocation.measured: true` con `enforced: false`: la revocación sigue sin exigirse,
que es la Fase 2 del flag `AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED` y no este paquete.

Un hallazgo del DESPUÉS, declarado: el instrumento pedía permiso de `services` para la consulta autenticada y
en Producción ese módulo no está habilitado para la empresa modelo (`403 PERMISO_DENEGADO`, medido en
`sondeo-produccion.txt`), así que reventaba antes de probar los rechazos. No se relajó la exigencia: se declaró
la ruta por donde se mide (`CERT_PROBE_PATH`, ahora apuntando al endpoint del propio paquete). El cambio vive en
`scripts/certifications/auth-session-readiness.js` de `desarrollo` y **no viaja** a `main`, igual que las otras
reparaciones de instrumentación de esta intervención.

```text
npm run certify:hr-monitor-budget:production -- --output=docs/qa/evidence/auth-session-path-20261124/despues-produccion.json
CERT_ENVIRONMENT=production CERT_API_URL=https://apexos-api-prod-production.up.railway.app \
  CERT_EXPECTED_COMMIT=cf2adc59d44693f368418fb20cb66a06a388daa3 \
  CERT_PROBE_PATH=/api/v1/hr/routes/event-summaries?date=2026-11-24 npm run certify:auth-session
```
