"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { AlertTriangle, Calculator, ClipboardList, RefreshCw, Route, Settings2, Sparkles, Truck, X } from "lucide-react";
import dynamic from "next/dynamic";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PlanningMapScenario, PlanningRouteStop } from "@/components/transport/PlanningRouteMap";

type Origin = { id: number; code: string; name: string; city: string; latitude: number; longitude: number };
type Need = { id: number; code: string; due_at: string; weight_kg: number; volume_m3: number; delivery_point: { name: string; city: string } };
type Group = { key: string; origin_id?: number; origin?: Origin; service_level: string; required_vehicle_type?: string; due_date: string; need_ids: number[]; needs: Need[]; total_weight_kg: number; total_volume_m3: number; total_pallets: number };
type Workbench = { pending_needs: number; consolidation_groups: Group[] };
type Vehicle = { id: number; plate: string; type?: string; master_status: string; capacity_value?: number; capacity_unit?: string; volume_available?: number };
type Coordinate = { latitude: number; longitude: number };
type Leg = { sequence: number; from: string; to: string; need_id?: number; distance_km: number; from_coordinate: Coordinate; to_coordinate: Coordinate };
type Quote = { rate_card_id: number; rate_code: string; rate_version: number; carrier_name: string; currency: string; components: Record<string, number>; total: number; carrier_score: number; rank: number; recommended: boolean; minimum_applied: boolean };
type RouteTrafficSegment = { start_index: number; end_index: number; speed: string; label: string; severity: "alta" | "media" | "baja" | "sin_lectura" };
type RouteIntelligenceRoute = { rank: number; distance_km: number | null; duration_minutes: number | null; static_duration_minutes: number | null; delay_minutes: number | null; traffic_level: "alto" | "medio" | "bajo" | "sin_lectura"; traffic_segments?: RouteTrafficSegment[]; pros?: string[]; cons?: string[]; issue_tags?: string[]; polyline: string | null };
type RouteIntelligence = { provider: "google_routes"; status: "configured" | "not_configured" | "unavailable" | "invalid_coordinates" | "invalid_key" | "quota_exceeded" | "empty"; traffic_available: boolean; routes: RouteIntelligenceRoute[]; message?: string };
type Plan = { generated_at: string; strategy: string; origin: Origin; ordered_need_ids: number[]; route: { legs: Leg[]; distance_km: number; road_factor: number }; totals: { weight_kg: number; volume_m3: number; pallets: number; stop_count: number; distance_km: number }; planned_duration_minutes: number; capacity: { vehicle_id?: number; plate?: string; feasible: boolean; weight_feasible: boolean; volume_feasible: boolean; weight_capacity_kg: number; volume_capacity_m3: number }; quotes: Quote[]; warnings: string[]; route_intelligence?: RouteIntelligence };
type Scenario = { id: string; strategy: string; strategyLabel: string; vehicle?: Vehicle; plan: Plan; quote?: Quote; cost: number | null; costPerKm: number | null; score: number; alerts: string[]; benefits: string[]; tradeoffs: string[]; recommended: boolean };

const STRATEGIES = [
  { value: "balanced", label: "Costo y servicio" },
  { value: "cost", label: "Menor costo" },
  { value: "service", label: "Mejor transportadora" },
  { value: "priority", label: "Prioridad contractual" },
];

const inputClass = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-apex";
const money = (value: number, currency = "COP") => new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const PlanningRouteMap = dynamic(() => import("@/components/transport/PlanningRouteMap"), {
  ssr: false,
  loading: () => <div className="grid h-[360px] place-items-center rounded-md border border-line bg-paper text-sm text-neutral-500">Cargando mapa vial...</div>,
});

