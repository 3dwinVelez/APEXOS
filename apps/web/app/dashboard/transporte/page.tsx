"use client";

import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, FileCheck2, Filter, History, MapPin, Paperclip, Plus, RotateCcw, Save, Search, Truck, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type VehicleDocument = {
  id: number;
  document_type: string;
  file_name: string;
  file_url?: string;
  storage_path?: string;
  base64_data?: string;
  mime_type?: string;
  file_size?: number;
  issued_at?: string;
  expires_at?: string;
  document_status: string;
  observations?: string;
  version: number;
  active: boolean;
  uploaded_at?: string;
};

type VehicleAudit = {
  id: string;
  action: string;
  field?: string;
  old_value?: unknown;
  new_value?: unknown;
  created_at: string;
};

type Employee = { id: number; code?: string; position?: string; metadata?: { name?: string; document?: string }; user?: { name?: string } };

type Vehicle = {
  id: number;
  plate: string;
  type: string;
  category?: string;
  brand: string;
  line?: string;
  model?: string;
  year?: number;
  color?: string;
  vin_chassis?: string;
  engine_number?: string;
  cylinder_capacity?: string;
  fuel?: string;
  body_type?: string;
  axle_count?: number;
  load_capacity?: string;
  capacity_value?: number;
  capacity_unit?: string;
  volume_available?: number;
  mileage?: number;
  ownership_type: string;
  legal_owner?: string;
  owner?: string;
  owner_document?: string;
  linked_company?: string;
  cost_center?: string;
  base_site: string;
  authorized_driver_id?: number;
  authorized_driver_name?: string;
  authorized_driver_document?: string;
  authorized_driver_code?: string;
  linked_at?: string;
  unlinked_at?: string;
  status: string;
  master_status: string;
  document_status: string;
  master_score: number;
  critical_expiry_at?: string;
  soat_issued_at?: string;
  soat_expires?: string;
  technical_review_issued_at?: string;
  technical_review_expires?: string;
  property_card?: string;
  contractual_policy_expires?: string;
  extra_contractual_policy_expires?: string;
  cargo_registry?: string;
  special_permits?: string;
  normative_restrictions?: string;
  insurance_expires?: string;
  legal_notes?: string;
  notes?: string;
  documents?: VehicleDocument[];
  audit_logs?: VehicleAudit[];
  dashboard_metrics?: {
    soat_days_remaining?: number | null;
    technical_review_days_remaining?: number | null;
    expired_documents: number;
    expiring_documents: number;
    score_label: string;
  };
};

const emptyVehicle = {
  plate: "",
  type: "",
  category: "",
  brand: "",
  line: "",
  model: "",
  year: new Date().getFullYear(),
  color: "",
  vin_chassis: "",
  engine_number: "",
  cylinder_capacity: "",
  fuel: "",
  body_type: "",
  axle_count: 2,
  capacity_value: 0,
  capacity_unit: "kg",
  volume_available: 0,
  mileage: 0,
  ownership_type: "propio",
  legal_owner: "",
  owner_document: "",
  linked_company: "",
  cost_center: "",
  base_site: "",
  authorized_driver_id: 0,
  authorized_driver_name: "",
  authorized_driver_document: "",
  authorized_driver_code: "",
  linked_at: new Date().toISOString().slice(0, 10),
  unlinked_at: "",
  status: "activo",
  soat_issued_at: "",
  soat_expires: "",
  technical_review_issued_at: "",
  technical_review_expires: "",
  property_card: "",
  contractual_policy_expires: "",
  extra_contractual_policy_expires: "",
  cargo_registry: "",
  special_permits: "",
  normative_restrictions: "",
  legal_notes: "",
  notes: ""
};

const tabs = ["Identificacion", "Operacion y propiedad", "Documentos", "Adjuntos", "Datos tecnicos", "Auditoria"];
const creationTabs = tabs.slice(0, 3);
const completionFields = [
  ["plate", "placa"],
  ["type", "tipo de vehiculo"],
  ["brand", "marca"],
  ["line", "linea o referencia"],
  ["color", "color"],
  ["fuel", "combustible"],
  ["body_type", "carroceria"],
  ["capacity_value", "capacidad"],
  ["ownership_type", "tipo de propiedad"],
  ["legal_owner", "propietario legal"],
  ["base_site", "sede base"],
  ["authorized_driver_name", "conductor autorizado"],
  ["soat_issued_at", "emision del SOAT"],
  ["soat_expires", "vencimiento del SOAT"],
  ["technical_review_issued_at", "emision tecnico-mecanica"],
  ["technical_review_expires", "vencimiento tecnico-mecanica"],
  ["property_card", "tarjeta de propiedad"],
  ["vin_chassis", "VIN o chasis"]
] as const;
const documentTypes = [
  ["soat", "SOAT"],
  ["revision_tecnico_mecanica", "Tecnico-mecanica"],
  ["tarjeta_propiedad", "Tarjeta de propiedad"],
  ["poliza_contractual", "Poliza contractual"],
  ["poliza_extracontractual", "Poliza extracontractual"],
  ["contrato_renting_leasing", "Contrato renting/leasing"],
  ["contrato_transportador", "Contrato transportador tercero"],
  ["registro_nacional_carga", "Registro Nacional de Carga"],
  ["certificado_especial", "Certificado especial"],
  ["foto_general", "Foto general"],
  ["otro", "Otro documento"]
];

