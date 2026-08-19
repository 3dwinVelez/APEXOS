# Índice de memorias de APEX OS

Este archivo dirige a las memorias persistentes de cada módulo. Debe leerse al comenzar cualquier sesión de trabajo en el proyecto.

| Área o funcionalidad | Memoria | Cuándo consultarla |
| --- | --- | --- |
| Compras — Facturas | [`memory/compras-facturas/MEMORY.md`](memory/compras-facturas/MEMORY.md) | Antes de analizar o modificar facturas dentro del módulo de Compras. |
| Inventario — Valoración y traslados | [`memory/inventario-valoracion-traslados/MEMORY.md`](memory/inventario-valoracion-traslados/MEMORY.md) | Antes de modificar costos, movimientos, reportes o traslados de inventario. |
| Fundación de agentes | [`memory/agent-foundation/MEMORY.md`](memory/agent-foundation/MEMORY.md) | Antes de cambiar instrucciones, skills, autonomía, controles o automatización de agentes. |
| Ventas — Facturación y CxC | [`memory/ventas-facturacion-clientes.md`](memory/ventas-facturacion-clientes.md) | Antes de modificar facturas de clientes, notas crédito, cartera, recaudos o retenciones de ventas. |
| Contabilidad — Terceros | [`memory/contabilidad-terceros/MEMORY.md`](memory/contabilidad-terceros/MEMORY.md) | Antes de modificar el maestro compartido de terceros, clientes, proveedores, cuentas asociadas o saldos CxC/CxP. |
| Tesorería — Bancos y pagos | [`memory/tesoreria-pagos/MEMORY.md`](memory/tesoreria-pagos/MEMORY.md) | Antes de modificar bancos, recaudos, pagos a proveedores, aplicaciones o reversiones de tesorería. |

## Reglas del índice

- Mantener una memoria separada por módulo o funcionalidad cuando exista contexto suficiente para justificarla.
- Actualizar este índice al crear, mover o retirar una memoria.
- Las memorias documentan decisiones confirmadas y el estado funcional; no reemplazan la verificación del código vigente.
- No guardar secretos, credenciales, tokens ni datos personales sensibles.