export default function TransportPlanningPage() {
  const [workbench, setWorkbench] = useState<Workbench>({ pending_needs: 0, consolidation_groups: [] });
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const canWrite = hasStoredRolePermission("transport", "write");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workbenchData, originRows, vehicleRows] = await Promise.all([
        api<Workbench>("/api/v1/transport/planning/workbench"),
        api<Origin[]>("/api/v1/transport/origins"),
        api<Vehicle[]>("/api/v1/transport/vehicles"),
      ]);
      setWorkbench(workbenchData);
      setOrigins(originRows);
      setVehicles(vehicleRows);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible cargar el planeador.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!scenarios.length) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") closeScenarioMonitor(); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [scenarios.length]);

  const selectedSummary = selectedGroup ? `${selectedGroup.needs.length} entregas · ${selectedGroup.total_weight_kg.toLocaleString()} kg · ${selectedGroup.total_volume_m3.toLocaleString()} m³` : "Selecciona una consolidación para comenzar";
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) || scenarios.find((scenario) => scenario.recommended) || scenarios[0];

  function closeScenarioMonitor() {
    setScenarios([]);
    setSelectedScenarioId(null);
    setSelectedQuote(null);
  }

  async function evaluateScenarios(group?: Group) {
    const target = group || selectedGroup;
    if (!target) return;
    const originId = target.origin_id || target.origin?.id;
    if (!originId) {
      setError("La consolidación seleccionada no tiene origen válido para evaluar.");
      return;
    }
    setEvaluating(true);
    setError("");
    try {
      const vehicleCandidates = vehicles.length ? vehicles : [undefined];
      const requests = vehicleCandidates.flatMap((vehicle) => STRATEGIES.map(async (strategy) => {
        const plan = await api<Plan>("/api/v1/transport/planning/evaluate", {
          method: "POST",
          body: JSON.stringify({
            origin_id: originId,
            need_ids: target.need_ids,
            vehicle_id: vehicle?.id,
            strategy: strategy.value,
            service_level: target.service_level,
            return_to_origin: false,
          }),
        });
        return { vehicle, strategy, plan };
      }));
      const settled = await Promise.allSettled(requests);
      const planned = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (!planned.length) throw new Error("No fue posible calcular escenarios con la información disponible.");
      const shortest = Math.min(...planned.map(({ plan }) => plan.totals.distance_km || 1));
      const fastest = Math.min(...planned.map(({ plan }) => plan.planned_duration_minutes || 1));
      const costPerKmValues = planned.flatMap(({ plan }) => {
        const quote = plan.quotes.find((item) => item.recommended) || plan.quotes[0];
        return quote ? [quote.total / Math.max(plan.totals.distance_km, 1)] : [];
      });
      const bestCostPerKm = costPerKmValues.length ? Math.min(...costPerKmValues) : 1;
      const averageCostPerKm = costPerKmValues.length ? costPerKmValues.reduce((sum, value) => sum + value, 0) / costPerKmValues.length : 0;
      const nextScenarios = planned.map(({ vehicle, strategy, plan }) => buildScenario({ vehicle, strategy, plan, shortest, fastest, bestCostPerKm, averageCostPerKm }));
      const ordered = nextScenarios.sort((left, right) => left.score - right.score);
      const recommendedId = ordered[0]?.id;
      const finalScenarios = ordered.map((scenario) => ({ ...scenario, recommended: scenario.id === recommendedId }));
      setScenarios(finalScenarios);
      setSelectedScenarioId(recommendedId || null);
      setSelectedQuote(finalScenarios[0]?.quote?.rate_card_id || null);
      setMessage(`Se evaluaron ${finalScenarios.length} escenarios con vehículos, estrategias, costos, alertas y rutas comparables.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible evaluar los escenarios.");
    } finally {
      setEvaluating(false);
    }
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || !selectedScenario || !selectedQuote) return;
    const data = new FormData(event.currentTarget);
    setCommitting(true);
    try {
      const result = await api<{ trip: { id: number; code: string } }>("/api/v1/transport/planning/commit", {
        method: "POST",
        body: JSON.stringify({
          code: data.get("code"),
          origin_id: selectedScenario.plan.origin.id,
          need_ids: selectedGroup.need_ids,
          rate_card_id: selectedQuote,
          vehicle_id: selectedScenario.plan.capacity.vehicle_id || selectedScenario.vehicle?.id,
          strategy: selectedScenario.strategy,
          service_level: selectedGroup.service_level,
          planned_departure: data.get("planned_departure") || undefined,
          planned_arrival: data.get("planned_arrival") || undefined,
          return_to_origin: selectedScenario.plan.route.legs.some((leg) => !leg.need_id),
        }),
      });
      setMessage(`Viaje ${result.trip.code} creado con el escenario recomendado y trazabilidad completa.`);
      closeScenarioMonitor();
      setSelectedGroup(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible confirmar el plan.");
    } finally {
      setCommitting(false);
    }
  }

  return <div className="space-y-5">
    <header className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Decision logistica</p><h1 className="mt-1 text-3xl font-semibold">Planeador de transporte</h1><p className="mt-2 max-w-2xl text-sm text-neutral-600">Consolida demanda pendiente, evalúa escenarios por fila y confirma el viaje con rutas y costos comparables.</p></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ProcessStep icon={ClipboardList} title="1. Elige demanda" active={!selectedGroup} />
        <ProcessStep icon={Settings2} title="2. Evalúa escenarios" active={Boolean(selectedGroup && !scenarios.length)} />
        <ProcessStep icon={Calculator} title="3. Revisa y confirma" active={Boolean(scenarios.length)} />
      </div>
    </header>
    {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    <div className="space-y-4">
      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="text-apex" size={20} />
            <div><h2 className="font-semibold">Monitor de consolidaciones sugeridas</h2><p className="text-xs text-neutral-500">{workbench.pending_needs} necesidades pendientes · usa el botón de cada fila para evaluar</p></div>
          </div>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper disabled:opacity-50" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={15} />{loading ? "Actualizando..." : "Actualizar demanda"}</button>
        </div>
        <div className="max-h-[520px] overflow-auto p-3">
          <div className="min-w-[1080px] overflow-hidden rounded-md border border-line">
            <div className="grid grid-cols-[64px_1.5fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] gap-3 border-b border-line bg-paper px-3 py-2 text-xs font-semibold uppercase text-neutral-500">
              <span>#</span><span>Consolidación</span><span>Vence</span><span>Entregas</span><span>Peso</span><span>Volumen</span><span>Acción</span>
            </div>
          {workbench.consolidation_groups.map((group, index) => (
            <div className={`grid cursor-pointer grid-cols-[64px_1.5fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] items-center gap-3 border-b border-line px-3 py-3 text-left text-sm transition last:border-b-0 hover:bg-paper ${selectedGroup?.key === group.key ? "bg-emerald-50 text-apex" : "bg-white"}`} key={group.key} role="button" tabIndex={0} onClick={() => { setSelectedGroup(group); closeScenarioMonitor(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedGroup(group); closeScenarioMonitor(); } }}>
              <span className="grid h-8 w-8 place-items-center rounded-md bg-paper text-sm font-semibold text-apex">{index + 1}</span>
              <span><span className="block font-semibold text-neutral-900">{group.origin?.name || "Origen por completar"}</span><span className="mt-1 block text-xs text-neutral-600">{group.service_level}</span></span>
              <span>{new Date(`${group.due_date}T12:00:00`).toLocaleDateString()}</span>
              <span>{group.needs.length} entrega(s)</span>
              <span>{group.total_weight_kg.toLocaleString()} kg</span>
              <span>{group.total_volume_m3.toLocaleString()} m³</span>
              <span><button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-apex px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={!canWrite || evaluating} onClick={(event) => { event.stopPropagation(); setSelectedGroup(group); void evaluateScenarios(group); }} type="button"><Route size={14} />{evaluating && selectedGroup?.key === group.key ? "Evaluando..." : "Evaluar escenarios"}</button></span>
            </div>
          ))}
          </div>
          {!workbench.consolidation_groups.length ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-500">No hay demanda completa y pendiente para consolidar.</p> : null}
        </div>
      </section>
      <main className="space-y-4">
        <section className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Parámetros bloqueados del escenario</h2><p className="mt-1 text-xs text-neutral-500">{selectedSummary}</p></div></div>
          {selectedGroup ? <ScenarioWorkbench group={selectedGroup} origins={origins} vehicles={vehicles} /> : <EmptyPlannerState />}
        </section>
      </main>
    </div>
    {scenarios.length ? <PlanningModal onClose={closeScenarioMonitor}><PlanResult canWrite={canWrite} committing={committing} scenarios={scenarios} selectedQuote={selectedQuote} selectedScenarioId={selectedScenarioId} onSelectQuote={setSelectedQuote} onSelectScenario={(id) => { const next = scenarios.find((scenario) => scenario.id === id); setSelectedScenarioId(id); setSelectedQuote(next?.quote?.rate_card_id || null); }} onCommit={commit} /></PlanningModal> : null}
  </div>;
}

function buildScenario({ vehicle, strategy, plan, shortest, fastest, bestCostPerKm, averageCostPerKm }: { vehicle?: Vehicle; strategy: { value: string; label: string }; plan: Plan; shortest: number; fastest: number; bestCostPerKm: number; averageCostPerKm: number }): Scenario {
  const quote = plan.quotes.find((item) => item.recommended) || plan.quotes[0];
  const cost = quote?.total ?? null;
  const costPerKm = cost === null ? null : cost / Math.max(plan.totals.distance_km, 1);
  const alerts = [...plan.warnings.map((warning) => warning.replaceAll("_", " "))];
  const benefits: string[] = [];
  const tradeoffs: string[] = [];
  if (!plan.capacity.feasible) alerts.push("Capacidad excedida para este vehículo.");
  if (!quote) alerts.push("Sin tarifa contractual aplicable.");
  if (costPerKm !== null && averageCostPerKm && costPerKm > averageCostPerKm * 1.25) alerts.push("Costo por kilómetro por encima del promedio de alternativas.");
  if (plan.totals.distance_km > shortest * 1.2) tradeoffs.push("Ruta más larga que la alternativa más corta.");
  if (plan.planned_duration_minutes > fastest * 1.25) tradeoffs.push("Duración mayor frente al escenario más rápido.");
  const routeIntel = plan.route_intelligence;
  const googleRoute = routeIntel?.routes?.[0];
  if (routeIntel?.status === "configured" && googleRoute) {
    benefits.push(`Google Routes disponible: ETA ${googleRoute.duration_minutes || plan.planned_duration_minutes} min y tráfico ${trafficLabelFromIntel(googleRoute.traffic_level)}.`);
    if (googleRoute.delay_minutes && googleRoute.delay_minutes >= 10) alerts.push(`Demora por tráfico aproximada de ${googleRoute.delay_minutes} min.`);
  } else if (routeIntel?.status === "not_configured") {
    tradeoffs.push("Tráfico Google pendiente de configurar en backend.");
  } else if (routeIntel?.status === "invalid_key") {
    tradeoffs.push("Clave Google Routes rechazada; revisa habilitación de la API y restricciones de la clave.");
  } else if (routeIntel?.status === "quota_exceeded") {
    tradeoffs.push("Cuota de Google Routes agotada; revisa límites o presupuesto de la clave.");
  } else if (routeIntel?.status === "unavailable") {
    tradeoffs.push("Google Routes no respondió; se usa respaldo vial disponible.");
  }
  if (plan.capacity.feasible) benefits.push("Capacidad viable para peso y volumen.");
  if (quote) benefits.push(`Costo contractual disponible con ${quote.carrier_name}.`);
  if (plan.totals.distance_km <= shortest * 1.08) benefits.push("Ruta competitiva por distancia.");
  if (plan.planned_duration_minutes <= fastest * 1.08) benefits.push("Tiempo competitivo frente a las demás opciones.");
  const score = (costPerKm ?? bestCostPerKm * 4) / Math.max(bestCostPerKm, 1) + plan.totals.distance_km / Math.max(shortest, 1) + plan.planned_duration_minutes / Math.max(fastest, 1) + (plan.capacity.feasible ? 0 : 20) + (quote ? 0 : 15) + alerts.length * 0.35;
  return {
    id: `${strategy.value}-${vehicle?.id || "free"}-${plan.totals.distance_km}-${plan.planned_duration_minutes}`,
    strategy: strategy.value,
    strategyLabel: strategy.label,
    vehicle,
    plan,
    quote,
    cost,
    costPerKm,
    score,
    alerts,
    benefits,
    tradeoffs,
    recommended: false,
  };
}

function PlanningModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<div className="fixed bottom-0 left-0 right-0 top-0 z-[9999] grid place-items-center overflow-y-auto bg-black/55 p-3 md:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label="Monitor de escenarios logísticos" aria-modal="true" className="transport-planning-modal max-h-[calc(100dvh-1.5rem)] w-full overflow-hidden rounded-md border border-line bg-[#ffffff] text-[#17232d] shadow-xl md:max-h-[calc(100dvh-3rem)] md:max-w-7xl [&_.bg-paper]:!bg-[#f5f7f5] [&_.bg-white]:!bg-[#ffffff] [&_.text-neutral-500]:!text-[#66746f] [&_.text-neutral-600]:!text-[#4d5b57]" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-[#ffffff] px-4 py-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Revisión antes de crear viaje</p><h2 className="text-lg font-semibold">Monitor de escenarios logísticos</h2></div>
          <button aria-label="Cerrar evaluación" className="grid h-10 w-10 place-items-center rounded-md border border-line hover:bg-[#f5f7f5]" onClick={onClose} type="button"><X size={18} /></button>
        </header>
        <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto p-4">{children}</div>
      </section>
  </div>, document.body);
}

function ProcessStep({ icon: Icon, title, active }: { icon: typeof ClipboardList; title: string; active: boolean }) {
  return <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${active ? "border-apex bg-emerald-50 text-apex" : "border-line bg-paper text-neutral-500"}`}><Icon size={14} />{title}</span>;
}

function EmptyPlannerState() {
  return <div className="mt-4 rounded-md border border-dashed border-line p-4"><p className="font-semibold">Selecciona una consolidación</p><p className="mt-1 text-sm text-neutral-600">Elige una fila del monitor para revisar sus parámetros o usa su botón Evaluar escenarios para abrir el monitor directamente.</p></div>;
}

function ScenarioWorkbench({ group, origins, vehicles }: { group: Group; origins: Origin[]; vehicles: Vehicle[] }) {
  const origin = origins.find((item) => item.id === (group.origin_id || group.origin?.id)) || group.origin;
  return <div className="mt-4 grid gap-2 md:grid-cols-4">
    <ReadOnlyParam label="Origen" value={origin ? `${origin.code} · ${origin.name}` : "Origen pendiente"} />
    <ReadOnlyParam label="Vehículos" value={`${Math.max(vehicles.length, 1)} alternativa(s)`} />
    <ReadOnlyParam label="Estrategias" value={`${STRATEGIES.length} estrategias`} />
    <ReadOnlyParam label="Retorno" value="Alternativa operativa" />
  </div>;
}

function ReadOnlyParam({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-paper px-3 py-2"><p className="text-[11px] font-semibold uppercase text-neutral-500">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>;
}

function PlanResult({ scenarios, selectedScenarioId, selectedQuote, onSelectQuote, onSelectScenario, onCommit, canWrite, committing }: { scenarios: Scenario[]; selectedScenarioId: string | null; selectedQuote: number | null; onSelectQuote: (id: number) => void; onSelectScenario: (id: string) => void; onCommit: (event: FormEvent<HTMLFormElement>) => void; canWrite: boolean; committing: boolean }) {
  const vehicleKeys = Array.from(new Map(scenarios.map((scenario) => [vehicleKey(scenario), scenario])).values());
  const recommended = scenarios.find((scenario) => scenario.recommended) || scenarios[0];
  const [activeVehicleKey, setActiveVehicleKey] = useState(() => vehicleKey(recommended));
  const visibleScenarios = scenarios.filter((scenario) => vehicleKey(scenario) === activeVehicleKey);
  const selected = visibleScenarios.find((scenario) => scenario.id === selectedScenarioId) || visibleScenarios.find((scenario) => scenario.recommended) || visibleScenarios[0] || recommended;
  if (!selected) return null;
  return <div className="space-y-4">
    <section className="grid gap-3 xl:grid-cols-[1fr_340px]">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-apex">Ruta sugerida</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-2xl font-semibold">{recommended.strategyLabel} · {recommended.vehicle?.plate || recommended.plan.capacity.plate || "Sin vehículo preasignado"}</h3><p className="mt-1 text-sm text-neutral-600">Mejor balance entre costo, tiempo estimado, distancia, capacidad y alertas. La recomendación se recalcula con todos los escenarios disponibles.</p></div>
          <span className="rounded-md bg-apex px-3 py-2 text-sm font-semibold text-white">Recomendada</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-white p-3 text-center">
        <MetricCompact label="Escenarios" value={`${scenarios.length}`} />
        <MetricCompact label="Con tarifa" value={`${scenarios.filter((scenario) => scenario.quote).length}`} />
        <MetricCompact label="Alertas" value={`${scenarios.reduce((sum, scenario) => sum + scenario.alerts.length, 0)}`} />
      </div>
    </section>
    <RouteProviderNotice scenarios={visibleScenarios} />
    <RouteMap scenarios={visibleScenarios} selectedScenarioId={selected.id} onSelectScenario={onSelectScenario} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Distancia" value={`${selected.plan.totals.distance_km} km`} /><Metric label="ETA estimada" value={`${Math.floor(selected.plan.planned_duration_minutes / 60)}h ${selected.plan.planned_duration_minutes % 60}m`} /><Metric label="Costo" value={selected.cost === null ? "Sin tarifa" : money(selected.cost, selected.quote?.currency)} /><Metric label="Costo/km" value={selected.costPerKm === null ? "Sin tarifa" : money(selected.costPerKm, selected.quote?.currency)} /><Metric label="Tráfico" value={trafficLabel(selected)} good={trafficLabel(selected) === "Bajo"} /></div>
    <section className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold">Selecciona vehículo y compara 4 estrategias</h3><p className="mt-1 text-xs text-neutral-500">El mapa recalcula la lectura visual con el vehículo activo; cada tarjeta representa una estrategia operativa.</p></div>
        <div className="flex flex-wrap gap-2">{vehicleKeys.map((scenario) => <button className={`rounded-md border px-3 py-2 text-sm font-semibold ${vehicleKey(scenario) === activeVehicleKey ? "border-apex bg-emerald-50 text-apex" : "border-line bg-white"}`} key={vehicleKey(scenario)} onClick={() => { setActiveVehicleKey(vehicleKey(scenario)); onSelectScenario(scenarios.find((item) => vehicleKey(item) === vehicleKey(scenario) && item.recommended)?.id || scenarios.find((item) => vehicleKey(item) === vehicleKey(scenario))?.id || scenario.id); }} type="button">{scenario.vehicle?.plate || scenario.plan.capacity.plate || "Sin vehículo"}</button>)}</div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {visibleScenarios.map((scenario, index) => <ScenarioCard index={index + 1} key={scenario.id} scenario={scenario} selected={scenario.id === selected.id} onSelect={() => { onSelectScenario(scenario.id); if (scenario.quote) onSelectQuote(scenario.quote.rate_card_id); }} />)}
      </div>
    </section>
    <section className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-2">
      <div><h3 className="font-semibold">Lectura rápida</h3><p className="mt-1 text-sm text-neutral-600">{selected.benefits[0] || "Escenario disponible para comparación."}</p>{selected.alerts[0] ? <p className="mt-1 text-sm text-amber-700">{selected.alerts[0]}</p> : null}</div>
      <div><h3 className="font-semibold">Tarifa</h3><p className="mt-1 text-sm text-neutral-600">{selected.quote ? `${selected.quote.carrier_name} · ${money(selected.quote.total, selected.quote.currency)}` : "Sin tarifa activa para este escenario."}</p></div>
    </section>
    {selected.plan.quotes.length ? <form className="grid gap-3 rounded-md border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onCommit}><div className="lg:col-span-4"><h3 className="font-semibold">Confirmar selección</h3><p className="text-xs text-neutral-500">Solo se crea el viaje del escenario seleccionado. Las demás opciones quedan como soporte de decisión visual.</p></div><Field name="code" label="Código de viaje" defaultValue={`VJ-${Date.now().toString().slice(-8)}`} required /><Field name="planned_departure" label="Salida planificada" type="datetime-local" /><Field name="planned_arrival" label="Llegada objetivo" type="datetime-local" /><label className="text-sm"><span className="mb-1 block font-medium">Tarifa seleccionada</span><input className={inputClass} readOnly value={selected.plan.quotes.find((quote) => quote.rate_card_id === selectedQuote)?.rate_code || selected.quote?.rate_code || ""} /></label><div className="flex justify-end lg:col-span-4"><button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={!canWrite || committing || !selectedQuote || !selected.plan.capacity.feasible}><Truck size={17} />{committing ? "Creando viaje..." : "Confirmar escenario y crear viaje"}</button></div></form> : null}
  </div>;
}

function ScenarioCard({ scenario, selected, onSelect, index }: { scenario: Scenario; selected: boolean; onSelect: () => void; index: number }) {
  return <button className={`w-full rounded-md border p-3 text-left ${selected ? "border-apex bg-emerald-50" : "border-line bg-white"}`} onClick={onSelect} type="button">
    <div className="flex items-start gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-bold ${scenario.recommended ? "bg-apex text-white" : "bg-paper text-apex"}`}>{index}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{scenario.strategyLabel}</p><p className="text-xs text-neutral-500">{scenario.vehicle?.plate || scenario.plan.capacity.plate || "Sin vehículo"} · {scenario.plan.capacity.feasible ? "viable" : "excedida"}</p></div>{scenario.recommended ? <span className="rounded-md bg-apex px-2 py-1 text-xs font-semibold text-white">Mejor</span> : null}</div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span><strong className="block text-sm">{scenario.cost === null ? "Sin tarifa" : money(scenario.cost, scenario.quote?.currency)}</strong>costo</span><span><strong className="block text-sm">{scenario.plan.totals.distance_km} km</strong>ruta</span><span><strong className="block text-sm">{trafficLabel(scenario)}</strong>tráfico</span></div>
    {scenario.alerts.length ? <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle className="mr-1 inline" size={14} />{scenario.alerts[0]}{scenario.alerts.length > 1 ? ` +${scenario.alerts.length - 1}` : ""}</p> : <p className="mt-3 rounded-md bg-emerald-50 p-2 text-xs text-apex">Sin alertas críticas.</p>}</div></div>
  </button>;
}

function vehicleKey(scenario: Scenario) {
  return String(scenario.vehicle?.id || scenario.plan.capacity.vehicle_id || scenario.vehicle?.plate || scenario.plan.capacity.plate || "free");
}

function RouteMap({ scenarios, selectedScenarioId, onSelectScenario }: { scenarios: Scenario[]; selectedScenarioId: string; onSelectScenario: (id: string) => void }) {
  const mapScenarios = useMemo<PlanningMapScenario[]>(() => scenarios.map((scenario) => ({
    id: scenario.id,
    name: `${scenario.strategyLabel} · ${scenario.vehicle?.plate || scenario.plan.capacity.plate || "Sin vehículo"}`,
    stops: stopsFromPlan(scenario.plan),
    distance_km: scenario.plan.totals.distance_km,
    duration_min: scenario.plan.planned_duration_minutes,
    recommended: scenario.recommended,
    alerts: scenario.alerts,
    benefits: scenario.benefits,
    tradeoffs: scenario.tradeoffs,
    route_variants: scenario.plan.route_intelligence?.routes?.map((route) => ({
      id: `${scenario.id}-route-${route.rank}`,
      label: route.rank === 1 ? "Ruta recomendada" : `Ruta alterna ${route.rank}`,
      polyline: route.polyline,
      distance_km: route.distance_km,
      duration_min: route.duration_minutes,
      delay_min: route.delay_minutes,
      traffic_level: route.traffic_level,
      traffic_segments: route.traffic_segments || [],
      pros: route.pros || [],
      cons: route.cons || [],
      issue_tags: route.issue_tags || [],
    })).filter((route) => Boolean(route.polyline)) || [],
  })), [scenarios]);
  return <PlanningRouteMap scenarios={mapScenarios} selectedId={selectedScenarioId} onSelect={onSelectScenario} />;
}

function stopsFromPlan(plan: Plan): PlanningRouteStop[] {
  return plan.route.legs.length
    ? [
        { kind: "origin", label: plan.route.legs[0].from, latitude: plan.route.legs[0].from_coordinate.latitude, longitude: plan.route.legs[0].from_coordinate.longitude },
        ...plan.route.legs.map((leg) => ({ kind: "stop" as const, label: leg.to, latitude: leg.to_coordinate.latitude, longitude: leg.to_coordinate.longitude })),
      ]
    : [{ kind: "origin", label: plan.origin.name, latitude: plan.origin.latitude, longitude: plan.origin.longitude }];
}

function trafficLabel(scenario: Scenario) {
  const routeTraffic = scenario.plan.route_intelligence?.routes?.[0]?.traffic_level;
  if (routeTraffic && routeTraffic !== "sin_lectura") return trafficLabelFromIntel(routeTraffic);
  const minutesPerKm = scenario.plan.planned_duration_minutes / Math.max(scenario.plan.totals.distance_km, 1);
  if (minutesPerKm >= 5) return "Alto";
  if (minutesPerKm >= 3.2) return "Medio";
  return "Bajo";
}

function trafficLabelFromIntel(value?: RouteIntelligenceRoute["traffic_level"]) {
  if (value === "alto") return "Alto";
  if (value === "medio") return "Medio";
  if (value === "bajo") return "Bajo";
  return "Sin lectura";
}

function RouteProviderNotice({ scenarios }: { scenarios: Scenario[] }) {
  const intel = scenarios.find((scenario) => scenario.plan.route_intelligence?.status === "configured")?.plan.route_intelligence || scenarios[0]?.plan.route_intelligence;
  const [probe, setProbe] = useState<{ status: string; message: string } | null>(null);
  const [probing, setProbing] = useState(false);
  const runProbe = useCallback(async () => {
    setProbing(true);
    setProbe(null);
    try {
      const payload = await api<{ probe?: { status: string; message: string } }>(`/api/v1/transport/route-intelligence/status?probe=1&_=${Date.now()}`);
      setProbe(payload.probe || { status: "unavailable", message: "La API no devolvió resultado de la prueba de conexión." });
    } catch (error) {
      const status = (error as { status?: number }).status;
      const detail = error instanceof Error ? error.message : "Error desconocido al validar la conexión.";
      const hint = status === 404 ? " La API local no reconoce el endpoint de diagnóstico: reinicia el proceso de la API para cargar la versión con Google Routes." : status === 403 ? " Tu usuario necesita permiso de lectura del módulo Transporte." : "";
      setProbe({ status: "unavailable", message: `${detail}.${hint}` });
    } finally {
      setProbing(false);
    }
  }, []);
  if (!intel) return null;
  return <section className="rounded-md border border-line bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">Conexión de rutas y tráfico</h3>
        {intel.status === "configured"
          ? <p className="mt-1 text-xs text-emerald-800">Google Routes conectado desde backend: el mapa usa rutas alternas y lectura de tráfico cuando el proveedor entrega esa información.</p>
          : <p className="mt-1 text-xs text-amber-900">{intel.message || "Google Routes no está disponible; el monitor conserva OSRM como respaldo operativo."}</p>}
      </div>
      <button className="rounded-md border border-apex px-3 py-1.5 text-xs font-semibold text-apex disabled:opacity-60" disabled={probing} onClick={() => void runProbe()} type="button">{probing ? "Validando..." : "Validar conexión"}</button>
    </div>
    {probe ? <p className={`mt-3 rounded-md border p-3 text-xs ${probe.status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><strong className="mr-1">{probe.status === "ok" ? "Conexión verificada:" : "Resultado de la prueba:"}</strong>{probe.message}</p> : null}
  </section>;
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="rounded-md border border-line bg-white p-3"><p className="text-xs text-neutral-500">{label}</p><p className={`mt-2 font-semibold ${good === false ? "text-rose-700" : good ? "text-emerald-700" : ""}`}>{value}</p></div>; }
function MetricCompact({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>; }
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><input className={inputClass} {...input} /></label>; }
