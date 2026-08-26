# Normalización visual de Compras

Estado: **candidata para QA en develop**.

La revisión amplió la depuración visual al módulo de Compras. Se eliminaron accesos repetidos, paneles narrativos, métricas duplicadas y controles sin operación, conservando las capacidades activas.

## Cambios

- Portada: una sola capa de acceso para órdenes, recepción, proveedores, facturas, importaciones y reportes.
- Nueva OC: se mantienen creación, edición, aprobación, consulta, trazabilidad y búsqueda de SKU; se retiran centro de control, plantillas y botones sin implementación.
- Proveedores: se mantienen directorio, alta, edición y desempeño; se retiran métricas repetidas, plantillas, centro de control y enlaces duplicados.
- No se modificaron endpoints, payloads, permisos, reglas de compra, modelos ni migraciones.

## Resultado previo

- Contratos visuales y funcionales: 7/7.
- TypeScript: aprobado.
- ESLint: aprobado, 0 errores.
- Build Next.js: aprobado, 73 rutas.
- Eliminaciones de archivos: ninguna.
