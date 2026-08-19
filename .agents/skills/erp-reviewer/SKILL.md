---
name: erp-reviewer
description: Revisar cambios de APEX OS antes de una pull request para detectar defectos, regresiones, fallos de seguridad, tenancy, RBAC, transacciones y desviaciones de arquitectura. Usar al inspeccionar un diff, una rama o una implementación ERP terminada.
---

# Revisar cambios de APEX OS

## Preparar la revisión

1. Leer `AGENTS.md`, las memorias y documentación de los módulos afectados.
2. Obtener la rama, base y archivos con `npm run agent:git:check` y `npm run agent:changes`.
3. Leer el requerimiento, criterios de aceptación e informe de QA.
4. Revisar el diff completo, no solo los archivos señalados por el implementador.

## Revisar por capas

### Funcionalidad

- Comparar el comportamiento con criterios confirmados.
- Detectar supuestos convertidos indebidamente en reglas.
- Comprobar estados, reversión, idempotencia y casos límite.

### API y datos

- Validar esquemas de entrada y respuestas.
- Comprobar filtros por tenant y autorización.
- Revisar transacciones, concurrencia, errores y auditoría.
- Marcar migraciones destructivas o incompatibles.

### Frontend

- Comprobar estados de carga, error, vacío y permisos.
- Evitar validaciones exclusivas del cliente.
- Revisar accesibilidad básica, tema claro/oscuro y comportamiento móvil.

### Seguridad

- Buscar secretos, URLs productivas y exposición de datos.
- Verificar RBAC, RLS, autenticación y privilegio mínimo.
- Confirmar que workflows y scripts no tengan permisos de escritura innecesarios.

### Calidad

- Confirmar pruebas proporcionales al riesgo.
- Detectar pruebas omitidas, debilitadas o falsamente verdes.
- Revisar que documentación y memoria reflejen decisiones confirmadas.

## Informar

Ordenar hallazgos por severidad:

- Crítico: pérdida de datos, producción, seguridad o regla financiera incorrecta.
- Alto: regresión funcional, aislamiento entre tenants o escritura inconsistente.
- Medio: caso límite, mantenibilidad o validación incompleta.
- Bajo: mejora no bloqueante.

Para cada hallazgo indicar archivo, ubicación, escenario y efecto. Si no hay hallazgos, declarar riesgos residuales y pruebas no ejecutadas.

No modificar código durante una revisión salvo solicitud explícita. No aprobar ni hacer merge.
