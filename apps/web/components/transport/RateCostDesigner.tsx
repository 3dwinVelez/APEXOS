"use client";

import styles from "@/components/transport/RateCostDesigner.module.css";
import { api } from "@/lib/api";
import { decodeGooglePolyline } from "@/components/transport/PlanningRouteMap";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { ArrowDown, ArrowUp, Box, Clock, Coins, FileText, Fuel, Gauge, Info, MapPin, Plus, RefreshCw, Route, Trash2, Truck } from "lucide-react";
import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export type RateCostSimStop = { id: string; label: string; latitude: number | null; longitude: number | null };

export type RateCostDraft = {
  code: string; currency: string;
  base_rate: string; minimum_charge: string; price_per_km: string; price_per_kg: string;
  price_per_m3: string; price_per_stop: string; fuel_surcharge_pct: string; tolls_flat: string;
  tariff_method: "fijo" | "por_km" | "por_carga"; load_unit: "kg" | "m3";
  stops_included: string; wait_included_min: string; wait_rate_per_min: string;
  load_unload_flat: string; other_costs_amount: string; other_costs_label: string;
  fuel_mode: "surcharge" | "estimated"; fuel_estimated_cost: string;
  billable_km: string; km_source: "" | "google" | "osrm" | "estimate" | "manual";
  preview_load: string; preview_wait_min: string;
  fuel_kind: "gasolina" | "acpm"; fuel_rendimiento: string; fuel_precio_litro: string; fuel_extra_pct: string;
  sim_round_trip: boolean; sim_stops: RateCostSimStop[];
  sim_origin_kind: "sede" | "custom"; sim_origin_sede_id: string; sim_origin_label: string;
  sim_origin_lat: number | null; sim_origin_lng: number | null;
  sim_destination_label: string; sim_destination_lat: number | null; sim_destination_lng: number | null;
  sim_manual_km: boolean; sim_distance_km: string; sim_duration_min: string; sim_polyline: string | null; sim_source: "" | "google" | "osrm" | "estimate";
};

export type SedeOption = { id: number; code: string; name: string; address?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null };

type PlaceSuggestion = { label: string; latitude: number; longitude: number; source: "sede" | "punto_entrega" | "google" | "photon"; detail?: string };
type PlacesResponse = { places: PlaceSuggestion[]; google_configured: boolean; external_available?: boolean; message?: string };
type RouteSimulation = {
  distance_km: number; duration_minutes: number; source: "google" | "osrm" | "estimate"; polyline: string | null;
  traffic_level?: string; message?: string;
  origin?: { latitude: number; longitude: number; label?: string }; destination?: { latitude: number; longitude: number; label?: string };
};

const num = (value: string) => Number.isFinite(Number(value)) ? Math.max(0, Number(value || 0)) : 0;
const duration = (value: string) => { const minutes = Math.round(num(value)); return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : minutes > 0 ? `${minutes} min` : "—"; };
const money = (value: number, currency = "COP") => new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));

const inputClass = "h-9 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-apex";

const TARIFF_METHODS = [
  { id: "fijo", label: "Valor fijo", desc: "Un cargo base único por servicio." },
  { id: "por_km", label: "Por kilómetro", desc: "El costo se arma con la distancia recorrida." },
  { id: "por_carga", label: "Por carga", desc: "Se cobra por peso o volumen transportado." },
] as const;

