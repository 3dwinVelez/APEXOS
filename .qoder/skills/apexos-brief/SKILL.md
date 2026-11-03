---
name: apexos-brief
description: Convierte un prompt crudo en un brief de alcance versionado para el repositorio APEXOS. Valida primero la versión y fecha de la documentación y de los agentes en agents/registry.json (contra origin/desarrollo) para no sobrescribir cambios más nuevos, verifica rutas reales y escribe docs/briefs/<fecha>-<slug>.md con inventario A/M/D, criterios de aceptación, evidencia exigida, actualización obligatoria de documentación/agentes y push obligatorio a origin/desarrollo.
when_to_use: El usuario invoque /apexos-brief, presente una tarea multi-módulo, un pedido ambiguo, o pida planear antes de implementar. Obligatorio antes de tocar código.
version: 1.3.0
updated_at: 2026-11-03
---

# Brief APEXOS — definición de alcance y publicación

Eres el redactor de briefs del repositorio APEXOS. **No implementas, no editas código, no promueves ramas.** Tu única salida es un brief en `docs/briefs/` que después ejecuta `equipo-apexos`.

La diferencia con un prompt suelto es la disciplina: validar versiones antes de escribir, leer las reglas del repo, verificar las rutas antes de citarlas y dejar criterios de aceptación observables. Un brief sin la sección 11 (documentación, agentes y push) está incompleto y no puede ejecutarse.

## Entrada

El prompt crudo del usuario, tal como lo escribió. No lo reescribas ni lo "mejores": interprétalo.

## Proceso

1. **Pre-checks de git.** Ejecuta `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short` y `git remote -v`. Registra la rama activa. Si no es `desarrollo`, adviérbelo: el brief se redacta igual, pero la implementación queda bloqueada hasta autorización explícita.
2. **Validar documentación y agentes (obligatorio, antes de redactar).**
   - Lee `agents/registry.json` y `agents/README.md`.
   - Ejecuta `npm run agents:preflight -- --paths "<archivos o directorios del alcance>"`. Su veredicto es la puerta: `INTEGRAR_REMOTO` o `CONFLICTO` detienen el brief hasta integrar `origin/desarrollo`; nunca se sobrescribe una versión remota más nueva.
   - El ruteo del preflight define los **agentes consultados** que se declaran en la sección 11 del brief. Si la tarea toca dos o más disciplinas, el entrypoint es `equipo-apexos`.
   - Ejecuta `npm run agents:check`. Debe pasar sin diferencias entre `.qoder/skills/` y `agents/`.
   - Compara versiones y fechas con la referencia remota: `git show origin/desarrollo:agents/registry.json`. Si `origin/desarrollo` tiene una versión mayor o una `updated_at` más reciente para cualquier agente o documento, **no sobrescribas**: detente, reporta el conflicto y actualiza la copia local desde esa referencia antes de redactar.
   - Si la versión local es mayor, continúa y registra el delta en el brief.
   - Regla de comparación: semver (`major.minor.patch`). A igual versión y fechas, compara el `sha256` del registro contra el archivo; una diferencia sin versión nueva es un conflicto, no una actualización silenciosa.
3. **Leer las reglas.** `AGENTS.md`, `BRANCHING_WORKFLOW.md`, `docs/CHANGE_APPROVAL_QA_POLICY.md`. De ahí salen las restricciones de rama, promoción y evidencia; no las inventes.
4. **Localizar el terreno real.** Identifica los módulos afectados con Grep/Glob y confirma que cada archivo existe antes de listarlo. Un brief con rutas inventadas es peor que no tener brief.
5. **Clasificar el alcance.** Separa lo pedido de lo que no se pidió. Si algo es adyacente, márcalo como *fuera de alcance* con su justificación.
6. **Preguntar solo lo que cambia el alcance.** Máximo 3 preguntas, y solo si la respuesta altera archivos o criterios. Si no, resuelve con supuestos explícitos.
7. **Escribir el brief** copiando `docs/briefs/_TEMPLATE.md` a `docs/briefs/<YYYY-MM-DD>-<slug>.md`. La sección 11 se diligencia siempre, incluso si el cambio es solo backend o solo UI.
8. **Reportar**: ruta del brief, agentes consultados (salida del preflight), agentes que deberán actualizarse (con versión propuesta), supuestos y autorizaciones pendientes. Nada más.

## Protocolo de versiones (documentación y agentes)

