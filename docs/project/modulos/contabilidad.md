# Modulo Contabilidad

## Revision del prototipo anterior

Se reviso `C:\Users\mq1\Documents\prototipo\apexos\APEXOS-main` solo en superficies contables. Lo reutilizable fue conceptual, no una migracion completa:

- Panel contable por submodulos: PUCC, terceros, reportes, pagos y recaudos.
- Mantenedor de plan de cuentas con codigo, nombre, tipo, nivel, estado y transaccionalidad.
- Maestro de terceros con NIT/documento, digito de verificacion, tipo de tercero, DANE y datos fiscales.
- Especificacion de motor contable con regla obligatoria de doble partida.
- Reportes de utilidad: libro mayor, balance, resultados, pagos/recaudos e integracion futura con ventas, compras e inventario.

## Implementacion actual en APEX-OS

- Se conserva la arquitectura actual de APEX-OS y el motor existente de `LedgerEntry`.
- No se agregaron migraciones ni tablas nuevas; se usan `Account`, `Party`, `Transaction`, `Payment`, `LedgerEntry` y `Tenant.config`.
- El plan de cuentas ahora se puede listar, filtrar, crear, editar, activar e inactivar.
- Los terceros contables usan `Party` y guardan datos ampliados Colombia en `metadata`.
- Los periodos contables se guardan en `Tenant.config.accounting.periods` y bloquean asientos/pagos cuando estan cerrados.
- Los cierres y reaperturas registran auditoria en `AuditLog`.

## Funciones contables expuestas

- Plan de cuentas PUCC base Colombia.
- Terceros: cliente, proveedor, empleado, transportador, acreedor, deudor y entidad financiera.
- Calculo de digito de verificacion para NIT/documento cuando aplica.
- Libro mayor / auxiliar por cuenta.
- Balance de prueba.
- Balance general.
- Estado de resultados.
- Reporte de impuestos por cuentas de IVA y retenciones.
- Cuentas por cobrar y cuentas por pagar con edades.
- Control de periodos: abierto, en revision y cerrado.

## Preparacion Colombia

El modulo queda preparado para NIIF/PUCC como estructura de referencia, IVA, retenciones, ReteIVA, ReteICA, responsabilidades tributarias, centros de costo futuros y trazabilidad de documentos electronicos.

No se implementa integracion DIAN completa. Los metadatos quedan listos para recibir CUFE, CUNE, XML, PDF, estado DIAN, fecha de validacion y proveedor tecnologico.

## Reglas de seguridad y auditoria

- Las rutas contables usan permisos existentes `finance:read` y `finance:write`.
- Un periodo cerrado impide nuevos asientos y pagos.
- Una cuenta con movimientos o cuentas hijas no se elimina fisicamente; se inactiva.
- Los cambios de periodo se auditan con usuario, fecha, valor anterior y valor nuevo.

## Validaciones esperadas

- Inicializar PUCC desde Plan de cuentas.
- Crear o editar una cuenta contable.
- Crear o editar un tercero contable con NIT/DV.
- Consultar balance, resultados, balance de prueba, impuestos, auxiliar, cuentas por cobrar y cuentas por pagar.
- Cerrar un periodo y confirmar que nuevos asientos/pagos del periodo cerrado sean bloqueados.
