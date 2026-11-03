# Brief — Equipo de agentes versionado y publicación obligatoria

- **ID**: `2026-11-02-agentes-versionados`
- **Fecha**: `2026-11-02`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "entrena los agentes que creamos para apexos con su especialidad y crea una carpeta en el proyecto en desarrollo donde almacenemos estos agentes y que podamos actualizarlos desde otra maqina o desde otro momento ... el brief debe tener el contexto adecuado para que cada que se use primero valide la documentacion y version de los documentos con sus fechas de actualizacion para que no sobreescriba cambios si existe una version mas nueva ... en la condicion del brief si o si debe estar contemplado un psuh obligatorio a la documentacion cada que se atualice o se toque el codigo de apexos y a su vez actualice los agentes de manera constante.. sube los agentes que usamos actualmente junto con el orquestador y los demas todo el equipo y genera un commit hacia desarrollo con esta actualizacion"

## 1. Objetivo

Dejar el equipo de agentes en una carpeta versionada y portable (`agents/`), con control de versión, fecha y hash, de modo que otra máquina pueda reconstruirlo sin sobrescribir controles más nuevos. Toda intervención debe actualizar documentación y agentes y publicarse de forma obligatoria en `origin/desarrollo`.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `.qoder/skills/apexos-auditor-marcaciones/SKILL.md` | Versión 1.1.0 y estado de la remediación 2026-10-30 |
| `M` | `.qoder/skills/apexos-auditor-nomina/SKILL.md` | Versión 1.1.0 y estado R-04/R-05/R-06..R-10 |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` | Controles HR, tenant, P2028, doble almacén y pruebas |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Preflight de versiones, sección 11 y push acotado |
| `M` | `.qoder/skills/apexos-db-nube/SKILL.md` | Migraciones idempotentes, RLS y seeds por tenant |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Vista única, formulario consolidado y evidencia real |
| `M` | `.qoder/skills/apexos-git-guardian/SKILL.md` | Push acotado, scope v2, worktrees y recuperación |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | P2028, harness aislado y presupuestos |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Carreras del arnés, puertas de evidencia y HR |
| `M` | `.qoder/skills/apexos-seguridad/SKILL.md` | RLS/middleware, secretos, uploads y RBAC |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | Roster completo, preflight y cierre con docs/agentes/push |
| `M` | `AGENTS.md` | Sección de documentación, agentes y publicación acotada |
| `M` | `docs/briefs/_TEMPLATE.md` | Sección 11 obligatoria y restricción de push |
| `M` | `package.json` | Scripts `agents:sync` y `agents:check` |
| `A` | `agents/README.md` | Instalación, protocolo de versiones y conflictos |
| `A` | `agents/registry.json` | 11 agentes y 8 documentos con versión, fecha y hash |
| `A` | `agents/CHANGELOG.md` | Historial del entrenamiento 2026-11-02 |
| `A` | `agents/<11 agentes>/SKILL.md` | Espejo portable de cada agente |
| `A` | `scripts/agents/sync-agents.js` | `write`, `check` y `restore` |
| `A` | `docs/briefs/2026-11-02-agentes-versionados.md` | Este brief |

### Módulos (`change_intent.modules`)

- `equipo-agentes`
- `gobernanza`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Código de producto de `apps/api` y `apps/web`: no se toca.
- `develop` y `main`: no se promueve ni se publica.
- Migraciones locales o remotas: no aplica.
- `docs/design/APEXOS_CONTROL_PLANE.md`: archivo no rastreado preexistente, no se incluye.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: este cambio no modifica código de producto.
- Sin secretos ni credenciales en el brief ni en el diff.

## 5. Criterios de aceptación

1. `npm run agents:check` → `OK: 11 agentes y 8 documentos verificados`.
2. `node scripts/agents/sync-agents.js restore && npm run agents:check` → restaura el equipo desde `agents/` y valida.
3. Alterar un espejo y ejecutar `npm run agents:check` → exit 1 con `espejo desincronizado`; `npm run agents:sync` lo restaura.
4. `agents/registry.json` lista 11 agentes con `version`, `updated_at`, `sha256` y `controls`, y 8 documentos con fecha y hash.
5. `docs/briefs/_TEMPLATE.md` contiene la sección 11 y la publicación obligatoria a `origin/desarrollo`.

## 6. Evidencia y certificación exigida

- Pruebas: `npm run agents:check` y prueba negativa de deriva del espejo (documentada en la sesión de validación).
- Evidencia: `agents/registry.json`, `agents/CHANGELOG.md` y este brief.
- `certification_status` esperado: `local_passed_qa_pending`. No hay flujo de producto que certificar; la puerta de promoción a `develop`/`main` no aplica a este cambio.

## 7. Capacidades protegidas

- **Integridad del equipo** — `agents:check` verifica espejo, versión, fecha y hash.
- **No sobreescritura de versiones** — regla semver + `origin/desarrollo` en `apexos-brief` y `AGENTS.md`.
- **Flujo de ramas** — el push acotado no autoriza `develop`, `main`, merge, force push ni infraestructura.

## 8. Riesgos y rollback

- Riesgo: un agente quede con versión o hash inconsistente → Mitigación: `agents:check` bloquea el commit → Rollback: revertir el commit, no `reset`.
- Riesgo: el push acotado se interprete como autorización amplia → Mitigación: texto explícito en `AGENTS.md`, `apexos-brief` y `equipo-apexos` → Rollback: revertir la sección de gobernanza.

## 9. Supuestos y preguntas abiertas

- Supuesto: `.qoder/skills/` es la fuente canónica que carga Qoder; `agents/` es el espejo portable.
- Supuesto: el propietario autoriza el push acotado a `origin/desarrollo` en cada cierre, según el prompt.
- Pregunta: ninguna que altere el alcance.

## 10. Autorizaciones requeridas

- [x] Push a `origin/desarrollo` (autorización permanente y acotada del propietario, 2026-11-02).
- [ ] `develop` / `main`: no solicitadas.

## 11. Documentación, agentes y publicación (obligatoria)

- **Documentación a actualizar**: este brief, `AGENTS.md`, `docs/briefs/_TEMPLATE.md`, `agents/README.md` y `agents/CHANGELOG.md`.
- **Agentes a actualizar**: los 11 agentes a `1.1.0`; controles nuevos registrados en `agents/registry.json`.
- **Registro**: `agents/registry.json` con `version`, `updated_at` y `sha256`; entrada en `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → pruebas de la sección 5 → commit.
- **Publicación obligatoria**: `git push origin desarrollo` (rama `desarrollo`, pruebas verdes, sin secretos). No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit
