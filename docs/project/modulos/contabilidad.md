# Modulo Contabilidad

## Revision del prototipo anterior

Se reviso `C:\Users\mq1\Documents\prototipo\apexos\APEXOS-main` solo en superficies contables. Lo reutilizable fue conceptual, no una migracion completa:

- Panel contable por submodulos: PUCC, terceros, reportes, pagos y recaudos.
- Mantenedor de plan de cuentas con codigo, nombre, tipo, nivel, estado y transaccionalidad.
- Maestro de terceros con NIT/documento, digito de verificacion, tipo de tercero, DANE y datos fiscales.
- Especificacion de motor contable con regla obligatoria de doble partida.
- Reportes de utilidad: libro mayor, balance, resultados, pagos/recaudos e integracion futura con ventas, compras e inventario.

## Implementacion actual en APEX-OS

- `Contabilidad > Impuestos y retenciones` centraliza los maestros fiscales. Retenciones e IVA se parametrizan por alcance exclusivo `Compras` o `Ventas`; cada registro define codigo, nombre/concepto, porcentaje, base minima cuando aplica, cuenta contable PUCC y estado.
- Las cuentas de IVA y retenciones se seleccionan entre cuentas activas y transaccionales del PUCC; la API vuelve a validar la cuenta antes de guardar.
- Compras solo consume maestros fiscales de compras y Ventas solo consume maestros fiscales de ventas. En Ventas, el codigo, porcentaje y cuenta del IVA activo son los usados para construir la linea contable.

- Se conserva la arquitectura actual de APEX-OS y el motor existente de `LedgerEntry`.
- Se usan `Account`, `Party`, `Transaction`, `Payment`, `LedgerEntry` y `Tenant.config`; para comprobantes contables se agregan las tablas `cnt_cabdoc` y `cnt_cuedoc`, y para cuentas por pagar `cxp_cabdoc` y `cxp_cuedoc`.
- El plan de cuentas ahora se puede listar, filtrar, crear, editar, activar e inactivar.
- Los terceros contables usan `Party` y guardan datos ampliados Colombia en `metadata`.
- Terceros cuenta con maestros editables por empresa para tipos de documento DIAN y ubicaciones ciudad/departamento/codigo DANE, guardados en `Tenant.config.accounting.third_party_masters`.
- El maestro de terceros diferencia persona natural y juridica: para naturales captura nombres/apellidos, compone automaticamente la razon social, calcula el digito de verificacion y valida formato de correo.
- La estructura contable sociedad > sucursal > centro de costo se administra en `Tenant.config.accounting.organization_tree`, valida enlaces entre cada nivel y permite editar/borrar con proteccion por hijos o registros contables.
- Los asientos contables se registran desde `/dashboard/contabilidad/asientos` con cabecera (`cnt_cabdoc`) y detalle (`cnt_cuedoc`), generando tambien los movimientos en `LedgerEntry`.
- Los tipos de documento contable y la numeracion por tipo se administran como maestros en `Tenant.config.accounting.accounting_document_types` y `Tenant.config.accounting.accounting_numbering`.
- Cuentas por pagar permite registrar facturas y notas credito de proveedor desde `/dashboard/contabilidad/cuentas-por-pagar`, calcula vencimiento desde terminos tipo AP15/AP30 y genera asiento contable con cuenta asociada de proveedores.
- Cuentas por pagar usa clases de documento `RE` para factura proveedor y `KG` para nota credito proveedor, ambas con numeracion independiente.
- Cuentas por pagar calcula vencimiento en doble via: AP actualiza fecha de vencimiento y fecha de vencimiento recalcula AP.
- La referencia de factura de proveedor se guarda en CXP y CNT, solo permite letras/numeros/guion/guion bajo y bloquea duplicados por proveedor y clase de documento.
- El maestro de IVA de cuentas por pagar se guarda en `Tenant.config.accounting.vat_masters` con codigo, concepto, porcentaje y cuenta contable de IVA.
- Los periodos contables se guardan en `Tenant.config.accounting.periods` y bloquean asientos/pagos cuando estan cerrados.
- Los cierres y reaperturas registran auditoria en `AuditLog`.

