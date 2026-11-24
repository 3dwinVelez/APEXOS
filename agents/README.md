# Equipo APEXOS — agentes versionados

Carpeta portable del equipo de agentes del repositorio APEXOS. Permite reconstruir el equipo en otra máquina, comparar versiones y evitar que una copia vieja sobrescriba un control más nuevo.

## Contenido

| Ruta | Qué es |
|---|---|
| `agents/<agente>/SKILL.md` | Espejo versionado del agente; idéntico a `.qoder/skills/<agente>/SKILL.md` |
| `agents/registry.json` | Fuente de versiones: `version`, `updated_at`, `sha256`, rol y controles |
| `agents/CHANGELOG.md` | Historial de cambios por agente |
| `scripts/agents/sync-agents.js` | Sincronización y verificación (`write`, `check`, `restore`) |
| `scripts/agents/preflight.js` | Frescura remota y ruteo antes de editar |
| `scripts/agents/coverage.js` | Verifica que el agente dueño de cada ruta se actualizó |

Los agentes auditores (`apexos-auditor-marcaciones`, `apexos-auditor-nomina`) son de **solo lectura**: no editan producto, no migran, no commitean ni publican.

Todo agente registrado declara `contract: 2` con las secciones `Alcance`, `Lecturas obligatorias`, `Reglas duras`, `Checklist de intervención`, `Evidencia`, `Handoff` y `Antipatrones`, en ese orden. `agents:sync` y `agents:check` rechazan un agente sin contrato v2 o con secciones incompletas; `agents:sync` también rechaza un cambio de contenido sin bump de versión; `test:agents` verifica además que los once agentes lo cumplan.

## Instalación en otra máquina

```bash
git clone https://github.com/3dwinVelez/APEXOS.git
cd APEXOS
git checkout desarrollo
npm run agents:check          # verifica que el espejo y el registro coincidan
```

Si el clon no trae `.qoder/skills` o quedó desactualizado, restaurar desde el espejo:

```bash
node scripts/agents/sync-agents.js restore
npm run agents:check
```

`restore` copia `agents/<agente>/SKILL.md` hacia `.qoder/skills/<agente>/SKILL.md`. No toca documentos de gobernanza.

## Protocolo de versiones

- **Semver** en el frontmatter de cada `SKILL.md`:
  - `major`: cambia el rol o el contrato del agente.
  - `minor`: agrega un control, regla o especialidad nueva.
  - `patch`: corrige redacción o rutas sin cambiar comportamiento.
- **`updated_at`** en formato `YYYY-MM-DD`; se actualiza en cada bump.
- **`sha256`** del archivo canónico; lo refresca `npm run agents:sync`.
- **Nunca sobrescribir una versión superior.** Antes de editar, comparar con `git show origin/desarrollo:agents/registry.json`. Si la referencia remota tiene versión mayor o `updated_at` más reciente, integrarla.
- A igual versión y fecha, comparar `sha256`: una diferencia sin bump es un conflicto que se reporta, no una actualización silenciosa.

## Flujo obligatorio al tocar código

1. Ejecutar `npm run agents:preflight -- --paths "<archivos o directorios del alcance>"` y leer los `SKILL.md` que devuelve. Un veredicto `INTEGRAR_REMOTO` o `CONFLICTO` bloquea la intervención.
2. Actualizar documentación de la intervención y los agentes afectados (control nuevo en el agente que lo posee).
3. Bump de versión y `updated_at` en el `SKILL.md`; entrada en `agents/CHANGELOG.md`.
4. `npm run agents:sync` (escribe espejos y refresca `registry.json`).
5. `npm run agents:check` (debe pasar).
6. `npm run test:agents` y pruebas de la intervención.
7. `npm run agents:preflight` de cierre (debe quedar sin bloqueos).
8. `npm run agents:coverage -- --paths "<rutas>"` (bloqueante: cada agente dueño debe tener bump y entrada en `agents/CHANGELOG.md`).
9. Commit.
10. `git push origin desarrollo`.

