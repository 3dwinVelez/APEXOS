"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Container,
  Edit3,
  Filter,
  GitBranch,
  Map,
  Package,
  PackageCheck,
  Plus,
  Radio,
  Route,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Timer,
  Trash2,
  Truck,
  Users,
  Warehouse,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { InventoryNav } from "@/components/inventory-nav";

type View = "motor" | "operacion" | "layout" | "reglas" | "conteo" | "mobile";
type WmsEvent = "recibo" | "almacen" | "picking" | "despacho" | "conteo";
type TaskStatus = "pendiente" | "curso" | "completa" | "atrasada" | "bloqueada";
type TaskFilter = "todas" | TaskStatus;
type LayoutTool = "zona" | "rack" | "muelle" | "camion" | "montacargas" | "flujo" | "oficina" | "puerta" | "staging";
type LayoutLayer = "estructura" | "ocupacion" | "abc" | "estado" | "productos" | "tareas" | "alertas" | "capacidad";
type ConfigModal = "herramientas" | "zona" | "elemento" | "ubicacion" | "capas" | null;
type DragTarget = { kind: "zone" | "asset"; id: number } | null;

type WarehouseZone = {
  id: number;
  code: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  occupancy: number;
  capacityKg?: number;
  capacityM3?: number;
  capacityUnits?: number;
  pickingPriority?: "alta" | "media" | "baja";
};

type VisualLocation = {
  code: string;
  zoneId: number;
  x: number;
  y: number;
  product: string;
  sku: string;
  qty: number;
  occupancy: number;
  abc: "A" | "B" | "C";
  status: "vacia" | "disponible" | "llena" | "bloqueada" | "cuarentena" | "alerta";
  activeTasks: number;
  capacityUnits: number;
  expires?: string;
  multiSku?: boolean;
};

type LayoutAsset = {
  id: number;
  kind: Exclude<LayoutTool, "zona">;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: 0 | 90 | 180 | 270;
};

type WmsRule = {
  id: number;
  name: string;
  event: WmsEvent;
  trigger: string;
  groupBy: string;
  priority: string;
  method: string;
  enabled: boolean;
};

type WmsTask = {
  id: string;
  event: WmsEvent;
  type: string;
  zone: string;
  priority: string;
  operator: string;
  status: TaskStatus;
  due: string;
  container: string;
};

type CountMethod = {
  id: string;
  name: string;
  cadence: string;
  scope: string;
  tolerance: string;
  enabled: boolean;
};

const views: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "motor", label: "Motor", icon: GitBranch },
  { id: "operacion", label: "Operación", icon: Activity },
  { id: "layout", label: "Layout 2D", icon: Map },
  { id: "reglas", label: "Reglas", icon: GitBranch },
  { id: "conteo", label: "Conteo", icon: ClipboardList },
  { id: "mobile", label: "Mobile", icon: Smartphone }
];

const eventLabels: Record<WmsEvent, string> = {
  recibo: "Recibo",
  almacen: "Almacén",
  picking: "Picking",
  despacho: "Despacho",
  conteo: "Conteo"
};

const eventColors: Record<WmsEvent, string> = {
  recibo: "bg-neutral-100 text-neutral-700",
  almacen: "bg-neutral-100 text-neutral-700",
  picking: "bg-neutral-100 text-neutral-700",
  despacho: "bg-neutral-100 text-neutral-700",
  conteo: "bg-neutral-100 text-neutral-700"
};

const zoneColors = ["bg-neutral-100", "bg-neutral-200", "bg-neutral-300"];

const layerLabels: Record<LayoutLayer, string> = {
  estructura: "Estructura",
  ocupacion: "Ocupación",
  abc: "ABC",
  estado: "Estado",
  productos: "Productos",
  tareas: "Tareas",
  alertas: "Alertas",
  capacidad: "Capacidad"
};

const layoutTools: { id: LayoutTool; label: string; hint: string }[] = [
  { id: "zona", label: "Zona", hint: "Área operativa configurable" },
  { id: "rack", label: "Rack", hint: "Estructura de almacenamiento" },
  { id: "muelle", label: "Muelle", hint: "Dock de recibo/despacho" },
  { id: "camion", label: "Camión", hint: "Vehículo en muelle" },
  { id: "montacargas", label: "Montacargas", hint: "Equipo de movimiento" },
  { id: "flujo", label: "Flujo", hint: "Dirección de tránsito" },
  { id: "staging", label: "Staging", hint: "Zona temporal" },
  { id: "oficina", label: "Oficina", hint: "Soporte / administración" },
  { id: "puerta", label: "Puerta", hint: "Acceso / cortina" }
];

const initialZones: WarehouseZone[] = [
  { id: 1, code: "REC", name: "Recibo", type: "recibo", occupancy: 48, x: 2, y: 8, w: 18, h: 20, color: "bg-neutral-100" },
  { id: 2, code: "STG", name: "Staging inbound", type: "staging", occupancy: 64, x: 22, y: 8, w: 17, h: 20, color: "bg-neutral-200" },
  { id: 3, code: "QAR", name: "Cuarentena", type: "cuarentena", occupancy: 31, x: 41, y: 8, w: 13, h: 20, color: "bg-neutral-100" },
  { id: 4, code: "RSV", name: "Reserva pallet", type: "reserva", occupancy: 76, x: 5, y: 34, w: 42, h: 36, color: "bg-neutral-200" },
  { id: 5, code: "PCK", name: "Forward picking", type: "picking", occupancy: 88, x: 52, y: 34, w: 20, h: 36, color: "bg-neutral-300" },
  { id: 6, code: "PAC", name: "Packing", type: "packing", occupancy: 82, x: 75, y: 52, w: 20, h: 18, color: "bg-neutral-300" },
  { id: 7, code: "DSP", name: "Despacho", type: "despacho", occupancy: 71, x: 60, y: 76, w: 35, h: 18, color: "bg-neutral-200" }
];

const initialLocations: VisualLocation[] = [
  { code: "PCK-A1-M01-N01-U01", zoneId: 5, x: 54, y: 38, product: "Coca Cola 400ml", sku: "CC400", qty: 120, occupancy: 75, abc: "A", status: "disponible", activeTasks: 2, capacityUnits: 160, expires: "2026-08-12" },
  { code: "PCK-A1-M01-N01-U02", zoneId: 5, x: 62, y: 38, product: "Agua 600ml", sku: "AG600", qty: 88, occupancy: 55, abc: "A", status: "disponible", activeTasks: 1, capacityUnits: 160 },
  { code: "PCK-A1-M02-N01-U01", zoneId: 5, x: 54, y: 48, product: "Snack mix", sku: "SN120", qty: 0, occupancy: 0, abc: "B", status: "vacia", activeTasks: 0, capacityUnits: 120 },
  { code: "PCK-A2-M01-N02-U04", zoneId: 5, x: 64, y: 56, product: "Café molido 500g", sku: "CAF500", qty: 96, occupancy: 96, abc: "A", status: "llena", activeTasks: 3, capacityUnits: 100, multiSku: true },
  { code: "RSV-B1-M04-N03-U02", zoneId: 4, x: 12, y: 42, product: "Pallet detergente", sku: "DET-PAL", qty: 24, occupancy: 82, abc: "B", status: "disponible", activeTasks: 1, capacityUnits: 30 },
  { code: "RSV-B2-M02-N01-U05", zoneId: 4, x: 28, y: 55, product: "Pallet arroz", sku: "ARR-PAL", qty: 30, occupancy: 100, abc: "C", status: "llena", activeTasks: 0, capacityUnits: 30 },
  { code: "QAR-Q1-M01-N01-U01", zoneId: 3, x: 45, y: 17, product: "Lote retenido", sku: "QA-778", qty: 12, occupancy: 40, abc: "C", status: "cuarentena", activeTasks: 1, capacityUnits: 30 },
  { code: "DSP-D1-STG-U01", zoneId: 7, x: 68, y: 84, product: "Pedido ruta norte", sku: "MIX-RT5", qty: 18, occupancy: 68, abc: "A", status: "alerta", activeTasks: 4, capacityUnits: 26, multiSku: true }
];

const initialAssets: LayoutAsset[] = [
  { id: 2001, kind: "muelle", label: "Muelle recibo 1", x: 2, y: 2, w: 10, h: 5 },
  { id: 2002, kind: "camion", label: "Camión inbound", x: 3, y: -5, w: 12, h: 6 },
  { id: 2003, kind: "muelle", label: "Muelle despacho 1", x: 76, y: 94, w: 10, h: 5 },
  { id: 2004, kind: "camion", label: "Camión ruta", x: 75, y: 99, w: 15, h: 7 },
  { id: 2005, kind: "montacargas", label: "M1", x: 46, y: 58, w: 5, h: 6 },
  { id: 2006, kind: "oficina", label: "Oficinas", x: 80, y: 8, w: 14, h: 12 }
];

const initialRules: WmsRule[] = [
  { id: 1, name: "Cliente XXXXX cada 2 horas", event: "picking", trigger: "cada 2 horas", groupBy: "cliente XXXXX + SLA", priority: "alta", method: "cluster picking", enabled: true },
  { id: 2, name: "FEFO perecederos", event: "picking", trigger: "al liberar pedidos", groupBy: "vencimiento + zona", priority: "fecha corta", method: "FEFO", enabled: true },
  { id: 3, name: "Reposición pick face", event: "almacen", trigger: "stock < mínimo", groupBy: "zona ABC A", priority: "crítica", method: "task interleaving", enabled: true }
];

const initialTasks: WmsTask[] = [
  { id: "RC-1001", event: "recibo", type: "Recibir pallet", zone: "REC-01", priority: "Alta", operator: "Laura", status: "pendiente", due: "22 min", container: "PAL-884" },
  { id: "AL-2204", event: "almacen", type: "Putaway reserva", zone: "RSV-A2", priority: "Media", operator: "Mateo", status: "curso", due: "41 min", container: "PAL-884" },
  { id: "PK-1048", event: "picking", type: "Cluster picking", zone: "PCK-A1", priority: "Alta", operator: "Nora", status: "curso", due: "38 min", container: "Tote T-004" },
  { id: "DS-4102", event: "despacho", type: "Mover a muelle", zone: "DSP-03", priority: "Ruta 5", operator: "Iker", status: "atrasada", due: "-9 min", container: "Jaula R-12" },
  { id: "CT-7781", event: "conteo", type: "Conteo cíclico", zone: "PCK-A3", priority: "ABC A", operator: "Sofía", status: "pendiente", due: "2 h", container: "Sin unidad" },
  { id: "RC-1002", event: "recibo", type: "Inspección calidad", zone: "QAR-01", priority: "Media", operator: "Sin asignar", status: "bloqueada", due: "1 h", container: "BOX-771" }
];

