# Brief — Salud por módulo y métricas cloud en la torre

- **ID**: `2026-11-03-torre-modulos-metricas`
- **Fecha**: `2026-11-03`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "comencemos ah ajustar esta torre de control donde necesito que tenga la opcion de hacerle un seguimiento por modulo, que los servicios esten activos que los datos esten sanos, si existe algun problema o alerta que se deba atender, no solo algo general si no algo detallado por cada modulo operativo que este vivo en el sistema apex, adicionalmente debemos conectar la herramienta a railway, supbase y vercel para poder evidenciar su estado tambien con metricas medibles sobre la base de datos o sobre los servicios o la api es indispensable, realiza los ajustes y miramos el avance"

## 1. Objetivo

Que la torre muestre salud detallada por cada módulo operativo de APEXOS —servicio activo, datos con actividad reciente, dependencias y alertas accionables— en vez de un estado general, y que las tarjetas de Railway, Supabase y Vercel reporten métricas medibles de despliegues, servicios y base de datos. El resultado es verificable en el panel local y en las suites de la torre y de la API.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/apex-control/modules.js` | Catálogo de 32 módulos, medición por modelo/campo de fecha y estado por módulo. |
| `A` | `apps/api/test/apex-control-modules.test.js` | Pruebas del endpoint de módulos: aislamiento por tenant, frescura y catálogo. |
| `A` | `apps/control-tower/lib/modules.js` | Catálogo de respaldo, normalización de la API, checks informativos y `fetchModules`. |
| `A` | `apps/control-tower/test/modules.test.js` | Pruebas de catálogo, token, API, 404, sin conexión y resumen no puntuable. |
| `A` | `docs/briefs/2026-11-03-torre-modulos-metricas.md` | Este brief. |
| `A` | `docs/qa/evidence/torre-modulos-metricas-20261103/modulos-local.png` | Captura real del panel con los 32 módulos. |
| `A` | `docs/qa/evidence/torre-modulos-metricas-20261103/pruebas-torre.txt` | Salida de la suite de la torre. |
| `A` | `docs/qa/evidence/torre-modulos-metricas-20261103/pruebas-api-apex-control.txt` | Salida de las suites de apex-control. |
| `A` | `docs/qa/evidence/torre-modulos-metricas-20261103/runtime-modulos.json` | Resumen en vivo por ambiente, sin tokens. |
| `M` | `apps/api/src/modules/apex-control/routes.js` | Ruta `GET /api/v1/apex-control/modules`. |
| `M` | `apps/api/src/modules/apex-control/service.js` | `getModules(tenantId, deps)` con componentes. |
| `M` | `apps/control-tower/lib/cloud.js` | Métricas Railway/Vercel/Supabase y salud por servicio. |
| `M` | `apps/control-tower/lib/config.js` | Token de apex-control por ambiente. |
| `M` | `apps/control-tower/lib/probes.js` | Recolección de módulos y sonda informativa por ambiente. |
| `M` | `apps/control-tower/public/app.js` | Panel de módulos, filtro de problemas y métricas cloud. |
| `M` | `apps/control-tower/public/index.html` | Contenedores del panel de módulos y nube. |
| `M` | `apps/control-tower/public/styles.css` | Estilos de tarjetas, servicios y métricas. |
| `M` | `apps/control-tower/test/cloud.test.js` | Pruebas de métricas y fallos de salud cloud. |
| `M` | `apps/control-tower/test/probes.test.js` | Prueba de `probeApexControl` con respuesta real. |
| `M` | `apps/control-tower/README.md` | Endpoint, tokens por ambiente, métricas y límites. |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | Regla de cierre de módulos/cloud; `2.1.0`. |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` | Regla de endpoint de módulos; `2.1.1`. |
| `M` | `.qoder/skills/apexos-seguridad/SKILL.md` | Aislamiento y token por ambiente; `2.1.0`. |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | Métricas sin contaminar el puntaje; `2.1.0`. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Suites y limitación cloud declarada; `2.1.0`. |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Brief de módulos/cloud; `2.1.0`. |
| `M` | `.qoder/skills/apexos-git-guardian/SKILL.md` | Alcance del commit de la torre; `2.1.0`. |
| `M` | `agents/equipo-apexos/SKILL.md` | Espejo sincronizado. |
| `M` | `agents/apexos-backend/SKILL.md` | Espejo sincronizado. |
| `M` | `agents/apexos-seguridad/SKILL.md` | Espejo sincronizado. |
| `M` | `agents/apexos-performance/SKILL.md` | Espejo sincronizado. |
| `M` | `agents/apexos-qa/SKILL.md` | Espejo sincronizado. |
| `M` | `agents/apexos-brief/SKILL.md` | Espejo sincronizado. |
| `M` | `agents/apexos-git-guardian/SKILL.md` | Espejo sincronizado. |
| `M` | `agents/CHANGELOG.md` | Entrada "Salud por módulo y métricas cloud". |
| `M` | `agents/registry.json` | Versiones, `updated_at`, `sha256` y controles nuevos. |

### Módulos (`change_intent.modules`)

- `apex-control`
- `control-tower`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Promover a `develop` o `main`; crear migraciones; desplegar o cambiar configuración en Railway, Supabase o Vercel.
- Escribir datos, ejecutar acciones operativas o agregar cifras entre tenants. La torre sigue siendo de solo lectura.
- Versionar `apps/control-tower/.env.local` o cualquier token de sesión.
- `docs/design/APEXOS_CONTROL_PLANE.md`: documento no rastreado previo a esta intervención, ajeno al alcance.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: el endpoint exige `apex-control:read` y corre bajo `runWithTenant`.
- Sin secretos ni credenciales en el brief, el diff o la evidencia.

