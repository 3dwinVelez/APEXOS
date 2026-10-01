"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { AlertTriangle, Calculator, CheckCircle2, ClipboardList, FileCheck2, Plus, RefreshCw, Search, Send, Wallet, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Carrier = { id: number; code: string; legal_name: string };
type SettlementType = { id: number | null; code: string; name: string; requires_reinforced_approval?: boolean; documentary_policy?: string };
type Period = { id: number; code: string; name?: string | null; start_date: string; end_date: string; status: string };
type Item = {
  id: number; guide_reference: string; service?: string | null; route_description?: string | null;
  origin_name?: string | null; destination_city?: string | null; vehicle_plate?: string | null;
  base_type: string; quantity: number; unit?: string | null; distance_km: number; weight_kg: number;
  rate_code?: string | null; rate_version?: number | null; rate_base?: number | null; rate_unit_value?: number | null;
  calculated_amount: number; adjusted_amount: number; approved_amount: number;
  calculation_trace?: unknown;
};
type Adjustment = { id: number; item_id?: number | null; before_value: number; delta: number; after_value: number; reason: string; created_by?: number | null };
type Issue = { id: number; category: string; severity: string; blocking: boolean; status: string; description: string };
type Approval = { id: number; level?: string | null; decision: string; from_status?: string | null; to_status?: string | null; comment?: string | null };
type Accounting = { id: number; reference: string; amount: number; accounting_period?: string | null; idempotency_key: string };
type SettlementPackage = {
  id: number; code: string; status: string; version: number; currency: string;
  carrier_id: number; carrier_code?: string | null; carrier_name?: string | null; type_code: string;
  responsible_id?: number | null; calculated_total: number; adjusted_total: number; approved_total: number; accounted_total: number;
  period?: { code: string; start_date: string; end_date: string } | null;
  items?: Item[]; adjustments?: Adjustment[]; issues?: Issue[]; approvals?: Approval[]; accountings?: Accounting[];
  open_blocking_issues?: number; aging_days?: number;
};
type Kpis = {
  draft_value: number; pending_approval_value: number; approved_value: number; accounted_value: number;
  blocked_packages: number; open_issues: number;
};

const money = (value: number, currency = "COP") =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "error" | "info"> = {
  borrador: "neutral", validando: "info", preliquidada: "info", con_novedad: "warning",
  en_revision: "warning", rechazada: "error", aprobada: "success", contabilizada: "success",
  liquidada: "success", reversada: "error", cancelada: "neutral"
};
const STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador", validando: "Validando", preliquidada: "Preliquidada", con_novedad: "Con novedad",
  en_revision: "En revision", rechazada: "Rechazada", aprobada: "Aprobada", contabilizada: "Contabilizada",
  liquidada: "Liquidada", reversada: "Reversada", cancelada: "Cancelada"
};

const emptyItemDraft = {
  guide_reference: "", service: "", route_description: "", origin_name: "", destination_city: "",
  vehicle_plate: "", base_type: "viaje", quantity: 1, unit: "", distance_km: 0, weight_kg: 0, volume_m3: 0,
  stop_count: 1, reported_value: 0, service_date: ""
};

