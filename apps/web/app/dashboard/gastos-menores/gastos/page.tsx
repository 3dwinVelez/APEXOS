"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { GastosMenoresNav } from "@/components/gastos-menores-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

// DTO del listado de comprobantes (GET /api/v1/petty-cash/vouchers). El listado no incluye
// lines: se piden a /vouchers/:id al abrir el detalle.
type Voucher = {
  id: number;
  box_id: number;
  advance_id: number | null;
  document_type: string;
  number: number;
  full_number: string;
  date: string;
  posting_date: string;
  period: string;
  description: string | null;
  status: "posted" | "cancelled";
  subtotal: number;
  vat_total: number;
  total: number;
  accounting_document_id: number | null;
  reversal_accounting_document_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  box: { id: number; code: string; name: string; custodian_name: string | null } | null;
  advance: { id: number; full_number: string; balance: number; custodian_name: string | null } | null;
  lines_count: number | null;
  advance_applied_total: number | null;
  cash_applied_total: number | null;
};

type VoucherLine = {
  id: number;
  line_number: number;
  concept_code: string;
  account_code: string;
  description: string;
  cost_center_code: string | null;
  branch_code: string | null;
  supplier_party_id: number | null;
  supplier: { id: number; name: string } | null;
  invoice_reference: string | null;
  base_amount: number;
  vat_code: string | null;
  vat_percent: number;
  vat_amount: number;
  total: number;
  advance_applied: number;
  cash_applied: number;
};

type VoucherDetail = Voucher & { lines: VoucherLine[] };

type Box = {
  id: number;
  code: string;
  name: string;
  custodian_name: string | null;
  require_advance: boolean;
  active: boolean;
};

type Concept = {
  id: number;
  code: string;
  name: string;
  account_code: string;
  default_vat_code: string | null;
  requires_supplier: boolean;
  requires_invoice_reference: boolean;
  active: boolean;
};

type VatMaster = { code: string; concept: string; percent: number; active: boolean };
type Party = { id: number; code: string; name: string };
type Advance = {
  id: number;
  box_id: number;
  full_number: string;
  date: string;
  amount: number;
  balance: number;
  status: "open" | "liquidated" | "cancelled";
  custodian_name: string | null;
};
type OrgBranch = { code: string; name: string; active: boolean };
type OrgCostCenter = { code: string; name: string; active: boolean };
type OrgTree = { societies: { code: string; name: string }[]; branches: OrgBranch[]; cost_centers: OrgCostCenter[] };

type LineForm = {
  concept_id: string;
  description: string;
  base_amount: string;
  vat_code: string;
  supplier_party_id: string;
  invoice_reference: string;
  cost_center_code: string;
};

type RangePreset = "hoy" | "semana" | "mes" | "";

const emptyLine: LineForm = {
  concept_id: "",
  description: "",
  base_amount: "",
  vat_code: "",
  supplier_party_id: "",
  invoice_reference: "",
  cost_center_code: ""
};

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);

function toISODate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function today() {
  return toISODate(new Date());
}

function presetRange(preset: Exclude<RangePreset, "">) {
  const now = new Date();
  if (preset === "hoy") return { from: toISODate(now), to: toISODate(now) };
  if (preset === "semana") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: toISODate(start), to: toISODate(now) };
  }
  return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) };
}

function inRange(date: string, from: string, to: string) {
  const day = String(date || "").slice(0, 10);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

function isLineEmpty(line: LineForm) {
  return !line.concept_id && !line.description.trim() && !line.base_amount && !line.supplier_party_id && !line.invoice_reference.trim() && !line.cost_center_code;
}

// Celdas de la planilla: mismo lenguaje visual de .control pero plano, para sensación de hoja
// de cálculo. El foco dibuja el borde de acento.
const CELL = "h-9 w-full border-0 bg-transparent px-2 text-sm outline-none ring-apex/40 placeholder:text-neutral-400 focus:bg-white focus:ring-1 dark:focus:bg-slate-900";

const RANGE_PRESETS: Array<{ key: Exclude<RangePreset, "">; label: string }> = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Últimos 7 días" },
  { key: "mes", label: "Mes actual" }
];

