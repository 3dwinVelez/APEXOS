"use client";

import costStyles from "@/components/transport/RateCostDesigner.module.css";
import { api, isActiveMasterItem, loadVehicleMasterCatalogs } from "@/lib/api";
import type { VehicleMasterCatalogs } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { BadgeDollarSign, Check, CheckCircle2, ChevronLeft, ChevronRight, CopyPlus, Pencil, Plus, RefreshCw } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/feedback";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { RateCostDesigner } from "@/components/transport/RateCostDesigner";
import type { RateCostDraft, SedeOption } from "@/components/transport/RateCostDesigner";

type Carrier = { id: number; legal_name: string };
type VehicleOption = { id: number; plate: string; type?: string | null; ownership_type?: string | null; base_site?: string | null };
export type RateCard = {
  id: number; code: string; version: number; name: string; status: string; carrier_id?: number;
  destination_city?: string; destination_department?: string; destination_municipality?: string; service_level?: string; vehicle_type?: string;
  valid_from: string; valid_to: string; currency: string; base_rate: number; minimum_charge: number;
  price_per_km: number; price_per_kg: number; price_per_m3: number; price_per_stop: number;
  fuel_surcharge_pct: number; tolls_flat: number; carrier?: Carrier;
  metadata?: {
    applies_to?: string; vehicle_id?: number; vehicle_plate?: string | null;
    tariff_method?: string; load_unit?: string;
    stops_included?: number; wait_time_included_min?: number; wait_time_rate_per_min?: number;
    load_unload_flat?: number; other_costs_amount?: number; other_costs_label?: string;
    costs_enabled?: { stops?: boolean; tolls?: boolean; wait?: boolean; load_unload?: boolean; other?: boolean };
    fuel_mode?: string; fuel_estimated_cost?: number;
    fuel_estimation?: { kind?: string; rendimiento?: number; price_per_liter?: number; extra_pct?: number };
    simulation?: {
      origin_label?: string; origin_latitude?: number | null; origin_longitude?: number | null;
      destination_label?: string; destination_latitude?: number | null; destination_longitude?: number | null;
      round_trip?: boolean; stops?: Array<{ label?: string; latitude?: number | null; longitude?: number | null }>;
      distance_km?: number; duration_minutes?: number; source?: string;
      calculated_distance_km?: number; calculated_source?: string; origin_kind?: string; origin_sede_id?: string;
    } | null;
  } | null;
};

type RateDraft = {
  code: string; name: string;
  transport_mode: "flota_propia" | "terceros"; carrier_id: string; vehicle_id: string;
  destination_department: string; destination_city: string; destination_municipality: string;
  service_level: string; vehicle_type: string;
  valid_from: string; valid_to: string;
} & RateCostDraft;

const inputClass = "h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-apex";
const money = (value: number, currency = "COP") => new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));

const WIZARD_STEPS = [
  { title: "Identificación", help: "Cómo reconocerás esta tarifa en los listados y en la liquidación." },
  { title: "Ámbito geográfico", help: "Filtra a qué destino aplica la tarifa. Si lo dejas todo en \"cualquiera\", aplica a nivel nacional desde cualquier sede." },
  { title: "Transporte y vigencia", help: "Quién transporta (flota propia o terceros), qué tipo de operación cubre y durante qué fechas está vigente." },
  { title: "Cálculo del costo", help: "Elige el método de la tarifa principal, activa los costos adicionales que apliquen y usa el simulador para alimentar distancia y combustible. El resumen calcula en vivo y nunca baja del cobro mínimo." },
];

const emptyDraft: RateDraft = {
  code: "", name: "",
  transport_mode: "flota_propia", carrier_id: "", vehicle_id: "",
  destination_department: "", destination_city: "", destination_municipality: "",
  service_level: "", vehicle_type: "",
  valid_from: "", valid_to: "", currency: "COP",
  base_rate: "", minimum_charge: "", price_per_km: "", price_per_kg: "",
  price_per_m3: "", price_per_stop: "", fuel_surcharge_pct: "", tolls_flat: "",
  tariff_method: "fijo", load_unit: "kg",
  stops_included: "", wait_included_min: "", wait_rate_per_min: "",
  load_unload_flat: "", other_costs_amount: "", other_costs_label: "",
  fuel_mode: "surcharge", fuel_estimated_cost: "",
  billable_km: "", km_source: "",
  preview_load: "1000", preview_wait_min: "30",
  fuel_kind: "gasolina", fuel_rendimiento: "", fuel_precio_litro: "", fuel_extra_pct: "0",
  sim_round_trip: false, sim_stops: [],
  sim_origin_kind: "sede", sim_origin_sede_id: "", sim_origin_label: "",
  sim_origin_lat: null, sim_origin_lng: null,
  sim_destination_label: "", sim_destination_lat: null, sim_destination_lng: null,
  sim_manual_km: false, sim_distance_km: "", sim_duration_min: "", sim_polyline: null, sim_source: "",
};