## Funciones contables expuestas

- Plan de cuentas PUCC base Colombia.
- Terceros: cliente, proveedor, empleado, transportador, acreedor, deudor y entidad financiera.
- Contabilidad > Terceros es el maestro canónico compartido con Ventas y Compras. Un NIT puede tener varios roles operativos sobre el mismo registro; las vistas de clientes y proveedores filtran esos roles sin crear maestros paralelos.
- CxC y CxP mantienen saldos independientes (`receivable_balance` y `payable_balance`) para que un tercero cliente/proveedor no mezcle cartera con obligaciones.
- En el maestro de terceros, las cuentas asociadas CxC y CxP se seleccionan desde cuentas activas, transaccionales y compatibles del PUCC; la API rechaza códigos libres o cuentas de naturaleza incorrecta.
- Las retenciones del tercero viven en una pestaña independiente: ventas usa exclusivamente el maestro activo de retenciones de venta y compras usa exclusivamente el maestro activo de retenciones de compra.
- Maestros de terceros: tipos de documento DIAN y ciudades/departamentos con codigo DANE para seleccion controlada al crear o editar terceros.
- Estructura organizacional contable: sociedades, sucursales enlazadas a sociedad y centros de costo enlazados a sociedad/sucursal.
- Asientos contables: fecha de contabilizacion, referencia, texto de cabecera, sociedad, tipo de documento, cuenta, sucursal, centro de costo, tercero, debito/credito, descripcion y valor.
- Maestros de comprobantes: tipos de documento contable y numeracion independiente por tipo.
- Cuentas por pagar: facturas y notas credito de proveedor con fecha de contabilizacion, clase RE/KG, vencimiento AP, proveedor, sociedad, cuenta asociada, detalle contable, IVA parametrizable con cuenta contable y valor.
- Calculo de digito de verificacion para NIT/documento cuando aplica.
- Libro mayor / auxiliar por cuenta.
- Balance de prueba.
- Balance general.
- Estado de resultados.
- Reporte de impuestos por cuentas de IVA y retenciones.
- Cuentas por cobrar y cuentas por pagar con edades.
- Tesorería centraliza bancos, recaudos `CI`, pagos a proveedores `CE`, aplicaciones parciales y reversiones contables.
- Control de periodos: abierto, en revision y cerrado.

## Preparacion Colombia

El modulo queda preparado para NIIF/PUCC como estructura de referencia, IVA, retenciones, ReteIVA, ReteICA, responsabilidades tributarias, centros de costo futuros y trazabilidad de documentos electronicos.

No se implementa integracion DIAN completa. Los metadatos quedan listos para recibir CUFE, CUNE, XML, PDF, estado DIAN, fecha de validacion y proveedor tecnologico.

## Reglas de seguridad y auditoria

- Las rutas contables usan permisos existentes `finance:read` y `finance:write`.
- Un periodo cerrado impide nuevos asientos y pagos.
- Un comprobante contable no se registra si debitos y creditos no son iguales.
- El cargue inicial de inventario genera un comprobante `AJ` balanceado: debito a las cuentas de inventario de alta por familia y credito a la cuenta puente `99999999`. Sus lineas alimentan libro mayor, balance de prueba y saldos contables.
- Un comprobante contable no se registra si la fecha, sociedad, sucursal, centro de costo, cuenta o tercero no existen en sus maestros activos.
- Un documento de cuentas por pagar solo acepta proveedores activos y cuenta asociada de proveedores/cuentas por pagar del PUCC.
- El asiento de cuentas por pagar se genera automaticamente con base, IVA y contrapartida a la cuenta asociada.
- La simulacion de cuentas por pagar muestra el asiento contable antes de contabilizar.
- Todo documento CXP contabilizado crea espejo en `cnt_cabdoc` y `cnt_cuedoc`, que son la base agregada de reporteria.
- Una cuenta con movimientos o cuentas hijas no se elimina fisicamente; se inactiva.
- Los cambios de periodo se auditan con usuario, fecha, valor anterior y valor nuevo.

