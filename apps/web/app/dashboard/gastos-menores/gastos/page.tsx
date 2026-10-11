"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
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
type Advance = { id: number; box_id: number; full_number: string; balance: number; custodian_name: string | null; status: string };
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
  branch_code: string;
};

type VoucherForm = {
  box_id: string;
  date: string;
  advance_id: string;
  description: string;
  lines: LineForm[];
};

const emptyLine: LineForm = {
  concept_id: "",
  description: "",
  base_amount: "",
  vat_code: "",
  supplier_party_id: "",
  invoice_reference: "",
  cost_center_code: "",
  branch_code: ""
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

export default function GastosGastosMenoresPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canWrite: false, canApprove: false });
  const [rows, setRows] = useState<Voucher[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [vats, setVats] = useState<VatMaster[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [openAdvances, setOpenAdvances] = useState<Advance[]>([]);
  const [orgTree, setOrgTree] = useState<OrgTree>({ societies: [], branches: [], cost_centers: [] });
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
  const [form, setForm] = useState<VoucherForm | null>(null);
  const [detail, setDetail] = useState<VoucherDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
      if (statusFilter) params.set("status", statusFilter);
      if (boxFilter) params.set("box_id", boxFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const [voucherRows, boxRows, conceptRows, vatRows, supplierRows, advanceRows, tree] = await Promise.all([
        api<Voucher[]>(`/api/v1/petty-cash/vouchers?${params.toString()}`),
        api<Box[]>("/api/v1/petty-cash/boxes?include_inactive=true"),
        api<Concept[]>("/api/v1/petty-cash/concepts"),
        api<VatMaster[]>("/api/v1/accounting/vat-masters?scope=purchases"),
        api<Party[]>("/api/v1/accounting/third-parties?type=supplier&active=true&limit=500"),
        api<Advance[]>("/api/v1/petty-cash/advances?status=open&limit=1000"),
        api<OrgTree>("/api/v1/accounting/organization-tree")
      ]);
      setRows(voucherRows);
      setBoxes(boxRows);
      setConcepts(conceptRows);
      setVats(vatRows);
      setSuppliers(supplierRows);
      setOpenAdvances(advanceRows.filter((row) => row.status === "open" && row.balance > 0));
      setOrgTree(tree);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los comprobantes de gasto."));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, boxFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const activeBoxes = useMemo(() => boxes.filter((row) => row.active !== false), [boxes]);
  const activeConcepts = useMemo(() => concepts.filter((row) => row.active !== false), [concepts]);
  const activeVats = useMemo(() => vats.filter((row) => row.active !== false), [vats]);
  const activeBranches = useMemo(() => orgTree.branches.filter((row) => row.active !== false), [orgTree.branches]);
  const activeCostCenters = useMemo(() => orgTree.cost_centers.filter((row) => row.active !== false), [orgTree.cost_centers]);
  const vatByCode = useMemo(() => new Map(activeVats.map((row) => [row.code, row])), [activeVats]);
  const conceptById = useMemo(() => new Map(activeConcepts.map((row) => [String(row.id), row])), [activeConcepts]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.full_number, row.description, row.box?.code, row.box?.name, row.advance?.full_number]
      .some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  // Anticipos abiertos de la caja seleccionada: los unicos imputables.
  const boxAdvances = useMemo(
    () => (form ? openAdvances.filter((row) => String(row.box_id) === form.box_id) : []),
    [form, openAdvances]
  );

  // Estimacion de totales con los mismos maestros de IVA que usa el servidor: solo para
  // mostrar; el backend recalcula vat_amount y total y nunca confia en estos numeros.
  const totals = useMemo(() => {
    if (!form) return { subtotal: 0, vat: 0, total: 0 };
    let subtotal = 0;
    let vat = 0;
    for (const line of form.lines) {
      const base = Number(line.base_amount) || 0;
      const percent = line.vat_code ? Number(vatByCode.get(line.vat_code)?.percent || 0) : 0;
      subtotal += base;
      vat += Math.round(base * (percent / 100));
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [form, vatByCode]);

  if (!access.ready) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Gastos Menores...</div>;
  }

  if (!access.canRead) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-950">Comprobantes de gasto no disponibles para este perfil</h1>
        <p className="mt-2 text-sm text-amber-900">
          Los comprobantes comparten los permisos del módulo Contable. Solicita acceso de lectura a contabilidad para consultarlos.
        </p>
      </section>
    );
  }

  function openCreate() {
    setForm({
      box_id: "",
      date: today(),
      advance_id: "",
      description: "",
      lines: [{ ...emptyLine }]
    });
    setMessage("");
    setError("");
    setCreating(true);
  }

  function setLine(index: number, patch: Partial<LineForm>) {
    if (!form) return;
    const lines = form.lines.map((line, position) => (position === index ? { ...line, ...patch } : line));
    setForm({ ...form, lines });
  }

  function addLine() {
    if (!form || form.lines.length >= 100) return;
    setForm({ ...form, lines: [...form.lines, { ...emptyLine }] });
  }

  function removeLine(index: number) {
    if (!form || form.lines.length <= 1) return;
    setForm({ ...form, lines: form.lines.filter((_, position) => position !== index) });
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

  // Cuerpo cerrado: unicamente las propiedades que declara voucherBody del backend. Nunca se
  // envian vat_amount ni total: el servidor los recalcula desde base_amount y el maestro de IVA.
  function voucherPayload() {
    if (!form) return null;
    return {
      box_id: Number(form.box_id),
      date: form.date,
      advance_id: form.advance_id ? Number(form.advance_id) : null,
      description: form.description.trim() || null,
      lines: form.lines.map((line) => ({
        concept_id: Number(line.concept_id),
        description: line.description.trim(),
        base_amount: Number(line.base_amount),
        vat_code: line.vat_code || null,
        cost_center_code: line.cost_center_code || null,
        branch_code: line.branch_code || null,
        supplier_party_id: line.supplier_party_id ? Number(line.supplier_party_id) : null,
        invoice_reference: line.invoice_reference.trim() || null
      }))
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const created = await api<Voucher>("/api/v1/petty-cash/vouchers", { method: "POST", body: JSON.stringify(voucherPayload()) });
      setMessage(`Comprobante ${created.full_number} contabilizado por ${money(created.total)}.`);
      setCreating(false);
      setForm(null);
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

  const selectedBox = activeBoxes.find((row) => String(row.id) === form?.box_id) || null;

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-apex">Gastos Menores</p>
            <h1 className="text-3xl font-semibold">Comprobantes de gasto</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Digitación de egresos de caja menor (documento GM) con IVA por línea y contabilización inmediata.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => void load()} type="button">
              <RefreshCw size={16} /> Actualizar
            </button>
            {access.canWrite ? (
              <button className="btn-primary" onClick={openCreate} type="button">
                <Plus size={16} /> Nuevo comprobante
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
              <option value="posted">Contabilizados</option>
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
            <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Documento, caja o anticipo" value={query} />
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
                        ? "No hay comprobantes que coincidan con los filtros."
                        : "Aún no hay comprobantes de gasto. Registra el primero con sus líneas e IVA."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && form && access.canWrite ? (
        <ModalFrame
          maxWidth="md:max-w-4xl"
          onClose={() => setCreating(false)}
          title="Nuevo comprobante de gasto"
        >
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Caja menor">
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, box_id: event.target.value, advance_id: "" })}
                  required
                  value={form.box_id}
                >
                  <option value="">Seleccione la caja que paga el gasto</option>
                  {activeBoxes.map((row) => (
                    <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha del comprobante">
                <input
                  className="control"
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  required
                  type="date"
                  value={form.date}
                />
              </Field>
              <Field label={`Anticipo a imputar${selectedBox?.require_advance ? " (obligatorio en esta caja)" : ""}`}>
                <select
                  className="control"
                  onChange={(event) => setForm({ ...form, advance_id: event.target.value })}
                  required={selectedBox?.require_advance === true}
                  value={form.advance_id}
                >
                  <option value="">
                    {selectedBox?.require_advance === true ? "Seleccione el anticipo vigente" : "Sin anticipo: efectivo de la caja"}
                  </option>
                  {boxAdvances.map((row) => (
                    <option key={row.id} value={row.id}>{row.full_number} · saldo {money(row.balance)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Descripción general (opcional)">
                <input
                  className="control"
                  maxLength={500}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  value={form.description}
                />
              </Field>
            </div>
            <div className="space-y-3">
              {form.lines.map((line, index) => {
                const concept = conceptById.get(line.concept_id) || null;
                return (
                  <div className="rounded-md border border-line p-3" key={index}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Línea {index + 1}</p>
                      {form.lines.length > 1 ? (
                        <button className="btn-secondary" onClick={() => removeLine(index)} type="button">
                          <Trash2 size={14} /> Quitar
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Concepto de gasto">
                        <select
                          className="control"
                          onChange={(event) => pickConcept(index, event.target.value)}
                          required
                          value={line.concept_id}
                        >
                          <option value="">Seleccione el concepto</option>
                          {activeConcepts.map((row) => (
                            <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Descripción del gasto">
                        <input
                          className="control"
                          maxLength={300}
                          onChange={(event) => setLine(index, { description: event.target.value })}
                          required
                          value={line.description}
                        />
                      </Field>
                      <Field label="Valor base (sin IVA)">
                        <input
                          className="control"
                          min="0"
                          onChange={(event) => setLine(index, { base_amount: event.target.value })}
                          required
                          type="number"
                          value={line.base_amount}
                        />
                      </Field>
                      <Field label="IVA de la línea">
                        <select
                          className="control"
                          onChange={(event) => setLine(index, { vat_code: event.target.value })}
                          value={line.vat_code}
                        >
                          <option value="">Sin IVA</option>
                          {activeVats.map((row) => (
                            <option key={row.code} value={row.code}>{row.code} - {row.concept} ({row.percent}%)</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Proveedor">
                        <select
                          className="control"
                          onChange={(event) => setLine(index, { supplier_party_id: event.target.value })}
                          required={concept?.requires_supplier === true}
                          value={line.supplier_party_id}
                        >
                          <option value="">Sin proveedor</option>
                          {suppliers.map((row) => (
                            <option key={row.id} value={row.id}>{row.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={`Referencia de factura${concept?.requires_invoice_reference ? " (obligatoria)" : ""}`}>
                        <input
                          className="control"
                          maxLength={100}
                          onChange={(event) => setLine(index, { invoice_reference: event.target.value })}
                          required={concept?.requires_invoice_reference === true}
                          value={line.invoice_reference}
                        />
                      </Field>
                      <Field label="Sucursal (opcional)">
                        <select
                          className="control"
                          onChange={(event) => setLine(index, { branch_code: event.target.value })}
                          value={line.branch_code}
                        >
                          <option value="">Sin sucursal</option>
                          {activeBranches.map((row) => (
                            <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Centro de costo (opcional)">
                        <select
                          className="control"
                          onChange={(event) => setLine(index, { cost_center_code: event.target.value })}
                          value={line.cost_center_code}
                        >
                          <option value="">Sin centro de costo</option>
                          {activeCostCenters.map((row) => (
                            <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    {concept && (concept.requires_supplier || concept.requires_invoice_reference) ? (
                      <p className="mt-2 text-xs text-amber-700">
                        El concepto {concept.code} exige{concept.requires_supplier ? " proveedor" : ""}
                        {concept.requires_supplier && concept.requires_invoice_reference ? " y" : ""}
                        {concept.requires_invoice_reference ? " referencia de factura" : ""}: el servidor rechaza la línea si faltan.
                      </p>
                    ) : null}
                  </div>
                );
              })}
              <button className="btn-secondary" onClick={addLine} type="button">
                <Plus size={16} /> Agregar línea
              </button>
            </div>
            <div className="rounded-md border border-line bg-paper p-3 text-sm">
              <div className="flex justify-between"><span>Base estimada</span><span>{money(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span>IVA estimado</span><span>{money(totals.vat)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total estimado</span><span>{money(totals.total)}</span></div>
              <p className="mt-1 text-xs text-neutral-500">El servidor recalcula el IVA y el total desde la base y el maestro de IVA: estos valores son solo guía.</p>
            </div>
            <p className="text-xs text-neutral-500">
              El comprobante se contabiliza al momento (documento GM): lo que cubra el anticipo se imputa a su saldo y el resto se acredita a la cuenta de la caja.
            </p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setCreating(false)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Contabilizando..." : "Contabilizar gasto"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
