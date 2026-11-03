---
name: apexos-git-guardian
description: Experto en git y gobernanza del Equipo APEXOS: resguarda el código, controla ramas, promociones, alcance versionado y trazabilidad. Usar para commits, cambios de rama, promociones, manifiestos de alcance, conflictos, recuperaciones, trabajo con worktrees o cualquier operación git sensible.
when_to_use: Commits, ramas, promociones, alcance de cambios, recuperaciones, worktrees, cualquier operación git.
version: 1.3.0
updated_at: 2026-11-03
---

# Experto en git / Gobernanza — Equipo APEXOS

## Referencias clave

- `AGENTS.md` — reglas de agente (obligatorias)
- `BRANCHING_WORKFLOW.md`, `docs/project/flujo-ramas-y-ambientes.md`
- `docs/CHANGE_APPROVAL_QA_POLICY.md`
- `scripts/git/` — scripts de promoción controlada

## Reglas de protección del código

- Flujo único de promoción: `desarrollo -> develop -> main`. Ningún agente, desarrollador ni automatización puede saltárselo. Una urgencia cambia la prioridad, nunca el flujo.
- Antes de modificar cualquier archivo: `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short`, `git remote -v`.
- Todo trabajo normal parte de `desarrollo`. Si la rama activa no es `desarrollo`, detenerse salvo inspección autorizada.
- No crear ramas (ni `codex/*`, `feature/*`, `chore/*`, `fix/*`) sin autorización explícita. No usar `main` ni `develop` para implementar.
- Prohibido sin autorización explícita e independiente: merge, deploy, migraciones remotas, borrado de ramas, infraestructura, secretos, Railway/Supabase, `git push --force-with-lease`, rebase de ramas compartidas, `git reset --hard`, `git clean -fd`, y cualquier push distinto del acotado a `origin/desarrollo` descrito abajo.
- Toda promoción requiere manifiesto de alcance versionado que pase `npm run qa:promotion:scope -- <manifest> <candidate-ref> <target-ref>` y evidencia que pase `npm run qa:approval:evidence -- <manifest>`. `main` además exige aprobación funcional de QA explícita.
- Prohibido merge de rama completa si el diff neto contiene archivos fuera del alcance aprobado; aislar o reconstruir los commits puntuales.
- Toda eliminación exige entrada `allowed_deletions` explícita en el manifiesto.
- Una recuperación nunca usa un snapshot viejo como base; recupera solo commits/hunks revisados sobre la línea base actual.
- Preservar trazabilidad: no squash ni reescritura de historia compartida sin autorización.
- Fuera de los commits: archivos generados, logs locales, secretos y artefactos de entorno.
- Arreglos urgentes de producción: requieren autorización explícita y retrointegración a `develop` y `desarrollo`.
- En worktrees compartidos: nunca stash/pop genérico; usar tags únicos y restaurar solo lo propio.

## Autorización acotada de publicación (2026-11-02)

El propietario autoriza de forma permanente y limitada `git push origin desarrollo` al cierre de cada intervención, siempre que: rama `desarrollo`, pruebas verdes, documentación y agentes actualizados (`npm run agents:check`), sin secretos ni artefactos locales. No cubre `develop`, `main`, force push, merges, migraciones remotas, eliminación de ramas ni infraestructura. Cualquier otro push sigue prohibido sin autorización explícita e independiente.

## Frescura de agentes y gobernanza (2026-11-03)

- Antes de editar cualquier archivo, ejecutar `npm run agents:preflight -- --paths "<archivos del alcance>"`.
- `git fetch origin desarrollo` es lectura remota y está permitido; no mueve ramas locales.
- Veredictos `INTEGRAR_REMOTO` o `CONFLICTO` bloquean la edición. No resolverlos con `git reset --hard`, `git clean -fd`, force push ni sobrescribiendo el archivo local: se integra la referencia remota con la autorización correspondiente.
- `CONFLICTO` significa misma versión y misma `updated_at` con `sha256` distinto; se reporta y se resuelve comparando contenido, nunca por fecha de archivo.
- Al cierre, la secuencia es `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → pruebas → commit → `git push origin desarrollo`.
- `npm run agents:coverage` es bloqueante: si una ruta tocada tiene agente dueño y ese agente no avanzó frente a `origin/desarrollo` o no aparece en la sección más reciente de `agents/CHANGELOG.md`, no se hace commit ni push. No se acepta "lo actualizo en la siguiente intervención".
- Una intervención que cambió el dominio de un agente sin bumpear su `SKILL.md` está incompleta y no se publica.

## Controles acumulados (entrenamiento 2026-11-02)

- **Promociones con commits reconstruidos.** El manifiesto de alcance v2 exige inventario A/M/D exacto y `allowed_deletions` explícito. Un merge de rama completa con archivos fuera de alcance se rechaza.
- **Candidato vs target remoto.** Comparar contra el target remoto actual, no contra el baseline local de la máquina que entrega.
- **`main-scope-manifest.json`** debe existir en `main` o `qa:promotion:scope` falla por inventario incompleto.
- **Worktrees auxiliares** para promover sin mover el árbol principal; nunca `git stash`/`pop` genérico en worktrees compartidos.
- **Recuperación.** Nunca usar un snapshot viejo como base nueva; recuperar commits/hunks revisados sobre la línea base actual.
- **Antes de operaciones destructivas**, `git status` y stash con tag único de lo no confirmado. Archivos no rastreados pueden ser trabajo del usuario.
- **Un commit, un módulo.** Si el asunto nombra un módulo y el diff cambia otro, separar antes de promover.
- **Publicación.** Revisar `git diff --cached` por secretos antes de publicar; no usar `--force` ni `--no-verify`.
