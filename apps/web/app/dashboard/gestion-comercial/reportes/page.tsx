"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { exportCommercialReport } from "@/lib/commercial-report-export";
import { ArrowLeft, BarChart3, Download, RefreshCw } from "lucide-react";

type Counts = { order_value: number; total: number; completed: number; pending: number; with_order: number; with_quotation: number; quotation_only: number; without_result: number };
type Row = Counts & { period: string; advisor_id: number; advisor: string };
type Report = { rows: Row[]; totals: Counts };
const money = (value: number) => value.toLocaleString("es-CO", { style: "currency", currency: "COP" });
const input = "h-10 rounded-md border border-line bg-white px-3 text-sm";
const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const percentage = (row: Counts) => row.completed ? `${(100 * row.with_order / row.completed).toFixed(1)}%` : "—";

export default function AdvisorReports() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [group, setGroup] = useState("advisor");
  const [view, setView] = useState("effectiveness");
  const [revision, setRevision] = useState(0);
  const [advisors, setAdvisors] = useState<{ id: number; name: string }[]>([]);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setData(null);
    const query = new URLSearchParams({ year: String(year), group });
    if (month) query.set("month", month);
    if (day) query.set("day", day);
    if (advisor) query.set("advisor_id", advisor);
    Promise.all([api<Report>(`/api/v1/commercial-management/reports/advisors?${query}`, { cache: "no-store" }), api<{ id: number; name: string }[]>("/api/v1/commercial-management/advisors", { cache: "no-store" })])
      .then(([report, people]) => { if (active) { setData(report); setAdvisors(people); } })
      .catch(value => { if (active) setError(value instanceof Error ? value.message : "No fue posible consultar el reporte."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, month, day, advisor, group, revision]);
  const max = Math.max(1, ...(data?.rows.map(row => view === "effectiveness" ? row.completed : row.total) || []));
  async function exportExcel() { if (!data) return; await exportCommercialReport(`reporte-asesores-${year}`, "Efectividad asesores", data.rows, [{ header: "Período", value: row => row.period }, { header: "Asesor", value: row => row.advisor }, { header: "Visitas", value: row => row.total }, { header: "Realizadas", value: row => row.completed }, { header: "Pendientes", value: row => row.pending }, { header: "Con pedido", value: row => row.with_order }, { header: "Valor pedidos", value: row => row.order_value }, { header: "Con cotización", value: row => row.with_quotation }, { header: "Solo cotización", value: row => row.quotation_only }, { header: "Sin resultado", value: row => row.without_result }, { header: "Efectividad", value: row => row.completed ? row.with_order / row.completed : 0 }]); }
  return <div className="apex-workspace-shell space-y-4">
    <header className="apex-section-card flex flex-wrap items-center justify-between gap-4 p-5">
      <div><Link className="inline-flex items-center gap-1 text-sm text-apex" href="/dashboard/gestion-comercial"><ArrowLeft size={16}/> Gestión Comercial</Link><h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold"><BarChart3 className="text-apex"/> Reportes de asesores</h1><p className="mt-1 text-sm text-neutral-500">Actividad y efectividad comercial para gerencia</p></div>
      <div className="flex gap-2"><button className={`${input} inline-flex items-center gap-2`} onClick={() => void exportExcel()} disabled={!data?.rows.length}><Download size={16}/> Exportar Excel</button><button className={`${input} inline-flex items-center gap-2`} onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={16}/> Actualizar</button></div>
    </header>
    <section className="apex-section-card space-y-4 p-4">
      <Link href="/dashboard/gestion-comercial/reportes/cotizado-vs-pedido" className="inline-flex rounded-md border border-apex px-4 py-2 text-sm font-semibold text-apex">Cotizado vs. pedido →</Link>
      <div className="flex flex-wrap gap-2">{[["effectiveness", "Efectividad comercial"], ["activity", "Visitas por asesor"]].map(([key, label]) => <button key={key} aria-pressed={view === key} className={`rounded-md px-4 py-2 text-sm font-semibold ${view === key ? "bg-apex text-white" : "border border-line"}`} onClick={() => { setView(key); setGroup(key === "activity" ? "day" : "advisor"); }}>{label}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-xs">Asesor<select className={input} value={advisor} onChange={e => setAdvisor(e.target.value)}><option value="">Todos los asesores</option>{advisors.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs">Año<input className={input} type="number" min="2000" max="2100" value={year} onChange={e => setYear(Number(e.target.value))}/></label>
        <label className="grid gap-1 text-xs">Mes<select className={input} value={month} onChange={e => { setMonth(e.target.value); setDay(""); }}><option value="">Todo el año</option>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
        <label className="grid gap-1 text-xs">Día<select className={input} disabled={!month} value={day} onChange={e => setDay(e.target.value)}><option value="">Todos los días</option>{Array.from({ length: month ? new Date(year, Number(month), 0).getDate() : 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
        <label className="grid gap-1 text-xs">Agrupar por<select className={input} value={group} onChange={e => setGroup(e.target.value)}><option value="advisor">Asesor</option><option value="day">Día y asesor</option><option value="week">Semana y asesor</option><option value="month">Mes y asesor</option><option value="year">Año y asesor</option></select></label>
      </div>
      <p className="text-xs text-neutral-500">Fecha agendada · Colombia · Semanas de lunes a domingo. No incluye visitas canceladas ni programaciones reemplazadas.</p>
    </section>
    {loading && <p role="status">Consultando reportes…</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    {data && <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">{[["Visitas", data.totals.total], ["Realizadas", data.totals.completed], ["Con pedido", data.totals.with_order], ["Con cotización", data.totals.with_quotation], ["Sin resultado comercial", data.totals.without_result], ["Efectividad", percentage(data.totals)]].map(([label, value]) => <div className="apex-section-card p-4" key={label}><p className="text-xs text-neutral-500">{label}</p><strong className="mt-2 block text-2xl">{value}</strong></div>)}</section>
      <section className="apex-section-card p-5">
        <h2 className="text-lg font-semibold">{view === "effectiveness" ? "Resultado de visitas finalizadas" : "Volumen de visitas por asesor"}</h2>
        <p className="mt-1 text-xs text-neutral-500">{view === "effectiveness" ? "Efectividad = visitas con pedido / realizadas. Las barras separan pedido, solo cotización y sin documentos; cada visita se cuenta una vez." : "Cada barra muestra visitas realizadas y pendientes según su fecha de agenda."}</p>
        <div className="my-4 flex flex-wrap gap-4 text-xs">{(view === "effectiveness" ? [["bg-teal-500", "Con pedido"], ["bg-indigo-500", "Solo cotización"], ["bg-slate-400", "Sin documentos"]] : [["bg-teal-500", "Realizadas"], ["bg-amber-400", "Pendientes"]]).map(([color, label]) => <span key={label} className="inline-flex items-center gap-2"><i className={`h-3 w-3 rounded ${color}`}/>{label}</span>)}</div>
        {!data.rows.length ? <p className="py-10 text-center text-neutral-500">No hay visitas para estos filtros.</p> : <div className="max-h-[520px] space-y-4 overflow-y-auto pr-2">{data.rows.map(row => {
          const series: [number, string, string][] = view === "effectiveness" ? [[row.with_order, "bg-teal-500", "Con pedido"], [row.quotation_only, "bg-indigo-500", "Solo cotización"], [row.without_result, "bg-slate-400", "Sin documentos"]] : [[row.completed, "bg-teal-500", "Realizadas"], [row.pending, "bg-amber-400", "Pendientes"]];
          return <div key={`${row.period}/${row.advisor_id}`} className="grid items-center gap-2 sm:grid-cols-[220px_1fr_60px]"><div className="text-sm"><strong>{row.advisor}</strong><span className="block text-xs text-neutral-500">{group === "week" ? "Semana del " : ""}{row.period}</span></div><div className="flex h-8 overflow-hidden rounded bg-slate-100" role="img" aria-label={series.map(([value, , label]) => `${label}: ${value}`).join(', ')}>{series.map(([value, color, label]) => <div key={label} title={`${label}: ${value}`} style={{ width: `${100 * value / max}%` }} className={`${color} flex items-center justify-center text-xs font-semibold text-white`}>{value > 0 ? value : ""}</div>)}</div><strong className="text-right text-sm">{view === "effectiveness" ? row.completed : row.total}</strong></div>;
        })}</div>}
      </section>
      <section className="apex-section-card p-4"><h2 className="mb-3 font-semibold">Detalle por período y asesor</h2><p className="mb-3 text-xs text-neutral-500">“Con cotización” incluye las que generaron pedido; no se suma a “Con pedido”. Sin resultado comercial significa visita finalizada sin pedido ni cotización vigentes, aunque tenga observaciones. El valor suma los pedidos no cancelados de esas visitas finalizadas, según la fecha de agenda.</p><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-paper"><tr>{["Período", "Asesor", "Visitas", "Realizadas", "Pendientes", "Con pedido", "Valor de pedidos", "Con cotización", "Solo cotización", "Sin resultado", "Efectividad"].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr className="border-t border-line" key={`${row.period}/${row.advisor_id}`}>{[row.period, row.advisor, row.total, row.completed, row.pending, row.with_order, money(row.order_value), row.with_quotation, row.quotation_only, row.without_result, percentage(row)].map((value, index) => <td className="p-3" key={index}>{value}</td>)}</tr>)}</tbody></table></div><div className="space-y-3 md:hidden">{data.rows.map(row => <article className="rounded-lg border border-line p-4" key={`mobile-${row.period}/${row.advisor_id}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{row.advisor}</h3><p className="text-xs text-neutral-500">{row.period}</p></div><span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">{percentage(row)}</span></div><div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm"><p><strong className="block text-lg">{row.total}</strong><span className="text-xs text-neutral-500">Visitas</span></p><p><strong className="block text-lg">{row.completed}</strong><span className="text-xs text-neutral-500">Realizadas</span></p><p><strong className="block text-lg">{row.with_order}</strong><span className="text-xs text-neutral-500">Pedidos</span></p><p><strong className="block text-lg">{row.with_quotation}</strong><span className="text-xs text-neutral-500">Cotizaciones</span></p><p><strong className="block text-lg">{row.without_result}</strong><span className="text-xs text-neutral-500">Sin resultado</span></p><p><strong className="block text-sm">{money(row.order_value)}</strong><span className="text-xs text-neutral-500">Valor</span></p></div></article>)}</div></section>
    </>}
  </div>;
}
