# Memoria: Compras — Facturas

## Propósito

Conservar el contexto funcional y técnico confirmado durante el desarrollo de la funcionalidad de facturas del módulo de Compras en APEX OS.

## Estado actual

- Memoria creada el 21 de julio de 2026.
- Se corrigió el error 400 al simular la contabilización con campos obligatorios vacíos.
- El 21 de julio de 2026 se auditó el flujo completo OC → recepción → inventario/costos → factura → contabilidad. La auditoría encontró funciones correctas y brechas críticas pendientes de corregir.

## Decisiones confirmadas

- La recepcion de una orden de compra admite entregas parciales por posicion. El usuario debe ver lo pedido e ingresar manualmente las unidades efectivamente recibidas en cada linea.

## Reglas de negocio

- La recepción de una OC debe incrementar existencias por unidad y ubicación.
- El inventario se valora por promedio ponderado cuando `costing_method` es `weighted_average`.
- Una factura de proveedor debe contabilizar IVA y retenciones aplicables, mantener trazabilidad con la OC/recepción y crear un documento contable balanceado.

## Correcciones solicitadas

- Se corrigio el error 500 de recepcion causado por la deserializacion del retorno `void` de `pg_advisory_xact_lock`; el bloqueo conserva su funcion transaccional y retorna texto compatible con Prisma.
- La pantalla de recepcion deja de confirmar automaticamente todo el pendiente y muestra pedido, recibido, saldo e ingreso manual por posicion.

- Revisar el error `400` de `/api/v1/purchases/invoices/simulate`: `body/supplier_reference must NOT have fewer than 1 characters`.
- Diagnóstico: el botón `Simular contabilizacion` es `type="button"` y ejecuta la llamada directamente, por lo que no activa la validación HTML del `<form>`. El payload puede incluir `supplier_reference: ""`, aunque el API exige `minLength: 1`.
- Riesgo relacionado: cualquier otro campo requerido por el esquema puede producir el siguiente error después de corregir la referencia; `header_text` también inicia vacío y exige al menos un carácter.
- Corrección implementada en el frontend: normalización del payload, validación previa compartida por simulación y registro, bloqueo de acciones mientras falten datos obligatorios y mensaje preventivo visible.
- Se corrigió el error 500 al registrar la factura: Compras reutiliza su transacción Prisma al crear el documento CXP y el asiento contable, evitando una transacción independiente anidada.

## Rutas y componentes relacionados

- Formulario: `apps/web/app/dashboard/compras/facturas/page.tsx`.
- Esquema de validación: `apps/api/src/modules/purchases/schema.js`, objeto `purchaseInvoiceSchema`.
- Ruta de simulación: `apps/api/src/modules/purchases/routes.js`, `POST /purchases/invoices/simulate`.
- Preparación de la simulación: `apps/api/src/modules/purchases/service.js`, función `simulatePurchaseInvoice`.

## Trabajo realizado

- Se creó esta memoria persistente y se vinculó desde el índice principal del proyecto.
- Se agregó una referencia al formulario para ejecutar la validación nativa antes de enviar.
- Se recortan espacios en referencias y texto de cabecera antes de construir el payload.
- Los botones de simulación y registro permanecen deshabilitados hasta completar encabezado, orden o bodega, posiciones y total válido.
- Se verificó el cambio con TypeScript, ESLint y una prueba del formulario en la aplicación local; con la referencia vacía se muestra la advertencia y la simulación permanece deshabilitada, sin generar un `POST` inválido.
- Se verificó que la recepción usa `stockMoveTx`, incrementa `Item.stock_current`, registra `Movement`, actualiza `ItemLocation` y crea historial en `ProductCost`.
- Se comprobó de forma transaccional y con rollback el promedio ponderado: 12 unidades a 250.000; entrada de 2 a 100.000 → 228.571,4286; entrada de 3 a 400.000 → 258.823,5294. La prueba no dejó cambios persistidos.
- Se verificó el reporte `Inventario / Reportes`: muestra unidades, bodega, costo promedio, último costo, valor por SKU y kardex. En los datos locales mostró 12 UND a 250.000, valor 3.000.000 y dos entradas.
- Se verificó que el IVA de facturas existentes genera líneas contables balanceadas y documento en CXP/contabilidad.
- El registro de factura, CXP, asiento contable, trazabilidad de OC y movimientos de inventario quedan dentro de una sola transacción.
- Se agregó una prueba de regresión que confirma que Contabilidad e Inventario reciben exactamente la transacción abierta por Compras.

## Hallazgos de auditoría pendientes

