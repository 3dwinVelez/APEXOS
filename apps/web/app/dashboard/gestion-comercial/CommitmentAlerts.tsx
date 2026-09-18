"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

type Commitment = { id: number; description: string; due_date: string; status: string; completed_at: string | null; customer: { legal_name: string }; advisor: { name: string } };
const localDay = (value: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(value));
const date = (value: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium" }).format(new Date(value));

export function CommitmentAlerts() {
  const [items, setItems] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [view, setView] = useState("pending");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  const request = useRef(0);
  const invalidateRequests = useCallback(() => { request.current++; }, []);
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    try {
      const rows = await api<Commitment[]>("/api/v1/commercial-management/commitments", { cache: "no-store" });
      if (version === request.current) { setItems(rows); setError(""); setNow(Date.now()); }
    } catch (value) { if (version === request.current) setError(value instanceof Error ? value.message : "No fue posible consultar los compromisos."); }
    finally { if (version === request.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (!lock.current) void load(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { invalidateRequests(); window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [load, invalidateRequests]);
  async function toggle(item: Commitment) {
    if (lock.current) return;
    lock.current = true; request.current++; setBusy(item.id); setError(""); setMessage("");
    const status = item.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    try {
      const saved = await api<Commitment>(`/api/v1/commercial-management/commitments/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems(current => current.map(row => row.id === item.id ? { ...row, status: saved.status, completed_at: saved.completed_at } : row));
      setMessage(`${status === "COMPLETED" ? "Compromiso cumplido" : "Compromiso nuevamente pendiente"}: ${item.description}`);
    } catch (value) { setError(value instanceof Error ? value.message : "No fue posible cambiar el compromiso. Conserva su estado anterior."); }
    finally { lock.current = false; setBusy(null); setLoading(false); }
  }
  const today = localDay(now);
  const pending = items.filter(item => item.status === "PENDING");
  const overdue = pending.filter(item => localDay(item.due_date) < today).length;
  const dueToday = pending.filter(item => localDay(item.due_date) === today).length;
  const filtered = items.filter(item => (view === "completed" ? item.status === "COMPLETED" : item.status === "PENDING" && (view !== "overdue" || localDay(item.due_date) < today) && (view !== "today" || localDay(item.due_date) === today)) && `${item.description} ${item.customer?.legal_name} ${item.advisor?.name}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  return <section className="apex-section-card border-l-4 border-l-amber-400 p-4" aria-label="Alertas de compromisos">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><BellRing className="text-amber-600" size={22}/><div><h2 className="font-semibold">Compromisos del asesor</h2><p className="text-xs text-neutral-600">{pending.length} pendientes · {overdue} vencidos · {dueToday} vencen hoy</p></div></div><button type="button" disabled={loading || busy !== null} onClick={() => void load()} className="inline-flex items-center gap-1 text-sm text-apex"><RefreshCw size={15}/> Actualizar</button></header>
    <div className="mt-3 flex flex-wrap gap-2">{[["pending", "Pendientes"], ["overdue", "Vencidos"], ["today", "Para hoy"], ["completed", "Cumplidos"]].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)} className={`rounded border px-3 py-1 text-xs font-semibold ${view === value ? "border-apex bg-apex text-white" : "border-line"}`}>{label}</button>)}<input aria-label="Buscar compromisos" placeholder="Buscar cliente, asesor o compromiso" className="h-8 min-w-56 flex-1 rounded border border-line px-3 text-sm" value={query} onChange={e => setQuery(e.target.value)}/></div>
    <p className="mt-2 text-xs text-neutral-500">Marca para cumplir. En Cumplidos, desmarca para devolverlo a pendientes.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    {loading ? <p role="status" className="mt-3 text-sm">Consultando compromisos…</p> : <div className="mt-3 max-h-80 overflow-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="sticky top-0 bg-paper text-xs uppercase text-neutral-500"><tr>{["Cumplido", "Compromiso / cliente", "Asesor", "Vencimiento", "Estado"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(item => { const late = localDay(item.due_date) < today; const isToday = localDay(item.due_date) === today; return <tr key={item.id} className="border-t border-line"><td className="p-2"><input type="checkbox" aria-label={`${item.status === "COMPLETED" ? "Marcar pendiente" : "Marcar cumplido"}: ${item.description}`} checked={item.status === "COMPLETED"} disabled={busy !== null} onChange={() => void toggle(item)} className="h-5 w-5 accent-teal-600"/></td><td className="p-2"><strong>{item.description}</strong><p className="text-xs text-neutral-600">{item.customer?.legal_name}</p></td><td className="p-2">{item.advisor?.name}</td><td className="p-2">{date(item.due_date)}</td><td className="p-2"><span className={`rounded px-2 py-1 text-xs ${item.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : late ? "bg-red-50 text-red-700" : isToday ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-700"}`}>{busy === item.id ? "Guardando…" : item.status === "COMPLETED" ? "Cumplido" : late ? "Vencido" : isToday ? "Vence hoy" : "Próximo"}</span>{item.completed_at && <p className="mt-1 text-xs">Cumplido el {date(item.completed_at)}</p>}</td></tr>; })}</tbody></table>{!filtered.length && !error && <p className="p-3 text-sm text-neutral-500">No hay compromisos para este filtro.</p>}</div>}
  </section>;
}
