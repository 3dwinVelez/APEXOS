# Índice de memorias de APEX OS

Este archivo dirige a las memorias persistentes de cada módulo. Debe leerse al comenzar cualquier sesión de trabajo en el proyecto.

| Área o funcionalidad | Memoria | Cuándo consultarla |
| --- | --- | --- |
| Compras — Facturas | [`memory/compras-facturas/MEMORY.md`](memory/compras-facturas/MEMORY.md) | Antes de analizar o modificar facturas dentro del módulo de Compras. |
| Inventario — Valoración y traslados | [`memory/inventario-valoracion-traslados/MEMORY.md`](memory/inventario-valoracion-traslados/MEMORY.md) | Antes de modificar costos, movimientos, reportes o traslados de inventario. |

## Reglas del índice

- Mantener una memoria separada por módulo o funcionalidad cuando exista contexto suficiente para justificarla.
- Actualizar este índice al crear, mover o retirar una memoria.
- Las memorias documentan decisiones confirmadas y el estado funcional; no reemplazan la verificación del código vigente.
- No guardar secretos, credenciales, tokens ni datos personales sensibles.