function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    apto_documentalmente: "Apto documentalmente",
    pendiente_documentacion: "Pendiente documentacion",
    documento_proximo_a_vencer: "Documento proximo a vencer",
    bloqueado_documental: "Bloqueado documental",
    retirado: "Retirado",
    inactivo: "Inactivo"
  };
  return labels[status] || status || "Pendiente";
}

function scoreLabel(score: number) {
  if (score >= 90) return "Ficha confiable";
  if (score >= 70) return "Ficha aceptable";
  if (score >= 50) return "Ficha incompleta";
  return "Ficha critica";
}

function statusClass(status: string) {
  if (status === "apto_documentalmente") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "documento_proximo_a_vencer") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "bloqueado_documental") return "border-red-200 bg-red-50 text-red-800";
  return "border-line bg-paper text-neutral-700";
}

function vehicleCompletion(source: object) {
  const record = source as Record<string, unknown>;
  const missing = completionFields.filter(([field]) => {
    const value = record[field];
    return value === undefined || value === null || value === "" || value === 0;
  });
  return {
    percent: Math.round(((completionFields.length - missing.length) / completionFields.length) * 100),
    missing: missing.map(([, label]) => label)
  };
}

function readFile(file: File) {
  return new Promise<{ base64_data: string; file_name: string; mime_type: string; file_size: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64_data: String(reader.result || ""), file_name: file.name, mime_type: file.type, file_size: file.size });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function vehiclePayload(form: typeof emptyVehicle) {
  const payload: Record<string, string | number> = { ...form, plate: form.plate.toUpperCase().replace(/\s+/g, "") };
  if (!Number(payload.capacity_value)) delete payload.capacity_value;
  if (!Number(payload.volume_available)) delete payload.volume_available;
  return payload;
}

