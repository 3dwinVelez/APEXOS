# Integración ERP 2026-08-19

## Alcance

Integración controlada de los desarrollos locales de inventario, compras, facturación de clientes, contabilidad, CxC/CxP, tesorería y terceros sobre la versión vigente de `develop`.

Queda excluido expresamente el módulo nuevo de Gestión Comercial. Sus commits `5127229` y `3f00956`, rutas, migraciones, documentación y memoria pertenecen a otra rama y no forman parte de este conjunto.

## Matriz de trazabilidad

| ID | Archivo/área | Cambio integrado | Propósito | Riesgo | Dependencias | Prueba requerida |
| --- | --- | --- | --- | --- | --- | --- |
| ERP-01 | Inventario | Valoración por SKU/sociedad, traslados con tránsito, reportes, PDF y cargue inicial | Mantener stock, kardex, costo promedio y trazabilidad | Crítico | Prisma, Contabilidad, bodegas | Unidad, contratos, TypeScript y build |
| ERP-02 | Compras | OC, recepción parcial, devolución, cierre, PDF, importaciones y facturas | Completar el ciclo compra-recepción-factura | Crítico | Inventario, CxP, impuestos, terceros | Contratos, transacciones y regresión contable |
| ERP-03 | Ventas/CxC | Facturas y notas crédito, inventario, impuestos, vencimientos y saldos | Completar facturación a clientes | Crítico | Inventario, Contabilidad, terceros | Unidad, contratos y reversión |
| ERP-04 | Contabilidad | IVA, retenciones, documentos, cuentas asociadas y detalle transversal | Centralizar maestros y asientos balanceados | Crítico | PUCC, periodos, CxC/CxP | Rutas, maestros fiscales y balance |
| ERP-05 | Tesorería | Bancos, recaudos, pagos, anticipos, cruces y anulaciones | Controlar saldos y movimientos bancarios | Crítico | Contabilidad, CxC/CxP | Parciales, sobrepago, concurrencia y reversión |
| ERP-06 | Terceros | Maestro canónico con roles y saldos separados | Evitar duplicidad de NIT entre compras y ventas | Alto | Compras, Ventas, Brain | Compatibilidad histórica y tenancy |
| ERP-07 | Migraciones | Migraciones aditivas de terceros, tesorería e importaciones | Persistir las nuevas estructuras sin borrar historia | Crítico | PostgreSQL/Prisma | Revisión SQL y `prisma validate` |
| ERP-08 | UX | Captura consecutiva, controles numéricos, buscadores, modales y navegación | Agilizar operación repetitiva | Medio | Next.js | Lint, TypeScript y build |
| ERP-09 | Gobierno/QA | Skills, gates, informes e instrucciones para agentes | Hacer los cambios trazables y verificables | Medio | Git y scripts npm | Estado Git y perfil seguro |

## Auditoría Git

- Base sincronizada: `origin/develop` en `79ce53c5bf7ec2ddee5185643d24a669bd691f26`.
- Commit funcional local: `fe98cf5`.
- Integración de Develop: `e046775`.
- Conflicto detectado: únicamente `AGENTS.md`; se conservaron las reglas de ambos lados.
- Artefactos excluidos: `.tools`, `apps/web/.next-agent-*`, `outputs` y reportes locales generados.
- Gestión Comercial: cero archivos incluidos.

## Evidencia local

- 72 pruebas focalizadas aprobadas: inventario, compras, ventas, impuestos, terceros y tesorería.
- `npm run agent:test -- --profile safe`: aprobado después de regenerar el cliente Prisma.
- El primer gate detectó tipos Prisma locales desactualizados para `ServiceOrder.items`; `npm run prisma:generate` corrigió el entorno y la repetición completa aprobó.
- No se ejecutaron migraciones remotas, Supabase, Railway ni producción.

## Estado de promoción

El conjunto está apto para integrarse primero en `desarrollo` y proponerse hacia `develop`. La certificación visual y E2E del ambiente QA debe ejecutarse sobre el commit exacto que quede desplegado en `develop`; no habilita ni solicita promoción a `main`.
