# Recuperación controlada de módulos ERP

Estado: **candidata local validada; certificación funcional QA pendiente**.

Se localizó la pérdida en `179f80f8e609cf96668fea5c3c33adb76c3eea63`, rollback que retiró del historial de `develop` las versiones avanzadas que todavía conserva `desarrollo`. La recuperación se reconstruyó sobre el `develop` actual mediante hunks puntuales, nunca usando un árbol antiguo como baseline.

## Alcance recuperado

- Compras: proveedores, órdenes, recepción, devolución, importaciones, facturas y reporte de posiciones.
- Inventario: maestro y código anterior, cargue inicial, traslados, valoración, kardex y reportes.
- Tesorería: bancos, pagos, anticipos, aplicaciones, reversión y contratos contables.
- Ventas: facturación, grilla, consultas, reportes y normalización de colecciones.
- Contabilidad: terceros, IVA, retenciones, CxP, documentos y maestros.
- Dependencia mínima CxC: seis archivos indispensables para conservar los contratos integrados de Ventas y Tesorería.

No hay eliminaciones. No se tocaron Servicios, Talento Humano, Transporte, Proyectos, Administración ni infraestructura. `apps/web/lib/api.ts` se resolvió sobre la versión actual de `develop`, preservando sus cambios posteriores ajenos al ERP.

## Validación local

- 81/81 pruebas de contratos ERP: aprobado.
- TypeScript: aprobado.
- Prisma schema: aprobado.
- ESLint: 0 errores; 6 advertencias preexistentes.
- Build Next.js: aprobado, 73 páginas.
- Diff: 95 archivos, 0 eliminaciones.

## Bloqueos antes de publicar

La candidata no puede declararse certificada ni publicarse mientras no se despliegue en QA el commit exacto, se apliquen y auditen allí las cinco migraciones recuperadas, se ejecute `erp-module-recovery-qa.js`, se complete el recorrido navegador de creación/edición/persistencia por módulo y el solicitante otorgue aprobación funcional. `main` queda fuera de alcance.
