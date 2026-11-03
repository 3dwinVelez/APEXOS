# Brief — Actividad, conexiones y empresas en la torre

- **ID**: `2026-11-03-torre-actividad-empresas`
- **Fecha**: `2026-11-03`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "necesitamos actualizar todas las credenciales de railway, supabase y vercel adicionalmente los paneles de control y vigilancia deben ser como el que te señalo para toda la herramienta para ver de una manera muy visual el estado de todo adapta la version y dejamos otra vista para el detalle donde adicional a los temas tecnicos necesito que el monitor me pueda brindar cantidad de registros por modulos, actividades diarias, conexciones, poder observar conecctividad y actividades por tenant id (empresa), realiza los ajustes y seguirmos validando"

## 1. Objetivo

Que la torre muestre el estado de APEXOS con indicadores grandes y una vista **Resumen** legible de un vistazo, dejando el desglose técnico en una vista **Detalle**, y que añada métricas de actividad diaria, conexiones y conectividad por empresa (`tenant_id`) sin romper el aislamiento multi-tenant. El resultado es verificable en el panel local, en las suites de la torre y de la API, y en la preparación de credenciales cloud por ambiente.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/apex-control/activity.js` | `getActivity` (buckets diarios por tenant con `$queryRaw`), `getTenants` (lectura entre empresas con permiso explícito, guarda de ambiente y allowlist) y reglas de estado. |
| `A` | `apps/api/test/apex-control-activity.test.js` | Pruebas de buckets diarios, aislamiento por tenant y puerta `403 CROSS_TENANT_DESHABILITADO`. |
| `A` | `apps/control-tower/lib/activity.js` | Recolección de actividad y empresas por ambiente con su token, razones `SIN_TOKEN`/`TOKEN_INVALIDO`/`NO_DISPONIBLE`/`SIN_CONEXION` y sonda informativa. |
| `A` | `apps/control-tower/test/activity.test.js` | Pruebas de token por ambiente, ausencia de red sin token, 401/404/sin conexión, simulación y reporte de credenciales sin valores. |
| `A` | `docs/briefs/2026-11-03-torre-actividad-empresas.md` | Este brief. |
| `A` | `docs/qa/evidence/tower-activity-tenants-20261103/summary.png` | Captura real de la vista Resumen. |
| `A` | `docs/qa/evidence/tower-activity-tenants-20261103/detail.png`, `detail-top.png`, `detail-mid.png` | Capturas reales de la vista Detalle. |
| `A` | `docs/qa/evidence/tower-activity-tenants-20261103/summary-mobile.png` | Vista Resumen en ancho móvil. |
| `A` | `docs/qa/evidence/tower-activity-tenants-20261103/pruebas-torre.txt` | Salida de la suite de la torre. |
| `A` | `docs/qa/evidence/tower-activity-tenants-20261103/pruebas-api-apex-control.txt` | Salida de las suites de apex-control. |
| `A` | `docs/qa/evidence/tower-activity-tenants-20261103/runtime-actividad.json` | Resumen en vivo por ambiente y preparación de credenciales, sin tokens. |
| `M` | `apps/api/src/modules/apex-control/routes.js` | Rutas `GET /api/v1/apex-control/activity` y `/tenants`. |
| `M` | `apps/api/src/modules/apex-control/service.js` | `getActivity` y `getTenants` con el tenant del token. |
| `M` | `apps/control-tower/lib/config.js` | Token de apex-control por ambiente y reporte de credenciales cloud (`credentialReport`). |
| `M` | `apps/control-tower/lib/probes.js` | Recolección de actividad y exposición en `environment.activity`. |
| `M` | `apps/control-tower/public/app.js` | Indicadores grandes, vistas Resumen/Detalle, panel de actividad, tabla de empresas y tarjeta de credenciales. |
| `M` | `apps/control-tower/public/index.html` | Conmutador de vista y contenedores de actividad, empresas y credenciales. |
| `M` | `apps/control-tower/public/styles.css` | Estilos de tiles, gráfico de actividad, tablas, tarjetas compactas y móvil. |
| `M` | `apps/control-tower/README.md` | Vistas, endpoints de actividad/empresas, guardas entre empresas y preparación de credenciales. |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` | Control `actividad-por-empresa`; `2.2.0`. |
| `M` | `.qoder/skills/apexos-seguridad/SKILL.md` | Control `lectura-entre-empresas`; `2.2.0`. |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | Control `actividad-empresas-acotadas`; `2.2.0`. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Control `certificacion-actividad-empresas`; `2.2.0`. |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Control `certificacion-ui-en-la-misma-intervencion`; `2.1.0` (intervención de certificación UI incluida en el mismo cierre). |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Control `certificacion-ui-en-el-inventario`; `2.2.0` (misma intervención). |
| `M` | `agents/apexos-backend/SKILL.md`, `agents/apexos-seguridad/SKILL.md`, `agents/apexos-performance/SKILL.md`, `agents/apexos-qa/SKILL.md`, `agents/apexos-frontend/SKILL.md`, `agents/apexos-brief/SKILL.md` | Espejos generados por `agents:sync`. |
| `M` | `agents/CHANGELOG.md` | Entradas "Torre: actividad, conexiones y vistas Resumen/Detalle" y "Certificación UI fase uno". |
| `M` | `agents/registry.json` | Versiones, `updated_at`, `sha256` y controles nuevos. |

