"use client";

import { api } from "@/lib/api";
import { decodeGooglePolyline } from "@/components/transport/PlanningRouteMap";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import { Fuel, Gauge, MapPin, Plus, RefreshCw, Route, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RateCostSimStop = { id: string; label: string; latitude: number | null; longitude: number | null };

export type RateCostDraft = {
  code: string; currency: string;
  base_rate: string; minimum_charge: string; price_per_km: string; price_per_kg: string;
  price_per_m3: string; price_per_stop: string; fuel_surcharge_pct: string; tolls_flat: string;
  tariff_method: "fijo" | "por_km" | "por_carga"; load_unit: "kg" | "m3";
  stops_included: string; wait_included_min: string; wait_rate_per_min: string;
  load_unload_flat: string; other_costs_amount: string; other_costs_label: string;
  fuel_mode: "surcharge" | "estimated"; fuel_estimated_cost: string;
  billable_km: string; km_source: "" | "google" | "estimate" | "manual";
  preview_load: string; preview_wait_min: string;
  fuel_kind: "gasolina" | "acpm"; fuel_rendimiento: string; fuel_precio_litro: string; fuel_extra_pct: string;
  sim_round_trip: boolean; sim_stops: RateCostSimStop[];
  sim_origin_kind: "sede" | "custom"; sim_origin_sede_id: string; sim_origin_label: string;
  sim_origin_lat: number | null; sim_origin_lng: number | null;
  sim_destination_label: string; sim_destination_lat: number | null; sim_destination_lng: number | null;
  sim_manual_km: boolean; sim_distance_km: string; sim_duration_min: string; sim_polyline: string | null; sim_source: "" | "google" | "estimate";
};

export type SedeOption = { id: number; code: string; name: string; address?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null };

type PlaceSuggestion = { label: string; latitude: number; longitude: number; source: "sede" | "punto_entrega" | "google"; detail?: string };
type PlacesResponse = { places: PlaceSuggestion[]; google_configured: boolean; message?: string };
type RouteSimulation = {
  distance_km: number; duration_minutes: number; source: "google" | "estimate"; polyline: string | null;
  traffic_level?: string; message?: string;
  origin?: { latitude: number; longitude: number; label?: string }; destination?: { latitude: number; longitude: number; label?: string };
};

const num = (value: string) => Math.max(0, Number(value || 0));
const money = (value: number, currency = "COP") => new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));

const inputClass = "h-9 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-apex";

const TARIFF_METHODS = [
  { id: "fijo", label: "Valor fijo", desc: "Un cargo base único por servicio." },
  { id: "por_km", label: "Por kilómetro", desc: "El costo se arma con la distancia recorrida." },
  { id: "por_carga", label: "Por carga", desc: "Se cobra por peso o volumen transportado." },
] as const;