export function RateCostDesigner({ draft, onChange, sedes, readOnly = false }: { draft: RateCostDraft; onChange: (patch: Partial<RateCostDraft>) => void; sedes: SedeOption[]; readOnly?: boolean }) {
  const currency = draft.currency || "COP";

  const setStopsEnabled = (enabled: boolean) => onChange(enabled
    ? { stops_included: draft.stops_included || "0" }
    : { stops_included: "", price_per_stop: "" });
  const stopsEnabled = num(draft.price_per_stop) > 0 || draft.stops_included !== "";
  const waitEnabled = draft.wait_included_min !== "" || num(draft.wait_rate_per_min) > 0;
  const tollsEnabled = draft.tolls_flat !== "";
  const loadUnloadEnabled = draft.load_unload_flat !== "";
  const otherEnabled = draft.other_costs_amount !== "" || draft.other_costs_label.trim() !== "";

  const stopsCount = draft.sim_stops.filter((stop) => stop.latitude != null && stop.longitude != null).length + (draft.sim_destination_lat != null && draft.sim_destination_lng != null ? 1 : 0);
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
      { label: draft.tariff_method === "fijo" ? "Tarifa principal (valor fijo)" : "Cargo base", value: base, show: true },
      { label: `${km} km × ${money(num(draft.price_per_km), currency)}`, value: distance, show: distance > 0 },
      { label: `${loadQty} ${draft.load_unit === "m3" ? "m³" : "kg"} × ${money(draft.load_unit === "m3" ? num(draft.price_per_m3) : num(draft.price_per_kg), currency)}`, value: load, show: load > 0 },
      { label: `${stopsCount} paradas − ${num(draft.stops_included)} incl. = ${extraStops} extra × ${money(num(draft.price_per_stop), currency)}`, value: stops, show: true },
      { label: "Peajes", value: tolls, show: true },
      { label: "Tiempo de espera", value: wait, show: true },
      { label: "Cargue y descargue", value: loadUnload, show: true },
      { label: draft.other_costs_label.trim() || "Otros costos", value: other, show: true },
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

  return <div className={`${styles.designer} grid gap-4 lg:grid-cols-[minmax(280px,1.1fr)_minmax(0,1.65fr)_minmax(260px,.8fr)]`}>
    <div className="space-y-4">
      <section data-cost-panel="primary" className="rounded-xl border border-line bg-surface p-3">
        <SectionTitle index="1" title="Tarifa principal" /><p className="mb-4 text-xs text-content-muted">Define cómo se calcula el valor base del servicio.</p>
        <div className={styles.methods}>
          {TARIFF_METHODS.map((method) => <button
            aria-pressed={draft.tariff_method === method.id}
            className={`w-full rounded-lg border p-2.5 text-left transition-colors ${draft.tariff_method === method.id ? "border-apex bg-apex text-white" : "border-line hover:border-apex/50"}`}
            key={method.id}
            onClick={() => onChange({ tariff_method: method.id, price_per_km: method.id === "por_km" ? draft.price_per_km : "", price_per_kg: method.id === "por_carga" && draft.load_unit === "kg" ? draft.price_per_kg : "", price_per_m3: method.id === "por_carga" && draft.load_unit === "m3" ? draft.price_per_m3 : "" })}
            type="button"
          >
            <span className={`block text-sm font-semibold ${draft.tariff_method === method.id ? "text-white" : "text-content-strong"}`}>{method.id === "fijo" ? <Coins className="mr-1 inline" size={18} /> : method.id === "por_km" ? <Route className="mr-1 inline" size={18} /> : <Box className="mr-1 inline" size={18} />}{method.label}</span>

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
                  onClick={() => onChange({ load_unit: unit, ...(unit === "kg" ? { price_per_m3: "" } : { price_per_kg: "" }) })}
                  type="button"
                >{label}</button>)}
              </div>
            </div>
            <NumField label={draft.load_unit === "m3" ? "Precio por m³" : "Precio por kilogramo"} hint="Se multiplica por la carga facturable." unit={`${currency} / ${draft.load_unit === "m3" ? "m³" : "kg"}`} name="load_price" value={draft.load_unit === "m3" ? draft.price_per_m3 : draft.price_per_kg} onChange={(value) => onChange(draft.load_unit === "m3" ? { price_per_m3: value } : { price_per_kg: value })} />
            <NumField label="Carga de referencia (solo simulación)" hint="Permite visualizar el total; no se guarda en la tarifa." unit={draft.load_unit === "m3" ? "m³" : "kg"} name="preview_load" value={draft.preview_load} onChange={(value) => onChange({ preview_load: value })} />
          </div> : null}
          <details className="rounded-md border border-line p-2 text-xs"><summary className="cursor-pointer font-semibold text-content-muted">Cobro mínimo y recargo de combustible</summary><div className="mt-2 space-y-3"><NumField label="Cobro mínimo" hint="Piso garantizado: si el cálculo da menos, se cobra esto." unit={currency} name="minimum_charge" value={draft.minimum_charge} onChange={(value) => onChange({ minimum_charge: value })} />
          {draft.fuel_mode === "surcharge"
            ? <NumField label="Recargo por combustible" hint="Porcentaje que se suma sobre el subtotal. El simulador puede estimar un costo fijo en su lugar." unit="%" name="fuel_surcharge_pct" value={draft.fuel_surcharge_pct} onChange={(value) => onChange({ fuel_surcharge_pct: value })} />
            : <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">Recargo porcentual desactivado: la tarifa usa el costo estimado de combustible del simulador.</p>}</div></details>
        </div>
      </section>

      <section data-cost-panel="extras" className="rounded-xl border border-line bg-surface p-3">
        <SectionTitle index="2" title="Costos adicionales" /><p className="mb-4 text-xs text-content-muted">Activa solo los conceptos que apliquen a esta tarifa.</p>
        <div className="space-y-3">
          <ToggleBlock
            enabled={stopsEnabled}
            label="Paradas adicionales"
            onToggle={setStopsEnabled}
          >
            <NumField label="Paradas incluidas" hint="Entregas cubiertas sin costo extra." unit="paradas" name="stops_included" value={draft.stops_included} onChange={(value) => onChange({ stops_included: value })} />
            <NumField label="Valor por parada extra" hint="Se cobra solo por las entregas que exceden las incluidas." unit={`${currency} / parada`} name="price_per_stop" value={draft.price_per_stop} onChange={(value) => onChange({ price_per_stop: value })} />
          </ToggleBlock>
          <ToggleBlock enabled={tollsEnabled} label="Peajes" onToggle={(enabled) => onChange({ tolls_flat: enabled ? draft.tolls_flat || "0" : "" })}>
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
          <ToggleBlock enabled={loadUnloadEnabled} label="Cargue y descargue" onToggle={(enabled) => onChange({ load_unload_flat: enabled ? draft.load_unload_flat || "0" : "" })}>
            <NumField label="Valor por cargue y descargue" hint="Mano de obra de patios o muelles." unit={currency} name="load_unload_flat" value={draft.load_unload_flat} onChange={(value) => onChange({ load_unload_flat: value })} />
          </ToggleBlock>
          <ToggleBlock enabled={otherEnabled} label="Otros costos" onToggle={(enabled) => onChange(enabled ? { other_costs_amount: draft.other_costs_amount || "0" } : { other_costs_amount: "", other_costs_label: "" })}>
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
      <RouteSimulator draft={draft} onChange={onChange} sedes={sedes} readOnly={readOnly} />
      <section data-cost-panel="fuel" className="rounded-xl border border-line bg-surface p-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-content-strong"><Fuel size={13} /> Consumo estimado del vehículo</p>
        <p className="mb-3 text-xs text-content-muted">Solo referencia. Configura según tu vehículo.</p>
        <div className={styles.fuelGrid}><div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {([["gasolina", "Gasolina"], ["acpm", "ACPM / Diésel"]] as const).map(([kind, label]) => <button
            aria-pressed={draft.fuel_kind === kind}
            className={`rounded-md border px-2 py-1.5 text-sm font-semibold ${draft.fuel_kind === kind ? "border-apex bg-apex/10 text-apex" : "border-line text-content-muted"}`}
            key={kind}
            onClick={() => onChange({ fuel_kind: kind })}
            type="button"
          >{label}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Rendimiento" hint="Kilómetros por litro." unit="km / L" name="fuel_rendimiento" value={draft.fuel_rendimiento} onChange={(value) => onChange({ fuel_rendimiento: value })} />
          <NumField label="Precio por litro" hint={`Precio actual del ${draft.fuel_kind === "acpm" ? "ACPM" : "litro de gasolina"} en ${currency}.`} unit={`${currency} / L`} name="fuel_precio_litro" value={draft.fuel_precio_litro} onChange={(value) => onChange({ fuel_precio_litro: value })} />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold">Consumo extra por tráfico/carga</span>
            <span className="tabular-nums text-content-muted">{num(draft.fuel_extra_pct)}%</span>
          </div>
          <div className="flex items-center gap-3"><input aria-label="Consumo extra porcentual" className="w-full accent-apex" max="50" min="0" onChange={(event) => onChange({ fuel_extra_pct: event.target.value })} type="range" value={draft.fuel_extra_pct} />
          <input aria-label="Ajuste adicional de consumo porcentual" className={`${inputClass} w-16 shrink-0`} min="0" max="50" type="number" value={draft.fuel_extra_pct} onChange={(event) => onChange({ fuel_extra_pct: String(Math.min(50, num(event.target.value))) })} /></div>
        </div>
        </div><div className="rounded-xl bg-blue-50 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Fuel size={18} /> Resultado del consumo</p>
        {fuelCalc ? <div className="text-xs leading-relaxed">
          <p className="flex justify-between gap-3"><span>Distancia facturable</span><span className="tabular-nums">{num(draft.billable_km)} km</span></p>
          <p title={`${num(draft.billable_km)} km ÷ ${num(draft.fuel_rendimiento)} km/L + ${num(draft.fuel_extra_pct)}%`} className="flex justify-between gap-3"><span>Consumo estimado</span><span className="tabular-nums">{fuelCalc.ajustado.toFixed(2)} litros</span></p>
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
        </div></div>
      </section>
    </div>

    <div className="space-y-3">
      <section data-cost-panel="summary" className="rounded-xl bg-[#102743] p-4 text-[#dbe6ff]">
        <p className="mb-2 text-lg font-bold text-white">Resumen del cálculo</p>
        <p className="mb-3 border-b border-[#38516d] pb-3 text-xs text-[#c0cede]">Costos configurados y resultado de la simulación.</p>
        <div className="space-y-3 text-xs">
          {calculation.lines.length ? calculation.lines.map((line) => <div className="flex items-center justify-between gap-3 border-b border-[#38516d]/60 pb-3" key={line.label}><span className="flex items-center gap-2"><SummaryIcon label={line.label} /><span>{line.label.includes(" paradas − ") ? <><span className="block">Paradas adicionales</span><small>{line.label}</small></> : line.label}</span></span><span className="tabular-nums font-bold">{money(line.value, currency)}</span></div>) : <p className="text-[#8fb4ff]">Sin componentes todavía: elige un método y activa los costos que apliquen.</p>}
          <div className="flex justify-between gap-3 border-t border-[#2c3d63] pt-1"><span>Subtotal</span><span className="tabular-nums">{money(calculation.subtotal, currency)}</span></div>
          <div className="flex justify-between gap-3"><span>{draft.fuel_mode === "estimated" ? "Combustible estimado (recargo % en 0)" : `Recargo de combustible ${draft.fuel_surcharge_pct || "0"}%`}</span><span className="tabular-nums">{money(calculation.fuel, currency)}</span></div>
          <div className="border-t border-[#38516d] pt-4 text-base font-bold"><span>Total del servicio</span><span className="mt-2 block text-right text-2xl text-[#5be49b] tabular-nums">{money(calculation.total, currency)} {currency}</span></div>
        </div>
        <p className={calculation.minimumApplied ? "mt-2 text-[11px] leading-snug text-[#8fb4ff]" : "sr-only"}>{calculation.minimumApplied
          ? `El cobro mínimo (${money(calculation.minimum, currency)}) es mayor que el cálculo: se cobraría el mínimo.`
          : `Por encima del cobro mínimo (${money(calculation.minimum, currency)}).`}</p>
      </section>
      <section data-cost-panel="information" className="rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-content-muted">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-strong">Información adicional</p>
        <p className="flex justify-between gap-3"><span>Distancia facturable</span><span className="tabular-nums">{num(draft.billable_km) > 0 ? `${num(draft.billable_km)} km${draft.km_source === "google" ? " (Google)" : draft.km_source === "osrm" ? " (OSRM)" : draft.km_source === "estimate" ? " (aproximada)" : draft.km_source === "manual" ? " (manual)" : ""}` : "Sin definir"}</span></p>
        <p className="flex justify-between gap-3"><span>Tiempo estimado</span><span className="tabular-nums">{duration(draft.sim_duration_min)}</span></p>
        <p className="flex justify-between gap-3"><span>Paradas del recorrido</span><span className="tabular-nums">{stopsCount} ({num(draft.stops_included)} incluidas, {extraStops} extra)</span></p>
        {fuelCalc ? <p className="flex justify-between gap-3"><span>Consumo {draft.fuel_kind === "acpm" ? "ACPM" : "gasolina"}</span><span className="tabular-nums">{fuelCalc.ajustado.toFixed(2)} L ≈ {money(fuelCalc.costo, currency)}</span></p> : null}
        {draft.fuel_mode === "estimated" ? <p className="flex justify-between gap-3"><span>Combustible en tarifa</span><span className="tabular-nums">{money(num(draft.fuel_estimated_cost), currency)}</span></p> : null}
        <p className="mt-1 border-t border-line pt-1 text-[11px]">Los valores de este bloque son referenciales: solo el resumen superior alimenta el costo del servicio.</p>
      </section>
    </div>
  </div>;
}

function RouteSimulator({ draft, onChange, sedes, readOnly = false }: { draft: RateCostDraft; onChange: (patch: Partial<RateCostDraft>) => void; sedes: SedeOption[]; readOnly?: boolean }) {
  const [simStatus, setSimStatus] = useState<"idle" | "loading" | "error">("idle");
  const [simMessage, setSimMessage] = useState("");
  const simulationRequest = useRef({ id: 0 });
  const latestSimulation = useRef({ draft, onChange });
  useEffect(() => { latestSimulation.current = { draft, onChange }; }, [draft, onChange]);
  const stopsKey = draft.sim_stops.map((stop) => `${stop.latitude},${stop.longitude}`).join(";");
  const canSimulate = draft.sim_stops.every((stop) => stop.latitude != null && stop.longitude != null) && (draft.sim_origin_kind === "sede" ? Boolean(draft.sim_origin_sede_id) : draft.sim_origin_lat != null) && draft.sim_destination_lat != null;

  const previousCanSimulate = useRef(canSimulate);

  const runSimulation = useCallback(async () => {
    const request = ++simulationRequest.current.id;
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
      if (request !== simulationRequest.current.id) return;
      const { draft: currentDraft } = latestSimulation.current;
      onChange({
        sim_distance_km: String(result.distance_km),
        sim_duration_min: String(result.duration_minutes),
        sim_polyline: result.polyline,
        sim_source: result.source,
        ...(currentDraft.sim_manual_km ? {} : { billable_km: String(result.distance_km), km_source: result.source })
      });
      setSimMessage(result.message || "");
      setSimStatus("idle");
    } catch (caught) {
      if (request !== simulationRequest.current.id) return;
      setSimStatus("error");
      setSimMessage(caught instanceof Error ? caught.message : "No fue posible calcular la ruta.");
    }
  }, [draft.sim_origin_kind, draft.sim_origin_sede_id, draft.sim_origin_lat, draft.sim_origin_lng, draft.sim_origin_label, draft.sim_destination_lat, draft.sim_destination_lng, draft.sim_destination_label, draft.sim_stops, draft.sim_round_trip, onChange]);
  const runSimulationRef = useRef(runSimulation);
  useEffect(() => {
    runSimulationRef.current = runSimulation;
  }, [runSimulation]);

  useEffect(() => {
    if (readOnly) return;
    const requests = simulationRequest.current;
    const { draft: currentDraft, onChange: update } = latestSimulation.current;
    const wasValid = previousCanSimulate.current;
    previousCanSimulate.current = canSimulate;
    if (!canSimulate) {
      simulationRequest.current.id++;
      if (wasValid && (currentDraft.sim_distance_km || currentDraft.sim_polyline)) update({ sim_distance_km: "", sim_duration_min: "", sim_polyline: null, sim_source: "", ...(currentDraft.sim_manual_km ? {} : { billable_km: "", km_source: "" }) });
      return;
    }
    const timer = setTimeout(() => { void runSimulationRef.current(); }, 700);
    return () => { clearTimeout(timer); requests.id++; };
  }, [readOnly, canSimulate, draft.sim_origin_kind, draft.sim_origin_sede_id, draft.sim_origin_lat, draft.sim_origin_lng, draft.sim_destination_lat, draft.sim_destination_lng, draft.sim_round_trip, stopsKey]);

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

  return <section data-cost-panel="route" className="rounded-xl border border-line bg-surface p-3">
    <div className={styles.routeHeader}><div><SectionTitle index="3" title="Simulador de recorrido" /><p className="text-xs text-content-muted">Calcula la distancia, tiempo y consumo estimado del vehículo.</p></div>
    <button type="button" className="mb-3 rounded-md border border-line px-3 py-2 text-sm" onClick={() => { simulationRequest.current.id++; setSimStatus("idle"); setSimMessage(""); onChange({ sim_origin_sede_id: "", sim_origin_label: "", sim_origin_lat: null, sim_origin_lng: null, sim_destination_label: "", sim_destination_lat: null, sim_destination_lng: null, sim_stops: [], sim_polyline: null, sim_distance_km: "", sim_duration_min: "", sim_source: "", billable_km: "", km_source: "", sim_manual_km: false }); }}><RefreshCw size={16} /> Limpiar ruta</button></div>
    <div className="space-y-3">
      <div className={styles.routeGrid}>
      <div className="space-y-3">
      <div>
        <PlaceAutocomplete label="Origen" onText={(text) => onChange({ sim_origin_kind: "custom", sim_origin_sede_id: "", sim_origin_label: text, sim_origin_lat: null, sim_origin_lng: null })} onPick={(place) => onChange({ sim_origin_kind: "custom", sim_origin_sede_id: "", sim_origin_label: place.label, sim_origin_lat: place.latitude, sim_origin_lng: place.longitude })} placeholder="Dirección o sede de origen" value={draft.sim_origin_label} />
        <details className="mt-1 text-[11px] text-content-muted"><summary className="cursor-pointer">Seleccionar una sede registrada</summary>
          <select aria-label="Sede de origen" className={`${inputClass} mt-1 apex-select`} onChange={(event) => { onChange({ sim_origin_kind: "sede" }); setOriginSede(event.target.value); }} value={draft.sim_origin_sede_id}>
            <option value="">Selecciona una sede…</option>
            {sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.name}{sede.city ? ` · ${sede.city}` : ""}</option>)}
          </select>
        </details>
        {draft.sim_origin_kind === "sede" && draft.sim_origin_sede_id && selectedSede?.latitude == null ? <p className="mt-1 text-xs text-amber-700">La sede seleccionada no tiene coordenadas; regístralas en Configuración para simular.</p> : null}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold">Paradas intermedias</span>
          <button className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold" onClick={() => onChange({ sim_stops: [...draft.sim_stops, { id: `stop-${Date.now()}-${draft.sim_stops.length}`, label: "", latitude: null, longitude: null }] })} type="button"><Plus size={12} />Agregar parada</button>
        </div>
        {!draft.sim_stops.length ? <p className="text-xs text-content-muted">Sin paradas intermedias. Cada lugar seleccionado cuenta como entrega para el cálculo de paradas adicionales.</p> : null}
        <div className="space-y-2">
          {draft.sim_stops.map((stop, index) => <div className="flex items-start gap-2" key={stop.id}>
            <div className="min-w-0 flex-1">
              <PlaceAutocomplete
                label={`Parada ${index + 1}`}
                onPick={(place) => onChange({ sim_stops: draft.sim_stops.map((row) => row.id === stop.id ? { ...row, label: place.label, latitude: place.latitude, longitude: place.longitude } : row) })}
                onText={(text) => onChange({ sim_stops: draft.sim_stops.map((row) => row.id === stop.id ? { ...row, label: text, latitude: null, longitude: null } : row) })}
                placeholder="Nombre o dirección de la parada"
                value={stop.label}
              />
            </div>
            <div className="mt-6 flex gap-1"><button aria-label={`Subir parada ${index + 1}`} disabled={index === 0} className="rounded border border-line p-1 disabled:opacity-30" type="button" onClick={() => { const stops = [...draft.sim_stops]; [stops[index - 1], stops[index]] = [stops[index], stops[index - 1]]; onChange({ sim_stops: stops }); }}><ArrowUp size={12} /></button><button aria-label={`Bajar parada ${index + 1}`} disabled={index === draft.sim_stops.length - 1} className="rounded border border-line p-1 disabled:opacity-30" type="button" onClick={() => { const stops = [...draft.sim_stops]; [stops[index], stops[index + 1]] = [stops[index + 1], stops[index]]; onChange({ sim_stops: stops }); }}><ArrowDown size={12} /></button></div>
            <button aria-label={`Quitar parada ${index + 1}`} className="mt-6 rounded-md border border-line p-1.5 text-content-muted hover:text-rose-600" onClick={() => onChange({ sim_stops: draft.sim_stops.filter((row) => row.id !== stop.id) })} type="button"><Trash2 size={14} /></button>
          </div>)}
        </div>
      </div>
      <PlaceAutocomplete
        label="Destino"
        onText={(text) => onChange({ sim_destination_label: text, sim_destination_lat: null, sim_destination_lng: null })}
        onPick={(place) => onChange({ sim_destination_label: place.label, sim_destination_lat: place.latitude, sim_destination_lng: place.longitude })}
        placeholder="Ej: Cliente Parque Industrial, Tocancipá"
        value={draft.sim_destination_label}
      />
      </div>
      <RouteMap destination={destinationPosition} origin={originPosition} polyline={draft.sim_polyline} stops={draft.sim_stops.filter((stop) => stop.latitude != null && stop.longitude != null).map((stop) => [stop.latitude, stop.longitude] as [number, number])} />
      </div>
      <div className={styles.routeMetrics}>
        <label><span><Gauge size={18} /> Distancia total</span><span className="flex items-center gap-1"><input aria-label="Distancia total en kilómetros" className="min-w-0 w-24 bg-transparent text-lg font-bold outline-none" inputMode="decimal" min="0" step="any" type="number" value={draft.billable_km} onChange={(event) => onChange({ billable_km: event.target.value, km_source: "manual", sim_manual_km: true })} /><strong>km</strong></span></label>
        <div><span><Clock size={18} /> Tiempo estimado</span><strong>{duration(draft.sim_duration_min)}</strong></div>
        <div><span><MapPin size={18} /> Paradas</span><strong>{draft.sim_stops.filter((stop) => stop.latitude != null && stop.longitude != null).length + (draft.sim_destination_lat != null && draft.sim_destination_lng != null ? 1 : 0)}</strong></div>
        <details className={styles.routeDetails}><summary>Ver detalles <ArrowDown size={13} /></summary><div>
          <p>{draft.sim_source === "google" ? "Ruta vial calculada con Google Routes." : draft.sim_source === "osrm" ? "Recorrido vial calculado con OSRM / OpenStreetMap. Tiempo sin tráfico en vivo." : draft.sim_source === "estimate" ? "Estimación aproximada con factor vial; no representa una ruta vial certificada." : "Selecciona origen, paradas y destino para calcular el recorrido."}</p>
          <p>{draft.sim_stops.length} paradas intermedias · {draft.sim_round_trip ? "Ida y regreso" : "Solo ida"}</p>
          <div className={styles.routeActions}>
            <button aria-pressed={draft.sim_round_trip} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${draft.sim_round_trip ? "border-apex bg-apex/10 text-apex" : "border-line text-content-muted"}`} onClick={() => onChange({ sim_round_trip: !draft.sim_round_trip })} type="button">Ida y regreso</button>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" disabled={!canSimulate || simStatus === "loading"} onClick={() => void runSimulation()} type="button"><RefreshCw size={12} className={simStatus === "loading" ? "animate-spin" : ""} />Recalcular</button>
          </div>
          {simMessage ? <p>{simMessage}</p> : null}
        </div></details>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-content-muted" role="status">
        {simStatus === "error" ? <span className="text-rose-700">{simMessage}</span> : <span>{draft.km_source === "manual" ? "Distancia manual (modificada por ti)." : draft.km_source === "google" ? "Calculada con Google Routes." : draft.km_source === "osrm" ? "Calculada con OSRM / OpenStreetMap (sin tráfico en vivo)." : draft.km_source === "estimate" ? "Aproximación: el proveedor vial no está disponible." : "Escribe la distancia o selecciona lugares para calcular la ruta."}</span>}
        {draft.sim_manual_km && draft.sim_distance_km ? <button className="font-semibold text-apex" onClick={() => onChange({ billable_km: draft.sim_distance_km, km_source: draft.sim_source, sim_manual_km: false })} type="button">Usar la calculada ({draft.sim_distance_km} km)</button> : null}
        {simStatus === "loading" ? <span>Calculando recorrido…</span> : null}
      </div>

    </div>
  </section>;
}

function RouteMap({ origin, destination, stops, polyline }: { origin: [number, number] | null; destination: [number, number] | null; stops: [number, number][]; polyline: string | null }) {
  const decoded = useMemo(() => polyline ? decodeGooglePolyline(polyline) : [], [polyline]);
  const path = useMemo(() => decoded.length ? decoded : origin && destination ? [origin, ...stops, destination] : [], [decoded, origin, destination, stops]);
  const [satellite, setSatellite] = useState(false);
  const center = origin || destination || [4.65, -74.1];
  return <div className="relative h-80 overflow-hidden rounded-lg border border-line bg-surface-muted">
    <div className="absolute left-12 top-2 z-[500] flex overflow-hidden rounded-md border border-line bg-surface text-xs shadow"><button type="button" aria-pressed={!satellite} className={`px-3 py-2 ${!satellite ? "bg-[#102743] text-white" : ""}`} onClick={() => setSatellite(false)}>Mapa</button><button type="button" aria-pressed={satellite} className={`px-3 py-2 ${satellite ? "bg-[#102743] text-white" : ""}`} onClick={() => setSatellite(true)}>Satélite</button></div>
    <MapContainer center={center} className="h-full w-full" zoom={7}>
      <FitRoute points={path} />
      {satellite ? <TileLayer key="satellite" attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" /> : <TileLayer key="map" attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
      {path.length ? <Polyline color="#2563eb" positions={path} weight={4} /> : null}
      {origin ? <CircleMarker center={origin} pathOptions={{ color: "#16a34a", fillColor: "#16a34a", fillOpacity: 0.9 }} radius={7}><Tooltip>Origen</Tooltip></CircleMarker> : null}
      {stops.map((stop, index) => <CircleMarker center={stop} key={`${stop[0]}-${stop[1]}-${index}`} pathOptions={{ color: "#d97706", fillColor: "#d97706", fillOpacity: 0.9 }} radius={5}><Tooltip>Parada {index + 1}</Tooltip></CircleMarker>)}
      {destination ? <CircleMarker center={destination} pathOptions={{ color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.9 }} radius={7}><Tooltip>Destino</Tooltip></CircleMarker> : null}
    </MapContainer>
  </div>;
}

function FitRoute({ points }: { points: [number, number][] }) {
  const map = useMap();
  const pointsKey = JSON.stringify(points);
  useEffect(() => {
    const coordinates = JSON.parse(pointsKey) as [number, number][];
    map.invalidateSize();
    if (coordinates.length) map.fitBounds(coordinates, { padding: [28, 28], maxZoom: 14 });
  }, [map, pointsKey]);
  return null;
}

function PlaceAutocomplete({ label, value, onPick, onText, placeholder }: { label: string; value: string; onPick: (place: PlaceSuggestion) => void; onText?: (text: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [options, setOptions] = useState<PlaceSuggestion[]>([]);
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const chosenLabel = useRef(value);
  const searchRequest = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(value); if (!value) { chosenLabel.current = ""; setOptions([]); setOpen(false); } }, [value]);
  useEffect(() => {
    const onDocClick = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const request = ++searchRequest.current;
    const query = text.trim();
    if (query.length < 3 || query === chosenLabel.current) { setOptions([]); setSearching(false); return; }
    const timer = setTimeout(() => {
      setSearching(true); setSearchMessage("");
      api<PlacesResponse>(`/api/v1/transport/route-places?term=${encodeURIComponent(query)}`)
        .then((result) => { if (request !== searchRequest.current) return; setOptions(result.places || []); setActiveIndex(0); setSearchMessage(result.places?.length ? "" : (result.message || ((result.google_configured || result.external_available) ? "No se encontraron lugares. Prueba una dirección más precisa." : "No se encontraron sedes o puntos de entrega. La búsqueda externa de direcciones no está configurada."))); setOpen(true); })
        .catch(() => { if (request === searchRequest.current) { setOptions([]); setSearchMessage("No fue posible buscar lugares. Vuelve a intentarlo."); } })
        .finally(() => { if (request === searchRequest.current) setSearching(false); });
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  function choose(place: PlaceSuggestion) {
    searchRequest.current++; chosenLabel.current = place.label; setSearchMessage(""); onPick(place); setText(place.label); setOpen(false);
  }

  return <div className="relative" ref={rootRef}>
    <span className="mb-1 flex items-center gap-1 text-sm font-semibold"><MapPin size={13} /> {label}</span>
    <input
      aria-label={label}
      role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={Boolean(open && options.length)} aria-activedescendant={open && options.length ? `${listId}-${activeIndex}` : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        if (options.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setOpen(true); setActiveIndex(index => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length); }
        if (event.key === "Enter" && open && options.length) { event.preventDefault(); choose(options[activeIndex] || options[0]); }
      }}
      className={inputClass}
      onChange={(event) => { chosenLabel.current = ""; setSearchMessage(""); setText(event.target.value); onText?.(event.target.value); }}
      onFocus={() => { if (options.length) setOpen(true); }}
      placeholder={placeholder}
      value={text}
    />
    {searching ? <span className="mt-1 block text-[11px] text-content-muted">Buscando…</span> : searchMessage ? <span role="status" className="mt-1 block text-[11px] text-content-muted">{searchMessage}</span> : null}
    {open && options.length ? <ul id={listId} className="absolute z-[600] mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-overlay" role="listbox">
      {options.map((place, index) => <li role="option" aria-selected={index === activeIndex} id={`${listId}-${index}`} key={`${place.latitude}-${place.longitude}-${index}`}>
        <button className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => choose(place)} type="button">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{place.label}</span>
            <span className="block text-[11px] text-content-muted">{place.source === "sede" ? "Sede del tenant" : place.source === "punto_entrega" ? "Punto de entrega" : place.source === "photon" ? "OpenStreetMap · Photon" : "Google"}</span>
          </span>
        </button>
      </li>)}
    </ul> : null}
  </div>;
}

function ToggleBlock({ enabled, label, onToggle, children }: { enabled: boolean; label: string; onToggle: (enabled: boolean) => void; children: React.ReactNode }) {
  const Icon = label === "Paradas adicionales" ? MapPin : label === "Peajes" ? Route : label === "Tiempo de espera" ? Clock : label === "Cargue y descargue" ? Truck : FileText;
  const compact = label === "Peajes" || label === "Cargue y descargue" || label === "Otros costos";
  const compactChild = Array.isArray(children) ? children.find(child => isValidElement<{ name?: string }>(child) && child.props.name === "other_costs_amount") : children;
  const compactField = compact && isValidElement<{ compact?: boolean; disabled?: boolean }>(compactChild) ? cloneElement(compactChild, { compact: true, disabled: !enabled }) : null;
  return <div className={styles.extraRow}>
    <div className="flex items-center justify-between gap-2">

      <button aria-label={`Activar ${label}`} aria-pressed={enabled} className={`relative h-5 w-10 rounded-full transition-colors ${enabled ? "bg-apex" : "bg-line"}`} onClick={() => onToggle(!enabled)} type="button">
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${enabled ? "left-5" : "left-0.5"}`} />
      </button>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-content-strong"><span className="rounded-lg bg-blue-50 p-2 text-blue-800 dark:bg-slate-800 dark:text-blue-300"><Icon size={19} /></span>{label}</span>
      {compactField ? <div className="w-28 shrink-0">{compactField}</div> : null}
    </div>
    {enabled && (!compact || label === "Otros costos") ? <div className={`mt-2.5 grid gap-3 ${label === "Paradas adicionales" ? "grid-cols-2" : ""}`}>{compact && Array.isArray(children) ? children.filter(child => child !== compactChild) : children}</div> : null}
  </div>;
}

