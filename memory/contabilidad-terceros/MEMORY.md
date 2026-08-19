# Memoria — Maestro canónico de terceros

## Decisiones confirmadas

- Contabilidad > Terceros es el maestro canónico compartido por Contabilidad, Compras y Ventas.
- Un mismo NIT/documento corresponde a un solo tercero por empresa y puede tener simultáneamente los roles cliente, proveedor o empleado.
- Las pantallas de clientes y proveedores son vistas operativas filtradas del mismo maestro; crear un rol desde una de ellas promueve el tercero existente cuando coincide el NIT, en lugar de duplicarlo.
- `Party.type` se conserva como rol primario por compatibilidad y los roles canónicos se guardan en `metadata.role_flags`.
- Los saldos se separan en `receivable_balance` para CxC y `payable_balance` para CxP. El campo histórico `balance` se conserva únicamente durante la transición de compatibilidad.
- Las cuentas asociadas y retenciones se parametrizan por rol: CxC/retenciones de venta para cliente y CxP/retenciones de compra para proveedor.
- Las cuentas asociadas no admiten texto libre: CxC se elige entre cuentas PUCC activas/transaccionales de deudores y CxP entre cuentas PUCC activas/transaccionales de proveedores o cuentas por pagar.
- Las retenciones se administran en una pestaña separada del formulario. Las de venta y compra se seleccionan por listas independientes y solo desde maestros contables activos del alcance correspondiente.

## Compatibilidad y transición

- Los registros antiguos sin `role_flags` siguen siendo reconocidos mediante `Party.type`.
- La migración es aditiva: no elimina, fusiona ni reasigna documentos históricos de terceros que ya estén duplicados.
- Las duplicidades históricas requieren una depuración asistida posterior, porque consolidar documentos y saldos existentes no debe hacerse automáticamente.

## Validaciones permanentes

- Los filtros por cliente/proveedor deben reconocer tanto el rol canónico como el tipo histórico.
- Ventas nunca debe usar el saldo de proveedores para validar cupo de crédito.
- Compras nunca debe presentar el saldo de cartera del cliente como deuda al proveedor.
- Toda consulta y escritura conserva el aislamiento por `tenant_id` proporcionado por `runWithTenant`.
# Maestros fiscales (2026-08-07)

- Porcentajes, bases e importes fiscales permiten borrar temporalmente el cero y normalizan un valor vacío a `0` al perder el foco.

- La parametrización de IVA y retenciones no debe incluir una sección de asignación por proveedor.
- IVA y retenciones permiten editar sus datos conservando el código como identidad histórica.
- Al solicitar borrar un código fiscal, se elimina si no tiene movimientos; si ya tiene documentos asociados, se desactiva para conservar el historial y evitar usos nuevos.
- La pestaña de retenciones del tercero consulta explícitamente los alcances `sales` y `purchases`, para mostrar correctamente todos los maestros activos de cada rol.