const initialCountMethods: CountMethod[] = [
  { id: "cycle", name: "Conteo cíclico ABC", cadence: "diario ABC A, semanal B, mensual C", scope: "ubicaciones activas", tolerance: "0.5%", enabled: true },
  { id: "wall", name: "Wall to wall", cadence: "cierre mensual/trimestral", scope: "toda la bodega", tolerance: "0%", enabled: false },
  { id: "blind", name: "Conteo ciego", cadence: "por auditoría o discrepancia", scope: "SKU/lote específico", tolerance: "0%", enabled: true },
  { id: "opportunistic", name: "Conteo oportunista", cadence: "cuando ubicación queda vacía", scope: "pick face y reserva", tolerance: "1%", enabled: true }
];

const kpis = [
  { label: "Tareas pendientes", value: "18", trend: "-12%", icon: Timer },
  { label: "En curso", value: "31", trend: "+6%", icon: Activity },
  { label: "Atrasadas", value: "7", trend: "-31%", icon: AlertTriangle },
  { label: "Recorrido promedio", value: "312 m", trend: "-22%", icon: Route },
  { label: "Exactitud", value: "99.42%", trend: "+0.8%", icon: BadgeCheck },
  { label: "OTIF", value: "96.1%", trend: "+3.4%", icon: Truck }
];

const operators = ["Sin asignar", "Laura", "Mateo", "Nora", "Iker", "Sofía", "Diego"];
const taskFilters: { id: TaskFilter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "pendiente", label: "Pendientes" },
  { id: "curso", label: "En curso" },
  { id: "atrasada", label: "Atrasadas" },
  { id: "bloqueada", label: "Bloqueadas" },
  { id: "completa", label: "Completas" }
];

const handlingUnits = [
  { name: "Pallet", code: "PAL", use: "Recibo, reserva, despacho", capacity: "800 kg" },
  { name: "Caja", code: "BOX", use: "Picking y packing", capacity: "25 kg" },
  { name: "Tote", code: "TOT", use: "Cluster picking", capacity: "18 kg" },
  { name: "Bolsa", code: "BAG", use: "E-commerce liviano", capacity: "5 kg" },
  { name: "Bulto", code: "BUL", use: "Carga irregular", capacity: "50 kg" },
  { name: "Jaula/Roll", code: "ROL", use: "Retail y rutas", capacity: "350 kg" }
];

const mobileSteps = [
  { label: "Escanear tarea", detail: "RC, AL, PK, DS o CT", icon: ScanLine },
  { label: "Validar unidad", detail: "pallet, caja, tote, bolsa o roll", icon: Boxes },
  { label: "Confirmar evento", detail: "recibo, movimiento, picking o despacho", icon: CheckCircle2 },
  { label: "Resolver excepción", detail: "faltante, daño, bloqueo o parcial", icon: AlertTriangle }
];

const sourceDocuments = [
  { doc: "Orden de compra", module: "Compras", task: "ReceiptTask", flow: "recibo + inspección + putaway", status: "12 pendientes", priority: "Alta" },
  { doc: "ASN proveedor", module: "Compras", task: "ReceiptTask", flow: "pre-recibo + cita muelle", status: "4 esperadas hoy", priority: "Media" },
  { doc: "Pedido / factura", module: "Ventas / Facturación", task: "PickTask", flow: "picking + packing + despacho", status: "26 liberadas", priority: "SLA" },
  { doc: "Transferencia", module: "Inventario", task: "MoveTask", flow: "reubicación + validación", status: "8 por mover", priority: "Media" },
  { doc: "Mínimos / demanda", module: "Inventario", task: "ReplenishmentTask", flow: "reserva → pick face", status: "9 sugeridas", priority: "Alta" },
  { doc: "Conteo cíclico", module: "Inventario", task: "CountTask", flow: "conteo + diferencia + ajuste", status: "15 ubicaciones", priority: "ABC A" },
  { doc: "Devolución", module: "Ventas / Compras", task: "ReturnTask", flow: "recibo + cuarentena + reintegro", status: "3 abiertas", priority: "Control" }
];

const operationalFlows = [
  {
    title: "Recepción",
    origin: "OC, ASN, transferencia o devolución proveedor",
    tasks: ["ReceiptTask", "QualityCheckTask", "PutawayTask"],
    mobile: ["Escanear documento", "Escanear SKU/lote", "Confirmar cantidad", "Registrar novedad", "Enviar a putaway"],
    validations: ["cantidad esperada", "lote/vencimiento", "sobrante/faltante", "avería", "muelle correcto"],
    erpEvent: "receipt.confirmed + inventory.posted"
  },
  {
    title: "Picking",
    origin: "pedido, factura, orden de venta, requisición o transferencia",
    tasks: ["PickTask", "PackTask", "ReplenishmentTask"],
    mobile: ["Ir a ubicación", "Escanear ubicación", "Escanear producto", "Confirmar cantidad", "Siguiente pick"],
    validations: ["FIFO/FEFO", "stock disponible", "ubicación correcta", "producto correcto", "parcial autorizado"],
    erpEvent: "picking.completed + stock.reserved"
  },
  {
    title: "Despacho",
    origin: "factura, guía, ruta o documento de salida",
    tasks: ["ShipmentTask", "DockLoadTask"],
    mobile: ["Escanear pallet/bulto", "Validar ruta", "Confirmar carga", "Registrar novedad"],
    validations: ["transportadora", "ruta", "peso/volumen", "pedido completo", "muelle asignado"],
    erpEvent: "shipment.confirmed + invoice.dispatched"
  },
  {
    title: "Reabastecimiento",
    origin: "mínimos, demanda, picks pendientes y ocupación pick face",
    tasks: ["ReplenishmentTask", "MoveTask"],
    mobile: ["Escanear origen", "Tomar unidad", "Escanear destino", "Confirmar reposición"],
    validations: ["capacidad destino", "ABC", "compatibilidad", "bloqueo", "tarea cercana"],
    erpEvent: "inventory.moved + replenishment.completed"
  },
  {
    title: "Inventario",
    origin: "conteo cíclico, auditoría, diferencia o ubicación vacía",
    tasks: ["CountTask", "AdjustmentReviewTask"],
    mobile: ["Escanear ubicación", "Contar", "Confirmar", "Registrar diferencia"],
    validations: ["conteo ciego", "tolerancia", "doble conteo", "autorización ajuste"],
    erpEvent: "count.completed + variance.created"
  },
  {
    title: "Movimientos internos",
    origin: "compactación, consolidación, cuarentena o cambio de zona",
    tasks: ["MoveTask", "QuarantineTask", "ConsolidationTask"],
    mobile: ["Escanear unidad", "Mover", "Escanear destino", "Confirmar"],
    validations: ["ubicación permitida", "producto compatible", "capacidad", "zona autorizada"],
    erpEvent: "internal.move.confirmed"
  }
];

const taskEngineRules = [
  "Prioriza SLA, ruta, cliente y promesa de entrega.",
  "Asigna por proximidad, zona, habilidad, equipo disponible y carga laboral.",
  "Combina tareas cercanas con task interleaving para evitar recorridos vacíos.",
  "Rebalancea automáticamente si una zona se congestiona o un operario se atrasa.",
  "Convierte documentos administrativos en tareas simples, no en formularios largos.",
  "Publica eventos en tiempo real para layout, KPIs, ERP y móvil offline."
];

const taskStates = ["pending", "assigned", "in_progress", "paused", "completed", "cancelled", "exception"];
const taskExceptions = ["faltante", "sobrante", "ubicación incorrecta", "producto incorrecto", "daño", "bloqueo", "inventario insuficiente", "error escaneo"];

const wmsApis = [
  ["POST", "/api/wms/tasks/from-document", "Convierte OC, factura, pedido o transferencia en tareas WMS."],
  ["GET", "/api/wms/inbound/documents", "Bandeja de recepciones pendientes desde compras/ERP."],
  ["POST", "/api/wms/tasks/:id/assign", "Asigna tareas individual o en lote por zona, habilidad o prioridad."],
  ["POST", "/api/wms/tasks/:id/execute", "Registra escaneo, cantidad, ubicación, usuario y validación."],
  ["POST", "/api/wms/tasks/:id/exception", "Crea excepción operativa con evidencia y resolución."],
  ["POST", "/api/wms/inventory/move", "Confirma movimiento y actualiza inventario central."],
  ["GET", "/api/wms/layout/live", "Devuelve ocupación, tareas, congestión y alertas para el mapa 2D."],
  ["GET", "/api/wms/mobile/sync", "Sincroniza cola offline, tareas asignadas y catálogos mínimos."]
];

const realtimeEvents = [
  "erp.purchase_order.created",
  "wms.receipt.confirmed",
  "wms.putaway.completed",
  "wms.pick.completed",
  "wms.shipment.confirmed",
  "wms.inventory.variance",
  "wms.task.exception",
  "wms.layout.heatmap.updated"
];

const wmsGuides: Record<View, { title: string; goal: string; steps: string[]; next: string }> = {
  motor: {
    title: "Convierte documentos en trabajo",
    goal: "Empieza por los documentos que ya existen en compras, ventas e inventario. APEX los traduce en tareas operativas.",
    steps: ["Revisa documentos pendientes", "Genera tareas por lote", "Valida prioridad y SLA"],
    next: "Generar tareas desde documentos origen"
  },
  operacion: {
    title: "Controla el turno",
    goal: "La prioridad del supervisor es limpiar atrasos, asignar responsables y mantener el flujo sin cuellos de botella.",
    steps: ["Filtra atrasadas o bloqueadas", "Selecciona tareas", "Asigna operador o cambia estado"],
    next: "Resolver tareas atrasadas primero"
  },
  layout: {
    title: "Opera desde el mapa",
    goal: "Usa el plano para saber dónde actuar, no para decorar. Lo importante es ubicación, tarea activa, bloqueo y capacidad.",
    steps: ["Busca SKU o ubicación", "Selecciona una ubicación", "Ejecuta la acción sugerida"],
    next: "Revisar ubicaciones con tareas activas"
  },
  reglas: {
    title: "Automatiza decisiones repetidas",
    goal: "Configura reglas simples para que el sistema priorice y agrupe sin depender de un consultor.",
    steps: ["Define el evento", "Elige disparador", "Guarda la regla y observa tareas"],
    next: "Crear una regla de reposición o picking"
  },
  conteo: {
    title: "Mantén inventario confiable",
    goal: "El conteo debe guiar al operario a contar solo lo que importa y escalar diferencias cuando superan tolerancia.",
    steps: ["Elige método", "Define alcance", "Confirma diferencia o ajuste"],
    next: "Lanzar conteo ABC A"
  },
  mobile: {
    title: "Hazlo escaneable",
    goal: "Cada tarea móvil debe decirle al operario qué escanear, qué validar y cuál es el siguiente paso.",
    steps: ["Escanea tarea", "Valida ubicación y SKU", "Confirma cantidad o excepción"],
    next: "Probar flujo móvil de picking"
  }
};