export function RateCostDesigner({ draft, onChange, sedes }: { draft: RateCostDraft; onChange: (patch: Partial<RateCostDraft>) => void; sedes: SedeOption[] }) {
  const currency = draft.currency || "COP";

  const setStopsEnabled = (enabled: boolean) => onChange(enabled
    ? { stops_included: draft.stops_included || "0" }
    : { stops_included: "", price_per_stop: "" });
  const stopsEnabled = num(draft.price_per_stop) > 0 || draft.stops_included !== "";
  const waitEnabled = draft.wait_included_min !== "" || num(draft.wait_rate_per_min) > 0;
  const tollsEnabled = draft.tolls_flat !== "";
  const loadUnloadEnabled = draft.load_unload_flat !== "";
  const otherEnabled = draft.other_costs_amount !== "" || draft.other_costs_label.trim() !== "";

  const stopsCount = draft.sim_stops.length + 1;
  const extraStops = Math.max(0, stopsCount - num(draft.stops_included));

  const calculation = useMemo(() => {
    const km = num(draft.billable_km);
    const base = num(draft.base_rate);
    const distance = num(draft.price_per_km) * km;
    const loadQty = num(draft.preview_load);
    const load = (draft.load_unit === "m3" ? num(draft.price_per_m3) : num(draft.price_per_kg)) * loadQty;
    const stops = num(draft.price_per_stop) * extraStops;
    const tolls = num(draft.tolls_flat);
    const waitQty = Math.max(0, num(draft.preview_wait_min) - num(draft.wait_included_min));
    const wait = num(draft.wait_rate_per_min) * waitQty;
    const loadUnload = num(draft.load_unload_flat);
    const other = num(draft.other_costs_amount);
    const lines = [
      { label: draft.tariff_method === "fijo" ? "Valor fijo" : "Cargo base", value: base, show: base > 0 },
      { label: `${km} km × ${money(num(draft.price_per_km), currency)}`, value: distance, show: distance > 0 },
      { label: `${loadQty} ${draft.load_unit === "m3" ? "m³" : "kg"} × ${money(draft.load_unit === "m3" ? num(draft.price_per_m3) : num(draft.price_per_kg), currency)}`, value: load, show: load > 0 },
      { label: `${stopsCount} paradas − ${num(draft.stops_included)} incl. = ${extraStops} extra × ${money(num(draft.price_per_stop), currency)}`, value: stops, show: stops > 0 },
      { label: "Peajes", value: tolls, show: tolls > 0 },
      { label: `Espera ${waitQty} min × ${money(num(draft.wait_rate_per_min), currency)}`, value: wait, show: wait > 0 },
      { label: "Cargue y descargue", value: loadUnload, show: loadUnload > 0 },
      { label: draft.other_costs_label.trim() || "Otros costos", value: other, show: other > 0 },
    ].filter((line) => line.show);
    const subtotal = base + distance + load + stops + tolls + wait + loadUnload + other;
    const fuel = draft.fuel_mode === "estimated" ? num(draft.fuel_estimated_cost) : (subtotal * num(draft.fuel_surcharge_pct)) / 100;
    const minimum = num(draft.minimum_charge);
    const total = Math.max(subtotal + fuel, minimum);
    return { lines, subtotal, fuel, minimum, total, minimumApplied: minimum > subtotal + fuel };
  }, [draft, extraStops, stopsCount, currency]);

  const fuelCalc = useMemo(() => {
    const km = num(draft.billable_km);
    const rendimiento = num(draft.fuel_rendimiento);
    const precio = num(draft.fuel_precio_litro);
    if (rendimiento <= 0 || precio <= 0 || km <= 0) return null;
    const litros = km / rendimiento;
    const ajustado = litros * (1 + num(draft.fuel_extra_pct) / 100);
    return { litros, ajustado, costo: Math.round(ajustado * precio) };
  }, [draft.billable_km, draft.fuel_rendimiento, draft.fuel_precio_litro, draft.fuel_extra_pct]);

  function applyEstimatedFuel(costo: number) {
    const hasSurcharge = num(draft.fuel_surcharge_pct) > 0;
    if (hasSurcharge && !window.confirm(`El recargo porcentual de combustible (${draft.fuel_surcharge_pct}%) se pondrá en 0 para no cobrar combustible dos veces. ¿Usar el costo estimado de ${money(costo, currency)}?`)) return;
    onChange({ fuel_mode: "estimated", fuel_estimated_cost: String(costo), fuel_surcharge_pct: "0" });
  }

  return <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)_280px]">
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-3">
        <SectionTitle index="1" title="Tarifa principal" />
        <div className="space-y-2">
          {TARIFF_METHODS.map((method) => <button
            aria-pressed={draft.tariff_method === method.id}
            className={`w-full rounded-lg border p-2.5 text-left transition-colors ${draft.tariff_method === method.id ? "border-apex bg-apex/10" : "border-line hover:border-apex/50"}`}
            key={method.id}
            onClick={() => onChange({ tariff_method: method.id })}
            type="button"
          >
            <span className={`block text-sm font-semibold ${draft.tariff_method === method.id ? "text-apex" : "text-content-strong"}`}>{method.label}</span>
            <span className="block text-xs text-content-muted">{method.desc}</span>
          </button>)}
        </div>
        <div className="mt-3 space-y-3">
          <NumField label={draft.tariff_method === "fijo" ? "Valor del servicio" : "Cargo base"} hint={draft.tariff_method === "fijo" ? "Valor fijo que se cobra en cada servicio." : "Valor inicial antes de los kilómetros (opcional)."} unit={currency} name="base_rate" value={draft.base_rate} onChange={(value) => onChange({ base_rate: value })} />
          {draft.tariff_method === "por_km" ? <NumField label="Precio por kilómetro" hint="Se multiplica por la distancia facturable del recorrido." unit={`${currency} / km`} name="price_per_km" value={draft.price_per_km} onChange={(value) => onChange({ price_per_km: value })} /> : null}
          {draft.tariff_method === "por_carga" ? <div className="space-y-3">
            <div>
              <span className="mb-1 block text-sm font-semibold">Unidad de cobro</span>
              <div className="grid grid-cols-2 gap-2">
                {([["kg", "Kilogramo"], ["m3", "Volumen (m³)"]] as const).map(([unit, label]) => <button
                  aria-pressed={draft.load_unit === unit}
                  className={`rounded-md border px-2 py-1.5 text-sm font-semibold ${draft.load_unit === unit ? "border-apex bg-apex/10 text-apex" : "border-line text-content-muted"}`}
                  key={unit}
                  onClick={() => onChange({ load_unit: unit })}
                  type="button"
                >{label}</button>)}
              </div>
            </div>
            <NumField label={draft.load_unit === "m3" ? "Precio por m³" : "Precio por kilogramo"} hint="Se multiplica por la carga facturable." unit={`${currency} / ${draft.load_unit === "m3" ? "m³" : "kg"}`} name="load_price" value={draft.load_unit === "m3" ? draft.price_per_m3 : draft.price_per_kg} onChange={(value) => onChange(draft.load_unit === "m3" ? { price_per_m3: value } : { price_per_kg: value })} />
            <NumField label="Carga de referencia (solo simulación)" hint="Permite visualizar el total; no se guarda en la tarifa." unit={draft.load_unit === "m3" ? "m³" : "kg"} name="preview_load" value={draft.preview_load} onChange={(value) => onChange({ preview_load: value })} />
          </div> : null}
          <NumField label="Cobro mínimo" hint="Piso garantizado: si el cálculo da menos, se cobra esto." unit={currency} name="minimum_charge" value={draft.minimum_charge} onChange={(value) => onChange({ minimum_charge: value })} />
          {draft.fuel_mode === "surcharge"
            ? <NumField label="Recargo por combustible" hint="Porcentaje que se suma sobre el subtotal. El simulador puede estimar un costo fijo en su lugar." unit="%" name="fuel_surcharge_pct" value={draft.fuel_surcharge_pct} onChange={(value) => onChange({ fuel_surcharge_pct: value })} />
            : <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">Recargo porcentual desactivado: la tarifa usa el costo estimado de combustible del simulador.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-3">
        <SectionTitle index="2" title="Costos adicionales" />
        <div className="space-y-3">
          <ToggleBlock
            enabled={stopsEnabled}
            label="Paradas adicionales"
            onToggle={setStopsEnabled}
          >
            <NumField label="Paradas incluidas" hint="Entregas cubiertas sin costo extra." unit="paradas" name="stops_included" value={draft.stops_included} onChange={(value) => onChange({ stops_included: value })} />
            <NumField label="Valor por parada extra" hint="Se cobra solo por las entregas que exceden las incluidas." unit={`${currency} / parada`} name="price_per_stop" value={draft.price_per_stop} onChange={(value) => onChange({ price_per_stop: value })} />
          </ToggleBlock>
          <ToggleBlock enabled={tollsEnabled} label="Peajes" onToggle={(enabled) => onChange({ tolls_flat: enabled ? draft.tolls_flat || "" : "" })}>
            <NumField label="Valor estimado de peajes" hint="Costo plano por recorrido." unit={currency} name="tolls_flat" value={draft.tolls_flat} onChange={(value) => onChange({ tolls_flat: value })} />
          </ToggleBlock>
          <ToggleBlock
            enabled={waitEnabled}
            label="Tiempo de espera"
            onToggle={(enabled) => onChange(enabled ? { wait_included_min: draft.wait_included_min || "30", wait_rate_per_min: draft.wait_rate_per_min } : { wait_included_min: "", wait_rate_per_min: "", preview_wait_min: "30" })}
          >
            <NumField label="Minutos incluidos" hint="Tiempo de espera cubierto sin costo." unit="min" name="wait_included_min" value={draft.wait_included_min} onChange={(value) => onChange({ wait_included_min: value })} />
            <NumField label="Valor por minuto extra" hint="Se cobra solo el excedente sobre los incluidos." unit={`${currency} / min`} name="wait_rate_per_min" value={draft.wait_rate_per_min} onChange={(value) => onChange({ wait_rate_per_min: value })} />
            <NumField label="Espera estimada (solo simulación)" hint="Permite visualizar el total; no se guarda en la tarifa." unit="min" name="preview_wait_min" value={draft.preview_wait_min} onChange={(value) => onChange({ preview_wait_min: value })} />
          </ToggleBlock>
          <ToggleBlock enabled={loadUnloadEnabled} label="Cargue y descargue" onToggle={(enabled) => onChange({ load_unload_flat: enabled ? draft.load_unload_flat : "" })}>
            <NumField label="Valor por cargue y descargue" hint="Mano de obra de patios o muelles." unit={currency} name="load_unload_flat" value={draft.load_unload_flat} onChange={(value) => onChange({ load_unload_flat: value })} />
          </ToggleBlock>
          <ToggleBlock enabled={otherEnabled} label="Otros costos" onToggle={(enabled) => onChange(enabled ? { other_costs_amount: draft.other_costs_amount } : { other_costs_amount: "", other_costs_label: "" })}>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Concepto</span>
              <input className={inputClass} maxLength={60} name="other_costs_label" onChange={(event) => onChange({ other_costs_label: event.target.value })} placeholder="Ej: Lavado de vehículo" value={draft.other_costs_label} />
            </label>
            <NumField label="Valor" hint="Costo plano adicional por servicio." unit={currency} name="other_costs_amount" value={draft.other_costs_amount} onChange={(value) => onChange({ other_costs_amount: value })} />
          </ToggleBlock>
        </div>
      </section>
    </div>

    <div className="space-y-4">
      <RouteSimulator draft={draft} onChange={onChange} sedes={sedes} />
      <section className="rounded-xl border border-line bg-surface p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-apex"><Fuel size={13} /> Consumo estimado del vehículo</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {([["gasolina", "Gasolina"], ["acpm", "ACPM"]] as const).map(([kind, label]) => <button
            aria-pressed={draft.fuel_kind === kind}
            className={`rounded-md border px-2 py-1.5 text-sm font-semibold ${draft.fuel_kind === kind ? "border-apex bg-apex/10 text-apex" : "border-line text-content-muted"}`}
            key={kind}
            onClick={() => onChange({ fuel_kind: kind })}
            type="button"
          >{label}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Rendimiento" hint="Kilómetros por litro." unit="km / L" name="fuel_rendimiento" value={draft.fuel_rendimiento} onChange={(value) => onChange({ fuel_rendimiento: value })} />
          <NumField label="Precio por litro" hint={`Precio actual del ${draft.fuel_kind === "acpm" ? "ACPM" : "galón/gasolina"} en ${currency}.`} unit={`${currency} / L`} name="fuel_precio_litro" value={draft.fuel_precio_litro} onChange={(value) => onChange({ fuel_precio_litro: value })} />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold">Consumo extra por tráfico/carga</span>
            <span className="tabular-nums text-content-muted">{num(draft.fuel_extra_pct)}%</span>
          </div>
          <input aria-label="Consumo extra porcentual" className="w-full accent-apex" max="50" min="0" onChange={(event) => onChange({ fuel_extra_pct: event.target.value })} type="range" value={draft.fuel_extra_pct} />
        </div>
        {fuelCalc ? <div className="mt-3 rounded-lg bg-surface-muted p-2.5 text-xs leading-relaxed text-content-muted">
          <p className="flex justify-between gap-3"><span>Distancia facturable</span><span className="tabular-nums">{num(draft.billable_km)} km</span></p>
          <p className="flex justify-between gap-3"><span>Litros necesarios ({num(draft.billable_km)} km ÷ {num(draft.fuel_rendimiento)} km/L)</span><span className="tabular-nums">{fuelCalc.litros.toFixed(1)} L</span></p>
          <p className="flex justify-between gap-3"><span>Ajustado +{num(draft.fuel_extra_pct)}%</span><span className="tabular-nums">{fuelCalc.ajustado.toFixed(1)} L</span></p>
          <p className="flex justify-between gap-3 text-sm font-bold text-content-strong"><span>Costo estimado de {draft.fuel_kind === "acpm" ? "ACPM" : "gasolina"}</span><span className="tabular-nums">{money(fuelCalc.costo, currency)}</span></p>
        </div> : <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">Simula la ruta (o escribe la distancia) y completa rendimiento y precio por litro para estimar el combustible.</p>}
        {fuelCalc ? <button
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={draft.fuel_mode === "estimated" && num(draft.fuel_estimated_cost) === fuelCalc.costo}
          onClick={() => applyEstimatedFuel(fuelCalc.costo)}
          type="button"
        >Usar este costo en la tarifa</button> : null}
        {draft.fuel_mode === "estimated" ? <button
          className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-md border border-line px-3 text-xs font-semibold"
          onClick={() => onChange({ fuel_mode: "surcharge", fuel_estimated_cost: "" })}
          type="button"
        >Volver a recargo porcentual</button> : null}
      </section>
    </div>

    <div className="space-y-3">
      <section className="rounded-xl bg-[#0f1c33] p-3 text-[#dbe6ff]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8fb4ff]">Resumen del cálculo</p>
        <p className="mb-2 truncate text-sm font-semibold text-[#e8efff]">{draft.code || "Tarifa sin código"}</p>
        <div className="space-y-1 text-xs">
          {calculation.lines.length ? calculation.lines.map((line) => <div className="flex items-start justify-between gap-3" key={line.label}><span>{line.label}</span><span className="tabular-nums">{money(line.value, currency)}</span></div>) : <p className="text-[#8fb4ff]">Sin componentes todavía: elige un método y activa los costos que apliquen.</p>}
          <div className="flex justify-between gap-3 border-t border-[#2c3d63] pt-1"><span>Subtotal</span><span className="tabular-nums">{money(calculation.subtotal, currency)}</span></div>
          {calculation.fuel > 0 ? <div className="flex justify-between gap-3"><span>{draft.fuel_mode === "estimated" ? "Combustible estimado (recargo % en 0)" : `Recargo de combustible ${draft.fuel_surcharge_pct || "0"}%`}</span><span className="tabular-nums">{money(calculation.fuel, currency)}</span></div> : null}
          <div className="flex justify-between gap-3 pt-1 text-sm font-bold"><span>Total del servicio</span><span className="text-[#5be49b] tabular-nums">{money(calculation.total, currency)}</span></div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-[#8fb4ff]">{calculation.minimumApplied
          ? `El cobro mínimo (${money(calculation.minimum, currency)}) es mayor que el cálculo: se cobraría el mínimo.`
          : `Por encima del cobro mínimo (${money(calculation.minimum, currency)}).`}</p>
      </section>
      <section className="rounded-xl border border-line bg-surface-muted p-3 text-xs leading-relaxed text-content-muted">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-strong">Información adicional</p>
        <p className="flex justify-between gap-3"><span>Distancia facturable</span><span className="tabular-nums">{num(draft.billable_km) > 0 ? `${num(draft.billable_km)} km${draft.km_source === "google" ? " (Google)" : draft.km_source === "estimate" ? " (estimada)" : draft.km_source === "manual" ? " (manual)" : ""}` : "Sin definir"}</span></p>
        <p className="flex justify-between gap-3"><span>Tiempo estimado</span><span className="tabular-nums">{num(draft.sim_duration_min) > 0 ? `${draft.sim_duration_min} min` : "—"}</span></p>
        <p className="flex justify-between gap-3"><span>Paradas del recorrido</span><span className="tabular-nums">{stopsCount} ({num(draft.stops_included)} incluidas, {extraStops} extra)</span></p>
        {fuelCalc ? <p className="flex justify-between gap-3"><span>Consumo {draft.fuel_kind === "acpm" ? "ACPM" : "gasolina"}</span><span className="tabular-nums">{fuelCalc.ajustado.toFixed(1)} L ≈ {money(fuelCalc.costo, currency)}</span></p> : null}
        {draft.fuel_mode === "estimated" ? <p className="flex justify-between gap-3"><span>Combustible en tarifa</span><span className="tabular-nums">{money(num(draft.fuel_estimated_cost), currency)}</span></p> : null}
        <p className="mt-1 border-t border-line pt-1 text-[11px]">Los valores de este bloque son referenciales: solo el resumen superior alimenta el costo del servicio.</p>
      </section>
    </div>
  </div>;
}

function RouteSimulator({ draft, onChange, sedes }: { draft: RateCostDraft; onChange: (patch: Partial<RateCostDraft>) => void; sedes: SedeOption[] }) {
  const [simStatus, setSimStatus] = useState<"idle" | "loading" | "error">("idle");
  const [simMessage, setSimMessage] = useState("");
  const stopsKey = draft.sim_stops.map((stop) => `${stop.latitude},${stop.longitude}`).join(";");
  const canSimulate = (draft.sim_origin_kind === "sede" ? Boolean(draft.sim_origin_sede_id) : draft.sim_origin_lat != null) && draft.sim_destination_lat != null;

  const runSimulation = useCallback(async () => {
    setSimStatus("loading");
    setSimMessage("");
    try {
      const origin = draft.sim_origin_kind === "sede" && draft.sim_origin_sede_id
        ? { sede_id: Number(draft.sim_origin_sede_id) }
        : { latitude: draft.sim_origin_lat, longitude: draft.sim_origin_lng, label: draft.sim_origin_label || "Origen" };
      const result = await api<RouteSimulation>("/api/v1/transport/route-simulator", {
        method: "POST",
        body: JSON.stringify({
          origin,
          destination: { latitude: draft.sim_destination_lat, longitude: draft.sim_destination_lng, label: draft.sim_destination_label || "Destino" },
          intermediates: draft.sim_stops.filter((stop) => stop.latitude != null && stop.longitude != null).map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude, label: stop.label })),
          round_trip: draft.sim_round_trip
        })
      });
      onChange({
        sim_distance_km: String(result.distance_km),
        sim_duration_min: String(result.duration_minutes),
        sim_polyline: result.polyline,
        sim_source: result.source,
        ...(draft.sim_manual_km ? {} : { billable_km: String(result.distance_km), km_source: result.source })
      });
      setSimMessage(result.message || "");
      setSimStatus("idle");
    } catch (caught) {
      setSimStatus("error");
      setSimMessage(caught instanceof Error ? caught.message : "No fue posible calcular la ruta.");
    }
  }, [draft.sim_origin_kind, draft.sim_origin_sede_id, draft.sim_origin_lat, draft.sim_origin_lng, draft.sim_origin_label, draft.sim_destination_lat, draft.sim_destination_lng, draft.sim_destination_label, draft.sim_stops, draft.sim_manual_km, draft.sim_round_trip, onChange]);
  const runSimulationRef = useRef(runSimulation);
  useEffect(() => {
    runSimulationRef.current = runSimulation;
  }, [runSimulation]);

  useEffect(() => {
    if (!canSimulate) return;
    const timer = setTimeout(() => { void runSimulationRef.current(); }, 700);
    return () => clearTimeout(timer);
  }, [canSimulate, draft.sim_origin_kind, draft.sim_origin_sede_id, draft.sim_origin_lat, draft.sim_origin_lng, draft.sim_destination_lat, draft.sim_destination_lng, draft.sim_round_trip, stopsKey]);

  const selectedSede = sedes.find((sede) => String(sede.id) === draft.sim_origin_sede_id);
  const originPosition: [number, number] | null = draft.sim_origin_kind === "sede"
    ? selectedSede?.latitude != null && selectedSede?.longitude != null ? [Number(selectedSede.latitude), Number(selectedSede.longitude)] : null
    : draft.sim_origin_lat != null && draft.sim_origin_lng != null ? [draft.sim_origin_lat, draft.sim_origin_lng] : null;
  const destinationPosition: [number, number] | null = draft.sim_destination_lat != null && draft.sim_destination_lng != null ? [draft.sim_destination_lat, draft.sim_destination_lng] : null;

  function setOriginSede(sedeId: string) {
    const sede = sedes.find((row) => String(row.id) === sedeId);
    onChange({
      sim_origin_sede_id: sedeId,
      sim_origin_label: sede?.name || "",
      sim_origin_lat: sede?.latitude != null ? Number(sede.latitude) : null,
      sim_origin_lng: sede?.longitude != null ? Number(sede.longitude) : null
    });
  }

  return <section className="rounded-xl border border-line bg-surface p-3">
    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-apex"><Route size={13} /> Simulador de recorrido</p>
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-sm font-semibold">Origen</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <select aria-label="Tipo de origen" className={`${inputClass} apex-select`} onChange={(event) => onChange({ sim_origin_kind: event.target.value as "sede" | "custom", sim_origin_label: "", sim_origin_lat: null, sim_origin_lng: null })} value={draft.sim_origin_kind}>
            <option value="sede">Sede del tenant</option>
            <option value="custom">Dirección personalizada</option>
          </select>
          {draft.sim_origin_kind === "sede"
            ? <select aria-label="Sede de origen" className={`${inputClass} apex-select`} onChange={(event) => setOriginSede(event.target.value)} value={draft.sim_origin_sede_id}>
              <option value="">Selecciona una sede…</option>
              {sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.name}{sede.city ? ` · ${sede.city}` : ""}</option>)}
            </select>
            : <PlaceAutocomplete label="Dirección de origen" onPick={(place) => onChange({ sim_origin_label: place.label, sim_origin_lat: place.latitude, sim_origin_lng: place.longitude })} placeholder="Ej: CEDI Calle 80, Bogotá" value={draft.sim_origin_label} />}
        </div>
        {draft.sim_origin_kind === "sede" && draft.sim_origin_sede_id && selectedSede?.latitude == null ? <p className="mt-1 text-xs text-amber-700">La sede seleccionada no tiene coordenadas; regístralas en Configuración para simular.</p> : null}
      </div>
      <PlaceAutocomplete
        label="Destino"
        onPick={(place) => onChange({ sim_destination_label: place.label, sim_destination_lat: place.latitude, sim_destination_lng: place.longitude })}
        placeholder="Ej: Cliente Parque Industrial, Tocancipá"
        value={draft.sim_destination_label}
      />
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold">Paradas intermedias</span>
          <button className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold" onClick={() => onChange({ sim_stops: [...draft.sim_stops, { id: `stop-${Date.now()}-${draft.sim_stops.length}`, label: "", latitude: null, longitude: null }] })} type="button"><Plus size={12} />Agregar parada</button>
        </div>
        {!draft.sim_stops.length ? <p className="text-xs text-content-muted">Sin paradas intermedias. Cada parada agregada cuenta como entrega para el cálculo de paradas adicionales.</p> : null}
        <div className="space-y-2">
          {draft.sim_stops.map((stop, index) => <div className="flex items-start gap-2" key={stop.id}>
            <div className="min-w-0 flex-1">
              <PlaceAutocomplete
                label={`Parada ${index + 1}`}
                onPick={(place) => onChange({ sim_stops: draft.sim_stops.map((row) => row.id === stop.id ? { ...row, label: place.label, latitude: place.latitude, longitude: place.longitude } : row) })}
                onText={(text) => onChange({ sim_stops: draft.sim_stops.map((row) => row.id === stop.id ? { ...row, label: text } : row) })}
                placeholder="Nombre o dirección de la parada"
                value={stop.label}
              />
            </div>
            <button aria-label={`Quitar parada ${index + 1}`} className="mt-6 rounded-md border border-line p-1.5 text-content-muted hover:text-rose-600" onClick={() => onChange({ sim_stops: draft.sim_stops.filter((row) => row.id !== stop.id) })} type="button"><Trash2 size={14} /></button>
          </div>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button aria-pressed={draft.sim_round_trip} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${draft.sim_round_trip ? "border-apex bg-apex/10 text-apex" : "border-line text-content-muted"}`} onClick={() => onChange({ sim_round_trip: !draft.sim_round_trip })} type="button">Ida y regreso</button>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" disabled={!canSimulate || simStatus === "loading"} onClick={() => void runSimulation()} type="button">
          <RefreshCw size={12} className={simStatus === "loading" ? "animate-spin" : ""} />Recalcular
        </button>
        {simStatus === "error" ? <span className="text-xs text-rose-600">{simMessage}</span> : simMessage ? <span className="text-xs text-content-muted">{simMessage}</span> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-sm font-semibold"><Gauge size={13} /> Distancia total (km)</span>
          <input
            aria-label="Distancia total en kilómetros"
            className={`${inputClass} tabular-nums`}
            inputMode="decimal"
            min="0"
            onChange={(event) => onChange({ billable_km: event.target.value, km_source: "manual", sim_manual_km: true })}
            step="any"
            type="number"
            value={draft.billable_km}
          />
          <span className="mt-1 flex items-center gap-1 text-[11px] text-content-muted">
            {draft.km_source === "manual" ? "Distancia manual (modificada por ti)." : draft.km_source === "google" ? "Calculada con Google Routes." : draft.km_source === "estimate" ? "Estimada (Google no disponible)." : "Escríbela o calcula la ruta."}
            {draft.sim_manual_km && draft.sim_distance_km ? <button className="font-semibold text-apex" onClick={() => onChange({ billable_km: draft.sim_distance_km, km_source: draft.sim_source, sim_manual_km: false })} type="button">Usar la calculada ({draft.sim_distance_km} km)</button> : null}
          </span>
        </label>
        <div className="rounded-lg bg-surface-muted p-2.5 text-xs leading-relaxed text-content-muted">
          <p className="flex justify-between gap-3"><span>Tiempo estimado</span><span className="tabular-nums">{num(draft.sim_duration_min) > 0 ? `${draft.sim_duration_min} min` : "—"}</span></p>
          <p className="flex justify-between gap-3"><span>Paradas del recorrido</span><span className="tabular-nums">{draft.sim_stops.length + 1}</span></p>
          <p className="flex justify-between gap-3"><span>Modo</span><span>{draft.sim_round_trip ? "Ida y regreso" : "Solo ida"}</span></p>
        </div>
      </div>
      <RouteMap destination={destinationPosition} origin={originPosition} polyline={draft.sim_polyline} stops={draft.sim_stops.filter((stop) => stop.latitude != null && stop.longitude != null).map((stop) => [stop.latitude, stop.longitude] as [number, number])} />
    </div>
  </section>;
}

function RouteMap({ origin, destination, stops, polyline }: { origin: [number, number] | null; destination: [number, number] | null; stops: [number, number][]; polyline: string | null }) {
  const decoded = useMemo(() => polyline ? decodeGooglePolyline(polyline) : [], [polyline]);
  const path = decoded.length ? decoded : origin && destination ? [origin, ...stops, destination] : [];
  const center = origin || destination || [4.65, -74.1];
  return <div className="h-52 overflow-hidden rounded-lg border border-line bg-surface-muted">
    <MapContainer center={center} className="h-full w-full" zoom={7}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {path.length ? <Polyline color="#2563eb" positions={path} weight={4} /> : null}
      {origin ? <CircleMarker center={origin} pathOptions={{ color: "#16a34a", fillColor: "#16a34a", fillOpacity: 0.9 }} radius={7}><Tooltip>Origen</Tooltip></CircleMarker> : null}
      {stops.map((stop, index) => <CircleMarker center={stop} key={`${stop[0]}-${stop[1]}-${index}`} pathOptions={{ color: "#d97706", fillColor: "#d97706", fillOpacity: 0.9 }} radius={5}><Tooltip>Parada {index + 1}</Tooltip></CircleMarker>)}
      {destination ? <CircleMarker center={destination} pathOptions={{ color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.9 }} radius={7}><Tooltip>Destino</Tooltip></CircleMarker> : null}
    </MapContainer>
  </div>;
}

function PlaceAutocomplete({ label, value, onPick, onText, placeholder }: { label: string; value: string; onPick: (place: PlaceSuggestion) => void; onText?: (text: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [options, setOptions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    const onDocClick = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 3) { setOptions([]); return; }
    const timer = setTimeout(() => {
      setSearching(true);
      api<PlacesResponse>(`/api/v1/transport/route-places?term=${encodeURIComponent(query)}`)
        .then((result) => { setOptions(result.places || []); setOpen(true); })
        .catch(() => setOptions([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  return <div className="relative" ref={rootRef}>
    <span className="mb-1 flex items-center gap-1 text-sm font-semibold"><MapPin size={13} /> {label}</span>
    <input
      aria-label={label}
      className={inputClass}
      onChange={(event) => { setText(event.target.value); onText?.(event.target.value); }}
      onFocus={() => { if (options.length) setOpen(true); }}
      placeholder={placeholder}
      value={text}
    />
    {searching ? <span className="mt-1 block text-[11px] text-content-muted">Buscando…</span> : null}
    {open && options.length ? <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-overlay" role="listbox">
      {options.map((place, index) => <li key={`${place.latitude}-${place.longitude}-${index}`}>
        <button className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => { onPick(place); setText(place.label); setOpen(false); }} type="button">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{place.label}</span>
            <span className="block text-[11px] text-content-muted">{place.source === "sede" ? "Sede del tenant" : place.source === "punto_entrega" ? "Punto de entrega" : "Google"}</span>
          </span>
        </button>
      </li>)}
    </ul> : null}
  </div>;
}

function ToggleBlock({ enabled, label, onToggle, children }: { enabled: boolean; label: string; onToggle: (enabled: boolean) => void; children: React.ReactNode }) {
  return <div className={`rounded-lg border p-2.5 ${enabled ? "border-apex/60 bg-apex/5" : "border-line"}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-content-strong">{label}</span>
      <button aria-label={`Activar ${label}`} aria-pressed={enabled} className={`relative h-5 w-10 rounded-full transition-colors ${enabled ? "bg-apex" : "bg-line"}`} onClick={() => onToggle(!enabled)} type="button">
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${enabled ? "left-5" : "left-0.5"}`} />
      </button>
    </div>
    {enabled ? <div className="mt-2.5 space-y-3">{children}</div> : null}
  </div>;
}

function NumField({ label, hint, unit, name, value, onChange }: { label: string; hint?: string; unit: string; name: string; value: string; onChange: (value: string) => void }) {
  return <label className="block">
    <span className="mb-1 block text-sm font-semibold">{label}</span>
    {hint ? <span className="mb-1 block text-xs text-content-muted">{hint}</span> : null}
    <span className="flex items-center gap-2">
      <input className={`${inputClass} tabular-nums`} inputMode="decimal" min="0" name={name} onChange={(event) => onChange(event.target.value)} type="number" step="any" value={value} />
      <span className="whitespace-nowrap text-xs text-content-muted">{unit}</span>
    </span>
  </label>;
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return <p className="mb-2 text-xs font-bold uppercase tracking-wide text-apex"><span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-apex text-[10px] text-white">{index}</span>{title}</p>;
}