## 5. Criterios de aceptación

1. `node --test apps/api/test/apex-control-contract.test.js apps/api/test/apex-control-modules.test.js apps/api/test/apex-control-pulse.test.js` → 17/17 en verde.
2. `npm --workspace apps/control-tower test` → 54/54 en verde.
3. `GET /api/v1/apex-control/modules` con JWT válido → 32 módulos con `records`, `last_activity_at` y servicios; sin JWT → 401; otro tenant → sin filas ajenas.
4. La torre muestra el panel por módulo con resumen (total, operativos, degradados, caídos, sin dato), tarjetas con registros/frescura/servicios y filtro **Solo problemas**.
5. Sin token remoto, `develop` y `main` quedan `SIN_TOKEN`/`Sin dato`; el token local no se reutiliza.
6. Las tarjetas cloud calculan métricas Railway (deployments, fallidos, antigüedad), Vercel (duración media con `buildingAt`/`ready`) y Supabase (salud por servicio); sin credenciales quedan `unknown`.
7. Las sondas de módulo son informativas y no alteran el resumen del ambiente.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/control-tower/test/modules.test.js`, `apps/control-tower/test/cloud.test.js`, `apps/control-tower/test/probes.test.js`, `apps/api/test/apex-control-modules.test.js`.
- Certificación: suites anteriores más captura real del panel en `docs/qa/evidence/torre-modulos-metricas-20261103/modulos-local.png`.
- `certification_status` esperado: `local_passed_qa_pending`.
- Limitación declarada: no existen `RAILWAY_TOKEN`, `VERCEL_TOKEN` ni `SUPABASE_ACCESS_TOKEN` en el equipo; las métricas cloud están cubiertas con pruebas congeladas y se activarán al definir los tokens en `.env.local`. No se declaran verificadas contra la nube real.

## 7. Capacidades protegidas

- Aislamiento por tenant del endpoint de módulos — prueba con dos tenants y conteo de filas.
- RBAC `apex-control:read` — 401 sin token y permiso explícito en la ruta.
- Puntaje del ambiente — una sonda de resumen por ambiente; los módulos son `informational`.
- Torre de solo lectura — no se agregan escrituras, deploys ni migraciones.
- Secretos — `.env.local` fuera del commit; `safeConfig` no expone tokens.

## 8. Riesgos y rollback

- Riesgo: consultas por módulo sobre tablas grandes → Mitigación: `aggregate` con `_count`/`_max` y catálogo acotado a 32 modelos con campo de fecha. → Rollback: revert del commit, sin `reset`.
- Riesgo: confundir catálogo sin token con salud real → Mitigación: `source: "catalog"`, `reason: "SIN_TOKEN"`, resumen `unknown` y sonda no puntuable. → Rollback: revert del commit.

## 9. Supuestos y preguntas abiertas

- Supuesto: el tenant demo local (`c0d70738…`) es suficiente para demostrar el panel; los datos agregados no son PII.
- Pregunta: para vigilar QA/PROD se requiere un JWT con `apex-control:read` por ambiente; mientras no exista, esos ambientes quedan `SIN_TOKEN`.

## 10. Autorizaciones requeridas

- [ ] Definir tokens cloud y tokens de QA/PROD en `apps/control-tower/.env.local` (no versionado) para lectura real de Railway/Supabase/Vercel y de los módulos remotos.
- [ ] Cualquier promoción a `develop` o `main` requiere autorización independiente y su propio manifiesto.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight` → `Veredicto: OK`; ruteo obligatorio a `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-performance`, `apexos-qa`, `apexos-brief`, `apexos-git-guardian`.
- **Agentes consultados**: `equipo-apexos`, `apexos-brief`, `apexos-git-guardian`, `apexos-backend`, `apexos-seguridad`, `apexos-performance`, `apexos-qa`.
- **Documentación a actualizar**: `apps/control-tower/README.md`, este brief y `docs/qa/evidence/torre-modulos-metricas-20261103/`.
- **Agentes a actualizar**: `equipo-apexos` `2.0.0` → `2.1.0` (`cierre-salud-modulos-cloud`); `apexos-backend` `2.0.0` → `2.1.1` (`salud-por-modulo`); `apexos-seguridad` `2.0.0` → `2.1.0` (`aislamiento-salud-modulos`, `token-por-ambiente`); `apexos-performance` `2.0.0` → `2.1.0` (`metricas-cloud-medibles`, `sondas-informativas`); `apexos-qa` `2.0.0` → `2.1.0` (`pruebas-salud-modulos`, `limitacion-cloud-declarada`); `apexos-brief` `2.0.0` → `2.1.0` (`brief-salud-modulos-cloud`); `apexos-git-guardian` `2.0.0` → `2.1.0` (`alcance-torre-modulos`).
- **Registro**: `agents/registry.json` actualizado (`version`, `updated_at`, `sha256` y controles nuevos) y entrada "Salud por módulo y métricas cloud" en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage` sobre el inventario de este brief → `OK` (sin `docs/design/APEXOS_CONTROL_PLANE.md`, ajeno al alcance).
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → pruebas de la sección 5 → commit.
- **Publicación obligatoria**: `git push origin desarrollo` (rama `desarrollo`, pruebas verdes, sin secretos ni artefactos locales). No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit
