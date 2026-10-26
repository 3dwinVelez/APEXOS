"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Ban, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { ComercioNav } from "@/components/comercio-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { AccessDenied, Field, ModuleHeader, StatusPill, describeError, money, todayISO, useComercioAccess } from "@/components/comercio/shared";

// Gastos operativos del Comercio (GET /api/v1/comercio/expenses). Los gastos no se borran:
// se anulan con permiso approve y quedan en el historial.
type Expense = {
  id: number;
  full_number: string;
  date: string;
  concept: string;
  category: string | null;
  amount: number;
  method: string | null;
  note: string | null;
  status: "active" | "voided";
};

type ExpenseForm = { concept: string; category: string; amount: string; method: string; date: string; note: string };

const emptyForm: ExpenseForm = { concept: "", category: "", amount: "", method: "Efectivo", date: todayISO(), note: "" };

export default function ComercioGastosPage() {
  const access = useComercioAccess();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAll, setShowAll] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ items: Expense[]; total: number }>(`/api/v1/comercio/expenses?limit=200${showAll ? "&status=all" : ""}`, { cache: "no-store" });
      setExpenses(result.items);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los gastos."));
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const activeTotal = expenses.filter((row) => row.status === "active").reduce((sum, row) => sum + row.amount, 0);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        concept: form.concept.trim(),
        category: form.category.trim() || undefined,
        amount: Number(form.amount),
        method: form.method || undefined,
        note: form.note.trim() || undefined
      };
      if (form.date) body.date = form.date;
      if (editing) {
        await api(`/api/v1/comercio/expenses/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        setMessage(`Gasto ${editing.full_number} actualizado.`);
      } else {
        const created = await api<Expense>("/api/v1/comercio/expenses", { method: "POST", body: JSON.stringify(body) });
        setMessage(`Gasto registrado: ${created.full_number} · ${money(created.amount)}`);
      }
      setEditorOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar el gasto."));
    } finally {
      setSaving(false);
    }
  }

  async function voidExpense() {
    if (!voidTarget) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/comercio/expenses/${voidTarget.id}/void`, { method: "POST" });
      setMessage(`Gasto ${voidTarget.full_number} anulado.`);
      setVoidTarget(null);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible anular el gasto."));
    } finally {
      setSaving(false);
    }
  }

  if (!access.ready) return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Comercio...</div>;
  if (!access.canRead) return <AccessDenied />;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader subtitle="Servicios, arriendo, transporte y demas egresos del dia a dia. Entran al resultado estimado de los reportes." title="Gastos operativos" />
      <ComercioNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <p className="text-sm text-neutral-600">Activos: <span className="font-semibold">{money(activeTotal)}</span></p>
            <label className="flex items-center gap-2 text-sm">
              <input checked={showAll} onChange={(event) => setShowAll(event.target.checked)} type="checkbox" /> Ver anulados
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-2" onClick={() => void load()} type="button"><RefreshCw size={14} /> Actualizar</button>
            {access.canWrite ? (
              <button className="btn-primary flex items-center gap-2" onClick={() => { setEditing(null); setForm(emptyForm); setEditorOpen(true); }} type="button"><Plus size={14} /> Nuevo gasto</button>
            ) : null}
          </div>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando gastos...</p>
        ) : expenses.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">Sin gastos registrados.</p>
        ) : (
          <>
            <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
              {expenses.map((expense) => (
                <li className="rounded-md border border-line p-3" key={expense.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{expense.concept}</p>
                      <p className="font-mono text-xs text-neutral-500">{expense.full_number} · {expense.date}</p>
                    </div>
                    <StatusPill tone={expense.status === "active" ? "ok" : "muted"}>{expense.status === "active" ? "Activo" : "Anulado"}</StatusPill>
                  </div>
                  <p className="mt-1 text-lg font-semibold">{money(expense.amount)}</p>
                  {access.canWrite && expense.status === "active" ? (
                    <div className="mt-2 flex gap-2">
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setEditing(expense); setForm({ concept: expense.concept, category: expense.category || "", amount: String(expense.amount), method: expense.method || "Efectivo", date: expense.date, note: expense.note || "" }); setEditorOpen(true); }} type="button">Editar</button>
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setVoidTarget(expense)} type="button">Anular</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="p-3">Numero</th>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Categoria</th>
                    <th>Medio</th>
                    <th className="text-right">Valor</th>
                    <th>Estado</th>
                    {access.canWrite ? <th className="pr-3 text-right">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr className="border-b" key={expense.id}>
                      <td className="p-3 font-mono">{expense.full_number}</td>
                      <td className="p-3">{expense.date}</td>
                      <td className="p-3 font-medium">{expense.concept}</td>
                      <td className="p-3">{expense.category || "--"}</td>
                      <td className="p-3">{expense.method || "--"}</td>
                      <td className="p-3 text-right font-semibold">{money(expense.amount)}</td>
                      <td className="p-3">{expense.status === "active" ? <StatusPill tone="ok">Activo</StatusPill> : <StatusPill tone="muted">Anulado</StatusPill>}</td>
                      {access.canWrite ? (
                        <td className="p-3 pr-3 text-right">
                          {expense.status === "active" ? (
                            <div className="flex justify-end gap-1">
                              <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setEditing(expense); setForm({ concept: expense.concept, category: expense.category || "", amount: String(expense.amount), method: expense.method || "Efectivo", date: expense.date, note: expense.note || "" }); setEditorOpen(true); }} type="button">Editar</button>
                              <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setVoidTarget(expense)} type="button">Anular</button>
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {editorOpen ? (
        <ModalFrame onClose={() => setEditorOpen(false)} title={editing ? `Editar gasto ${editing.full_number}` : "Nuevo gasto operativo"}>
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Concepto">
                  <input className="control" maxLength={160} onChange={(event) => setForm({ ...form, concept: event.target.value })} required value={form.concept} />
                </Field>
              </div>
              <Field label="Categoria (opcional)">
                <input className="control" maxLength={80} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Servicios, Arriendo..." value={form.category} />
              </Field>
              <Field label="Valor">
                <input className="control" min={1} onChange={(event) => setForm({ ...form, amount: event.target.value })} required step="1" type="number" value={form.amount} />
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
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
              <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar gasto"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {voidTarget ? (
        <ModalFrame onClose={() => setVoidTarget(null)} title={`Anular gasto ${voidTarget.full_number}`}>
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">{voidTarget.concept} · {money(voidTarget.amount)}. El gasto queda como anulado en el historial y sale de los totales.</p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={() => setVoidTarget(null)} type="button">Cancelar</button>
              <button className="btn-primary flex items-center gap-1" disabled={saving} onClick={() => void voidExpense()} type="button"><Ban size={14} /> {saving ? "Anulando..." : "Confirmar anulacion"}</button>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
