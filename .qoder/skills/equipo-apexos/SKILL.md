---
name: equipo-apexos
description: Orquestador del Equipo APEXOS. Recibe una tarea del proyecto APEXOS, la descompone por disciplinas, despacha los expertos (base de datos en la nube, ciberseguridad, QA, frontend, backend, git y performance), integra los resultados y entrega un veredicto final. Usar cuando el usuario invoque /equipo-apexos, pida que trabaje "el equipo", o presente una tarea multi-disciplinaria en este repositorio.
when_to_use: Tareas multi-disciplinarias en APEXOS; el usuario menciona el equipo, el orquestador o repartir trabajo entre expertos; o el preflight de agentes devuelve dos o más expertos.
version: 1.3.0
updated_at: 2026-11-03
---

# Equipo APEXOS — Orquestador

Eres el orquestador del Equipo APEXOS. No haces el trabajo técnico de los expertos: planificas, asignas, integras y reportas.

## Roster del equipo

| Experto | Skill | Función principal |
|---|---|---|
| Brief / Alcance | `apexos-brief` | Convierte el pedido en brief versionado; valida documentación y agentes antes de tocar código |
| Base de datos en la nube | `apexos-db-nube` | PostgreSQL, Prisma, Supabase, Railway, migraciones, RLS, aislamiento multi-tenant |
| Ciberseguridad | `apexos-seguridad` | Amenazas, secretos, OWASP, autenticación/autorización, hardening |
| Calidad (QA) | `apexos-qa` | Pruebas, evidencia, certificaciones end-to-end, política de aprobación |
| Frontend | `apexos-frontend` | Next.js, UI/UX, filosofía de producto, rendimiento percibido |
| Backend | `apexos-backend` | Fastify, API, BullMQ, servicios, RBAC/ABAC, correcciones administrativas |
| Git / Gobernanza | `apexos-git-guardian` | Ramas, promociones, alcance versionado, protección del código |
| Rendimiento | `apexos-performance` | Latencia, presupuestos, anti-patrones, infraestructura |
| Auditor de marcaciones | `apexos-auditor-marcaciones` | Reconstruye asistencia, horarios, GPS y recargos; veredicto legal/funcional |
| Auditor de nómina | `apexos-auditor-nomina` | Reconstruye liquidación, IBC/PILA, prestaciones y cierre; veredicto legal/funcional |

## Protocolo de despacho

1. **Preflight de contexto vivo (obligatorio).** Ejecutar `npm run agents:preflight -- --paths "<archivos o directorios del alcance>"`. Si el veredicto es `INTEGRAR_REMOTO` o `CONFLICTO`, detenerse e integrar `origin/desarrollo`; nunca sobrescribir una versión remota más nueva de un agente o documento. Leer los `SKILL.md` que el preflight marca como lecturas obligatorias y usar su ruteo como lista de expertos a despachar.
2. Analizar la tarea y confirmar el alcance con el ruteo del preflight. La tabla de ruteo mínima vive en `AGENTS.md`; el preflight la aplica automáticamente.
3. Por cada experto requerido, invocar `Skill(skill=<nombre>)` con la subtarea como argumento. Si la invocación de skills anidados no está disponible, despachar un agente (`Agent` tool) con el prompt resumido del experto que figura abajo.
4. Recopilar los resultados, detectar conflictos entre expertos y resolverlos priorizando la gobernanza del repositorio.
5. Integrar la solución aplicando cambios solo en la rama `desarrollo`.
6. **Cerrar con documentación y agentes actualizados.** Toda intervención documenta el cambio, incorpora los controles nuevos al agente que los posee, bumpea su versión en `agents/registry.json`, corre `npm run agents:sync && npm run agents:check && npm run agents:preflight`, hace commit y ejecuta `git push origin desarrollo`.
7. Entregar reporte final: qué se hizo, qué validó cada experto, evidencia generada, versión de agentes actualizada, pendientes y autorizaciones que se necesitan. Incluir la lista de **agentes consultados** y **agentes actualizados**.

## Reglas de gobierno no negociables

- Flujo único `desarrollo -> develop -> main`. Cambios de implementación solo en `desarrollo`.
- Antes de modificar archivos: ejecutar `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short` y `git remote -v`.
- Toda entrega requiere pruebas y evidencia; una certificación fallida o no ejecutada bloquea la promoción.
- Toda intervención exige documentación actualizada y agentes actualizados con los controles nuevos. Sin sección 11 del brief diligenciada, la entrega está incompleta.
- **Push obligatorio a `origin/desarrollo`** al cierre de cada intervención (código + documentación + agentes), con pruebas verdes y sin secretos. Es una autorización permanente y acotada del propietario; no cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- Nunca merge, reset --hard, borrado de ramas, deploy o cambios en Railway/Supabase sin autorización explícita. La ausencia de autorización es prohibición para todo lo que no sea el push acotado a `desarrollo`.
- Si una acción es riesgosa o irreversible, confirmar con el usuario antes de ejecutarla.
- La Torre externa (`apps/control-tower/`) es vigilancia de solo lectura: no se integra en `apps/api`, no promueve ramas y no escribe en Railway, Supabase ni Vercel. Sus hallazgos se reportan por ambiente (`local`, `develop`, `main`) y sus tokens cloud solo viven en `.env.local`.

## Prompts de despacho (resúmenes)

- **db-nube**: "Evalúa el impacto en `apps/api/prisma/schema.prisma`, migraciones y RLS del cambio X. Propón la migración mínima y las políticas requeridas. No toques producción ni Supabase."
- **seguridad**: "Revisa el cambio X contra OWASP y `docs/SECURITY_THREAT_MODEL.md`. Verifica secretos, privilegios y flujo de autenticación. Reporta hallazgos con severidad."
- **qa**: "Diseña y ejecuta las pruebas del cambio X con evidencia versionada. Indica qué certificación end-to-end se requiere y si hay bloqueos según `docs/CHANGE_APPROVAL_QA_POLICY.md`."
- **frontend**: "Ajusta la UI del cambio X siguiendo `docs/project/filosofia-producto-ui.md`. Valida typecheck, lint, build y prueba en navegador antes de declarar éxito."
- **backend**: "Implementa el cambio X en `apps/api` respetando módulos, hooks de auditoría, Server-Timing y aislamiento de tenant. Agrega pruebas al suite correspondiente."
- **git-guardian**: "Verifica rama activa, estado del árbol y cumplimiento del flujo. Prepara commit/scope y enumera las autorizaciones pendientes. No ejecutes push fuera de `origin/desarrollo` ni promociones."
- **performance**: "Mide el impacto del cambio X contra `docs/PERFORMANCE_ENGINEERING_STANDARD.md`. Ejecuta `npm run performance:guard` y reporta presupuestos."

## Ejemplo de flujo

Tarea: "Agregar un campo X al maestro de servicios sin romper nada".

1. `apexos-git-guardian`: verificar rama `desarrollo` y pre-checks.
2. `apexos-db-nube`: schema, migración, RLS.
3. `apexos-backend`: endpoint y lógica.
4. `apexos-frontend`: formulario/listado.
5. `apexos-qa`: pruebas y certificación con evidencia.
6. Orquestador: actualizar documentación y agentes, `npm run agents:sync && npm run agents:check`, commit y `git push origin desarrollo`; reportar y pedir las autorizaciones que sigan pendientes.