export default function TransportSettlementsPage() {
  const canRead = hasStoredRolePermission("transport", "read");
  const canWrite = hasStoredRolePermission("transport", "write");
  const canApprove = hasStoredRolePermission("transport", "approve");
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [packages, setPackages] = useState<SettlementPackage[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [types, setTypes] = useState<SettlementType[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SettlementPackage | null>(null);
  const [itemDraft, setItemDraft] = useState({ ...emptyItemDraft });
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({ code: "", carrier_id: 0, type_code: "TRANSPORTADOR", period_id: 0, currency: "COP", observation: "" });

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (carrierFilter) params.set("carrier_id", carrierFilter);
      const [tower, carrierRows, typeRows, periodRows] = await Promise.all([
        api<{ kpis: Kpis; packages: SettlementPackage[] }>(`/api/v1/transport/settlement-control-tower?${params.toString()}`),
        api<Carrier[]>("/api/v1/transport/carriers"),
        api<SettlementType[]>("/api/v1/transport/settlement-types"),
        api<Period[]>("/api/v1/transport/settlement-periods")
      ]);
      setKpis(tower.kpis);
      setPackages(tower.packages);
      setCarriers(carrierRows);
      setTypes(typeRows);
      setPeriods(periodRows);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible cargar la torre de liquidaciones.");
    }
  }, [carrierFilter, statusFilter]);

  useEffect(() => { if (canRead) void load(); }, [canRead, load]);

  async function openPackage(pkg: SettlementPackage) {
    try {
      const detail = await api<SettlementPackage>(`/api/v1/transport/settlement-packages/${pkg.id}`);
      setSelected(detail);
      setItemDraft({ ...emptyItemDraft });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible abrir el paquete.");
    }
  }

  async function refreshSelected() {
    if (!selected) return;
    const detail = await api<SettlementPackage>(`/api/v1/transport/settlement-packages/${selected.id}`);
    setSelected(detail);
    await load();
  }

  async function transition(path: string, body: Record<string, unknown> = {}, success = "Estado actualizado.") {
    if (!selected) return;
    try {
      await api(`/api/v1/transport/settlement-packages/${selected.id}/${path}`, { method: "POST", body: JSON.stringify(body) });
      setMessage(success);
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `No fue posible ejecutar ${path}.`);
    }
  }

  async function decide(decision: "aprobada" | "rechazada") {
    if (!selected) return;
    const comment = decision === "rechazada" ? window.prompt("Motivo del rechazo (obligatorio):") || "" : window.prompt("Comentario de aprobacion (opcional):") || "";
    if (decision === "rechazada" && !comment.trim()) { setError("El rechazo requiere un motivo."); return; }
    await transition("decision", { decision, comment: comment || undefined, version: selected.version }, decision === "aprobada" ? "Paquete aprobado." : "Paquete rechazado.");
  }

  async function account() {
    if (!selected) return;
    const reference = window.prompt("Referencia contable:") || "";
    if (!reference.trim()) { setError("La referencia contable es obligatoria."); return; }
    await transition("account", { reference, amount: selected.approved_total, version: selected.version }, "Paquete contabilizado (idempotente).");
  }

  async function close() {
    if (!selected) return;
    await transition("close", { version: selected.version }, "Paquete cerrado como liquidado.");
  }

  async function createPackage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api("/api/v1/transport/settlement-packages", {
        method: "POST",
        body: JSON.stringify({
          code: createDraft.code, carrier_id: createDraft.carrier_id, type_code: createDraft.type_code,
          period_id: createDraft.period_id || undefined, currency: createDraft.currency, observation: createDraft.observation || undefined
        })
      });
      setCreateOpen(false);
      setCreateDraft({ code: "", carrier_id: 0, type_code: "TRANSPORTADOR", period_id: 0, currency: "COP", observation: "" });
      setMessage("Paquete de liquidacion creado en borrador.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible crear el paquete.");
    }
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    try {
      await api(`/api/v1/transport/settlement-packages/${selected.id}/items`, {
        method: "POST",
        body: JSON.stringify({ items: [{ ...itemDraft, service_date: itemDraft.service_date || undefined, reported_value: itemDraft.reported_value || undefined }] })
      });
      setItemDraft({ ...emptyItemDraft });
      setMessage("Detalle agregado.");
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible agregar el detalle.");
    }
  }

  async function addAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/api/v1/transport/settlement-packages/${selected.id}/adjustments`, {
        method: "POST",
        body: JSON.stringify({
          item_id: data.get("item_id") ? Number(data.get("item_id")) : undefined,
          delta: Number(data.get("delta")), reason: String(data.get("reason") || ""), version: selected.version
        })
      });
      setMessage("Ajuste registrado con trazabilidad.");
      await refreshSelected();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible registrar el ajuste.");
    }
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return packages.filter((pkg) => !term || [pkg.code, pkg.carrier_name, pkg.carrier_code, pkg.type_code].join(" ").toLowerCase().includes(term));
  }, [packages, query]);

  if (!canRead) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">Liquidaciones no disponibles para este perfil</h1>
        <p className="mt-2 text-sm text-amber-900">Tu rol no incluye <strong>transport:read</strong>. Solicita el permiso al administrador.</p>
      </section>
    );
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card flex flex-wrap items-start justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-medium text-apex">M-14 · Liquidacion de transporte</p>
          <h1 className="mt-1 text-3xl font-semibold">Torre de liquidaciones</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Agrupa servicios por transportador y periodo, preliquida con la tarifa vigente congelada, ajusta con soporte, aprueba y contabiliza de forma idempotente.</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold" onClick={() => void load()} type="button"><RefreshCw size={16} /> Actualizar</button>
          {canWrite ? <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus size={16} /> Nuevo paquete</button> : null}
        </div>
      </header>

      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="En borrador" value={money(kpis?.draft_value || 0)} icon={<ClipboardList size={18} />} />
        <Kpi label="Por aprobar" value={money(kpis?.pending_approval_value || 0)} icon={<Send size={18} />} />
        <Kpi label="Aprobado" value={money(kpis?.approved_value || 0)} icon={<CheckCircle2 size={18} />} />
        <Kpi label="Contabilizado" value={money(kpis?.accounted_value || 0)} icon={<Wallet size={18} />} />
        <Kpi label="Bloqueados" value={String(kpis?.blocked_packages || 0)} icon={<AlertTriangle size={18} />} tone={(kpis?.blocked_packages || 0) > 0 ? "warning" : "neutral"} />
        <Kpi label="Novedades abiertas" value={String(kpis?.open_issues || 0)} icon={<FileCheck2 size={18} />} tone={(kpis?.open_issues || 0) > 0 ? "warning" : "neutral"} />
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar por codigo, transportador o tipo" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.keys(STATUS_LABEL).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
          </select>
          <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={carrierFilter} onChange={(event) => setCarrierFilter(event.target.value)}>
            <option value="">Todos los transportadores</option>
            {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.legal_name}</option>)}
          </select>
          <span className="ml-auto text-xs font-semibold text-neutral-500">{filtered.length} de {packages.length} paquete(s)</span>
        </div>

        {!filtered.length ? (
          <EmptyState
            icon={<Calculator size={22} />}
            title="Aun no hay paquetes de liquidacion"
            description={canWrite ? "Crea el primer paquete para agrupar servicios de un transportador y preliquidarlo con la tarifa vigente." : "No hay paquetes disponibles para consulta."}
            primaryAction={canWrite ? <button className="rounded-md bg-apex px-4 py-2 text-sm font-semibold text-white" onClick={() => setCreateOpen(true)} type="button">Crear primer paquete</button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-paper text-xs uppercase text-neutral-500">
                <tr>
                  <th className="p-3">Paquete</th><th>Transportador</th><th>Periodo</th><th>Tipo</th>
                  <th className="text-right">Preliquidado</th><th className="text-right">Ajustado</th><th className="text-right">Aprobado</th>
                  <th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pkg) => (
                  <tr className="border-t border-line" key={pkg.id}>
                    <td className="p-3"><p className="font-semibold">{pkg.code}</p><p className="text-xs text-neutral-500">v{pkg.version} · {pkg.aging_days ?? 0}d</p></td>
                    <td><p>{pkg.carrier_name || "-"}</p><p className="text-xs text-neutral-500">{pkg.carrier_code || ""}</p></td>
                    <td className="text-xs text-neutral-600">{pkg.period ? `${pkg.period.code}` : "Sin periodo"}</td>
                    <td className="text-xs">{pkg.type_code}</td>
                    <td className="text-right">{money(pkg.calculated_total, pkg.currency)}</td>
                    <td className="text-right">{money(pkg.adjusted_total, pkg.currency)}</td>
                    <td className="text-right font-semibold">{money(pkg.approved_total, pkg.currency)}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={STATUS_TONE[pkg.status] || "neutral"}>{STATUS_LABEL[pkg.status] || pkg.status}</Badge>
                        {(pkg.open_blocking_issues || 0) > 0 ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><AlertTriangle size={12} /> {pkg.open_blocking_issues} bloqueante(s)</span> : null}
                      </div>
                    </td>
                    <td className="pr-3 text-right"><button className="h-9 rounded-md border border-line px-3 text-sm font-semibold hover:border-apex" onClick={() => void openPackage(pkg)} type="button">Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <form className="w-full max-w-lg space-y-3 rounded-xl bg-white p-5" onSubmit={createPackage}>
            <div className="flex justify-between"><h2 className="text-xl font-semibold">Nuevo paquete de liquidacion</h2><button onClick={() => setCreateOpen(false)} type="button">Cerrar</button></div>
            <label className="block text-sm"><span className="font-semibold">Codigo *</span>
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={createDraft.code} onChange={(event) => setCreateDraft((d) => ({ ...d, code: event.target.value.toUpperCase() }))} required /></label>
            <label className="block text-sm"><span className="font-semibold">Transportador *</span>
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={createDraft.carrier_id} onChange={(event) => setCreateDraft((d) => ({ ...d, carrier_id: Number(event.target.value) }))} required>
                <option value={0}>Selecciona...</option>
                {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.legal_name}</option>)}
              </select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm"><span className="font-semibold">Tipo</span>
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={createDraft.type_code} onChange={(event) => setCreateDraft((d) => ({ ...d, type_code: event.target.value }))}>
                  {types.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
                </select></label>
              <label className="block text-sm"><span className="font-semibold">Periodo</span>
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={createDraft.period_id} onChange={(event) => setCreateDraft((d) => ({ ...d, period_id: Number(event.target.value) }))}>
                  <option value={0}>Sin periodo</option>
                  {periods.map((period) => <option key={period.id} value={period.id}>{period.code}</option>)}
                </select></label>
            </div>
            <label className="block text-sm"><span className="font-semibold">Observacion</span>
              <textarea className="mt-1 min-h-[60px] w-full rounded-md border border-line p-3 text-sm" value={createDraft.observation} onChange={(event) => setCreateDraft((d) => ({ ...d, observation: event.target.value }))} /></label>
            <div className="flex justify-end gap-2 pt-2"><button className="h-10 rounded-md border border-line px-4 text-sm font-semibold" onClick={() => setCreateOpen(false)} type="button">Cancelar</button><button className="h-10 rounded-md bg-apex px-4 text-sm font-semibold text-white" type="submit">Crear</button></div>
          </form>
        </div>
      ) : null}

      {selected ? <PackageDetail pkg={selected} canWrite={canWrite} canApprove={canApprove} carriers={carriers} itemDraft={itemDraft} setItemDraft={setItemDraft} onClose={() => setSelected(null)} onAddItem={addItem} onAddAdjustment={addAdjustment} onTransition={transition} onDecide={decide} onAccount={account} onClose2={close} /> : null}
    </div>
  );
}

function Kpi({ label, value, icon, tone = "neutral" }: { label: string; value: string; icon: React.ReactNode; tone?: "neutral" | "warning" }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "warning" ? "border-amber-200 bg-amber-50" : "border-line bg-white"}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500"><span className="text-apex">{icon}</span>{label}</div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function PackageDetail(props: {
  pkg: SettlementPackage; canWrite: boolean; canApprove: boolean; carriers: Carrier[];
  itemDraft: typeof emptyItemDraft; setItemDraft: (updater: (d: typeof emptyItemDraft) => typeof emptyItemDraft | typeof emptyItemDraft) => void;
  onClose: () => void; onAddItem: (event: React.FormEvent<HTMLFormElement>) => void; onAddAdjustment: (event: React.FormEvent<HTMLFormElement>) => void;
  onTransition: (path: string, body?: Record<string, unknown>, success?: string) => Promise<void>;
  onDecide: (decision: "aprobada" | "rechazada") => Promise<void>; onAccount: () => Promise<void>; onClose2: () => Promise<void>;
}) {
  const { pkg, canWrite, canApprove, itemDraft, setItemDraft, onClose, onAddItem, onAddAdjustment, onTransition, onDecide, onAccount, onClose2 } = props;
  const [tab, setTab] = useState<"detalles" | "ajustes" | "novedades" | "trazabilidad">("detalles");
  const editable = ["borrador", "validando", "preliquidada", "con_novedad", "rechazada"].includes(pkg.status);
  const currency = pkg.currency;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-apex">{pkg.type_code} · v{pkg.version}</p>
            <h2 className="text-2xl font-semibold">{pkg.code}</h2>
            <p className="text-sm text-neutral-600">{pkg.carrier_name} {pkg.period ? `· Periodo ${pkg.period.code}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[pkg.status] || "neutral"}>{STATUS_LABEL[pkg.status] || pkg.status}</Badge>
            <button onClick={onClose} type="button">Cerrar</button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Total label="Preliquidado" value={money(pkg.calculated_total, currency)} />
          <Total label="Ajustado" value={money(pkg.adjusted_total, currency)} />
          <Total label="Aprobado" value={money(pkg.approved_total, currency)} />
          <Total label="Contabilizado" value={money(pkg.accounted_total, currency)} />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {canWrite && pkg.status === "borrador" ? <button className="h-9 rounded-md border border-line px-3 text-sm font-semibold" onClick={() => void onTransition("validate", { version: pkg.version }, "Paquete en validacion.")} type="button">Validar</button> : null}
          {canWrite && pkg.status === "validando" ? <button className="h-9 rounded-md border border-line px-3 text-sm font-semibold" onClick={() => void onTransition("precalculate", { version: pkg.version }, "Preliquidacion calculada con tarifa congelada.")} type="button"><Calculator size={15} className="mr-1 inline" />Preliquidar</button> : null}
          {canWrite && ["preliquidada", "con_novedad"].includes(pkg.status) ? <button className="h-9 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={() => void onTransition("submit", { version: pkg.version }, "Enviado a revision.")} type="button"><Send size={15} className="mr-1 inline" />Enviar a revision</button> : null}
          {canApprove && pkg.status === "en_revision" ? <button className="h-9 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white" onClick={() => void onDecide("aprobada")} type="button"><CheckCircle2 size={15} className="mr-1 inline" />Aprobar</button> : null}
          {canApprove && pkg.status === "en_revision" ? <button className="h-9 rounded-md border border-rose-300 px-3 text-sm font-semibold text-rose-700" onClick={() => void onDecide("rechazada")} type="button"><XCircle size={15} className="mr-1 inline" />Rechazar</button> : null}
          {canApprove && pkg.status === "aprobada" ? <button className="h-9 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={() => void onAccount()} type="button"><Wallet size={15} className="mr-1 inline" />Contabilizar</button> : null}
          {canApprove && pkg.status === "contabilizada" ? <button className="h-9 rounded-md border border-line px-3 text-sm font-semibold" onClick={() => void onClose2()} type="button">Cerrar (liquidada)</button> : null}
          {canWrite && ["borrador", "validando", "preliquidada", "con_novedad", "en_revision", "rechazada"].includes(pkg.status) ? <button className="h-9 rounded-md border border-line px-3 text-sm font-semibold text-neutral-600" onClick={() => void onTransition("cancel", { version: pkg.version }, "Paquete cancelado.")} type="button">Cancelar paquete</button> : null}
        </div>

        <div className="mb-3 flex gap-2 border-b border-line">
          {(["detalles", "ajustes", "novedades", "trazabilidad"] as const).map((name) => (
            <button className={`px-3 py-2 text-sm font-semibold ${tab === name ? "border-b-2 border-apex text-apex" : "text-neutral-500"}`} key={name} onClick={() => setTab(name)} type="button">{name[0].toUpperCase() + name.slice(1)}</button>
          ))}
        </div>

        {tab === "detalles" ? (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="p-2">Guia</th><th>Ruta</th><th>Tarifa</th><th className="text-right">Cantidad</th><th className="text-right">Calculado</th><th className="text-right">Ajustado</th></tr></thead>
                <tbody>
                  {(pkg.items || []).map((item) => (
                    <tr className="border-t border-line" key={item.id}>
                      <td className="p-2 font-semibold">{item.guide_reference}</td>
                      <td className="text-xs text-neutral-600">{item.origin_name || "-"} → {item.destination_city || "-"}{item.vehicle_plate ? ` · ${item.vehicle_plate}` : ""}</td>
                      <td className="text-xs">{item.rate_code ? `${item.rate_code} v${item.rate_version ?? "?"}` : "Sin tarifa"}{item.rate_unit_value != null ? ` · ${money(item.rate_unit_value, currency)}` : ""}</td>
                      <td className="text-right">{item.quantity} {item.unit || ""}</td>
                      <td className="text-right">{money(item.calculated_amount, currency)}</td>
                      <td className="text-right font-semibold">{money(item.adjusted_amount, currency)}</td>
                    </tr>
                  ))}
                  {!(pkg.items || []).length ? <tr><td className="p-4 text-center text-neutral-500" colSpan={6}>Sin detalles. Agrega guias/servicios para preliquidar.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {canWrite && editable ? (
              <form className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-3" onSubmit={onAddItem}>
                <input className="h-9 rounded-md border border-line px-2 text-sm" placeholder="Guia/referencia *" value={itemDraft.guide_reference} onChange={(event) => setItemDraft((d) => ({ ...d, guide_reference: event.target.value }))} required />
                <input className="h-9 rounded-md border border-line px-2 text-sm" placeholder="Origen" value={itemDraft.origin_name} onChange={(event) => setItemDraft((d) => ({ ...d, origin_name: event.target.value }))} />
                <input className="h-9 rounded-md border border-line px-2 text-sm" placeholder="Ciudad destino" value={itemDraft.destination_city} onChange={(event) => setItemDraft((d) => ({ ...d, destination_city: event.target.value }))} />
                <input className="h-9 rounded-md border border-line px-2 text-sm" placeholder="Placa" value={itemDraft.vehicle_plate} onChange={(event) => setItemDraft((d) => ({ ...d, vehicle_plate: event.target.value }))} />
                <label className="text-xs">Km<input className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm" type="number" step="0.01" value={itemDraft.distance_km} onChange={(event) => setItemDraft((d) => ({ ...d, distance_km: Number(event.target.value) }))} /></label>
                <label className="text-xs">Peso kg<input className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm" type="number" step="0.01" value={itemDraft.weight_kg} onChange={(event) => setItemDraft((d) => ({ ...d, weight_kg: Number(event.target.value) }))} /></label>
                <label className="text-xs">Cantidad<input className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm" type="number" step="0.0001" value={itemDraft.quantity} onChange={(event) => setItemDraft((d) => ({ ...d, quantity: Number(event.target.value) }))} /></label>
                <button className="h-9 rounded-md bg-apex px-3 text-sm font-semibold text-white sm:col-span-2" type="submit"><Plus size={15} className="mr-1 inline" />Agregar detalle</button>
              </form>
            ) : null}
          </div>
        ) : null}

        {tab === "ajustes" ? (
          <div className="space-y-3">
            <ul className="space-y-2">
              {(pkg.adjustments || []).map((adj) => (
                <li className="rounded-md border border-line p-3 text-sm" key={adj.id}>
                  <p className="font-semibold">{money(adj.before_value, currency)} → {money(adj.after_value, currency)} <span className={adj.delta >= 0 ? "text-emerald-700" : "text-rose-700"}>({adj.delta >= 0 ? "+" : ""}{money(adj.delta, currency)})</span></p>
                  <p className="text-xs text-neutral-600">Motivo: {adj.reason}</p>
                </li>
              ))}
              {!(pkg.adjustments || []).length ? <li className="text-sm text-neutral-500">Sin ajustes registrados.</li> : null}
            </ul>
            {canWrite && ["preliquidada", "con_novedad"].includes(pkg.status) ? (
              <form className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-4" onSubmit={onAddAdjustment}>
                <select className="h-9 rounded-md border border-line px-2 text-sm" name="item_id"><option value="">Paquete completo</option>{(pkg.items || []).map((item) => <option key={item.id} value={item.id}>{item.guide_reference}</option>)}</select>
                <input className="h-9 rounded-md border border-line px-2 text-sm" name="delta" placeholder="Delta (+/-)" type="number" step="0.01" required />
                <input className="h-9 rounded-md border border-line px-2 text-sm" name="reason" placeholder="Motivo *" required />
                <button className="h-9 rounded-md bg-apex px-3 text-sm font-semibold text-white" type="submit">Registrar ajuste</button>
              </form>
            ) : null}
          </div>
        ) : null}

        {tab === "novedades" ? (
          <ul className="space-y-2">
            {(pkg.issues || []).map((issue) => (
              <li className="rounded-md border border-line p-3 text-sm" key={issue.id}>
                <div className="flex items-center gap-2"><Badge tone={issue.blocking ? "error" : "warning"}>{issue.blocking ? "Bloqueante" : "Alerta"}</Badge><span className="font-semibold">{issue.category}</span><Badge tone="neutral">{issue.status}</Badge></div>
                <p className="mt-1 text-neutral-600">{issue.description}</p>
              </li>
            ))}
            {!(pkg.issues || []).length ? <li className="text-sm text-neutral-500">Sin novedades registradas.</li> : null}
          </ul>
        ) : null}

        {tab === "trazabilidad" ? (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Aprobaciones</h3>
              <ul className="space-y-1">
                {(pkg.approvals || []).map((ap) => <li className="text-sm" key={ap.id}><Badge tone={ap.decision === "aprobada" ? "success" : "error"}>{ap.decision}</Badge> {ap.from_status} → {ap.to_status}{ap.comment ? ` · ${ap.comment}` : ""}</li>)}
                {!(pkg.approvals || []).length ? <li className="text-sm text-neutral-500">Sin decisiones registradas.</li> : null}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Contabilizaciones</h3>
              <ul className="space-y-1">
                {(pkg.accountings || []).map((ac) => <li className="text-sm" key={ac.id}>{ac.reference} · {money(ac.amount, currency)} · <span className="text-xs text-neutral-500">{ac.idempotency_key}</span></li>)}
                {!(pkg.accountings || []).length ? <li className="text-sm text-neutral-500">Aun no contabilizado.</li> : null}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line bg-paper p-3"><p className="text-xs uppercase text-neutral-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
