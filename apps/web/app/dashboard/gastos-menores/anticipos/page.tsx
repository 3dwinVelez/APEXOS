"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { GastosMenoresNav } from "@/components/gastos-menores-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

// DTO del listado de anticipos (GET /api/v1/petty-cash/advances). balance, applied_total,
// refund_amount y shortfall_amount los calcula el servidor: la UI solo los presenta.
type Advance = {
  id: number;
  box_id: number;
  document_type: string;
  number: number;
  full_number: string;
  date: string;
  custodian_party_id: number | null;
  custodian_name: string | null;
  amount: number;
  applied_total: number;
  balance: number;
  status: "open" | "liquidated" | "cancelled";
  description: string | null;
  accounting_document_id: number | null;
  reversal_accounting_document_id: number | null;
  liquidated_at: string | null;
  refund_amount: number;
  shortfall_amount: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  box: { id: number; code: string; name: string; custodian_name: string | null } | null;
  vouchers_count: number | null;
};

type Box = {
  id: number;
  code: string;
  name: string;
  custodian_party_id: number | null;
  custodian_name: string | null;
  require_advance: boolean;
  block_unliquidated_advance: boolean;
  active: boolean;
  ready_for_advances: boolean;
  warnings: string[];
};

type Concept = { id: number; code: string; name: string; active: boolean };
type Party = { id: number; code: string; name: string };

type AdvanceForm = {
  box_id: string;
  date: string;
  amount: string;
  custodian_party_id: string;
  description: string;
};

type LiquidationForm = {
  date: string;
  refund_amount: string;
  shortfall_amount: string;
  shortfall_concept_code: string;
};

const emptyAdvance: AdvanceForm = {
  box_id: "",
  date: "",
  amount: "",
  custodian_party_id: "",
  description: ""
};

const emptyLiquidation: LiquidationForm = {
  date: "",
  refund_amount: "",
  shortfall_amount: "0",
  shortfall_concept_code: ""
};

const STATUS_LABELS: Record<Advance["status"], string> = {
  open: "Abierto",
  liquidated: "Liquidado",
  cancelled: "Anulado"
};

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

export default function AnticiposGastosMenoresPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canWrite: false, canApprove: false });
  const [rows, setRows] = useState<Advance[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [custodians, setCustodians] = useState<Party[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [boxFilter, setBoxFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [advanceForm, setAdvanceForm] = useState<AdvanceForm>({ ...emptyAdvance });
  const [liquidating, setLiquidating] = useState<Advance | null>(null);
  const [liquidationForm, setLiquidationForm] = useState<LiquidationForm>({ ...emptyLiquidation });
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setAccess({
      ready: true,
      canRead: hasStoredRolePermission("accounting", "read"),
      canWrite: hasStoredRolePermission("accounting", "write"),
      // Liquidar y anular mueven el mayor general: el backend exige accounting/approve.
      canApprove: hasStoredRolePermission("accounting", "approve")
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "1000" });
      if (statusFilter) params.set("status", statusFilter);
      if (boxFilter) params.set("box_id", boxFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      // Maestros del formulario: cajas activas (ready_for_advances la calcula el servidor),
      // conceptos activos para el faltante de la liquidacion y terceros con rol de custodio.
      const [advanceRows, boxRows, conceptRows, supplierRows, employeeRows] = await Promise.all([
        api<Advance[]>(`/api/v1/petty-cash/advances?${params.toString()}`),
        api<Box[]>("/api/v1/petty-cash/boxes?include_inactive=true"),
        api<Concept[]>("/api/v1/petty-cash/concepts"),
        api<Party[]>("/api/v1/accounting/third-parties?type=supplier&active=true&limit=500"),
        api<Party[]>("/api/v1/accounting/third-parties?type=employee&active=true&limit=500")
      ]);
      setRows(advanceRows);
      setBoxes(boxRows);
      setConcepts(conceptRows);
      const seen = new Set<number>();
      const parties: Party[] = [];
      for (const party of [...supplierRows, ...employeeRows]) {
        if (!seen.has(party.id)) {
          seen.add(party.id);
          parties.push(party);
        }
      }
      parties.sort((left, right) => left.name.localeCompare(right.name, "es"));
      setCustodians(parties);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los anticipos de caja menor."));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, boxFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const activeBoxes = useMemo(() => boxes.filter((row) => row.active !== false), [boxes]);
  const activeConcepts = useMemo(() => concepts.filter((row) => row.active !== false), [concepts]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.full_number, row.custodian_name, row.description, row.box?.code, row.box?.name]
      .some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  if (!access.ready) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Gastos Menores...</div>;
  }

  if (!access.canRead) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">Anticipos no disponibles para este perfil</h1>
        <p className="mt-2 text-sm text-amber-900">
          Los anticipos comparten los permisos del módulo Contable. Solicita acceso de lectura a contabilidad para consultarlos.
        </p>
      </section>
    );
  }

  function openCreate() {
    setAdvanceForm({ ...emptyAdvance, date: today() });
    setMessage("");
    setError("");
    setCreating(true);
  }

  function openLiquidate(row: Advance) {
    // Reintegro por defecto = saldo pendiente: el servidor aplica el mismo criterio si no se envia.
    setLiquidationForm({
      ...emptyLiquidation,
      refund_amount: String(row.balance),
      shortfall_amount: "0"
    });
    setMessage("");
    setError("");
    setLiquidating(row);
  }

  // Cuerpo cerrado: unicamente las propiedades que declara advanceBody del backend.
  function advancePayload() {
    return {
      box_id: Number(advanceForm.box_id),
      date: advanceForm.date,
      amount: Number(advanceForm.amount),
      custodian_party_id: advanceForm.custodian_party_id ? Number(advanceForm.custodian_party_id) : null,
      description: advanceForm.description.trim() || null
    };
  }

  // Todas las propiedades de la liquidacion son opcionales; el cuerpo sigue cerrado.
  function liquidationPayload() {
    const shortfall = liquidationForm.shortfall_amount.trim();
    return {
      date: liquidationForm.date || null,
      refund_amount: liquidationForm.refund_amount.trim() ? Number(liquidationForm.refund_amount) : null,
      shortfall_amount: shortfall ? Number(shortfall) : null,
      shortfall_concept_code: liquidationForm.shortfall_concept_code || null
    };
  }

  async function saveAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await api<Advance>("/api/v1/petty-cash/advances", { method: "POST", body: JSON.stringify(advancePayload()) });
      setMessage(`Anticipo ${created.full_number} girado y contabilizado.`);
      setCreating(false);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible girar el anticipo."));
    } finally {
      setSaving(false);
    }
  }

  async function saveLiquidation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!liquidating) return;
    setWorking(true);
    setError("");
    try {
      const liquidated = await api<Advance>(`/api/v1/petty-cash/advances/${liquidating.id}/liquidate`, {
        method: "POST",
        body: JSON.stringify(liquidationPayload())
      });
      setMessage(`Anticipo ${liquidated.full_number} liquidado.`);
      setLiquidating(null);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible liquidar el anticipo."));
    } finally {
      setWorking(false);
    }
  }

  // cancel viaja SIN cuerpo: el backend no declara body en la ruta.
  async function cancelAdvance(row: Advance) {
    setError("");
    try {
      await api(`/api/v1/petty-cash/advances/${row.id}/cancel`, { method: "POST" });
      setMessage(`Anticipo ${row.full_number} anulado con reversión del asiento.`);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible anular el anticipo."));
    }
  }

  const selectedBox = activeBoxes.find((row) => String(row.id) === advanceForm.box_id) || null;
  const liquidationShortfall = Number(liquidationForm.shortfall_amount) || 0;
  const liquidationTotal = (Number(liquidationForm.refund_amount) || 0) + liquidationShortfall;

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-apex">Gastos Menores</p>
            <h1 className="text-3xl font-semibold">Anticipos de caja menor</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Giros de efectivo al custodio (documento APC) con su liquidación por reintegro o faltante.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => void load()} type="button">
              <RefreshCw size={16} /> Actualizar
            </button>
            {access.canWrite ? (
              <button className="btn-primary" onClick={openCreate} type="button">
                <Plus size={16} /> Nuevo anticipo
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <GastosMenoresNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white">
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-5">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Estado</span>
            <select className="control" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="">Todos</option>
              <option value="open">Abiertos</option>
              <option value="liquidated">Liquidados</option>
              <option value="cancelled">Anulados</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Caja</span>
            <select className="control" onChange={(event) => setBoxFilter(event.target.value)} value={boxFilter}>
              <option value="">Todas</option>
              {activeBoxes.map((row) => (
                <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Desde</span>
            <input className="control" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Hasta</span>
            <input className="control" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
          </label>
          <label className="relative block">
            <Search className="absolute left-3 top-9 text-neutral-400" size={16} />
            <span className="mb-1 block text-sm text-neutral-600">Buscar</span>
            <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Documento, custodio o caja" value={query} />
          </label>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando anticipos...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead>
                <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                  <th className="p-3">Documento</th>
                  <th>Fecha</th>
                  <th>Caja</th>
                  <th>Custodio</th>
                  <th>Valor</th>
                  <th>Aplicado</th>
                  <th>Saldo</th>
                  <th>Estado</th>
                  <th>Gastos</th>
                  {access.canApprove ? <th className="pr-3 text-right">Acción</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr className="border-b" key={row.id}>
                    <td className="p-3 font-mono">{row.full_number}</td>
                    <td className="p-3">{row.date?.slice(0, 10)}</td>
                    <td className="p-3">{row.box ? `${row.box.code} · ${row.box.name}` : row.box_id}</td>
                    <td className="p-3">{row.custodian_name || "Sin custodio"}</td>
                    <td className="p-3 text-right">{money(row.amount)}</td>
                    <td className="p-3 text-right">{money(row.applied_total)}</td>
                    <td className="p-3 text-right font-medium">{money(row.balance)}</td>
                    <td className="p-3">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="p-3 text-center">{row.vouchers_count ?? 0}</td>
                    {access.canApprove ? (
                      <td className="p-3 pr-3 text-right">
                        <div className="flex justify-end gap-2">
                          {row.status === "open" && row.balance > 0 ? (
                            <button className="btn-secondary" onClick={() => openLiquidate(row)} type="button">Liquidar</button>
                          ) : null}
                          {row.status === "open" ? (
                            <button className="btn-secondary" onClick={() => void cancelAdvance(row)} type="button">Anular</button>
                          ) : null}
                          {row.status !== "open" ? <span className="text-xs text-neutral-400">Cerrado</span> : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td className="p-8 text-center text-neutral-500" colSpan={access.canApprove ? 10 : 9}>
                      {rows.length
                        ? "No hay anticipos que coincidan con los filtros."
                        : "Aún no hay anticipos. Gira el primero a un custodio para poder imputarle comprobantes de gasto."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && access.canWrite ? (
        <ModalFrame
          maxWidth="md:max-w-2xl"
          onClose={() => setCreating(false)}
          title="Nuevo anticipo de caja menor"
        >
          <form className="space-y-4" onSubmit={saveAdvance}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Caja menor">
                <select
                  className="control"
                  onChange={(event) => setAdvanceForm({ ...advanceForm, box_id: event.target.value })}
                  required
                  value={advanceForm.box_id}
                >
                  <option value="">Seleccione la caja que gira el anticipo</option>
                  {activeBoxes.map((row) => (
                    <option disabled={row.ready_for_advances === false} key={row.id} value={row.id}>
                      {row.code} - {row.name}{row.ready_for_advances === false ? " (no lista para anticipos)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha del anticipo">
                <input
                  className="control"
                  onChange={(event) => setAdvanceForm({ ...advanceForm, date: event.target.value })}
                  required
                  type="date"
                  value={advanceForm.date}
                />
              </Field>
              <Field label="Valor del anticipo">
                <input
                  className="control"
                  min="0"
                  onChange={(event) => setAdvanceForm({ ...advanceForm, amount: event.target.value })}
                  placeholder="0"
                  required
                  type="number"
                  value={advanceForm.amount}
                />
              </Field>
              <Field label={`Custodio${selectedBox?.custodian_name ? ` (caja: ${selectedBox.custodian_name})` : ""}`}>
                <select
                  className="control"
                  onChange={(event) => setAdvanceForm({ ...advanceForm, custodian_party_id: event.target.value })}
                  value={advanceForm.custodian_party_id}
                >
                  <option value="">Usar el custodio de la caja</option>
                  {custodians.map((row) => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Descripción (opcional)">
                  <textarea
                    className="control"
                    maxLength={500}
                    onChange={(event) => setAdvanceForm({ ...advanceForm, description: event.target.value })}
                    rows={2}
                    value={advanceForm.description}
                  />
                </Field>
              </div>
            </div>
            {selectedBox?.block_unliquidated_advance ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Esta caja bloquea nuevos anticipos mientras tenga uno sin liquidar: el servidor rechazará el giro si aplica.
              </p>
            ) : null}
            <p className="text-xs text-neutral-500">
              El anticipo se contabiliza al momento (documento APC) debitando la cuenta de anticipos de la caja. Solo las cajas listas para anticipos pueden girar.
            </p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setCreating(false)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Girando..." : "Girar anticipo"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
      {liquidating && access.canApprove ? (
        <ModalFrame
          maxWidth="md:max-w-2xl"
          onClose={() => setLiquidating(null)}
          title={`Liquidar ${liquidating.full_number}`}
        >
          <form className="space-y-4" onSubmit={saveLiquidation}>
            <div className="rounded-md border border-line bg-paper p-3 text-sm">
              <p><span className="text-neutral-600">Caja:</span> {liquidating.box ? `${liquidating.box.code} · ${liquidating.box.name}` : liquidating.box_id}</p>
              <p><span className="text-neutral-600">Custodio:</span> {liquidating.custodian_name || "Sin custodio"}</p>
              <p><span className="text-neutral-600">Valor girado:</span> {money(liquidating.amount)}</p>
              <p><span className="text-neutral-600">Aplicado a gastos:</span> {money(liquidating.applied_total)}</p>
              <p className="font-semibold"><span className="text-neutral-600">Saldo pendiente:</span> {money(liquidating.balance)}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Fecha de liquidación (opcional)">
                <input
                  className="control"
                  onChange={(event) => setLiquidationForm({ ...liquidationForm, date: event.target.value })}
                  type="date"
                  value={liquidationForm.date}
                />
              </Field>
              <Field label="Reintegro a la caja">
                <input
                  className="control"
                  min="0"
                  onChange={(event) => setLiquidationForm({ ...liquidationForm, refund_amount: event.target.value })}
                  required
                  type="number"
                  value={liquidationForm.refund_amount}
                />
              </Field>
              <Field label="Faltante a cargo del custodio">
                <input
                  className="control"
                  min="0"
                  onChange={(event) => setLiquidationForm({ ...liquidationForm, shortfall_amount: event.target.value })}
                  required
                  type="number"
                  value={liquidationForm.shortfall_amount}
                />
              </Field>
              <Field label="Concepto del faltante">
                <select
                  className="control"
                  disabled={liquidationShortfall <= 0}
                  onChange={(event) => setLiquidationForm({ ...liquidationForm, shortfall_concept_code: event.target.value })}
                  required={liquidationShortfall > 0}
                  value={liquidationForm.shortfall_concept_code}
                >
                  <option value="">Sin faltante</option>
                  {activeConcepts.map((row) => (
                    <option key={row.id} value={row.code}>{row.code} - {row.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <p className={`text-xs ${liquidationTotal === liquidating.balance ? "text-neutral-500" : "text-red-600"}`}>
              Reintegro ({money(Number(liquidationForm.refund_amount) || 0)}) + faltante ({money(liquidationShortfall)}) = {money(liquidationTotal)}.
              Debe sumar exactamente el saldo pendiente ({money(liquidating.balance)}); el servidor rechaza la liquidación si no cuadra.
            </p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setLiquidating(null)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={working || liquidationTotal !== liquidating.balance} type="submit">{working ? "Liquidando..." : "Liquidar anticipo"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
