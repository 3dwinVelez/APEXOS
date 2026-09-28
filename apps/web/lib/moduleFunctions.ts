/**
 * Registro de funciones navegables de cada modulo para el centro de comandos (Ctrl+K).
 * Cada entrada es una funcion que el usuario nombra en su trabajo diario ("crear mallas",
 * "ver monitor"), no un item de menu tecnico. Los href deben existir como ruta estatica
 * del dashboard; la prueba de cobertura del palette lo verifica ruta por ruta.
 */
export type ModuleFunction = { id: string; label: string; description: string; href: string; module: string; keywords: string };

export const MODULE_FUNCTIONS: ModuleFunction[] = [
  // Administracion
  { id: "fn-suscripciones", label: "Crear empresa", description: "Registra empresas y modulos contratados", href: "/dashboard/administracion/suscripciones", module: "administracion", keywords: "suscripcion tenant plan licencia empresa cliente administracion" },

  // Reportes
  { id: "fn-apex-heart", label: "Ver Apex Heart", description: "Pulso ejecutivo: productividad, margen y alertas", href: "/dashboard/reportes/apex-heart", module: "reportes", keywords: "reportes indicadores kpi pulso margen gerencial control tablero" },

  // Compras
  { id: "fn-compras-facturas", label: "Ver facturas de compra", description: "Documentos de proveedor y su registro contable", href: "/dashboard/compras/facturas", module: "compras", keywords: "factura proveedor simulacion contable cuenta por pagar documento" },
  { id: "fn-compras-importaciones", label: "Gestionar importaciones", description: "Compras del exterior y nacionalizacion", href: "/dashboard/compras/importaciones", module: "compras", keywords: "importacion aduana nacionalizacion exterior comercio" },
  { id: "fn-compras-proveedores", label: "Gestionar proveedores", description: "Crea y consulta proveedores", href: "/dashboard/compras/proveedores", module: "compras", keywords: "proveedor tercero abastecimiento registrar crear" },
  { id: "fn-compras-rep-facturas", label: "Ver reporte de facturas de compra", description: "Analiza compras por proveedor y periodo", href: "/dashboard/compras/reportes/facturas", module: "compras", keywords: "reporte compras facturas analisis proveedor" },
  { id: "fn-compras-rep-ordenes", label: "Ver reporte de ordenes de compra", description: "Analiza ordenes emitidas y pendientes", href: "/dashboard/compras/reportes/ordenes", module: "compras", keywords: "reporte ordenes compra pendientes abastecimiento" },

  // Contabilidad
  { id: "fn-contab-asientos", label: "Consultar asientos contables", description: "Revisa el registro contable y sus movimientos", href: "/dashboard/contabilidad/asientos", module: "contabilidad", keywords: "asiento contable libro diario comprobante registro movimiento" },
  { id: "fn-contab-cxp", label: "Gestionar cuentas por pagar", description: "Obligaciones con proveedores y pagos", href: "/dashboard/contabilidad/cuentas-por-pagar", module: "contabilidad", keywords: "cuentas por pagar cxp proveedor obligacion pago cartera" },
  { id: "fn-contab-estructura", label: "Configurar estructura contable", description: "Centros de costo, periodos y cierre", href: "/dashboard/contabilidad/estructura", module: "contabilidad", keywords: "estructura centro de costo periodo cierre configuracion" },
  { id: "fn-contab-iva", label: "Gestionar IVA", description: "Maestro y control del impuesto sobre las ventas", href: "/dashboard/contabilidad/iva", module: "contabilidad", keywords: "iva impuesto declaracion ventas tributo" },
  { id: "fn-contab-plan", label: "Ver plan de cuentas", description: "Catalogo contable de la empresa", href: "/dashboard/contabilidad/plan-cuentas", module: "contabilidad", keywords: "plan cuentas puc catalogo contable" },
  { id: "fn-contab-reportes", label: "Ver balance de prueba", description: "Estados financieros y saldos por cuenta", href: "/dashboard/contabilidad/reportes", module: "contabilidad", keywords: "balance prueba estados financieros reporte contable libro mayor" },
  { id: "fn-contab-retenciones", label: "Gestionar retenciones contables", description: "Retenciones practicadas y registradas", href: "/dashboard/contabilidad/retenciones", module: "contabilidad", keywords: "retencion retefuente reteiva impuesto" },
  { id: "fn-contab-terceros", label: "Gestionar terceros contables", description: "Clientes, proveedores y su informacion fiscal", href: "/dashboard/contabilidad/terceros", module: "contabilidad", keywords: "tercero cliente proveedor nit informacion fiscal" },

  // Cartera y CxC
  { id: "fn-cxc-documentos", label: "Consultar cuentas por cobrar", description: "Documentos de cartera, vencimientos y estado de cuenta", href: "/dashboard/cxc/documentos", module: "cxc", keywords: "cartera cxc cuentas por cobrar documentos vencidos cobro cliente" },
  { id: "fn-cxc-cartera", label: "Ver reporte de cartera", description: "Aging y comportamiento de la cartera", href: "/dashboard/cxc/reportes/cartera", module: "cxc", keywords: "reporte cartera aging vencido cobranza indicador" },
  { id: "fn-cxc-retenciones", label: "Gestionar retenciones de cartera", description: "Retenciones aplicadas por clientes", href: "/dashboard/cxc/retenciones", module: "cxc", keywords: "retencion cartera cliente retefuente" },

  // Facturacion
  { id: "fn-fact-documentos", label: "Consultar documentos de facturacion", description: "Facturas emitidas y sus consecutivos", href: "/dashboard/facturacion/documentos", module: "facturacion", keywords: "factura emitida documento consecutivo historial dian" },

  // Gestion comercial
  { id: "fn-gc-agenda", label: "Ver calendario comercial", description: "Agenda de visitas y citas con clientes", href: "/dashboard/gestion-comercial/agenda", module: "gestion-comercial", keywords: "agenda calendario visita cita cliente comercial" },
  { id: "fn-gc-cotizaciones", label: "Gestionar cotizaciones", description: "Cotizaciones enviadas y su seguimiento", href: "/dashboard/gestion-comercial/cotizaciones", module: "gestion-comercial", keywords: "cotizacion propuesta oferta cliente seguimiento" },
  { id: "fn-gc-maestros", label: "Gestionar asesores y maestros comerciales", description: "Asesores, metas y datos base del area", href: "/dashboard/gestion-comercial/maestros", module: "gestion-comercial", keywords: "asesor vendedor meta comercial maestro dato base" },
  { id: "fn-gc-mi-dia", label: "Ver mi dia comercial", description: "Plan diario y tareas del asesor", href: "/dashboard/gestion-comercial/mi-dia", module: "gestion-comercial", keywords: "mi dia plan rutina tarea asesor comercial" },
  { id: "fn-gc-pedidos", label: "Gestionar pedidos comerciales", description: "Pedidos de clientes y su estado", href: "/dashboard/gestion-comercial/pedidos", module: "gestion-comercial", keywords: "pedido cliente orden comercial estado" },
  { id: "fn-gc-presupuestos", label: "Gestionar presupuestos comerciales", description: "Metas y proyeccion de ventas", href: "/dashboard/gestion-comercial/presupuestos", module: "gestion-comercial", keywords: "presupuesto meta proyeccion ventas comercial" },
  { id: "fn-gc-reportes", label: "Ver reportes comerciales", description: "Indicadores del area comercial", href: "/dashboard/gestion-comercial/reportes", module: "gestion-comercial", keywords: "reporte comercial indicador cumplimiento" },
  { id: "fn-gc-cotizado-pedido", label: "Ver cotizado vs pedido", description: "Conversion de cotizaciones en pedidos", href: "/dashboard/gestion-comercial/reportes/cotizado-vs-pedido", module: "gestion-comercial", keywords: "reporte cotizado pedido conversion efectividad comercial" },

  // Inventario
  { id: "fn-inv-ajustes", label: "Consultar ajustes de inventario", description: "Historial de ajustes y sus motivos", href: "/dashboard/inventario/ajustes", module: "inventario", keywords: "ajuste inventario correccion historial movimiento" },
  { id: "fn-inv-bodegas", label: "Gestionar bodegas", description: "Bodegas y ubicaciones de almacenamiento", href: "/dashboard/inventario/bodegas", module: "inventario", keywords: "bodega almacen ubicacion sede" },
  { id: "fn-inv-cargue", label: "Cargue inicial de inventario", description: "Carga masiva de saldos iniciales", href: "/dashboard/inventario/cargue-inicial", module: "inventario", keywords: "cargue inicial carga masiva excel saldo inicial inventario" },
  { id: "fn-inv-clasificaciones", label: "Gestionar clasificaciones ABC", description: "Clasificacion de productos por rotacion", href: "/dashboard/inventario/clasificaciones", module: "inventario", keywords: "clasificacion abc categoria rotacion inventario" },
  { id: "fn-inv-familias", label: "Gestionar familias de productos", description: "Familias, lineas y grupos de articulos", href: "/dashboard/inventario/familias", module: "inventario", keywords: "familia linea grupo categoria producto" },
  { id: "fn-inv-productos", label: "Consultar productos", description: "Catalogo de articulos y servicios", href: "/dashboard/inventario/productos", module: "inventario", keywords: "producto catalogo articulo item sku lista inventario" },
  { id: "fn-inv-reportes", label: "Ver reportes de inventario", description: "Existencias e indicadores del inventario", href: "/dashboard/inventario/reportes", module: "inventario", keywords: "reporte inventario existencia indicador" },
  { id: "fn-inv-costos", label: "Ver reporte de costos", description: "Costos y valorizacion del inventario", href: "/dashboard/inventario/reportes/costos", module: "inventario", keywords: "reporte costo valorizacion promedio inventario" },
  { id: "fn-inv-kardex", label: "Ver kardex", description: "Movimientos por producto en el tiempo", href: "/dashboard/inventario/reportes/kardex", module: "inventario", keywords: "kardex movimiento producto historial trazabilidad" },
  { id: "fn-inv-stock", label: "Consultar stock", description: "Existencias disponibles y minimos", href: "/dashboard/inventario/stock", module: "inventario", keywords: "stock existencia disponible minimo alerta inventario" },
  { id: "fn-inv-traslados", label: "Gestionar traslados", description: "Traslados entre bodegas y su detalle", href: "/dashboard/inventario/traslados", module: "inventario", keywords: "traslado transferencia bodega documento" },
  { id: "fn-inv-traslado-nuevo", label: "Crear traslado", description: "Registra un traslado entre bodegas", href: "/dashboard/inventario/traslados/nuevo", module: "inventario", keywords: "traslado nuevo transferencia mover bodega origen destino" },
  { id: "fn-inv-wms", label: "Ver tareas WMS", description: "Tareas de bodega: picking y packing", href: "/dashboard/inventario/wms", module: "inventario", keywords: "wms tarea bodega picking packing" },

  // Servicios
  { id: "fn-serv-referencias", label: "Importar referencias de servicios", description: "Carga referencias desde plantilla Excel", href: "/dashboard/servicios/referencias", module: "servicios", keywords: "importar referencia excel plantilla carga servicio" },
  { id: "fn-serv-reportes", label: "Ver reportes de servicios", description: "Indicadores de ordenes y atencion", href: "/dashboard/servicios/reportes", module: "servicios", keywords: "reporte servicio indicador orden sla atencion" },

  // Talento humano
  { id: "fn-hr-config", label: "Configurar parametros laborales", description: "Jornada, recargos y politicas de tiempo", href: "/dashboard/talento-humano/configuracion-laboral", module: "talento-humano", keywords: "configuracion laboral jornada recargo hora extra politica parametro" },
  { id: "fn-hr-empleados", label: "Gestionar empleados", description: "Maestro de empleados y su ficha", href: "/dashboard/talento-humano/empleados", module: "talento-humano", keywords: "empleado maestro ficha nomina contratacion persona" },
  { id: "fn-hr-entidades", label: "Gestionar entidades y afiliaciones", description: "EPS, ARL, caja y pension", href: "/dashboard/talento-humano/entidades", module: "talento-humano", keywords: "entidad afiliacion eps arl caja pension seguridad social" },
  { id: "fn-hr-rutas", label: "Crear mallas", description: "Programa y asigna mallas y horarios de trabajo", href: "/dashboard/talento-humano/rutas", module: "talento-humano", keywords: "malla horario turno programacion asignacion empleado crear eliminar horario borrar malla eliminar malla borrar horario" },
  { id: "fn-hr-mapa", label: "Ver monitor de mallas", description: "Avance de la jornada por empleado, marcaciones y actividades", href: "/dashboard/talento-humano/mapa", module: "talento-humano", keywords: "malla monitor mapa horario jornada seguimiento avance marcacion actividad empleado" },
  { id: "fn-hr-marcacion", label: "Registrar marcaciones", description: "Marca entrada, salida y ubicacion GPS", href: "/dashboard/talento-humano/marcacion", module: "talento-humano", keywords: "marcacion marcar reloj entrada salida gps mi marcacion" },
  { id: "fn-hr-nomina", label: "Gestionar nomina", description: "Liquidacion de nomina por periodo", href: "/dashboard/talento-humano/nomina", module: "talento-humano", keywords: "nomina liquidacion pago periodo salario" },
  { id: "fn-hr-novedades", label: "Gestionar novedades de jornada", description: "Incapacidades, permisos, faltas y horas extra", href: "/dashboard/talento-humano/novedades", module: "talento-humano", keywords: "novedad jornada incapacidad permiso falta retraso hora extra" },
  { id: "fn-hr-reportes", label: "Ver reportes de tiempo", description: "Horas, asistencia y horas extra", href: "/dashboard/talento-humano/reportes", module: "talento-humano", keywords: "reporte tiempo hora asistencia hora extra jornada" },

  // Tesoreria
  { id: "fn-teso-anticipos", label: "Gestionar anticipos", description: "Anticipos a proveedores y su aplicacion", href: "/dashboard/tesoreria/anticipos", module: "tesoreria", keywords: "anticipo proveedor pago anticipado tesoreria" },

  // Transporte
  { id: "fn-transp-config", label: "Configurar transporte", description: "Preferencias y parametros de la operacion", href: "/dashboard/transporte/configuracion", module: "transporte", keywords: "configuracion transporte preferencia parametro operacion" },
  { id: "fn-transp-cubicaje", label: "Calcular cubicaje", description: "Peso y volumen de la carga", href: "/dashboard/transporte/cubicaje", module: "transporte", keywords: "cubicaje volumen peso bulto carga" },
  { id: "fn-transp-flota", label: "Gestionar flota y vehiculos", description: "Vehiculos y sus documentos", href: "/dashboard/transporte/flota", module: "transporte", keywords: "flota vehiculo documento soat tecnomecanica mantenimiento" },
  { id: "fn-transp-maestros", label: "Gestionar maestros de transporte", description: "Transportadoras, conductores y tipos de vehiculo", href: "/dashboard/transporte/maestros", module: "transporte", keywords: "maestro transportadora conductor vehiculo dato basico" },
  { id: "fn-transp-monitoreo", label: "Seguir vehiculos", description: "Monitoreo en vivo de la operacion", href: "/dashboard/transporte/monitoreo", module: "transporte", keywords: "monitoreo seguir vehiculo gps rastreo en ruta vivo" },
  { id: "fn-transp-notificaciones", label: "Ver notificaciones de transporte", description: "Alertas y comunicaciones de la operacion", href: "/dashboard/transporte/notificaciones", module: "transporte", keywords: "notificacion alerta comunicacion transporte" },
  { id: "fn-transp-ordenes", label: "Preparar pedidos para transporte", description: "Ordenes y pedidos listos para despacho", href: "/dashboard/transporte/ordenes", module: "transporte", keywords: "orden pedido preparar despacho envio viaje" },
  { id: "fn-transp-planeacion", label: "Crear un plan de viaje", description: "Planea rutas y despachos", href: "/dashboard/transporte/planeacion", module: "transporte", keywords: "planeacion plan viaje ruta despacho" },
  { id: "fn-transp-pod", label: "Confirmar entregas (POD)", description: "Evidencia de entrega al cliente", href: "/dashboard/transporte/pod", module: "transporte", keywords: "pod confirmar entrega evidencia firma remision" },
  { id: "fn-transp-tarifas", label: "Gestionar tarifas de transporte", description: "Tarifarios y costos de flete", href: "/dashboard/transporte/tarifas", module: "transporte", keywords: "tarifa tarifario flete costo transporte" },

  // Ventas
  { id: "fn-ventas-facturas", label: "Consultar facturas de venta", description: "Facturas emitidas a clientes", href: "/dashboard/ventas/facturas", module: "ventas", keywords: "factura venta documento cliente emitida" },
  { id: "fn-ventas-factura-nueva", label: "Emitir factura de venta", description: "Nueva factura desde el flujo de ventas", href: "/dashboard/ventas/facturas/nueva", module: "ventas", keywords: "factura venta nueva emitir cliente" },
  { id: "fn-ventas-ordenes", label: "Consultar ordenes de venta", description: "Ordenes de venta y su estado", href: "/dashboard/ventas/ordenes", module: "ventas", keywords: "orden venta ov pedido cliente estado" },
  { id: "fn-ventas-precios", label: "Gestionar precios y listas", description: "Listas de precios y descuentos", href: "/dashboard/ventas/precios", module: "ventas", keywords: "precio lista descuento tarifa venta" },
  { id: "fn-ventas-reportes", label: "Ver reportes de ventas", description: "Indicadores de venta y margen", href: "/dashboard/ventas/reportes", module: "ventas", keywords: "reporte venta indicador margen" }
];

const MODULE_HOME_OVERRIDES: Record<string, string> = {
  // Cartera no tiene landing propio: su superficie real son los documentos de cartera.
  cxc: "/dashboard/cxc/documentos"
};

export function moduleHome(slug: string) {
  return MODULE_HOME_OVERRIDES[slug] || `/dashboard/${slug}`;
}
