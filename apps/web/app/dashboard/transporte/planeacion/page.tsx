"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { AlertTriangle, CheckCircle2, MapPinned, RefreshCw, Route, Sparkles, Truck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

type Origin = { id: number; code: string; name: string; city: string; latitude: number; longitude: number };
type Need = { id: number; code: string; due_at: string; weight_kg: number; volume_m3: number; delivery_point: { name: string; city: string } };
type Group = { key: string; origin_id?: number; origin?: Origin; service_level: string; required_vehicle_type?: string; due_date: string; need_ids: number[]; needs: Need[]; total_weight_kg: number; total_volume_m3: number; total_pallets: number };
type Workbench = { pending_needs: number; consolidation_groups: Group[] };
type Vehicle = { id: number; plate: string; type?: string; master_status: string; capacity_value?: number; capacity_unit?: string; volume_available?: number };
type Coordinate = { latitude: number; longitude: number };
type Leg = { sequence: number; from: string; to: string; need_id?: number; distance_km: number; from_coordinate: Coordinate; to_coordinate: Coordinate };
type Quote = { rate_card_id: number; rate_code: string; rate_version: number; carrier_name: string; currency: string; components: Record<string, number>; total: number; carrier_score: number; rank: number; recommended: boolean; minimum_applied: boolean };
type Plan = { generated_at: string; strategy: string; origin: Origin; ordered_need_ids: number[]; route: { legs: Leg[]; distance_km: number; road_factor: number | null; engine?: string; profile?: string; geometry?: { type: "LineString"; coordinates: number[][] } | null }; totals: { weight_kg: number; volume_m3: number; pallets: number; stop_count: number; distance_km: number }; planned_duration_minutes: number; capacity: { vehicle_id?: number; plate?: string; feasible: boolean; weight_feasible: boolean; volume_feasible: boolean; weight_capacity_kg: number; volume_capacity_m3: number }; quotes: Quote[]; warnings: string[] };
type Guidance = { title: string; explanation: string; actions: string[]; technical?: string };

const inputClass = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-apex";
const money = (value: number, currency = "COP") => new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const PlanningRouteMap = dynamic(() => import("@/components/transport/PlanningRouteMap"), { ssr: false, loading: () => <div className="grid h-[360px] place-items-center bg-paper text-sm text-content-muted">Cargando mapa vial…</div> });

function planningGuidance(caught: unknown): Guidance {
  const technical = caught instanceof Error ? caught.message : "No fue posible evaluar el plan.";
  if (/mismo origen|TMS_INCOMPATIBLE_ORIGIN/i.test(technical)) return {
    title: "Los pedidos deben salir del mismo origen",
    explanation: "La consolidación elegida contiene pedidos asociados a un centro de salida diferente del origen seleccionado.",
    actions: ["Cierra esta ventana.", "Selecciona una consolidación cuyo centro coincida con el campo Origen.", "Si el pedido tiene un origen incorrecto, corrígelo en Preparar pedidos y vuelve a evaluar."],
    technical,
  };
  if (/tarifa activa|rate|TMS_RATE/i.test(technical)) return {
    title: "Falta una tarifa para calcular el viaje",
    explanation: "APEX OS no encontró una tarifa vigente que cubra el origen, destino, vehículo y nivel de servicio elegidos.",
    actions: ["Revisa el nivel de servicio y el tipo de vehículo.", "Crea o activa la tarifa necesaria en Costos y tarifas.", "Regresa al planeador y evalúa nuevamente."],
    technical,
  };
  if (/capacidad|TMS_.*CAPACITY/i.test(technical)) return {
    title: "La carga supera la capacidad disponible",
    explanation: "El peso o el volumen de los pedidos no cabe en el vehículo seleccionado.",
    actions: ["Selecciona un vehículo con mayor capacidad.", "Divide los pedidos en otra consolidación.", "Evalúa nuevamente antes de crear el viaje."],
    technical,
  };
  return {
    title: "Completa la información para continuar",
    explanation: "APEX OS no pudo terminar esta acción con los datos actuales.",
    actions: ["Revisa el origen, la consolidación y el vehículo seleccionado.", "Corrige la información indicada y vuelve a intentarlo."],
    technical,
  };
}

