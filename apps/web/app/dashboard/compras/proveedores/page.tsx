"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Users
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { LATAM_COUNTRIES, currencyForCountry, money, taxIdLabel } from "@/lib/latam";
import { ComprasNav } from "@/components/compras-nav";
import { ZeroFriendlyNumberInput } from "@/components/ui/ZeroFriendlyNumberInput";

type SupplierMetrics = {
  orders_count: number;
  open_orders: number;
  pending_receipts: number;
  total_purchased: number;
  service_level: number;
  last_order_at: string | null;
  last_order_number: string | null;
};

type RecentOrder = {
  id: number;
  number: string;
  status: string;
  total: number;
  currency: string;
  received_percent: number;
  pending_quantity: number;
  metadata: { wms: { inbound_order: string } };
};

type Supplier = {
  id: number;
  name: string;
  tax_id: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  credit_limit: number;
  credit_days: number;
  metadata: { segment: string; category: string; owner: string; notes: string; risk: string };
  metrics: SupplierMetrics;
  recent_orders: RecentOrder[];
};

type WorkspaceTab = "directorio" | "nuevo" | "desempeno";
type AssistantPanel = "abastecimiento" | "riesgo" | "finanzas";

const statusLabels: Record<string, string> = {
  draft: "Borrador",
  pending_approval: "Pendiente",
  sent: "Enviada",
  confirmed: "Aprobada",
  partial: "Parcial",
  received: "Recibida",
  cancelled: "Cancelada",
  closed: "Cerrada"
};