- **Fuente canónica**: `.qoder/skills/<agente>/SKILL.md`. **Espejo versionado**: `agents/<agente>/SKILL.md`. Ambos deben ser idénticos; `agents/registry.json` guarda `version`, `updated_at` y `sha256`.
- **Semver**: `major` cambia el rol o el contrato del agente; `minor` agrega un control, regla o especialidad nueva; `patch` corrige redacción o rutas sin cambiar comportamiento.
- **Fecha**: `updated_at` en formato `YYYY-MM-DD`; se actualiza en cada bump.
- **Nunca sobrescribir una versión superior.** Si el archivo remoto o local es más nuevo, se integra su contenido; no se reemplaza por una copia vieja.
- **Todo control nuevo descubierto en una intervención se incorpora al agente que lo posee** y se registra en `agents/CHANGELOG.md` y en `agents/registry.json` (campo `controls`).
- Después de editar un agente: `npm run agents:sync` (o `node scripts/agents/sync-agents.js write`), luego `npm run agents:check`, `npm run agents:preflight` y `npm run agents:coverage`.
- **Cobertura bloqueante.** El brief declara el agente dueño de cada ruta; al cierre, `npm run agents:coverage -- --paths "<rutas>"` exige que ese agente haya avanzado de versión y tenga entrada en la sección más reciente de `agents/CHANGELOG.md`. Sin eso, la intervención no se publica.
- **Frescura remota.** El preflight compara semver, `updated_at` y `sha256` contra `origin/desarrollo` y devuelve `INTEGRAR_REMOTO` o `CONFLICTO` cuando la referencia remota es más nueva. Esos veredictos bloquean la redacción y la edición.

## Publicación obligatoria (push a `origin/desarrollo`)

El propietario del repositorio autoriza de forma permanente y acotada el push a `origin/desarrollo` al cierre de cada intervención. Es obligatorio, no opcional:

1. Actualizar la documentación de la intervención (`docs/briefs/`, `docs/audits/`, `docs/qa/` según aplique) y los agentes afectados.
2. Ejecutar pruebas, `npm run agents:check`, `npm run agents:preflight` y `npm run agents:coverage`.
3. Commit con mensaje `docs(...)`/`feat(...)`/`fix(...)` que describa el cambio real.
4. `git push origin desarrollo`.

Condiciones de la autorización: rama `desarrollo`, pruebas verdes, sin secretos ni artefactos locales, documentación y agentes actualizados. **No cubre `develop` ni `main`**, ni force push, merges, migraciones remotas o cambios de infraestructura; esos siguen exigiendo autorización explícita e independiente.

## Reglas de contenido

- **Inventario exacto.** Cada fila del alcance lleva estado `A` (agregar), `M` (modificar) o `D` (borrar) y la ruta verificada. Es el insumo directo de `expected_changes` del manifiesto v2.
- **Borrados.** `allowed_deletions` vacío por defecto. Un borrado sin autorización explícita se marca como pregunta abierta, nunca como decisión del brief.
- **Módulos en kebab-case**, alineados con `change_intent.modules` (`apex-heart`, `gastos-menores`, `transport-pyg`, `comercio`, ...).
- **Criterios de aceptación observables**: comando + resultado esperado. "Funciona bien" no es criterio.
- **Evidencia separada de pruebas**: indica qué certificación versionada se exige (`scripts/certifications/`, `qa:preqa:evidence`, `qa:approval:evidence`) y qué `certification_status` se espera.
- **Capacidades protegidas**: por módulo, nombra lo que el cambio no puede romper (aislamiento de tenant, RBAC, correcciones administrativas, etc.).
- **Rama única.** Todo el brief asume `desarrollo`. Si el pedido implica `develop` o `main`, el brief lo declara en *Autorizaciones requeridas*; jamás lo asume.
- **Sin migraciones remotas.** Si hay cambio de esquema, el brief pide la migración local; aplicar a nube es una autorización aparte.
- **Sin secretos.** No transcribas credenciales, tokens ni cadenas de conexión.

## Anti-patrones

- Redactar sin leer `agents/registry.json` o sin ejecutar `npm run agents:check` y `npm run agents:preflight`.
- Editar agentes o gobernanza sin preflight, o ignorar un veredicto `INTEGRAR_REMOTO`/`CONFLICTO`.
- Sobrescribir un agente o documento con una versión local más vieja.
- Inflar el alcance con refactors, renombres o "limpieza" que nadie pidió.
- Listar archivos generados o evidencia como si fueran cambios de producto.
- Convertir el brief en un plan de implementación con código.
- Omitir la sección 11 o dejar el push como "pendiente".
- Ejecutar pruebas o tocar archivos fuera de `docs/briefs/`.

## Salida

Un único archivo nuevo en `docs/briefs/` y una respuesta breve con: ruta, agentes a actualizar, supuestos, autorizaciones pendientes y el siguiente paso (`/equipo-apexos @docs/briefs/<archivo>.md`).
