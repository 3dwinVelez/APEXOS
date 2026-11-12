# Brief — La torre de control mide la nube de cada ambiente

- **ID**: `2026-11-12-torre-nube-medida`
- **Fecha**: `2026-11-12`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "revisa la torre de control ya que los puntos de medicion no estan conectados reqiero que conectes todo de maner sincrona y que empiece ah tomar vida"

Ronda 2 del mismo pedido. La ronda 1 (`2026-11-12-torre-credencial-autorenovable`) cerró la credencial de la API por ambiente; esta cierra **los puntos de medición de la nube**, que estaban ciegos en los tres ambientes.

## 0. Capa de la intervención

**Conexión de datos**, no capa visual. Cambia cómo la torre obtiene y declara la credencial de Railway, qué proveedores sondea por ambiente y cómo se lee eso en la vista Nube. El único cambio en `public/app.js` son dos líneas de texto de la tarjeta («No aplica» y «Credencial leída de: …»); la gramática del gráfico no se tocó y se re-certifica como no-regresión.

## 1. Objetivo

Que la vista Nube responda su pregunta —*¿los servicios de la nube están bien?*— con dato medido en los ambientes que sí tienen nube, y con la afirmación correcta en los que no:

1. **La torre adopta la sesión que el puesto ya tiene.** Railway vive en el almacén del CLI (`~/.railway/config.json`, reubicable con `RAILWAY_CONFIG_DIR`); copiar el token a un segundo archivo lo envejecía. La variable `RAILWAY_TOKEN` sigue mandar si existe.
2. **Topología y puesto se separan.** Un proveedor que el ambiente no usa (Vercel en Railway, la nube entera en el Docker local) se publica `applies:false` / `not_applicable`: ninguna tarjeta «Sin credenciales», ninguna acción «Configurar VERCEL_TOKEN». Un pendiente del puesto (falta `SUPABASE_ACCESS_TOKEN`) sí genera acción.
3. **Los identificadores medidos quedan versionados.** Los project id de QA y PROD viven en `lib/config.js` como default; el puesto no depende de que alguien los recuerde.
4. **Lo no medido no es cero.** Sin llamada HTTP no hay latencia: `latencyMs: null`, nunca `0 ms`.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/control-tower/lib/railway-session.js` | Único lector del almacén del CLI: `sessionFile()`, `railwaySessionToken({env, homeDir, fsImpl})`, `resolveRailwayToken(railway, opciones)` con la precedencia variable → sesión → nada, y la puerta `sessionEnabled === true`. Devuelve cadena vacía ante archivo ilegible, JSON roto o token con espacios; nunca lanza. |
| `M` | `apps/control-tower/lib/cloud.js` | `applies` en todas las tarjetas; `notApplicable()` nuevo; `railwayStatus` recibe `credentialSource` y lo publica; `cloudForEnvironment` resuelve la credencial de Railway con la sesión del puesto y deja de sondear proveedores sin identificador; los detalles sin credencial nombran la variable exacta y dicen si el identificador ya está. |
| `M` | `apps/control-tower/lib/config.js` | `ENV_*_RAILWAY_PROJECT_ID` con los ids medidos de QA y PROD (local queda vacío a propósito); `cloud.railway.sessionEnabled` (`TOWER_RAILWAY_SESSION`, default `true`); `credentialReport(config, sessionOptions)` informa la **fuente** de la credencial; `safeConfig` publica `railwayTokenSource` y el reporte, nunca el token. |
| `M` | `apps/control-tower/lib/probes.js` | Las sondas `railway`/`vercel` por ambiente se saltan las tarjetas `applies:false`; `simulatedCloud` usa la misma regla; `localCloudCards()` nuevo y `runAllProbes` lo publica para local (antes: `cloud: null`, el panel pedía tres tokens a un ambiente Docker). |
| `M` | `apps/control-tower/lib/recommendations.js` | `addCloud` omite proveedores que no aplican; la acción de Railway nombra las dos salidas reales (variable o sesión del CLI). |
| `M` | `apps/control-tower/public/app.js` | `renderCloudCard`: etiqueta «No aplica» distinta de «Sin credenciales», el hint «Configura…» solo cuando aplica, y la línea «Credencial leída de: …». |
| `M` | `apps/control-tower/test/cloud.test.js` | +4 pruebas: lectura del almacén con `RAILWAY_CONFIG_DIR`, entradas inválidas → cadena vacía, precedencia y puerta de `resolveRailwayToken`, y adopción de extremo a extremo (la sonda viaja con `Bearer <sesión>`, Vercel `applies:false` y el token fuera del payload). |
| `M` | `apps/control-tower/test/environments.test.js` | Fixture hermética (`sessionEnabled:false`); Vercel ya no genera fila de sonda; dos pruebas nuevas fijan los ids reales de QA/PROD y el vacío de local, y una fija `credentialReport` con `fsImpl` inyectado (fuente, faltantes y que `safeConfig` no lleve el secreto). |
| `M` | `apps/control-tower/test/probes.test.js` | +1: forma de `localCloudCards()`, `latencyMs:null` y ninguna acción de nube en local. |
| `M` | `apps/control-tower/test/recommendations.test.js` | +1: un proveedor que no aplica no produce `CLOUD_SIN_TOKEN`. |
| `M` | `scripts/certifications/apex-control-tower-consolidado-local.js` | Fase de nube: ferrocarril local (GraphQL con proyecto, ambientes y deployment SUCCESS, retrasado 20 ms para que el viaje tenga latencia) + almacén de sesión propio; 10 verificaciones de servidor y 6 del navegador; `redactEnv` también purga la sesión de marcador; `no_certifica` declara que la certificación no sale a internet. |
| `M` | `docs/qa/evidence/torre-consolidado-empresas-20261103/*` | Evidencia regenerada: 73 gates, `nube-certificada.json` y la captura nueva `04-vista-nube-medida.png`. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/*` | Evidencia regenerada (77 gates), sin regresión en la tubería local. |
| `A` | `docs/qa/evidence/torre-nube-medida-20261112/{validacion.md,nube-viva.json}` | Prueba de campo del puesto: lo que la torre midió realmente en los tres ambientes, con guarda que rechaza volcar credenciales. |
| `M` | `apps/control-tower/README.md` | Sección de nube: sesión del CLI, `TOWER_RAILWAY_SESSION`, ids versionados por ambiente y «no aplica» vs «sin credenciales». |
| `A` | `docs/briefs/2026-11-12-torre-nube-medida.md` | Este brief. |
| `M` | `agents/CHANGELOG.md`, `agents/registry.json`, los `SKILL.md` de `apexos-seguridad`, `apexos-performance`, `apexos-qa` (y sus espejos en `.qoder/skills/`) | Control nuevo por disciplina y bump semver. |

### Módulos (`change_intent.modules`)

- `control-tower`
- `certificaciones-torre`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- `apps/api/**`, `apps/web/**`, esquema, migraciones, RLS: nada se tocó.
- No se crea ninguna cuenta, proyecto ni token. La torre lee lo que el puesto ya tiene; lo que no existe (`SUPABASE_ACCESS_TOKEN`) se declara como pendiente del dueño.
- No se promoción: `apps/control-tower/**` reposa solo en `desarrollo` y sus certificaciones no se citan como evidencia de promoción.
- No se escribe el token de Railway en `apps/control-tower/.env.local`, en `data/`, ni en ningún artefacto versionado.

## 4. Restricciones

- Rama: solo `desarrollo`; push únicamente a `origin/desarrollo` al cerrar. Prohibido `develop`, `main`, force push, merge, deploy y cambios en Railway/Supabase sin autorización explícita.
- Secretos: el token vive en el almacén del CLI o en `.env.local` (gitignored). La torre publica **la fuente**, nunca el valor. `safeConfig` no expone tokens.
- Sin sesión ni variable, la tarjeta queda `unknown` con su acción; jamás un `ok` inventado.
- Toda prueba que construya su propio `config` queda fuera del almacén real: la adopción solo ocurre con `sessionEnabled === true`.

## 5. Criterios de aceptación

1. `npm run control:test` → **186/186** (8 pruebas nuevas de nube sobre las 178 de la ronda anterior).
2. `npm run certify:control-tower:consolidado` → **73/73**, con las 16 verificaciones de nube en verde, incluidas `nube_sesion_del_cli_adoptada`, `nube_sonda_viaja_con_la_sesion` (cada llamada llegó con `Bearer <sesión>`), `nube_railway_medido_con_viaje` (latencia medida > 0, proyecto y deployment leídos) y `navegador_nube_dice_la_fuente_de_la_credencial`.
3. `npm run certify:control-tower:local` → **77/77**, sin regresión en credencial, cockpit ni mapa de módulos.
4. Torre del puesto reiniciada y midiendo en vivo (`nube-viva.json`): **Develop · QA** `railway ok, 662 ms, proyecto APEXOS QA, fuente «sesión del CLI de Railway», último deployment SUCCESS 2026-11-11T00:49:23Z`; **Main · PROD** `ok, 470 ms, APEXOS PROD, SUCCESS 2026-11-11T20:01:38Z`; **Local** las tres tarjetas `not_applicable` con «se mide en el puesto, no en la nube» y **cero** acciones de nube.
5. Vercel ya no aparece como pendiente en ningún ambiente (`applies:false`, sin fila de sonda, sin acción), y la única acción de nube que queda en QA y PROD es `Configurar SUPABASE_ACCESS_TOKEN`.
6. Ninguna tarjeta, ningún JSON de evidencia y ninguna captura contiene la sesión: la certificación lo fija con `nube_no_publica_la_sesion_del_puesto` y `navegador_nube_no_imprime_la_sesion`; el volcado de campo se niega a escribirse si detecta `accessToken` o `Bearer `.
7. `TOWER_RAILWAY_SESSION=false` apaga la adopción y la torre vuelve a declarar Railway sin credencial; un `railway login` nuevo en el puesto llega a la torre **sin reiniciarla** (la lectura ocurre en cada sondeo).
8. Los ids medidos de QA y PROD están en `lib/config.js` y una prueba los fija; cambiar la topología es una línea versionada, no un ajuste del puesto.

## 6. Evidencia y certificación exigida

- Pruebas: `npm run control:test` (186, `apps/control-tower/test/**`).
- Certificaciones: `npm run certify:control-tower:consolidado` (73 gates, 4 capturas, `nube-certificada.json`) y `npm run certify:control-tower:local` (77 gates).
- Prueba de campo: `docs/qa/evidence/torre-nube-medida-20261112/nube-viva.json` leído de `http://127.0.0.1:4310/api/status` con la torre del puesto corriendo en modo real.
- Captura del navegador con la vista Nube pintada: `docs/qa/evidence/torre-consolidado-empresas-20261103/04-vista-nube-medida.png`.

## 7. Capacidades protegidas

- **Nube medida por ambiente** — 10 verificaciones nuevas de servidor + 6 del navegador; ninguna depende de internet.
- **Credencial adoptada, no duplicada** — `test/cloud.test.js` fija precedencia y puerta; `nube_sonda_viaja_con_la_sesion` prueba el viaje real con la cabecera recibida por el proveedor falso.
- **Topología distinta de pendiente** — `nube_proveedor_sin_topologia_no_pide_token`, `nube_local_no_pide_credenciales_cloud` y la prueba de `recommendations`.
- **Lo no medido no es cero** — `nube_ambiente_sin_proyecto_no_inventa` (`latencyMs:null`) y su gemelo en `test/probes.test.js`.
- **No filtración de secretos** — dos gates de no-fuga, `redactEnv` extendido y la guarda del volcado de campo.

## 8. Riesgos y rollback

- Riesgo: la torre lee el almacén del CLI del operador → Mitigación: solo el `user.accessToken`, nunca se publica; puerta `TOWER_RAILWAY_SESSION=false`; un `config` construido a mano no lo toca (`sessionEnabled !== true`). Las pruebas inyectan `fsImpl`.
- Riesgo: una certificación dependiera de con quién esté autenticado el que ejecuta → Mitigación: la cert redirige `RAILWAY_CONFIG_DIR` a un almacén propio y limpia `RAILWAY_TOKEN` antes de crear la torre; restaura el entorno al cerrar.
- Riesgo: marcar `not_applicable` donde sí hay proveedor hide un pendiente real → Mitigación: la regla es el identificador del ambiente (`railwayProjectId`/`vercelProjectId`/`supabaseRef`), que está versionado y fijado por prueba; Supabase conserva su acción porque su `ref` sí existe.
- Rollback: `git revert` del commit. No hay esquema ni migración involucrados.

## 9. Supuestos y preguntas abiertas

- Se asume la topología medida: QA y PROD corren en Railway, Vercel no se usa y Supabase es la base de ambos. Si el dueño añade Vercel, basta su `ENV_*_VERCEL_PROJECT_ID`.
- `SUPABASE_ACCESS_TOKEN` es el único pendiente de nube que ningún recurso local construye: lo genera solo el dueño en la consola de Supabase.
- La telemetría profunda de QA/PROD sigue bloqueada por el build desplegado sin `apex-control` (404): se destraba con promoción autorizada, no con código de la torre.

## 10. Autorizaciones requeridas

- Commit y `git push origin desarrollo`: cobertura permanente y acotada de `AGENTS.md`.
- Ninguna otra: sin `develop`/`main`, sin force push, sin tocar Railway/Supabase, sin crear tokens.

## 11. Documentación, agentes y publicación (obligatoria)

- Brief (este archivo), `apps/control-tower/README.md` y evidencia versionada en el mismo cambio.
- Agentes dueños según `agents:preflight` para `apps/control-tower/**`: `apexos-performance`, `apexos-seguridad`, `apexos-qa`. Cada uno recibe su control nuevo, bump semver, `updated_at` y entrada en la sección más reciente de `agents/CHANGELOG.md`.
- Cierre: `npm run agents:sync && npm run agents:check && npm run agents:preflight && npm run agents:coverage`, verificar que `git diff --cached` no contiene secretos ni `.env*` ni `apps/control-tower/data/`, y `git push origin desarrollo`.
