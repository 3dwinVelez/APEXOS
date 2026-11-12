# Brief — La torre de control renueva su credencial sola

- **ID**: `2026-11-12-torre-credencial-autorenovable`
- **Fecha**: `2026-11-12`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "revisa la torre de control ya que los puntos de medicion no estan conectados reqiero que conectes todo de maner sincrona y que empiece ah tomar vida"

## 0. Capa de la intervención

No es una capa visual: es **conexión de datos**. El dueño pidió que los puntos de medición estén conectados de forma síncrona y que el panel "tome vida". La corrección es de cableado y de ciclo de vida de la credencial; el `apps/control-tower/public/**` (HTML, CSS y JS del panel) no se tocó, así que no hay que re-certificar la gramática del gráfico —se re-certifica igual, como no-regresión—.

## 1. Objetivo

Que ningún punto de medición de la torre vuelva a quedarse ciego por una credencial vencida: la torre renueva su JWT con el token de renovación del ambiente **antes** de que venza, persiste el par rotado en su propio `dataDir` (gitignored) y, cuando no puede sostenerla sola, lo declara con su estado, su acción y un comando que sí se puede ejecutar.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/control-tower/lib/credential.js` | Bombeo de credenciales por ambiente: agenda de renovación con margen, POST `/api/v1/auth/refresh`, adopción del `exp` del JWT heredado, respaldo del par rotado en `store.writeAux("credential")`, dictámenes `VIGENTE/RENOVADA/ESTATICO/TOKEN_VENCIDO/REVOCADA/SIN_CONEXION/SIN_CREDENCIAL/SIMULACION`. El estado publicado no lleva tokens. |
| `M` | `apps/control-tower/lib/config.js` | Nuevas claves `ENV_LOCAL_APEX_REFRESH` / `ENV_DEVELOP_APEX_REFRESH` / `ENV_MAIN_APEX_REFRESH`; sección `credentials` (`marginMs`/`retryMs`/`deniedRetryMs`/`timeoutMs`); `ENV_KEYS` exportada; `safeConfig` publica `apexRefreshConfigured` como booleano, nunca el valor. |
| `M` | `apps/control-tower/server.js` | Instancia el bombeo, lo corre **antes** del sondeo (`await credentials.ensure()`) y adjunta `environment.credential` al snapshot por ambiente. |
| `M` | `apps/control-tower/lib/recommendations.js` | Acciones de credencial (`CREDENCIAL_AUSENTE`, `CREDENCIAL_VENCIDA`, `CREDENCIAL_REVOCADA`, `CREDENCIAL_SIN_CONEXION`) con comando ejecutable; la credencial eclipsa los motivos genéricos `SIN_TOKEN`/`TOKEN_INVALIDO` porque es la causa más específica. |
| `M` | `apps/control-tower/lib/activity.js` | Un `401` ya no se lee `PERMISO_DENEGADO`: se mapea a `TOKEN_INVALIDO` (o `SIN_TOKEN` si el ambiente no tiene credencial); `403` sigue siendo `PERMISO_DENEGADO`. |
| `M` | `apps/control-tower/lib/probes.js` | La sonda `apex-control` separa el texto de `401` (credencial rechazada) del de `403` (sin permiso `apex-control`). |
| `A` | `apps/control-tower/tools/issue-credential.js` | `npm run control:credential -- --environment <id>`: login con usuario vigente, escribe el par en `.env.local` preservando las demás líneas y `chmod 0600`. La contraseña entra por variable de entorno, nunca por argumento. |
| `M` | `package.json` | Registra el script `control:credential` (la acción publicada por la torre era un comando que no existía). |
| `A` | `apps/control-tower/test/credential.test.js` | 9 pruebas del bombeo, incluida la de que el comando de la acción apunta a un script real. |
| `M` | `apps/control-tower/test/recommendations.test.js` | El dictamen de credencial somete al 401 suelto y la acción lleva el comando por ambiente. |
| `M` | `apps/control-tower/test/activity.test.js` | `401` → `TOKEN_INVALIDO`, `403` → `PERMISO_DENEGADO`, red caída → `SIN_CONEXION`. |
| `M` | `scripts/certifications/apex-control-tower-local.js` | Gate nueva `local_credencial_autorenovable`: modo `renovacion`, estado vivo, `expira` en el futuro, `reintentos: 0` y que el objeto publicado no contenga un JWT. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/*` | Evidencia regenerada (77 gates, 11 capturas y `telegram-outbox.json`). |
| `M` | `docs/qa/evidence/torre-consolidado-empresas-20261103/*` | Evidencia regenerada (57 gates, 3 capturas y los dos JSON). |
| `M` | `apps/control-tower/README.md` | Tabla de configuración con las claves `ENV_*_APEX_REFRESH`, la sección del bombeo y los conteos de la corrida. |
| `A` | `docs/briefs/2026-11-12-torre-credencial-autorenovable.md` | Este brief. |
| `M` | `agents/CHANGELOG.md`, `agents/registry.json`, los `SKILL.md` de `apexos-seguridad`, `apexos-performance`, `apexos-qa`, `apexos-brief`, `apexos-git-guardian`, `equipo-apexos` (y sus espejos en `agents/`) | Control nuevo por disciplina y bump semver. |

