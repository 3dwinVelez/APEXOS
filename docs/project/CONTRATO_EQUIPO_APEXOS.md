# Contrato del Equipo APEXOS

Versión: 2.0 — 2026-11-03

Documento rector del equipo de agentes. `AGENTS.md` manda sobre ramas, promociones y autorizaciones; este contrato manda sobre cómo un agente entiende, actualiza y entrega su contexto.

## 1. Regla de oro: contexto vivo

Los agentes no son documentación estática. Son el contexto operativo del repositorio y se actualizan en la misma intervención que cambia su dominio.

- Toda intervención empieza consultando al agente dueño del área y termina actualizándolo si su dominio cambió.
- El contexto se versiona en `agents/registry.json` (semver, `updated_at`, `sha256`, `controls`) y se registra en `agents/CHANGELOG.md`.
- Una intervención sin actualización del agente dueño está incompleta y no se publica.
- Nunca se sobrescribe una versión remota más nueva. `origin/desarrollo` es la referencia; la copia local se integra, no se impone.

## 2. Preflight obligatorio

Antes de editar:

```bash
npm run agents:preflight -- --paths "<archivos o directorios del alcance>"
```

El preflight:

1. Hace `git fetch origin desarrollo` (solo lectura remota).
2. Compara cada agente y documento de gobernanza por semver, `updated_at` y `sha256`.
3. Devuelve un veredicto: `OK`, `OK_CON_ADVERTENCIAS`, `INTEGRAR_REMOTO`, `CONFLICTO` o `RAMA_NO_AUTORIZADA`.
4. Rutea las rutas declaradas a los agentes obligatorios.
5. Lista los `SKILL.md` que deben leerse antes de editar.

`INTEGRAR_REMOTO` y `CONFLICTO` bloquean. No se resuelven con `reset --hard`, `clean -fd`, force push ni sobrescribiendo el archivo; se integra la referencia remota con la autorización que corresponda.

`CONFLICTO` significa misma versión y misma fecha con `sha256` distinto. Se resuelve comparando contenido, nunca por fecha de archivo.

## 3. Ruteo mínimo

| Ruta | Agentes requeridos | Dueño del contexto |
|---|---|---|
| `apps/web/**` | frontend, QA | `apexos-frontend` |
| `apps/api/prisma/**` | DB, backend, seguridad, QA | `apexos-db-nube` |
| `apps/api/src/**` | backend, seguridad, QA | `apexos-backend` |
| `apps/api/src/modules/hr/**` | backend, seguridad, QA; auditores solo para dictamen | `apexos-backend` |
| `apps/control-tower/**` | performance, seguridad, QA | `apexos-performance` |
| `docs/design/**` | frontend | `apexos-frontend` |
| `docs/DATABASE_CONVENTIONS.md` | DB | `apexos-db-nube` |
| `scripts/certifications/**` | QA | `apexos-qa` |
| `infra/**`, Docker/Railway/Supabase | performance, seguridad | `apexos-performance` |
| `AGENTS.md`, `agents/**`, `.qoder/skills/**`, `docs/project/CONTRATO_EQUIPO_APEXOS.md` | equipo, brief, git-guardian | el agente editado |

La tabla de `AGENTS.md` es el contrato; `scripts/agents/lib/agent-routing.js` es la implementación. Si divergen, manda `AGENTS.md` y se corrige el script en la misma intervención.

### Cobertura bloqueante

`npm run agents:coverage -- --paths "<rutas>"` toma los dueños de la tabla y exige, para cada uno:

1. Versión local por delante de `origin/desarrollo` (o agente nuevo solo local).
2. Mención del agente en la sección más reciente de `agents/CHANGELOG.md`.

Rutas de gobernanza, scripts, pruebas y evidencia no tienen dueño obligatorio. Si falta cualquiera de las dos condiciones, el comando sale con código 1 y la intervención no se publica.

## 4. Contrato de cada agente