const templates = [
  { label: "Proveedor local", country: "", credit_days: 30, segment: "local", category: "abastecimiento" },
  { label: "Importador", country: "", credit_days: 45, segment: "internacional", category: "importacion" },
  { label: "Servicio logistico", country: "", credit_days: 15, segment: "servicios", category: "logistica" }
];

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("directorio");
  const [assistantPanel, setAssistantPanel] = useState<AssistantPanel>("abastecimiento");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    tax_id: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    credit_days: 30,
    segment: "abastecimiento",
    category: "insumos",
    owner: "Compras",
    notes: ""
  });

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar proveedores"));
  }, []);

  async function load() {
    const data = await api<Supplier[]>("/api/v1/purchases/suppliers");
    const rows = data || [];
    setSuppliers(rows);
    setSelectedSupplier((current) => current ? rows.find((supplier) => supplier.id === current.id) || rows[0] || null : rows[0] || null);
    return rows;
  }

  const filteredSuppliers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return suppliers;
    return suppliers.filter((supplier) => [
      supplier.name,
      supplier.tax_id || "",
      supplier.email || "",
      supplier.city || "",
      supplier.country || "",
      supplier.metadata.segment || "",
      supplier.metadata.category || ""
    ].some((value) => value.toLowerCase().includes(needle)));
  }, [query, suppliers]);

  const totals = useMemo(() => {
    return suppliers.reduce((acc, supplier) => ({
      totalPurchased: acc.totalPurchased + Number(supplier.metrics.total_purchased || 0),
      openOrders: acc.openOrders + Number(supplier.metrics.open_orders || 0),
      pendingReceipts: acc.pendingReceipts + Number(supplier.metrics.pending_receipts || 0)
    }), { totalPurchased: 0, openOrders: 0, pendingReceipts: 0 });
  }, [suppliers]);

  const canSave = Boolean(form.name.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const created = await api<Supplier>("/api/v1/purchases/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          tax_id: form.tax_id || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          city: form.city || undefined,
          country: form.country || undefined,
          credit_days: Number(form.credit_days || 0),
          metadata: {
            segment: form.segment,
            category: form.category,
            owner: form.owner,
            notes: form.notes
          }
        })
      });
      setOk(`${created.name} creado y disponible para ordenes de compra`);
      setForm({ name: "", tax_id: "", email: "", phone: "", city: "", country: "", credit_days: 30, segment: "abastecimiento", category: "insumos", owner: "Compras", notes: "" });
      setActiveTab("directorio");
      const refreshed = await load();
      setSelectedSupplier(refreshed.find((supplier) => supplier.id === created.id) || created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear proveedor");
    } finally {
      setSaving(false);
    }
  }

  async function saveSupplierPatch(patch: Partial<Supplier> & { metadata: Supplier["metadata"] }) {
    if (!selectedSupplier) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api<Supplier>(`/api/v1/purchases/suppliers/${selectedSupplier.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setSelectedSupplier({ ...selectedSupplier, ...updated });
      setOk(`${updated.name} actualizado`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar proveedor");
    } finally {
      setSaving(false);
    }
  }

  function applyTemplate(template: (typeof templates)[number]) {
    setForm((current) => ({
      ...current,
      country: template.country,
      credit_days: template.credit_days,
      segment: template.segment,
      category: template.category
    }));
  }

  return (
    <div className="space-y-4">
      <header className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-medium text-apex">Compras / Proveedores</p>
              <h1 className="mt-1 text-3xl font-semibold">Workspace de proveedores</h1>
              <p className="mt-1 max-w-3xl text-sm text-neutral-600">
                Gestiona proveedores como una red operativa conectada a OC, WMS, recepciones, costos y trazabilidad.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <HeaderMetric label="Proveedores" value={String(suppliers.length)} />
              <HeaderMetric label="OC abiertas" value={String(totals.openOrders)} />
              <HeaderMetric label="Pendiente recibir" value={String(totals.pendingReceipts)} />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedNav active={activeTab} onChange={setActiveTab} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-paper" href="/dashboard/compras/ordenes/nueva">
              <ClipboardCheck size={16} />
              Nueva OC
            </Link>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={() => setActiveTab("nuevo")} type="button">
              <Plus size={16} />
              Nuevo proveedor
            </button>
          </div>
        </div>
      </header>

      <ComprasNav />

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {activeTab === "directorio" ? (
            <section className="rounded-md border border-line bg-white">
              <PanelHeader
                icon={Users}
                title="Directorio inteligente"
                detail="Busca, selecciona y actua sobre proveedores sin abrir pantallas pesadas."
                actions={(
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-2.5 text-neutral-400" size={16} />
                    <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar proveedor, ID fiscal, ciudad o segmento" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                )}
              />

              <div className="grid gap-4 p-4 lg:grid-cols-[320px_1fr]">
                <div className="space-y-2">
                  {filteredSuppliers.map((supplier) => (
                    <button className={`w-full rounded-md border p-3 text-left text-sm hover:border-apex ${selectedSupplier?.id === supplier.id ? "border-apex bg-[#146C6312]" : "border-line"}`} key={supplier.id} onClick={() => setSelectedSupplier(supplier)} type="button">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{supplier.name}</span>
                        <StatusDot supplier={supplier} />
                      </span>
                      <span className="mt-1 block truncate text-xs text-neutral-500">{supplier.tax_id || "Sin documento"} / {supplier.city || "Ciudad"} / {supplier.country || "-"}</span>
                    </button>
                  ))}
                  {filteredSuppliers.length === 0 ? <p className="rounded-md border border-dashed border-line p-4 text-center text-sm text-neutral-500">No hay proveedores con ese criterio.</p> : null}
                </div>

                <SupplierProfile supplier={selectedSupplier} onPatch={saveSupplierPatch} saving={saving} />
              </div>
            </section>
          ) : null}

          {activeTab === "nuevo" ? (
            <section className="rounded-md border border-line bg-white">
              <PanelHeader icon={Building2} title="Alta rapida" detail="Solo captura datos que habilitan compra, contacto y trazabilidad." />
              <form className="space-y-4 p-4" onSubmit={submit}>
                <div className="grid gap-3 lg:grid-cols-3">
                  <Field label="Proveedor">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Nombre comercial o razon social" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
                  </Field>
                  <Field label="Documento tributario">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder={taxIdLabel(form.country)} value={form.tax_id} onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))} />
                  </Field>
                  <Field label="Categoria">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Insumos, logistica, servicios" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
                  </Field>
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  <Field label="Correo">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="compras@proveedor.com" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                  </Field>
                  <Field label="Telefono">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="+57..." value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                  </Field>
                  <Field label="Ciudad">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ciudad" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
                  </Field>
                  <Field label="Pais">
                    <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}>
                      <option value="">Seleccionar pais</option>
                      {LATAM_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name} / {country.currency}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="grid gap-3 lg:grid-cols-[160px_1fr_1fr]">
                  <Field label="Dias credito">
                    <ZeroFriendlyNumberInput className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} max={365} value={form.credit_days} onValueChange={(value) => setForm((p) => ({ ...p, credit_days: value }))} />
                  </Field>
                  <Field label="Responsable">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.owner} onChange={(e) => setForm((p) => ({ ...p, owner: e.target.value }))} />
                  </Field>
                  <Field label="Segmento">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.segment} onChange={(e) => setForm((p) => ({ ...p, segment: e.target.value }))} />
                  </Field>
                </div>

                <Field label="Notas operativas">
                  <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: entrega martes y jueves, requiere cita, validar certificados" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                </Field>

                <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {templates.map((template) => (
                      <button className="h-9 rounded-md border border-line px-3 text-xs hover:bg-paper" key={template.label} onClick={() => applyTemplate(template)} type="button">
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !canSave} type="submit">
                    <Save size={16} />
                    Guardar proveedor
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {activeTab === "desempeno" ? (
            <section className="rounded-md border border-line bg-white">
              <PanelHeader icon={BarChart3} title="Desempeno y abastecimiento" detail="Vista de relacion proveedor-OC-WMS para tomar decisiones rapidas." />
              <div className="grid gap-4 p-4 lg:grid-cols-3">
                {suppliers.slice(0, 9).map((supplier) => (
                  <div className="rounded-md border border-line bg-paper p-4" key={supplier.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{supplier.name}</h3>
                        <p className="text-xs text-neutral-500">{supplier.metadata.category || "General"} / {supplier.country || "-"}</p>
                      </div>
                      <StatusDot supplier={supplier} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <MiniMetric label="OC" value={String(supplier.metrics.orders_count || 0)} />
                      <MiniMetric label="Servicio" value={`${supplier.metrics.service_level ?? 100}%`} />
                      <MiniMetric label="Abiertas" value={String(supplier.metrics.open_orders || 0)} />
                      <MiniMetric label="Comprado" value={money(supplier.metrics.total_purchased || 0)} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-md border border-line bg-white">
            <PanelHeader icon={ShieldCheck} title="Centro de control" detail="Contexto del proveedor seleccionado." />
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-3 gap-1 rounded-md bg-paper p-1">
                <PanelTab label="Supply" active={assistantPanel === "abastecimiento"} onClick={() => setAssistantPanel("abastecimiento")} />
                <PanelTab label="Riesgo" active={assistantPanel === "riesgo"} onClick={() => setAssistantPanel("riesgo")} />
                <PanelTab label="Finanzas" active={assistantPanel === "finanzas"} onClick={() => setAssistantPanel("finanzas")} />
              </div>

              {assistantPanel === "abastecimiento" ? (
                <div className="space-y-2 text-sm">
                  <MetricRow label="Proveedor" value={selectedSupplier?.name || "Sin seleccion"} />
                  <MetricRow label="OC abiertas" value={String(selectedSupplier?.metrics.open_orders || 0)} />
                  <MetricRow label="Pendiente WMS" value={String(selectedSupplier?.metrics.pending_receipts || 0)} />
                  <MetricRow label="Ultima OC" value={selectedSupplier?.metrics.last_order_number || "-"} />
                </div>
              ) : null}

              {assistantPanel === "riesgo" ? (
                <div>
                  <FlowStep icon={CheckCircle2} title="Datos minimos" detail="Documento, pais y contacto" active={Boolean(selectedSupplier?.tax_id && selectedSupplier?.email)} />
                  <FlowStep icon={ShieldCheck} title="Compliance" detail="Segmento y responsable definidos" active={Boolean(selectedSupplier?.metadata.owner)} />
                  <FlowStep icon={AlertTriangle} title="Recepciones pendientes" detail="OC abiertas con saldo WMS" active={Boolean(selectedSupplier?.metrics.pending_receipts)} warn />
                </div>
              ) : null}

              {assistantPanel === "finanzas" ? (
                <div className="space-y-2 text-sm">
                  <MetricRow label="Total comprado" value={money(selectedSupplier?.metrics.total_purchased || 0)} />
                  <MetricRow label="Dias credito" value={`${selectedSupplier?.credit_days || 0} dias`} />
                  <MetricRow label="Nivel servicio" value={`${selectedSupplier?.metrics.service_level ?? 100}%`} />
                  <MetricRow label="Moneda base" value={currencyForCountry(selectedSupplier?.country || "CO")} />
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Acciones conectadas</h2>
            <div className="mt-3 grid gap-2">
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white" href="/dashboard/compras/ordenes/nueva">
                <ClipboardCheck size={16} />
                Crear OC
              </Link>
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper" href="/dashboard/compras/ordenes/recibir">
                <PackageCheck size={16} />
                Ver recepciones
              </Link>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function SegmentedNav({ active, onChange }: { active: WorkspaceTab; onChange: (tab: WorkspaceTab) => void }) {
  const tabs: Array<{ id: WorkspaceTab; label: string; icon: LucideIcon }> = [
    { id: "directorio", label: "Directorio", icon: Users },
    { id: "nuevo", label: "Alta rapida", icon: Plus },
    { id: "desempeno", label: "Desempeno", icon: BarChart3 }
  ];
  return (
    <div className="grid gap-1 rounded-md bg-paper p-1 sm:inline-grid sm:grid-cols-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm ${active === tab.id ? "bg-white text-apex shadow-sm" : "text-neutral-600 hover:bg-white/70"}`} key={tab.id} onClick={() => onChange(tab.id)} type="button">
            <Icon size={15} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function SupplierProfile({ supplier, onPatch, saving }: { supplier: Supplier | null; onPatch: (patch: Partial<Supplier> & { metadata: Supplier["metadata"] }) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ email: "", phone: "", city: "", credit_days: 0, notes: "" });

  useEffect(() => {
    if (!supplier) return;
    setDraft({
      email: supplier.email || "",
      phone: supplier.phone || "",
      city: supplier.city || "",
      credit_days: supplier.credit_days || 0,
      notes: supplier.metadata.notes || ""
    });
    setEditing(false);
  }, [supplier]);

  if (!supplier) {
    return <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed border-line bg-paper text-sm text-neutral-500">Selecciona o crea un proveedor.</div>;
  }

  return (
    <div className="rounded-md border border-line">
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-neutral-500">Proveedor seleccionado</p>
          <h2 className="text-2xl font-semibold">{supplier.name}</h2>
          <p className="text-sm text-neutral-600">{supplier.tax_id || "Sin documento"} / {supplier.city || "Ciudad pendiente"} / {supplier.country || "-"}</p>
        </div>
        <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-xs font-medium hover:bg-paper" onClick={() => setEditing((value) => !value)} type="button">
          <Edit3 size={14} />
          {editing ? "Cerrar" : "Editar"}
        </button>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-4">
        <HeaderMetric label="OC" value={String(supplier.metrics.orders_count || 0)} />
        <HeaderMetric label="Servicio" value={`${supplier.metrics.service_level ?? 100}%`} />
        <HeaderMetric label="Abiertas" value={String(supplier.metrics.open_orders || 0)} />
        <HeaderMetric label="Comprado" value={money(supplier.metrics.total_purchased || 0)} />
      </div>

      {editing ? (
        <div className="grid gap-3 border-t border-line p-4 lg:grid-cols-2">
          <Field label="Correo">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
          </Field>
          <Field label="Telefono">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} />
          </Field>
          <Field label="Ciudad">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.city} onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))} />
          </Field>
          <Field label="Dias credito">
            <ZeroFriendlyNumberInput className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} max={365} value={draft.credit_days} onValueChange={(value) => setDraft((p) => ({ ...p, credit_days: value }))} />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Notas">
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
            </Field>
          </div>
          <div className="lg:col-span-2">
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving} onClick={() => onPatch({ email: draft.email, phone: draft.phone, city: draft.city, credit_days: draft.credit_days, metadata: { ...supplier.metadata, notes: draft.notes } })} type="button">
              <Save size={16} />
              Guardar cambios
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold">Contacto operativo</h3>
          <InfoLine icon={Mail} label="Correo" value={supplier.email || "Pendiente"} />
          <InfoLine icon={Phone} label="Telefono" value={supplier.phone || "Pendiente"} />
          <InfoLine icon={MapPin} label="Ubicacion" value={`${supplier.city || "-"} / ${supplier.country || "-"}`} />
          <InfoLine icon={ShieldCheck} label="Segmento" value={supplier.metadata.segment || "Sin segmento"} />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Ultimas OC</h3>
          <div className="space-y-2">
            {(supplier.recent_orders || []).slice(0, 4).map((order) => (
              <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm" key={order.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{order.number}</span>
                  <span className="text-xs text-neutral-500">{statusLabels[order.status] || order.status}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-neutral-500">
                  <span>{money(order.total, order.currency || currencyForCountry(supplier.country))}</span>
                  <span>{order.received_percent || 0}% recibido</span>
                </div>
              </div>
            ))}
            {(supplier.recent_orders || []).length === 0 ? <p className="rounded-md border border-dashed border-line p-3 text-sm text-neutral-500">Sin ordenes todavia.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ icon: Icon, title, detail, actions }: { icon: LucideIcon; title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#146C6312] text-apex">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {detail ? <p className="text-sm text-neutral-500">{detail}</p> : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2">
      <p className="truncate text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2">
      <p className="truncate text-sm font-semibold">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`h-8 rounded-md px-2 text-xs font-medium ${active ? "bg-white text-apex shadow-sm" : "text-neutral-600 hover:bg-white/70"}`} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function FlowStep({ icon: Icon, title, detail, active, warn }: { icon: LucideIcon; title: string; detail: string; active: boolean; warn?: boolean }) {
  const activeClass = warn ? "bg-amber-50 text-amber-800" : "bg-[#146C6312] text-apex";
  return (
    <div className="flex gap-3 border-b border-line py-3 last:border-b-0">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? activeClass : "bg-neutral-100 text-neutral-500"}`}>
        <Icon size={17} />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-neutral-500">{detail}</span>
      </span>
    </div>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
      <Icon className="text-apex" size={15} />
      <span className="min-w-0">
        <span className="block text-xs text-neutral-500">{label}</span>
        <span className="block truncate text-sm font-medium">{value}</span>
      </span>
    </div>
  );
}

function StatusDot({ supplier }: { supplier: Supplier }) {
  const incomplete = !supplier.email || !supplier.tax_id;
  if (incomplete) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-800"><AlertTriangle size={11} /> Revisar</span>;
  if ((supplier.metrics.open_orders || 0) > 0) return <span className="inline-flex items-center gap-1 rounded-full bg-[#146C6312] px-2 py-1 text-[11px] text-apex"><Truck size={11} /> Activo</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-700"><Sparkles size={11} /> Listo</span>;
}