export default function GastosGastosMenoresPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canWrite: false, canApprove: false });
  const [rows, setRows] = useState<Voucher[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [vats, setVats] = useState<VatMaster[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [orgTree, setOrgTree] = useState<OrgTree>({ societies: [], branches: [], cost_centers: [] });
  const [boxFilter, setBoxFilter] = useState("");
  const [rangePreset, setRangePreset] = useState<RangePreset>("mes");
  const [dateFrom, setDateFrom] = useState(() => presetRange("mes").from);
  const [dateTo, setDateTo] = useState(() => presetRange("mes").to);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  // Encabezado del comprobante en edición (la planilla queda siempre visible, sin modal).
  const [draft, setDraft] = useState({ date: today(), advance_id: "", description: "" });
  const [draftLines, setDraftLines] = useState<LineForm[]>([{ ...emptyLine }]);
  const [detail, setDetail] = useState<VoucherDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const registerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAccess({
      ready: true,
      canRead: hasStoredRolePermission("accounting", "read"),
      canWrite: hasStoredRolePermission("accounting", "write"),
      // Anular genera la reversion del asiento: el backend exige accounting/approve.
      canApprove: hasStoredRolePermission("accounting", "approve")
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "1000" });
      if (boxFilter) params.set("box_id", boxFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const [voucherRows, boxRows, conceptRows, vatRows, supplierRows, advanceRows, tree] = await Promise.all([
        api<Voucher[]>(`/api/v1/petty-cash/vouchers?${params.toString()}`),
        api<Box[]>("/api/v1/petty-cash/boxes?include_inactive=true"),
        api<Concept[]>("/api/v1/petty-cash/concepts"),
        api<VatMaster[]>("/api/v1/accounting/vat-masters?scope=purchases"),
        api<Party[]>("/api/v1/accounting/third-parties?type=supplier&active=true&limit=500"),
        api<Advance[]>("/api/v1/petty-cash/advances?limit=1000"),
        api<OrgTree>("/api/v1/accounting/organization-tree")
      ]);
      setRows(voucherRows);
      setBoxes(boxRows);
      setConcepts(conceptRows);
      setVats(vatRows);
      setSuppliers(supplierRows);
      setAdvances(advanceRows);
      setOrgTree(tree);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los datos de caja menor."));
    } finally {
      setLoading(false);
    }
  }, [boxFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const activeBoxes = useMemo(() => boxes.filter((row) => row.active !== false), [boxes]);
  const activeConcepts = useMemo(() => concepts.filter((row) => row.active !== false), [concepts]);
  const activeVats = useMemo(() => vats.filter((row) => row.active !== false), [vats]);
  const activeCostCenters = useMemo(() => orgTree.cost_centers.filter((row) => row.active !== false), [orgTree.cost_centers]);
  const vatByCode = useMemo(() => new Map(activeVats.map((row) => [row.code, row])), [activeVats]);
  const conceptById = useMemo(() => new Map(activeConcepts.map((row) => [String(row.id), row])), [activeConcepts]);

  // Caja de trabajo: la filtrada, o la primera activa como defecto (la planilla siempre
  // sabe qué caja está pagando).
  const effectiveBoxId = boxFilter || (activeBoxes[0] ? String(activeBoxes[0].id) : "");
  const selectedBox = activeBoxes.find((row) => String(row.id) === effectiveBoxId) || null;

  const applyPreset = (preset: Exclude<RangePreset, "">) => {
    const range = presetRange(preset);
    setRangePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const setCustomRange = (patch: { from?: string; to?: string }) => {
    setRangePreset("");
    if (patch.from !== undefined) setDateFrom(patch.from);
    if (patch.to !== undefined) setDateTo(patch.to);
  };

  // ---- Resumen del periodo (misma idea del "saldo" del libro caja: totales y contadores) ----
  const summary = useMemo(() => {
    const gastos = rows.filter((row) => row.status !== "cancelled");
    const gastosTotal = gastos.reduce((acc, row) => acc + Number(row.total || 0), 0);
    const ingresos = advances.filter((row) => row.status !== "cancelled" && inRange(row.date, dateFrom, dateTo) && (!boxFilter || String(row.box_id) === boxFilter));
    const ingresosTotal = ingresos.reduce((acc, row) => acc + Number(row.amount || 0), 0);
    const anticiposAbiertos = advances.filter((row) => row.status === "open" && Number(row.balance) > 0 && String(row.box_id) === effectiveBoxId);
    const anticipoAbiertoTotal = anticiposAbiertos.reduce((acc, row) => acc + Number(row.balance || 0), 0);
    return {
      gastosCount: gastos.length,
      gastosTotal,
      ingresosCount: ingresos.length,
      ingresosTotal,
      neto: ingresosTotal - gastosTotal,
      anticiposAbiertos: anticiposAbiertos.length,
      anticipoAbiertoTotal
    };
  }, [rows, advances, dateFrom, dateTo, boxFilter, effectiveBoxId]);

  // Anticipos abiertos de la caja seleccionada: los unicos imputables en el encabezado.
  const boxAdvances = useMemo(
    () => advances.filter((row) => row.status === "open" && Number(row.balance) > 0 && String(row.box_id) === effectiveBoxId),
    [advances, effectiveBoxId]
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.full_number, row.description, row.box?.code, row.box?.name, row.advance?.full_number]
      .some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  // Estimacion de totales con los mismos maestros de IVA que usa el servidor: solo para
  // mostrar; el backend recalcula vat_amount y total y nunca confia en estos numeros.
  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const line of draftLines) {
      if (isLineEmpty(line)) continue;
      const base = Number(line.base_amount) || 0;
      const percent = line.vat_code ? Number(vatByCode.get(line.vat_code)?.percent || 0) : 0;
      subtotal += base;
      vat += Math.round(base * (percent / 100));
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [draftLines, vatByCode]);

  const filledLines = useMemo(() => draftLines.filter((line) => !isLineEmpty(line)).length, [draftLines]);

  if (!access.ready) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Gastos Menores...</div>;
  }

  if (!access.canRead) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">Registro de caja menor no disponible para este perfil</h1>
        <p className="mt-2 text-sm text-amber-900">
          El registro comparte los permisos del módulo Contable. Solicita acceso de lectura a contabilidad para consultarlo.
        </p>
      </section>
    );
  }

  function setLine(index: number, patch: Partial<LineForm>) {
    setDraftLines((lines) => {
      const next = lines.map((line, position) => (position === index ? { ...line, ...patch } : line));
      // La planilla siempre ofrece una fila vacía al final: al empezar a llenar la ultima
      // fila aparece la siguiente, como en el libro caja de referencia.
      if (index === next.length - 1 && !isLineEmpty(next[index]) && next.length < 100) next.push({ ...emptyLine });
      return next;
    });
  }

  function removeLine(index: number) {
    setDraftLines((lines) => {
      const next = lines.filter((_, position) => position !== index);
      return next.length ? next : [{ ...emptyLine }];
    });
  }

  // Al elegir el concepto se sugiere su IVA por defecto (default_vat_code): es una sugerencia,
  // el usuario puede quitarla; la ausencia de IVA es un caso valido del negocio.
  function pickConcept(index: number, conceptId: string) {
    const concept = conceptById.get(conceptId);
    setLine(index, {
      concept_id: conceptId,
      vat_code: concept?.default_vat_code || ""
    });
  }

  // Enter mueve el foco a la celda siguiente de la planilla (desde la ultima abre otra fila
  // y salta a ella): digitacion continua sin salir del teclado.
  function focusNextCell(event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const root = registerRef.current;
    if (!root) return;
    const cells = Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"));
    const current = cells.indexOf(event.currentTarget);
    const next = cells[current + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement) next.select();
      return;
    }
    setDraftLines((lines) => {
      const lastEmpty = isLineEmpty(lines[lines.length - 1] || emptyLine);
      const nextLines = lastEmpty ? lines : [...lines, { ...emptyLine }];
      if (nextLines.length >= 100) return nextLines;
      return nextLines;
    });
    window.setTimeout(() => {
      const updated = registerRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
      const first = updated?.[current + 1];
      if (first) {
        first.focus();
        if (first instanceof HTMLInputElement) first.select();
      }
    }, 0);
  }

  // Cuerpo cerrado: unicamente las propiedades que declara voucherBody del backend. Nunca se
  // envian vat_amount ni total: el servidor los recalcula desde base_amount y el maestro de IVA.
  function voucherPayload() {
    const lines = draftLines.filter((line) => !isLineEmpty(line));
    return {
      box_id: Number(effectiveBoxId),
      date: draft.date,
      advance_id: draft.advance_id ? Number(draft.advance_id) : null,
      description: draft.description.trim() || null,
      lines: lines.map((line) => ({
        concept_id: Number(line.concept_id),
        description: line.description.trim(),
        base_amount: Number(line.base_amount),
        vat_code: line.vat_code || null,
        cost_center_code: line.cost_center_code || null,
        branch_code: null,
        supplier_party_id: line.supplier_party_id ? Number(line.supplier_party_id) : null,
        invoice_reference: line.invoice_reference.trim() || null
      }))
    };
  }

  function resetDraft() {
    setDraft({ date: today(), advance_id: "", description: "" });
    setDraftLines([{ ...emptyLine }]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!effectiveBoxId) {
      setError("Selecciona la caja que paga el gasto.");
      return;
    }
    if (!filledLines) {
      setError("Digita al menos una línea de gasto en la planilla.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await api<Voucher>("/api/v1/petty-cash/vouchers", { method: "POST", body: JSON.stringify(voucherPayload()) });
      setMessage(`Comprobante ${created.full_number} contabilizado por ${money(created.total)}.`);
      resetDraft();
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible registrar el comprobante de gasto."));
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(row: Voucher) {
    setDetailLoading(true);
    setMessage("");
    setError("");
    try {
      setDetail(await api<VoucherDetail>(`/api/v1/petty-cash/vouchers/${row.id}`));
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar el detalle del comprobante."));
    } finally {
      setDetailLoading(false);
    }
  }

  // cancel viaja SIN cuerpo: el backend no declara body en la ruta.
  async function cancelVoucher(row: Voucher) {
    setError("");
    try {
      await api(`/api/v1/petty-cash/vouchers/${row.id}/cancel`, { method: "POST" });
      setMessage(`Comprobante ${row.full_number} anulado con reversión del asiento.`);
      setDetail(null);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible anular el comprobante."));
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-apex">Gastos Menores</p>
            <h1 className="text-3xl font-semibold">Registro de gastos de caja</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Libro caja de egresos: digita las líneas directamente en la planilla y contabiliza el comprobante (documento GM) con IVA por línea.
            </p>
          </div>
          <button className="btn-secondary" onClick={() => void load()} type="button">
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </header>
      <GastosMenoresNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="apex-section-card space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-64 text-sm">
            <span className="mb-1 block text-neutral-600">Libro caja</span>
            <select className="control" onChange={(event) => setBoxFilter(event.target.value)} value={boxFilter}>
              <option value="">Todas las cajas</option>
              {activeBoxes.map((row) => (
                <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-sm text-neutral-600">Periodo</span>
            <div className="flex gap-1">
              {RANGE_PRESETS.map((preset) => (
                <button
                  className={`h-10 rounded-md border px-3 text-sm font-medium transition-colors ${rangePreset === preset.key
                    ? "border-transparent bg-apex text-white"
                    : "border-line bg-white text-neutral-600 hover:border-apex hover:text-apex"}`}
                  key={preset.key}
                  onClick={() => applyPreset(preset.key)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Desde</span>
            <input className="control" onChange={(event) => setCustomRange({ from: event.target.value })} type="date" value={dateFrom} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Hasta</span>
            <input className="control" onChange={(event) => setCustomRange({ to: event.target.value })} type="date" value={dateTo} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-line bg-paper p-3">
            <p className="text-xs uppercase text-neutral-500">Gastos del periodo</p>
            <p className="mt-1 text-xl font-semibold">{money(summary.gastosTotal)}</p>
            <p className="text-xs text-neutral-500">{summary.gastosCount} comprobante{summary.gastosCount === 1 ? "" : "s"}</p>
          </div>
          <div className="rounded-md border border-line bg-paper p-3">
            <p className="text-xs uppercase text-neutral-500">Ingresos del periodo (anticipos)</p>
            <p className="mt-1 text-xl font-semibold">{money(summary.ingresosTotal)}</p>
            <p className="text-xs text-neutral-500">{summary.ingresosCount} anticipo{summary.ingresosCount === 1 ? "" : "s"}</p>
          </div>
          <div className="rounded-md border border-line bg-paper p-3">
            <p className="text-xs uppercase text-neutral-500">Movimiento neto del periodo</p>
            <p className={`mt-1 text-xl font-semibold ${summary.neto < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(summary.neto)}</p>
            <p className="text-xs text-neutral-500">ingresos menos gastos</p>
          </div>
          <div className="rounded-md border border-line bg-paper p-3">
            <p className="text-xs uppercase text-neutral-500">Anticipo abierto{selectedBox ? ` · ${selectedBox.code}` : ""}</p>
            <p className="mt-1 text-xl font-semibold">{money(summary.anticipoAbiertoTotal)}</p>
            <p className="text-xs text-neutral-500">{summary.anticiposAbiertos} anticipo{summary.anticiposAbiertos === 1 ? "" : "s"} vigente{summary.anticiposAbiertos === 1 ? "" : "s"}</p>
          </div>
        </div>
      </section>

      {access.canWrite ? (
        <section className="apex-section-card p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Nuevo comprobante</h2>
              <p className="text-sm text-neutral-600">
                {selectedBox ? `Caja ${selectedBox.code} - ${selectedBox.name}` : "Selecciona una caja en el filtro superior para registrar."}
                {selectedBox?.require_advance ? " · Esta caja exige anticipo." : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-neutral-600">Fecha</span>
                <input
                  className="control"
                  onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                  required
                  type="date"
                  value={draft.date}
                />
              </label>
              <label className="w-64 text-sm">
                <span className="mb-1 block text-neutral-600">{`Anticipo${selectedBox?.require_advance ? " (obligatorio)" : ""}`}</span>
                <select
                  className="control"
                  onChange={(event) => setDraft({ ...draft, advance_id: event.target.value })}
                  required={selectedBox?.require_advance === true}
                  value={draft.advance_id}
                >
                  <option value="">
                    {selectedBox?.require_advance === true ? "Seleccione el anticipo vigente" : "Sin anticipo: efectivo de la caja"}
                  </option>
                  {boxAdvances.map((row) => (
                    <option key={row.id} value={row.id}>{row.full_number} · saldo {money(row.balance)}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-56 flex-1 text-sm">
                <span className="mb-1 block text-neutral-600">Descripción general (opcional)</span>
                <input
                  className="control"
                  maxLength={500}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  value={draft.description}
                />
              </label>
            </div>
          </div>

          <form onSubmit={save}>
            <div className="overflow-x-auto rounded-md border border-line" ref={registerRef}>
              <table className="w-full min-w-[1080px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="w-8 px-2 py-2 text-center">#</th>
                    <th className="min-w-44 px-1 py-2">Concepto</th>
                    <th className="min-w-48 px-1 py-2">Descripción</th>
                    <th className="w-32 px-1 py-2 text-right">Base</th>
                    <th className="min-w-36 px-1 py-2">IVA</th>
                    <th className="min-w-40 px-1 py-2">Proveedor</th>
                    <th className="min-w-32 px-1 py-2">Factura</th>
                    <th className="min-w-40 px-1 py-2">C. costo</th>
                    <th className="w-32 px-2 py-2 text-right">Total</th>
                    <th className="w-10 px-1 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draftLines.map((line, index) => {
                    const concept = conceptById.get(line.concept_id) || null;
                    const base = Number(line.base_amount) || 0;
                    const percent = line.vat_code ? Number(vatByCode.get(line.vat_code)?.percent || 0) : 0;
                    const lineTotal = base + Math.round(base * (percent / 100));
                    const last = index === draftLines.length - 1;
                    return (
                      <tr className={`border-b align-middle ${last ? "bg-emerald-50/40" : ""}`} key={index}>
                        <td className="px-2 py-1 text-center text-xs text-neutral-400">{index + 1}</td>
                        <td className="p-1">
                          <select
                            aria-label={`Concepto línea ${index + 1}`}
                            className={CELL}
                            onChange={(event) => pickConcept(index, event.target.value)}
                            onKeyDown={focusNextCell}
                            required={!isLineEmpty(line)}
                            value={line.concept_id}
                          >
                            <option value="">{last ? "+ agregar concepto" : "Seleccione"}</option>
                            {activeConcepts.map((row) => (
                              <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            aria-label={`Descripción línea ${index + 1}`}
                            className={CELL}
                            maxLength={300}
                            onChange={(event) => setLine(index, { description: event.target.value })}
                            onKeyDown={focusNextCell}
                            placeholder="Detalle del gasto"
                            required={!isLineEmpty(line)}
                            value={line.description}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            aria-label={`Base línea ${index + 1}`}
                            className={`${CELL} text-right`}
                            min="0"
                            onChange={(event) => setLine(index, { base_amount: event.target.value })}
                            onKeyDown={focusNextCell}
                            placeholder="0"
                            required={!isLineEmpty(line)}
                            type="number"
                            value={line.base_amount}
                          />
                        </td>
                        <td className="p-1">
                          <select
                            aria-label={`IVA línea ${index + 1}`}
                            className={CELL}
                            onChange={(event) => setLine(index, { vat_code: event.target.value })}
                            onKeyDown={focusNextCell}
                            value={line.vat_code}
                          >
                            <option value="">Sin IVA</option>
                            {activeVats.map((row) => (
                              <option key={row.code} value={row.code}>{row.code} ({row.percent}%)</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <select
                            aria-label={`Proveedor línea ${index + 1}`}
                            className={CELL}
                            onChange={(event) => setLine(index, { supplier_party_id: event.target.value })}
                            onKeyDown={focusNextCell}
                            required={concept?.requires_supplier === true}
                            value={line.supplier_party_id}
                          >
                            <option value="">Sin proveedor</option>
                            {suppliers.map((row) => (
                              <option key={row.id} value={row.id}>{row.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            aria-label={`Factura línea ${index + 1}`}
                            className={CELL}
                            maxLength={100}
                            onChange={(event) => setLine(index, { invoice_reference: event.target.value })}
                            onKeyDown={focusNextCell}
                            placeholder={concept?.requires_invoice_reference ? "Obligatoria" : "Ref."}
                            required={concept?.requires_invoice_reference === true}
                            value={line.invoice_reference}
                          />
                        </td>
                        <td className="p-1">
                          <select
                            aria-label={`Centro de costo línea ${index + 1}`}
                            className={CELL}
                            onChange={(event) => setLine(index, { cost_center_code: event.target.value })}
                            onKeyDown={focusNextCell}
                            value={line.cost_center_code}
                          >
                            <option value="">Sin centro</option>
                            {activeCostCenters.map((row) => (
                              <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-right text-sm font-medium">{isLineEmpty(line) ? "--" : money(lineTotal)}</td>
                        <td className="px-1 py-1 text-center">
                          {draftLines.length > 1 ? (
                            <button
                              aria-label={`Quitar línea ${index + 1}`}
                              className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => removeLine(index)}
                              tabIndex={-1}
                              type="button"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {draftLines.some((line) => {
              const concept = conceptById.get(line.concept_id);
              return concept && (concept.requires_supplier || concept.requires_invoice_reference);
            }) ? (
              <p className="mt-2 text-xs text-amber-700">
                Hay conceptos que exigen proveedor y/o referencia de factura: el servidor rechaza la línea si faltan.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button className="btn-secondary" onClick={resetDraft} type="button">
                <Trash2 size={16} /> Limpiar planilla
              </button>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm">
                  <p><span className="text-neutral-600">Base</span> <span className="ml-2 inline-block min-w-28 font-medium">{money(totals.subtotal)}</span></p>
                  <p><span className="text-neutral-600">IVA</span> <span className="ml-2 inline-block min-w-28 font-medium">{money(totals.vat)}</span></p>
                  <p className="text-base font-semibold"><span className="text-neutral-600">Total</span> <span className="ml-2 inline-block min-w-28">{money(totals.total)}</span></p>
                </div>
                <button className="btn-primary" disabled={saving || !effectiveBoxId || !filledLines} type="submit">
                  {saving ? "Contabilizando..." : `Contabilizar ${filledLines ? `${filledLines} línea${filledLines === 1 ? "" : "s"}` : "gasto"}`}
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              El comprobante se contabiliza al momento (documento GM): lo que cubra el anticipo se imputa a su saldo y el resto se acredita a la cuenta de la caja. Los totales son estimados: el servidor recalcula el IVA y el total desde la base.
            </p>
          </form>
        </section>
      ) : null}

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-lg font-semibold">Comprobantes del periodo</h2>
            <p className="text-sm text-neutral-600">{loading ? "Cargando..." : `${filtered.length} comprobante${filtered.length === 1 ? "" : "s"} · ${money(summary.gastosTotal)} en gastos`}</p>
          </div>
          <label className="relative block w-72">
            <Search className="absolute left-3 top-3 text-neutral-400" size={16} />
            <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar documento, caja o anticipo" value={query} />
          </label>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando comprobantes de gasto...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead>
                <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                  <th className="p-3">Documento</th>
                  <th>Fecha</th>
                  <th>Caja</th>
                  <th>Anticipo</th>
                  <th>Líneas</th>
                  <th>Base</th>
                  <th>IVA</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th className="pr-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr className="border-b" key={row.id}>
                    <td className="p-3 font-mono">{row.full_number}</td>
                    <td className="p-3">{row.date?.slice(0, 10)}</td>
                    <td className="p-3">{row.box ? `${row.box.code} · ${row.box.name}` : row.box_id}</td>
                    <td className="p-3 font-mono">{row.advance?.full_number || "Efectivo"}</td>
                    <td className="p-3 text-center">{row.lines_count ?? 0}</td>
                    <td className="p-3 text-right">{money(row.subtotal)}</td>
                    <td className="p-3 text-right">{money(row.vat_total)}</td>
                    <td className="p-3 text-right font-medium">{money(row.total)}</td>
                    <td className="p-3">{row.status === "cancelled" ? "Anulado" : "Contabilizado"}</td>
                    <td className="p-3 pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary" onClick={() => void openDetail(row)} type="button">Ver</button>
                        {access.canApprove && row.status !== "cancelled" ? (
                          <button className="btn-secondary" onClick={() => void cancelVoucher(row)} type="button">Anular</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td className="p-8 text-center text-neutral-500" colSpan={10}>
                      {rows.length
                        ? "No hay comprobantes que coincidan con la búsqueda."
                        : "Aún no hay comprobantes de gasto en el periodo seleccionado."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailLoading ? (
        <p className="rounded-md border border-line bg-white p-4 text-sm text-neutral-500">Cargando detalle del comprobante...</p>
      ) : null}
      {detail ? (
        <ModalFrame
          maxWidth="md:max-w-4xl"
          onClose={() => setDetail(null)}
          title={`Comprobante ${detail.full_number}`}
        >
          <div className="space-y-4">
            <div className="grid gap-2 rounded-md border border-line bg-paper p-3 text-sm md:grid-cols-2">
              <p><span className="text-neutral-600">Caja:</span> {detail.box ? `${detail.box.code} · ${detail.box.name}` : detail.box_id}</p>
              <p><span className="text-neutral-600">Fecha:</span> {detail.date?.slice(0, 10)} · periodo {detail.period}</p>
              <p><span className="text-neutral-600">Anticipo:</span> {detail.advance ? detail.advance.full_number : "Efectivo de la caja"}</p>
              <p><span className="text-neutral-600">Estado:</span> {detail.status === "cancelled" ? "Anulado" : "Contabilizado"}</p>
              {detail.description ? <p className="md:col-span-2"><span className="text-neutral-600">Descripción:</span> {detail.description}</p> : null}
              <p><span className="text-neutral-600">Imputado al anticipo:</span> {money(detail.advance_applied_total ?? 0)}</p>
              <p><span className="text-neutral-600">Pagado con efectivo:</span> {money(detail.cash_applied_total ?? 0)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="p-2">#</th>
                    <th>Concepto</th>
                    <th>Descripción</th>
                    <th>Cuenta</th>
                    <th>Proveedor</th>
                    <th>Factura</th>
                    <th className="text-right">Base</th>
                    <th className="text-right">IVA</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.lines || []).map((line) => (
                    <tr className="border-b" key={line.id}>
                      <td className="p-2">{line.line_number}</td>
                      <td className="p-2 font-mono">{line.concept_code}</td>
                      <td className="p-2">{line.description}</td>
                      <td className="p-2 font-mono">{line.account_code}</td>
                      <td className="p-2">{line.supplier?.name || "--"}</td>
                      <td className="p-2">{line.invoice_reference || "--"}</td>
                      <td className="p-2 text-right">{money(line.base_amount)}</td>
                      <td className="p-2 text-right">{line.vat_code ? `${money(line.vat_amount)} (${line.vat_percent}%)` : "Sin IVA"}</td>
                      <td className="p-2 text-right font-medium">{money(line.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between rounded-md border border-line bg-paper p-3 text-sm">
              <span>Base {money(detail.subtotal)} · IVA {money(detail.vat_total)}</span>
              <span className="font-semibold">Total {money(detail.total)}</span>
            </div>
            {access.canApprove && detail.status !== "cancelled" ? (
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <button className="btn-secondary" onClick={() => setDetail(null)} type="button">Cerrar</button>
                <button className="btn-secondary" onClick={() => void cancelVoucher(detail)} type="button">Anular comprobante</button>
              </div>
            ) : (
              <div className="flex justify-end border-t border-line pt-4">
                <button className="btn-secondary" onClick={() => setDetail(null)} type="button">Cerrar</button>
              </div>
            )}
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
