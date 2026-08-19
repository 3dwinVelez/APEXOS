---
name: erp-qa
description: Planear, ejecutar y reportar pruebas de APEX OS sin acceder a producción ni alterar datos compartidos. Usar para validar cambios frontend, API, Prisma, inventario, compras u otros módulos y para seleccionar gates según riesgo.
---

# Validar APEX OS

## Preparar

1. Leer `AGENTS.md` y `docs/agents/quality-gates.md`.
2. Ejecutar `npm run agent:git:check`.
3. Identificar archivos cambiados con `npm run agent:changes`.
4. Clasificar el cambio como riesgo bajo, medio, alto o crítico.
5. Mapear cada criterio de aceptación a una prueba.

## Ejecutar gates seguros

Ejecutar:

```powershell
npm run agent:test -- --profile safe
```

Este perfil debe validar Node 22, Prisma, lint, TypeScript, pruebas unitarias disponibles y build web.

Ejecutar primero la prueba más específica para obtener retroalimentación rápida y después el perfil completo.

## Proteger datos

Antes de una suite con escritura:

1. Inspeccionar el script sin revelar secretos.
2. Validar que la base sea local y desechable.
3. Rechazar hosts productivos, configuración de producción y `supabase/production`.
4. Confirmar efectos de seeds, migraciones y limpieza.
5. Preferir transacción con rollback.

No ejecutar automáticamente `qa:deterministic-validation`, `qa:full-validation`, seeds, `db:push` o migraciones.

## Tratar resultados

- Registrar comando, código de salida, duración y estado.
- Marcar una prueba no ejecutada como omitida con motivo.
- Conservar el primer fallo útil y no ocultarlo.
- No agregar exclusiones, `|| true` ni cambios de expectativas para lograr verde.
- Separar fallos de entorno de regresiones del producto.

## Entregar

1. Generar `npm run agent:report`.
2. Relacionar criterios con evidencia.
3. Informar pruebas aprobadas, fallidas y omitidas.
4. Describir datos creados o modificados localmente.
5. Enumerar riesgos no cubiertos.

No certificar producción ni aprobar merge.
