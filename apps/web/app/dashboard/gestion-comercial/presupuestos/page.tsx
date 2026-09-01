"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from "@/lib/api";
import { ArrowLeft, Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
type Row = Record<string, any>;
const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const inputClass =
  "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-apex";
export default function BudgetsPage() {
  const [periods, setPeriods] = useState<Row[]>([]),
    [data, setData] = useState<Row>({
      advisor_budgets: [],
      customer_budgets: [],
    }),
    [advisors, setAdvisors] = useState<Row[]>([]),
    [customers, setCustomers] = useState<Row[]>([]),
    [orders, setOrders] = useState<Row[]>([]);
  const [view, setView] = useState<"configuration" | "execution">("execution"),
    [years, setYears] = useState<string[] | null>([String(new Date().getFullYear())]),
    [months, setMonths] = useState<string[] | null>(null),
    [advisorFilter, setAdvisorFilter] = useState<string[] | null>(null),
    [editing, setEditing] = useState<Row | null>(null),
    [creating, setCreating] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [p, b, a, c, o] = await Promise.all([
      api<Row[]>("/api/v1/commercial-management/periods"),
      api<Row>(
        "/api/v1/commercial-management/budgets",
      ),
      api<Row[]>("/api/v1/commercial-management/advisors"),
      api<Row[]>("/api/v1/commercial-management/customers"),
      api<Row[]>("/api/v1/commercial-management/orders", { cache: "no-store" }),
    ]);
    setPeriods(p);
    setData(b);
    setAdvisors(a);
    setCustomers(c);
    setOrders(o);
  }, []);
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [load]);
  const rows = useMemo(
    () => [
      ...(data.advisor_budgets || []).map((i: Row) => ({
        ...i,
        scope: "advisor",
        owner: i.advisor?.name,
      })),
      ...(data.customer_budgets || []).map((i: Row) => ({
        ...i,
        scope: "customer",
        owner: i.customer?.legal_name,
      })),
    ],
    [data],
  );
  const filteredRows = useMemo(() => rows.filter((row: Row) => {
    const value = row.budget_type === "DAILY" ? row.budget_date : row.period?.start_date;
    if (!value) return false;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", year: "numeric", month: "numeric" }).formatToParts(new Date(value));
    const part = (type: string) => parts.find(item => item.type === type)?.value || "";
    return (years === null || years.includes(part("year"))) && (months === null || months.includes(part("month"))) && (advisorFilter === null || advisorFilter.includes(String(row.advisor_id)));
  }), [rows, years, months, advisorFilter]);
  const report = useMemo(
    () =>
      filteredRows.map((row: Row) => {
        const daily = row.budget_type === "DAILY";
        const day = daily
          ? new Date(row.budget_date).toLocaleDateString("en-CA", {
              timeZone: "America/Bogota",
            })
          : "";
        const rangeStart = daily
          ? new Date(`${day}T00:00:00-05:00`)
          : new Date(row.period.start_date);
        const rangeEnd = daily
          ? new Date(`${day}T23:59:59.999-05:00`)
          : new Date(row.period.end_date);
        const sales = orders
            .filter(
              (o) =>
                ["REGISTERED", "CONFIRMED", "INVOICED"].includes(o.status) &&
                new Date(o.order_date) >= rangeStart &&
                new Date(o.order_date) <= rangeEnd &&
                (row.scope === "advisor"
                  ? o.advisor_id === row.advisor_id
                  : o.customer_id === row.customer_id),
            )
            .reduce((s, o) => s + Number(o.total), 0),
          budget = Number(row.budget_amount);
        return {
          ...row,
          sales,
          difference: sales - budget,
          compliance: budget ? sales / budget : 0,
        };
      }),
    [filteredRows, orders],
  );
  const saved = async (text: string) => {
    setCreating(false);
    setEditing(null);
    setMessage(text);
    await load();
  };
  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-apex"
              href="/dashboard/gestion-comercial"
            >
              <ArrowLeft size={15} />
              Volver
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">
              Presupuestos comerciales
            </h1>
            <p className="text-sm text-neutral-600">
              Configura metas comerciales y analiza su ejecución contra pedidos realizados.
            </p>
          </div>

        </div>
      </header>
      {message ? (
        <div className="rounded-md border border-line bg-white p-3 text-sm">
          {message}
        </div>
      ) : null}