function NumField({ label, hint, unit, name, value, onChange, compact, disabled }: { label: string; hint?: string; unit: string; name: string; value: string; onChange: (value: string) => void; compact?: boolean; disabled?: boolean }) {
  return <label className="block">
    <span className={compact ? "sr-only" : "mb-1 flex items-center gap-1 text-sm font-semibold"}>{label}{hint ? <Info size={12} className="shrink-0 text-content-muted" aria-label={hint} role="img"><title>{hint}</title></Info> : null}</span>
    <span className="flex items-center gap-2">
      <input disabled={disabled} placeholder="0" className={`${inputClass} tabular-nums disabled:opacity-40`} inputMode="decimal" min="0" name={name} onChange={(event) => onChange(event.target.value)} type="number" step="any" value={value} />
      <span className="whitespace-nowrap text-xs text-content-muted">{unit}</span>
    </span>
  </label>;
}

function SummaryIcon({ label }: { label: string }) {
  const Icon = label.includes("paradas") ? MapPin : label === "Peajes" ? Route : label === "Tiempo de espera" ? Clock : label === "Cargue y descargue" ? Truck : label === "Otros costos" ? FileText : Coins;
  return <Icon size={19} className="shrink-0" aria-hidden="true" />;
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return <h3 className="mb-1 text-lg font-bold text-content-strong">{index}. {title}</h3>;
}
