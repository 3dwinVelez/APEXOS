"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Ban, Download, Plus, RefreshCw, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { SmartDataTable, type DataColumn } from "@/components/ui/data-table";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import { Check, ComercioMessages, Field, ModuleHeader, StatusPill, comercioGate, describeError, matchesQuery, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

// Movimientos "otros" del Comercio (GET /api/v1/comercio/expenses): egresos operativos
// (direction=expense) e ingresos fuera del catalogo (direction=income, p. ej. recargas).
// No se borran: se anulan con permiso approve y quedan en el historial.
type Expense = {
  id: number;
  full_number: string;
  date: string;
  concept: string;
  category: string | null;
  amount: number;
  direction: "income" | "expense";
  method: string | null;
  note: string | null;
  status: "active" | "voided";
};

type ExpenseForm = { concept: string; category: string; amount: string; method: string; date: string; note: string; direction: "income" | "expense" };

const emptyForm: ExpenseForm = { concept: "", category: "", amount: "", method: "Efectivo", date: todayISO(), note: "", direction: "expense" };

export default function ComercioGastosPage() {
  const access = useComercioAccess();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<"" | "income" | "expense">("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ items: Expense[]; total: number }>(`/api/v1/comercio/expenses?limit=200${showAll ? "&status=all" : ""}${directionFilter ? `&direction=${directionFilter}` : ""}`, { cache: "no-store" });
      setExpenses(result.items);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los movimientos."));
    } finally {
      setLoading(false);
    }
  }, [showAll, directionFilter]);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const active = expenses.filter((row) => row.status === "active");
  const incomeTotal = active.filter((row) => row.direction === "income").reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = active.filter((row) => row.direction === "expense").reduce((sum, row) => sum + row.amount, 0);

  const categories = useMemo(() => [...new Set(expenses.map((row) => row.category || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [expenses]);

  const filtered = useMemo(() => expenses.filter((row) => {
    if (category && (row.category || "") !== category) return false;
    return matchesQuery(query, row.full_number, row.concept, row.category || "", row.method || "", row.note || "");
  }), [expenses, category, query]);

  const hasFilters = Boolean(query.trim() || category);

  function clearFilters() {
    setQuery("");
    setCategory("");
  }

  const netFiltered = useMemo(() => filtered
    .filter((row) => row.status === "active")
    .reduce((sum, row) => sum + (row.direction === "income" ? 1 : -1) * Number(row.amount || 0), 0), [filtered]);

  function exportExpenses(rows: Expense[]) {
    downloadExcelWorkbook("comercio-ingresos-egresos.xls", [{
      name: "Movimientos",
      columns: [
        { key: "number", label: "Numero" },
        { key: "date", label: "Fecha" },
        { key: "concept", label: "Concepto", width: 220 },
        { key: "category", label: "Categoria" },
        { key: "direction", label: "Direccion" },
        { key: "method", label: "Medio" },
        { key: "amount", label: "Valor" },
        { key: "state", label: "Estado" },
        { key: "note", label: "Nota", width: 200 }
      ],
      rows: rows.map((row) => ({
        number: row.full_number,
        date: row.date,
        concept: row.concept,
        category: row.category || "",
        direction: row.direction === "income" ? "Ingreso" : "Egreso",
        method: row.method || "",
        amount: Number(row.amount),
        state: row.status === "active" ? "Activo" : "Anulado",
        note: row.note || ""
      }))
    }]);
  }

  const columns: DataColumn<Expense>[] = [
    { className: "font-mono", cell: (row) => row.full_number, header: "Numero", hideable: false, id: "number", sortValue: (row) => row.id },
    { cell: (row) => row.date, header: "Fecha", id: "date", sortValue: (row) => row.date },
    {
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.concept}</p>
          {row.note ? <p className="truncate text-xs text-content-muted">{row.note}</p> : null}
        </div>
      ),
      header: "Concepto",
      hideable: false,
      id: "concept",
      sortValue: (row) => row.concept
    },
    { cell: (row) => row.category || "--", header: "Categoria", id: "category", sortValue: (row) => row.category || "" },
    { cell: (row) => row.method || "--", header: "Medio", id: "method", sortValue: (row) => row.method || "" },
    {
      className: "text-right",
      cell: (row) => <span className={`font-semibold ${row.direction === "income" ? "text-success" : "text-error"}`}>{row.direction === "income" ? "+" : "-"}{money(row.amount)}</span>,
      header: "Valor",
      id: "amount",
      sortValue: (row) => Number(row.amount)
    },
    { cell: (row) => (row.status === "active" ? <StatusPill tone="ok">Activo</StatusPill> : <StatusPill tone="muted">Anulado</StatusPill>), header: "Estado", id: "state", sortValue: (row) => (row.status === "active" ? 1 : 0) },
    {
      className: "text-right",
      cell: (row) => (access.canWrite ? <Button onClick={() => openEditor(row)} size="compact" variant="secondary"><Search size={12} /> Ficha</Button> : null),
      header: "Acciones",
      hideable: false,
      id: "action"
    }
  ];

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        concept: form.concept.trim(),
        category: form.category.trim() || undefined,
        amount: Number(form.amount),
        direction: form.direction,
        method: form.method || undefined,
        note: form.note.trim() || undefined
      };
      if (form.date) body.date = form.date;
      if (editing) {
        await api(`/api/v1/comercio/expenses/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        setMessage(`${editing.full_number} actualizado.`);
      } else {
        const created = await api<Expense>("/api/v1/comercio/expenses", { method: "POST", body: JSON.stringify(body) });
        setMessage(`${created.direction === "income" ? "Ingreso" : "Gasto"} registrado: ${created.full_number} · ${money(created.amount)}`);
      }
      setEditorOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar el movimiento."));
    } finally {
      setSaving(false);
    }
  }

  function openEditor(expense: Expense) {
    setEditing(expense);
    setForm({ concept: expense.concept, category: expense.category || "", amount: String(expense.amount), method: expense.method || "Efectivo", date: expense.date, note: expense.note || "", direction: expense.direction });
    setEditorOpen(true);
  }

  async function voidExpense() {
    if (!voidTarget) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/comercio/expenses/${voidTarget.id}/void`, { method: "POST" });
      setMessage(`${voidTarget.full_number} anulado.`);
      setVoidTarget(null);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible anular el gasto."));
    } finally {
      setSaving(false);
    }
  }
  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader eyebrow="M-30 · Caja" subtitle="Ingresos distintos de ventas (recargas, servicios) y egresos del dia a dia (arriendo, servicios, transporte). Entran al resultado estimado de los reportes." title="Ingresos y egresos" />
      <ComercioMessages error={error} message={message} />

      <section className="apex-section-card">
        <div className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(240px,1fr)_minmax(13rem,16rem)_auto] lg:items-end">
          <Field label="Buscar">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
              <input aria-label="Buscar movimientos por numero, concepto, categoria o medio de pago" className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Numero, concepto, categoria o medio" value={query} />
            </span>
          </Field>
          <Field hint={categories.length ? `${categories.length} categorias en movimiento` : undefined} label="Categoria">
            <select className="control apex-select" onChange={(event) => setCategory(event.target.value)} value={category}>
              <option value="">Todas</option>
              {categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-3 pb-2 text-sm lg:pb-0">
            <div className="flex gap-1" role="group" aria-label="Filtro por direccion">
              <FilterChip label="Todos" active={directionFilter === ""} onClick={() => setDirectionFilter("")} />
              <FilterChip icon={<TrendingUp size={12} />} label="Ingresos" active={directionFilter === "income"} onClick={() => setDirectionFilter("income")} />
              <FilterChip icon={<TrendingDown size={12} />} label="Egresos" active={directionFilter === "expense"} onClick={() => setDirectionFilter("expense")} />
            </div>
            <Check checked={showAll} label="Ver anulados" onChange={setShowAll} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-content-muted">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {hasFilters ? <Button onClick={clearFilters} size="compact" variant="ghost"><X size={12} /> Limpiar filtros</Button> : null}
            <span>Ingresos: <span className="font-semibold text-success">+{money(incomeTotal)}</span></span>
            <span>Egresos: <span className="font-semibold text-error">-{money(expenseTotal)}</span></span>
            <span aria-live="polite" className="font-semibold text-content-body">{filtered.length} de {expenses.length} movimientos · neto {money(netFiltered)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!filtered.length} onClick={() => exportExpenses(filtered)} size="compact" variant="secondary"><Download size={14} /> Excel</Button>
            <Button onClick={() => void load()} size="compact" variant="secondary"><RefreshCw size={14} /> Actualizar</Button>
            {access.canWrite ? <Button onClick={() => { setEditing(null); setForm(emptyForm); setEditorOpen(true); }} size="compact"><Plus size={14} /> Nuevo movimiento</Button> : null}
          </div>
        </div>

        {!loading && filtered.length ? (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
            {filtered.map((expense) => {
              const cardBody = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{expense.concept}</p>
                      <p className="font-mono text-xs text-content-muted">{expense.full_number} · {expense.date}</p>
                    </div>
                    <StatusPill tone={expense.status === "active" ? "ok" : "muted"}>{expense.status === "active" ? "Activo" : "Anulado"}</StatusPill>
                  </div>
                  <p className={`mt-1 text-lg font-semibold ${expense.direction === "income" ? "text-success" : "text-error"}`}>{expense.direction === "income" ? "+" : "-"}{money(expense.amount)}</p>
                  {access.canWrite ? <p className="mt-2 text-xs font-medium text-apex">Abrir ficha</p> : null}
                </>
              );
              return (
                <li className="rounded-md border border-line p-3" key={expense.id}>
                  {access.canWrite ? (
                    <button className="block w-full text-left" onClick={() => openEditor(expense)} type="button">{cardBody}</button>
                  ) : cardBody}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="hidden p-4 lg:block">
          <SmartDataTable
            bulkActions={(selected, clear) => (
              <>
                <Button onClick={() => exportExpenses(selected)} size="compact" variant="secondary"><Download size={14} /> Exportar {selected.length}</Button>
                <Button onClick={clear} size="compact" variant="ghost">Limpiar seleccion</Button>
              </>
            )}
            columns={columns}
            emptyDetail={expenses.length ? "Cambia el filtro de direccion o limpia el buscador para volver a ver movimientos." : "Registra el primer ingreso o egreso para llevar el caja del dia a dia."}
            emptyTitle={expenses.length ? "Ningun movimiento con estos filtros" : "Aun no hay movimientos"}
            loading={loading}
            pageSize={12}
            rowKey={(row) => row.id}
            rows={filtered}
            storageKey="comercio-movimientos"
          />
        </div>
      </section>

      {editorOpen ? (
        <ModalFrame onClose={() => setEditorOpen(false)} title={editing ? `Editar movimiento ${editing.full_number}` : "Nuevo ingreso o gasto"}>
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Tipo de movimiento">
                  <div className="flex gap-2">
                    <button className={`flex-1 rounded-control border px-3 py-2 text-sm font-medium transition-colors ${form.direction === "expense" ? "border-error/40 bg-error/10 text-error" : "border-line text-content-body hover:bg-surface-muted"}`} onClick={() => setForm({ ...form, direction: "expense" })} type="button">Egreso</button>
                    <button className={`flex-1 rounded-control border px-3 py-2 text-sm font-medium transition-colors ${form.direction === "income" ? "border-success/40 bg-success/10 text-success" : "border-line text-content-body hover:bg-surface-muted"}`} onClick={() => setForm({ ...form, direction: "income" })} type="button">Ingreso</button>
                  </div>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Concepto">
                  <input className="control" maxLength={160} onChange={(event) => setForm({ ...form, concept: event.target.value })} required value={form.concept} />
                </Field>
              </div>
              <Field label="Categoria (opcional)">
                <input className="control" maxLength={80} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Servicios, Arriendo..." value={form.category} />
              </Field>
              <Field label="Valor">
                <input className="control" min={1} onChange={(event) => setForm({ ...form, amount: event.target.value })} required step="0.01" type="number" value={form.amount} />
              </Field>
              <Field label="Fecha">
                <input className="control" max={todayISO()} onChange={(event) => setForm({ ...form, date: event.target.value })} type="date" value={form.date} />
              </Field>
              <Field label="Medio de pago">
                <select className="control apex-select" onChange={(event) => setForm({ ...form, method: event.target.value })} value={form.method}>
                  <option>Efectivo</option>
                  <option>Nequi</option>
                  <option>Tarjeta</option>
                  <option>Transferencia</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Nota (opcional)">
                  <textarea className="control" maxLength={500} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={2} value={form.note} />
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              {editing && editing.status === "active" && access.canWrite ? (
                <Button disabled={saving} onClick={() => { setEditorOpen(false); setVoidTarget(editing); }} type="button" variant="danger">
                  <Ban size={14} /> Anular movimiento
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold gap-2" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
                <button className="inline-flex items-center apex-primary-action px-4 text-sm font-semibold gap-2" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar movimiento"}</button>
              </div>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {voidTarget ? (
        <ModalFrame onClose={() => setVoidTarget(null)} title={`Anular movimiento ${voidTarget.full_number}`}>
          <div className="space-y-4">
            <p className="text-sm text-content-body">{voidTarget.concept} · {money(voidTarget.amount)}. El movimiento queda como anulado en el historial y sale de los totales.</p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold gap-2" onClick={() => setVoidTarget(null)} type="button">Cancelar</button>
              <button className="apex-primary-action flex items-center gap-1 px-4 text-sm font-semibold" disabled={saving} onClick={() => void voidExpense()} type="button"><Ban size={14} /> {saving ? "Anulando..." : "Confirmar anulacion"}</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function FilterChip({ active, icon, label, onClick }: { active: boolean; icon?: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-control border px-3 text-xs font-semibold transition-colors ${active ? "border-apex/40 bg-apex/10 text-apex" : "border-line text-content-body hover:bg-surface-muted"}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