## Validaciones esperadas

- Inicializar PUCC desde Plan de cuentas.
- Crear o editar una cuenta contable.
- Crear o editar maestros de tipo de documento y ciudad DANE.
- Crear o editar un tercero contable seleccionando tipo de documento, tipo de tercero y ubicacion desde maestros.
- Asignar simultáneamente los roles cliente y proveedor y confirmar que el mismo tercero aparezca en Ventas y Compras sin duplicar el NIT.
- Confirmar que CxC/CxP solo permitan seleccionar cuentas compatibles del PUCC y que las retenciones solo permitan marcar registros activos de su maestro y alcance correspondiente.
- Crear una sociedad, enlazarle sucursales y crear centros de costo asociados a una sucursal de esa sociedad.
- Confirmar que no se pueda crear una sucursal sin sociedad activa ni un centro de costo sin sucursal valida.
- Editar sociedades, sucursales y centros de costo desde ventana modal.
- Borrar solo estructuras sin hijos enlazados ni registros contables asociados.
- Crear tipos de documento contable y definir el proximo numero por tipo.
- Registrar un comprobante contable seleccionando solo sociedades, sucursales, centros de costo, cuentas y terceros existentes.
- Confirmar que el comprobante sea rechazado cuando falte fecha, tercero, cuenta, sucursal, centro de costo o sociedad.
- Confirmar que el comprobante sea rechazado cuando debitos y creditos no cuadren.
- Crear maestro de IVA con concepto compras/devoluciones, porcentaje y cuenta contable.
- Registrar factura de proveedor con AP15/AP30 y confirmar calculo de fecha de vencimiento.
- Confirmar que factura proveedor use clase `RE` y nota credito proveedor use clase `KG`.
- Simular una factura/nota credito y revisar debitos/creditos antes de contabilizar.
- Confirmar que no se permita duplicar referencia para el mismo proveedor y clase RE/KG.
- Confirmar que cuenta asociada, cuenta de detalle y centro de costo abran buscador con Enter cuando estan vacios.
- Confirmar que la cuenta asociada solo liste cuentas de proveedores/cuentas por pagar.
- Confirmar que factura/nota credito de proveedor genera asiento contable cuadrado.
- Confirmar que persona natural complete razon social desde primer nombre, segundo nombre, primer apellido y segundo apellido.
- Confirmar que el digito de verificacion se calcule automaticamente y no sea editable.
- Confirmar que un correo con formato invalido sea rechazado antes de guardar.
- Consultar balance, resultados, balance de prueba, impuestos, auxiliar, cuentas por cobrar y cuentas por pagar.
- Pulsar el numero de un comprobante, CXP o CxC y consultar cabecera, usuario, fechas, tercero, documento origen y todas las lineas debito/credito.
- Cerrar un periodo y confirmar que nuevos asientos/pagos del periodo cerrado sean bloqueados.
- Las rutas contables deben reconocer `M-07`, `contabilidad`, `finance` y `accounting` como identificadores equivalentes del modulo habilitado para el tenant.
# Mantenimiento de maestros fiscales

- Los maestros de IVA y retenciones se administran por separado para compras y ventas.
- El código fiscal no cambia durante una edición; nombre, porcentaje, base mínima, cuenta y estado sí son editables.
- Un código sin movimientos puede eliminarse. Si ya fue usado en documentos, la operación lo desactiva para impedir usos nuevos sin romper el historial contable.
- La asignación a proveedores no se realiza dentro del maestro fiscal.
- La creación y edición de IVA y retenciones se realiza en ventanas modales; los listados quedan dedicados a consulta y acciones.
