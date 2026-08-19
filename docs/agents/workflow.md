# Workflow de agentes ERP

## Objetivo

Coordinar análisis, implementación, QA y revisión sin sustituir la aprobación humana, acceder a producción ni hacer merge automático.

## Entradas mínimas

Antes de asignar trabajo, registrar:

- Problema o resultado esperado.
- Módulos afectados.
- Criterios de aceptación verificables.
- Reglas de negocio confirmadas y preguntas abiertas.
- Riesgo sobre contabilidad, impuestos, inventario, costos, datos, permisos o migraciones.
- Entorno autorizado para validar.

Si falta una regla que cambia el resultado funcional, detener la implementación y solicitarla.

## Flujo

### 1. Preparar

1. Ejecutar `npm run agent:git:check`.
2. Leer `AGENTS.md`, memorias y documentación del módulo.
3. Obtener archivos cambiados con `npm run agent:changes`.
4. Clasificar el riesgo según `docs/agents/quality-gates.md`.
5. Acordar un plan antes de modificar reglas funcionales.

### 2. Revisar funcionalmente

El rol `erp-functional-reviewer`:

- Traduce el requerimiento a criterios comprobables.
- Separa reglas confirmadas, supuestos y preguntas.
- Bloquea cambios sensibles no autorizados.
- Identifica impactos entre módulos y documentos.

### 3. Implementar

El rol `erp-programmer`:

- Reutiliza la arquitectura existente.
- Limita el diff al alcance aprobado.
- Actualiza pruebas y documentación cuando corresponda.
- No modifica migraciones, permisos o reglas sensibles por inferencia.

### 4. Validar

El rol `erp-qa`:

- Ejecuta primero gates seguros.
- Usa bases de datos únicamente si son locales y desechables.
- Conserva comandos, resultados y fallos.
- No reescribe pruebas para ocultar regresiones.

### 5. Revisar técnicamente

El rol `erp-reviewer`:

- Revisa el diff completo y los criterios de aceptación.
- Comprueba tenancy, RBAC, transacciones, validaciones y manejo de errores.
- Prioriza hallazgos por severidad y referencia archivos concretos.
- No aprueba cambios con gates obligatorios fallidos.

### 6. Entregar

1. Ejecutar `npm run agent:report`.
2. Mostrar archivos modificados y pruebas ejecutadas.
3. Documentar decisiones, supuestos y riesgos pendientes.
4. Preparar la descripción de pull request.
5. Dejar merge, aprobación y despliegue a una persona autorizada estos los podra hacer codex con prepia autorizacion en el chat

## Handoffs

Cada traspaso debe incluir:

- Rama y commit base.
- Alcance y módulos.
- Archivos cambiados.
- Criterios satisfechos y pendientes.
- Pruebas ejecutadas con resultado.
- Riesgos, supuestos y preguntas abiertas.

No usar mensajes informales como única evidencia de aprobación.

## Fallos y escalamiento

Detener el flujo cuando:

- La rama sea protegida.
- El repositorio tenga cambios previos no atribuibles a la tarea.
- Se detecte una URL o credencial productiva.
- El requerimiento implique una regla sensible no confirmada.
- Una migración pueda perder o reescribir datos.
- Un gate obligatorio falle.
- Se necesite ampliar permisos o alcance.

El agente puede proponer alternativas, pero no eludir el bloqueo.
