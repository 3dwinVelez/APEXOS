# Veredicto de la pata `develop -> main` — paquete de latencia del monitor y camino de sesión

Change id: `monitor-latencia-sesion-main-20261124`. Candidato: rama auxiliar local
`codex/qa-monitor-latencia-sesion-main-20261124`, funcional `65b9dd7a9d66565b7f728124c4208f484bc58c07` sobre
`origin/main 3baf8e4a409bae6a9fe32f5f2191a8cd560cbf23`.

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
| carry desde `origin/desarrollo` | 45 | blob igual, archivo por archivo (`candidato-main.txt`) |
| carry desde `origin/develop` | 1 · `talento-humano/rutas/page.tsx` | `c79f3da7`, el blob que QA sirvió; `desarrollo` tiene `df9fd61d` con 53 líneas de otro frente |
| replay por hunks sobre el blob de `main` | 3 · `auth/service.js`, `hr/routes.js`, `hr/service.js` | 0 líneas añadidas huérfanas + paridad de cuerpo de función |
| commit de documentación | 3 | dos manifiestos y este veredicto |

Invariante del replay (`npm run qa:promotion:migration`, `--against index`): **70/70 válidas** — 46 `carry` y
24 `delete` de rutas ajenas que siguen ausentes. Re-medición contra la punta: `replay-punta-main.json`, salida
declarada (no puede viajar en el commit que describe).

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

## DESPUÉS de Producción: pendiente del despliegue, no afirmación

`origin/main` sirve hoy `3baf8e4a409b` (medido en `GET https://apexos-api-prod-production.up.railway.app/health`
→ `{"modules":19,"commit":"3baf8e4a409b","service_certification":"products-v2"}`). El DESPUÉS solo puede
escribirse cuando ese `commit` devuelva el sha promovido, y entonces se corren, anclados a ese sha:

```text
npm run certify:hr-monitor-budget:production -- --output=docs/qa/evidence/auth-session-path-20261124/despues-produccion.json
CERT_ENVIRONMENT=production CERT_API_URL=https://apexos-api-prod-production.up.railway.app CERT_EXPECTED_COMMIT=<sha> npm run certify:auth-session
```

Hasta esa lectura existir, esta pata está publicada pero no cerrada en Producción.
