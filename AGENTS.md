# Instrucciones para agentes de APEX OS

Este archivo es el índice operativo para agentes humanos y automatizados que trabajen en el ERP. Las reglas detalladas están en `docs/agents/`.

## Inicio obligatorio

Antes de analizar, diseñar o modificar:

1. Ejecutar `npm run agent:git:check`.
2. Leer `MEMORY.md`.
3. Leer `APEXOS_CONTEXT.md` y `docs/project/README.md`.
4. Identificar el módulo afectado y leer por completo:
   - La memoria enlazada desde `MEMORY.md`, si existe.
   - `docs/project/modulos/<modulo>.md`.
   - Cualquier `CONTEXT.md` aplicable.
5. Revisar código y pruebas vigentes antes de proponer cambios.


No asumir que una instrucción histórica sigue vigente cuando contradice el código o una memoria más reciente.

## Arquitectura del repositorio

- `apps/web`: Next.js 15, React 19 y TypeScript.
- `apps/api`: Fastify 5, JavaScript CommonJS y Prisma.
- `apps/api/src/modules`: módulos backend organizados normalmente en `routes.js`, `schema.js`, `service.js` y, cuando aplica, `brain.js`.
- `apps/api/prisma`: esquema y migraciones de PostgreSQL.
- `services/brain`: servicio Python/FastAPI de análisis.
- `supabase`: migraciones, políticas RLS, pruebas y scripts de producción.
- `packages/types`: tipos compartidos.
- `scripts`: herramientas operativas y QA.
- `docs/project`: documentación funcional canónica.
- `memory`: decisiones persistentes confirmadas.

## Skills disponibles

- `.agents/skills/erp-programmer`: implementar cambios mínimos y trazables.
- `.agents/skills/erp-reviewer`: revisar código, seguridad, arquitectura y regresiones.
- `.agents/skills/erp-qa`: seleccionar y ejecutar validaciones seguras.
- `.agents/skills/erp-functional-reviewer`: validar requerimientos y reglas funcionales.
- `.agents/skills/erp-self-improvement`: proponer mejoras al sistema de agentes mediante pull request.

Leer el `SKILL.md` correspondiente antes de asumir uno de estos roles.

## Flujo coordinado

Seguir `docs/agents/workflow.md`. El orden normal es:

1. Análisis del requerimiento y clasificación de riesgo.
2. Revisión funcional de reglas y criterios de aceptación.
3. Implementación en una rama de trabajo.
4. QA proporcional al riesgo.
5. Revisión técnica independiente.
6. Informe de ejecución y propuesta de pull request.
7. Aprobación, merge y despliegue exclusivamente por una persona autorizada.

No permitir que el mismo resultado se considere aprobado solo porque el agente que lo implementó también lo revisó.

## Límites no negociables

- No leer, imprimir, copiar ni versionar credenciales, tokens o archivos de entorno reales.
- No modificar reglas contables, tributarias, de inventario o costo sin autorización funcional explícita.
- No desactivar, omitir, borrar ni debilitar pruebas existentes.
- No ampliar permisos, roles, RLS, RBAC o autonomía de agentes sin revisión humana.
- No usar scripts `*:prod`, archivos `supabase/production`, `config/production.env` ni endpoints productivos.
- No convertir un fallo de calidad en advertencia para obtener un resultado verde.

Aplicar además `docs/agents/security-boundaries.md` y `docs/agents/autonomy-levels.md`.

## Validación

Usar únicamente comandos existentes o incorporados y documentados en este repositorio. El punto de entrada recomendado es:

```powershell
npm run agent:test -- --profile safe
```

Los gates mínimos y las excepciones están en `docs/agents/quality-gates.md`. Las suites con base de datos solo se ejecutan cuando el agente demuestra que la URL apunta a una base local y desechable.

## Memoria y automejora

- Registrar únicamente decisiones, correcciones, reglas de negocio y contexto confirmado por el usuario.
- No registrar secretos, contraseñas, tokens ni datos personales sensibles.
- Al crear una memoria de módulo, agregar su ruta y propósito a `MEMORY.md`.
- Todo aprendizaje del agente de automejora debe convertirse en una propuesta revisable dentro de una pull request.
- El agente de automejora no puede aprobar su propia propuesta ni aumentar sus permisos.

