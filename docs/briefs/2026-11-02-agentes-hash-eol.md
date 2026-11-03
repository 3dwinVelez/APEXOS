# Brief — hashes de agentes estables entre sistemas operativos

- **ID**: `2026-11-02-agentes-hash-eol`
- **Fecha**: `2026-11-02`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "termina los pendientes y deja la rama alienada"

## 1. Objetivo

Que `npm run agents:check` valide el equipo versionado de forma determinista en cualquier sistema operativo, sin depender de `core.autocrlf` ni de los saltos de línea del árbol de trabajo.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `scripts/agents/sync-agents.js` | Normaliza CRLF→LF antes de calcular `sha256` y al comparar espejo contra canónico |
| `M` | `agents/registry.json` | Regenerado por `agents:sync` con hashes normalizados |
| `A` | `docs/briefs/2026-11-02-agentes-hash-eol.md` | Este brief |
| `A` | `docs/qa/evidence/agents-check-20261102/agents-check.txt` | Evidencia de la validación |

### Módulos (`change_intent.modules`)

- `gobernanza-agentes`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Contenido y versión de los 11 agentes (`SKILL.md`): no cambian.
- WIP de `apex-control` presente en el árbol: no se toca ni se commitea.
- Promociones a `develop`/`main`, infraestructura, migraciones remotas.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo`.
- Sin secretos, credenciales ni artefactos locales en el diff.
- Los agentes auditores siguen siendo de solo lectura.

## 5. Criterios de aceptación

1. `node --check scripts/agents/sync-agents.js` → sin errores.
2. `npm run agents:sync` → `11 agentes y 8 documentos`.
3. `npm run agents:check` → `[agents] OK: 11 agentes y 8 documentos verificados`.
4. Repetir `npm run agents:sync` no produce cambios adicionales en `agents/registry.json`.

## 6. Evidencia y certificación exigida

- Pruebas: `node --check` y `npm run agents:check`.
- Evidencia: `docs/qa/evidence/agents-check-20261102/agents-check.txt`.
- `certification_status` esperado: `local_passed_qa_pending` (cambio de herramientas, sin impacto funcional de producto).

## 7. Capacidades protegidas

- Integridad del equipo de agentes — `agents:check` compara espejo, versión, `updated_at` y `sha256`.

## 8. Riesgos y rollback

- Riesgo: hashes del registro distintos a los publicados → Mitigación: regenerar con `agents:sync` y verificar con `agents:check` → Rollback: `git revert` del commit, sin reset.

## 9. Supuestos y preguntas abiertas

- Supuesto: los `SKILL.md` son texto UTF-8; normalizar CRLF no altera su contenido semántico.

## 10. Autorizaciones requeridas

- [x] Push a `origin/desarrollo`: autorización permanente y acotada de `AGENTS.md`, solicitada explícitamente al pedir dejar la rama alineada.

## 11. Documentación, agentes y publicación (obligatoria)

- **Documentación a actualizar**: este brief y `docs/qa/evidence/agents-check-20261102/`.
- **Agentes a actualizar**: ninguno; solo se refrescan hashes en `agents/registry.json`.
- **Registro**: `agents/registry.json` regenerado (`sha256`; `version` y `updated_at` sin cambios).
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `node --check` → commit.
- **Publicación**: `git push origin desarrollo`.
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y registro actualizados en el mismo commit