El push a `origin/desarrollo` es la única publicación autorizada de forma permanente y acotada: rama `desarrollo`, pruebas verdes, sin secretos ni artefactos locales. **No cubre** `develop`, `main`, force push, merges, migraciones remotas, borrado de ramas ni infraestructura.

## Frescura remota

`npm run agents:preflight` compara cada agente y documento de gobernanza contra `origin/desarrollo` por semver, `updated_at` y `sha256`:

| Veredicto | Significado | Acción |
|---|---|---|
| `OK` | Sin referencias remotas más nuevas | Intervenir |
| `OK_CON_ADVERTENCIAS` | Hay avisos que no bloquean (sin fetch, agente solo local, ruta sin agente) | Revisar y continuar |
| `INTEGRAR_REMOTO` | `origin/desarrollo` tiene versión o fecha más nueva | Detenerse, integrar y repetir |
| `CONFLICTO` | Misma versión y fecha con `sha256` distinto | Resolver comparando contenido; no sobrescribir |
| `RAMA_NO_AUTORIZADA` | La rama activa no es `desarrollo` | Cambiar de rama o pedir autorización |

El preflight solo hace `git fetch`; no mueve ramas, no hace merge y no publica.

## Cobertura de contexto

`npm run agents:coverage -- --paths "<rutas>"` aplica la tabla de dueños del ruteo: `apps/web/**` → `apexos-frontend`, `apps/api/prisma/**` y `docs/DATABASE_CONVENTIONS.md` → `apexos-db-nube`, `apps/api/src/**` → `apexos-backend`, `apps/control-tower/**` e `infra/**` → `apexos-performance`, `docs/briefs/**` → `apexos-brief`. Gobernanza, scripts, pruebas y evidencia no tienen dueño obligatorio.

Para cada dueño exige:

1. Versión local por delante de `origin/desarrollo` (o agente nuevo solo local).
2. Mención del agente en la sección más reciente de `agents/CHANGELOG.md`.

Si falta cualquiera de las dos, el comando sale con código 1 y la intervención no se publica.

## Registro

Cada entrada de `agents` en `registry.json` contiene:

```json
{
  "name": "apexos-backend",
  "role": "experto-backend",
  "version": "1.1.0",
  "updated_at": "2026-11-02",
  "sha256": "<hash del SKILL.md canónico>",
  "source": ".qoder/skills/apexos-backend/SKILL.md",
  "mirror": "agents/apexos-backend/SKILL.md",
  "controls": ["hr-motor-nomina", "tenant-context-unico-filtro"]
}
```

La sección `documents` rastrea la gobernanza (`AGENTS.md`, `BRANCHING_WORKFLOW.md`, política de QA, plantilla de brief y estándares) con `updated_at` tomado del último commit y `sha256`. Si un documento cambia sin refrescar el registro, `agents:check` falla.

## Conflictos frecuentes

| Síntoma | Causa | Acción |
|---|---|---|
| `espejo desincronizado` | Se editó el canónico sin `agents:sync` | `npm run agents:sync` |
| `sha256 del registro no coincide` | Archivo editado sin sincronizar | `npm run agents:sync` |
| `registry X != frontmatter Y` | Falta bump de versión | Bump semver y `updated_at`, luego sync |
| `documento cambiado sin registrar` | Se editó gobernanza sin sync | `npm run agents:sync` |
| `Agentes en .qoder/skills sin entrada` | Agente nuevo no registrado | Agregar entrada en `registry.json` con rol y controles |
| `falta la seccion obligatoria` | Agente con `contract: 2` incompleto | Completar las secciones del contrato v2 |
| `lectura obligatoria inexistente` | El skill referencia una ruta que no existe | Corregir la ruta o crear el documento |
| `sin bump local frente a origin` | Se tocó el dominio sin actualizar al dueño | Bump semver, `updated_at`, changelog y sync |
| `sin entrada en la seccion mas reciente` | El changelog no menciona al dueño | Agregar la entrada de la intervención |
