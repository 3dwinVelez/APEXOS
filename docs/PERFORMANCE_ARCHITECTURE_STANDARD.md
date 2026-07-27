# Performance Architecture Standard

Este documento complementa `PERFORMANCE_ENGINEERING_STANDARD.md` y convierte sus criterios en reglas de arquitectura obligatorias.

## Presupuestos

- Feedback visual: menos de 100 ms.
- Navegación: menos de 500 ms.
- Primer dato útil de Servicios: menos de 1.200 ms.
- Endpoint simple p95: menos de 300 ms.
- Endpoint medio p95: menos de 600 ms.
- Endpoint complejo p95: menos de 1.000 ms.
- Fotografías: vista previa inmediata y transferencia no bloqueante.

## Clasificación de datos

- Críticos: identidad, permisos mínimos y primera página. Se solicitan primero.
- Secundarios: KPIs, históricos y conteos. Se cargan en paralelo después del contenido crítico.
- Bajo demanda: evidencias completas, reportes y maestros de edición.
- Precargables: rutas y catálogos estables vinculados a la siguiente acción probable.
- Cacheables: catálogos y permisos con TTL e invalidación específica.
- No cacheables: estados operativos y datos transaccionales.

## Reglas

- Todo listado debe tener límite o paginación.
- Toda consulta multiempresa debe filtrar por `company_id`.
- No se permiten N+1, filtros masivos en memoria ni `select *` en rutas críticas.
- Las lecturas GET concurrentes deben deduplicarse; las mutaciones invalidan solo su recurso.
- Auth, membresía y permisos se resuelven una vez por solicitud o interacción.
- La respuesta no debe incluir blobs, Base64 ni relaciones no visibles.
- Las imágenes se comprimen, suben a Storage y se referencian por ruta.
- Cada endpoint crítico expone tiempos seguros mediante `Server-Timing` o trazas equivalentes.
- Toda optimización requiere medición comparable y evidencia persistida.

## Aceptación

CI debe ejecutar lint, typecheck, build y el guard de presupuesto. El release añade validación de entorno, Prisma, unicidad de evidencias y guard de rendimiento.
