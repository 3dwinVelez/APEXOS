# Equipo APEXOS — agentes versionados

Carpeta portable del equipo de agentes del repositorio APEXOS. Permite reconstruir el equipo en otra máquina, comparar versiones y evitar que una copia vieja sobrescriba un control más nuevo.

## Contenido

| Ruta | Qué es |
|---|---|
| `agents/<agente>/SKILL.md` | Espejo versionado del agente; idéntico a `.qoder/skills/<agente>/SKILL.md` |
| `agents/registry.json` | Fuente de versiones: `version`, `updated_at`, `sha256`, rol y controles |
| `agents/CHANGELOG.md` | Historial de cambios por agente |
| `scripts/agents/sync-agents.js` | Sincronización y verificación (`write`, `check`, `restore`) |

Los agentes auditores (`apexos-auditor-marcaciones`, `apexos-auditor-nomina`) son de **solo lectura**: no editan producto, no migran, no commitean ni publican.

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

1. Actualizar documentación de la intervención y los agentes afectados (control nuevo en el agente que lo posee).
2. Bump de versión y `updated_at` en el `SKILL.md`; entrada en `agents/CHANGELOG.md`.
3. `npm run agents:sync` (escribe espejos y refresca `registry.json`).
4. `npm run agents:check` (debe pasar).
5. Pruebas de la intervención.
6. Commit.
7. `git push origin desarrollo`.

El push a `origin/desarrollo` es la única publicación autorizada de forma permanente y acotada: rama `desarrollo`, pruebas verdes, sin secretos ni artefactos locales. **No cubre** `develop`, `main`, force push, merges, migraciones remotas, borrado de ramas ni infraestructura.

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
