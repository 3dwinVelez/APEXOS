"use client";

import { acknowledgeApexHeartAlert, ApexHeartDashboard, evaluateApexHeartAlerts, getApexHeartDashboard, updateApexHeartConfig, updateApexHeartRule } from "@/lib/api";
import { Activity, AlertTriangle, BadgeDollarSign, Boxes, CircleDollarSign, HeartPulse, RefreshCw, Settings2, ShoppingCart, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const today = new Date();
const initialTo = today.toISOString().slice(0, 10);
const initialFrom = new Date(today.getFullYear(), today.getMonth() - 11, 1).toISOString().slice(0, 10);
const COLORS: Record<string, string> = { A: "#16a34a", B: "#f59e0b", C: "#94a3b8" };

type View = "pulse" | "abc" | "flow" | "alerts" | "settings";

export default function ApexHeartPage() {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [view, setView] = useState<View>("pulse");
  const [data, setData] = useState<ApexHeartDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(evaluate = false) {
    setLoading(true); setError("");
    try {
      if (evaluate) await evaluateApexHeartAlerts(from, to);
      setData(await getApexHeartDashboard(from, to));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible leer Apex Heart."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const abcDistribution = useMemo(() => ["A", "B", "C"].map((key) => ({ name: key, value: data?.products.filter((product) => product.abc_class === key).length || 0 })), [data]);
  const m = data?.metrics || {};

  return (
    <div className="apex-workspace-shell space-y-4 pb-12">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-rose-950 via-rose-800 to-orange-600 p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="rounded-2xl bg-white/15 p-3 ring-1 ring-white/25"><HeartPulse className="animate-pulse" size={32} /></span>
            <div><p className="text-xs font-bold uppercase tracking-[.22em] text-rose-100">M-28 · Control gerencial</p><h1 className="mt-1 text-3xl font-bold">Apex Heart</h1><p className="mt-2 max-w-3xl text-sm text-rose-50">El pulso completo del negocio: productividad, margen, compras, inventario, ventas, cartera y caja en un solo lugar accionable.</p></div>
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-black/15 p-3">
            <label className="text-xs">Desde<input className="mt-1 block h-9 rounded-md border border-white/20 bg-white/95 px-2 text-neutral-900" onChange={(e) => setFrom(e.target.value)} type="date" value={from} /></label>
            <label className="text-xs">Hasta<input className="mt-1 block h-9 rounded-md border border-white/20 bg-white/95 px-2 text-neutral-900" onChange={(e) => setTo(e.target.value)} type="date" value={to} /></label>
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-rose-800" onClick={() => void load(true)} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar</button>
          </div>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1" aria-label="Secciones Apex Heart">
        {([['pulse','Pulso ejecutivo'],['abc','Productos ABC'],['flow','Compra → Caja'],['alerts','Alertas'],['settings','Configuración']] as Array<[View,string]>).map(([key, label]) => <button className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${view === key ? "bg-rose-700 text-white" : "text-neutral-600 hover:bg-paper"}`} key={key} onClick={() => setView(key)} type="button">{label}</button>)}
      </nav>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {loading && !data ? <div className="apex-section-card p-10 text-center text-neutral-500">Leyendo el corazón de la empresa…</div> : null}
      {data ? <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={<TrendingUp />} label="Ventas" value={money.format(m.revenue)} detail={`${number.format(m.units_sold)} unidades`} />
          <Kpi icon={<BadgeDollarSign />} label="Utilidad bruta" value={money.format(m.gross_profit)} detail={`Margen ${number.format(m.gross_margin_pct)}%`} tone={m.gross_margin_pct < 15 ? "danger" : "ok"} />
          <Kpi icon={<Boxes />} label="Inventario" value={money.format(m.inventory_value)} detail={`${number.format(m.inventory_days)} días de cobertura`} tone={m.inventory_days > 120 ? "danger" : "normal"} />
          <Kpi icon={<CircleDollarSign />} label="Esfuerzo de caja" value={money.format(m.cash_effort)} detail={`Ciclo ${number.format(m.cash_cycle_days)} días`} tone={m.cash_cycle_days > 100 ? "danger" : "warn"} />
        </section>

        {view === "pulse" ? <Pulse data={data} setView={setView} /> : null}
        {view === "abc" ? <Products data={data} distribution={abcDistribution} /> : null}
        {view === "flow" ? <Flow data={data} /> : null}
        {view === "alerts" ? <Alerts data={data} reload={() => load(false)} /> : null}
        {view === "settings" ? <Settings data={data} reload={() => load(false)} /> : null}

        <footer className="flex flex-wrap justify-between gap-2 text-xs text-neutral-500"><span>{data.data_status.invoices} facturas · {data.data_status.products} productos · {data.data_status.inventory_snapshots} snapshots de inventario</span><span>Actualizado {new Date(data.data_status.freshness).toLocaleString("es-CO")}</span></footer>
      </> : null}
    </div>
  );
}

function Kpi({ icon, label, value, detail, tone = "normal" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  const palette = tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-line bg-white text-neutral-900";
  return <article className={`rounded-xl border p-4 ${palette}`}><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p><span className="opacity-70">{icon}</span></div><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-1 text-xs opacity-75">{detail}</p></article>;
}

function Pulse({ data, setView }: { data: ApexHeartDashboard; setView: (view: View) => void }) {
  const m = data.metrics;
  return <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
    <section className="apex-section-card p-4"><h2 className="font-semibold">Tendencia de ventas y utilidad</h2><p className="text-sm text-neutral-500">Evolución mensual del periodo seleccionado.</p><div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis tickFormatter={(v) => `${Math.round(v / 1000000)}M`} /><Tooltip formatter={(v) => money.format(Number(v))} /><Legend /><Bar dataKey="revenue" fill="#be123c" name="Ventas" /><Line dataKey="gross_profit" stroke="#f59e0b" strokeWidth={3} name="Utilidad" /></ComposedChart></ResponsiveContainer></div></section>
    <section className="apex-section-card p-4"><div className="flex items-center gap-2"><AlertTriangle className="text-amber-600" size={20} /><h2 className="font-semibold">Decisiones que requieren atención</h2></div><div className="mt-4 space-y-3">{data.computed_alerts.length ? data.computed_alerts.slice(0, 5).map((alert) => <AlertCard alert={alert} key={alert.code} onNavigate={(href) => setView(href.includes("view=abc") ? "abc" : href.includes("view=cash") ? "flow" : "pulse")} />) : <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">El pulso está dentro de los umbrales configurados.</p>}</div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:col-span-2 lg:grid-cols-4"><Kpi icon={<ShoppingCart />} label="Compras" value={money.format(m.purchases)} detail={`CxP ${money.format(m.payable_balance)}`} /><Kpi icon={<Activity />} label="GMROI" value={number.format(m.gmroi)} detail="Utilidad / inventario promedio" /><Kpi icon={<AlertTriangle />} label="Cartera vencida" value={money.format(m.overdue_balance)} detail={`${number.format(m.overdue_ratio_pct)}% de cartera`} tone={m.overdue_ratio_pct > 30 ? "danger" : "warn"} /><Kpi icon={<CircleDollarSign />} label="Margen económico neto" value={money.format(m.economic_net_margin)} detail={`Costo financiero ${money.format(m.financing_cost)}`} tone={m.economic_net_margin < 0 ? "danger" : "ok"} /></section>
  </div>;
}

function Products({ data, distribution }: { data: ApexHeartDashboard; distribution: Array<{ name: string; value: number }> }) {
  return <div className="grid gap-4 xl:grid-cols-[1fr_2fr]"><section className="apex-section-card p-4"><h2 className="font-semibold">Distribución ABC</h2><div className="h-72"><ResponsiveContainer><PieChart><Pie data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} label>{distribution.map((entry) => <Cell fill={COLORS[entry.name]} key={entry.name} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><p className="text-xs text-neutral-500">A: hasta 80% acumulado · B: hasta 95% · C: restante.</p></section><section className="apex-section-card overflow-hidden"><div className="p-4"><h2 className="font-semibold">Rentabilidad, rotación y capital por producto</h2><p className="text-sm text-neutral-500">Score espejo: utilidad 40% + ingreso 35% + GMROI 25%.</p></div><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-paper text-left text-xs uppercase text-neutral-500"><tr>{["ABC","Producto","Categoría","Ventas","Utilidad","Margen","GMROI","Días inv.","Score"].map((h) => <th className="px-3 py-2" key={h}>{h}</th>)}</tr></thead><tbody>{data.products.map((p) => <tr className="border-t border-line" key={p.item_id}><td className="px-3 py-2"><span className="rounded-full px-2 py-1 text-xs font-bold text-white" style={{ background: COLORS[p.abc_class] }}>{p.abc_class}</span></td><td className="px-3 py-2"><p className="font-medium">{p.name}</p><p className="text-xs text-neutral-400">{p.code}</p></td><td className="px-3 py-2">{p.category}</td><td className="px-3 py-2 text-right">{money.format(p.revenue)}</td><td className={`px-3 py-2 text-right ${p.gross_profit < 0 ? "text-red-700" : ""}`}>{money.format(p.gross_profit)}</td><td className="px-3 py-2 text-right">{number.format(p.margin_pct)}%</td><td className="px-3 py-2 text-right">{number.format(p.gmroi)}</td><td className="px-3 py-2 text-right">{number.format(p.inventory_days)}</td><td className="px-3 py-2 text-right font-bold">{number.format(p.score)}</td></tr>)}</tbody></table></div></section></div>;
}

function Flow({ data }: { data: ApexHeartDashboard }) {
  const m = data.metrics; const stages = [{ label: "Compras", value: m.purchases, detail: `CxP ${money.format(m.payable_balance)}` }, { label: "Inventario", value: m.inventory_value, detail: `${number.format(m.inventory_days)} días` }, { label: "Ventas", value: m.revenue, detail: `Mg ${number.format(m.gross_margin_pct)}%` }, { label: "Cartera", value: m.receivable_balance, detail: `Vencida ${money.format(m.overdue_balance)}` }, { label: "Caja", value: m.economic_net_margin, detail: `Ciclo ${number.format(m.cash_cycle_days)} días` }];
  return <div className="space-y-4"><section className="apex-section-card p-5"><h2 className="font-semibold">Flujo integral del negocio</h2><div className="mt-5 grid gap-2 lg:grid-cols-5">{stages.map((stage, index) => <div className="relative rounded-xl border border-line bg-gradient-to-b from-white to-paper p-4" key={stage.label}><p className="text-xs font-bold uppercase text-neutral-500">{index + 1}. {stage.label}</p><p className="mt-2 text-xl font-bold">{money.format(stage.value)}</p><p className="mt-1 text-xs text-neutral-500">{stage.detail}</p>{index < stages.length - 1 ? <span className="absolute -right-3 top-1/2 z-10 hidden text-rose-600 lg:block">→</span> : null}</div>)}</div></section><section className="grid gap-3 md:grid-cols-3"><Kpi icon={<Boxes />} label="Capital excedente" value={money.format(m.excess_inventory_value)} detail={`${number.format(m.excess_inventory_pct)}% del inventario`} /><Kpi icon={<CircleDollarSign />} label="Costo financiero" value={money.format(m.financing_cost)} detail="Saldo declinante estimado" /><Kpi icon={<Activity />} label="Ciclo de caja" value={`${number.format(m.cash_cycle_days)} días`} detail={`Inventario ${number.format(m.inventory_days)} + cartera ${number.format(m.receivable_days)} − proveedores ${number.format(m.payable_days)}`} /></section></div>;
}

function AlertCard({ alert, persistent = false, onAck, onNavigate }: { alert: { title: string; message: string; severity: string; action_label?: string; action_href?: string }; persistent?: boolean; onAck?: () => void; onNavigate?: (href: string) => void }) {
  const internalView = alert.action_href?.startsWith("/dashboard/reportes/apex-heart?");
  return <article className={`rounded-lg border p-3 ${alert.severity === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><p className="text-sm font-semibold">{alert.severity === "critical" ? "Crítica · " : "Advertencia · "}{alert.title}</p><p className="mt-1 text-xs text-neutral-600">{alert.message}</p><div className="mt-2 flex gap-3">{alert.action_href ? internalView && onNavigate ? <button className="text-xs font-bold text-rose-700" onClick={() => onNavigate(alert.action_href!)}>{alert.action_label || "Atender"} →</button> : <Link className="text-xs font-bold text-rose-700" href={alert.action_href}>{alert.action_label || "Atender"} →</Link> : null}{persistent && onAck ? <button className="text-xs font-bold text-neutral-600" onClick={onAck}>Marcar revisada</button> : null}</div></article>;
}

function Alerts({ data, reload }: { data: ApexHeartDashboard; reload: () => Promise<void> }) {
  return <div className="grid gap-4 lg:grid-cols-2"><section className="apex-section-card p-4"><h2 className="font-semibold">Alertas activas</h2><p className="text-sm text-neutral-500">Persisten hasta que un responsable las revise.</p><div className="mt-4 space-y-3">{data.alerts.length ? data.alerts.map((alert) => <AlertCard alert={alert} key={alert.id} persistent onAck={() => void acknowledgeApexHeartAlert(alert.id).then(reload)} />) : <p className="text-sm text-neutral-500">No hay alertas persistentes abiertas.</p>}</div></section><section className="apex-section-card p-4"><h2 className="font-semibold">Evaluación actual</h2><p className="text-sm text-neutral-500">Resultado inmediato de las métricas frente a las reglas.</p><div className="mt-4 space-y-3">{data.computed_alerts.map((alert) => <AlertCard alert={alert} key={alert.code} />)}</div></section></div>;
}

function Settings({ data, reload }: { data: ApexHeartDashboard; reload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function saveConfig(form: FormData) { setSaving(true); await updateApexHeartConfig({ annual_financing_rate: Number(form.get("annual_financing_rate")), inventory_target_days: Number(form.get("inventory_target_days")), lost_portfolio_rate: Number(form.get("lost_portfolio_rate")), alert_in_app_enabled: form.get("alert_in_app_enabled") === "on", alert_email_enabled: form.get("alert_email_enabled") === "on" }); await reload(); setSaving(false); }
  return <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]"><form className="apex-section-card space-y-4 p-4" action={(form) => void saveConfig(form)}><div><h2 className="font-semibold">Parámetros gerenciales</h2><p className="text-sm text-neutral-500">Aplican únicamente a la empresa activa.</p></div>{[["annual_financing_rate","Tasa efectiva anual (%)"],["inventory_target_days","Meta días inventario"],["lost_portfolio_rate","Cartera perdida esperada (%)"]].map(([key,label]) => <label className="block text-sm" key={key}>{label}<input className="mt-1 h-10 w-full rounded-md border border-line px-3" defaultValue={Number(data.config[key] || 0)} name={key} step="0.01" type="number" /></label>)}<label className="flex gap-2 text-sm"><input defaultChecked={Boolean(data.config.alert_in_app_enabled)} name="alert_in_app_enabled" type="checkbox" /> Alertas dentro de APEX OS</label><label className="flex gap-2 text-sm"><input defaultChecked={Boolean(data.config.alert_email_enabled)} name="alert_email_enabled" type="checkbox" /> Preparar notificación por correo</label><button className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white" disabled={saving}><Settings2 size={16} />{saving ? "Guardando…" : "Guardar parámetros"}</button></form><section className="apex-section-card overflow-hidden"><div className="p-4"><h2 className="font-semibold">Reglas de alerta</h2><p className="text-sm text-neutral-500">Activa, desactiva y ajusta niveles de advertencia y criticidad.</p></div><div className="divide-y divide-line">{data.rules.map((rule) => <RuleRow key={rule.id} rule={rule} reload={reload} />)}</div></section></div>;
}

function RuleRow({ rule, reload }: { rule: ApexHeartDashboard["rules"][number]; reload: () => Promise<void> }) {
  const [warning, setWarning] = useState(rule.warning_threshold); const [critical, setCritical] = useState(rule.critical_threshold); const [cooldown, setCooldown] = useState(rule.cooldown_hours); const [enabled, setEnabled] = useState(rule.enabled);
  return <div className="grid gap-2 p-4 sm:grid-cols-[1fr_100px_100px_100px_auto] sm:items-end"><div><p className="text-sm font-semibold">{rule.name}</p><label className="mt-1 flex gap-2 text-xs text-neutral-500"><input checked={enabled} onChange={(e) => setEnabled(e.target.checked)} type="checkbox" /> Regla activa</label></div><label className="text-xs text-neutral-500">Advertencia<input className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm" onChange={(e) => setWarning(Number(e.target.value))} type="number" value={warning} /></label><label className="text-xs text-neutral-500">Crítico<input className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm" onChange={(e) => setCritical(Number(e.target.value))} type="number" value={critical} /></label><label className="text-xs text-neutral-500">Repetir (h)<input className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm" min="1" onChange={(e) => setCooldown(Number(e.target.value))} type="number" value={cooldown} /></label><button className="h-9 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => void updateApexHeartRule(rule.id, { warning_threshold: warning, critical_threshold: critical, cooldown_hours: cooldown, enabled }).then(reload)} type="button">Guardar</button></div>;
}
