"use client";

import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { AlertTriangle, Archive, Gauge, Paperclip, Plus, Save, Search, ShieldCheck, Truck, type LucideIcon } from "lucide-react";
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

const tabs = ["Datos generales", "Propiedad", "Documentos legales", "Adjuntos", "Datos tecnicos", "Auditoria"];
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

function readFile(file: File) {
  return new Promise<{ base64_data: string; file_name: string; mime_type: string; file_size: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64_data: String(reader.result || ""), file_name: file.name, mime_type: file.type, file_size: file.size });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
    const [vehicleData, employeeData] = await Promise.all([
      api<Vehicle[]>("/api/v1/transport/vehicles").catch(() => []),
      api<Employee[]>("/api/v1/hr/employees?active=true").catch(() => [])
    ]);
    setVehicles(vehicleData);
    setEmployees(employeeData);
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
      const payload = { ...form, plate: form.plate.toUpperCase().replace(/\s+/g, "") };
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
    const saved = await api<VehicleDocument>(`/api/v1/transport/vehicles/${selected.id}/documents`, { method: "POST", body: JSON.stringify(documentDraft) });
    const detail = await api<Vehicle>(`/api/v1/transport/vehicles/${selected.id}`);
    setSelected(detail);
    setVehicles((current) => current.map((vehicle) => vehicle.id === detail.id ? detail : vehicle));
    setDocumentDraft({ document_type: "soat", file_name: "", base64_data: "", mime_type: "", file_size: 0, issued_at: "", expires_at: "", observations: "" });
    setMessage(`Documento ${saved.file_name} cargado.`);
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return vehicles;
    return vehicles.filter((vehicle) => [vehicle.plate, vehicle.brand, vehicle.line, vehicle.type, vehicle.base_site, vehicle.ownership_type].join(" ").toLowerCase().includes(term));
  }, [vehicles, query]);

  const metrics = useMemo(() => ({
    total: vehicles.length,
    blocked: vehicles.filter((vehicle) => vehicle.master_status === "bloqueado_documental").length,
    warning: vehicles.filter((vehicle) => vehicle.master_status === "documento_proximo_a_vencer").length,
    avgScore: vehicles.length ? Math.round(vehicles.reduce((sum, vehicle) => sum + (vehicle.master_score || 0), 0) / vehicles.length) : 0
  }), [vehicles]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">M-14 Logistica</p>
          <h1 className="text-3xl font-semibold">Maestro de vehiculos</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Fuente maestra transversal para Planeacion, Rutas, Conductores, Mantenimiento, Costos, IA APEX y reportes. Sin checklist ni operacion de ruta.</p>
        </div>
        <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={newVehicle} type="button"><Plus size={17} /> Nueva ficha</button>
      </header>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Truck} label="Vehiculos maestros" value={metrics.total} hint="Placas registradas" />
        <MetricCard icon={ShieldCheck} label="Score promedio" value={`${metrics.avgScore}/100`} hint="Calidad de ficha" />
        <MetricCard icon={AlertTriangle} label="Bloqueados" value={metrics.blocked} hint="Riesgo documental" tone="danger" />
        <MetricCard icon={Gauge} label="Proximos a vencer" value={metrics.warning} hint="Semaforo documental" tone="warning" />
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Flota maestra</h2>
            <p className="text-sm text-neutral-600">Datos listos para ser consumidos por Planeacion antes de iniciar una ruta.</p>
          </div>
          <label className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar placa, sede, tipo..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((vehicle) => (
            <button className="rounded-md border border-line bg-white p-4 text-left transition hover:border-apex hover:bg-paper" key={vehicle.id} onClick={() => openVehicle(vehicle)} type="button">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold">{vehicle.plate}</p>
                  <p className="text-sm text-neutral-600">{vehicle.brand || "-"} {vehicle.line || vehicle.model || ""} {vehicle.year ? `(${vehicle.year})` : ""}</p>
                </div>
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(vehicle.master_status)}`}>{statusLabel(vehicle.master_status)}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Info label="Sede base" value={vehicle.base_site || "-"} />
                <Info label="Propiedad" value={vehicle.ownership_type || "-"} />
                <Info label="Capacidad" value={vehicle.capacity_value ? `${vehicle.capacity_value} ${vehicle.capacity_unit || ""}` : vehicle.load_capacity || "-"} />
                <Info label="Conductor" value={vehicle.authorized_driver_name || "-"} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-paper px-2 py-1">SOAT: {vehicle.dashboard_metrics?.soat_days_remaining ?? "--"} dias</span>
                <span className="rounded-md bg-paper px-2 py-1">Tec-mec: {vehicle.dashboard_metrics?.technical_review_days_remaining ?? "--"} dias</span>
                <span className="rounded-md bg-paper px-2 py-1">{scoreLabel(vehicle.master_score || 0)}</span>
              </div>
            </button>
          ))}
          {!filtered.length ? <p className="text-sm text-neutral-500">No hay vehiculos registrados para este filtro.</p> : null}
        </div>
      </section>

      {showEditor ? (
        <ModalFrame title={selected ? `Ficha ${selected.plate}` : "Nueva ficha maestra"} onClose={() => setShowEditor(false)} maxWidth="md:max-w-6xl">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-md border border-line bg-paper p-3 md:grid-cols-6">
              <Summary label="Placa" value={form.plate || "Nueva"} />
              <Summary label="Estado maestro" value={statusLabel(selected?.master_status || "pendiente_documentacion")} />
              <Summary label="Score" value={`${selected?.master_score || 0}/100`} />
              <Summary label="Semaforo" value={scoreLabel(selected?.master_score || 0)} />
              <Summary label="Sede base" value={form.base_site || "--"} />
              <Summary label="Propiedad" value={form.ownership_type || "--"} />
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-line pb-2">
              {tabs.map((tab) => (
                <button className={`h-10 shrink-0 rounded-md px-3 text-sm font-semibold ${activeTab === tab ? "bg-apex text-white" : "bg-paper text-neutral-700 hover:bg-neutral-200"}`} key={tab} onClick={() => setActiveTab(tab)} type="button">{tab}</button>
              ))}
            </div>

            {activeTab === "Datos generales" ? (
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

            {activeTab === "Propiedad" ? (
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

            {activeTab === "Documentos legales" ? (
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

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => setShowEditor(false)} type="button"><Archive size={16} /> Cerrar</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" onClick={saveVehicle} disabled={saving} type="button"><Save size={16} /> {saving ? "Guardando..." : "Guardar ficha"}</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone = "neutral" }: { icon: LucideIcon; label: string; value: string | number; hint: string; tone?: "neutral" | "warning" | "danger" }) {
  const className = tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-apex";
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-neutral-500">{label}</p>
        <Icon className={className} size={18} />
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs font-medium text-neutral-500">{hint}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-xs text-neutral-500">{label}</p><p className="font-semibold">{value}</p></div>;
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md bg-white p-3"><p className="text-xs text-neutral-500">{label}</p><p className="truncate text-sm font-semibold">{value}</p></div>;
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
