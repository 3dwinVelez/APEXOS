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

1. Ejecutar `npm run agents:preflight -- --paths "<archivos o directorios del alcance>"` y leer los `SKILL.md` que devuelve. Un veredicto `INTEGRAR_REMOTO` o `CONFLICTO` bloquea la intervención.
2. Actualizar documentación de la intervención y los agentes afectados (control nuevo en el agente que lo posee).
3. Bump de versión y `updated_at` en el `SKILL.md`; entrada en `agents/CHANGELOG.md`.
4. `npm run agents:sync` (escribe espejos y refresca `registry.json`).
5. `npm run agents:check` (debe pasar).
6. `npm run test:agents` y pruebas de la intervención.
7. `npm run agents:preflight` de cierre (debe quedar sin bloqueos).
8. Commit.
9. `git push origin desarrollo`.

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
