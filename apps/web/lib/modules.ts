import {
  BadgeDollarSign,
  Banknote,
  Boxes,
  Brain,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  ContactRound,
  CreditCard,
  Factory,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  MapPinned,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  Route,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wrench
} from "lucide-react";

export type ModuleStatus = "Listo para operar" | "Base funcional" | "En construcción";

export type ApexModule = {
  id: string;
  slug: string;
  name: string;
  area: string;
  status: ModuleStatus;
  summary: string;
  capabilities: string[];
  nextActions: string[];
  icon: typeof Boxes;
};

export const MODULES: ApexModule[] = [
  {
    id: "M-01",
    slug: "inventario",
    name: "Inventario",
    area: "Operación",
    status: "Base funcional",
    summary: "Control de artículos, existencias, movimientos, kardex, mínimos y alertas de reposición.",
    capabilities: ["Artículos y servicios", "Entradas y salidas de stock", "Alertas por mínimo", "Clasificación ABC"],
    nextActions: ["Crear artículo", "Registrar movimiento", "Revisar stock crítico"],
    icon: Boxes
  },
  {
    id: "M-02",
    slug: "compras",
    name: "Compras",
    area: "Operación",
    status: "Base funcional",
    summary: "Ordenes de compra, recepción de mercancía, proveedores y alertas de abastecimiento.",
    capabilities: ["Órdenes de compra", "Recepción", "Proveedores", "Abastecimiento sugerido"],
    nextActions: ["Crear orden de compra", "Recibir mercancía", "Consultar pendientes"],
    icon: PackageCheck
  },
  {
    id: "M-03",
    slug: "ventas",
    name: "Ventas",
    area: "Comercial",
    status: "En construcción",
    summary: "Cotizaciones, órdenes de venta, seguimiento comercial y conversión a factura.",
    capabilities: ["Cotizaciones", "Órdenes de venta", "Embudo comercial", "Conversión a factura"],
    nextActions: ["Crear cotización", "Registrar pedido", "Revisar oportunidades"],
    icon: ChartNoAxesCombined
  },
  {
    id: "M-04",
    slug: "facturacion",
    name: "Facturación",
    area: "Finanzas",
    status: "En construcción",
    summary: "Facturas, notas crédito, numeración, impuestos y documentos comerciales.",
    capabilities: ["Factura de venta", "Notas crédito", "Numeración", "Impuestos"],
    nextActions: ["Emitir factura", "Ver consecutivos", "Revisar documentos"],
    icon: ReceiptText
  },
  {
    id: "M-05",
    slug: "punto-de-venta",
    name: "Punto de venta",
    area: "Comercial",
    status: "En construcción",
    summary: "Ventas rápidas, caja, medios de pago y operación de mostrador.",
    capabilities: ["Caja", "Medios de pago", "Turnos", "Cierre diario"],
    nextActions: ["Abrir caja", "Registrar venta", "Cerrar turno"],
    icon: CreditCard
  },
  {
    id: "M-06",
    slug: "cartera",
    name: "Cartera",
    area: "Finanzas",
    status: "En construcción",
    summary: "Cuentas por cobrar, vencimientos, aging y recordatorios de pago.",
    capabilities: ["Aging", "Recordatorios", "Saldos por cliente", "Promesas de pago"],
    nextActions: ["Ver vencidos", "Enviar recordatorio", "Registrar pago"],
    icon: BadgeDollarSign
  },
  {
    id: "M-07",
    slug: "contabilidad",
    name: "Contabilidad",
    area: "Finanzas",
    status: "Base funcional",
    summary: "Plan de cuentas PUC, asientos automáticos, libro mayor y estados financieros.",
    capabilities: ["PUC Colombia", "Asientos contables", "Libro mayor", "Pérdidas y ganancias"],
    nextActions: ["Ver plan de cuentas", "Consultar libro mayor", "Generar P&G"],
    icon: Landmark
  },
  {
    id: "M-08",
    slug: "tesoreria",
    name: "Tesorería",
    area: "Finanzas",
    status: "En construcción",
    summary: "Flujo de caja, bancos, pagos programados y proyección de liquidez.",
    capabilities: ["Bancos", "Flujo de caja", "Pagos", "Proyección 90 días"],
    nextActions: ["Ver flujo proyectado", "Programar pago", "Conciliar banco"],
    icon: Banknote
  },
  {
    id: "M-09",
    slug: "costos",
    name: "Costos",
    area: "Finanzas",
    status: "En construcción",
    summary: "Costeo FIFO, margen por artículo, margen por cliente y rentabilidad.",
    capabilities: ["FIFO", "Margen por artículo", "Margen por cliente", "Costo real"],
    nextActions: ["Calcular margen", "Ver costos", "Revisar rentabilidad"],
    icon: Gauge
  },
  {
    id: "M-10",
    slug: "presupuestos",
    name: "Presupuestos",
    area: "Finanzas",
    status: "En construcción",
    summary: "Presupuesto, planeación financiera, escenarios y consolidación.",
    capabilities: ["Presupuesto anual", "Escenarios", "Control de ejecución", "Consolidación"],
    nextActions: ["Crear presupuesto", "Comparar real vs plan", "Simular escenario"],
    icon: ClipboardList
  },
  {
    id: "M-11",
    slug: "produccion",
    name: "Producción",
    area: "Manufactura",
    status: "En construcción",
    summary: "Órdenes de trabajo, capacidad, avance de producción y eficiencia OEE.",
    capabilities: ["Órdenes de trabajo", "Capacidad", "OEE", "Consumos"],
    nextActions: ["Crear orden", "Registrar avance", "Medir OEE"],
    icon: Factory
  },
  {
    id: "M-12",
    slug: "recetas",
    name: "Recetas y listas de materiales",
    area: "Manufactura",
    status: "En construcción",
    summary: "BOM, fórmulas, versiones, cambios de ingeniería y planeación de materiales.",
    capabilities: ["BOM", "Versiones", "Cambios de ingeniería", "MRP"],
    nextActions: ["Crear receta", "Aprobar versión", "Calcular requerimientos"],
    icon: ClipboardCheck
  },
  {
    id: "M-13",
    slug: "calidad",
    name: "Calidad",
    area: "Manufactura",
    status: "En construcción",
    summary: "Inspecciones, trazabilidad, no conformidades y acciones correctivas.",
    capabilities: ["Inspecciones", "CAPA", "Trazabilidad", "Liberación"],
    nextActions: ["Crear inspección", "Registrar hallazgo", "Liberar lote"],
    icon: ShieldCheck
  },
  {
    id: "M-14",
    slug: "transporte",
    name: "Transporte",
    area: "Logística",
    status: "En construcción",
    summary: "Rutas, vehículos, entregas, fletes y seguimiento logístico.",
    capabilities: ["Rutas", "Vehículos", "Fletes", "Entregas"],
    nextActions: ["Planear ruta", "Asignar vehículo", "Confirmar entrega"],
    icon: Truck
  },
  {
    id: "M-15",
    slug: "devoluciones",
    name: "Devoluciones",
    area: "Logística",
    status: "En construcción",
    summary: "RMA, devoluciones de clientes, garantías y flujo de aprobación.",
    capabilities: ["RMA", "Garantías", "Aprobaciones", "Reintegro a stock"],
    nextActions: ["Crear devolución", "Aprobar RMA", "Reintegrar artículo"],
    icon: RefreshCcw
  },
  {
    id: "M-16",
    slug: "comercio-exterior",
    name: "Comercio exterior",
    area: "Logística",
    status: "En construcción",
    summary: "Importaciones, exportaciones, aranceles, declaraciones y costos nacionalizados.",
    capabilities: ["Importaciones", "Exportaciones", "Aranceles", "Costos nacionalizados"],
    nextActions: ["Crear operación", "Calcular arancel", "Liquidar costo"],
    icon: Route
  },
  {
    id: "M-17",
    slug: "talento-humano",
    name: "Talento humano",
    area: "Personas",
    status: "En construcción",
    summary: "Empleados, contratos, nómina Colombia, ausencias, desempeño y OKR.",
    capabilities: ["Empleados", "Contratos", "Nómina Colombia", "OKR"],
    nextActions: ["Crear empleado", "Procesar nómina", "Revisar objetivos"],
    icon: Users
  },
  {
    id: "M-18",
    slug: "activos",
    name: "Activos y mantenimiento",
    area: "Activos",
    status: "En construcción",
    summary: "Activos, mantenimientos, sensores, umbrales y mantenimiento predictivo.",
    capabilities: ["Activos", "Mantenimiento", "Sensores", "Alertas"],
    nextActions: ["Registrar activo", "Programar mantenimiento", "Ver sensores"],
    icon: Wrench
  },
  {
    id: "M-19",
    slug: "proyectos",
    name: "Proyectos",
    area: "Gestión",
    status: "Base funcional",
    summary: "Centro Operacional MODELO APEX para compromisos, entregables, bloqueos, riesgos, recursos y avance validado.",
    capabilities: ["Centro Operacional", "APEX Score", "Compromisos", "Participantes temporales"],
    nextActions: ["Abrir centro operacional", "Registrar compromiso", "Agregar participante"],
    icon: Building2
  },
  {
    id: "M-20",
    slug: "crm",
    name: "CRM",
    area: "Comercial",
    status: "En construcción",
    summary: "Clientes, contactos, campañas, retención, segmentación y oportunidades.",
    capabilities: ["Clientes", "Contactos", "Campañas", "Segmentación"],
    nextActions: ["Crear cliente", "Abrir oportunidad", "Diseñar campaña"],
    icon: ContactRound
  },
  {
    id: "M-21",
    slug: "planeacion-demanda",
    name: "Planeación de demanda",
    area: "Inteligencia",
    status: "En construcción",
    summary: "Pronóstico ARIMA/ML, S&OP, demanda futura y señales de inventario.",
    capabilities: ["Pronóstico", "S&OP", "ARIMA", "Aprendizaje"],
    nextActions: ["Cargar histórico", "Generar pronóstico", "Revisar sugerencias"],
    icon: CalendarClock
  },
  {
    id: "M-22",
    slug: "administracion",
    name: "Administración APEX",
    area: "Sistema",
    status: "Base funcional",
    summary: "Roles, auditoría, exportación de datos, salud del sistema y configuración.",
    capabilities: ["Roles", "Auditoría", "Exportación", "Métricas"],
    nextActions: ["Ver auditoría", "Exportar datos", "Revisar configuración"],
    icon: Settings
  },
  {
    id: "M-23",
    slug: "facturacion-electronica",
    name: "Facturación electrónica",
    area: "Cumplimiento",
    status: "En construcción",
    summary: "DIAN Colombia, SAT México, SUNAT Perú, XML, firma digital y PDF fiscal.",
    capabilities: ["DIAN", "CUFE", "XML UBL 2.1", "PDF fiscal"],
    nextActions: ["Configurar resolución", "Emitir documento", "Consultar estado"],
    icon: FileCheck2
  },
  {
    id: "M-26",
    slug: "servicios",
    name: "Servicios",
    area: "Operación de campo",
    status: "Base funcional",
    summary: "Órdenes de servicio, técnicos, inspección, ejecución, novedades, evidencias, firma y cierre.",
    capabilities: ["Órdenes de servicio", "Técnicos", "Inspección", "Evidencias y novedades"],
    nextActions: ["Crear orden", "Iniciar servicio", "Cerrar servicio"],
    icon: Wrench
  },
  {
    id: "AI-CORE",
    slug: "apex-ai",
    name: "APEX AI Core",
    area: "Inteligencia",
    status: "Base funcional",
    summary: "Capa cognitiva transversal: mentor, alertas, recomendaciones, contexto, permisos y trazabilidad para todo APEXOS.",
    capabilities: ["Mentor por modulo", "Alertas inteligentes", "Recomendaciones auditables", "Contexto multi-tenant"],
    nextActions: ["Ver tablero de inteligencia", "Generar recomendaciones", "Revisar senales criticas"],
    icon: Brain
  },
  {
    id: "M-24",
    slug: "configuracion-inicial",
    name: "Configuración inicial",
    area: "Experiencia",
    status: "Listo para operar",
    summary: "Conversación guiada para entender el negocio y sugerir módulos iniciales.",
    capabilities: ["Diagnóstico", "Clasificación", "Sugerencias", "Activación"],
    nextActions: ["Rehacer diagnóstico", "Activar módulos", "Entrar al tablero"],
    icon: Brain
  },
  {
    id: "M-25",
    slug: "suscripciones",
    name: "Suscripciones",
    area: "Comercial",
    status: "En construcción",
    summary: "Planes Semilla, Raíz, Tronco y Copa, facturación mensual y límites de uso.",
    capabilities: ["Planes", "Facturación mensual", "Límites", "Exportación"],
    nextActions: ["Ver plan", "Cambiar plan", "Consultar consumo"],
    icon: FileText
  }
];

export const MODULES_BY_SLUG = Object.fromEntries(MODULES.map((module) => [module.slug, module]));
export const MODULES_BY_ID = Object.fromEntries(MODULES.map((module) => [module.id, module]));
export const ALL_MODULE_IDS = MODULES.map((module) => module.id);
