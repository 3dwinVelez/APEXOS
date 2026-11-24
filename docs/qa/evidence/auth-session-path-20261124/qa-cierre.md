# QA del candidato publicado (develop `3303a95532a3`)

Medido el 2026-11-24 contra `https://apexos-api-qa-production.up.railway.app`. El arbol servido se
ancle por `GET /health`, que respondio `{"status":"OK","version":"2.0","modules":19,
"commit":"3303a95532a3","service_certification":"products-v2"}`: es la punta certificada de
`origin/develop`, no un build anterior.

## Lo que paso

| Instrumento | Veredicto | Numeros |
|---|---|---|
| `certify:auth-session` (`scripts/certifications/auth-session-readiness.js`) | verde | login 200, `/auth/me` 200, `/services/orders` 200 y **5 de 5 rechazos** en 401 (sin token, token basura, `alg:none`, firma con clave ajena, firma alterada). Revocacion medida, no exigida: `{"measured":true,"enforced":false}` porque los banderines de aplicacion siguen apagados. Evidencia: `qa-auth-session.json` |
| `certify:hr-monitor-evidence:qa` (`scripts/certifications/hr-monitor-evidence-demand-qa.js`) | verde | **12 de 12 controles** sobre el tenant de control de aislamiento: la evidencia viaja por referencia (`activity_summary_excludes_payload`, `punch_summary_excludes_payload`), se carga on demand (`activity_loaded_on_demand`, `punch_loaded_on_demand`), el rol solo-marcacion obtiene 403, el id inexistente 404 y **el tenant vecino obtiene 404** (`cross_tenant_evidence_denied`). Evidencia: `qa-monitor-evidence-demand.json` |
| `certify:hr-monitor-budget:qa` con la cuenta real de NYVORA, dia mas cargado (`--date=2026-11-23`) | verde | mapa del dia **52 KB · p95 1.152 ms**, contadores con fecha **3 KB · p95 649 ms**, reporte de asistencia **24 KB · p95 690 ms**, contadores sin fecha (referencia exenta) **7 KB**. **0 binarios inline** en las cuatro lecturas. Evidencia: `qa-monitor-budget-dia-cargado.json` |
| `certify:hr-monitor-budget:qa`, mismo tenant, dia de hoy | verde | 0 KB / 0 KB / 12 KB, p95 maximo 634 ms, 0 binarios inline. Evidencia: `qa-monitor-budget.json` |
| `certify:hr-monitor-budget:qa` con la cuenta del propio arnes (dia 2026-11-24, con dos marcaciones y sus dos evidencias escritas minutos antes) | verde | mapa **17 KB**, asistencia **8 KB**, contadores **0 KB**, **0 binarios inline**. Evidencia: `qa-monitor-budget-harness.json` |
| `certify:hr-auth-latency:qa` (`scripts/certifications/hr-auth-latency-differential.js --env=qa --limit=3`) | verde | **18 casos, 0 divergencias, 0 anomalias 401**: una sentencia decide igual que cinco con mediana **407 ms vs 1.538 ms** (factor 0,26). Evidencia: `docs/qa/evidence/hr-auth-latency-20261119/diferencial-qa-1795543145867.json` |

La comparacion gruesa (el contador que leia todo el historico y el listado que arrastraba la selfie
en base64) esta medida en Produccion, que es donde hay volumen: ver `docs/briefs/
2026-11-24-monitor-marcaciones-latencia.md`. NYVORA de QA tiene **113 marcaciones en 120 dias** y su
mejor dia son 20; por eso aqui el numero que importa es "0 binarios inline y todo bajo presupuesto",
no el factor de aceleracion.

## Retiro de las cuentas de medicion

Tres cuentas efimeras, creadas por el propio servicio del producto y retiradas al cerrar, con login
antes y despues (`qa-retiro-cuentas.json`):

| Cuenta | Tenant | Retiro | Login antes | Login despues |
|---|---|---|---|---|
| `user 846` (empleado de marcacion) | `fd3e2802` | `PATCH /api/v1/admin/users/846/status` | 200 | **401** |
| `user 847` (administrador del arnes) | `fd3e2802` | `admin.setUserActive` (servicio del producto) | 200 | **401** |
| `user 845` (APEX_ADMIN de NYVORA) | `1d162ffd` | `admin.setUserActive` (servicio del producto) | 200 | **401** |

## Dos trampas del instrumento, corregidas en `desarrollo`

1. **`--flag=value` se caia al suelo.** El analizador de argumentos de
   `scripts/certifications/hr-monitor-evidence-demand-qa.js` solo entendia `--flag valor`; con la
   forma `=` la corrida pidio `--api-url=https://...` y termino golpeando `http://127.0.0.1:3100`, y
   habria escrito su evidencia en la ruta versionada por defecto
   (`docs/qa/evidence/hr-monitor-evidence-demand-20260824/certification.json`) en vez de la pedida.
   La primera corrida fallo en el primer `fetch`, antes de abrir el bloque que escribe, asi que no
   toco ni evidencia ni datos: se verifico que ese archivo sigue con su `generated_at` del 2026-08-24
   y el arbol de git limpio.
2. **El almuerzo sin selfie hoy es 400.** El instrumento mandaba `inicio_almuerzo` y `fin_almuerzo`
   sin foto y esperaba 200. Develop (y por lo tanto QA) ya aplica `WEB_SELFIE_REQUIRED_TYPES`, las
   cuatro marcaciones web piden selfie, y responde `SELFIE_REQUERIDA`. No es una caida del paquete:
   es la regla certificada el 2026-11-24. Se reparo el instrumento para mandar la foto y, encima, se
   le agrego el control positivo (`inicio_almuerzo_sin_selfie_rechazada`,
   `fin_almuerzo_sin_selfie_rechazada`) para que la exigencia quede medida y no asumida.

Ambas correcciones son de **herramienta, no de producto**: viven en `desarrollo` y no viajan en este
paquete (la ruta no esta en el inventario de 61). QA las tiene desde esta corrida; `develop` y `main`
reciben el instrumento en su siguiente ronda.

## Paridad con lo que va a servir `main`: lo que NO sube con este paquete

`apps/api/src/modules/hr/mobile-identity.js` **no hace parte de las 61 rutas** y su blob es distinto:
`origin/main` = `756b0572178bb137de98dc0ee346e09378cdfec1`, `origin/desarrollo` =
`f9e8ea27bb32e92920d25983ed2db899d5d5538f`. Es decir: con esta promocion Produccion **no** va a exigir
selfie en las cuatro marcaciones web; eso sigue siendo un paquete aparte, con su propia compuerta.

Lo que si se promueve y por eso es legitimo citar esta corrida es el camino de sesion (una sentencia,
los cinco rechazos) y el acote por dia con listas anunciadas por referencia. El porton de inline no
depende de ese archivo: en Produccion se re-mide despues del despliegue con el mismo instrumento
(`--env-file=config/production.env`), que es donde el numero gordo existe.