### Módulos (`change_intent.modules`)

- `control-tower`
- `tooling-package-scripts`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- `apps/api/**`: el contrato de autenticación (`POST /auth/refresh` sin `preHandler` de sesión, rotación con `revoke_reason: "refresh_rotated"`) se **consume** tal como está; no se modificó ni una línea del API.
- `apps/web/**`, esquema, migraciones y RLS.
- No se forja ningún JWT: la torre nunca recibe `JWT_SECRET` y no firma tokens; solo usa la ruta de login/refresh soportada.
- No sepromueve nada: `apps/control-tower/**` reposa solo en `desarrollo` y sus certificaciones no se citan como evidencia de promoción.
- Las credenciales cloud (`RAILWAY_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `ENV_*_PROJECT_ID`) siguen siendo acción del dueño; la torre las declara `Sin credenciales`.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: una credencial por ambiente, sin reuso del token local contra QA o PROD.
- Sin secretos en el brief ni en el diff. `apps/control-tower/.env.local` y `apps/control-tower/data/` están gitignored y **no** entran al inventario; el par rotado vive en `data/credential.json` (local, ignorado).
- El `exp` que lee la torre sirve para **programar** la renovación; la autoridad sobre si el token sirve la sigue teniendo la API.

## 5. Criterios de aceptación

1. `npm run control:test` → **178/178** en verde (nueve pruebas nuevas en `test/credential.test.js`).
2. `npm run certify:control-tower:local` → **77/77** con `local_credencial_autorenovable` en verde: la corrida dejó `{"estado":"VIGENTE","modo":"renovacion","expira":"2026-11-12T22:06:32.000Z","ultima_renovacion":null,"reintentos":0}` y `local_fuente_real` con `fuente: api`, **9 componentes**, 26.014 registros, `db_ms: 44` y 19/19 medidores con historia.
3. `npm run certify:control-tower:consolidado` → **57/57** sin regresión en el cockpit ni en el mapa de módulos.
4. Con el JWT de `.env.local` **vencido** y sin token de renovación, el panel no vuelve a decir `PERMISO_DENEGADO`: la lectura con permiso queda `TOKEN_INVALIDO`, la acción se llama `Emitir la credencial renovable de <ambiente>` y `environment.apexToken` se vacía para no seguir castigando la API con un token muerto.
5. Con `ENV_LOCAL_APEX_REFRESH` presente, la torre renova **sola** 10 minutos antes de que venza el acceso y persiste el par rotado en `apps/control-tower/data/credential.json`; reiniciar la torre **no** fabrica una sesión nueva: reaprovecha el JWT vigente que ya tiene.
6. Si la API rechaza el refresh (`401`/`403`), la torre pasa a `REVOCADA`, deja de reintentar cada sondeo (respaldo de 5 minutos) y la acción nombra la emisión del par nuevo.
7. `npm run control:credential -- --environment local` emite el par con `TOWER_CREDENTIAL_EMAIL`/`TOWER_CREDENTIAL_PASSWORD` del entorno y reescribe solo esas dos líneas de `.env.local` con `chmod 0600`; `--environment <invento>` responde con los tres nombres válidos y sale 2.
8. Ningún token —ni el de la torre ni el JWT— aparece en `certification.json`, en los JSON de evidencia ni en las capturas; y el objeto `credential` publicado por la API de la torre no contiene la cadena `eyJ…`.

## 6. Evidencia y certificación exigida

- Pruebas: `npm run control:test` (178 pruebas, `apps/control-tower/test/**`).
- Certificación: `npm run certify:control-tower:local` (77 gates) y `npm run certify:control-tower:consolidado` (57 gates).
- Evidencia: `docs/qa/evidence/apex-control-tower-f1/` (`certification.json`, `telegram-outbox.json`, once capturas) y `docs/qa/evidence/torre-consolidado-empresas-20261103/` (`certification.json`, `snapshot-ambientes.json`, `empresa-tenant-demo.json`, tres capturas).
- `certification_status` esperado: `local_passed_qa_pending`. La torre **no** se promociona ni se despliega, así que no hay corrida QA de railway para este bloque.

## 7. Capacidades protegidas

- **Lectura real por ambiente** — se certifica con `local_fuente_real` (exige `fuente: api`, componentes leídos del servidor y medidores con historia).
- **Credencial que se sostiene sola** — gate nueva `local_credencial_autorenovable` + `test/credential.test.js` (rotación real, margen, respaldo tras revocación, arranque sin rotear, simulación hermética).
- **Veracidad del dictamen** — `test/activity.test.js` fija `401 → TOKEN_INVALIDO`, `403 → PERMISO_DENEGADO`, red caída → `SIN_CONEXION`; la sonda separa los dos textos.
- **Acción ejecutable** — `npm run control:credential` existe en `package.json` y su prueba lo afirma; una acción cuyo comando no corre es un adorno.
- **No filtración de secretos** — `snapshot_no_filtra_el_token_de_la_torre`/`evidence_json` en ambas certificaciones y la aserción de que `pump.status()` no viaje el token.

## 8. Riesgos y rollback

- Riesgo: la rotación crea una sesión nueva en la base del puesto en cada arranque → Mitigación: la torre adopta el `exp` del JWT heredado y **no** renova si todavía es válido con margen; prueba dedicada («arrancar la torre no debe fabricar una sesión nueva en el puesto»). → Rollback: `git revert` del commit.
- Riesgo: dos instancias de la torre rotándose el refresh entre sí → Mitigación: `validateAuthorization` solo expulsa con `USER_REVOKED`/`TENANT_REVOKED`/`AUTHORIZATION_STATE_MISSING`, así que una sesión rotada por la otra torre sigue leyendo; el reuso queda observable como `REFRESH_TOKEN_REUSED` y la torre re-semilla desde `.env.local`. Se documenta como límite conocido y el puesto corre **una** torre.
- Riesgo: persistir el par rotado en disco → Mitigación: vive en `apps/control-tower/data/credential.json`, gitignored, con `statusFor()` publicando solo horas y dictamen; verificación de que `git diff --cached` no contenga `.env*` ni `data/`.
- Riesgo: el `401` se reinterpretaba como problema de permiso y el dueño concedía permisos de más → Mitigación: el motivo nuevo (`TOKEN_INVALIDO`) apunta a la credencial, no a la matriz.

## 9. Supuestos y preguntas abiertas

- Supuesto: el usuario `demo@apex.local` del seed de desarrollo sigue vigente y con permiso `apex-control` en el ambiente local. Verificado con la corrida: `/apex-control/status` responde 9 componentes y `/apex-control/tenants` responde 200 con 18 empresas.
- Supuesto: el acceso local dura 8 h y el refresh 30 días (`service.refresh()`), así que el bombeo cubre una jornada completa sin intervención y la renovación del refresh es humana una vez al mes.
- Pregunta (no altera el alcance): ¿el dueño quiere que la torre avise por Telegram cuando un ambiente pase a `REVOCADA`? Hoy la acción aparece en el panel y en el snapshot (`GET /api/status`); el Telegram no se tocó.

## 10. Autorizaciones requeridas

- [x] Trabajo y commit en `desarrollo` (autorización permanente del dueño para el cierre con push acotado a `origin/desarrollo`).
- [ ] Ninguna para QA/PROD: sus credenciales siguen siendo acción del dueño (tarea pendiente #40). Con el nuevo comando, emitirlas es `npm run control:credential -- --environment develop` con el usuario del ambiente, sin tocar infraestructura.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/control-tower/**,package.json,scripts/certifications/apex-control-tower-local.js,docs/qa/evidence/**,docs/briefs/2026-11-12-torre-credencial-autorenovable.md,agents/**,.qoder/skills/**"` → **Veredicto: OK** (sin `INTEGRAR_REMOTO` ni `CONFLICTO`; HEAD `7fd3f2c2` == `origin/desarrollo`).
- **Agentes consultados**: `equipo-apexos`, `apexos-brief`, `apexos-git-guardian`, `apexos-seguridad`, `apexos-performance`, `apexos-qa`.
- **Documentación a actualizar**: este brief y `apps/control-tower/README.md`.
- **Agentes a actualizar**: `apexos-seguridad` 2.22.0 → 2.23.0 (control 37: credencial autorenovable, el `401` no es un problema de permiso y la acción manda a un comando que existe), `apexos-performance` 2.14.0 → 2.15.0 (control 24: un punto de medición ciego por credencial es indisponibilidad y se mide como tal), `apexos-qa` 2.51.1 → 2.52.0 (control 65: la certificación exige que la credencial se sostenga sola y que el comando de la acción sea ejecutable), `apexos-brief` 2.42.1 → 2.43.0 (regla 56: un pedido de «conectar los puntos» se escribe como cableado y ciclo de vida de la credencial, no como capa visual), `apexos-git-guardian` 2.14.0 → 2.15.0 (control 31: el par rotado vive en un archivo gitignored y el inventario lo excluye), `equipo-apexos` 2.29.1 → 2.30.0 (control 43: «no está conectado» se despacha midiendo la credencial antes que la interfaz).
- **Registro**: `agents/registry.json` actualizado (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md` del 2026-11-12.
- **Cobertura de contexto**: `npm run agents:coverage` en verde — cada agente dueño de `apps/control-tower/**`, `docs/qa/evidence/**`, `package.json`, `docs/briefs/**` y `agents/**` con bump local y mención en la sección más reciente.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → `npm run control:test` → commit.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff (`.env.local` y `data/` quedan fuera; se verificó el barrido de JWT en la evidencia)
- [x] Documentación y agentes actualizados en el mismo commit