### Módulos (`change_intent.modules`)

- `apex-control`
- `control-tower`
- `agents`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Promover a `develop` o `main`; crear migraciones; desplegar o cambiar configuración en Railway, Supabase o Vercel.
- Escribir datos o ejecutar acciones operativas desde la torre, que sigue siendo de solo lectura.
- Definir los tokens cloud faltantes ni versionar `apps/control-tower/.env.local`.
- `docs/design/APEXOS_CONTROL_PLANE.md`: documento no rastreado ajeno a esta intervención; no se versiona ni se sobrescribe.
- La UI del producto (`apps/web/app`, `apps/web/components`) no cambia.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase/Vercel sin autorización explícita.
- Aislamiento multi-tenant: `/activity` se filtra por el tenant del token; `/tenants` exige permiso explícito `apex-control:read_all_tenants`, guarda `APEX_CONTROL_CROSS_TENANT` y allowlist opcional, y no se habilita por defecto fuera de local/development.
- Los tokens cloud y de sesión viven solo en `apps/control-tower/.env.local`; no se escriben en el brief, el diff, los logs ni la evidencia.

## 5. Criterios de aceptación

1. `node --test apps/api/test/apex-control-activity.test.js apps/api/test/apex-control-modules.test.js` → 15/15 en verde.
2. `npm --workspace apps/control-tower test` → 60/60 en verde.
3. `GET /api/v1/apex-control/activity` con JWT válido → 200 con `daily`, `activity` y `connections` del tenant; sin JWT → 401; un tenant no ve filas de otro.
4. `GET /api/v1/apex-control/tenants` con la guarda cerrada → `403 CROSS_TENANT_DESHABILITADO`; abierta con permiso explícito → resumen y listado de empresas.
5. La torre abre en vista **Resumen** con 11 indicadores grandes, tarjetas compactas de módulo, actividad diaria, hasta 12 empresas y los paneles técnicos ocultos; **Detalle** muestra el desglose completo (tabla completa de empresas, sondas, rendimiento, nube, ramas y credenciales).
6. Sin token remoto, `develop` y `main` quedan `SIN_TOKEN`/`Sin dato`; el token local no se reutiliza.
7. La tarjeta de credenciales muestra `1/3 listas` y solo los nombres de las variables faltantes (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `ENV_DEVELOP_VERCEL_PROJECT_ID`, `ENV_MAIN_VERCEL_PROJECT_ID`); Railway queda configurado.
8. Las sondas de actividad y empresas son informativas y no alteran el resumen del ambiente.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/control-tower/test/activity.test.js`, `apps/control-tower/test/modules.test.js`, `apps/control-tower/test/cloud.test.js`, `apps/control-tower/test/probes.test.js`, `apps/api/test/apex-control-activity.test.js`.
- Certificación: suites anteriores más capturas reales de las vistas Resumen y Detalle en `docs/qa/evidence/tower-activity-tenants-20261103/`.
- `certification_status` esperado: `local_passed_qa_pending`.
- Limitación declarada: en el equipo hay token de Railway; faltan `SUPABASE_ACCESS_TOKEN` y `VERCEL_TOKEN` con sus IDs de proyecto, y no hay JWT de QA/PROD. Las lecturas de Supabase, Vercel y de módulos/actividad remotos quedan cubiertas por pruebas congeladas y se activarán al definir las variables en `.env.local`. No se declaran verificadas contra la nube real.

## 7. Capacidades protegidas

- Aislamiento por tenant de `/activity` — prueba con dos tenants y conteo de filas.
- Lectura entre empresas — permiso explícito, guarda de ambiente, allowlist y `403 CROSS_TENANT_DESHABILITADO`.
- RBAC `apex-control:read` — 401 sin token.
- Puntaje del ambiente — una sonda de resumen por ambiente; actividad y empresas son `informational`.
- Torre de solo lectura — no se agregan escrituras, deploys ni migraciones.
- Secretos — `.env.local` fuera del commit; `safeConfig` y la tarjeta de credenciales muestran nombres, nunca valores.

## 8. Riesgos y rollback

- Riesgo: consultas diarias sobre tablas grandes → Mitigación: `$queryRaw` con rango de fechas acotado a `days` y agregados, sin `findMany` truncado. → Rollback: revert del commit, sin `reset`.
- Riesgo: exponer conectividad de otras empresas → Mitigación: permiso explícito, guarda apagada por defecto, allowlist y 403 probado. → Rollback: revert del commit.
- Riesgo: tablas largas en la vista rápida → Mitigación: Resumen limitado a 12 empresas con nota a Detalle. → Rollback: revert del commit.

## 9. Supuestos y preguntas abiertas

- Supuesto: el tenant demo local (`c0d70738…`) es suficiente para demostrar actividad y conexiones; los agregados no son PII.
- Pregunta: para vigilar QA/PROD se requiere un JWT con `apex-control:read` (y `apex-control:read_all_tenants` para la vista de empresas) por ambiente; mientras no exista, esos ambientes quedan `SIN_TOKEN`.

## 10. Autorizaciones requeridas

- [ ] Definir `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN` y los IDs de proyecto en `apps/control-tower/.env.local` (no versionado) para lectura real de Supabase y Vercel.
- [ ] Cualquier promoción a `develop` o `main` requiere autorización independiente y su propio manifiesto.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "<rutas del alcance>"` → `Veredicto: OK`; ruteo obligatorio a `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-performance`, `apexos-qa`, `apexos-brief`, `apexos-git-guardian`.
- **Agentes consultados**: `equipo-apexos`, `apexos-brief`, `apexos-git-guardian`, `apexos-backend`, `apexos-seguridad`, `apexos-performance`, `apexos-qa`.
- **Documentación a actualizar**: `apps/control-tower/README.md`, este brief y `docs/qa/evidence/tower-activity-tenants-20261103/`.
- **Agentes a actualizar**: `apexos-backend` `2.1.1` → `2.2.0` (`actividad-por-empresa`); `apexos-seguridad` `2.1.0` → `2.2.0` (`lectura-entre-empresas`); `apexos-performance` `2.1.0` → `2.2.0` (`actividad-empresas-acotadas`); `apexos-qa` `2.1.0` → `2.2.0` (`certificacion-actividad-empresas`); `apexos-frontend` `2.0.0` → `2.1.0`; `apexos-brief` `2.1.0` → `2.2.0`.
- **Registro**: `agents/registry.json` actualizado (`version`, `updated_at`, `sha256` y controles nuevos) y entradas en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage` sobre el inventario de este brief → `OK` (sin `docs/design/APEXOS_CONTROL_PLANE.md`, ajeno al alcance).
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → pruebas de la sección 5 → commit.
- **Publicación obligatoria**: `git push origin desarrollo` (rama `desarrollo`, pruebas verdes, sin secretos ni artefactos locales). No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo cierre