- **Crítico — contrapartida de recepción incorrecta:** `receivePurchaseOrder` contabiliza débito 1435 y crédito 2205. Para una compra con recepción previa, la configuración de familia define GR/IR 2610 y la factura con OC debita 2610; la recepción debería acreditar GR/IR, no proveedores. El flujo actual puede duplicar el crédito a proveedores y dejar GR/IR sin compensar.
- **Crítico — retenciones no implementadas:** el formulario, esquema, modelos y contabilización de facturas admiten IVA, pero no retefuente, reteIVA, reteICA ni reglas/bases/topes de retención.
- **Alto — ubicación fija en recepción:** la pantalla `compras/ordenes/recibir` envía siempre `location_id: 1`, en vez de utilizar la ubicación de la bodega de la OC o permitir selección.
- **Alto — recepción permite estados no aprobados:** frontend y backend permiten recibir OC en `draft` y `sent`, aunque el flujo de control indica que debería recibirse una OC aprobada/confirmada.
- **Alto — cantidades se consolidan por producto, no por línea:** `enrichPurchaseOrder` y la determinación de recepción completa agregan movimientos por `item_id`. Dos líneas de la misma OC con el mismo SKU pueden compartir indebidamente cantidades recibidas. `Movement` no guarda `purchase_order_line_id`.
- **Alto — conciliación de tres vías incompleta:** la factura controla cantidad contra lo ordenado, pero no contra lo efectivamente recibido, no compara precio/IVA contra OC y no maneja tolerancias ni bloqueos por diferencias.
- **Medio — costo por ubicación desactualizable:** cuando ya existe `ItemLocation`, una entrada incrementa cantidad pero no actualiza su campo `cost`; el costo global de `Item` sí se actualiza.
- **Medio — concurrencia del promedio:** el cálculo lee cantidad/costo y luego actualiza. No hay bloqueo explícito de fila o nivel de aislamiento que evite promedios perdidos ante recepciones simultáneas del mismo SKU.
- **Medio — reporte inicial puede mostrar kardex cacheado:** en la prueba visual el resumen de costos cargó de inmediato, pero el kardex mostró cero hasta pulsar `Consultar`; después mostró correctamente los dos movimientos.
- **Medio — cuentas de recepción rígidas:** el asiento usa prefijos fijos 1435/2205 en vez del maestro contable por familia, sociedad y tipo de operación.

## Pendientes y preguntas abiertas

- Ninguno relacionado con el error de referencia vacía.
- Corregir primero la contabilización GR/IR, retenciones, ubicación de recepción y trazabilidad por línea antes de certificar el flujo para producción.

## Historial relevante

### 2026-07-21

- El usuario decidió usar nombres de carpetas sin espacios.
- Se aprobó una memoria especializada para `compras-facturas`, un índice principal y una instrucción permanente de lectura.
- Se reportó y diagnosticó el error de referencia de proveedor vacía durante la simulación contable.
- Se implementó y verificó la corrección completa del envío incompleto.
- Se completó la auditoría integral del flujo de compras y se documentaron hallazgos priorizados.

### 2026-07-21 - Retenciones, devoluciones y anulaciones

- Maestro parametrizable en `Contabilidad > Retenciones` para retefuente, reteIVA y reteICA con porcentaje, base mínima, cuenta y estado.
- Asignación al proveedor en `Party.metadata.retention_codes`; Compras hereda las reglas automáticamente.
- Retenciones de cabecera con base e importe editables. ReteIVA usa IVA; retefuente/reteICA usan subtotal por defecto.
- IVA y retenciones persisten en `cnt_cuedoc` y `cxp_cuedoc` con tipo, código, base, tasa e importe.
- Recepción trazada por posición y contabilizada contra GR/IR 2610. Devolución genera salida, asiento contrario y reapertura.
- Anulación crea RV contrario y guarda usuario, fecha, banderas y enlaces de reversión; reabre posiciones facturables de OC.
- Migración aplicada: `20260721190000_purchase_tax_retention_reversals`.
- QA: `npm run qa:purchases:tax-reversal` cubre maestros, herencia, cálculo, persistencia fiscal, balance, reversión, recepción, devolución y reapertura. Resultado exitoso.

### 2026-07-31 - Contabilizacion de recepciones

- Cada recepcion de OC genera atomicamente un documento contable clase `EM`: debito a inventario alta y credito a EM/RF, usando las cuentas parametrizadas en la familia de cada SKU.
- El documento conserva NIT del proveedor, usuario, referencia de OC, clase, numero y fecha de contabilizacion; debe verse en Compras, Kardex y Contabilidad.
- Las retenciones de facturas de compra se presentan en una pestana independiente y conservan base e importe editables.
- La recepcion de OC se filtra por numero, rango de fechas, estado, proveedor, bodega y producto.
- La recepcion incluye la opcion `Recibir todo lo pendiente`, que completa el saldo de todas las posiciones; al desmarcarla vuelve al ingreso manual.
- El diligenciamiento de la recepcion se abre en una ventana modal para mostrar exclusivamente la OC seleccionada y evitar mezclar posiciones de otros pedidos.

### 2026-07-21 - Decisiones de costo e inventario

- Se mantiene el tipo `Float` existente; el usuario descartó expresamente la migración a `Decimal`.
- En compras, el costo de entrada se toma de la línea de la orden de compra.
- La recepción actualiza el promedio ponderado en la valoración por SKU y sociedad.
- En ventas, el costo reconocido no se toma de la orden de venta: se consulta la valoración vigente del SKU y la sociedad.
- Los traslados entre bodegas deben usar tránsito obligatorio y no pueden ejecutarse como un movimiento directo.
