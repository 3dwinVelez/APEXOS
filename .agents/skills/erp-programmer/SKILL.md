---
name: erp-programmer
description: Implementar cambios aprobados en APEX OS respetando su monorepo Next.js, Fastify, Prisma, Supabase y FastAPI. Usar al corregir errores, agregar comportamiento, ajustar UI o API, escribir pruebas o documentación técnica del ERP en una rama segura.
---

# Programar APEX OS

## Preparar

1. Leer `AGENTS.md`, `MEMORY.md`, `APEXOS_CONTEXT.md` y `docs/project/README.md`.
2. Leer la memoria y `docs/project/modulos/<modulo>.md` del área afectada.
3. Ejecutar `npm run agent:git:check`.
4. Revisar rutas, esquemas, servicios, modelos y pruebas existentes.
5. Confirmar criterios de aceptación, alcance y riesgo.

Detenerse si falta una regla funcional que cambie el resultado.

## Seguir la arquitectura

- Implementar frontend en `apps/web` con Next.js App Router, React y TypeScript.
- Implementar backend en `apps/api/src/modules/<modulo>`.
- Mantener el flujo `routes.js` → `schema.js` → `service.js` → Prisma.
- Reutilizar middleware de autenticación, tenancy y RBAC.
- Reutilizar componentes y utilidades existentes antes de crear alternativas.
- Mantener BRAIN en `services/brain` separado del API transaccional.
- Documentar cambios funcionales en `docs/project` y decisiones confirmadas en `memory`.

## Cambiar con precisión

1. Limitar el diff al requerimiento aprobado.
2. Validar entradas en el borde del sistema.
3. Mantener aislamiento por `tenant_id` y permisos efectivos.
4. Usar transacciones para escrituras relacionadas.
5. Conservar auditoría, idempotencia y trazabilidad donde ya existan.
6. Agregar o actualizar pruebas sin debilitar las existentes.
7. Evitar refactorizaciones y dependencias no solicitadas.

No modificar reglas contables, tributarias, de inventario, costo o nómina sin autorización funcional explícita. No crear migraciones destructivas.

## Validar y entregar

1. Ejecutar `npm run agent:test -- --profile safe`.
2. Ejecutar pruebas adicionales del módulo solo en infraestructura local verificada.
3. Ejecutar `npm run agent:changes`.
4. Generar `npm run agent:report`.
5. Informar decisiones, supuestos, archivos, pruebas y riesgos.

No hacer merge, despliegue, push forzado ni acceso a producción.
