"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";
import { api, isServiceTechnicianSession } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Download,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wrench
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const OFFLINE_DISCOVERY_ENABLED =
  process.env.NEXT_PUBLIC_OFFLINE_DISCOVERY_ENABLED === "true";
const OfflineTechnicianPanel = dynamic(
  () => import("@/components/offline/OfflineTechnicianPanel"),
  { ssr: false }
);

type ServiceReference = { id: number | string; code: string; name: string };
type Technician = { id: number | string; code?: string; user?: { name?: string; email?: string } };
type ServiceType = { code: string; label: string; active?: boolean };
type ServiceStore = { code: string; label: string; active?: boolean };
type ServiceOrderItem = { id?: number | string; reference_id: number | string; reference?: ServiceReference | null; service_type: string; quantity: number; observation?: string; status?: string; version?: number; legacy?: boolean };
type ServiceOrder = {
  id: number | string;
  number: string;
  reference_id?: number | string;
  reference: ServiceReference | null;
  technician?: Technician | null;
  technician_id?: number | string;
  technician_employee_id?: number | string;
  service_type: string;
  status: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  invoice_number?: string;
  scheduled_date: string;
  created_at?: string;
  closed_at?: string;
  notes?: string;
  metadata?: {
    customer_document?: string;
    customer_phone_secondary?: string;
    customer_neighborhood?: string;
    service_store?: string;
    service_store_label?: string;
    public_request?: boolean;
    requires_admin_completion?: boolean;
    preorder_status?: string;
    external_reference_code?: string;
    external_reference_name?: string;
    external_reference_label?: string;
    external_reference_id?: string;
    [key: string]: unknown
  };
  incidents: Array<{ id: number }>;
  photos: Array<{ id: number }>;
  items?: ServiceOrderItem[];
};
type OrdersResponse = { data: ServiceOrder[] };
type ServiceOrderExcelRow = {
  orden: string;
  estado: string;
  accion: string;
  cliente: string;
  documento_cliente: string;
  telefono: string;
  telefono_alterno: string;
  direccion: string;
  barrio: string;
  tipo_servicio: string;
  referencia_codigo: string;
  referencia_nombre: string;
  tecnico: string;
  factura_pedido: string;
  almacen: string;
  fecha_programada: string;
  fecha_creacion: string;
  fecha_cierre: string;
  sla_dias_habiles: number;
  fotos: number;
  novedades: number;
  solicitud_publica: string;
  requiere_completar: string;
  observaciones: string;
};
type OrderEditForm = {
  status: string;
  reference_id: string;
  technician_id: string;
  service_type: string;
  scheduled_date: string;
  customer_name: string;
  customer_document: string;
  customer_phone: string;
  customer_address: string;
  customer_neighborhood: string;
  service_store: string;
  invoice_number: string;
  notes: string;
};
type OrderEditItem = { reference_id: string; service_type: string; quantity: number; observation: string };

const emptyEditForm: OrderEditForm = {
  status: "pendiente",
  reference_id: "",
  technician_id: "",
  service_type: "montaje",
  scheduled_date: "",
  customer_name: "",
  customer_document: "",
  customer_phone: "",
  customer_address: "",
  customer_neighborhood: "",
  service_store: "",
  invoice_number: "",
  notes: ""
};

const baseEditRequiredFields: Array<[keyof OrderEditForm, string]> = [
  ["status", "estado"],
  ["customer_name", "nombre del cliente"],
  ["customer_document", "cedula del cliente"],
  ["customer_phone", "telefono"],
  ["customer_address", "direccion"],
  ["notes", "observaciones operativas"]
];

const pendingEditRequiredFields: Array<[keyof OrderEditForm, string]> = [
  ["technician_id", "tecnico asignado"],
  ["scheduled_date", "fecha programada del servicio"]
];

const statusLabel: Record<string, string> = {
  agendado: "Agendado",
  pendiente: "Pendiente",
  en_curso: "En curso",
  inspeccion: "Inspeccion",
  ejecucion: "Ejecucion",
  cerrada: "Cerrada",
  no_ejecutada: "No ejecutada",
  cancelada: "Cancelada"
};

const statusTone: Record<string, string> = {
  agendado: "border-teal-200 bg-teal-50 text-teal-800",
  pendiente: "border-slate-200 bg-slate-50 text-slate-700",
  en_curso: "border-sky-200 bg-sky-50 text-sky-700",
  inspeccion: "border-amber-200 bg-amber-50 text-amber-800",
  ejecucion: "border-indigo-200 bg-indigo-50 text-indigo-800",
  cerrada: "border-emerald-200 bg-emerald-50 text-emerald-800",
  no_ejecutada: "border-rose-200 bg-rose-50 text-rose-800",
  cancelada: "border-neutral-200 bg-neutral-100 text-neutral-700"
};
const editableOrderStatuses = new Set(["agendado", "pendiente", "cancelada"]);

function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

function formatDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
    + " " + date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function exportDate(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function localDateOnly(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function businessDaysElapsed(fromValue?: string, toValue?: string) {
  const from = localDateOnly(fromValue);
  const to = localDateOnly(toValue || new Date().toISOString());
  if (!from || !to || to <= from) return 0;
  let count = 0;
  const cursor = new Date(from);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function slaInfo(order: ServiceOrder) {
  const stopDate = order.status === "cerrada" && order.closed_at ? order.closed_at : undefined;
  const remaining = 4 - businessDaysElapsed(order.created_at || order.scheduled_date, stopDate);
  const tone = remaining >= 3
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : remaining === 2
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
  const label = remaining >= 0 ? `${remaining} dia${remaining === 1 ? "" : "s"}` : `${remaining} dias`;
  return { remaining, tone, label };
}

function orderSequence(value?: string) {
  const match = String(value || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function newestFirst(a: ServiceOrder, b: ServiceOrder) {
  const dateCompare = String(b.created_at || "").localeCompare(String(a.created_at || ""));
  if (dateCompare) return dateCompare;
  return orderSequence(b.number) - orderSequence(a.number);
}

function isToday(value?: string) {
  if (!value) return false;
  return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function isOpenStatus(status: string) {
  return ["agendado", "pendiente", "en_curso", "inspeccion", "ejecucion"].includes(status);
}

function isOverdue(order: ServiceOrder) {
  if (!order.scheduled_date || !isOpenStatus(order.status)) return false;
  return order.scheduled_date.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function priorityScore(order: ServiceOrder) {
  const sla = slaInfo(order);
  if (isOpenStatus(order.status) && sla.remaining < 0) return -2;
  if (isOpenStatus(order.status) && sla.remaining <= 1) return -1;
  if (isOverdue(order)) return 0;
  if (order.status === "no_ejecutada") return 1;
  if (order.status === "agendado") return 2;
  if (["en_curso", "inspeccion", "ejecucion"].includes(order.status)) return 2;
  if (isToday(order.scheduled_date)) return 3;
  if (order.status === "pendiente") return 4;
  return 5;
}

function serviceAction(order: ServiceOrder) {
  if (requiresAdminCompletion(order)) return "Completar";
  if (order.status === "agendado") return "Completar";
  if (order.status === "pendiente") return "Iniciar";
  if (["en_curso", "inspeccion", "ejecucion"].includes(order.status)) return "Continuar";
  if (order.status === "no_ejecutada") return "Revisar";
  return "Ver detalle";
}

function requiresAdminCompletion(order: ServiceOrder) {
  const withoutTechnician = !order.technician && !order.technician_employee_id && !order.technician_id;
  return Boolean(order.status === "agendado" || order.metadata?.requires_admin_completion || withoutTechnician || !order.reference_id);
}

function orderIsReadyForOperation(order: ServiceOrder | null | undefined) {
  if (!order) return false;
  const hasTechnician = Boolean(order.technician || order.technician_employee_id || order.technician_id);
  return order.status === "pendiente" && hasTechnician && Boolean(order.reference_id);
}

function effectiveOrder(order: ServiceOrder): ServiceOrder {
  const withoutTechnician = !order.technician && !order.technician_employee_id && !order.technician_id;
  if (order.status === "pendiente" && withoutTechnician && (order.metadata?.preorder_status === "agendado" || order.metadata?.requires_admin_completion)) {
    return { ...order, status: "agendado" };
  }
  return order;
}

function isLocalOrder(order: ServiceOrder) {
  return isOperableOrderId(order.id);
}

function isOperableOrderId(id: unknown) {
  return /^\d+$/.test(String(id || "")) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""));
}

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function serviceEntityId(value: string) {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function localReferenceForOrder(order: ServiceOrder, references: ServiceReference[]) {
  const directId = String(order.reference_id || "");
  const externalCode = normalizeKey(order.reference?.code || order.metadata?.external_reference_code || order.metadata?.product_reference);
  const externalName = normalizeKey(order.reference?.name || order.metadata?.external_reference_name);
  return references.find((item) => String(item.id) === directId)
    || references.find((item) => externalCode && normalizeKey(item.code) === externalCode)
    || references.find((item) => externalName && normalizeKey(item.name) === externalName)
    || null;
}

function externalReferenceText(order: ServiceOrder | null) {
  if (!order) return "";
  return String(order.metadata?.external_reference_label || order.metadata?.product_description || order.metadata?.product_reference || "").trim();
}

function currentEditValue(order: ServiceOrder, key: keyof OrderEditForm) {
  if (key === "reference_id") return order.reference_id;
  if (key === "technician_id") return order.technician_id || order.technician_employee_id || order.technician?.id;
  if (key === "scheduled_date") return order.scheduled_date;
  if (key === "customer_document") return order.metadata?.customer_document;
  if (key === "customer_neighborhood") return order.metadata?.customer_neighborhood;
  if (key === "service_store") return order.metadata?.service_store;
  return (order as unknown as Record<string, unknown>)[key];
}

function effectiveEditValue(form: OrderEditForm, order: ServiceOrder, key: keyof OrderEditForm) {
  const value = form[key].trim();
  if (pendingEditRequiredFields.some(([field]) => field === key)) {
    return value || String(currentEditValue(order, key) || "").trim();
  }
  return value;
}

function missingEditRequirements(form: OrderEditForm, order: ServiceOrder) {
  const required = form.status === "pendiente"
    ? [...pendingEditRequiredFields, ...baseEditRequiredFields]
    : baseEditRequiredFields;
  return required
    .filter(([key]) => !effectiveEditValue(form, order, key))
    .map(([, label]) => label);
}

function technicianLabel(order: ServiceOrder) {
  return order.technician?.user?.name || order.technician?.user?.email || String(order.technician_employee_id || order.technician_id || "");
}

function technicianSearchText(order: ServiceOrder) {
  return [
    order.technician?.code,
    order.technician?.user?.name,
    order.technician?.user?.email,
    order.technician_employee_id,
    order.technician_id
  ].filter(Boolean).join(" ");
}

function serviceOrderExcelRows(orders: ServiceOrder[]): ServiceOrderExcelRow[] {
  return orders.map((order) => {
    const sla = slaInfo(order);
    const requiresCompletion = requiresAdminCompletion(order);
    return {
      orden: order.number || String(order.id || ""),
      estado: statusLabel[order.status] || order.status || "",
      accion: serviceAction(order),
      cliente: order.customer_name || "",
      documento_cliente: String(order.metadata?.customer_document || ""),
      telefono: order.customer_phone || "",
      telefono_alterno: String(order.metadata?.customer_phone_secondary || ""),
      direccion: order.customer_address || "",
      barrio: String(order.metadata?.customer_neighborhood || ""),
      tipo_servicio: order.service_type || "",
      referencia_codigo: order.reference?.code || String(order.metadata?.external_reference_code || ""),
      referencia_nombre: order.reference?.name || String(order.metadata?.external_reference_name || externalReferenceText(order)),
      tecnico: technicianLabel(order),
      factura_pedido: order.invoice_number || "",
      almacen: String(order.metadata?.service_store_label || order.metadata?.service_store || ""),
      fecha_programada: exportDate(order.scheduled_date),
      fecha_creacion: exportDate(order.created_at),
      fecha_cierre: exportDate(order.closed_at),
      sla_dias_habiles: sla.remaining,
      fotos: order.photos.length,
      novedades: order.incidents.length,
      solicitud_publica: order.metadata?.public_request ? "Si" : "No",
      requiere_completar: requiresCompletion ? "Si" : "No",
      observaciones: order.notes || ""
    };
  });
}

function serviceOrderHref(order: ServiceOrder) {
  if (!requiresAdminCompletion(order) && isOperableOrderId(order.id)) return `/dashboard/servicios/${order.id}`;
  const externalKey = String(order.number || order.id || "").trim();
  return `/dashboard/servicios?externa=${encodeURIComponent(externalKey)}`;
}

function correctionHref(order: ServiceOrder) {
  return `${serviceOrderHref(order)}?corregir=1`;
}

function orderKey(order: ServiceOrder) {
  return String(order.id || order.number || "").trim();
}

function mergeOrders(orders: ServiceOrder[]) {
  const byId = new Map<string, ServiceOrder>();
  const byNumber = new Map<string, string>();
  for (const order of orders) {
    const id = orderKey(order);
    const number = String(order.number || "").trim();
    const existingIdByNumber = number ? byNumber.get(number) : "";
    if (id && byId.has(id)) continue;
    if (existingIdByNumber) {
      const existing = byId.get(existingIdByNumber);
      if (existing && !isLocalOrder(existing) && isLocalOrder(order)) {
        byId.delete(existingIdByNumber);
        byId.set(id, order);
        byNumber.set(number, id);
      }
      continue;
    }
    if (id) byId.set(id, order);
    if (number) byNumber.set(number, id);
  }
  return Array.from(byId.values()).sort(newestFirst);
}

async function loadSupabaseMonitorOrders() {
  if (typeof window === "undefined") return [];
  const token = localStorage.getItem("token") || "";
  if (!token) return [];
  const companyName = localStorage.getItem("apexos_company_name") || localStorage.getItem("company_name") || "SCJ";
  const companyId = localStorage.getItem("apexos_company_id") || "";
  const query = new URLSearchParams({ empresa: companyName, limit: "200" });
  if (companyId) query.set("company_id", companyId);
  const response = await fetch(`/api/services/monitor-orders?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message || "No fue posible consultar el monitor de servicios.");
  }
  const body = await response.json() as OrdersResponse;
  return Array.isArray(body.data) ? body.data : [];
}

export default function ServicesPage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [references, setReferences] = useState<ServiceReference[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceTypesCatalog, setServiceTypesCatalog] = useState<ServiceType[]>([]);
  const [serviceStores, setServiceStores] = useState<ServiceStore[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [dateScope, setDateScope] = useState("");
  const [evidenceScope, setEvidenceScope] = useState("");
  const [requestScope, setRequestScope] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [message, setMessage] = useState("");
  const [technicianMode, setTechnicianMode] = useState(false);
  const [canCorrectAnyState, setCanCorrectAnyState] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [editForm, setEditForm] = useState<OrderEditForm>(emptyEditForm);
  const [editItems, setEditItems] = useState<OrderEditItem[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [handledExternalKey, setHandledExternalKey] = useState("");

  async function load() {
    try {
      setMessage("");
      const [monitorResult, apiResult] = await Promise.allSettled([
        loadSupabaseMonitorOrders(),
        api<OrdersResponse>("/api/v1/services/orders?limit=200")
      ]);
      const monitorOrders = monitorResult.status === "fulfilled" ? monitorResult.value : [];
      const apiOrders = apiResult.status === "fulfilled" ? apiResult.value.data || [] : [];
      if (monitorResult.status === "rejected" && apiResult.status === "rejected") {
        throw apiResult.reason || monitorResult.reason;
      }
      setOrders(mergeOrders([...monitorOrders, ...apiOrders]).map(effectiveOrder));
      setLastRefreshAt(new Date());
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar servicios.");
      setOrders([]);
      return false;
    }
  }

  async function refreshOrders() {
    if (refreshingOrders) return;
    setRefreshingOrders(true);
    const refreshed = await load();
    if (refreshed) setMessage("Datos del monitor actualizados correctamente.");
    setRefreshingOrders(false);
  }

  async function loadMasters() {
    try {
      const [referenceRows, technicianRows, typeRows, storeRows] = await Promise.all([
        api<ServiceReference[]>("/api/v1/services/references?active=true"),
        api<Technician[]>("/api/v1/services/technicians"),
        api<ServiceType[]>("/api/v1/services/service-types"),
        api<ServiceStore[]>("/api/v1/services/service-stores")
      ]);
      setReferences(referenceRows);
      setTechnicians(technicianRows);
      setServiceTypesCatalog(typeRows.filter((item) => item.active !== false));
      setServiceStores(storeRows.filter((item) => item.active !== false));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar maestros de servicios.");
      setReferences([]);
      setTechnicians([]);
      setServiceTypesCatalog([]);
      setServiceStores([]);
    }
  }

  useEffect(() => {
    const isTechnician = isServiceTechnicianSession();
    setTechnicianMode(isTechnician);
    setCanCorrectAnyState(!isTechnician && hasStoredRolePermission("services.orders", "edit_any_state"));
    load();
    if (!isTechnician) loadMasters();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5_000);
    const refreshOnFocus = () => { void load(); };
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return orders.filter((order) => {
      const matchesTerm = !term || [order.number, order.customer_name, order.customer_address, order.customer_phone, order.metadata?.customer_phone_secondary, order.reference?.code, order.reference?.name, order.service_type, technicianSearchText(order)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
      const isExternalRequest = order.status === "agendado" || order.metadata?.public_request === true || order.metadata?.requires_admin_completion === true;
      const orderTechnician = technicianValue(order);
      const matchesTechnician =
        !technicianFilter ||
        (technicianFilter === "__unassigned" && !orderTechnician) ||
        orderTechnician === technicianFilter;
      const matchesDate =
        !dateScope ||
        (dateScope === "today" && isToday(order.scheduled_date)) ||
        (dateScope === "overdue" && isOverdue(order)) ||
        (dateScope === "upcoming" && Boolean(order.scheduled_date) && order.scheduled_date.slice(0, 10) > today) ||
        (dateScope === "unscheduled" && !order.scheduled_date);
      const matchesEvidence =
        !evidenceScope ||
        (evidenceScope === "with_evidence" && order.photos.length > 0) ||
        (evidenceScope === "without_evidence" && order.photos.length === 0) ||
        (evidenceScope === "with_incidents" && order.incidents.length > 0);
      const matchesRequestScope = !requestScope || (requestScope === "external" && isExternalRequest);
      return matchesTerm && matchesTechnician && (!status || order.status === status) && matchesDate && matchesEvidence && matchesRequestScope && (!serviceType || order.service_type === serviceType);
    }).sort((a, b) => {
      if (sortBy === "newest") return newestFirst(a, b);
      if (sortBy === "date_asc") return (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999");
      if (sortBy === "date_desc") return (b.scheduled_date || "").localeCompare(a.scheduled_date || "");
      if (sortBy === "order") return orderSequence(b.number) - orderSequence(a.number) || b.number.localeCompare(a.number);
      return priorityScore(a) - priorityScore(b) || newestFirst(a, b);
    });
  }, [dateScope, evidenceScope, orders, query, requestScope, serviceType, sortBy, status, technicianFilter]);

  const serviceTypes = useMemo(() => [...new Set(orders.map((order) => order.service_type).filter(Boolean))].sort(), [orders]);
  const editableServiceTypes = serviceTypesCatalog.length ? serviceTypesCatalog : serviceTypes.map((type) => ({ code: type, label: statusLabel[type] || type }));
  const assignedTechnicianOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const technician of technicians) {
      const id = String(technician.id || "").trim();
      if (!id) continue;
      options.set(id, `${technician.code || "TEC"} - ${technician.user?.name || technician.user?.email || "Tecnico"}`);
    }
    for (const order of orders) {
      const id = technicianValue(order);
      if (!id || options.has(id)) continue;
      options.set(id, technicianLabel(order) || `Tecnico ${id.slice(0, 8)}`);
    }
    return Array.from(options.entries()).sort(([, a], [, b]) => a.localeCompare(b, "es"));
  }, [orders, technicians]);
  const statusCounts = useMemo(() => orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {}), [orders]);
  const activeFilters = [status, dateScope, evidenceScope, requestScope, serviceType, technicianFilter].filter(Boolean).length + (query.trim() ? 1 : 0);
  const externalRequestCompany = typeof window !== "undefined" ? localStorage.getItem("apexos_company_name") || "SCJ" : "SCJ";
  const externalRequestHref = `/servicios/solicitar?empresa=${encodeURIComponent(externalRequestCompany)}`;

  function clearFilters() {
    setQuery("");
    setStatus("");
    setDateScope("");
    setEvidenceScope("");
    setRequestScope("");
    setServiceType("");
    setTechnicianFilter("");
    setSortBy("newest");
  }

  function downloadOrdersExcel() {
    const today = new Date().toISOString().slice(0, 10);
    downloadExcelWorkbook(`apexos-ordenes-servicio-${today}.xls`, [{
      name: "Ordenes de servicio",
      columns: [
        { key: "orden", label: "Orden", width: 85 },
        { key: "estado", label: "Estado", width: 95 },
        { key: "accion", label: "Accion siguiente", width: 120 },
        { key: "cliente", label: "Cliente", width: 180 },
        { key: "documento_cliente", label: "Documento cliente", width: 120 },
        { key: "telefono", label: "Telefono", width: 110 },
        { key: "direccion", label: "Direccion", width: 220 },
        { key: "barrio", label: "Barrio", width: 130 },
        { key: "tipo_servicio", label: "Tipo de servicio", width: 110 },
        { key: "referencia_codigo", label: "Codigo referencia", width: 140 },
        { key: "referencia_nombre", label: "Referencia", width: 260 },
        { key: "tecnico", label: "Tecnico", width: 160 },
        { key: "factura_pedido", label: "Factura / pedido", width: 130 },
        { key: "almacen", label: "Almacen", width: 140 },
        { key: "fecha_programada", label: "Fecha programada", width: 115 },
        { key: "fecha_creacion", label: "Fecha creacion", width: 115 },
        { key: "fecha_cierre", label: "Fecha cierre", width: 115 },
        { key: "sla_dias_habiles", label: "SLA dias habiles", width: 95 },
        { key: "fotos", label: "Fotos", width: 60 },
        { key: "novedades", label: "Novedades", width: 80 },
        { key: "solicitud_publica", label: "Solicitud publica", width: 100 },
        { key: "requiere_completar", label: "Requiere completar", width: 120 },
        { key: "observaciones", label: "Observaciones", width: 260 }
      ],
      rows: serviceOrderExcelRows(filtered)
    }]);
  }

  function technicianValue(order: ServiceOrder) {
    return String(order.technician?.id || order.technician_employee_id || order.technician_id || "");
  }

  function editAllowed(order: ServiceOrder) {
    return !technicianMode && !["cerrada", "no_ejecutada"].includes(order.status);
  }

  const openEdit = useCallback((order: ServiceOrder) => {
    const localReference = localReferenceForOrder(order, references);
    setEditingOrder(order);
    setValidationIssues([]);
    setEditError("");
    const sourceItems = order.items?.length
      ? order.items
      : Array.isArray(order.metadata?.items) ? order.metadata.items as ServiceOrderItem[] : [];
    setEditItems((sourceItems.length ? sourceItems : [{ reference_id: localReference?.id || order.reference_id || "", service_type: order.service_type || "montaje", quantity: 1, observation: "" }]).map((item) => ({
      reference_id: String(item.reference_id || ""),
      service_type: item.service_type || "montaje",
      quantity: Math.max(Number(item.quantity || 1), 1),
      observation: String(item.observation || "")
    })));
    setEditForm({
      status: order.status || "pendiente",
      reference_id: localReference ? String(localReference.id) : "",
      technician_id: technicianValue(order),
      service_type: order.service_type || "montaje",
      scheduled_date: order.scheduled_date?.slice(0, 10) || "",
      customer_name: order.customer_name || "",
      customer_document: String(order.metadata?.customer_document || ""),
      customer_phone: order.customer_phone || "",
      customer_address: order.customer_address || "",
      customer_neighborhood: String(order.metadata?.customer_neighborhood || ""),
      service_store: String(order.metadata?.service_store || ""),
      invoice_number: order.invoice_number || "",
      notes: order.notes || ""
    });
  }, [references]);

  useEffect(() => {
    const externalKey = searchParams.get("externa") || "";
    if (!externalKey || handledExternalKey === externalKey || technicianMode || !orders.length) return;
    const match = orders.find((order) => [order.number, order.id, order.metadata?.external_order_number, order.metadata?.external_order_id]
      .filter(Boolean)
      .some((value) => String(value) === externalKey));
    if (!match) return;
    if (requiresAdminCompletion(match) && !references.length) return;
    setHandledExternalKey(externalKey);
    openEdit(match);
  }, [handledExternalKey, openEdit, orders, references.length, searchParams, technicianMode]);

  async function saveEdit() {
    if (!editingOrder || savingEdit) return;
    const missing = missingEditRequirements(editForm, editingOrder);
    const invalidItem = editItems.findIndex((item) => !item.reference_id || !item.service_type);
    if (!editItems.length || invalidItem >= 0) {
      const issue = !editItems.length ? "al menos una solicitud" : `datos de la solicitud ${invalidItem + 1}`;
      setMessage(`Completa ${issue} antes de guardar.`);
      setValidationIssues([issue]);
      setEditError(`Completa ${issue} antes de guardar.`);
      return;
    }
    if (missing.length) {
      setMessage(`Completa los campos obligatorios: ${missing.join(", ")}.`);
      setValidationIssues(missing);
      setEditError(`Completa los campos obligatorios: ${missing.join(", ")}.`);
      return;
    }
    setSavingEdit(true);
    setMessage("");
    setEditError("");
    setValidationIssues([]);
    try {
      const payload: Record<string, unknown> = {
        status: editForm.status,
        service_type: editItems[0].service_type,
        reference_id: serviceEntityId(editItems[0].reference_id)
      };
      const includeWhenPresent = (key: keyof OrderEditForm) => {
        const value = editForm[key].trim();
        if (value) payload[key] = value;
      };
      const includeEditableText = (key: keyof OrderEditForm) => {
        const value = editForm[key];
        const original = String((editingOrder as unknown as Record<string, unknown>)[key] || "");
        if (value.trim() || value !== original) payload[key] = value.trim();
      };
      includeWhenPresent("technician_id");
      includeWhenPresent("scheduled_date");
      includeWhenPresent("customer_document");
      includeEditableText("customer_name");
      includeEditableText("customer_phone");
      includeEditableText("customer_address");
      includeEditableText("invoice_number");
      includeEditableText("notes");
      const selectedStore = serviceStores.find((item) => item.code === editForm.service_store);
      const metadata: NonNullable<ServiceOrder["metadata"]> = {
        ...(editingOrder.metadata || {}),
        customer_neighborhood: editForm.customer_neighborhood.trim(),
        service_store: editForm.service_store,
        service_store_label: selectedStore?.label || String(editingOrder.metadata?.service_store_label || ""),
        requires_admin_completion: editForm.status === "agendado",
        external_order_id: !isLocalOrder(editingOrder) ? String(editingOrder.id) : String(editingOrder.metadata?.external_order_id || ""),
        external_order_number: !isLocalOrder(editingOrder) ? editingOrder.number : String(editingOrder.metadata?.external_order_number || "")
      };
      metadata.items = editItems;
      if (editForm.customer_document.trim()) metadata.customer_document = editForm.customer_document.trim();
      if (!editableOrderStatuses.has(editForm.status)) delete payload.status;
      if (!isLocalOrder(editingOrder)) {
        setMessage("No fue posible identificar la orden existente para actualizarla sin duplicar.");
        return;
      }
      const updated = await api<ServiceOrder>(`/api/v1/services/orders/${editingOrder.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...payload,
          ...(editForm.technician_id ? { technician_id: serviceEntityId(editForm.technician_id) } : {}),
          items: editItems.map((item) => ({ ...item, reference_id: serviceEntityId(item.reference_id) })),
          metadata
        })
      });
      if (editForm.status === "pendiente" && !orderIsReadyForOperation({
        ...updated,
        reference_id: updated.reference_id || editForm.reference_id,
        technician_id: updated.technician_id || updated.technician_employee_id || editForm.technician_id
      })) {
        throw new Error("La orden se envio, pero no quedo lista para el tecnico. Verifica referencia y tecnico asignado antes de continuar.");
      }
      setMessage(editForm.status === "pendiente" ? "Orden enviada a pendiente correctamente." : "Orden actualizada correctamente.");
      setEditingOrder(null);
      setEditError("");
      await load();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No fue posible actualizar la orden.";
      const match = detail.match(/Completa los campos obligatorios:\s*([^.]*)/i);
      if (match?.[1]) {
        setValidationIssues(match[1].split(",").map((item) => item.trim()).filter(Boolean));
      } else if (/referencia|tecnico|t[eé]cnico|fecha|cedula|c[eé]dula|tipo de servicio|estado/i.test(detail)) {
        setValidationIssues([detail.replace(/\.$/, "")]);
      }
      setMessage(detail);
      setEditError(detail);
    } finally {
      setSavingEdit(false);
    }
  }

  const operational = useMemo(() => {
    const attention = orders.filter((order) => ["agendado", "pendiente", "en_curso", "inspeccion", "ejecucion", "no_ejecutada"].includes(order.status));
    const publicRequests = orders.filter(requiresAdminCompletion);
    return { attention, publicRequests };
  }, [orders]);

  const mainMessage = operational.attention.length
    ? `Hay ${operational.attention.length} servicio(s) que requieren seguimiento operativo.`
    : "La operacion de servicios no tiene pendientes criticos en este momento.";

  return (
    <div className="apex-workspace-shell space-y-5 pb-28 md:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper px-3 py-3 sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <div className="flex items-center gap-3">
          <Link className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-white md:hidden" href="/dashboard" aria-label="Volver al inicio">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-apex">{technicianMode ? "Perfil tecnico operativo" : "M-26 · Operacion de campo"}</p>
            <h1 className="truncate text-2xl font-semibold md:text-3xl">{technicianMode ? "Mis servicios activos" : "Servicios"}</h1>
            <p className="mt-1 hidden text-sm text-neutral-600 sm:block">{mainMessage}</p>
          </div>
        </div>
      </header>

      {technicianMode && OFFLINE_DISCOVERY_ENABLED ? <OfflineTechnicianPanel /> : null}

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-apex">Centro operativo de servicios</p>
            <h2 className="mt-1 text-xl font-semibold">{technicianMode ? "Siguiente servicio" : "Ordenes listas para gestionar"}</h2>
            <p className="mt-1 max-w-3xl text-sm text-neutral-600">{technicianMode ? "Selecciona una orden para iniciar o continuar el trabajo." : "Filtra, abre y ejecuta sin salir del monitor."}</p>
          </div>
          {!technicianMode ? <div className="grid shrink-0 gap-2 sm:flex sm:flex-wrap">
            <Link className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" href="/dashboard/servicios/nuevo">
              <Plus className="shrink-0" size={17} />
              <span className="truncate">Nueva orden</span>
            </Link>
            <Link className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href={externalRequestHref} target="_blank">
              <SlidersHorizontal className="shrink-0" size={16} />
              <span className="truncate">Solicitudes de servicios externas</span>
            </Link>
            <Link className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href="/dashboard/servicios/referencias">
              <Settings2 className="shrink-0" size={16} />
              <span className="truncate">Referencias</span>
            </Link>
            <Link className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href="/dashboard/servicios/reportes">
              <BarChart3 className="shrink-0" size={16} />
              <span className="truncate">Reportes</span>
            </Link>
          </div> : null}
        </div>
      </section>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="min-w-0 space-y-4">
        <aside className="apex-section-card min-w-0 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
            <h2 className="font-semibold">{technicianMode ? "Que debes atender primero" : "Atencion prioritaria"}</h2>
            <p className="mt-1 text-sm text-neutral-500">{technicianMode ? "Tus servicios ordenados por urgencia y avance." : "Servicios abiertos, en proceso o con novedad."}</p>
            </div>
            <span className="rounded-md bg-paper px-3 py-1.5 text-xs font-semibold text-neutral-600">{operational.attention.length} por atender</span>
          </div>
          {operational.publicRequests.length ? (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>{operational.publicRequests.length} solicitud(es) publica(s)</strong> requieren completar referencia o tecnico antes de pasar a operacion.
            </div>
          ) : null}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {operational.attention.slice(0, 6).map((order) => (
              <Link className="block min-w-[250px] flex-1 rounded-md border border-line p-3 transition hover:border-apex hover:bg-paper" href={serviceOrderHref(order)} key={order.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{order.number} · {order.customer_name}</p>
                    <p className="mt-1 truncate text-xs text-neutral-500">{order.reference?.code || "Sin referencia"} · {formatDate(order.scheduled_date)}</p>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${requiresAdminCompletion(order) ? "border-amber-200 bg-amber-50 text-amber-800" : statusTone[order.status] || "border-line bg-paper"}`}>{requiresAdminCompletion(order) ? "Por completar" : statusLabel[order.status] || order.status}</span>
                </div>
              </Link>
            ))}
            {!operational.attention.length ? <p className="rounded-md bg-paper p-3 text-sm text-neutral-500">Sin servicios abiertos para atender.</p> : null}
          </div>
        </aside>

        <section className="apex-section-card min-w-0">
          <div className="border-b border-line p-3 sm:p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-apex/10 text-apex"><SlidersHorizontal size={17} /></span>
                  <div>
                    <h2 className="font-semibold">Consulta de ordenes</h2>
                    <p className="text-sm text-neutral-500">Encuentra y prioriza trabajo sin recargar la pantalla.</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {lastRefreshAt ? <span className="hidden text-xs font-semibold text-neutral-500 md:inline">Actualizado {lastRefreshAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span> : null}
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-300 bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70" disabled={refreshingOrders} onClick={refreshOrders} type="button">
                  <RotateCcw className={refreshingOrders ? "animate-spin" : ""} size={15} />
                  {refreshingOrders ? "Actualizando..." : "Actualizar datos"}
                </button>
                {activeFilters ? (
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-600 hover:border-apex hover:text-apex" onClick={clearFilters} type="button">
                    <RotateCcw size={15} /> Limpiar {activeFilters} filtro(s)
                  </button>
                ) : null}
              </div>
            </div>

            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={17} />
              <input className="h-12 w-full rounded-md border border-line bg-paper pl-10 pr-3 text-base outline-none transition focus:border-apex focus:bg-white md:text-sm" placeholder="Buscar por orden, cliente, telefono, direccion o referencia" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold transition ${!status ? "border-apex bg-apex text-white" : "border-line bg-white text-neutral-600 hover:border-apex"}`} onClick={() => setStatus("")} type="button">Todas <span className="ml-1 opacity-70">{orders.length}</span></button>
              {Object.entries(statusLabel).map(([key, label]) => (
                <button className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold transition ${status === key ? "border-apex bg-apex text-white" : "border-line bg-white text-neutral-600 hover:border-apex"}`} key={key} onClick={() => setStatus(key)} type="button">
                  {label} <span className="ml-1 opacity-70">{statusCounts[key] || 0}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              <label className="relative">
                <span className="sr-only">Agenda</span>
                <select className="h-11 w-full appearance-none rounded-md border border-line bg-white px-3 text-sm" value={dateScope} onChange={(event) => setDateScope(event.target.value)}>
                  <option value="">Cualquier fecha</option>
                  <option value="today">Programadas hoy</option>
                  <option value="overdue">Vencidas abiertas</option>
                  <option value="upcoming">Proximas</option>
                  <option value="unscheduled">Sin programar</option>
                </select>
              </label>
              <select className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm" value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
                <option value="">Todos los tipos</option>
                {serviceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              {!technicianMode ? (
                <select className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm" value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}>
                  <option value="">Todos los tecnicos</option>
                  <option value="__unassigned">Sin tecnico asignado</option>
                  {assignedTechnicianOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              ) : null}
              <select className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm" value={evidenceScope} onChange={(event) => setEvidenceScope(event.target.value)}>
                <option value="">Evidencia y novedades</option>
                <option value="with_evidence">Con evidencia</option>
                <option value="without_evidence">Sin evidencia</option>
                <option value="with_incidents">Con novedades</option>
              </select>
              <select className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm" value={requestScope} onChange={(event) => setRequestScope(event.target.value)}>
                <option value="">Todas las solicitudes</option>
                <option value="external">Solicitudes externas / agendado</option>
              </select>
              <select className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="newest">Mas recientes primero</option>
                <option value="priority">Prioridad operativa</option>
                <option value="date_asc">Fecha mas cercana</option>
                <option value="date_desc">Fecha mas lejana</option>
                <option value="order">Consecutivo mayor</option>
              </select>
            </div>
          </div>

          <div className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Ordenes de servicio</h2>
              <p className="text-sm text-neutral-500">{filtered.length} de {orders.length} orden(es) visibles</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <p className="hidden text-xs font-medium text-neutral-500 md:block">Selecciona una orden para consultar o continuar el servicio.</p>
              <button className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-apex transition-colors hover:border-apex disabled:cursor-not-allowed disabled:opacity-50" disabled={!filtered.length} onClick={downloadOrdersExcel} type="button">
                <Download className="shrink-0" size={16} />
                <span className="truncate">Descargar Excel</span>
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((order) => (
              <div className="rounded-md border border-line p-3 text-left transition hover:border-apex hover:bg-paper" key={order.id}>
              <Link className="block active:scale-[0.99]" href={serviceOrderHref(order)}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-md border px-3 py-2 text-xs font-semibold ${statusTone[order.status] || "border-line bg-paper"}`}>{statusLabel[order.status] || order.status}</span>
                    {requiresAdminCompletion(order) ? <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Completar solicitud</span> : null}
                    {isOverdue(order) ? <span className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Vencida</span> : null}
                    {isToday(order.scheduled_date) ? <span className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">Hoy</span> : null}
                  </div>
                  <span className="min-w-0 truncate text-right text-xs font-semibold text-neutral-500">{order.number}</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-apex/10 text-apex"><Wrench size={21} /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold">{order.customer_name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-neutral-600">{order.customer_address}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                      <span className="truncate rounded-md bg-paper px-2 py-1">{order.service_type}</span>
                      <span className="truncate rounded-md bg-paper px-2 py-1">{order.reference?.code || "Sin ref."}</span>
                      <span className="rounded-md bg-paper px-2 py-1">{order.photos.length} foto(s)</span>
                      <span className="rounded-md bg-paper px-2 py-1">{order.incidents.length} novedad(es)</span>
                    </div>
                    <div className="mt-4 grid min-w-0 gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-xs font-medium text-neutral-500">{formatDate(order.scheduled_date)}</span>
                      <span className="text-[11px] font-medium text-neutral-400">{formatDateTime(order.created_at)}</span>
                      <span className="inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-apex sm:w-auto">
                        <span className="truncate">{serviceAction(order)}</span>
                        <ChevronRight className="shrink-0" size={14} />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
              {editAllowed(order) ? (
                <button className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-semibold text-apex" onClick={() => openEdit(order)} type="button">
                  <Pencil size={15} /> Editar o reasignar
                </button>
              ) : null}
              {canCorrectAnyState && isOperableOrderId(order.id) ? (
                <Link className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 text-sm font-semibold text-white" href={correctionHref(order)}>
                  <ShieldCheck size={15} /> Corregir y anexar
                </Link>
              ) : null}
              </div>
            ))}
            {!filtered.length ? (
              <div className="col-span-full rounded-md border border-dashed border-line p-8 text-center sm:p-10">
                <Filter className="mx-auto mb-3 text-neutral-300" size={34} />
                <p className="font-semibold">No encontramos ordenes con estos filtros</p>
                <p className="mt-1 text-sm text-neutral-500">Ajusta la busqueda o limpia los filtros activos.</p>
                {activeFilters ? <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={clearFilters} type="button"><RotateCcw size={15} /> Limpiar filtros</button> : null}
              </div>
            ) : null}
          </div>

          {filtered.length ? (
            <div className="hidden overflow-x-auto rounded-md border border-line md:block">
              <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                  <col className="w-[28%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-paper text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  <tr>
                    <th>Orden y estado</th>
                    <th>Cliente y ubicacion</th>
                    <th>Servicio</th>
                    <th>Agenda</th>
                    <th className="text-center">Ingreso</th>
                    <th className="text-center">Soportes</th>
                    <th className="text-right">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((order) => (
                    <tr className="group transition hover:bg-paper" key={order.id}>
                      <td className="align-top">
                        <Link className="font-semibold text-neutral-900 hover:text-apex" href={serviceOrderHref(order)}>{order.number}</Link>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${statusTone[order.status] || "border-line bg-paper"}`}>{statusLabel[order.status] || order.status}</span>
                          {requiresAdminCompletion(order) ? <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Completar</span> : null}
                          {isOverdue(order) ? <span className="rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">Vencida</span> : null}
                          {isToday(order.scheduled_date) ? <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700">Hoy</span> : null}
                        </div>
                      </td>
                      <td className="align-top">
                        <p className="truncate font-semibold text-neutral-900">{order.customer_name}</p>
                        <p className="mt-1 truncate text-xs text-neutral-500">{order.customer_address || "Sin direccion registrada"}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {[order.customer_phone, order.metadata?.customer_phone_secondary].filter(Boolean).join(" / ") || "Sin telefono"}
                        </p>
                      </td>
                      <td className="align-top">
                        <p className="font-medium text-neutral-800">{order.service_type || "Sin tipo"}</p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500 [overflow-wrap:anywhere]">{order.reference?.code || "Sin referencia"} · {order.reference?.name || "Sin nombre"}</p>
                      </td>
                      <td className="align-top">
                        <p className="font-medium text-neutral-800">{formatDate(order.scheduled_date)}</p>
                        <p className="mt-1 text-xs text-neutral-500">{isOverdue(order) ? "Requiere atencion" : isToday(order.scheduled_date) ? "Programada para hoy" : "Agenda registrada"}</p>
                        <p className={`mt-1.5 inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${slaInfo(order).tone}`}>{slaInfo(order).label} habiles</p>
                      </td>
                      <td className="text-center align-top">
                        <p className="text-xs font-medium text-neutral-700">{formatDateTime(order.created_at)}</p>
                      </td>
                      <td className="text-center align-top">
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-paper px-2 py-1.5 text-[11px] font-medium text-neutral-600">
                          <span>{order.photos.length} foto</span>
                          <span className="h-3 w-px bg-line" />
                          <span className={order.incidents.length ? "font-semibold text-amber-700" : ""}>{order.incidents.length} nov.</span>
                        </div>
                      </td>
                      <td className="text-right align-middle">
                        {canCorrectAnyState && isOperableOrderId(order.id) ? (
                          <Link className="mb-1.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-teal-700 px-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-800" href={correctionHref(order)}>
                            <ShieldCheck size={14} /> Corregir
                          </Link>
                        ) : null}
                        {editAllowed(order) ? (
                          <button className="mb-1.5 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-semibold text-neutral-700 transition-colors hover:border-apex hover:text-apex" onClick={() => openEdit(order)} type="button">
                            <Pencil size={14} /> Editar
                          </button>
                        ) : null}
                        <Link className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-semibold text-apex transition-colors group-hover:border-apex" href={serviceOrderHref(order)}>
                          {serviceAction(order)}
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="hidden rounded-md border border-dashed border-line p-10 text-center md:block">
              <Filter className="mx-auto mb-3 text-neutral-300" size={34} />
              <p className="font-semibold">No encontramos ordenes con estos filtros</p>
              <p className="mt-1 text-sm text-neutral-500">Ajusta la busqueda o limpia los filtros activos.</p>
              {activeFilters ? <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={clearFilters} type="button"><RotateCcw size={15} /> Limpiar filtros</button> : null}
            </div>
          )}
          </div>
        </section>
      </section>

      {editingOrder ? (
        <ModalFrame title={`Editar ${editingOrder.number}`} onClose={() => { setEditingOrder(null); setValidationIssues([]); setEditError(""); }} maxWidth="max-w-5xl">
          <div className="space-y-5">
            <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <ShieldCheck className="mt-0.5 shrink-0" size={18} />
              <div><p className="font-semibold">Edicion administrativa controlada</p><p className="mt-1 text-amber-900">Las solicitudes pueden ajustarse mientras ninguna haya iniciado. La primera mantiene compatible el encabezado de la orden.</p></div>
            </div>
            {editError ? <div role="alert" className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><div><p className="font-semibold">No fue posible guardar la orden</p><p className="mt-1">{editError}</p></div></div> : null}
            <div><h3 className="text-sm font-semibold text-neutral-900">Programacion</h3><p className="mt-1 text-xs text-neutral-500">Define cuando y quien atendera toda la orden.</p></div>
            <section className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Estado *
                <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={editForm.status} onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="agendado">Agendado - preorden desde solicitud</option>
                  <option value="pendiente">Pendiente - listo para tecnico</option>
                  {!editableOrderStatuses.has(editForm.status) ? <option value={editForm.status}>{statusLabel[editForm.status] || editForm.status}</option> : null}
                  <option value="cancelada">Cancelada</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Tecnico responsable {editForm.status === "pendiente" ? "*" : "(opcional en agendado)"}
                <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={editForm.technician_id} onChange={(event) => setEditForm((prev) => ({ ...prev, technician_id: event.target.value }))}>
                  <option value="">Selecciona un tecnico</option>
                  {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.code || "TEC"} - {technician.user?.name || technician.user?.email || "Tecnico"}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Fecha programada {editForm.status === "pendiente" ? "*" : "(obligatoria al pasar a pendiente)"}
                <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={editForm.scheduled_date} onChange={(event) => setEditForm((prev) => ({ ...prev, scheduled_date: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Factura o pedido (opcional)
                <input className="h-10 rounded-md border border-line px-3 text-sm" value={editForm.invoice_number} onChange={(event) => setEditForm((prev) => ({ ...prev, invoice_number: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Almacen origen
                <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={editForm.service_store} onChange={(event) => setEditForm((prev) => ({ ...prev, service_store: event.target.value }))}>
                  <option value="">Selecciona un almacen</option>
                  {serviceStores.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </label>
            </section>
            <section className="border-y border-line py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-neutral-900">Solicitudes del servicio</h3><p className="mt-1 text-xs text-neutral-500">{editItems.length} solicitud(es) dentro de esta orden.</p></div>
                <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-apex bg-white px-3 text-sm font-semibold text-apex disabled:opacity-40 sm:w-auto" disabled={editItems.length >= 20} onClick={() => setEditItems((current) => [...current, { reference_id: "", service_type: editableServiceTypes[0]?.code || "montaje", quantity: 1, observation: "" }])} type="button"><Plus size={16} /> Agregar solicitud</button>
              </div>
              <div className="mt-3 grid gap-3">
                {editItems.map((item, index) => (
                  <div className="rounded-md border border-line bg-paper p-3" key={`${index}-${item.reference_id}`}>
                    <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold">Solicitud {index + 1}</p>{editItems.length > 1 ? <button aria-label={`Eliminar solicitud ${index + 1}`} className="flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-700" onClick={() => setEditItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><Trash2 size={16} /></button> : null}</div>
                    <div className="grid min-w-0 gap-3 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-medium text-neutral-700">Referencia *<select className="h-10 min-w-0 rounded-md border border-line bg-white px-3 text-sm" value={item.reference_id} onChange={(event) => setEditItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, reference_id: event.target.value } : row))}><option value="">Selecciona una referencia</option>{references.map((reference) => <option key={reference.id} value={reference.id}>{reference.code} - {reference.name}</option>)}</select></label>
                      <label className="grid gap-1.5 text-sm font-medium text-neutral-700">Tipo de servicio *<select className="h-10 min-w-0 rounded-md border border-line bg-white px-3 text-sm" value={item.service_type} onChange={(event) => setEditItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, service_type: event.target.value } : row))}>{editableServiceTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}</select></label>
                    </div>
                    <label className="mt-3 grid gap-1.5 text-sm font-medium text-neutral-700">Observacion de esta solicitud<input className="h-10 rounded-md border border-line bg-white px-3 text-sm" placeholder="Detalle particular del producto o servicio" value={item.observation} onChange={(event) => setEditItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, observation: event.target.value } : row))} /></label>
                  </div>
                ))}
              </div>
            </section>
            <div><h3 className="text-sm font-semibold text-neutral-900">Datos del cliente</h3><p className="mt-1 text-xs text-neutral-500">Informacion comun para todas las solicitudes de la orden.</p></div>
            <section className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Cliente *
                <input className="h-10 rounded-md border border-line px-3 text-sm" value={editForm.customer_name} onChange={(event) => setEditForm((prev) => ({ ...prev, customer_name: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Cedula *
                <input className="h-10 rounded-md border border-line px-3 text-sm" inputMode="numeric" value={editForm.customer_document} onChange={(event) => setEditForm((prev) => ({ ...prev, customer_document: event.target.value.replace(/\D/g, "") }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Telefono *
                <input className="h-10 rounded-md border border-line px-3 text-sm" value={editForm.customer_phone} onChange={(event) => setEditForm((prev) => ({ ...prev, customer_phone: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Direccion *
                <input className="h-10 rounded-md border border-line px-3 text-sm" value={editForm.customer_address} onChange={(event) => setEditForm((prev) => ({ ...prev, customer_address: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Barrio
                <input className="h-10 rounded-md border border-line px-3 text-sm" value={editForm.customer_neighborhood} onChange={(event) => setEditForm((prev) => ({ ...prev, customer_neighborhood: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700 md:col-span-2">
                Observaciones *
                <textarea className="min-h-[72px] rounded-md border border-line px-3 py-2 text-sm" value={editForm.notes} onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))} />
              </label>
            </section>
            <div className="grid gap-2 border-t border-line pt-3 sm:flex sm:justify-end">
              <button className="h-10 rounded-md border border-line px-4 text-sm font-semibold" onClick={() => { setEditingOrder(null); setValidationIssues([]); setEditError(""); }} type="button">Cancelar</button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={savingEdit} onClick={saveEdit} type="button">
                <Save size={16} /> {savingEdit ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {validationIssues.length ? (
        <ModalFrame title="Faltan datos para guardar" onClose={() => setValidationIssues([])} maxWidth="max-w-md">
          <div className="space-y-4">
            <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
              <div>
                <p className="font-semibold">La orden no se guardo porque falta completar informacion obligatoria.</p>
                <p className="mt-1 text-amber-900">Si el estado queda en Pendiente, la referencia, el tecnico responsable y la fecha del servicio son obligatorios.</p>
              </div>
            </div>
            <ul className="grid gap-2 text-sm text-neutral-700">
              {validationIssues.map((issue) => (
                <li className="rounded-md border border-line bg-paper px-3 py-2 font-medium" key={issue}>{issue}</li>
              ))}
            </ul>
            <div className="flex justify-end border-t border-line pt-3">
              <button className="h-10 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => setValidationIssues([])} type="button">Entendido</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {!technicianMode ? <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-[1fr_56px_56px] gap-2 border-t border-line bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden">
        <Link className="inline-flex h-14 min-w-0 items-center justify-center gap-2 rounded-md bg-apex px-3 text-base font-semibold text-white" href="/dashboard/servicios/nuevo">
          <Plus className="shrink-0" size={18} /> <span className="truncate">Nueva orden</span>
        </Link>
        <Link className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-line bg-white" href="/dashboard/servicios/referencias" aria-label="Referencias">
          <Settings2 size={20} />
        </Link>
        <Link className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-line bg-white" href="/dashboard/servicios/reportes" aria-label="Reportes">
          <BarChart3 size={20} />
        </Link>
      </div> : null}
    </div>
  );
}
