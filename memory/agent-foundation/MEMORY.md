# Memoria: fundación de agentes

## Propósito

Conservar las decisiones confirmadas sobre el trabajo de agentes coordinados mediante OpenClaw en APEX OS.

## Decisiones confirmadas

- Los agentes pueden analizar requerimientos, programar, ejecutar pruebas seguras, revisar código y proponer mejoras.
- Los agentes trabajan únicamente en ramas de trabajo; `main`, `master` y `develop` están protegidas.
- Los agentes no hacen merge ni despliegues.
- Los agentes no acceden a bases de datos productivas.
- Los cambios contables, tributarios, de inventario o costo requieren autorización funcional explícita.
- No se permiten migraciones destructivas.
- Las pruebas existentes no se desactivan ni se debilitan.
- Los comandos deben existir y verificarse en el repositorio antes de usarse.
- El agente de automejora solo propone aprendizajes mediante una pull request revisable y no puede aumentar sus permisos.

## Arquitectura de la fundación

- `AGENTS.md` es el índice operativo.
- `docs/agents` contiene workflow, autonomía, gates y límites de seguridad.
- `.agents/skills` contiene las instrucciones de los cinco roles ERP.
- `scripts/agents` contiene controles multiplataforma ejecutables desde npm.
- `.github` contiene CI y plantillas de colaboración.

## Restricciones de validación

- Node.js 22 es el runtime oficial.
- Las pruebas seguras de CI no requieren credenciales ni servicios productivos.
- Las suites que escriben datos solo pueden usar una base local y desechable después de validar su destino.
- `qa:deterministic-validation` no forma parte del pipeline seguro porque actualmente escribe datos y consulta Supabase QA.

## Historial

### 2026-07-24

- El usuario aprobó crear la fundación inicial para agentes coordinados mediante OpenClaw.
- Se aprobó la rama `chore/openclaw-agent-foundation`.
