"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";
import { api, isServiceTechnicianSession } from "@/lib/api";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Wrench
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ServiceReference = { id: number | string; code: string; name: string };
type Technician = { id: number | string; code?: string; user?: { name?: string; email?: string } };
type ServiceType = { code: string; label: string; active?: boolean };
type ServiceStore = { code: string; label: string; active?: boolean };
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
};
type OrdersResponse = { data: ServiceOrder[] };
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

function serviceOrderHref(order: ServiceOrder) {
  if (!requiresAdminCompletion(order) && isOperableOrderId(order.id)) return `/dashboard/servicios/${order.id}`;
  const externalKey = String(order.number || order.id || "").trim();
  return `/dashboard/servicios?externa=${encodeURIComponent(externalKey)}`;
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
  const [sortBy, setSortBy] = useState("newest");
  const [message, setMessage] = useState("");
  const [technicianMode, setTechnicianMode] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [editForm, setEditForm] = useState<OrderEditForm>(emptyEditForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [handledExternalKey, setHandledExternalKey] = useState("");

  async function load() {
    try {
      setMessage("");
      const [apiResult, supabaseResult] = await Promise.allSettled([
        api<OrdersResponse>("/api/v1/services/orders?limit=200"),
        loadSupabaseMonitorOrders()
      ]);
      const apiOrders = apiResult.status === "fulfilled" ? apiResult.value.data : [];
      const supabaseOrders = supabaseResult.status === "fulfilled" ? supabaseResult.value : [];
      if (!apiOrders.length && !supabaseOrders.length && apiResult.status === "rejected") throw apiResult.reason;
      if (!apiOrders.length && !supabaseOrders.length && supabaseResult.status === "rejected") throw supabaseResult.reason;
      setOrders(mergeOrders([...supabaseOrders, ...apiOrders]).map(effectiveOrder));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar servicios.");
      setOrders([]);
    }
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
    load();
    if (!isTechnician) loadMasters();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return orders.filter((order) => {
      const matchesTerm = !term || [order.number, order.customer_name, order.customer_address, order.customer_phone, order.reference?.code, order.reference?.name, order.service_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
      const isExternalRequest = order.status === "agendado" || order.metadata?.public_request === true || order.metadata?.requires_admin_completion === true;
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
      return matchesTerm && (!status || order.status === status) && matchesDate && matchesEvidence && matchesRequestScope && (!serviceType || order.service_type === serviceType);
    }).sort((a, b) => {
      if (sortBy === "newest") return newestFirst(a, b);
      if (sortBy === "date_asc") return (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999");
      if (sortBy === "date_desc") return (b.scheduled_date || "").localeCompare(a.scheduled_date || "");
      if (sortBy === "order") return orderSequence(b.number) - orderSequence(a.number) || b.number.localeCompare(a.number);
      return priorityScore(a) - priorityScore(b) || newestFirst(a, b);
    });
  }, [dateScope, evidenceScope, orders, query, requestScope, serviceType, sortBy, status]);

  const serviceTypes = useMemo(() => [...new Set(orders.map((order) => order.service_type).filter(Boolean))].sort(), [orders]);
  const editableServiceTypes = serviceTypesCatalog.length ? serviceTypesCatalog : serviceTypes.map((type) => ({ code: type, label: statusLabel[type] || type }));
  const statusCounts = useMemo(() => orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {}), [orders]);
  const activeFilters = [status, dateScope, evidenceScope, requestScope, serviceType].filter(Boolean).length + (query.trim() ? 1 : 0);
  const externalRequestCompany = typeof window !== "undefined" ? localStorage.getItem("apexos_company_name") || "SCJ" : "SCJ";
  const externalRequestHref = `/servicios/solicitar?empresa=${encodeURIComponent(externalRequestCompany)}`;

  function clearFilters() {
    setQuery("");
    setStatus("");
    setDateScope("");
    setEvidenceScope("");
    setRequestScope("");
    setServiceType("");
    setSortBy("newest");
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
    const required: Array<[keyof OrderEditForm, string]> = [
      ["status", "estado"],
      ["service_type", "tipo de servicio"],
      ["scheduled_date", "fecha programada"],
      ["customer_name", "cliente"],
      ["customer_document", "cedula"],
      ["customer_phone", "telefono"],
      ["customer_address", "direccion"],
      ["notes", "observaciones"]
    ];
    if (editForm.status === "pendiente") {
      required.unshift(["reference_id", "referencia"], ["technician_id", "tecnico asignado"]);
    }
    const missing = required.filter(([key]) => !editForm[key].trim()).map(([, label]) => label);
    if (missing.length) {
      setMessage(`Completa los campos obligatorios: ${missing.join(", ")}.`);
      return;
    }
    setSavingEdit(true);
    setMessage("");
    try {
      const payload: Partial<OrderEditForm> = { ...editForm };
      delete payload.customer_neighborhood;
      delete payload.service_store;
      const selectedStore = serviceStores.find((item) => item.code === editForm.service_store);
      const metadata = {
        ...(editingOrder.metadata || {}),
        customer_document: editForm.customer_document.trim(),
        customer_neighborhood: editForm.customer_neighborhood.trim(),
        service_store: editForm.service_store,
        service_store_label: selectedStore?.label || String(editingOrder.metadata?.service_store_label || ""),
        requires_admin_completion: editForm.status === "agendado",
        external_order_id: !isLocalOrder(editingOrder) ? String(editingOrder.id) : String(editingOrder.metadata?.external_order_id || ""),
        external_order_number: !isLocalOrder(editingOrder) ? editingOrder.number : String(editingOrder.metadata?.external_order_number || "")
      };
      if (!editableOrderStatuses.has(editForm.status)) delete payload.status;
      if (!isLocalOrder(editingOrder)) {
        setMessage("No fue posible identificar la orden existente para actualizarla sin duplicar.");
        return;
      }
      await api<ServiceOrder>(`/api/v1/services/orders/${editingOrder.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...payload, metadata })
      });
      setMessage(editForm.status === "pendiente" ? "Orden enviada a pendiente correctamente." : "Orden actualizada correctamente.");
      setEditingOrder(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible actualizar la orden.");
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
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <div className="flex items-center gap-3">
          <Link className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-white md:hidden" href="/dashboard" aria-label="Volver al inicio">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-apex">{technicianMode ? "Perfil tecnico operativo" : "M-26 · Operacion de campo"}</p>
            <h1 className="truncate text-2xl font-semibold md:text-3xl">{technicianMode ? "Mis servicios activos" : "Servicios"}</h1>
            <p className="mt-1 hidden text-sm text-neutral-600 sm:block">{technicianMode ? "Aqui encuentras unicamente las ordenes asignadas que puedes atender." : "Monitor operativo para crear, ejecutar y controlar servicios tecnicos con evidencia."}</p>
          </div>
        </div>
      </header>

      <section className="apex-context-hero">
        <div className="relative z-10 flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="apex-eyebrow mb-3">
              <Sparkles size={14} />
              Centro operativo de servicios
            </div>
            <h2 className="max-w-3xl text-2xl font-semibold leading-tight sm:text-3xl">{technicianMode ? "Tu siguiente servicio esta aqui" : "Ordenes listas para gestionar"}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{mainMessage} {technicianMode ? "Selecciona una orden para iniciar o continuar el trabajo." : "Usa los filtros para encontrar rapidamente el siguiente servicio."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="apex-guide-chip">1. Revisa prioridad</span>
              <span className="apex-guide-chip">2. Filtra si necesitas</span>
              <span className="apex-guide-chip">3. Abre y ejecuta</span>
            </div>
          </div>
          {!technicianMode ? <div className="grid shrink-0 gap-2 sm:flex sm:flex-wrap">
            <Link className="apex-hero-action inline-flex min-w-0 items-center justify-center gap-2 px-5 text-sm font-semibold" href="/dashboard/servicios/nuevo">
              <Plus className="shrink-0" size={17} />
              <span className="truncate">Nueva orden</span>
            </Link>
            <Link className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" href={externalRequestHref} target="_blank">
              <Sparkles className="shrink-0" size={17} />
              <span className="truncate">Solicitudes de servicios externas</span>
            </Link>
            <Link className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" href="/dashboard/servicios/referencias">
              <Settings2 className="shrink-0" size={17} />
              <span className="truncate">Referencias</span>
            </Link>
            <Link className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" href="/dashboard/servicios/reportes">
              <BarChart3 className="shrink-0" size={17} />
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
              {activeFilters ? (
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-600 hover:border-apex hover:text-apex" onClick={clearFilters} type="button">
                  <RotateCcw size={15} /> Limpiar {activeFilters} filtro(s)
                </button>
              ) : null}
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

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
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
            <p className="hidden text-xs font-medium text-neutral-500 md:block">Selecciona una orden para consultar o continuar el servicio.</p>
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
                      <span className="inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-md bg-white px-3 text-xs font-semibold text-apex shadow-sm ring-1 ring-line sm:w-auto">
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
                  <col className="w-[15%]" />
                  <col className="w-[19%]" />
                  <col className="w-[31%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead className="bg-paper text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  <tr>
                    <th>Orden y estado</th>
                    <th>Cliente y ubicacion</th>
                    <th>Servicio</th>
                    <th>Agenda</th>
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
                        <p className="mt-1 text-xs text-neutral-500">{order.customer_phone || "Sin telefono"}</p>
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
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-paper px-2 py-1.5 text-[11px] font-medium text-neutral-600">
                          <span>{order.photos.length} foto</span>
                          <span className="h-3 w-px bg-line" />
                          <span className={order.incidents.length ? "font-semibold text-amber-700" : ""}>{order.incidents.length} nov.</span>
                        </div>
                      </td>
                      <td className="text-right align-middle">
                        {editAllowed(order) ? (
                          <button className="mb-1.5 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:border-apex hover:text-apex" onClick={() => openEdit(order)} type="button">
                            <Pencil size={14} /> Editar
                          </button>
                        ) : null}
                        <Link className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-semibold text-apex shadow-sm transition group-hover:border-apex" href={serviceOrderHref(order)}>
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
        <ModalFrame title={`Editar ${editingOrder.number}`} onClose={() => setEditingOrder(null)} maxWidth="max-w-3xl">
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Edita solo lo necesario. Las ordenes finalizadas se bloquean para proteger la trazabilidad del servicio.
            </div>
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
                Referencia {editForm.status === "pendiente" ? "*" : "(opcional hasta pasar a pendiente)"}
                <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={editForm.reference_id} onChange={(event) => setEditForm((prev) => ({ ...prev, reference_id: event.target.value }))}>
                  <option value="">Selecciona una referencia</option>
                  {references.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                </select>
                {externalReferenceText(editingOrder) ? (
                  <span className="text-xs font-medium text-neutral-500">Producto solicitado: {externalReferenceText(editingOrder)}</span>
                ) : null}
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Tecnico responsable {editForm.status === "pendiente" ? "*" : "(opcional en agendado)"}
                <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={editForm.technician_id} onChange={(event) => setEditForm((prev) => ({ ...prev, technician_id: event.target.value }))}>
                  <option value="">Selecciona un tecnico</option>
                  {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.code || "TEC"} - {technician.user?.name || technician.user?.email || "Tecnico"}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Tipo de servicio *
                <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={editForm.service_type} onChange={(event) => setEditForm((prev) => ({ ...prev, service_type: event.target.value }))}>
                  {editableServiceTypes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
                Fecha programada *
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
              <button className="h-10 rounded-md border border-line px-4 text-sm font-semibold" onClick={() => setEditingOrder(null)} type="button">Cancelar</button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={savingEdit} onClick={saveEdit} type="button">
                <Save size={16} /> {savingEdit ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {!technicianMode ? <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-[1fr_56px_56px] gap-2 border-t border-line bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur md:hidden">
        <Link className="inline-flex h-14 min-w-0 items-center justify-center gap-2 rounded-md bg-apex px-3 text-base font-semibold text-white shadow-sm" href="/dashboard/servicios/nuevo">
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