export default function TransportPlanningPage() {
  const [workbench, setWorkbench] = useState<Workbench>({ pending_needs: 0, consolidation_groups: [] });
  const [origins, setOrigins] = useState<Origin[]>([]); const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null); const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<number | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const canWrite = hasStoredRolePermission("transport", "write");

  const load = useCallback(async () => {
    try {
      const [workbenchData, originRows, vehicleRows] = await Promise.all([
        api<Workbench>("/api/v1/transport/planning/workbench"), api<Origin[]>("/api/v1/transport/origins"), api<Vehicle[]>("/api/v1/transport/vehicles")
      ]);
      setWorkbench(workbenchData); setOrigins(originRows); setVehicles(vehicleRows); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible cargar el planeador."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function evaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedGroup) return; const data = new FormData(event.currentTarget);
    try {
      const result = await api<Plan>("/api/v1/transport/planning/evaluate", { method: "POST", suppressPlatformAlert: true, body: JSON.stringify({
        origin_id: Number(data.get("origin_id")), need_ids: selectedGroup.need_ids, vehicle_id: data.get("vehicle_id") ? Number(data.get("vehicle_id")) : undefined,
        strategy: data.get("strategy"), service_level: selectedGroup.service_level, return_to_origin: data.get("return_to_origin") === "on"
      }) });
      setPlan(result); setSelectedQuote(result.quotes[0]?.rate_card_id || null); setMessage("Alternativas recalculadas con ruta, capacidad y tarifa vigentes."); setError("");
    } catch (caught) { setGuidance(planningGuidance(caught)); setError(""); }
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedGroup || !plan || !selectedQuote) return; const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ trip: { id: number; code: string } }>("/api/v1/transport/planning/commit", { method: "POST", suppressPlatformAlert: true, body: JSON.stringify({
        code: data.get("code"), origin_id: plan.origin.id, need_ids: selectedGroup.need_ids, rate_card_id: selectedQuote,
        vehicle_id: plan.capacity.vehicle_id || undefined, strategy: plan.strategy,
        service_level: selectedGroup.service_level, planned_departure: data.get("planned_departure") || undefined,
        planned_arrival: data.get("planned_arrival") || undefined, return_to_origin: plan.route.legs.some((leg) => !leg.need_id)
      }) });
      setMessage(`Viaje ${result.trip.code} creado con secuencia y costo calculados.`); setPlan(null); setSelectedGroup(null); await load();
    } catch (caught) { setGuidance(planningGuidance(caught)); setError(""); }
  }

  return <div className="space-y-5">
    {guidance ? <ModalFrame title={guidance.title} onClose={() => setGuidance(null)} maxWidth="md:max-w-lg"><div className="space-y-4"><div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950"><AlertTriangle className="mt-0.5 shrink-0" size={20} /><p className="text-sm">{guidance.explanation}</p></div><div><h3 className="text-sm font-semibold">Qué debes hacer</h3><ol className="mt-2 space-y-2 text-sm text-content-body">{guidance.actions.map((action, index) => <li className="flex gap-2" key={action}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-apex text-xs font-semibold text-white">{index + 1}</span><span className="pt-0.5">{action}</span></li>)}</ol></div><details className="rounded-md border border-line p-3 text-xs text-content-muted"><summary className="cursor-pointer font-semibold">Detalle técnico para soporte</summary><p className="mt-2 break-words">{guidance.technical}</p></details><button autoFocus className="apex-primary-action h-10 w-full text-sm font-semibold" onClick={() => setGuidance(null)} type="button">Entendido, voy a corregirlo</button></div></ModalFrame> : null}
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Decision logistica</p><h1 className="mt-1 text-3xl font-semibold">Planeador de transporte</h1><p className="mt-2 text-sm text-neutral-600">Consolida demanda, secuencia paradas, valida capacidad y compara el costo contractual.</p></div><button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold" onClick={() => void load()}><RefreshCw size={16} />Actualizar demanda</button></header>
    {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}{error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <aside className="space-y-3 rounded-xl border border-line bg-white p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Consolidaciones sugeridas</h2><p className="text-xs text-neutral-500">{workbench.pending_needs} necesidades pendientes</p></div><Sparkles className="text-apex" size={20} /></div>
        {workbench.consolidation_groups.map((group) => <button className={`w-full rounded-lg border p-3 text-left ${selectedGroup?.key === group.key ? "border-apex bg-[#146C630A]" : "border-line"}`} key={group.key} onClick={() => { setSelectedGroup(group); setPlan(null); }}><div className="flex justify-between gap-2"><p className="font-semibold">{group.origin?.name || "Origen por completar"}</p><span className="text-xs text-neutral-500">{group.needs.length} entregas</span></div><p className="mt-1 text-xs text-neutral-600">{group.service_level} · vence {new Date(`${group.due_date}T12:00:00`).toLocaleDateString()}</p><p className="mt-2 text-sm">{group.total_weight_kg.toLocaleString()} kg · {group.total_volume_m3.toLocaleString()} m³</p></button>)}
        {!workbench.consolidation_groups.length ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-500">No hay demanda completa y pendiente para consolidar.</p> : null}
      </aside>
      <main className="space-y-4">
        <section className="rounded-xl border border-line bg-white p-4"><h2 className="font-semibold">Parámetros del escenario</h2>{selectedGroup ? <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={evaluate}><label className="text-sm"><span className="mb-1 block font-medium">Origen</span><select className={inputClass} defaultValue={selectedGroup.origin_id || ""} name="origin_id" required>{origins.map((origin) => <option key={origin.id} value={origin.id}>{origin.code} · {origin.name}</option>)}</select></label><label className="text-sm"><span className="mb-1 block font-medium">Vehículo para validar</span><select className={inputClass} name="vehicle_id"><option value="">Sin preasignar</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.type || "sin tipo"} · {vehicle.master_status}</option>)}</select></label><label className="text-sm"><span className="mb-1 block font-medium">Estrategia</span><select className={inputClass} name="strategy"><option value="balanced">Costo y servicio</option><option value="cost">Menor costo</option><option value="service">Mejor transportadora</option><option value="priority">Prioridad contractual</option></select></label><label className="flex items-center gap-2 pt-7 text-sm"><input name="return_to_origin" type="checkbox" />Incluir regreso al origen</label><div className="flex justify-end sm:col-span-2 lg:col-span-4"><button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" disabled={!canWrite}><Route size={17} />Evaluar escenario</button></div></form> : <p className="mt-3 text-sm text-neutral-500">Selecciona una consolidación para iniciar.</p>}</section>
        {plan ? <PlanResult plan={plan} selectedQuote={selectedQuote} onSelectQuote={setSelectedQuote} onCommit={commit} /> : null}
      </main>
    </div>
  </div>;
}

