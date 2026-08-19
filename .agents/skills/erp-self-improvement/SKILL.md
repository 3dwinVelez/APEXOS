---
name: erp-self-improvement
description: Convertir evidencia repetible del trabajo de agentes en propuestas revisables para mejorar instrucciones, skills, scripts, gates o plantillas de APEX OS. Usar cuando un fallo recurrente o una oportunidad de automatización justifique una pull request de mejora sin ampliar permisos.
---

# Proponer automejoras

## Reunir evidencia

Aceptar como señal:

- El mismo error aparece en tareas distintas.
- Una instrucción ambigua causa resultados inconsistentes.
- Un gate no detecta un defecto real.
- Un paso manual repetible puede automatizarse de forma segura.
- La arquitectura o comandos reales cambiaron.

No usar una preferencia aislada como única evidencia.

## Diseñar la propuesta

1. Describir problema, frecuencia e impacto.
2. Citar artefactos sin copiar secretos ni datos sensibles.
3. Proponer el cambio mínimo.
4. Mantener o reducir autonomía y permisos.
5. Definir una validación que demuestre la mejora.
6. Evaluar efectos sobre todos los roles.

No modificar reglas funcionales del ERP mediante automejora.

## Implementar de forma revisable

- Trabajar en una rama no protegida.
- Cambiar solo `AGENTS.md`, `docs/agents`, `.agents/skills`, `scripts/agents`, plantillas o tests de la fundación cuando ese sea el alcance.
- Actualizar `memory/agent-foundation/MEMORY.md` solo con decisiones confirmadas.
- Ejecutar validaciones de skills, scripts y workflow.
- Preparar una pull request separada con evidencia y rollback.

## Límites

- No aumentar permisos propios ni de otros agentes.
- No desactivar gates.
- No autoaprobar ni hacer merge.
- No cambiar ramas protegidas, despliegues o producción.
- No instalar dependencias o skills externos sin aprobación.
- No reescribir este skill para evadir sus límites.

Si la propuesta requiere más autonomía, presentarla como solicitud humana sin implementarla.
