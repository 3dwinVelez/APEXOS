# Validación local — entrada modular de pedidos a Transporte

Fecha: 2026-09-15

Rama: `desarrollo`

Commit funcional: `58206e64dc124816b3c4853a61955316d9846cea`

## Alcance validado

- Detección de Ventas y Gestión Comercial mediante los módulos activos del tenant.
- Sincronización idempotente de pedidos internos con trazabilidad de fuente e identificador.
- Creación o actualización del punto de entrega a partir del cliente.
- Enriquecimiento de peso y volumen desde Inventarios cuando el producto está vinculado.
- Marcación explícita de datos logísticos faltantes antes de planear.
- Modo independiente con selección de CSV, pegado manual, encabezados en español y separadores coma o punto y coma.
- RBAC de Transporte para consultar la modalidad y ejecutar sincronización.

## Resultados

| Validación | Resultado |
| --- | --- |
| Pruebas API de Transporte y cubicaje | Aprobado, 24/24 |
| Pruebas web de Transporte y acceso maestro | Aprobado, 20/20 |
| `npm --workspace apps/web run typecheck` | Aprobado |
| `npm --workspace apps/web run lint -- app/dashboard/transporte/ordenes/page.tsx test/transport-tms-ui.test.mjs` | Aprobado; cero errores, nueve advertencias preexistentes fuera del alcance |
| `npm --workspace apps/web run build` | Aprobado, 103 rutas |
| `git diff --check` del alcance | Aprobado |

## Límite de la evidencia

La evidencia valida contratos, compilación y recorridos automatizados locales. La sincronización contra datos funcionales de un tenant debe certificarse en QA antes de cualquier promoción. No autoriza `desarrollo -> develop`, push, despliegue ni migraciones remotas.