export default function TransportRatesPage() {
  const [rates, setRates] = useState<RateCard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [sedes, setSedes] = useState<SedeOption[]>([]);
  const [masters, setMasters] = useState<VehicleMasterCatalogs | null>(null);
  const [open, setOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [editing, setEditing] = useState<RateCard | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canWrite = hasStoredRolePermission("transport", "write");
  const canEditRates = canWrite || hasStoredRolePermission("transport", "manage_rates");

  const load = useCallback(async () => {
    try {
      const [rateRows, carrierRows, vehicleRows, sedeRows, masterCatalogs] = await Promise.all([
        api<RateCard[]>("/api/v1/transport/rate-cards?include_inactive=true"),
        api<Carrier[]>("/api/v1/transport/carriers"), api<VehicleOption[]>("/api/v1/transport/vehicles"),
        api<SedeOption[]>("/api/v1/transport/sedes"),
        loadVehicleMasterCatalogs()
      ]);
      setRates(rateRows); setCarriers(carrierRows); setVehicles(vehicleRows); setSedes(sedeRows); setMasters(masterCatalogs); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible cargar los tarifarios."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createRate(draft: RateDraft) {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      await api("/api/v1/transport/rate-cards", { method: "POST", body: JSON.stringify(ratePayload(draft, vehicles)) });
      setOpen(false); setMessage("Tarifario creado y publicado con vigencia controlada."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible crear el tarifario."); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function startEdit(rate: RateCard) {
    setError(""); setEditing(rate); setWizardStep(0); setOpen(true);
  }

  function startCreate() {
    setError(""); setEditing(null); setWizardStep(0); setOpen(true);
  }

  async function updateRate(draft: RateDraft) {
    if (!editing || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    const payload = { ...ratePayload(draft, vehicles), status: "borrador" };
    try {
      if (editing.status === "borrador") {
        await api(`/api/v1/transport/rate-cards/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setMessage(`${editing.code} v${editing.version} quedó actualizado.`);
      } else {
        await api(`/api/v1/transport/rate-cards/${editing.id}/versions`, { method: "POST", body: JSON.stringify(payload) });
        setMessage(`Cambios guardados como nueva version en borrador de ${editing.code}; activala desde el listado para aplicarlos.`);
      }
      setEditing(null); setOpen(false); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible guardar los cambios del tarifario."); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function closeWizard() {
    if (savingRef.current) return;
    setEditing(null); setOpen(false);
  }

  async function activate(rate: RateCard) {
    await api(`/api/v1/transport/rate-cards/${rate.id}/activate`, { method: "POST", body: "{}" });
    setMessage(`${rate.code} v${rate.version} quedó activo.`); await load();
  }

  async function version(rate: RateCard) {
    await api(`/api/v1/transport/rate-cards/${rate.id}/versions`, {
      method: "POST", body: JSON.stringify({
        ...rate, valid_from: rate.valid_from, valid_to: rate.valid_to, status: "borrador",
        carrier_id: rate.carrier_id || undefined
      })
    });
    setMessage(`Nueva versión en borrador creada para ${rate.code}.`); await load();
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Costeo y contratacion</p><h1 className="mt-1 text-3xl font-semibold">Tarifarios de transporte</h1><p className="mt-2 text-sm text-content-muted">Vigencias, versiones y reglas de costo comparables por destino, servicio y vehículo.</p></div>
      <div className="flex gap-2"><button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold" onClick={() => void load()}><RefreshCw size={16} />Actualizar</button>{canWrite ? <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={startCreate}><Plus size={16} />Nuevo tarifario</button> : null}</div>
    </header>
    {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      {!rates.length ? <EmptyState description={canWrite ? "Crea la primera regla para habilitar comparaciones automáticas de costo, cobertura y nivel de servicio." : "Todavía no hay reglas tarifarias disponibles. Solicita acceso de escritura para configurar la primera."} icon={<BadgeDollarSign size={22} />} primaryAction={canWrite ? <button className="rounded-md bg-apex px-4 py-2 text-sm font-semibold text-white" onClick={startCreate} type="button">Crear primer tarifario</button> : undefined} title="Aún no hay tarifarios de transporte" /> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-surface-muted text-xs uppercase text-content-muted"><tr><th className="p-3">Tarifa</th><th>Alcance</th><th>Vigencia</th><th>Componentes</th><th>Estado</th><th></th></tr></thead><tbody>
        {rates.map((rate) => <tr className="border-t border-line" key={rate.id}><td className="p-3"><p className="font-semibold">{rate.code} · v{rate.version}</p><p className="text-xs text-content-muted">{rate.name} · {rateTransporterLabel(rate)}</p></td><td><p>{rateDestinationLabel(rate)}</p><p className="text-xs text-content-muted">{rate.service_level || "Cualquier servicio"} · {rate.vehicle_type || "Cualquier vehículo"}</p></td><td><p>{new Date(rate.valid_from).toLocaleDateString()} – {new Date(rate.valid_to).toLocaleDateString()}</p><p className="text-xs text-content-muted">Mínimo {money(rate.minimum_charge, rate.currency)}</p></td><td><p>Base {money(rate.base_rate, rate.currency)} + {money(rate.price_per_km, rate.currency)}/km</p><p className="text-xs text-content-muted">kg {money(rate.price_per_kg, rate.currency)} · m³ {money(rate.price_per_m3, rate.currency)} · parada {money(rate.price_per_stop, rate.currency)}</p></td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${rate.status === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{rate.status}</span></td><td><div className="flex justify-end gap-2 pr-3">{canEditRates ? <button aria-label="Editar tarifario" className="rounded-md border border-line p-2 text-apex" onClick={() => startEdit(rate)}><Pencil size={16} /></button> : null}{canEditRates && rate.status === "borrador" ? <button aria-label="Activar tarifario" className="rounded-md border border-line p-2 text-apex" onClick={() => void activate(rate)}><CheckCircle2 size={16} /></button> : null}{canEditRates ? <button aria-label="Crear nueva version" className="rounded-md border border-line p-2 text-apex" onClick={() => void version(rate)}><CopyPlus size={16} /></button> : null}</div></td></tr>)}
      </tbody></table></div>}
    </section>
    {open ? <ModalFrame maxWidth={`${wizardStep === 3 ? "md:max-w-[1536px]" : "md:max-w-3xl"} ${wizardStep === 3 ? costStyles.modal : ""}`} onClose={closeWizard} title={editing ? `Editar tarifario ${editing.code} · v${editing.version}` : "Nuevo tarifario"}>
      <RateWizard saving={saving} saveError={error} carriers={carriers} vehicles={vehicles} masters={masters} sedes={sedes} step={wizardStep} onStepChange={setWizardStep} initial={editing ? draftFromRate(editing, vehicles) : null} lockedCode={Boolean(editing)} submitLabel={editing ? (editing.status === "borrador" ? "Guardar cambios" : "Guardar como nueva version") : "Crear y activar"} onSubmit={editing ? updateRate : createRate} onCancel={closeWizard} />
    </ModalFrame> : null}
  </div>;
}

function rateTransporterLabel(rate: RateCard) {
  if (rate.metadata?.applies_to === "flota_propia") return `Flota propia${rate.metadata.vehicle_plate ? ` · ${rate.metadata.vehicle_plate}` : ""}`;
  if (rate.metadata?.applies_to === "terceros") return rate.carrier?.legal_name || "Terceros";
  return rate.carrier?.legal_name || "Flota propia";
}

function ratePayload(draft: RateDraft, vehicles: VehicleOption[]) {
  const numberValue = (value: string) => Number(value || 0);
  const isFleet = draft.transport_mode === "flota_propia";
  const vehicle = vehicles.find((row) => String(row.id) === draft.vehicle_id);
  const metadata: Record<string, unknown> = isFleet
    ? { applies_to: "flota_propia", vehicle_id: vehicle?.id ?? null, vehicle_plate: vehicle?.plate ?? null }
    : { applies_to: "terceros" };
  metadata.tariff_method = draft.tariff_method;
  metadata.costs_enabled = { stops: draft.stops_included !== "" || numberValue(draft.price_per_stop) > 0, tolls: draft.tolls_flat !== "", wait: draft.wait_included_min !== "" || numberValue(draft.wait_rate_per_min) > 0, load_unload: draft.load_unload_flat !== "", other: draft.other_costs_amount !== "" || Boolean(draft.other_costs_label.trim()) };
  if (draft.tariff_method === "por_carga") metadata.load_unit = draft.load_unit;
  if (numberValue(draft.stops_included) > 0) metadata.stops_included = numberValue(draft.stops_included);
  if (numberValue(draft.wait_included_min) > 0) metadata.wait_time_included_min = numberValue(draft.wait_included_min);
  if (numberValue(draft.wait_rate_per_min) > 0) metadata.wait_time_rate_per_min = numberValue(draft.wait_rate_per_min);
  if (numberValue(draft.load_unload_flat) > 0) metadata.load_unload_flat = numberValue(draft.load_unload_flat);
  if (numberValue(draft.other_costs_amount) > 0) {
    metadata.other_costs_amount = numberValue(draft.other_costs_amount);
    if (draft.other_costs_label.trim()) metadata.other_costs_label = draft.other_costs_label.trim();
  }
  if (draft.fuel_mode === "estimated") {
    metadata.fuel_mode = "estimated";
    metadata.fuel_estimated_cost = numberValue(draft.fuel_estimated_cost);
  }
  metadata.fuel_estimation = { kind: draft.fuel_kind, rendimiento: numberValue(draft.fuel_rendimiento), price_per_liter: numberValue(draft.fuel_precio_litro), extra_pct: numberValue(draft.fuel_extra_pct) };
  const simulatedDistance = numberValue(draft.billable_km);
  if (draft.sim_origin_label.trim() || draft.sim_destination_label.trim() || simulatedDistance > 0) {
    metadata.simulation = {
      origin_kind: draft.sim_origin_kind, origin_sede_id: draft.sim_origin_sede_id,
      origin_label: draft.sim_origin_label.trim() || undefined,
      origin_latitude: draft.sim_origin_lat,
      origin_longitude: draft.sim_origin_lng,
      destination_label: draft.sim_destination_label.trim() || undefined,
      destination_latitude: draft.sim_destination_lat,
      destination_longitude: draft.sim_destination_lng,
      round_trip: draft.sim_round_trip,
      stops: draft.sim_stops.filter((stop) => stop.label.trim() || stop.latitude != null).map((stop) => ({ label: stop.label, latitude: stop.latitude, longitude: stop.longitude })),
      distance_km: simulatedDistance,
      calculated_distance_km: numberValue(draft.sim_distance_km), calculated_source: draft.sim_source,
      duration_minutes: numberValue(draft.sim_duration_min),
      source: draft.km_source || undefined
    };
  }
  return {
    code: draft.code, name: draft.name,
    carrier_id: !isFleet && draft.carrier_id ? Number(draft.carrier_id) : undefined,
    metadata,
    destination_city: draft.destination_city, destination_department: draft.destination_department, destination_municipality: draft.destination_municipality,
    service_level: draft.service_level, vehicle_type: draft.vehicle_type,
    valid_from: draft.valid_from, valid_to: draft.valid_to, currency: draft.currency || "COP",
    base_rate: numberValue(draft.base_rate), minimum_charge: numberValue(draft.minimum_charge),
    price_per_km: numberValue(draft.price_per_km), price_per_kg: numberValue(draft.price_per_kg),
    price_per_m3: numberValue(draft.price_per_m3), price_per_stop: numberValue(draft.price_per_stop),
    fuel_surcharge_pct: numberValue(draft.fuel_surcharge_pct), tolls_flat: numberValue(draft.tolls_flat), status: "activa"
  };
}

function draftFromRate(rate: RateCard, vehicles: VehicleOption[]): RateDraft {
  const meta = rate.metadata || {};
  const isFleet = meta.applies_to ? meta.applies_to === "flota_propia" : !rate.carrier_id;
  const vehicleId = meta.vehicle_id ? String(meta.vehicle_id) : "";
  const tariffMethod = meta.tariff_method === "por_km" || meta.tariff_method === "por_carga" ? meta.tariff_method
    : Number(rate.price_per_km) > 0 ? "por_km"
      : Number(rate.price_per_kg) > 0 || Number(rate.price_per_m3) > 0 ? "por_carga" : "fijo";
  const sim = meta.simulation || null;
  return {
    code: rate.code, name: rate.name,
    transport_mode: isFleet ? "flota_propia" : "terceros",
    carrier_id: rate.carrier_id ? String(rate.carrier_id) : "",
    vehicle_id: vehicleId && vehicles.some((row) => String(row.id) === vehicleId) ? vehicleId : "",
    destination_department: rate.destination_department || "", destination_city: rate.destination_city || "", destination_municipality: rate.destination_municipality || "",
    service_level: rate.service_level || "", vehicle_type: rate.vehicle_type || "",
    valid_from: rate.valid_from ? rate.valid_from.slice(0, 10) : "", valid_to: rate.valid_to ? rate.valid_to.slice(0, 10) : "",
    currency: rate.currency || "COP",
    base_rate: String(rate.base_rate ?? ""), minimum_charge: String(rate.minimum_charge ?? ""),
    price_per_km: String(rate.price_per_km ?? ""), price_per_kg: String(rate.price_per_kg ?? ""),
    price_per_m3: String(rate.price_per_m3 ?? ""), price_per_stop: String(rate.price_per_stop ?? ""),
    fuel_surcharge_pct: String(rate.fuel_surcharge_pct ?? ""), tolls_flat: meta.costs_enabled?.tolls === false ? "" : String(rate.tolls_flat ?? ""),
    tariff_method: tariffMethod,
    load_unit: meta.load_unit === "m3" ? "m3" : "kg",
    stops_included: meta.costs_enabled?.stops ? String(meta.stops_included || 0) : meta.stops_included ? String(meta.stops_included) : "",
    wait_included_min: meta.costs_enabled?.wait ? String(meta.wait_time_included_min || 0) : meta.wait_time_included_min ? String(meta.wait_time_included_min) : "",
    wait_rate_per_min: meta.wait_time_rate_per_min ? String(meta.wait_time_rate_per_min) : "",
    load_unload_flat: meta.costs_enabled?.load_unload ? String(meta.load_unload_flat || 0) : meta.load_unload_flat ? String(meta.load_unload_flat) : "",
    other_costs_amount: meta.costs_enabled?.other ? String(meta.other_costs_amount || 0) : meta.other_costs_amount ? String(meta.other_costs_amount) : "",
    other_costs_label: meta.other_costs_label || "",
    fuel_mode: meta.fuel_mode === "estimated" ? "estimated" : "surcharge",
    fuel_estimated_cost: meta.fuel_estimated_cost ? String(meta.fuel_estimated_cost) : "",
    billable_km: sim?.distance_km ? String(sim.distance_km) : "",
    km_source: sim?.source === "google" || sim?.source === "osrm" || sim?.source === "estimate" || sim?.source === "manual" ? sim.source : "",
    preview_load: "1000", preview_wait_min: "30",
    fuel_kind: meta.fuel_estimation?.kind === "acpm" ? "acpm" : "gasolina", fuel_rendimiento: meta.fuel_estimation?.rendimiento ? String(meta.fuel_estimation.rendimiento) : "", fuel_precio_litro: meta.fuel_estimation?.price_per_liter ? String(meta.fuel_estimation.price_per_liter) : "", fuel_extra_pct: String(meta.fuel_estimation?.extra_pct || 0),
    sim_round_trip: Boolean(sim?.round_trip),
    sim_stops: (sim?.stops || []).map((stop, index) => ({ id: `sim-${index}`, label: stop.label || `Parada ${index + 1}`, latitude: stop.latitude ?? null, longitude: stop.longitude ?? null })),
    sim_origin_kind: sim?.origin_kind === "sede" && sim.origin_sede_id ? "sede" : sim?.origin_latitude != null ? "custom" : "sede",
    sim_origin_sede_id: sim?.origin_sede_id || "",
    sim_origin_label: sim?.origin_label || "",
    sim_origin_lat: sim?.origin_latitude ?? null,
    sim_origin_lng: sim?.origin_longitude ?? null,
    sim_destination_label: sim?.destination_label || "",
    sim_destination_lat: sim?.destination_latitude ?? null,
    sim_destination_lng: sim?.destination_longitude ?? null,
    sim_manual_km: sim?.source === "manual",
    sim_distance_km: sim?.calculated_distance_km ? String(sim.calculated_distance_km) : sim?.source !== "manual" && sim?.distance_km ? String(sim.distance_km) : "",
    sim_duration_min: sim?.duration_minutes ? String(sim.duration_minutes) : "",
    sim_polyline: null,
    sim_source: sim?.calculated_source === "google" || sim?.calculated_source === "osrm" || sim?.calculated_source === "estimate" ? sim.calculated_source : sim?.source === "google" || sim?.source === "osrm" || sim?.source === "estimate" ? sim.source : ""
  };
}

function geoScopeLabel(parts: Array<string | undefined>) {
  const filled = parts.filter(Boolean) as string[];
  return filled.join(" / ");
}

function rateDestinationLabel(rate: RateCard) {
  return geoScopeLabel([rate.destination_department, rate.destination_city, rate.destination_municipality]) || "Red nacional";
}

function RateWizard({ saving, saveError, carriers, vehicles, masters, sedes, step, onStepChange, initial, lockedCode, submitLabel, onSubmit, onCancel }: { saving?: boolean; saveError?: string; carriers: Carrier[]; vehicles: VehicleOption[]; masters: VehicleMasterCatalogs | null; sedes: SedeOption[]; step: number; onStepChange: (step: number) => void; initial?: RateDraft | null; lockedCode?: boolean; submitLabel?: string; onSubmit: (draft: RateDraft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<RateDraft>(initial ?? emptyDraft);
  const set = (key: keyof RateDraft) => (value: string) => setDraft((previous) => ({ ...previous, [key]: value }));

  const departments = (masters?.departments || []).filter(isActiveMasterItem);
  const citiesForDepartment = (departmentName: string) => {
    const code = departments.find((item) => item.name === departmentName)?.code;
    return (masters?.cities || []).filter((item) => isActiveMasterItem(item) && (!code || item.parent_code === code));
  };
  const municipalitiesForCities = (cities: ReturnType<typeof citiesForDepartment>) => {
    const codes = new Set(cities.map((item) => item.code));
    return (masters?.municipalities || []).filter((item) => isActiveMasterItem(item) && (!codes.size || codes.has(item.parent_code)));
  };
  const destinationCities = citiesForDepartment(draft.destination_department);
  const destinationMunicipalities = municipalitiesForCities(draft.destination_city ? destinationCities.filter((item) => item.name === draft.destination_city) : destinationCities);
  const serviceLevels = (masters?.serviceLevels || []).filter(isActiveMasterItem);
  const vehicleTypes = (masters?.types || []).filter(isActiveMasterItem);
  const currencies = (masters?.currencies || []).filter(isActiveMasterItem);
  const fleetVehicles = vehicles
    .filter((vehicle) => !vehicle.ownership_type || vehicle.ownership_type === "propio")
    .slice()
    .sort((a, b) => a.plate.localeCompare(b.plate));

  const stepError = useMemo(() => {
    if (step === 0 && (!draft.code.trim() || !draft.name.trim())) return "Escribe el código y el nombre para continuar.";
    if (step === 2) {
      if (draft.transport_mode === "terceros" && !draft.carrier_id) return "Selecciona la transportadora de terceros para continuar.";
      if (!draft.valid_from || !draft.valid_to) return "Indica la vigencia (desde y hasta) para continuar.";
      if (draft.valid_from > draft.valid_to) return "La fecha \"desde\" no puede ser mayor que la \"hasta\".";
    }
    if (step === 3) {
      const unresolved = draft.sim_stops.some(stop => stop.label.trim() && (stop.latitude == null || stop.longitude == null));
      if (unresolved) return "Selecciona una sugerencia para cada parada o elimina las paradas incompletas.";
      if (draft.sim_destination_label.trim() && (draft.sim_destination_lat == null || draft.sim_destination_lng == null)) return "Selecciona el destino en las sugerencias para confirmar su ubicación.";
      if (draft.sim_origin_kind === "custom" && draft.sim_origin_label.trim() && (draft.sim_origin_lat == null || draft.sim_origin_lng == null)) return "Selecciona el origen en las sugerencias para confirmar su ubicación.";
    }
    return "";
  }, [step, draft]);

  const canAdvance = stepError === "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < WIZARD_STEPS.length - 1) { if (canAdvance) onStepChange(step + 1); return; }
    if (!canAdvance || saving) return;
    onSubmit(draft);
  }

  const destinationScope = geoScopeLabel([draft.destination_department, draft.destination_city, draft.destination_municipality]) || "cualquier destino";
  const lastStep = step === WIZARD_STEPS.length - 1;

  return <form onSubmit={handleSubmit}>
    <ol className="mb-5 flex items-center gap-1 sm:gap-2">
      {WIZARD_STEPS.map((item, index) => <li className="flex flex-1 items-center gap-2" key={item.title}>
        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border text-xs font-bold ${index < step ? "border-apex bg-apex text-white" : index === step ? "border-apex text-apex" : "border-line text-content-muted"}`}>{index < step ? <Check size={14} /> : index + 1}</span>
        <span className={`hidden text-xs font-semibold md:block ${index === step ? "text-content-strong" : "text-content-muted"}`}>{item.title}</span>
        {index < WIZARD_STEPS.length - 1 ? <span className={`h-px flex-1 ${index < step ? "bg-apex" : "bg-line"}`} /> : null}
      </li>)}
    </ol>

    <div className={step === 3 ? "sr-only" : "mb-1 flex items-center gap-2"}>
      <h3 className="text-base font-semibold text-content-strong">{WIZARD_STEPS[step].title}</h3>
      <span className="text-xs text-content-muted">Paso {step + 1} de {WIZARD_STEPS.length}</span>
    </div>
    <p className={step === 3 ? "sr-only" : "mb-4 text-sm text-content-muted"}>{WIZARD_STEPS[step].help}</p>

    {step === 0 ? <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Código de tarifa" name="code" value={draft.code} onChange={set("code")} placeholder="Ej: TRJ-AND-001" required autoFocus disabled={lockedCode} />
      <Field label="Nombre descriptivo" name="name" value={draft.name} onChange={set("name")} placeholder="Ej: Flete flota propia Bogotá → Medellín" required />
    </div> : null}

    {step === 1 ? <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface-muted p-3">
        <GeoCascade title="Destino" department={draft.destination_department} city={draft.destination_city} municipality={draft.destination_municipality}
          departments={departments} cities={destinationCities} municipalities={destinationMunicipalities}
          onDepartment={(value) => setDraft((p) => ({ ...p, destination_department: value, destination_city: "", destination_municipality: "" }))}
          onCity={(value) => setDraft((p) => ({ ...p, destination_city: value, destination_municipality: "" }))}
          onMunicipality={set("destination_municipality")} />
      </div>
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Aplica a: <b>{destinationScope}</b>{!draft.destination_department ? " (nacional, desde cualquier sede)" : ""}.</p>
    </div> : null}

    {step === 2 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="sm:col-span-2 lg:col-span-3">
        <span className="mb-1 block text-sm font-medium">¿Quién transporta?</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { id: "flota_propia", label: "Flota propia", desc: "Vehículos registrados en APEXOS" },
            { id: "terceros", label: "Terceros", desc: "Transportadoras contratadas externas" },
          ] as const).map((option) => <button
            aria-pressed={draft.transport_mode === option.id}
            className={`rounded-lg border p-3 text-left transition-colors ${draft.transport_mode === option.id ? "border-apex bg-apex/10" : "border-line bg-surface hover:border-apex/50"}`}
            key={option.id}
            onClick={() => setDraft((previous) => ({ ...previous, transport_mode: option.id, carrier_id: "", vehicle_id: "" }))}
            type="button"
          >
            <span className={`block text-sm font-semibold ${draft.transport_mode === option.id ? "text-apex" : "text-content-strong"}`}>{option.label}</span>
            <span className="mt-0.5 block text-xs text-content-muted">{option.desc}</span>
          </button>)}
        </div>
      </div>
      {draft.transport_mode === "flota_propia"
        ? <Select label="Vehículo de la flota" name="vehicle_id" options={fleetVehicles.map((vehicle) => [vehicle.id, `${vehicle.plate}${vehicle.type ? ` · ${vehicle.type}` : ""}${vehicle.base_site ? ` · ${vehicle.base_site}` : ""}`])} empty="Toda la flota propia" value={draft.vehicle_id} onChange={set("vehicle_id")} />
        : <Select label="Transportadora" name="carrier_id" options={carriers.map((row) => [row.id, row.legal_name])} empty="Selecciona la transportadora…" value={draft.carrier_id} onChange={set("carrier_id")} />}
      <Select label="Nivel de servicio" name="service_level" options={serviceLevels.map((item) => [item.name, item.name])} empty="Cualquier servicio" value={draft.service_level} onChange={set("service_level")} />
      <Select label="Tipo de vehículo" name="vehicle_type" options={vehicleTypes.map((item) => [item.name, item.name])} empty="Cualquier vehículo" value={draft.vehicle_type} onChange={set("vehicle_type")} />
      <Field label="Válida desde" name="valid_from" type="date" value={draft.valid_from} onChange={set("valid_from")} required />
      <Field label="Válida hasta" name="valid_to" type="date" value={draft.valid_to} onChange={set("valid_to")} required />
      <Select label="Moneda" name="currency" options={currencies.map((item) => [item.code, item.name])} value={draft.currency} onChange={set("currency")} />
    </div> : null}

    {step === 3 ? <RateCostDesigner draft={draft} onChange={(patch) => setDraft((previous) => ({ ...previous, ...patch }))} sedes={sedes} /> : null}

    {saveError ? <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{saveError}</p> : null}
    {stepError ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{stepError}</p> : null}

    <div className="sticky bottom-0 z-10 mt-5 flex items-center justify-between gap-2 border-t border-line bg-surface py-3">
      <button className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm font-semibold" disabled={saving} onClick={onCancel} type="button">Cancelar</button>
      <div className="flex gap-2">
        {step > 0 ? <button className="inline-flex h-10 items-center gap-1 rounded-md border border-line px-3 text-sm font-semibold" disabled={saving} onClick={() => onStepChange(step - 1)} type="button"><ChevronLeft size={16} />Atrás</button> : null}
        {lastStep
          ? <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={!canAdvance || saving} type="submit"><BadgeDollarSign size={16} />{saving ? "Guardando…" : submitLabel || "Crear y activar"}</button>
          : <button className="inline-flex h-10 items-center gap-1 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={!canAdvance} type="submit">Siguiente<ChevronRight size={16} /></button>}
      </div>
    </div>
  </form>;
}

function GeoCascade({ title, department, city, municipality, departments, cities, municipalities, onDepartment, onCity, onMunicipality }: {
  title: string; department: string; city: string; municipality: string;
  departments: Array<{ code: string; name: string }>; cities: Array<{ code: string; name: string }>; municipalities: Array<{ code: string; name: string }>;
  onDepartment: (value: string) => void; onCity: (value: string) => void; onMunicipality: (value: string) => void;
}) {
  return <div className="space-y-2">
    <p className="text-xs font-bold uppercase tracking-wide text-apex">{title}</p>
    <select aria-label={`Departamento ${title.toLowerCase()}`} className={`${inputClass} apex-select`} value={department} onChange={(event) => onDepartment(event.target.value)}>
      <option value="">Cualquier departamento</option>
      {departments.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
    </select>
    <select aria-label={`Ciudad ${title.toLowerCase()}`} className={`${inputClass} apex-select`} value={city} onChange={(event) => onCity(event.target.value)}>
      <option value="">Cualquier ciudad</option>
      {cities.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
    </select>
    <select aria-label={`Municipio ${title.toLowerCase()}`} className={`${inputClass} apex-select`} value={municipality} onChange={(event) => onMunicipality(event.target.value)}>
      <option value="">Cualquier municipio</option>
      {municipalities.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
    </select>
  </div>;
}

function Field(props: { label: string; name: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean; autoFocus?: boolean; disabled?: boolean }) {
  const { label, ...input } = props;
  return <label className="text-sm">
    <span className="mb-1 block font-medium">{label}</span>
    <input autoFocus={input.autoFocus} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-content-muted`} disabled={input.disabled} name={input.name} onChange={(event) => input.onChange(event.target.value)} placeholder={input.placeholder} required={input.required} type={input.type || "text"} value={input.value} />
  </label>;
}

function Select({ name, label, options, empty, value, onChange }: { name: string; label: string; options: Array<[string | number, string]>; empty?: string; value?: string; onChange?: (value: string) => void }) {
  return <label className="text-sm">
    <span className="mb-1 block font-medium">{label}</span>
    <select className={`${inputClass} apex-select`} name={name} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined}>
      {empty !== undefined ? <option value="">{empty}</option> : null}
      {options.map(([optionValue, text]) => <option key={String(optionValue)} value={optionValue}>{text}</option>)}
    </select>
  </label>;
}
