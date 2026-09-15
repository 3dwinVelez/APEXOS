"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form-controls";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, MapPinned, RefreshCw, Route, Settings2, Sparkles, Tag, Truck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

type Origin = { id: number; code: string; name: string; city: string; latitude: number; longitude: number };
type Need = { id: number; code: string; due_at: string; weight_kg: number; volume_m3: number; delivery_point: { name: string; city: string } };
type Group = { key: string; origin_id?: number; origin?: Origin; service_level: string; required_vehicle_type?: string; due_date: string; need_ids: number[]; needs: Need[]; total_weight_kg: number; total_volume_m3: number; total_pallets: number };
type Workbench = { pending_needs: number; consolidation_groups: Group[]; readiness?: { active_carriers: number; active_rates: number; active_vehicles: number } };
type Vehicle = { id: number; plate: string; type?: string; master_status: string; capacity_value?: number; capacity_unit?: string; volume_available?: number };
type Coordinate = { latitude: number; longitude: number };
type Leg = { sequence: number; from: string; to: string; need_id?: number; distance_km: number; from_coordinate: Coordinate; to_coordinate: Coordinate };
type Quote = { option_id: string; rate_card_id: number; rate_code: string; rate_version: number; carrier_id?: number; carrier_name: string; currency: string; components: Record<string, number>; total: number; carrier_score: number; rank: number; recommended: boolean; minimum_applied: boolean; service_level: string; vehicle_id?: number; vehicle_plate?: string; vehicle_type?: string; duration_minutes: number; benefits: string[]; savings_vs_highest: number };
type Plan = { generated_at: string; strategy: string; origin: Origin; ordered_need_ids: number[]; route: { legs: Leg[]; distance_km: number; road_factor: number | null; engine?: string; profile?: string; geometry?: { type: "LineString"; coordinates: number[][] } | null }; totals: { weight_kg: number; volume_m3: number; pallets: number; stop_count: number; distance_km: number }; planned_duration_minutes: number; capacity: { vehicle_id?: number; plate?: string; feasible: boolean; weight_feasible: boolean; volume_feasible: boolean; weight_capacity_kg: number; volume_capacity_m3: number }; quotes: Quote[]; warnings: string[] };
type Guidance = { title: string; explanation: string; actions: string[]; technical?: string };

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
  const [selectedOption, setSelectedOption] = useState<string | null>(null); const [message, setMessage] = useState(""); const [createdTrip, setCreatedTrip] = useState<{ id: number; code: string } | null>(null); const [error, setError] = useState("");
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [loading, setLoading] = useState(true); const [evaluating, setEvaluating] = useState(false); const [committing, setCommitting] = useState(false);
  const canWrite = hasStoredRolePermission("transport", "write");

  const load = useCallback(async () => {
    try {
      const [workbenchData, originRows, vehicleRows] = await Promise.all([
        api<Workbench>("/api/v1/transport/planning/workbench"), api<Origin[]>("/api/v1/transport/origins"), api<Vehicle[]>("/api/v1/transport/vehicles")
      ]);
      setWorkbench(workbenchData); setOrigins(originRows); setVehicles(vehicleRows); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible cargar el planeador."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function evaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedGroup) return; const data = new FormData(event.currentTarget);
    try { setEvaluating(true);
      const result = await api<Plan>("/api/v1/transport/planning/evaluate", { method: "POST", suppressPlatformAlert: true, body: JSON.stringify({
        origin_id: Number(data.get("origin_id")), need_ids: selectedGroup.need_ids, vehicle_id: data.get("vehicle_id") ? Number(data.get("vehicle_id")) : undefined,
        strategy: data.get("strategy"), service_level: selectedGroup.service_level, compare_service_levels: true, return_to_origin: data.get("return_to_origin") === "on"
      }) });
      setPlan(result); setSelectedOption(result.quotes[0]?.option_id || null); setMessage(result.quotes.length ? `${result.quotes.length} opciones listas para comparar.` : "La ruta está lista, pero faltan tarifas aplicables."); setCreatedTrip(null); setError("");
    } catch (caught) { setGuidance(planningGuidance(caught)); setError(""); } finally { setEvaluating(false); }
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedGroup || !plan || !selectedOption) return; const data = new FormData(event.currentTarget); const selected = plan.quotes.find((quote) => quote.option_id === selectedOption); if (!selected) return;
    try { setCommitting(true);
      const result = await api<{ trip: { id: number; code: string } }>("/api/v1/transport/planning/commit", { method: "POST", suppressPlatformAlert: true, body: JSON.stringify({
        code: data.get("code"), origin_id: plan.origin.id, need_ids: selectedGroup.need_ids, rate_card_id: selected.rate_card_id,
        vehicle_id: selected.vehicle_id || undefined, carrier_id: selected.carrier_id || undefined, strategy: plan.strategy, compare_service_levels: true,
        service_level: selected.service_level, planned_departure: data.get("planned_departure") || undefined,
        planned_arrival: data.get("planned_arrival") || undefined, return_to_origin: plan.route.legs.some((leg) => !leg.need_id)
      }) });
      setMessage(`Viaje ${result.trip.code} confirmado. Ya está disponible para asignación y seguimiento.`); setCreatedTrip(result.trip); setPlan(null); setSelectedGroup(null); await load();
    } catch (caught) { setGuidance(planningGuidance(caught)); setError(""); } finally { setCommitting(false); }
  }

  return <div className="space-y-5">
    {guidance ? <ModalFrame title={guidance.title} onClose={() => setGuidance(null)} maxWidth="md:max-w-lg"><div className="space-y-4"><Alert tone="warning"><span className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={20} />{guidance.explanation}</span></Alert><div><h3 className="text-sm font-semibold text-content-strong">Qué debes hacer</h3><ol className="mt-2 space-y-2 text-sm text-content-body">{guidance.actions.map((action, index) => <li className="flex gap-2" key={action}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-apex text-xs font-semibold text-white">{index + 1}</span><span className="pt-0.5">{action}</span></li>)}</ol></div><details className="rounded-card border border-line p-3 text-xs text-content-muted"><summary className="cursor-pointer font-semibold">Detalle técnico para soporte</summary><p className="mt-2 break-words">{guidance.technical}</p></details><Button autoFocus className="apex-primary-action w-full" onClick={() => setGuidance(null)} type="button">Entendido, voy a corregirlo</Button></div></ModalFrame> : null}
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Paso 2 de 6 · elegir la mejor opción</p><h1 className="mt-1 text-2xl font-semibold text-content-strong">Planea y compara tu viaje</h1><p className="mt-2 max-w-2xl text-sm text-content-muted">Selecciona pedidos, compara costo, tiempo, transportadora y vehículo; confirma una opción para enviarla a operación.</p></div><Button className="h-12 sm:h-10" onClick={() => void load()} type="button" variant="secondary"><RefreshCw size={16} />Actualizar pedidos</Button></header>
    {message ? <Alert tone="success"><div className="flex flex-wrap items-center justify-between gap-3"><span>{message}</span>{createdTrip ? <Link className="inline-flex items-center gap-2 font-semibold text-apex" href="/dashboard/transporte/operacion">Ir a operación y seguimiento <ArrowRight size={16} /></Link> : null}</div></Alert> : null}{error ? <Alert tone="error">{error}</Alert> : null}
    {!loading ? <section className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[1fr_auto]"><div><div className="flex items-center gap-2"><Settings2 className="text-apex" size={18} /><h2 className="font-semibold text-content-strong">Red de transporte disponible</h2></div><p className="mt-1 text-sm text-content-muted">{workbench.readiness?.active_carriers || 0} transportadoras · {workbench.readiness?.active_rates || 0} tarifas activas · {workbench.readiness?.active_vehicles || 0} vehículos.</p></div><div className="flex flex-wrap gap-2"><Link className="inline-flex h-12 items-center rounded-control border border-line bg-surface px-3 text-sm font-semibold text-content-strong hover:border-apex hover:bg-surface-muted sm:h-9" href="/dashboard/transporte/maestros">Conectar transportadora</Link><Link className="inline-flex h-12 items-center rounded-control border border-line bg-surface px-3 text-sm font-semibold text-content-strong hover:border-apex hover:bg-surface-muted sm:h-9" href="/dashboard/transporte/tarifas">Gestionar tarifas</Link></div></section> : null}
    {loading ? <div aria-label="Cargando planeador" className="grid gap-3"><Skeleton className="h-28" /><Skeleton className="h-40" /></div> : null}
    {!loading ? <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <aside className="space-y-3 rounded-card border border-line bg-surface p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-content-strong">Consolidaciones sugeridas</h2><p className="text-xs text-content-muted">{workbench.pending_needs} necesidades pendientes</p></div><Sparkles className="text-apex" size={20} /></div>
        {workbench.consolidation_groups.map((group) => <button aria-pressed={selectedGroup?.key === group.key} className={`w-full rounded-card border p-3 text-left text-content-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-apex ${selectedGroup?.key === group.key ? "border-apex bg-apex/10" : "border-line hover:border-apex hover:bg-surface-muted"}`} key={group.key} onClick={() => { setSelectedGroup(group); setPlan(null); }}><div className="flex justify-between gap-2"><p className="font-semibold text-content-strong">{group.origin?.name || "Origen por completar"}</p><span className="text-xs text-content-muted">{group.needs.length} entregas</span></div><p className="mt-1 text-xs text-content-muted">{group.service_level} · vence {new Date(`${group.due_date}T12:00:00`).toLocaleDateString()}</p><p className="mt-2 text-sm">{group.total_weight_kg.toLocaleString()} kg · {group.total_volume_m3.toLocaleString()} m³</p></button>)}
        {!workbench.consolidation_groups.length ? <EmptyState description="Los pedidos completos aparecerán aquí cuando estén listos para planear." title="No hay pedidos por consolidar" /> : null}
      </aside>
      <main className="space-y-4">
        <section className="rounded-card border border-line bg-surface p-4"><h2 className="font-semibold text-content-strong">Parámetros del escenario</h2>{selectedGroup ? <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={evaluate}><Select className="h-12 sm:h-10" defaultValue={selectedGroup.origin_id || ""} label="Origen" name="origin_id" required>{origins.map((origin) => <option key={origin.id} value={origin.id}>{origin.code} · {origin.name}</option>)}</Select><Select className="h-12 sm:h-10" label="Vehículo para validar" name="vehicle_id"><option value="">Sin preasignar</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.type || "sin tipo"} · {vehicle.master_status}</option>)}</Select><Select className="h-12 sm:h-10" label="Estrategia" name="strategy"><option value="balanced">Costo y servicio</option><option value="cost">Menor costo</option><option value="service">Mejor transportadora</option><option value="priority">Prioridad contractual</option></Select><label className="flex min-h-12 items-center gap-2 pt-7 text-sm text-content-strong"><input name="return_to_origin" type="checkbox" />Incluir regreso al origen</label><div className="flex justify-end sm:col-span-2 lg:col-span-4"><Button className="apex-primary-action h-12 sm:h-10" disabled={!canWrite} loading={evaluating}><Route size={17} />Evaluar opciones</Button></div></form> : <p className="mt-3 text-sm text-content-muted">Selecciona una consolidación para iniciar.</p>}</section>
        {plan ? <PlanResult committing={committing} plan={plan} selectedOption={selectedOption} onSelectOption={setSelectedOption} onCommit={commit} /> : null}
      </main>
    </div> : null}
  </div>;
}

function PlanResult({ committing, plan, selectedOption, onSelectOption, onCommit }: { committing: boolean; plan: Plan; selectedOption: string | null; onSelectOption: (id: string) => void; onCommit: (event: FormEvent<HTMLFormElement>) => void }) {
  const selected = plan.quotes.find((quote) => quote.option_id === selectedOption);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Distancia estimada" value={`${plan.totals.distance_km} km`} /><Metric label="Duración" value={`${Math.floor(plan.planned_duration_minutes / 60)}h ${plan.planned_duration_minutes % 60}m`} /><Metric label="Peso" value={`${plan.totals.weight_kg.toLocaleString()} kg`} /><Metric label="Volumen" value={`${plan.totals.volume_m3.toLocaleString()} m³`} /><Metric label="Capacidad" value={plan.capacity.feasible ? "Viable" : "Excedida"} good={plan.capacity.feasible} /></div>
    {plan.warnings.length ? <Alert tone="warning"><span className="flex gap-2"><AlertTriangle size={18} />{plan.warnings.map((warning) => warning.replaceAll("_", " ")).join(" · ")}</span></Alert> : null}
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]"><RouteMap plan={plan} /><section className="rounded-card border border-line bg-surface p-4"><h3 className="font-semibold text-content-strong">Secuencia propuesta</h3><div className="mt-3 space-y-2"><div className="flex gap-3 text-sm"><span className="grid h-7 w-7 place-items-center rounded-full bg-apex text-xs font-bold text-white">O</span><div><p className="font-semibold text-content-strong">{plan.origin.name}</p><p className="text-xs text-content-muted">Origen · {plan.origin.city}</p></div></div>{plan.route.legs.filter((leg) => leg.need_id).map((leg) => <div className="flex gap-3 text-sm" key={`${leg.sequence}-${leg.need_id}`}><span className="grid h-7 w-7 place-items-center rounded-full bg-paper text-xs font-bold text-apex">{leg.sequence}</span><div><p className="font-semibold text-content-strong">{leg.to}</p><p className="text-xs text-content-muted">{leg.distance_km} km desde {leg.from}</p></div></div>)}</div></section></div>
    <section className="rounded-card border border-line bg-surface p-4"><div><p className="text-xs font-semibold uppercase text-apex">Compara antes de decidir</p><h3 className="mt-1 text-lg font-semibold text-content-strong">Opciones disponibles</h3><p className="text-sm text-content-muted">Elige el beneficio que mejor responda a tu operación.</p></div><div className="mt-4 grid gap-3 lg:grid-cols-3">{plan.quotes.map((quote) => <button aria-pressed={selectedOption === quote.option_id} className={`relative rounded-card border p-4 text-left text-content-body transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-apex ${selectedOption === quote.option_id ? "border-apex bg-apex/10 ring-2 ring-apex/20" : "border-line hover:border-apex hover:bg-surface-muted"}`} key={quote.option_id} onClick={() => onSelectOption(quote.option_id)} type="button"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold uppercase text-apex">Opción {quote.rank}</span>{quote.recommended ? <Badge tone="success">Recomendada</Badge> : null}</div><div className="mt-3 flex flex-wrap gap-1">{quote.benefits.map((benefit) => <Badge key={benefit}>{benefit === "menor_costo" ? "Ahorra más" : benefit === "menor_tiempo" ? "Llega antes" : "Mejor servicio"}</Badge>)}</div><p className="mt-3 text-lg font-semibold text-content-strong">{quote.carrier_name}</p><p className="text-sm text-content-body">{quote.vehicle_plate || "Vehículo por asignar"} · {quote.vehicle_type || "tipo flexible"}</p><div className="mt-4 grid grid-cols-2 gap-3"><div><p className="flex items-center gap-1 text-xs text-content-muted"><Tag size={13} />Costo</p><p className="mt-1 text-xl font-semibold text-content-strong">{money(quote.total, quote.currency)}</p></div><div><p className="flex items-center gap-1 text-xs text-content-muted"><Clock3 size={13} />Tiempo estimado</p><p className="mt-1 text-xl font-semibold text-content-strong">{duration(quote.duration_minutes)}</p></div></div><p className="mt-3 text-xs text-content-muted">Servicio {quote.service_level} · calificación {quote.carrier_score || "sin historial"}</p>{quote.savings_vs_highest > 0 ? <p className="mt-2 text-xs font-semibold text-success">Ahorras {money(quote.savings_vs_highest, quote.currency)} frente a la opción de mayor costo.</p> : null}<div className="mt-4 flex items-center gap-2 text-sm font-semibold text-apex">{selectedOption === quote.option_id ? <CheckCircle2 size={17} /> : null}{selectedOption === quote.option_id ? "Opción elegida" : "Elegir esta opción"}</div></button>)}{!plan.quotes.length ? <EmptyState className="lg:col-span-3" description="Activa una tarifa compatible y un vehículo con capacidad; después vuelve a evaluar." primaryAction={<Link className="font-semibold text-apex" href="/dashboard/transporte/tarifas">Crear tarifa</Link>} secondaryAction={<Link className="font-semibold text-apex" href="/dashboard/transporte/maestros">Revisar maestros</Link>} title="Faltan alternativas para esta ruta" /> : null}</div></section>
    {selected ? <form className="grid gap-3 rounded-card border border-apex bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onCommit}><div className="flex items-start justify-between gap-3 lg:col-span-4"><div><p className="text-xs font-semibold uppercase text-apex">Tu elección</p><h3 className="mt-1 text-lg font-semibold text-content-strong">{selected.carrier_name} · {selected.vehicle_plate || selected.vehicle_type || "vehículo por asignar"}</h3><p className="text-sm text-content-muted">{money(selected.total, selected.currency)} · {duration(selected.duration_minutes)}. Al confirmar se crea el viaje y continúa en Operación.</p></div><CheckCircle2 className="shrink-0 text-success" size={24} /></div><Field className="h-12 sm:h-10" name="code" label="Código de viaje" defaultValue={`VJ-${Date.now().toString().slice(-8)}`} required /><Field className="h-12 sm:h-10" name="planned_departure" label="Salida planificada" type="datetime-local" /><Field className="h-12 sm:h-10" name="planned_arrival" label="Llegada objetivo" type="datetime-local" /><Input className="h-12 sm:h-10" label="Nivel de servicio" readOnly value={selected.service_level} /><div className="flex justify-end lg:col-span-4"><Button className="apex-primary-action h-12 sm:h-10" loading={committing}><Truck size={17} />Confirmar opción y crear viaje</Button></div></form> : null}
  </div>;
}

function RouteMap({ plan }: { plan: Plan }) {
  const geometry = plan.route.geometry?.coordinates || [];
  const stops = [{ label: plan.origin.name, position: [plan.origin.latitude, plan.origin.longitude] as [number, number], kind: "origin" as const, sequence: 0 }, ...plan.route.legs.filter((leg) => leg.need_id).map((leg) => ({ label: leg.to, position: [leg.to_coordinate.latitude, leg.to_coordinate.longitude] as [number, number], kind: "stop" as const, sequence: leg.sequence }))];
  return <section className="overflow-hidden rounded-card border border-line bg-surface"><div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3"><div className="flex items-center gap-2"><MapPinned className="text-apex" size={18} /><h3 className="font-semibold text-content-strong">Ruta óptima por carretera</h3></div><span className="text-xs font-semibold uppercase text-apex">{plan.route.engine === "osrm" ? "Motor OSRM" : "Estimación temporal"}</span></div>{geometry.length ? <PlanningRouteMap geometry={geometry} stops={stops} /> : <div className="grid h-[310px] place-items-center bg-paper p-6 text-center text-sm text-content-muted">El motor vial no respondió. La secuencia se calculó temporalmente sin mapa de carretera.</div>}<p className="border-t border-line px-4 py-2 text-xs text-content-muted">Ruta calculada sobre la red vial de OpenStreetMap. Verifica restricciones especiales del vehículo antes del despacho.</p></section>;
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="rounded-card border border-line bg-surface p-3"><p className="text-xs text-content-muted">{label}</p><p className={`mt-2 font-semibold ${good === false ? "text-error" : good ? "text-success" : "text-content-strong"}`}>{value}</p></div>; }
function duration(minutes: number) { return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`; }
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <Input {...props} />; }