export default function TransportPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({ ...emptyVehicle });
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [showEditor, setShowEditor] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [ownershipFilter, setOwnershipFilter] = useState("");
  const [sortBy, setSortBy] = useState("attention");
  const [saving, setSaving] = useState(false);
  const [documentDraft, setDocumentDraft] = useState({
    document_type: "soat",
    file_name: "",
    base64_data: "",
    mime_type: "",
    file_size: 0,
    issued_at: "",
    expires_at: "",
    observations: ""
  });

  async function load() {
    setMessage("");
    const [vehicleResult, employeeResult] = await Promise.allSettled([
      api<Vehicle[]>("/api/v1/transport/vehicles"),
      api<Employee[]>("/api/v1/hr/employees?active=true")
    ]);
    if (vehicleResult.status === "fulfilled") setVehicles(vehicleResult.value);
    else setVehicles([]);
    if (employeeResult.status === "fulfilled") setEmployees(employeeResult.value);
    else setEmployees([]);

    const errors = [
      vehicleResult.status === "rejected" ? "vehiculos" : "",
      employeeResult.status === "rejected" ? "conductores/usuarios" : ""
    ].filter(Boolean);
    if (errors.length) {
      setMessage(`No fue posible consultar ${errors.join(" y ")}. Revisa permisos RLS, empresa activa o conectividad Supabase.`);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openVehicle(vehicle: Vehicle) {
    const detail = await api<Vehicle>(`/api/v1/transport/vehicles/${vehicle.id}`).catch(() => vehicle);
    setSelected(detail);
    setForm({
      ...emptyVehicle,
      ...detail,
      line: detail.line || detail.model || "",
      linked_at: dateOnly(detail.linked_at),
      unlinked_at: dateOnly(detail.unlinked_at),
      authorized_driver_id: detail.authorized_driver_id || 0,
      authorized_driver_name: detail.authorized_driver_name || "",
      authorized_driver_document: detail.authorized_driver_document || "",
      authorized_driver_code: detail.authorized_driver_code || "",
      soat_issued_at: dateOnly(detail.soat_issued_at),
      soat_expires: dateOnly(detail.soat_expires),
      technical_review_issued_at: dateOnly(detail.technical_review_issued_at),
      technical_review_expires: dateOnly(detail.technical_review_expires),
      contractual_policy_expires: dateOnly(detail.contractual_policy_expires),
      extra_contractual_policy_expires: dateOnly(detail.extra_contractual_policy_expires)
    });
    setActiveTab(tabs[0]);
    setShowEditor(true);
  }

  function newVehicle() {
    setSelected(null);
    setForm({ ...emptyVehicle });
    setDocumentDraft({ document_type: "soat", file_name: "", base64_data: "", mime_type: "", file_size: 0, issued_at: "", expires_at: "", observations: "" });
    setActiveTab(tabs[0]);
    setShowEditor(true);
  }

  function setField(field: string, value: string | number) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function employeeName(employee: Employee) {
    return employee.metadata?.name || employee.user?.name || employee.code || `Empleado ${employee.id}`;
  }

  function chooseDriver(employeeId: number) {
    const employee = employees.find((item) => item.id === employeeId);
    setForm((current) => ({
      ...current,
      authorized_driver_id: employeeId,
      authorized_driver_name: employee ? employeeName(employee) : "",
      authorized_driver_document: employee?.metadata?.document || "",
      authorized_driver_code: employee?.code || ""
    }));
  }

  function validateForm() {
    if (!form.plate.trim() || !form.type.trim() || !form.brand.trim() || !form.ownership_type.trim() || !form.base_site.trim()) {
      return "Placa, tipo, marca, propiedad y sede base son obligatorios.";
    }
    if (form.soat_issued_at && form.soat_expires && form.soat_expires < form.soat_issued_at) return "El vencimiento SOAT no puede ser anterior a la emision.";
    if (form.technical_review_issued_at && form.technical_review_expires && form.technical_review_expires < form.technical_review_issued_at) return "El vencimiento tecnico-mecanica no puede ser anterior a la emision.";
    if (Number(form.capacity_value) < 0) return "La capacidad de carga no puede ser negativa.";
    return "";
  }

  async function saveVehicle() {
    const validation = validateForm();
    if (validation) {
      setMessage(validation);
      return;
    }
    setSaving(true);
    try {
      const payload = vehiclePayload(form);
      const saved = selected
        ? await api<Vehicle>(`/api/v1/transport/vehicles/${selected.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Vehicle>("/api/v1/transport/vehicles", { method: "POST", body: JSON.stringify(payload) });
      setSelected(saved);
      setMessage("Ficha maestra vehicular guardada.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar el vehiculo.");
    } finally {
      setSaving(false);
    }
  }

  async function selectDocument(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessage("El archivo supera 10 MB.");
      return;
    }
    const fileData = await readFile(file);
    setDocumentDraft((current) => ({ ...current, ...fileData }));
  }

  async function saveDocument() {
    if (!selected?.id) {
      setMessage("Guarda primero la ficha del vehiculo.");
      return;
    }
    if (!documentDraft.document_type || !documentDraft.file_name) {
      setMessage("Selecciona tipo documental y archivo.");
      return;
    }
    try {
      const saved = await api<VehicleDocument>(`/api/v1/transport/vehicles/${selected.id}/documents`, { method: "POST", body: JSON.stringify(documentDraft) });
      const detail = await api<Vehicle>(`/api/v1/transport/vehicles/${selected.id}`);
      setSelected(detail);
      setVehicles((current) => current.map((vehicle) => vehicle.id === detail.id ? detail : vehicle));
      setDocumentDraft({ document_type: "soat", file_name: "", base64_data: "", mime_type: "", file_size: 0, issued_at: "", expires_at: "", observations: "" });
      setMessage(`Documento ${saved.file_name} cargado.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible adjuntar el documento.");
    }
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const statusPriority: Record<string, number> = {
      bloqueado_documental: 0,
      documento_proximo_a_vencer: 1,
      pendiente_documentacion: 2,
      apto_documentalmente: 3,
      inactivo: 4,
      retirado: 5
    };
    return vehicles
      .filter((vehicle) => !term || [vehicle.plate, vehicle.brand, vehicle.line, vehicle.model, vehicle.type, vehicle.base_site, vehicle.ownership_type, vehicle.authorized_driver_name].join(" ").toLowerCase().includes(term))
      .filter((vehicle) => !statusFilter || vehicle.master_status === statusFilter)
      .filter((vehicle) => !siteFilter || vehicle.base_site === siteFilter)
      .filter((vehicle) => !ownershipFilter || vehicle.ownership_type === ownershipFilter)
      .sort((a, b) => {
        if (sortBy === "plate") return a.plate.localeCompare(b.plate);
        if (sortBy === "score_desc") return (b.master_score || 0) - (a.master_score || 0);
        if (sortBy === "score_asc") return (a.master_score || 0) - (b.master_score || 0);
        return (statusPriority[a.master_status] ?? 9) - (statusPriority[b.master_status] ?? 9) || (a.master_score || 0) - (b.master_score || 0);
      });
  }, [ownershipFilter, query, siteFilter, sortBy, statusFilter, vehicles]);

  const metrics = useMemo(() => ({
    total: vehicles.length,
    blocked: vehicles.filter((vehicle) => vehicle.master_status === "bloqueado_documental").length,
    warning: vehicles.filter((vehicle) => vehicle.master_status === "documento_proximo_a_vencer").length,
    avgScore: vehicles.length ? Math.round(vehicles.reduce((sum, vehicle) => sum + (vehicle.master_score || 0), 0) / vehicles.length) : 0
  }), [vehicles]);
  const ready = vehicles.filter((vehicle) => vehicle.master_status === "apto_documentalmente").length;
  const incomplete = vehicles.filter((vehicle) => (vehicle.master_score || 0) < 70).length;
  const sites = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.base_site).filter(Boolean))].sort(), [vehicles]);
  const ownershipTypes = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.ownership_type).filter(Boolean))].sort(), [vehicles]);
  const activeFilters = [statusFilter, siteFilter, ownershipFilter].filter(Boolean).length + (query.trim() ? 1 : 0);
  const editorTabs = selected ? tabs : creationTabs;
  const activeTabIndex = editorTabs.indexOf(activeTab);
  const formCompletion = vehicleCompletion(form);

  function clearFilters() {
    setQuery("");
    setStatusFilter("");
    setSiteFilter("");
    setOwnershipFilter("");
    setSortBy("attention");
  }

  function moveEditor(direction: number) {
    const next = editorTabs[activeTabIndex + direction];
    if (next) setActiveTab(next);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-apex">M-14 · Maestro de flota</p>
          <h1 className="mt-1 text-3xl font-semibold">Vehiculos</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Consulta el estado de cada placa, corrige documentos y mantén la flota lista para Planeacion.</p>
        </div>
        <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white hover:bg-apex/90" onClick={newVehicle} type="button"><Plus size={17} /> Crear vehiculo</button>
      </header>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="overflow-hidden rounded-md border border-line bg-white" id="flota-maestra">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Consulta de flota</h2>
              <p className="text-sm text-neutral-600">Compara placas y abre una ficha solo cuando necesites actuar.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold text-neutral-600">
              <span className="rounded-md border border-line px-3 py-1.5">{filtered.length} de {vehicles.length} vehiculo(s)</span>
              <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-700">{ready} aptos</span>
              <span className={`rounded-md px-3 py-1.5 ${metrics.blocked + metrics.warning ? "bg-amber-50 text-amber-800" : "bg-paper text-neutral-600"}`}>{metrics.blocked + metrics.warning} por revisar</span>
              <span className="rounded-md bg-paper px-3 py-1.5">Score {metrics.avgScore}/100 · {scoreLabel(metrics.avgScore)}</span>
              {incomplete ? <span className="rounded-md bg-amber-50 px-3 py-1.5 text-amber-800">{incomplete} incompletas</span> : null}
            </div>
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(150px,auto))]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar placa, marca, sede o conductor" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={[
              ["", "Todos los estados"],
              ["bloqueado_documental", "Bloqueados"],
              ["documento_proximo_a_vencer", "Proximos a vencer"],
              ["pendiente_documentacion", "Pendientes de documentos"],
              ["apto_documentalmente", "Aptos documentalmente"],
              ["inactivo", "Inactivos"],
              ["retirado", "Retirados"]
            ]} />
            <FilterSelect value={siteFilter} onChange={setSiteFilter} options={[["", "Todas las sedes"], ...sites.map((site) => [site, site] as [string, string])]} />
            <FilterSelect value={ownershipFilter} onChange={setOwnershipFilter} options={[["", "Toda propiedad"], ...ownershipTypes.map((type) => [type, type] as [string, string])]} />
            <FilterSelect value={sortBy} onChange={setSortBy} options={[["attention", "Prioridad documental"], ["plate", "Placa A-Z"], ["score_asc", "Menor score"], ["score_desc", "Mayor score"]]} />
          </div>
          {activeFilters ? (
            <button className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-700 hover:bg-paper" onClick={clearFilters} type="button"><RotateCcw size={15} /> Limpiar {activeFilters} filtro(s)</button>
          ) : null}
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {filtered.map((vehicle) => (
            <button className="rounded-md border border-line p-4 text-left hover:border-apex hover:bg-paper" key={vehicle.id} onClick={() => openVehicle(vehicle)} type="button">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xl font-semibold">{vehicle.plate}</p><p className="text-sm text-neutral-600">{vehicle.brand} {vehicle.line || vehicle.model || ""}</p></div>
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(vehicle.master_status)}`}>{statusLabel(vehicle.master_status)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3"><Info label="Sede" value={vehicle.base_site || "-"} /><Info label="Conductor" value={vehicle.authorized_driver_name || "Sin asignar"} /><Info label="Propiedad" value={vehicle.ownership_type || "-"} /><Info label="Score" value={`${vehicle.master_score || 0}/100`} /></div>
              <CompletionBar className="mt-4" percent={vehicleCompletion(vehicle).percent} />
            </button>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="px-4 py-3">Vehiculo</th><th className="px-4 py-3">Estado y completitud</th><th className="px-4 py-3">Sede y propiedad</th><th className="px-4 py-3">Conductor autorizado</th><th className="px-4 py-3">Vencimientos</th><th className="px-4 py-3 text-right">Accion</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((vehicle) => (
                <tr className="hover:bg-paper/70" key={vehicle.id}>
                  <td className="px-4 py-3"><p className="font-semibold">{vehicle.plate}</p><p className="text-xs text-neutral-500">{vehicle.brand || "-"} {vehicle.line || vehicle.model || ""} {vehicle.year ? `· ${vehicle.year}` : ""}</p></td>
                  <td className="min-w-52 px-4 py-3"><span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(vehicle.master_status)}`}>{statusLabel(vehicle.master_status)}</span><CompletionBar className="mt-2" compact percent={vehicleCompletion(vehicle).percent} /></td>
                  <td className="px-4 py-3"><p className="font-medium">{vehicle.base_site || "Sin sede"}</p><p className="text-xs capitalize text-neutral-500">{vehicle.ownership_type || "Sin propiedad"}</p></td>
                  <td className="px-4 py-3"><p className="font-medium">{vehicle.authorized_driver_name || "Sin asignar"}</p><p className="text-xs text-neutral-500">{vehicle.authorized_driver_code || vehicle.authorized_driver_document || "Disponible para asignacion"}</p></td>
                  <td className="px-4 py-3"><p>SOAT: <strong>{vehicle.dashboard_metrics?.soat_days_remaining ?? "--"} dias</strong></p><p className="text-xs text-neutral-500">Tec-mec: {vehicle.dashboard_metrics?.technical_review_days_remaining ?? "--"} dias</p></td>
                  <td className="px-4 py-3 text-right"><button className="h-9 rounded-md border border-line px-3 text-sm font-semibold hover:border-apex hover:bg-white" onClick={() => openVehicle(vehicle)} type="button">Abrir ficha</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <div className="p-10 text-center"><Filter className="mx-auto text-neutral-300" size={28} /><p className="mt-3 text-sm font-semibold">No hay vehiculos con estos filtros</p><p className="mt-1 text-sm text-neutral-500">Limpia los filtros o crea una nueva ficha.</p></div> : null}
      </section>

      {showEditor ? (
        <ModalFrame title={selected ? `Ficha vehicular · ${selected.plate}` : "Crear vehiculo"} onClose={() => setShowEditor(false)} maxWidth="md:max-w-6xl">
          <div className="space-y-4">
            <div className="rounded-md border border-apex/20 bg-[#146C630D] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-apex shadow-sm">{tabIcon(activeTab, 20)}</span>
                  <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-apex">{selected ? "Mantenimiento de ficha" : `Paso ${activeTabIndex + 1} de ${editorTabs.length}`}</p>
                  <h2 className="mt-1 text-lg font-semibold">{editorGuide(activeTab).title}</h2>
                  <p className="mt-1 max-w-3xl text-sm text-neutral-600">{editorGuide(activeTab).detail}</p>
                  </div>
                </div>
                {selected ? <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(selected.master_status)}`}>{statusLabel(selected.master_status)}</span> : null}
              </div>
              <div className="mt-4 rounded-md border border-white bg-white/80 p-3">
                <CompletionBar percent={formCompletion.percent} />
                <p className="mt-2 text-xs text-neutral-600">
                  {formCompletion.missing.length
                    ? `Siguiente recomendado: ${formCompletion.missing.slice(0, 3).join(", ")}.`
                    : "La informacion principal del vehiculo esta completa."}
                </p>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {editorTabs.map((tab, index) => (
                  <button className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-semibold ${activeTab === tab ? "border-apex bg-white text-apex" : "border-line bg-white/60 text-neutral-600 hover:bg-white"}`} key={tab} onClick={() => setActiveTab(tab)} type="button">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${index < activeTabIndex ? "bg-emerald-100 text-emerald-700" : activeTab === tab ? "bg-apex text-white" : "bg-paper text-neutral-500"}`}>{index < activeTabIndex ? <CheckCircle2 size={15} /> : tabIcon(tab, 15)}</span>
                    <span><span className="block text-[10px] font-medium uppercase tracking-wide opacity-60">Etapa {index + 1}</span>{tab}</span>
                  </button>
                ))}
              </div>
            </div>

            {activeTab === "Identificacion" ? (
              <FormGrid>
                <Input label="Placa *" value={form.plate} onChange={(value) => setField("plate", value.toUpperCase().replace(/\s+/g, ""))} />
                <Input label="Tipo de vehiculo *" value={form.type} onChange={(value) => setField("type", value)} />
                <Input label="Categoria vehicular" value={form.category} onChange={(value) => setField("category", value)} />
                <Input label="Marca *" value={form.brand} onChange={(value) => setField("brand", value)} />
                <Input label="Linea / referencia" value={form.line} onChange={(value) => setField("line", value)} />
                <Input label="Modelo / ano" type="number" value={form.year} onChange={(value) => setField("year", Number(value))} />
                <Input label="Color" value={form.color} onChange={(value) => setField("color", value)} />
                <Input label="Combustible" value={form.fuel} onChange={(value) => setField("fuel", value)} />
                <Input label="Carroceria" value={form.body_type} onChange={(value) => setField("body_type", value)} />
                <Input label="Capacidad" type="number" value={form.capacity_value} onChange={(value) => setField("capacity_value", Number(value))} />
                <Input label="Unidad" value={form.capacity_unit} onChange={(value) => setField("capacity_unit", value)} />
                <Input label="Volumen disponible" type="number" value={form.volume_available} onChange={(value) => setField("volume_available", Number(value))} />
                <Textarea label="Observaciones generales" value={form.notes} onChange={(value) => setField("notes", value)} />
              </FormGrid>
            ) : null}

            {activeTab === "Operacion y propiedad" ? (
              <FormGrid>
                <Select label="Tipo de propiedad *" value={form.ownership_type} onChange={(value) => setField("ownership_type", value)} options={["propio", "tercero", "renting", "leasing", "proveedor", "temporal"]} />
                <Input label="Propietario legal" value={form.legal_owner} onChange={(value) => setField("legal_owner", value)} />
                <Input label="NIT / documento" value={form.owner_document} onChange={(value) => setField("owner_document", value)} />
                <Input label="Empresa vinculada" value={form.linked_company} onChange={(value) => setField("linked_company", value)} />
                <Input label="Centro de costo" value={form.cost_center} onChange={(value) => setField("cost_center", value)} />
                <Input label="Sede o bodega base *" value={form.base_site} onChange={(value) => setField("base_site", value)} />
                <Select
                  label="Conductor autorizado"
                  value={String(form.authorized_driver_id || 0)}
                  onChange={(value) => chooseDriver(Number(value))}
                  options={["0", ...employees.map((employee) => String(employee.id))]}
                  optionLabels={{ "0": "Sin conductor asociado", ...Object.fromEntries(employees.map((employee) => [String(employee.id), `${employeeName(employee)}${employee.code ? ` · ${employee.code}` : ""}`])) }}
                />
                <Input label="Conductor externo / manual" value={form.authorized_driver_name} onChange={(value) => setField("authorized_driver_name", value)} />
                <Input label="Documento conductor" value={form.authorized_driver_document} onChange={(value) => setField("authorized_driver_document", value)} />
                <Input label="Fecha vinculacion" type="date" value={form.linked_at} onChange={(value) => setField("linked_at", value)} />
                <Input label="Fecha desvinculacion" type="date" value={form.unlinked_at} onChange={(value) => setField("unlinked_at", value)} />
                <Select label="Estado maestro" value={form.status} onChange={(value) => setField("status", value)} options={["activo", "inactivo", "bloqueado", "retirado", "pendiente_validacion"]} />
              </FormGrid>
            ) : null}

            {activeTab === "Documentos" ? (
              <FormGrid>
                <Input label="Fecha emision SOAT" type="date" value={form.soat_issued_at} onChange={(value) => setField("soat_issued_at", value)} />
                <Input label="Vencimiento SOAT" type="date" value={form.soat_expires} onChange={(value) => setField("soat_expires", value)} />
                <Input label="Emision tecnico-mecanica" type="date" value={form.technical_review_issued_at} onChange={(value) => setField("technical_review_issued_at", value)} />
                <Input label="Vencimiento tecnico-mecanica" type="date" value={form.technical_review_expires} onChange={(value) => setField("technical_review_expires", value)} />
                <Input label="Tarjeta propiedad / licencia" value={form.property_card} onChange={(value) => setField("property_card", value)} />
                <Input label="Vence poliza contractual" type="date" value={form.contractual_policy_expires} onChange={(value) => setField("contractual_policy_expires", value)} />
                <Input label="Vence poliza extracontractual" type="date" value={form.extra_contractual_policy_expires} onChange={(value) => setField("extra_contractual_policy_expires", value)} />
                <Input label="Registro Nacional de Carga" value={form.cargo_registry} onChange={(value) => setField("cargo_registry", value)} />
                <Textarea label="Habilitaciones / restricciones" value={form.special_permits || form.normative_restrictions} onChange={(value) => setField("normative_restrictions", value)} />
                <Textarea label="Observaciones legales" value={form.legal_notes} onChange={(value) => setField("legal_notes", value)} />
              </FormGrid>
            ) : null}

            {activeTab === "Adjuntos" ? (
              <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <div className="rounded-md border border-line p-3">
                  <h3 className="mb-3 text-sm font-semibold">Cargar documento por placa</h3>
                  <div className="space-y-3">
                    <Select label="Tipo documental" value={documentDraft.document_type} onChange={(value) => setDocumentDraft((current) => ({ ...current, document_type: value }))} options={documentTypes.map(([value]) => value)} optionLabels={Object.fromEntries(documentTypes)} />
                    <input className="block w-full text-sm" type="file" onChange={(event) => selectDocument(event.target.files?.[0])} />
                    {documentDraft.file_name ? <p className="rounded-md bg-paper p-2 text-xs font-semibold">{documentDraft.file_name}</p> : null}
                    <Input label="Fecha emision" type="date" value={documentDraft.issued_at} onChange={(value) => setDocumentDraft((current) => ({ ...current, issued_at: value }))} />
                    <Input label="Fecha vencimiento" type="date" value={documentDraft.expires_at} onChange={(value) => setDocumentDraft((current) => ({ ...current, expires_at: value }))} />
                    <Textarea label="Observaciones" value={documentDraft.observations} onChange={(value) => setDocumentDraft((current) => ({ ...current, observations: value }))} />
                    <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={saveDocument} type="button"><Paperclip size={16} /> Adjuntar</button>
                  </div>
                </div>
                <div className="rounded-md border border-line p-3">
                  <h3 className="mb-3 text-sm font-semibold">Documentos cargados</h3>
                  <div className="space-y-2">
                    {(selected?.documents || []).map((document) => (
                      <div className="rounded-md border border-line p-3" key={document.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{document.file_name}</p>
                            <p className="text-xs text-neutral-500">{document.document_type} · v{document.version}</p>
                          </div>
                          <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(document.document_status)}`}>{statusLabel(document.document_status)}</span>
                        </div>
                        <p className="mt-2 text-xs text-neutral-500">Vence: {dateOnly(document.expires_at) || "Sin vencimiento"} · Ruta: {document.storage_path || "--"}</p>
                      </div>
                    ))}
                    {!selected?.documents?.length ? <p className="text-sm text-neutral-500">Sin adjuntos aun. Guarda la ficha y carga documentos por placa.</p> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "Datos tecnicos" ? (
              <FormGrid>
                <Input label="VIN / chasis" value={form.vin_chassis} onChange={(value) => setField("vin_chassis", value)} />
                <Input label="Numero de motor" value={form.engine_number} onChange={(value) => setField("engine_number", value)} />
                <Input label="Cilindraje" value={form.cylinder_capacity} onChange={(value) => setField("cylinder_capacity", value)} />
                <Input label="Numero de ejes" type="number" value={form.axle_count} onChange={(value) => setField("axle_count", Number(value))} />
                <Input label="Kilometraje base" type="number" value={form.mileage} onChange={(value) => setField("mileage", Number(value))} />
                <Input label="Restricciones ambientales" value={form.normative_restrictions} onChange={(value) => setField("normative_restrictions", value)} />
              </FormGrid>
            ) : null}

            {activeTab === "Auditoria" ? (
              <div className="rounded-md border border-line p-3">
                <h3 className="mb-3 text-sm font-semibold">Cambios criticos de ficha</h3>
                <div className="space-y-2">
                  {(selected?.audit_logs || []).map((entry) => (
                    <div className="rounded-md bg-paper p-3 text-sm" key={String(entry.id)}>
                      <p className="font-semibold">{entry.action} {entry.field ? `· ${entry.field}` : ""}</p>
                      <p className="text-xs text-neutral-500">{new Date(entry.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                  {!selected?.audit_logs?.length ? <p className="text-sm text-neutral-500">La auditoria aparecera al crear, editar o adjuntar documentos.</p> : null}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => setShowEditor(false)} type="button"><Archive size={16} /> Cerrar</button>
              <div className="flex flex-wrap gap-2">
                {activeTabIndex > 0 ? <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => moveEditor(-1)} type="button"><ChevronLeft size={16} /> Anterior</button> : null}
                {activeTabIndex < editorTabs.length - 1 ? <button className="inline-flex h-10 items-center gap-2 rounded-md border border-apex px-3 text-sm font-semibold text-apex hover:bg-paper" onClick={() => moveEditor(1)} type="button">Siguiente <ChevronRight size={16} /></button> : null}
                <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" onClick={saveVehicle} disabled={saving} type="button"><Save size={16} /> {saving ? "Guardando..." : selected ? "Guardar cambios" : "Crear vehiculo"}</button>
              </div>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function CompletionBar({ percent, compact = false, className = "" }: { percent: number; compact?: boolean; className?: string }) {
  const tone = percent >= 85 ? "bg-emerald-500" : percent >= 60 ? "bg-amber-500" : "bg-red-500";
  const label = percent >= 85 ? "Completa" : percent >= 60 ? "En progreso" : "Requiere datos";
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-neutral-700"><ClipboardList size={compact ? 13 : 15} /> Completitud de ficha</span>
        <span className="font-semibold text-neutral-600">{percent}%{compact ? "" : ` · ${label}`}</span>
      </div>
      <div className={`${compact ? "mt-1 h-1.5" : "mt-2 h-2"} overflow-hidden rounded-full bg-neutral-200`} role="progressbar" aria-label="Completitud de la ficha vehicular" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function tabIcon(tab: string, size = 16) {
  const icons: Record<string, ReactNode> = {
    Identificacion: <Truck size={size} />,
    "Operacion y propiedad": <MapPin size={size} />,
    Documentos: <FileCheck2 size={size} />,
    Adjuntos: <Paperclip size={size} />,
    "Datos tecnicos": <Wrench size={size} />,
    Auditoria: <History size={size} />
  };
  return icons[tab] || <ClipboardList size={size} />;
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([option, label]) => <option key={option || label} value={option}>{label}</option>)}</select>;
}

function editorGuide(tab: string) {
  const guides: Record<string, { title: string; detail: string }> = {
    Identificacion: { title: "Identifica el vehiculo", detail: "Empieza con placa, tipo y marca. Agrega solo los datos que ayudan a reconocer y planear el uso del vehiculo." },
    "Operacion y propiedad": { title: "Define quien y donde lo opera", detail: "Indica propiedad, sede base y conductor autorizado. Estos datos alimentan Planeacion y control operativo." },
    Documentos: { title: "Registra vigencias esenciales", detail: "Completa SOAT y tecnico-mecanica para que APEXOS calcule disponibilidad y alertas documentales." },
    Adjuntos: { title: "Conserva soportes por placa", detail: "Carga documentos legibles con fecha de emision y vencimiento para mantener trazabilidad." },
    "Datos tecnicos": { title: "Completa la ficha tecnica", detail: "Agrega VIN, motor, ejes y kilometraje cuando sean necesarios para mantenimiento o auditoria." },
    Auditoria: { title: "Revisa la trazabilidad", detail: "Consulta los cambios criticos realizados sobre la ficha y sus documentos." }
  };
  return guides[tab] || { title: tab, detail: "Completa la informacion necesaria para mantener una ficha confiable." };
}

function Info({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-xs text-neutral-500">{label}</p><p className="font-semibold">{value}</p></div>;
}

function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-neutral-700">{label}</span>
      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm md:col-span-2 xl:col-span-3">
      <span className="font-semibold text-neutral-700">{label}</span>
      <textarea className="min-h-24 w-full rounded-md border border-line p-3 text-sm" value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, optionLabels = {} }: { label: string; value: string; onChange: (value: string) => void; options: string[]; optionLabels?: Record<string, string> }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-neutral-700">{label}</span>
      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{optionLabels[option] || option}</option>)}
      </select>
    </label>
  );
}