<section className="apex-section-card space-y-4 p-4">
        <div className="flex flex-wrap gap-2">{[["execution", "Ejecutado vs. real"], ["configuration", "Configuración del presupuesto"]].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value as "configuration" | "execution")} className={`rounded-md border px-4 py-2 text-sm font-semibold ${view === value ? "border-apex bg-apex text-white" : "border-line"}`}>{label}</button>)}</div>
        <BudgetFilters periods={periods} advisors={advisors} years={years} months={months} selectedAdvisors={advisorFilter} onYears={setYears} onMonths={setMonths} onAdvisors={setAdvisorFilter}/>
      </section>
      {view === "configuration" ? <section className="apex-section-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Configuración del presupuesto</h2><p className="text-sm text-neutral-600">Crea y modifica metas mensuales o diarias según los filtros seleccionados.</p></div><button className="apex-primary-action inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold" onClick={() => setCreating(true)} type="button"><Plus size={16}/>Crear presupuesto</button></div><BudgetTable rows={filteredRows} onEdit={setEditing}/></section> : <Report rows={report} />}
      {creating ? (
        <CreateModal
          periods={periods}
          advisors={advisors}
          customers={customers}
          onClose={() => setCreating(false)}
          onSaved={() => saved("Presupuesto creado correctamente.")}
        />
      ) : null}
      {editing ? (
        <EditModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => saved("Presupuesto actualizado.")}
        />
      ) : null}
    </div>
  );
}
const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function BudgetFilters({ periods, advisors, years, months, selectedAdvisors, onYears, onMonths, onAdvisors }: { periods: Row[]; advisors: Row[]; years: string[] | null; months: string[] | null; selectedAdvisors: string[] | null; onYears: (value: string[] | null) => void; onMonths: (value: string[] | null) => void; onAdvisors: (value: string[] | null) => void }) {
  const yearOptions = [...new Set(periods.map(period => new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", year: "numeric" }).format(new Date(period.start_date))))].sort((a, b) => Number(b) - Number(a));
  for (const selected of years || []) if (!yearOptions.includes(selected)) yearOptions.push(selected);
  const advisorOptions = advisors.map(row => ({ value: String(row.id), label: `${row.code} · ${row.name}` }));
  return <div><h2 className="text-sm font-semibold">Filtros múltiples</h2><p className="mt-1 text-xs text-neutral-500">Puedes combinar varios años, meses y asesores. “Seleccionar todo” mantiene el filtro abierto a todos los valores disponibles.</p><div className="mt-2 grid gap-3 sm:grid-cols-3"><MultiFilter label="Años" options={yearOptions.map(value => ({ value, label: value }))} selected={years} onChange={onYears}/><MultiFilter label="Meses" options={monthNames.map((label, index) => ({ value: String(index + 1), label }))} selected={months} onChange={onMonths}/><MultiFilter label="Asesores" options={advisorOptions} selected={selectedAdvisors} onChange={onAdvisors}/></div></div>;
}
function MultiFilter({ label, options, selected, onChange }: { label: string; options: { value: string; label: string }[]; selected: string[] | null; onChange: (value: string[] | null) => void }) {
  const summary = selected === null ? "Todos" : selected.length === 0 ? "Ninguno" : selected.length === 1 ? options.find(option => option.value === selected[0])?.label || selected[0] : `${selected.length} seleccionados`;
  function toggle(value: string) {
    if (selected === null) { onChange(options.map(option => option.value).filter(item => item !== value)); return; }
    onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]);
  }
  return <details className="relative"><summary className={`${inputClass} flex cursor-pointer list-none items-center justify-between`}><span><span className="mr-2 text-xs text-neutral-500">{label}</span>{summary}</span><span aria-hidden="true">⌄</span></summary><fieldset className="absolute z-40 mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-md border border-line bg-white p-2 shadow-xl"><legend className="sr-only">Seleccionar {label.toLowerCase()}</legend><label className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm font-semibold hover:bg-paper"><input type="checkbox" checked={selected === null} onChange={() => onChange(selected === null ? [] : null)}/>Seleccionar todo</label><div className="my-1 border-t border-line"/>{options.map(option => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-paper"><input type="checkbox" checked={selected === null || selected.includes(option.value)} onChange={() => toggle(option.value)}/>{option.label}</label>)}{!options.length && <p className="p-2 text-sm text-neutral-500">No hay opciones disponibles.</p>}</fieldset></details>;
}
function BudgetTable({
  rows,
  onEdit,
}: {
  rows: Row[];
  onEdit: (r: Row) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase text-neutral-500">
            <th className="p-3">Período</th>
            <th className="p-3">Nivel</th>
            <th className="p-3">Responsable</th>
            <th className="p-3">Valor</th>
            <th className="p-3 text-right">Acción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr className="border-b border-line/70" key={`${r.scope}-${r.id}`}>
              <td className="p-3">{r.period?.name}</td>
              <td className="p-3">
                {r.scope === "advisor" ? "Asesor" : "Cliente"}
                <p className="text-xs text-neutral-500">
                  {r.budget_type === "DAILY"
                    ? `Diario · ${new Date(r.budget_date).toLocaleDateString("es-CO")}`
                    : "Mensual"}
                </p>
              </td>
              <td className="p-3 font-semibold">{r.owner}</td>
              <td className="p-3">{money.format(Number(r.budget_amount))}</td>
              <td className="p-3 text-right">
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-2 text-xs font-semibold"
                  onClick={() => onEdit(r)}
                  type="button"
                >
                  <Pencil size={14} />
                  Modificar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? (
        <p className="p-6 text-center text-sm text-neutral-500">
          No hay presupuestos registrados.
        </p>
      ) : null}
    </div>
  );
}
function Report({ rows }: { rows: Row[] }) {
  return (
    <section className="apex-section-card p-4">
      <h2 className="text-lg font-semibold">
        Presupuesto vs. pedidos realizados
      </h2>
      <p className="text-sm text-neutral-600">
        Cuenta pedidos registrados, confirmados y facturados dentro del período. Excluye los cancelados.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Período</th>
              <th className="p-3">Responsable</th>
              <th className="p-3 text-right">Presupuesto</th>
              <th className="p-3 text-right">Pedidos</th>
              <th className="p-3 text-right">Diferencia</th>
              <th className="p-3 text-right">Cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="border-t border-line" key={`r-${r.scope}-${r.id}`}>
                <td className="p-3">{r.period?.name}</td>
                <td className="p-3">
                  <strong>{r.owner}</strong>
                  <p className="text-xs text-neutral-500">
                    {r.scope === "advisor" ? "Asesor" : "Cliente"}
                  </p>
                </td>
                <td className="p-3 text-right">
                  {money.format(Number(r.budget_amount))}
                </td>
                <td className="p-3 text-right font-semibold">
                  {money.format(r.sales)}
                </td>
                <td
                  className={`p-3 text-right font-semibold ${r.difference < 0 ? "text-red-700" : "text-emerald-700"}`}
                >
                  {money.format(r.difference)}
                </td>
                <td className="p-3 text-right">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${r.compliance >= 1 ? "bg-emerald-50 text-emerald-700" : r.compliance >= 0.8 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}
                  >
                    {(r.compliance * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="p-6 text-center text-sm text-neutral-500">
            Crea un presupuesto para visualizar su ejecución.
          </p>
        ) : null}
      </div>
    </section>
  );
}
function CreateModal({
  periods,
  advisors,
  customers,
  onClose,
  onSaved,
}: {
  periods: Row[];
  advisors: Row[];
  customers: Row[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [scope, setScope] = useState("advisor"),
    [period, setPeriod] = useState(""),
    [owner, setOwner] = useState(""),
    [amount, setAmount] = useState(""),
    [budgetType, setBudgetType] = useState("MONTHLY"),
    [budgetDate, setBudgetDate] = useState(""),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api(
        `/api/v1/commercial-management/budgets/${scope === "advisor" ? "advisors" : "customers"}`,
        {
          method: "PUT",
          body: JSON.stringify({
            period_id: Number(period),
            [scope === "advisor" ? "advisor_id" : "customer_id"]: Number(owner),
            budget_amount: Number(amount),
            budget_type: budgetType,
            ...(budgetType === "DAILY"
              ? { budget_date: `${budgetDate}T12:00:00-05:00` }
              : {}),
          }),
        },
      );
      await onSaved();
    } catch (x) {
      setError(x instanceof Error ? x.message : "No fue posible crear.");
    }
  }
  const owners = scope === "advisor" ? advisors : customers;
  return (
    <Modal title="Crear presupuesto" onClose={onClose}>
      <form className="space-y-3" onSubmit={save}>
        <Select
          label="Período"
          value={period}
          onChange={setPeriod}
          rows={periods}
          text="name"
        />
        <label className="block text-sm font-medium">
          Frecuencia
          <select
            className={`${inputClass} mt-1`}
            value={budgetType}
            onChange={(e) => setBudgetType(e.target.value)}
          >
            <option value="MONTHLY">Mensual</option>
            <option value="DAILY">Diario</option>
          </select>
        </label>
        {budgetType === "DAILY" ? (
          <label className="block text-sm font-medium">
            Día del presupuesto
            <input
              required
              className={`${inputClass} mt-1`}
              type="date"
              value={budgetDate}
              onChange={(e) => setBudgetDate(e.target.value)}
            />
          </label>
        ) : null}
        <label className="block text-sm font-medium">
          Nivel
          <select
            className={`${inputClass} mt-1`}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setOwner("");
            }}
          >
            <option value="advisor">Asesor</option>
            <option value="customer">Cliente</option>
          </select>
        </label>
        <Select
          label="Responsable"
          value={owner}
          onChange={setOwner}
          rows={owners}
          text={scope === "advisor" ? "name" : "legal_name"}
        />
        <label className="block text-sm font-medium">
          Valor COP
          <input
            required
            className={`${inputClass} mt-1`}
            min="0"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button className="apex-primary-action h-10 w-full text-sm font-semibold">
          Crear presupuesto
        </button>
      </form>
    </Modal>
  );
}
function EditModal({
  row,
  onClose,
  onSaved,
}: {
  row: Row;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(row.budget_amount));
  async function save(e: FormEvent) {
    e.preventDefault();
    const advisor = row.scope === "advisor";
    await api(
      `/api/v1/commercial-management/budgets/${advisor ? "advisors" : "customers"}`,
      {
        method: "PUT",
        body: JSON.stringify({
          period_id: row.period_id,
          ...(advisor
            ? { advisor_id: row.advisor_id }
            : { customer_id: row.customer_id }),
          budget_amount: Number(amount),
          budget_type: row.budget_type || "MONTHLY",
          budget_date: row.budget_date,
        }),
      },
    );
    await onSaved();
  }
  return (
    <Modal title="Modificar presupuesto" onClose={onClose}>
      <form onSubmit={save}>
        <label className="text-sm font-medium">
          Nuevo valor COP
          <input
            required
            className={`${inputClass} mt-1`}
            min="0"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button className="apex-primary-action mt-4 h-10 w-full text-sm font-semibold">
          Guardar cambio
        </button>
      </form>
    </Modal>
  );
}
function Select({
  label,
  value,
  onChange,
  rows,
  text,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: Row[];
  text: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        required
        className={`${inputClass} mt-1`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Seleccionar</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r[text]}
          </option>
        ))}
      </select>
    </label>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