const mvpBacklog = [
  "Bandeja de documentos origen por flujo.",
  "Generación de WarehouseTask desde documentos ERP.",
  "Asignación masiva por evento, zona y prioridad.",
  "Mobile receiving, picking, putaway, despacho y conteo.",
  "Registro WarehouseTaskExecution con trazabilidad de escaneos.",
  "Layout 2D conectado a tareas activas, ocupación y alertas.",
  "Proxy API + eventos WebSocket para KPIs en tiempo real."
];

const advancedBacklog = [
  "Optimización de rutas con matriz de distancia real por layout.",
  "Task interleaving automático por cercanía y equipo disponible.",
  "Motor predictivo de reabastecimiento por demanda y ola futura.",
  "Slotting ABC sugerido según rotación, congestión y despacho.",
  "Modo offline móvil con resolución de conflictos por evento.",
  "Simulación de olas, batches y capacidad antes de liberar tareas."
];

export default function WmsPage() {
  const [view, setView] = useState<View>("layout");
  const [dark, setDark] = useState(false);
  const [eventFilter, setEventFilter] = useState<WmsEvent | "todos">("todos");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("todas");
  const [tasks, setTasks] = useState<WmsTask[]>(initialTasks);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkOperator, setBulkOperator] = useState("Laura");
  const [bulkStatus, setBulkStatus] = useState<TaskStatus>("curso");
  const [zones, setZones] = useState<WarehouseZone[]>(initialZones);
  const [assets, setAssets] = useState<LayoutAsset[]>(initialAssets);
  const [locations, setLocations] = useState<VisualLocation[]>(initialLocations);
  const [selectedZoneId, setSelectedZoneId] = useState(initialZones[4].id);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [selectedLocationCode, setSelectedLocationCode] = useState(initialLocations[0].code);
  const [newZone, setNewZone] = useState({ code: "NEW", name: "Nueva zona", type: "picking" });
  const [activeTool, setActiveTool] = useState<LayoutTool | null>(null);
  const [layoutSearch, setLayoutSearch] = useState("");
  const [layoutZoom, setLayoutZoom] = useState(100);
  const [configModal, setConfigModal] = useState<ConfigModal>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [layers, setLayers] = useState<Record<LayoutLayer, boolean>>({
    estructura: true,
    ocupacion: true,
    abc: false,
    estado: true,
    productos: false,
    tareas: true,
    alertas: true,
    capacidad: false
  });
  const [rules, setRules] = useState<WmsRule[]>(initialRules);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState({ name: "Nueva regla", event: "picking" as WmsEvent, trigger: "cada 2 horas", groupBy: "cliente", priority: "alta", method: "cluster picking" });
  const [countMethods, setCountMethods] = useState<CountMethod[]>(initialCountMethods);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || zones[0];
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || null;
  const selectedLocation = locations.find((location) => location.code === selectedLocationCode) || null;

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const byEvent = eventFilter === "todos" || task.event === eventFilter;
      const byStatus = taskFilter === "todas" || task.status === taskFilter;
      return byEvent && byStatus;
    });
  }, [eventFilter, taskFilter, tasks]);

  const highlightedLocations = useMemo(() => {
    const query = layoutSearch.trim().toLowerCase();
    if (!query) return locations;
    return locations.filter((location) =>
      [location.code, location.sku, location.product, location.abc, location.status].some((value) => value.toLowerCase().includes(query))
    );
  }, [layoutSearch, locations]);

  const currentGuide = wmsGuides[view];

  function addZone() {
    const next = zones.length + 1;
    const zone: WarehouseZone = {
      id: Date.now(),
      code: newZone.code.toUpperCase().slice(0, 4) || `Z${next}`,
      name: newZone.name || `Zona ${next}`,
      type: newZone.type || "picking",
      occupancy: 0,
      x: 5 + ((next * 13) % 68),
      y: 10 + ((next * 9) % 70),
      w: 16,
      h: 14,
      color: zoneColors[next % zoneColors.length]
    };
    setZones((current) => [...current, zone]);
    setSelectedZoneId(zone.id);
  }

  function addZoneAt(percentX: number, percentY: number) {
    const next = zones.length + 1;
    const zone: WarehouseZone = {
      id: Date.now(),
      code: newZone.code.toUpperCase().slice(0, 4) || `Z${next}`,
      name: newZone.name || `Zona ${next}`,
      type: newZone.type || "picking",
      occupancy: 0,
      x: Math.max(0, Math.min(84, percentX)),
      y: Math.max(0, Math.min(86, percentY)),
      w: 16,
      h: 14,
      color: zoneColors[next % zoneColors.length]
    };
    setZones((current) => [...current, zone]);
    setSelectedZoneId(zone.id);
    setSelectedAssetId(null);
  }

  function addAssetAt(kind: Exclude<LayoutTool, "zona">, percentX: number, percentY: number) {
    const defaults: Record<Exclude<LayoutTool, "zona">, Pick<LayoutAsset, "w" | "h" | "label">> = {
      rack: { w: 26, h: 8, label: "Rack" },
      muelle: { w: 10, h: 5, label: "Muelle" },
      camion: { w: 15, h: 7, label: "Camión" },
      montacargas: { w: 5, h: 6, label: "M" },
      flujo: { w: 18, h: 4, label: "Flujo" },
      oficina: { w: 14, h: 12, label: "Oficina" },
      puerta: { w: 10, h: 3, label: "Puerta" },
      staging: { w: 18, h: 12, label: "Staging" }
    };
    const asset: LayoutAsset = {
      id: Date.now(),
      kind,
      label: defaults[kind].label,
      x: Math.max(0, Math.min(95 - defaults[kind].w, percentX)),
      y: Math.max(-8, Math.min(100 - defaults[kind].h, percentY)),
      w: defaults[kind].w,
      h: defaults[kind].h,
      rotation: 0
    };
    setAssets((current) => [...current, asset]);
    setSelectedAssetId(asset.id);
    setSelectedZoneId(0);
  }

  function loadPreset(preset: "u" | "i") {
    setZones(preset === "u" ? initialZones : [
      { id: 101, code: "REC", name: "Recibo norte", type: "recibo", occupancy: 42, x: 2, y: 8, w: 18, h: 84, color: "bg-neutral-100" },
      { id: 102, code: "RSV", name: "Reserva central", type: "reserva", occupancy: 74, x: 25, y: 8, w: 34, h: 84, color: "bg-neutral-200" },
      { id: 103, code: "PCK", name: "Picking rápido", type: "picking", occupancy: 83, x: 62, y: 8, w: 16, h: 60, color: "bg-neutral-300" },
      { id: 104, code: "PAC", name: "Packing", type: "packing", occupancy: 68, x: 81, y: 8, w: 16, h: 28, color: "bg-neutral-200" },
      { id: 105, code: "DSP", name: "Despacho sur", type: "despacho", occupancy: 71, x: 81, y: 42, w: 16, h: 50, color: "bg-neutral-200" }
    ]);
    setLocations(preset === "u" ? initialLocations : initialLocations.map((location, index) => ({
      ...location,
      zoneId: index < 4 ? 103 : 102,
      x: 63 + ((index % 2) * 7),
      y: 12 + (index * 8),
      code: index < 4 ? `PCK-I-M0${index + 1}-N01-U01` : `RSV-I-M0${index - 3}-N01-U01`
    })));
    setAssets(preset === "u" ? initialAssets : [
      { id: 3001, kind: "muelle", label: "Muelle inbound", x: 2, y: 2, w: 10, h: 5 },
      { id: 3002, kind: "camion", label: "Camión inbound", x: 3, y: -5, w: 14, h: 7 },
      { id: 3003, kind: "rack", label: "Racks centrales", x: 28, y: 18, w: 28, h: 7 },
      { id: 3004, kind: "rack", label: "Racks centrales", x: 28, y: 34, w: 28, h: 7 },
      { id: 3005, kind: "rack", label: "Racks centrales", x: 28, y: 50, w: 28, h: 7 },
      { id: 3006, kind: "muelle", label: "Muelle outbound", x: 86, y: 40, w: 10, h: 5, rotation: 90 },
      { id: 3007, kind: "camion", label: "Camión outbound", x: 95, y: 38, w: 14, h: 7, rotation: 90 }
    ]);
    setSelectedZoneId(preset === "u" ? initialZones[4].id : 103);
    setSelectedAssetId(null);
  }

  function resetLayout() {
    setZones([]);
    setAssets([]);
    setLocations([]);
    setSelectedZoneId(0);
    setSelectedAssetId(null);
    setSelectedLocationCode("");
  }

  function deleteSelectedZone() {
    setZones((current) => current.filter((zone) => zone.id !== selectedZoneId));
    setSelectedZoneId(zones.find((zone) => zone.id !== selectedZoneId)?.id || 0);
  }

  function updateSelectedZone(patch: Partial<WarehouseZone>) {
    setZones((current) => current.map((zone) => zone.id === selectedZoneId ? { ...zone, ...patch } : zone));
  }

  function generateLocationsForZone() {
    if (!selectedZone) return;
    const generated = Array.from({ length: 12 }, (_, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const code = `${selectedZone.code}-M${String(col + 1).padStart(2, "0")}-N${row + 1}-U01`;
      return {
        code,
        zoneId: selectedZone.id,
        x: selectedZone.x + 2 + col * Math.max(3, selectedZone.w / 4),
        y: selectedZone.y + 3 + row * Math.max(3, selectedZone.h / 3),
        product: index % 3 === 0 ? "Ubicación vacía" : index % 2 === 0 ? "Producto rápido" : "Producto reserva",
        sku: index % 3 === 0 ? "EMPTY" : index % 2 === 0 ? "FAST-A" : "RSV-B",
        qty: index % 3 === 0 ? 0 : 60 + index * 4,
        occupancy: index % 3 === 0 ? 0 : Math.min(96, 35 + index * 5),
        abc: index % 2 === 0 ? "A" : "B",
        status: index % 3 === 0 ? "vacia" : "disponible",
        activeTasks: index % 4 === 0 ? 1 : 0,
        capacityUnits: 120
      } satisfies VisualLocation;
    });
    const generatedCodes = new Set(generated.map((location) => location.code));
    setLocations((current) => [...current.filter((location) => !generatedCodes.has(location.code)), ...generated]);
    setSelectedLocationCode(generated[0]?.code || "");
  }

  function bulkUpdateZoneLocations(patch: Partial<Pick<VisualLocation, "status" | "abc" | "capacityUnits">>) {
    if (!selectedZone) return;
    setLocations((current) => current.map((location) => location.zoneId === selectedZone.id ? { ...location, ...patch } : location));
  }

  function updateSelectedLocation(patch: Partial<VisualLocation>) {
    if (!selectedLocationCode) return;
    setLocations((current) => current.map((location) => location.code === selectedLocationCode ? { ...location, ...patch } : location));
  }

  function updateSelectedAsset(patch: Partial<LayoutAsset>) {
    setAssets((current) => current.map((asset) => asset.id === selectedAssetId ? { ...asset, ...patch } : asset));
  }

  function moveLayoutObject(target: DragTarget, x: number, y: number) {
    if (!target) return;
    if (target.kind === "zone") {
      setZones((current) => current.map((zone) => zone.id === target.id ? { ...zone, x: Math.max(0, Math.min(96 - zone.w, x)), y: Math.max(0, Math.min(96 - zone.h, y)) } : zone));
    } else {
      setAssets((current) => current.map((asset) => asset.id === target.id ? { ...asset, x: Math.max(-8, Math.min(108 - asset.w, x)), y: Math.max(-8, Math.min(108 - asset.h, y)) } : asset));
    }
  }

  function deleteSelectedAsset() {
    if (!selectedAssetId) return;
    setAssets((current) => current.filter((asset) => asset.id !== selectedAssetId));
    setSelectedAssetId(null);
  }

  function updateTask(id: string, patch: Partial<WmsTask>) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  }

  function toggleTaskSelection(id: string) {
    setSelectedTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectFilteredTasks() {
    setSelectedTaskIds(filteredTasks.map((task) => task.id));
  }

  function applyBulkPatch(patch: Partial<WmsTask>) {
    const selected = new Set(selectedTaskIds);
    setTasks((current) => current.map((task) => selected.has(task.id) ? { ...task, ...patch } : task));
    setSelectedTaskIds([]);
  }

  function saveRule() {
    if (editingRuleId) {
      setRules((current) => current.map((rule) => rule.id === editingRuleId ? { ...rule, ...ruleForm } : rule));
      setEditingRuleId(null);
    } else {
      setRules((current) => [...current, { id: Date.now(), enabled: true, ...ruleForm }]);
    }
    setRuleForm({ name: "Nueva regla", event: "picking", trigger: "cada 2 horas", groupBy: "cliente", priority: "alta", method: "cluster picking" });
  }

  function editRule(rule: WmsRule) {
    setEditingRuleId(rule.id);
    setRuleForm({ name: rule.name, event: rule.event, trigger: rule.trigger, groupBy: rule.groupBy, priority: rule.priority, method: rule.method });
  }

  return (
    <div className={`space-y-5 ${dark ? "text-white" : ""}`}>
      <header className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-apex">Inventario · WMS operativo</p>
            <h1 className="text-3xl font-semibold tracking-normal">WMS ágil de bodega</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-paper" type="button">
              <ScanLine size={16} />
              Escanear
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm text-white" type="button">
              <Zap size={16} />
              Nueva tarea
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={() => setDark((current) => !current)} type="button">
              <ShieldCheck size={16} />
              Modo {dark ? "claro" : "oscuro"}
            </button>
          </div>
        </div>
      </header>

      <InventoryNav />

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {views.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm ${active ? "border-apex bg-[#146C6312] text-apex" : dark ? "border-neutral-800 bg-neutral-950 text-neutral-200" : "border-line bg-white text-neutral-700"}`} key={item.id} onClick={() => setView(item.id)} type="button">
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <WorkflowGuide guide={currentGuide} />

      {view === "motor" ? (
        <div className="space-y-5">
          <section className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Motor operativo end-to-end</h2>
                <p className="text-sm text-neutral-500">Documentos ERP entran, tareas móviles salen, confirmaciones regresan a inventario, facturación y trazabilidad.</p>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-4">
                <MiniMetric label="Docs vivos" value="77" />
                <MiniMetric label="Tareas generadas" value="128" />
                <MiniMetric label="SLA riesgo" value="7" />
                <MiniMetric label="Offline cola" value="3" />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              {["Documento ERP", "Motor de tareas", "Ejecución móvil", "ERP actualizado"].map((step, index) => (
                <div className="rounded-md border border-line bg-paper p-3" key={step}>
                  <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-apex text-sm font-semibold text-white">{index + 1}</span>
                  <p className="text-sm font-semibold">{step}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {index === 0 ? "OC, ASN, pedido, factura, transferencia o conteo." : index === 1 ? "Agrupa, prioriza, asigna y optimiza recorridos." : index === 2 ? "Scanner, validación, excepción y confirmación." : "Movimiento, evento, KPI y trazabilidad."}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Bandeja de documentos origen</h2>
                <p className="text-sm text-neutral-500">El operario no ve documentos: el supervisor los convierte en trabajo operativo.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">ERP sincronizado</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-neutral-600">
                    <th className="py-2 pr-3">Documento</th>
                    <th className="py-2 pr-3">Módulo origen</th>
                    <th className="py-2 pr-3">Tarea generada</th>
                    <th className="py-2 pr-3">Flujo operativo</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Prioridad</th>
                    <th className="py-2 pr-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceDocuments.map((item) => (
                    <tr className="border-b border-line/70" key={`${item.doc}-${item.task}`}>
                      <td className="py-3 pr-3 font-medium">{item.doc}</td>
                      <td className="py-3 pr-3">{item.module}</td>
                      <td className="py-3 pr-3"><span className="rounded-full bg-[#146C6312] px-2 py-1 text-xs text-apex">{item.task}</span></td>
                      <td className="py-3 pr-3">{item.flow}</td>
                      <td className="py-3 pr-3">{item.status}</td>
                      <td className="py-3 pr-3">{item.priority}</td>
                      <td className="py-3 pr-3">
                        <button className="h-8 rounded-md border border-line px-3 text-xs hover:bg-paper" type="button">Generar tareas</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
              <h2 className="mb-4 text-base font-semibold">Flujos operativos completos</h2>
              <div className="grid gap-3">
                {operationalFlows.map((flow) => (
                  <article className="rounded-md border border-line p-3" key={flow.title}>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold">{flow.title}</p>
                        <p className="mt-1 text-xs text-neutral-500">Origen: {flow.origin}</p>
                      </div>
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700">{flow.erpEvent}</span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <FlowColumn title="Tareas" items={flow.tasks} />
                      <FlowColumn title="Mobile" items={flow.mobile} />
                      <FlowColumn title="Validaciones" items={flow.validations} />
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <section className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
                <h2 className="mb-3 text-base font-semibold">Motor central de tareas</h2>
                <div className="grid gap-2">
                  {taskEngineRules.map((rule) => (
                    <div className="flex gap-2 rounded-md border border-line p-2 text-sm" key={rule}>
                      <CheckCircle2 className="mt-0.5 shrink-0 text-apex" size={15} />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
                <h2 className="mb-3 text-base font-semibold">Task interleaving</h2>
                <div className="space-y-2 text-sm">
                  {["Putaway en RSV-A2", "Pick cercano PCK-A1", "Reposición pick face", "Conteo oportunista"].map((step, index) => (
                    <div className="flex items-center gap-2" key={step}>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-apex text-xs text-white">{index + 1}</span>
                      <span>{step}</span>
                      {index < 3 ? <ArrowRight className="ml-auto text-neutral-400" size={15} /> : null}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
              <h2 className="mb-3 text-base font-semibold">Entidades listas para producción</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <EntityCard title="WarehouseTask" fields={["type", "source_document", "priority", "status", "assigned_user", "warehouse_id", "location_from/to", "sku", "quantity", "lot/serial", "exceptions", "metadata"]} />
                <EntityCard title="WarehouseTaskExecution" fields={["task_id", "action", "timestamp", "device", "user", "location", "quantity", "validation_result"]} />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Estados</p>
                <div className="flex flex-wrap gap-2">
                  {taskStates.map((state) => <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700" key={state}>{state}</span>)}
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Excepciones</p>
                <div className="flex flex-wrap gap-2">
                  {taskExceptions.map((exception) => <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700" key={exception}>{exception}</span>)}
                </div>
              </div>
            </div>

            <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
              <h2 className="mb-3 text-base font-semibold">APIs y eventos</h2>
              <div className="mb-4 max-h-72 overflow-auto rounded-md border border-line">
                {wmsApis.map(([method, path, detail]) => (
                  <div className="grid grid-cols-[64px_1fr] gap-2 border-b border-line p-2 text-xs last:border-b-0" key={path}>
                    <span className="font-semibold text-apex">{method}</span>
                    <span><strong>{path}</strong><br /><span className="text-neutral-500">{detail}</span></span>
                  </div>
                ))}
              </div>
              <p className="mb-2 text-sm font-medium">Tiempo real</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {realtimeEvents.map((event) => <span className="rounded-md border border-line px-2 py-1 text-xs" key={event}>{event}</span>)}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <BacklogCard title="Backlog MVP" items={mvpBacklog} />
            <BacklogCard title="Backlog avanzado" items={advancedBacklog} />
          </section>
        </div>
      ) : null}

      {view === "operacion" ? (
        <div className="space-y-5">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <article className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`} key={kpi.label}>
                  <div className="mb-3 flex items-center justify-between">
                    <Icon className="text-apex" size={18} />
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{kpi.trend}</span>
                  </div>
                  <p className="text-2xl font-semibold">{kpi.value}</p>
                  <p className="text-sm text-neutral-500">{kpi.label}</p>
                </article>
              );
            })}
          </section>

          <section className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-base font-semibold">Tareas por evento WMS</h2>
                <p className="text-sm text-neutral-500">Recibo, almacén, picking, despacho y conteo con estados propios.</p>
              </div>
              <span className="inline-flex items-center gap-2 text-sm text-emerald-600"><Radio size={16} /> tiempo real</span>
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {(["todos", "recibo", "almacen", "picking", "despacho", "conteo"] as const).map((event) => (
                <button className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm ${eventFilter === event ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700"}`} key={event} onClick={() => setEventFilter(event)} type="button">
                  <Filter size={14} />
                  {event === "todos" ? "Todos los eventos" : eventLabels[event]}
                </button>
              ))}
            </div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {taskFilters.map((filter) => (
                <button className={`h-9 shrink-0 rounded-md border px-3 text-sm ${taskFilter === filter.id ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700"}`} key={filter.id} onClick={() => setTaskFilter(filter.id)} type="button">
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="mb-4 flex flex-col gap-3 rounded-md border border-line bg-paper p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button className="h-9 rounded-md border border-line bg-white px-3 hover:bg-paper" onClick={selectFilteredTasks} type="button">
                  Seleccionar filtradas
                </button>
                <button className="h-9 rounded-md border border-line bg-white px-3 hover:bg-paper" onClick={() => setSelectedTaskIds([])} type="button">
                  Limpiar
                </button>
                <span className="text-neutral-600">{selectedTaskIds.length} seleccionadas</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select className="h-9 rounded-md border border-line bg-white px-2" value={bulkOperator} onChange={(event) => setBulkOperator(event.target.value)}>
                  {operators.map((operator) => <option key={operator}>{operator}</option>)}
                </select>
                <button className="h-9 rounded-md bg-apex px-3 text-white disabled:opacity-40" disabled={selectedTaskIds.length === 0} onClick={() => applyBulkPatch({ operator: bulkOperator })} type="button">
                  Asignar lote
                </button>
                <select className="h-9 rounded-md border border-line bg-white px-2" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as TaskStatus)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="curso">En curso</option>
                  <option value="completa">Completa</option>
                  <option value="atrasada">Atrasada</option>
                  <option value="bloqueada">Bloqueada</option>
                </select>
                <button className="h-9 rounded-md border border-line bg-white px-3 hover:bg-paper disabled:opacity-40" disabled={selectedTaskIds.length === 0} onClick={() => applyBulkPatch({ status: bulkStatus })} type="button">
                  Cambiar estado
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-neutral-600">
                    <th className="py-2 pr-3">Sel.</th>
                    <th className="py-2 pr-3">Evento</th>
                    <th className="py-2 pr-3">Tarea</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Unidad</th>
                    <th className="py-2 pr-3">Zona</th>
                    <th className="py-2 pr-3">Prioridad</th>
                    <th className="py-2 pr-3">Asignación</th>
                    <th className="py-2 pr-3">Vence</th>
                    <th className="py-2 pr-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr className="border-b border-line/70" key={task.id}>
                      <td className="py-3 pr-3">
                        <input checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTaskSelection(task.id)} type="checkbox" />
                      </td>
                      <td className="py-3 pr-3"><span className={`rounded-full px-2 py-1 text-xs ${eventColors[task.event]}`}>{eventLabels[task.event]}</span></td>
                      <td className="py-3 pr-3 font-medium">{task.id}</td>
                      <td className="py-3 pr-3">{task.type}</td>
                      <td className="py-3 pr-3">{task.container}</td>
                      <td className="py-3 pr-3">{task.zone}</td>
                      <td className="py-3 pr-3">{task.priority}</td>
                      <td className="py-3 pr-3">{task.operator}</td>
                      <td className="py-3 pr-3">{task.due}</td>
                      <td className="py-3 pr-3"><StatusBadge status={task.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {view === "layout" ? (
        <section className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
          <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-base font-semibold">Diseñador 2D del almacén</h2>
                <p className="text-sm text-neutral-500">Plano operativo para decidir dónde recibir, guardar, reponer, preparar y despachar.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm ${activeTool ? "border-apex bg-[#146C6312] text-apex" : "border-line hover:bg-paper"}`} onClick={() => setActiveTool((current) => current ? null : "zona")} type="button">
                  <Plus size={16} />
                  {activeTool ? "Colocando" : "Dibujar"}
                </button>
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={() => loadPreset("u")} type="button">
                  Flujo U
                </button>
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={() => loadPreset("i")} type="button">
                  Flujo I
                </button>
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={resetLayout} type="button">
                  <Trash2 size={16} />
                  Empezar desde cero
                </button>
              </div>
            </div>

            <div className="mb-4 grid gap-3 xl:grid-cols-[1fr_auto]">
              <input
                className="h-10 rounded-md border border-line px-3 text-sm"
                placeholder="Buscar ubicación, SKU, producto, lote, tarea..."
                value={layoutSearch}
                onChange={(event) => setLayoutSearch(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <button className="h-10 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={() => setLayoutZoom((value) => Math.max(75, value - 25))} type="button">-</button>
                <span className="w-14 text-center text-sm text-neutral-600">{layoutZoom}%</span>
                <button className="h-10 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={() => setLayoutZoom((value) => Math.min(175, value + 25))} type="button">+</button>
              </div>
            </div>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {(Object.keys(layerLabels) as LayoutLayer[]).map((layer) => (
                <button
                  className={`h-9 shrink-0 rounded-md border px-3 text-sm ${layers[layer] ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700"}`}
                  key={layer}
                  onClick={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))}
                  type="button"
                >
                  {layerLabels[layer]}
                </button>
              ))}
            </div>

            <SmartWarehouseGrid
              layers={layers}
              locations={highlightedLocations}
              selectedLocationCode={selectedLocationCode}
              onSelectLocation={(location) => {
                setSelectedLocationCode(location.code);
                setSelectedZoneId(location.zoneId);
                setSelectedAssetId(null);
              }}
            />

            <button
              className={`hidden relative min-h-[560px] w-full overflow-hidden rounded-md border text-left ${activeTool ? "cursor-crosshair ring-2 ring-apex/30" : "cursor-default"} ${dark ? "border-neutral-800 bg-neutral-900" : "border-line bg-[#f7f7f4]"}`}
              onClick={(event) => {
                if (!activeTool) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                if (activeTool === "zona") addZoneAt(x, y);
                else addAssetAt(activeTool, x, y);
              }}
              onPointerLeave={() => setDragging(null)}
              onPointerMove={(event) => {
                if (!dragging) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                moveLayoutObject(dragging, x, y);
              }}
              onPointerUp={() => setDragging(null)}
              type="button"
            >
              <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(#e3e0d7 1px, transparent 1px), linear-gradient(90deg, #e3e0d7 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
              <div className="absolute inset-x-0 top-0 h-8 border-b border-neutral-300/70 bg-white/55" />
              <div className="absolute inset-y-0 left-0 w-8 border-r border-neutral-300/70 bg-white/55" />
              <div className="absolute inset-0" style={{ transform: `scale(${layoutZoom / 100})`, transformOrigin: "top left" }}>
              <div className="absolute left-3 top-3 z-20 rounded-md border border-line bg-white/95 px-3 py-2 text-xs text-neutral-700 shadow-sm">
                {activeTool ? `Coloca: ${layoutTools.find((tool) => tool.id === activeTool)?.label}` : selectedLocation ? `Siguiente: atender ${selectedLocation.code}` : "Busca, selecciona y ejecuta"}
              </div>
              {layers.estructura ? assets.map((asset) => (
                <span
                  className={`absolute z-10 ${selectedAssetId === asset.id ? "ring-2 ring-apex" : ""}`}
                  key={asset.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedAssetId(asset.id);
                    setSelectedZoneId(0);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedAssetId(asset.id);
                    setSelectedZoneId(0);
                    setDragging({ kind: "asset", id: asset.id });
                  }}
                  style={{ left: `${asset.x}%`, top: `${asset.y}%`, width: `${asset.w}%`, height: `${asset.h}%`, transform: `rotate(${asset.rotation || 0}deg)` }}
                >
                  <LayoutAssetShape asset={asset} />
                </span>
              )) : null}
              {zones.map((zone) => (
                <span
                  className={`absolute rounded-md border p-2 text-left shadow-sm transition hover:z-10 hover:-translate-y-0.5 ${zoneVisualClass(zone, selectedZoneId === zone.id)}`}
                  key={zone.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedZoneId(zone.id);
                    setSelectedAssetId(null);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedZoneId(zone.id);
                    setSelectedAssetId(null);
                    setDragging({ kind: "zone", id: zone.id });
                  }}
                  style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
                >
                  <span className="block text-xs font-semibold">{zone.code}</span>
                  <span className="block text-[11px] leading-tight">{zone.name}</span>
                  <span className="absolute bottom-2 right-2 rounded border border-neutral-300 bg-white/80 px-1.5 py-0.5 text-[10px] text-neutral-700">{zone.occupancy}%</span>
                </span>
              ))}
              {highlightedLocations.map((location) => (
                <span
                  className={`absolute z-20 rounded-sm border shadow-sm ${locationVisualClass(location, layers)} ${selectedLocationCode === location.code ? "ring-2 ring-apex ring-offset-1" : ""}`}
                  key={location.code}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedLocationCode(location.code);
                    setSelectedZoneId(location.zoneId);
                    setSelectedAssetId(null);
                  }}
                  style={{ left: `${location.x}%`, top: `${location.y}%`, width: "3.2%", height: "4.5%" }}
                  title={`${location.code}\n${location.product}\nSKU ${location.sku}\nCantidad ${location.qty}\nOcupación ${location.occupancy}%\nABC ${location.abc}\nEstado ${location.status}\nTareas ${location.activeTasks}`}
                >
                  {layers.ocupacion ? <span className="absolute bottom-0 left-0 h-1 bg-apex/70" style={{ width: `${location.occupancy}%` }} /> : null}
                  {layers.productos ? <span className="absolute left-[3px] top-[2px] max-w-[92%] truncate text-[8px] font-semibold leading-none">{location.sku}</span> : null}
                  {layers.tareas && location.activeTasks > 0 ? <span className="absolute -right-1 -top-1 h-3 min-w-3 rounded-full bg-neutral-950 px-1 text-center text-[8px] text-white">{location.activeTasks}</span> : null}
                  {layers.alertas && ["alerta", "bloqueada", "cuarentena"].includes(location.status) ? <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border border-white bg-amber-500" /> : null}
                  {layers.capacidad ? <span className="absolute bottom-1 right-1 text-[7px] font-bold">{location.occupancy}%</span> : null}
                </span>
              ))}
              {zones.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
                  {activeTool ? "Haz clic en el plano para crear el primer elemento." : "Activa Dibujar o carga un preset."}
                </div>
              ) : null}
              </div>
            </button>
          </div>

          <aside className={`space-y-3 rounded-md border p-3 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <div>
              <h2 className="text-base font-semibold">Qué hacer ahora</h2>
              <p className="text-sm text-neutral-500">{selectedLocation ? selectedLocation.product : "Selecciona una ubicación para ver el siguiente paso."}</p>
            </div>
            <div className="rounded-md border border-line bg-paper p-3 text-sm">
              <p className="text-xs font-semibold uppercase text-neutral-500">Acción sugerida</p>
              <p className="mt-1 font-medium">{selectedLocation ? nextLocationAction(selectedLocation) : "Buscar ubicación, SKU o tarea"}</p>
              {selectedLocation ? (
                <p className="mt-1 text-xs text-neutral-500">{selectedLocation.code} · {selectedLocation.qty}/{selectedLocation.capacityUnits} unidades · {selectedLocation.activeTasks} tareas</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <PanelButton icon={Plus} label="Herramientas" detail={activeTool ? `Colocando ${layoutTools.find((tool) => tool.id === activeTool)?.label}` : "Zonas, racks, muelles, equipos"} onClick={() => setConfigModal("herramientas")} />
              <PanelButton icon={Map} label="Capas" detail={`${Object.values(layers).filter(Boolean).length} capas visibles`} onClick={() => setConfigModal("capas")} />
              <PanelButton icon={Warehouse} label="Zona" detail={selectedZone ? `${selectedZone.code} · ${selectedZone.name}` : "Selecciona una zona"} onClick={() => setConfigModal("zona")} disabled={!selectedZone} />
              <PanelButton icon={Package} label="Ubicación" detail={selectedLocation ? `${selectedLocation.sku} · ${selectedLocation.occupancy}%` : "Selecciona una ubicación"} onClick={() => setConfigModal("ubicacion")} disabled={!selectedLocation} />
              <PanelButton icon={Truck} label="Elemento" detail={selectedAsset ? selectedAsset.label : "Camión, rack, puerta o equipo"} onClick={() => setConfigModal("elemento")} disabled={!selectedAsset} />
            </div>
            <div className="grid gap-2 rounded-md border border-line bg-paper p-3 text-sm">
              <MetricRow label="Zonas" value={String(zones.length)} />
              <MetricRow label="Ubicaciones" value={String(locations.length)} />
              <MetricRow label="Coincidencias" value={String(highlightedLocations.length)} />
              <MetricRow label="Activas" value={String(locations.filter((location) => location.activeTasks > 0).length)} />
            </div>
            <div className="grid gap-2">
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex text-sm text-white disabled:opacity-40" onClick={generateLocationsForZone} type="button" disabled={!selectedZone}>
                <Boxes size={16} />
                Generar ubicaciones
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => loadPreset("u")} type="button">Flujo U</button>
                <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => loadPreset("i")} type="button">Flujo I</button>
              </div>
            </div>
          </aside>
        </section>
      ) : null}

      {view === "reglas" ? (
        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <h2 className="mb-4 text-base font-semibold">{editingRuleId ? "Editar regla" : "Crear regla"}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Nombre" value={ruleForm.name} onChange={(value) => setRuleForm((current) => ({ ...current, name: value }))} />
              <SelectField label="Evento" value={ruleForm.event} options={Object.keys(eventLabels)} onChange={(value) => setRuleForm((current) => ({ ...current, event: value as WmsEvent }))} />
              <TextField label="Disparador" value={ruleForm.trigger} onChange={(value) => setRuleForm((current) => ({ ...current, trigger: value }))} />
              <TextField label="Agrupar por" value={ruleForm.groupBy} onChange={(value) => setRuleForm((current) => ({ ...current, groupBy: value }))} />
              <TextField label="Prioridad" value={ruleForm.priority} onChange={(value) => setRuleForm((current) => ({ ...current, priority: value }))} />
              <TextField label="Método" value={ruleForm.method} onChange={(value) => setRuleForm((current) => ({ ...current, method: value }))} />
            </div>
            <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm text-white" onClick={saveRule} type="button">
              <Plus size={16} />
              {editingRuleId ? "Guardar cambios" : "Crear regla"}
            </button>
          </div>

          <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <h2 className="mb-4 text-base font-semibold">Reglas configuradas</h2>
            <div className="grid gap-3">
              {rules.map((rule) => (
                <div className={`rounded-md border p-3 ${dark ? "border-neutral-800" : "border-line"}`} key={rule.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{rule.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">{eventLabels[rule.event]} · {rule.trigger} · agrupa por {rule.groupBy} · {rule.method}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => editRule(rule)} type="button" title="Editar">
                        <Edit3 size={15} />
                      </button>
                      <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))} type="button" title="Eliminar">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {view === "conteo" ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <h2 className="mb-4 text-base font-semibold">Métodos de control de inventario</h2>
            <div className="grid gap-3">
              {countMethods.map((method) => (
                <div className={`rounded-md border p-3 ${dark ? "border-neutral-800" : "border-line"}`} key={method.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{method.name}</p>
                      <p className="text-xs text-neutral-500">{method.cadence}</p>
                    </div>
                    <button className={`rounded-full px-2 py-1 text-xs ${method.enabled ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`} onClick={() => setCountMethods((current) => current.map((item) => item.id === method.id ? { ...item, enabled: !item.enabled } : item))} type="button">
                      {method.enabled ? "activo" : "apagado"}
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-neutral-500 md:grid-cols-2">
                    <span>Alcance: {method.scope}</span>
                    <span>Tolerancia: {method.tolerance}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <h2 className="mb-4 text-base font-semibold">Unidades de manipulación</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {handlingUnits.map((unit) => (
                <div className={`rounded-md border p-3 ${dark ? "border-neutral-800" : "border-line"}`} key={unit.code}>
                  <p className="text-sm font-medium">{unit.name}</p>
                  <p className="text-xs text-neutral-500">{unit.code} · {unit.use}</p>
                  <p className="mt-1 text-xs font-medium">{unit.capacity}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {view === "mobile" ? (
        <section className="grid gap-4 xl:grid-cols-[0.65fr_1.35fr]">
          <div className="mx-auto w-full max-w-sm rounded-[28px] border-8 border-neutral-900 bg-neutral-950 p-4 text-white shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">APEX WMS</span>
              <span className="rounded-full bg-emerald-500 px-2 py-1 text-xs">offline ok</span>
            </div>
            <div className="rounded-md bg-white p-3 text-neutral-900">
              <p className="text-xs text-neutral-500">Evento actual</p>
              <p className="text-2xl font-semibold">Picking</p>
              <p className="text-sm">Tote T-004 · Cliente XXXXX</p>
            </div>
            <div className="mt-4 space-y-2">
              {mobileSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div className="flex items-center gap-3 rounded-md bg-neutral-900 p-3" key={step.label}>
                    <Icon className="text-emerald-300" size={18} />
                    <div>
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs text-neutral-400">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="mt-4 h-12 w-full rounded-md bg-emerald-400 text-sm font-semibold text-neutral-950" type="button">
              Confirmar scan
            </button>
          </div>

          <div className={`rounded-md border p-4 ${dark ? "border-neutral-800 bg-neutral-950" : "border-line bg-white"}`}>
            <h2 className="mb-4 text-base font-semibold">Flujo móvil por evento</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["Recibo", "scan ASN/OC, unidad, lote, cantidad, daño y ubicación temporal."],
                ["Almacén", "putaway, movimientos internos, transferencias y reubicaciones."],
                ["Picking", "olas, batches, contenedores, sustitutos y parciales."],
                ["Despacho", "packing, consolidación, muelle, ruta y prueba de entrega."],
                ["Conteo", "conteo ciego, conteo cíclico, tolerancias y ajuste controlado."],
                ["Excepciones", "faltante, daño, bloqueo, peso distinto, unidad incompatible."]
              ].map(([title, detail]) => (
                <div className={`rounded-md border p-3 ${dark ? "border-neutral-800" : "border-line"}`} key={title}>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs text-neutral-500">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {configModal ? (
        <ConfigModalFrame
          title={{
            herramientas: "Herramientas del layout",
            capas: "Capas visuales",
            zona: "Configurar zona",
            ubicacion: "Ubicación viva",
            elemento: "Configurar elemento"
          }[configModal]}
          onClose={() => setConfigModal(null)}
        >
          {configModal === "herramientas" ? (
            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {layoutTools.map((tool) => (
                  <button
                    className={`rounded-md border p-3 text-left text-sm ${activeTool === tool.id ? "border-apex bg-[#146C6312] text-apex" : "border-line hover:bg-paper"}`}
                    key={tool.id}
                    onClick={() => {
                      setActiveTool(tool.id);
                      setConfigModal(null);
                    }}
                    title={tool.hint}
                    type="button"
                  >
                    <span className="block font-medium">{tool.label}</span>
                    <span className="block text-xs text-neutral-500">{tool.hint}</span>
                  </button>
                ))}
              </div>
              <div className="rounded-md border border-line p-3">
                <h3 className="mb-3 text-sm font-semibold">Zona base para creación rápida</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input className="h-10 rounded-md border border-line px-3 text-sm" value={newZone.code} onChange={(event) => setNewZone((current) => ({ ...current, code: event.target.value }))} placeholder="Código" />
                  <input className="h-10 rounded-md border border-line px-3 text-sm" value={newZone.name} onChange={(event) => setNewZone((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre" />
                  <select className="h-10 rounded-md border border-line px-3 text-sm" value={newZone.type} onChange={(event) => setNewZone((current) => ({ ...current, type: event.target.value }))}>
                    {["recibo", "staging", "reserva", "picking", "packing", "despacho", "cuarentena", "devoluciones"].map((type) => <option key={type}>{type}</option>)}
                  </select>
                </div>
                <button className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm text-white" onClick={addZone} type="button">
                  <Plus size={16} />
                  Agregar zona
                </button>
              </div>
            </div>
          ) : null}

          {configModal === "capas" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(layerLabels) as LayoutLayer[]).map((layer) => (
                <button
                  className={`rounded-md border p-3 text-left text-sm ${layers[layer] ? "border-apex bg-[#146C6312] text-apex" : "border-line hover:bg-paper"}`}
                  key={layer}
                  onClick={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))}
                  type="button"
                >
                  <span className="block font-medium">{layerLabels[layer]}</span>
                  <span className="block text-xs text-neutral-500">{layers[layer] ? "Visible en el mapa" : "Oculta"}</span>
                </button>
              ))}
            </div>
          ) : null}

          {configModal === "zona" && selectedZone ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <TextField label="Código" value={selectedZone.code} onChange={(value) => updateSelectedZone({ code: value.toUpperCase().slice(0, 4) })} />
                <TextField label="Nombre" value={selectedZone.name} onChange={(value) => updateSelectedZone({ name: value })} />
                <SelectField label="Tipo" value={selectedZone.type} options={["recibo", "staging", "reserva", "picking", "packing", "despacho", "cuarentena", "devoluciones"]} onChange={(value) => updateSelectedZone({ type: value })} />
                <SelectField label="Prioridad picking" value={selectedZone.pickingPriority || "media"} options={["alta", "media", "baja"]} onChange={(value) => updateSelectedZone({ pickingPriority: value as WarehouseZone["pickingPriority"] })} />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <NumberField label="X %" value={selectedZone.x} min={0} max={95} onChange={(value) => updateSelectedZone({ x: value })} />
                <NumberField label="Y %" value={selectedZone.y} min={0} max={95} onChange={(value) => updateSelectedZone({ y: value })} />
                <NumberField label="Ancho %" value={selectedZone.w} min={6} max={95} onChange={(value) => updateSelectedZone({ w: value })} />
                <NumberField label="Alto %" value={selectedZone.h} min={6} max={95} onChange={(value) => updateSelectedZone({ h: value })} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <NumberField label="Cap. unidades" value={selectedZone.capacityUnits || 0} min={0} max={99999} onChange={(value) => updateSelectedZone({ capacityUnits: value })} />
                <NumberField label="Cap. kg" value={selectedZone.capacityKg || 0} min={0} max={99999} onChange={(value) => updateSelectedZone({ capacityKg: value })} />
                <NumberField label="Cap. m3" value={selectedZone.capacityM3 || 0} min={0} max={99999} onChange={(value) => updateSelectedZone({ capacityM3: value })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <button className="h-10 rounded-md bg-apex text-sm text-white" onClick={generateLocationsForZone} type="button">Generar ubic.</button>
                <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => bulkUpdateZoneLocations({ status: "bloqueada" })} type="button">Bloquear</button>
                <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => bulkUpdateZoneLocations({ status: "disponible" })} type="button">Liberar</button>
                <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => bulkUpdateZoneLocations({ abc: "A" })} type="button">ABC A</button>
                <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={deleteSelectedZone} type="button">Eliminar</button>
              </div>
            </div>
          ) : null}

          {configModal === "ubicacion" && selectedLocation ? (
            <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-md border border-line p-3 text-sm">
                <p className="font-semibold">{selectedLocation.code}</p>
                <p className="mt-1 text-neutral-600">{selectedLocation.product}</p>
                <div className="mt-3 space-y-2">
                  <MetricRow label="SKU" value={selectedLocation.sku} />
                  <MetricRow label="Cantidad" value={`${selectedLocation.qty} und`} />
                  <MetricRow label="Ocupación" value={`${selectedLocation.occupancy}%`} />
                  <MetricRow label="ABC" value={selectedLocation.abc} />
                  <MetricRow label="Estado" value={selectedLocation.status} />
                  <MetricRow label="Tareas" value={String(selectedLocation.activeTasks)} />
                  {selectedLocation.expires ? <MetricRow label="Vence" value={selectedLocation.expires} /> : null}
                </div>
              </div>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Estado" value={selectedLocation.status} options={["vacia", "disponible", "llena", "bloqueada", "cuarentena", "alerta"]} onChange={(value) => updateSelectedLocation({ status: value as VisualLocation["status"] })} />
                  <SelectField label="ABC" value={selectedLocation.abc} options={["A", "B", "C"]} onChange={(value) => updateSelectedLocation({ abc: value as VisualLocation["abc"] })} />
                  <NumberField label="Ocupación %" value={selectedLocation.occupancy} min={0} max={100} onChange={(value) => updateSelectedLocation({ occupancy: value })} />
                  <NumberField label="Cap. unidades" value={selectedLocation.capacityUnits} min={0} max={99999} onChange={(value) => updateSelectedLocation({ capacityUnits: value })} />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => updateSelectedLocation({ status: "bloqueada" })} type="button">Bloquear</button>
                  <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => updateSelectedLocation({ status: "disponible" })} type="button">Liberar</button>
                  <button className="h-10 rounded-md border border-line text-sm hover:bg-paper" onClick={() => updateSelectedLocation({ activeTasks: selectedLocation.activeTasks + 1 })} type="button">Crear tarea</button>
                </div>
              </div>
            </div>
          ) : null}

          {configModal === "elemento" && selectedAsset ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <TextField label="Etiqueta" value={selectedAsset.label} onChange={(value) => updateSelectedAsset({ label: value })} />
                <SelectField label="Tipo" value={selectedAsset.kind} options={layoutTools.filter((tool) => tool.id !== "zona").map((tool) => tool.id)} onChange={(value) => updateSelectedAsset({ kind: value as LayoutAsset["kind"] })} />
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                <NumberField label="X %" value={selectedAsset.x} min={-10} max={105} onChange={(value) => updateSelectedAsset({ x: value })} />
                <NumberField label="Y %" value={selectedAsset.y} min={-10} max={105} onChange={(value) => updateSelectedAsset({ y: value })} />
                <NumberField label="Ancho %" value={selectedAsset.w} min={3} max={95} onChange={(value) => updateSelectedAsset({ w: value })} />
                <NumberField label="Alto %" value={selectedAsset.h} min={3} max={95} onChange={(value) => updateSelectedAsset({ h: value })} />
                <SelectField label="Rotación" value={String(selectedAsset.rotation || 0)} options={["0", "90", "180", "270"]} onChange={(value) => updateSelectedAsset({ rotation: Number(value) as LayoutAsset["rotation"] })} />
              </div>
              <button className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={deleteSelectedAsset} type="button">
                <Trash2 size={16} />
                Eliminar elemento
              </button>
            </div>
          ) : null}
        </ConfigModalFrame>
      ) : null}
    </div>
  );
}

function WorkflowGuide({ guide }: { guide: { title: string; goal: string; steps: string[]; next: string } }) {
  return (
    <section className="grid gap-3 rounded-md border border-line bg-white p-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <p className="text-sm font-semibold text-apex">{guide.title}</p>
        <p className="mt-1 text-sm text-neutral-600">{guide.goal}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {guide.steps.map((step, index) => (
            <span className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-paper px-2.5 text-xs text-neutral-700" key={step}>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white text-[11px] font-semibold text-apex">{index + 1}</span>
              {step}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm">
        <span className="block text-xs font-semibold uppercase text-neutral-500">Siguiente</span>
        <span className="font-medium">{guide.next}</span>
      </div>
    </section>
  );
}

function SmartWarehouseGrid({
  layers,
  locations,
  selectedLocationCode,
  onSelectLocation
}: {
  layers: Record<LayoutLayer, boolean>;
  locations: VisualLocation[];
  selectedLocationCode: string;
  onSelectLocation: (location: VisualLocation) => void;
}) {
  const locationByCode = new globalThis.Map(locations.map((location) => [location.code, location]));
  const quickFind = (prefixes: string[]) => locations.find((location) => prefixes.some((prefix) => location.code.startsWith(prefix)));

  return (
    <section className="rounded-md border border-line bg-[#f7f7f4] p-3">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold">Cuadrícula inteligente</p>
          <p className="text-xs text-neutral-500">Cada casilla es una ubicación física. Filtra, selecciona y configura como piezas de LEGO.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <LegendDot label="Libre" className="bg-white" />
          <LegendDot label="Ocupada" className="bg-neutral-300" />
          <LegendDot label="Llena" className="bg-neutral-600" />
          <LegendDot label="Alerta" className="bg-amber-300" />
          <LegendDot label="Tarea" className="bg-neutral-950" />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_180px]">
        <div className="space-y-3">
          <div className="grid grid-cols-[92px_1fr_120px] gap-2">
            <ZoneBlock label="Recibo" detail="Muelle + staging" location={quickFind(["REC", "STG"])} onSelectLocation={onSelectLocation} />
            <div className="rounded-md border border-line bg-white p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Reserva pallet</p>
              <RackMatrix zoneLabel="RSV" zoneId={4} rows={4} cols={14} locationByCode={locationByCode} locations={locations} selectedLocationCode={selectedLocationCode} onSelectLocation={onSelectLocation} layers={layers} />
            </div>
            <ZoneBlock label="Cuarentena" detail="QA" location={quickFind(["QAR"])} onSelectLocation={onSelectLocation} />
          </div>

          <AisleLabel label="Pasillo principal de tránsito seguro" />

          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <div className="rounded-md border border-line bg-white p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Forward picking</p>
              <RackMatrix zoneLabel="PCK" zoneId={5} rows={4} cols={12} locationByCode={locationByCode} locations={locations} selectedLocationCode={selectedLocationCode} onSelectLocation={onSelectLocation} layers={layers} />
            </div>
            <div className="space-y-3">
              <div className="rounded-md border border-line bg-white p-2">
                <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Packing / alistamiento</p>
                <RackMatrix zoneLabel="PAC" zoneId={6} rows={3} cols={6} locationByCode={locationByCode} locations={locations} selectedLocationCode={selectedLocationCode} onSelectLocation={onSelectLocation} layers={layers} />
              </div>
              <ZoneBlock label="Oficinas" detail="Soporte operativo" />
            </div>
          </div>

          <AisleLabel label="Pasillo de despacho" />

          <div className="rounded-md border border-line bg-white p-2">
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Despacho y rutas</p>
            <RackMatrix zoneLabel="DSP" zoneId={7} rows={2} cols={16} locationByCode={locationByCode} locations={locations} selectedLocationCode={selectedLocationCode} onSelectLocation={onSelectLocation} layers={layers} />
          </div>
        </div>

        <aside className="space-y-2">
          <DockLane title="Muelle despacho" location={quickFind(["DSP"])} onSelectLocation={onSelectLocation} />
          <DockLane title="Muelle recibo" location={quickFind(["REC", "STG"])} onSelectLocation={onSelectLocation} />
          <div className="rounded-md border border-dashed border-neutral-400 bg-white p-3 text-xs text-neutral-600">
            Las filas representan racks o bloques físicos. La codificación sigue zona, módulo, nivel y ubicación.
          </div>
        </aside>
      </div>
    </section>
  );
}

function RackMatrix({
  zoneLabel,
  zoneId,
  rows,
  cols,
  locationByCode,
  locations,
  selectedLocationCode,
  onSelectLocation,
  layers
}: {
  zoneLabel: string;
  zoneId: number;
  rows: number;
  cols: number;
  locationByCode: Map<string, VisualLocation>;
  locations: VisualLocation[];
  selectedLocationCode: string;
  onSelectLocation: (location: VisualLocation) => void;
  layers: Record<LayoutLayer, boolean>;
}) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div className="grid gap-1" key={`${zoneLabel}-${rowIndex}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, colIndex) => {
            const code = `${zoneLabel}-M${String(colIndex + 1).padStart(2, "0")}-N${rowIndex + 1}-U01`;
            const location = locationByCode.get(code) || findNearestLocation(locations, zoneId, rowIndex, colIndex, cols);
            const selected = location?.code === selectedLocationCode;
            return (
              <LocationCell
                code={code}
                key={`${zoneLabel}-${rowIndex}-${colIndex}`}
                layers={layers}
                location={location}
                selected={selected}
                onSelectLocation={onSelectLocation}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function LocationCell({
  code,
  location,
  selected,
  layers,
  onSelectLocation
}: {
  code: string;
  location?: VisualLocation;
  selected: boolean;
  layers: Record<LayoutLayer, boolean>;
  onSelectLocation: (location: VisualLocation) => void;
}) {
  const className = location ? locationVisualClass(location, layers) : "border-neutral-300 bg-white text-neutral-400";
  return (
    <button
      className={`relative aspect-square min-h-8 rounded-sm border text-[9px] font-semibold leading-none transition hover:border-apex hover:bg-[#146C6312] ${className} ${selected ? "ring-2 ring-apex ring-offset-1" : ""}`}
      disabled={!location}
      onClick={() => location ? onSelectLocation(location) : undefined}
      title={location ? `${location.code}\n${location.product}\n${location.qty}/${location.capacityUnits}` : code}
      type="button"
    >
      <span className="absolute left-1 top-1">{cellShortCode(location?.code || code)}</span>
      {location && layers.ocupacion ? <span className="absolute inset-x-1 bottom-1 h-1 rounded bg-apex/70" style={{ width: `calc(${Math.max(8, location.occupancy)}% - 0.5rem)` }} /> : null}
      {location && layers.tareas && location.activeTasks > 0 ? <span className="absolute -right-1 -top-1 h-3 min-w-3 rounded-full bg-neutral-950 px-1 text-[8px] text-white">{location.activeTasks}</span> : null}
      {location && layers.alertas && ["alerta", "bloqueada", "cuarentena"].includes(location.status) ? <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border border-white bg-amber-500" /> : null}
    </button>
  );
}

function ZoneBlock({ label, detail, location, onSelectLocation }: { label: string; detail: string; location?: VisualLocation; onSelectLocation?: (location: VisualLocation) => void }) {
  return (
    <button
      className="min-h-24 rounded-md border border-line bg-white p-2 text-left text-xs hover:border-apex disabled:hover:border-line"
      disabled={!location}
      onClick={() => location && onSelectLocation?.(location)}
      type="button"
    >
      <span className="block font-semibold text-neutral-800">{label}</span>
      <span className="mt-1 block text-neutral-500">{detail}</span>
      {location ? <span className="mt-3 block rounded bg-paper px-2 py-1 font-medium text-neutral-700">{location.code}</span> : null}
    </button>
  );
}

function DockLane({ title, location, onSelectLocation }: { title: string; location?: VisualLocation; onSelectLocation: (location: VisualLocation) => void }) {
  return (
    <button
      className="min-h-28 w-full rounded-md border border-line bg-white p-3 text-left text-xs hover:border-apex disabled:hover:border-line"
      disabled={!location}
      onClick={() => location ? onSelectLocation(location) : undefined}
      type="button"
    >
      <span className="block font-semibold">{title}</span>
      <span className="mt-2 block h-10 rounded border-2 border-dashed border-neutral-300 bg-paper" />
      <span className="mt-2 block text-neutral-500">{location ? nextLocationAction(location) : "Sin tarea activa"}</span>
    </button>
  );
}

function AisleLabel({ label }: { label: string }) {
  return (
    <div className="flex h-8 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white text-xs font-medium uppercase text-neutral-500">
      {label}
    </div>
  );
}

function LegendDot({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2 py-1">
      <span className={`h-2.5 w-2.5 rounded-sm border border-neutral-300 ${className}`} />
      {label}
    </span>
  );
}

function cellShortCode(code: string) {
  const match = code.match(/M(\d+)-N(\d+)/);
  if (!match) return code.slice(0, 4);
  return `${Number(match[1])}.${match[2]}`;
}

function findNearestLocation(locations: VisualLocation[], zoneId: number, rowIndex: number, colIndex: number, cols: number) {
  const zoneLocations = locations.filter((location) => location.zoneId === zoneId);
  if (!zoneLocations.length) return undefined;
  const index = rowIndex * cols + colIndex;
  if (index >= zoneLocations.length) return undefined;
  return zoneLocations[index];
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const labels: Record<TaskStatus, string> = {
    pendiente: "Pendiente",
    curso: "En curso",
    completa: "Completa",
    atrasada: "Atrasada",
    bloqueada: "Bloqueada"
  };
  const classes: Record<TaskStatus, string> = {
    pendiente: "bg-neutral-100 text-neutral-700",
    curso: "bg-neutral-100 text-neutral-700",
    completa: "bg-neutral-100 text-neutral-700",
    atrasada: "bg-amber-50 text-amber-800",
    bloqueada: "bg-amber-50 text-amber-700"
  };
  return <span className={`rounded-full px-2 py-1 text-xs ${classes[status]}`}>{labels[status]}</span>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2">
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function FlowColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md bg-paper p-2">
      <p className="mb-2 text-xs font-semibold text-neutral-600">{title}</p>
      <div className="space-y-1">
        {items.map((item) => (
          <p className="rounded-sm bg-white px-2 py-1 text-xs" key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function EntityCard({ title, fields }: { title: string; fields: string[] }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="flex flex-wrap gap-1">
        {fields.map((field) => (
          <span className="rounded bg-paper px-2 py-1 text-[11px] text-neutral-700" key={field}>{field}</span>
        ))}
      </div>
    </div>
  );
}

function BacklogCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-md border border-line bg-white p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="grid gap-2">
        {items.map((item) => (
          <div className="flex gap-2 rounded-md border border-line p-2 text-sm" key={item}>
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-apex" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PanelButton({ icon: Icon, label, detail, disabled, onClick }: { icon: LucideIcon; label: string; detail: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className="flex min-h-16 items-center gap-3 rounded-md border border-line bg-white p-3 text-left text-sm hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#146C6312] text-apex">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block truncate text-xs text-neutral-500">{detail}</span>
      </span>
    </button>
  );
}

function ConfigModalFrame({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <section className="max-h-[88vh] w-full max-w-4xl overflow-auto rounded-md border border-line bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="h-9 rounded-md border border-line px-3 text-sm hover:bg-paper" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      {label}
      <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function zoneVisualClass(zone: WarehouseZone, selected: boolean) {
  const selectedClass = selected ? "border-apex ring-2 ring-apex/30" : "border-neutral-300";
  const occupancyClass = zone.occupancy >= 85 ? "bg-neutral-300 text-neutral-950" : zone.occupancy >= 65 ? "bg-neutral-200 text-neutral-900" : "bg-white text-neutral-800";
  return `${selectedClass} ${occupancyClass}`;
}

function nextLocationAction(location: VisualLocation) {
  if (location.status === "bloqueada") return "Resolver bloqueo antes de mover inventario";
  if (location.status === "cuarentena") return "Validar calidad o liberar lote";
  if (location.status === "alerta") return "Revisar tarea atrasada o congestión";
  if (location.status === "vacia") return "Confirmar vacío y sugerir reposición";
  if (location.occupancy >= 90) return "Evitar más ingreso y priorizar salida";
  if (location.activeTasks > 0) return "Ejecutar tarea activa en mobile";
  return "Ubicación disponible para operación";
}

function locationVisualClass(location: VisualLocation, layers: Record<LayoutLayer, boolean>) {
  if (layers.estado) {
    if (location.status === "vacia") return "border-neutral-300 bg-white text-neutral-700";
    if (location.status === "bloqueada") return "border-neutral-950 bg-neutral-900 text-white";
    if (location.status === "cuarentena") return "border-amber-700 bg-amber-100 text-amber-950";
    if (location.status === "alerta") return "border-amber-600 bg-amber-200 text-neutral-950";
    if (location.status === "llena") return "border-neutral-700 bg-neutral-500 text-white";
  }

  if (layers.abc) {
    if (location.abc === "A") return "border-neutral-950 bg-neutral-800 text-white";
    if (location.abc === "B") return "border-neutral-600 bg-neutral-300 text-neutral-950";
    return "border-neutral-400 bg-white text-neutral-700";
  }

  if (layers.ocupacion) {
    if (location.occupancy === 0) return "border-neutral-300 bg-white text-neutral-700";
    if (location.occupancy >= 90) return "border-neutral-800 bg-neutral-600 text-white";
    if (location.occupancy >= 60) return "border-neutral-500 bg-neutral-300 text-neutral-950";
    return "border-neutral-300 bg-neutral-100 text-neutral-700";
  }

  return "border-neutral-400 bg-white text-neutral-700";
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input
        className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm"
        max={max}
        min={min}
        type="number"
        value={Math.round(value)}
        onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))}
      />
    </label>
  );
}

function LayoutAssetShape({ asset }: { asset: LayoutAsset }) {
  if (asset.kind === "rack") {
    return (
      <span className="block h-full w-full rounded-sm border border-neutral-600 bg-neutral-500/90 p-1 shadow-sm">
        <span className="grid h-full grid-cols-6 gap-1">
          {Array.from({ length: 12 }, (_, index) => <span className="rounded-sm bg-white/70" key={index} />)}
        </span>
        <span className="absolute -top-4 left-0 text-[10px] font-semibold text-neutral-700">{asset.label}</span>
      </span>
    );
  }

  if (asset.kind === "camion") {
    return (
      <span className="block h-full w-full rounded-sm bg-neutral-800 shadow-md">
        <span className="absolute right-0 top-0 h-full w-[28%] rounded-r-sm bg-neutral-500" />
        <span className="absolute left-2 top-1/2 h-[46%] w-[52%] -translate-y-1/2 rounded-sm bg-white" />
        <span className="absolute bottom-[-4px] left-[18%] h-2 w-2 rounded-full bg-neutral-950" />
        <span className="absolute bottom-[-4px] right-[22%] h-2 w-2 rounded-full bg-neutral-950" />
      </span>
    );
  }

  if (asset.kind === "muelle") {
    return (
      <span className="flex h-full w-full items-center justify-center rounded-sm border-2 border-dashed border-neutral-700 bg-neutral-200 text-[10px] font-semibold text-neutral-700">
        DOCK
      </span>
    );
  }

  if (asset.kind === "montacargas") {
    return (
      <span className="block h-full w-full">
        <span className="absolute bottom-1 left-1 h-[55%] w-[58%] rounded-sm bg-neutral-600" />
        <span className="absolute right-1 top-1 h-[78%] w-[16%] bg-neutral-800" />
        <span className="absolute bottom-0 left-1 h-2 w-2 rounded-full bg-neutral-950" />
        <span className="absolute bottom-0 right-2 h-2 w-2 rounded-full bg-neutral-950" />
      </span>
    );
  }

  if (asset.kind === "flujo") {
    return (
      <span className="flex h-full w-full items-center">
        <span className="h-1 flex-1 rounded-full bg-apex" />
        <span className="h-0 w-0 border-y-[8px] border-l-[14px] border-y-transparent border-l-apex" />
        <span className="absolute -top-4 left-0 text-[10px] font-semibold text-apex">{asset.label}</span>
      </span>
    );
  }

  if (asset.kind === "oficina") {
    return (
      <span className="flex h-full w-full items-center justify-center rounded-sm border border-neutral-400 bg-white/90 text-[10px] font-semibold text-neutral-700 shadow-sm">
        {asset.label}
      </span>
    );
  }

  if (asset.kind === "puerta") {
    return <span className="block h-full w-full rounded-sm bg-neutral-900 shadow-sm" />;
  }

  return (
    <span className="flex h-full w-full items-center justify-center rounded-md border border-neutral-400 bg-white/80 text-[10px] font-semibold text-neutral-700">
      {asset.label}
    </span>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-2">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