Un agente entrenado declara `contract: 2` en el frontmatter y contiene estas secciones, en este orden:

| Sección | Contenido obligatorio |
|---|---|
| `## Alcance` | Qué decide, qué no decide y qué archivos le pertenecen |
| `## Lecturas obligatorias` | Documentos y código que debe leer antes de actuar |
| `## Reglas duras` | Reglas numeradas, con el *por qué* cuando no sea obvio |
| `## Checklist de intervención` | Pasos antes, durante y después, verificables |
| `## Evidencia` | Qué se captura, dónde y con qué comando |
| `## Handoff` | Qué entrega a los otros agentes y qué debe declarar |
| `## Antipatrones` | Errores conocidos que debe rechazar |

`npm run agents:check` falla si un agente con `contract: 2` no cumple las secciones o si sus lecturas obligatorias no existen.

## 5. Checklist universal

Antes:

- [ ] Rama `desarrollo` y árbol revisado.
- [ ] Preflight sin bloqueos y lecturas obligatorias leídas.
- [ ] Agente dueño identificado y versión actual anotada.
- [ ] Alcance separado de lo adyacente; rutas verificadas.

Durante:

- [ ] Reglas duras del agente dueño respetadas.
- [ ] Sin cambios fuera del alcance declarado.
- [ ] Pruebas escritas o actualizadas junto con el cambio.

Al cerrar:

- [ ] Agente dueño actualizado: control nuevo (si lo hay), bump semver y `updated_at`.
- [ ] Entrada en `agents/CHANGELOG.md`.
- [ ] `npm run agents:sync && npm run agents:check && npm run agents:preflight && npm run agents:coverage`.
- [ ] Evidencia versionada.
- [ ] Documentación de la intervención actualizada.
- [ ] Commit y `git push origin desarrollo`.

## 6. Evidencia

La evidencia es un artefacto versionado, no una afirmación en el chat.

- Va en `docs/qa/evidence/<cambio>/` o en la carpeta de auditoría correspondiente.
- No contiene datos personales, tokens, credenciales ni rutas locales absolutas.
- Unidad, lint, typecheck o build por sí solos no certifican un flujo.
- Si no se pudo probar algo, se declara como bloqueo explícito; no se presenta como resuelto.

## 7. Handoff

Al terminar, cada agente entrega:

- Qué cambió y por qué.
- Qué archivos y contratos tocó.
- Qué validó y con qué evidencia.
- Qué queda pendiente y quién es el responsable.
- Qué agente debe actualizarse y con qué control nuevo.
- Qué autorización falta, si aplica.

## 8. Antipatrones globales

- Editar sin preflight o ignorar `INTEGRAR_REMOTO`/`CONFLICTO`.
- Cambiar un agente sin bump o bumpear sin cambiar nada sustantivo.
- Duplicar reglas entre `AGENTS.md`, este contrato y los skills en lugar de referenciarlas.
- Mezclar módulos en un commit o ampliar el alcance sin declararlo.
- Presentar una verificación parcial como certificación.
- Sobrescribir trabajo remoto con una copia local vieja.

## 9. Contrato vigente

Los once agentes del equipo declaran `contract: 2` desde el 2026-11-03: `apexos-frontend` y `apexos-db-nube` (fase 1); `apexos-backend`, `apexos-seguridad` y `apexos-qa` (fase 2); `apexos-performance`, `apexos-brief`, `apexos-git-guardian`, `equipo-apexos`, `apexos-auditor-marcaciones` y `apexos-auditor-nomina` (fase 3). `agents:sync` y `agents:check` exigen el contrato a todo agente registrado: un agente nuevo sin `contract: 2` o una regresión a `contract: 1` bloquea la sincronización y la validación. `agents:sync` también rechaza un cambio de contenido sin bump de versión, de modo que ninguna actualización pasa en silencio. `agents:check` valida las secciones ordenadas y la existencia de las lecturas obligatorias, y `test:agents` verifica que los once agentes cumplan el contrato.