function PlanResult({ plan, selectedQuote, onSelectQuote, onCommit }: { plan: Plan; selectedQuote: number | null; onSelectQuote: (id: number) => void; onCommit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Distancia estimada" value={`${plan.totals.distance_km} km`} /><Metric label="Duración" value={`${Math.floor(plan.planned_duration_minutes / 60)}h ${plan.planned_duration_minutes % 60}m`} /><Metric label="Peso" value={`${plan.totals.weight_kg.toLocaleString()} kg`} /><Metric label="Volumen" value={`${plan.totals.volume_m3.toLocaleString()} m³`} /><Metric label="Capacidad" value={plan.capacity.feasible ? "Viable" : "Excedida"} good={plan.capacity.feasible} /></div>
    {plan.warnings.length ? <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle size={18} />{plan.warnings.map((warning) => warning.replaceAll("_", " ")).join(" · ")}</div> : null}
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]"><RouteMap plan={plan} /><section className="rounded-xl border border-line bg-white p-4"><h3 className="font-semibold">Secuencia propuesta</h3><div className="mt-3 space-y-2"><div className="flex gap-3 text-sm"><span className="grid h-7 w-7 place-items-center rounded-full bg-apex text-xs font-bold text-white">O</span><div><p className="font-semibold">{plan.origin.name}</p><p className="text-xs text-neutral-500">Origen · {plan.origin.city}</p></div></div>{plan.route.legs.filter((leg) => leg.need_id).map((leg) => <div className="flex gap-3 text-sm" key={`${leg.sequence}-${leg.need_id}`}><span className="grid h-7 w-7 place-items-center rounded-full bg-paper text-xs font-bold text-apex">{leg.sequence}</span><div><p className="font-semibold">{leg.to}</p><p className="text-xs text-neutral-500">{leg.distance_km} km desde {leg.from}</p></div></div>)}</div></section></div>
    <section className="rounded-xl border border-line bg-white p-4"><h3 className="font-semibold">Alternativas tarifarias</h3><div className="mt-3 grid gap-3 lg:grid-cols-3">{plan.quotes.map((quote) => <button className={`rounded-lg border p-4 text-left ${selectedQuote === quote.rate_card_id ? "border-apex ring-1 ring-apex" : "border-line"}`} key={quote.rate_card_id} onClick={() => onSelectQuote(quote.rate_card_id)}><div className="flex justify-between"><span className="text-xs font-semibold uppercase text-apex">Opción {quote.rank}</span>{quote.recommended ? <CheckCircle2 className="text-emerald-600" size={18} /> : null}</div><p className="mt-2 font-semibold">{quote.carrier_name}</p><p className="text-xs text-neutral-500">{quote.rate_code} v{quote.rate_version} · puntaje {quote.carrier_score}</p><p className="mt-3 text-2xl font-semibold">{money(quote.total, quote.currency)}</p><p className="mt-2 text-xs text-neutral-500">Base {money(quote.components.base, quote.currency)} · distancia {money(quote.components.distance, quote.currency)} · combustible {money(quote.components.fuel, quote.currency)}</p>{quote.minimum_applied ? <p className="mt-1 text-xs text-amber-700">Se aplicó cobro mínimo</p> : null}</button>)}{!plan.quotes.length ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-500 lg:col-span-3">No existe una tarifa activa que cubra este escenario.</p> : null}</div></section>
    {plan.quotes.length ? <form className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onCommit}><div className="lg:col-span-4"><h3 className="font-semibold">Confirmar plan</h3><p className="text-xs text-neutral-500">La ruta y el desglose tarifario quedarán guardados en la trazabilidad del viaje.</p></div><Field name="code" label="Código de viaje" defaultValue={`VJ-${Date.now().toString().slice(-8)}`} required /><Field name="planned_departure" label="Salida planificada" type="datetime-local" /><Field name="planned_arrival" label="Llegada objetivo" type="datetime-local" /><label className="text-sm"><span className="mb-1 block font-medium">Tarifa seleccionada</span><input className={inputClass} readOnly value={plan.quotes.find((quote) => quote.rate_card_id === selectedQuote)?.rate_code || ""} /></label><div className="flex justify-end lg:col-span-4"><button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" disabled={!selectedQuote || !plan.capacity.feasible}><Truck size={17} />Crear viaje optimizado</button></div></form> : null}
  </div>;
}

function RouteMap({ plan }: { plan: Plan }) {
  const geometry = plan.route.geometry?.coordinates || [];
  const stops = [{ label: plan.origin.name, position: [plan.origin.latitude, plan.origin.longitude] as [number, number], kind: "origin" as const, sequence: 0 }, ...plan.route.legs.filter((leg) => leg.need_id).map((leg) => ({ label: leg.to, position: [leg.to_coordinate.latitude, leg.to_coordinate.longitude] as [number, number], kind: "stop" as const, sequence: leg.sequence }))];
  return <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3"><div className="flex items-center gap-2"><MapPinned className="text-apex" size={18} /><h3 className="font-semibold">Ruta óptima por carretera</h3></div><span className="text-xs font-semibold uppercase text-apex">{plan.route.engine === "osrm" ? "Motor OSRM" : "Estimación temporal"}</span></div>{geometry.length ? <PlanningRouteMap geometry={geometry} stops={stops} /> : <div className="grid h-[310px] place-items-center bg-paper p-6 text-center text-sm text-content-muted">El motor vial no respondió. La secuencia se calculó temporalmente sin mapa de carretera.</div>}<p className="border-t border-line px-4 py-2 text-xs text-neutral-500">Ruta calculada sobre la red vial de OpenStreetMap. Verifica restricciones especiales del vehículo antes del despacho.</p></section>;
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="rounded-xl border border-line bg-white p-3"><p className="text-xs text-neutral-500">{label}</p><p className={`mt-2 font-semibold ${good === false ? "text-rose-700" : good ? "text-emerald-700" : ""}`}>{value}</p></div>; }
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><input className={inputClass} {...input} /></label>; }
