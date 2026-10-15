"use client";

import { api, isActiveMasterItem, loadVehicleMasterCatalogs } from "@/lib/api";
import type { VehicleMasterCatalogs } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { BadgeDollarSign, Check, CheckCircle2, ChevronLeft, ChevronRight, CopyPlus, Pencil, Plus, RefreshCw } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/feedback";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Carrier = { id: number; legal_name: string };
type Origin = { id: number; code: string; name: string; city: string };
type OriginFormValues = { code: string; name: string; address: string; city: string; department?: string; latitude: number; longitude: number };
type VehicleOption = { id: number; plate: string; type?: string | null; ownership_type?: string | null; base_site?: string | null };
type RateCard = {
  id: number; code: string; version: number; name: string; status: string; carrier_id?: number; origin_id?: number;
  origin_department?: string; origin_city?: string; origin_municipality?: string;
  destination_city?: string; destination_department?: string; destination_municipality?: string; service_level?: string; vehicle_type?: string;
  valid_from: string; valid_to: string; currency: string; base_rate: number; minimum_charge: number;
  price_per_km: number; price_per_kg: number; price_per_m3: number; price_per_stop: number;
  fuel_surcharge_pct: number; tolls_flat: number; carrier?: Carrier; origin?: Origin;
  metadata?: { applies_to?: string; vehicle_id?: number; vehicle_plate?: string | null } | null;
};

type RateDraft = {
  code: string; name: string;
  transport_mode: "flota_propia" | "terceros"; carrier_id: string; vehicle_id: string; origin_id: string;
  origin_department: string; origin_city: string; origin_municipality: string;
  destination_department: string; destination_city: string; destination_municipality: string;
  service_level: string; vehicle_type: string;
  valid_from: string; valid_to: string; currency: string;
  base_rate: string; minimum_charge: string; price_per_km: string; price_per_kg: string;
  price_per_m3: string; price_per_stop: string; fuel_surcharge_pct: string; tolls_flat: string;
};

const inputClass = "h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-apex";
const money = (value: number, currency = "COP") => new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));

const WIZARD_STEPS = [
  { title: "Identificación", help: "Cómo reconocerás esta tarifa en los listados y en la liquidación." },
  { title: "Ámbito geográfico", help: "Filtra dónde aplica la tarifa. Si dejas todo en \"cualquiera\", aplica a nivel nacional." },
  { title: "Transporte y vigencia", help: "Quién transporta (flota propia o terceros), qué tipo de operación cubre y durante qué fechas está vigente." },
  { title: "Cálculo del costo", help: "Completa solo los componentes que uses. El total suma los que apliquen, agrega el recargo de combustible sobre el subtotal y nunca baja del cobro mínimo." },
];

const emptyDraft: RateDraft = {
  code: "", name: "",
  transport_mode: "flota_propia", carrier_id: "", vehicle_id: "", origin_id: "",
  origin_department: "", origin_city: "", origin_municipality: "",
  destination_department: "", destination_city: "", destination_municipality: "",
  service_level: "", vehicle_type: "",
  valid_from: "", valid_to: "", currency: "COP",
  base_rate: "", minimum_charge: "", price_per_km: "", price_per_kg: "",
  price_per_m3: "", price_per_stop: "", fuel_surcharge_pct: "", tolls_flat: "",
};

export default function TransportRatesPage() {
  const [rates, setRates] = useState<RateCard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [masters, setMasters] = useState<VehicleMasterCatalogs | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RateCard | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canWrite = hasStoredRolePermission("transport", "write");
  const canEditRates = canWrite || hasStoredRolePermission("transport", "manage_rates");

  const load = useCallback(async () => {
    try {
      const [rateRows, carrierRows, vehicleRows, originRows, masterCatalogs] = await Promise.all([
        api<RateCard[]>("/api/v1/transport/rate-cards?include_inactive=true"),
        api<Carrier[]>("/api/v1/transport/carriers"), api<VehicleOption[]>("/api/v1/transport/vehicles"),
        api<Origin[]>("/api/v1/transport/origins"),
        loadVehicleMasterCatalogs()
      ]);
      setRates(rateRows); setCarriers(carrierRows); setVehicles(vehicleRows); setOrigins(originRows); setMasters(masterCatalogs); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible cargar los tarifarios."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createRate(draft: RateDraft) {
    try {
      await api("/api/v1/transport/rate-cards", { method: "POST", body: JSON.stringify(ratePayload(draft, vehicles)) });
      setOpen(false); setMessage("Tarifario creado y publicado con vigencia controlada."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible crear el tarifario."); }
  }

  function startEdit(rate: RateCard) {
    setEditing(rate); setOpen(true);
  }

  async function updateRate(draft: RateDraft) {
    if (!editing) return;
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
  }

  function closeWizard() {
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
        carrier_id: rate.carrier_id || undefined, origin_id: rate.origin_id || undefined
      })
    });
    setMessage(`Nueva versión en borrador creada para ${rate.code}.`); await load();
  }

  async function createOrigin(input: OriginFormValues): Promise<Origin> {
    const created = await api<Origin>("/api/v1/transport/origins", { method: "POST", body: JSON.stringify(input) });
    const originRows = await api<Origin[]>("/api/v1/transport/origins");
    setOrigins(originRows);
    return created;
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Costeo y contratacion</p><h1 className="mt-1 text-3xl font-semibold">Tarifarios de transporte</h1><p className="mt-2 text-sm text-content-muted">Vigencias, versiones y reglas de costo comparables por origen, destino, servicio y vehículo.</p></div>
      <div className="flex gap-2"><button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold" onClick={() => void load()}><RefreshCw size={16} />Actualizar</button>{canWrite ? <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => setOpen(true)}><Plus size={16} />Nuevo tarifario</button> : null}</div>
    </header>
    {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      {!rates.length ? <EmptyState description={canWrite ? "Crea la primera regla para habilitar comparaciones automáticas de costo, cobertura y nivel de servicio." : "Todavía no hay reglas tarifarias disponibles. Solicita acceso de escritura para configurar la primera."} icon={<BadgeDollarSign size={22} />} primaryAction={canWrite ? <button className="rounded-md bg-apex px-4 py-2 text-sm font-semibold text-white" onClick={() => setOpen(true)} type="button">Crear primer tarifario</button> : undefined} title="Aún no hay tarifarios de transporte" /> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-surface-muted text-xs uppercase text-content-muted"><tr><th className="p-3">Tarifa</th><th>Alcance</th><th>Vigencia</th><th>Componentes</th><th>Estado</th><th></th></tr></thead><tbody>
        {rates.map((rate) => <tr className="border-t border-line" key={rate.id}><td className="p-3"><p className="font-semibold">{rate.code} · v{rate.version}</p><p className="text-xs text-content-muted">{rate.name} · {rateTransporterLabel(rate)}</p></td><td><p>{rateOriginLabel(rate)} → {rateDestinationLabel(rate)}</p><p className="text-xs text-content-muted">{rate.service_level || "Cualquier servicio"} · {rate.vehicle_type || "Cualquier vehículo"}</p></td><td><p>{new Date(rate.valid_from).toLocaleDateString()} – {new Date(rate.valid_to).toLocaleDateString()}</p><p className="text-xs text-content-muted">Mínimo {money(rate.minimum_charge, rate.currency)}</p></td><td><p>Base {money(rate.base_rate, rate.currency)} + {money(rate.price_per_km, rate.currency)}/km</p><p className="text-xs text-content-muted">kg {money(rate.price_per_kg, rate.currency)} · m³ {money(rate.price_per_m3, rate.currency)} · parada {money(rate.price_per_stop, rate.currency)}</p></td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${rate.status === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{rate.status}</span></td><td><div className="flex justify-end gap-2 pr-3">{canEditRates ? <button aria-label="Editar tarifario" className="rounded-md border border-line p-2 text-apex" onClick={() => startEdit(rate)}><Pencil size={16} /></button> : null}{canEditRates && rate.status === "borrador" ? <button aria-label="Activar tarifario" className="rounded-md border border-line p-2 text-apex" onClick={() => void activate(rate)}><CheckCircle2 size={16} /></button> : null}{canEditRates ? <button aria-label="Crear nueva version" className="rounded-md border border-line p-2 text-apex" onClick={() => void version(rate)}><CopyPlus size={16} /></button> : null}</div></td></tr>)}
      </tbody></table></div>}
    </section>
    {open ? <ModalFrame maxWidth="md:max-w-3xl" onClose={closeWizard} title={editing ? `Editar tarifario ${editing.code} · v${editing.version}` : "Nuevo tarifario"}>
      <RateWizard carriers={carriers} vehicles={vehicles} origins={origins} masters={masters} initial={editing ? draftFromRate(editing, vehicles) : null} lockedCode={Boolean(editing)} submitLabel={editing ? (editing.status === "borrador" ? "Guardar cambios" : "Guardar como nueva version") : "Crear y activar"} onSubmit={editing ? updateRate : createRate} onCancel={closeWizard} canCreateOrigin={canWrite} onCreateOrigin={createOrigin} />
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
  return {
    code: draft.code, name: draft.name,
    carrier_id: !isFleet && draft.carrier_id ? Number(draft.carrier_id) : undefined,
    metadata: isFleet
      ? { applies_to: "flota_propia", vehicle_id: vehicle?.id ?? null, vehicle_plate: vehicle?.plate ?? null }
      : { applies_to: "terceros" },
    origin_id: draft.origin_id ? Number(draft.origin_id) : undefined,
    origin_department: draft.origin_department, origin_city: draft.origin_city, origin_municipality: draft.origin_municipality,
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
  const isFleet = rate.metadata?.applies_to ? rate.metadata.applies_to === "flota_propia" : !rate.carrier_id;
  const vehicleId = rate.metadata?.vehicle_id ? String(rate.metadata.vehicle_id) : "";
  return {
    code: rate.code, name: rate.name,
    transport_mode: isFleet ? "flota_propia" : "terceros",
    carrier_id: rate.carrier_id ? String(rate.carrier_id) : "",
    vehicle_id: vehicleId && vehicles.some((row) => String(row.id) === vehicleId) ? vehicleId : "",
    origin_id: rate.origin_id ? String(rate.origin_id) : "",
    origin_department: rate.origin_department || "", origin_city: rate.origin_city || "", origin_municipality: rate.origin_municipality || "",
    destination_department: rate.destination_department || "", destination_city: rate.destination_city || "", destination_municipality: rate.destination_municipality || "",
    service_level: rate.service_level || "", vehicle_type: rate.vehicle_type || "",
    valid_from: rate.valid_from ? rate.valid_from.slice(0, 10) : "", valid_to: rate.valid_to ? rate.valid_to.slice(0, 10) : "",
    currency: rate.currency || "COP",
    base_rate: String(rate.base_rate ?? ""), minimum_charge: String(rate.minimum_charge ?? ""),
    price_per_km: String(rate.price_per_km ?? ""), price_per_kg: String(rate.price_per_kg ?? ""),
    price_per_m3: String(rate.price_per_m3 ?? ""), price_per_stop: String(rate.price_per_stop ?? ""),
    fuel_surcharge_pct: String(rate.fuel_surcharge_pct ?? ""), tolls_flat: String(rate.tolls_flat ?? "")
  };
}

function geoScopeLabel(parts: Array<string | undefined>) {
  const filled = parts.filter(Boolean) as string[];
  return filled.join(" / ");
}

function rateOriginLabel(rate: RateCard) {
  const geo = geoScopeLabel([rate.origin_department, rate.origin_city, rate.origin_municipality]);
  if (rate.origin?.name) return geo ? `${rate.origin.name} (${geo})` : rate.origin.name;
  return geo || "Cualquier origen";
}

function rateDestinationLabel(rate: RateCard) {
  return geoScopeLabel([rate.destination_department, rate.destination_city, rate.destination_municipality]) || "Red nacional";
}

function RateWizard({ carriers, vehicles, origins, masters, initial, lockedCode, submitLabel, onSubmit, onCancel, canCreateOrigin, onCreateOrigin }: { carriers: Carrier[]; vehicles: VehicleOption[]; origins: Origin[]; masters: VehicleMasterCatalogs | null; initial?: RateDraft | null; lockedCode?: boolean; submitLabel?: string; onSubmit: (draft: RateDraft) => void; onCancel: () => void; canCreateOrigin?: boolean; onCreateOrigin?: (input: OriginFormValues) => Promise<Origin> }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RateDraft>(initial ?? emptyDraft);
  const [originFormOpen, setOriginFormOpen] = useState(false);
  const [example, setExample] = useState({ km: "415", kg: "2400", m3: "12", stops: "3" });
  const set = (key: keyof RateDraft) => (value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  const setExampleValue = (key: keyof typeof example) => (value: string) => setExample((previous) => ({ ...previous, [key]: value }));

  const departments = (masters?.departments || []).filter(isActiveMasterItem);
  const citiesForDepartment = (departmentName: string) => {
    const code = departments.find((item) => item.name === departmentName)?.code;
    return (masters?.cities || []).filter((item) => isActiveMasterItem(item) && (!code || item.parent_code === code));
  };
  const municipalitiesForCities = (cities: ReturnType<typeof citiesForDepartment>) => {
    const codes = new Set(cities.map((item) => item.code));
    return (masters?.municipalities || []).filter((item) => isActiveMasterItem(item) && (!codes.size || codes.has(item.parent_code)));
  };
  const originCities = citiesForDepartment(draft.origin_department);
  const originMunicipalities = municipalitiesForCities(draft.origin_city ? originCities.filter((item) => item.name === draft.origin_city) : originCities);
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
    return "";
  }, [step, draft]);

  const canAdvance = stepError === "";
  const calculation = useMemo(() => calculateExample(draft, example), [draft, example]);
  const currency = draft.currency || "COP";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < WIZARD_STEPS.length - 1) { if (canAdvance) setStep((value) => value + 1); return; }
    if (!canAdvance) return;
    onSubmit(draft);
  }

  const originScope = geoScopeLabel([draft.origin_department, draft.origin_city, draft.origin_municipality]) || "cualquier origen";
  const destinationScope = geoScopeLabel([draft.destination_department, draft.destination_city, draft.destination_municipality]) || "cualquier destino";
  const selectedVehicle = fleetVehicles.find((vehicle) => String(vehicle.id) === draft.vehicle_id);
  const transporterLabel = draft.transport_mode === "flota_propia"
    ? `Flota propia${selectedVehicle ? ` · ${selectedVehicle.plate}` : ""}`
    : carriers.find((row) => String(row.id) === draft.carrier_id)?.legal_name || "Terceros (sin transportadora)";
  const lastStep = step === WIZARD_STEPS.length - 1;

  return <form onSubmit={handleSubmit}>
    <ol className="mb-5 flex items-center gap-1 sm:gap-2">
      {WIZARD_STEPS.map((item, index) => <li className="flex flex-1 items-center gap-2" key={item.title}>
        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border text-xs font-bold ${index < step ? "border-apex bg-apex text-white" : index === step ? "border-apex text-apex" : "border-line text-content-muted"}`}>{index < step ? <Check size={14} /> : index + 1}</span>
        <span className={`hidden text-xs font-semibold md:block ${index === step ? "text-content-strong" : "text-content-muted"}`}>{item.title}</span>
        {index < WIZARD_STEPS.length - 1 ? <span className={`h-px flex-1 ${index < step ? "bg-apex" : "bg-line"}`} /> : null}
      </li>)}
    </ol>

    <div className="mb-1 flex items-center gap-2">
      <h3 className="text-base font-semibold text-content-strong">{WIZARD_STEPS[step].title}</h3>
      <span className="text-xs text-content-muted">Paso {step + 1} de {WIZARD_STEPS.length}</span>
    </div>
    <p className="mb-4 text-sm text-content-muted">{WIZARD_STEPS[step].help}</p>

    {step === 0 ? <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Código de tarifa" name="code" value={draft.code} onChange={set("code")} placeholder="Ej: TRJ-AND-001" required autoFocus disabled={lockedCode} />
      <Field label="Nombre descriptivo" name="name" value={draft.name} onChange={set("name")} placeholder="Ej: Flete flota propia Bogotá → Medellín" required />
    </div> : null}

    {step === 1 ? <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface-muted p-3">
        <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
          <GeoCascade title="Origen" department={draft.origin_department} city={draft.origin_city} municipality={draft.origin_municipality}
            departments={departments} cities={originCities} municipalities={originMunicipalities}
            onDepartment={(value) => setDraft((p) => ({ ...p, origin_department: value, origin_city: "", origin_municipality: "" }))}
            onCity={(value) => setDraft((p) => ({ ...p, origin_city: value, origin_municipality: "" }))}
            onMunicipality={set("origin_municipality")} />
          <div className="hidden justify-self-center pt-8 text-apex md:block"><ChevronRight size={20} /></div>
          <GeoCascade title="Destino" department={draft.destination_department} city={draft.destination_city} municipality={draft.destination_municipality}
            departments={departments} cities={destinationCities} municipalities={destinationMunicipalities}
            onDepartment={(value) => setDraft((p) => ({ ...p, destination_department: value, destination_city: "", destination_municipality: "" }))}
            onCity={(value) => setDraft((p) => ({ ...p, destination_city: value, destination_municipality: "" }))}
            onMunicipality={set("destination_municipality")} />
        </div>
      </div>
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Aplica a: <b>{originScope}</b> → <b>{destinationScope}</b>{!draft.origin_department && !draft.destination_department ? " (nacional)" : ""}.</p>
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
      <div className="text-sm">
        <span className="mb-1 flex items-center justify-between gap-2">
          <span className="block font-medium">Origen operativo (sede)</span>
          {canCreateOrigin && onCreateOrigin ? <button aria-label="Crear nuevo origen operativo" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs font-semibold text-apex" onClick={() => setOriginFormOpen((value) => !value)} type="button"><Plus size={12} />Nuevo</button> : null}
        </span>
        <select className={`${inputClass} apex-select`} name="origin_id" onChange={(event) => set("origin_id")(event.target.value)} value={draft.origin_id}>
          <option value="">Cualquier origen</option>
          {origins.map((row) => <option key={row.id} value={row.id}>{`${row.code} · ${row.name}`}</option>)}
        </select>
        {originFormOpen && onCreateOrigin ? <OriginQuickCreate onCancel={() => setOriginFormOpen(false)} onCreated={(origin) => { setDraft((previous) => ({ ...previous, origin_id: String(origin.id) })); setOriginFormOpen(false); }} onSubmit={onCreateOrigin} /> : null}
      </div>
      <Select label="Nivel de servicio" name="service_level" options={serviceLevels.map((item) => [item.name, item.name])} empty="Cualquier servicio" value={draft.service_level} onChange={set("service_level")} />
      <Select label="Tipo de vehículo" name="vehicle_type" options={vehicleTypes.map((item) => [item.name, item.name])} empty="Cualquier vehículo" value={draft.vehicle_type} onChange={set("vehicle_type")} />
      <Field label="Válida desde" name="valid_from" type="date" value={draft.valid_from} onChange={set("valid_from")} required />
      <Field label="Válida hasta" name="valid_to" type="date" value={draft.valid_to} onChange={set("valid_to")} required />
      <Select label="Moneda" name="currency" options={currencies.map((item) => [item.code, item.name])} value={draft.currency} onChange={set("currency")} />
    </div> : null}

    {step === 3 ? <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <CostField label="Cargo base" hint="Valor fijo que se cobra en cada servicio." unit={currency} name="base_rate" value={draft.base_rate} onChange={set("base_rate")} />
        <CostField label="Precio por kilómetro" hint="Se multiplica por la distancia del viaje." unit={`${currency} / km`} name="price_per_km" value={draft.price_per_km} onChange={set("price_per_km")} />
        <CostField label="Precio por kilogramo" hint="Se multiplica por el peso facturable." unit={`${currency} / kg`} name="price_per_kg" value={draft.price_per_kg} onChange={set("price_per_kg")} />
        <CostField label="Precio por m³" hint="Se multiplica por el volumen facturable." unit={`${currency} / m³`} name="price_per_m3" value={draft.price_per_m3} onChange={set("price_per_m3")} />
        <CostField label="Precio por parada" hint="Por cada entrega o parada de la ruta." unit={`${currency} / parada`} name="price_per_stop" value={draft.price_per_stop} onChange={set("price_per_stop")} />
        <CostField label="Peajes" hint="Valor plano estimado de peajes del recorrido." unit={currency} name="tolls_flat" value={draft.tolls_flat} onChange={set("tolls_flat")} />
        <CostField label="Recargo combustible" hint="Porcentaje que se suma sobre el subtotal." unit="%" name="fuel_surcharge_pct" value={draft.fuel_surcharge_pct} onChange={set("fuel_surcharge_pct")} />
        <CostField label="Cobro mínimo" hint="Piso garantizado: si el cálculo da menos, se cobra esto." unit={currency} name="minimum_charge" value={draft.minimum_charge} onChange={set("minimum_charge")} />
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-line bg-surface-muted p-3 text-xs leading-relaxed text-content-muted">
          <p className="font-semibold text-content-strong">{draft.code || "Sin código"}</p>
          <p>{transporterLabel} · {draft.service_level || "cualquier servicio"} · {draft.vehicle_type || "cualquier vehículo"}</p>
          <p>{originScope} → {destinationScope}</p>
          <p>{draft.valid_from && draft.valid_to ? `Vigente: ${new Date(`${draft.valid_from}T00:00:00`).toLocaleDateString()} – ${new Date(`${draft.valid_to}T00:00:00`).toLocaleDateString()}` : "Sin vigencia definida"} · {currency}</p>
        </div>
        <div className="rounded-xl bg-[#0f1c33] p-3 text-[#dbe6ff]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8fb4ff]">Ejemplo en vivo</p>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            <ExampleInput label="km" value={example.km} onChange={setExampleValue("km")} />
            <ExampleInput label="kg" value={example.kg} onChange={setExampleValue("kg")} />
            <ExampleInput label="m³" value={example.m3} onChange={setExampleValue("m3")} />
            <ExampleInput label="paradas" value={example.stops} onChange={setExampleValue("stops")} />
          </div>
          <div className="space-y-1 text-xs">
            {calculation.lines.map((line) => <div className="flex justify-between gap-3" key={line.label}><span>{line.label}</span><span className="tabular-nums">{money(line.value, currency)}</span></div>)}
            <div className="flex justify-between gap-3 border-t border-[#2c3d63] pt-1"><span>Subtotal</span><span className="tabular-nums">{money(calculation.subtotal, currency)}</span></div>
            {calculation.fuel > 0 ? <div className="flex justify-between gap-3"><span>Combustible {draft.fuel_surcharge_pct || "0"}%</span><span className="tabular-nums">{money(calculation.fuel, currency)}</span></div> : null}
            <div className="flex justify-between gap-3 pt-1 text-sm font-bold"><span>Total del ejemplo</span><span className="text-[#5be49b] tabular-nums">{money(calculation.total, currency)}</span></div>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[#8fb4ff]">{calculation.minimumApplied
            ? `El cobro mínimo (${money(calculation.minimum, currency)}) es mayor que el cálculo: se cobraría el mínimo.`
            : `Por encima del cobro mínimo (${money(calculation.minimum, currency)}).`}</p>
        </div>
      </div>
    </div> : null}

    {stepError ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{stepError}</p> : null}

    <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
      <button className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm font-semibold" onClick={onCancel} type="button">Cancelar</button>
      <div className="flex gap-2">
        {step > 0 ? <button className="inline-flex h-10 items-center gap-1 rounded-md border border-line px-3 text-sm font-semibold" onClick={() => setStep((value) => value - 1)} type="button"><ChevronLeft size={16} />Atrás</button> : null}
        {lastStep
          ? <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={!canAdvance} type="submit"><BadgeDollarSign size={16} />{submitLabel || "Crear y activar"}</button>
          : <button className="inline-flex h-10 items-center gap-1 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={!canAdvance} type="submit">Siguiente<ChevronRight size={16} /></button>}
      </div>
    </div>
  </form>;
}

function calculateExample(draft: RateDraft, example: { km: string; kg: string; m3: string; stops: string }) {
  const num = (value: string) => Number(value || 0);
  const base = num(draft.base_rate);
  const distance = num(draft.price_per_km) * num(example.km);
  const weight = num(draft.price_per_kg) * num(example.kg);
  const volume = num(draft.price_per_m3) * num(example.m3);
  const stops = num(draft.price_per_stop) * num(example.stops);
  const tolls = num(draft.tolls_flat);
  const lines = [
    { label: "Cargo base", value: base, show: base > 0 },
    { label: `${num(example.km)} km`, value: distance, show: distance > 0 },
    { label: `${num(example.kg)} kg`, value: weight, show: weight > 0 },
    { label: `${num(example.m3)} m³`, value: volume, show: volume > 0 },
    { label: `${num(example.stops)} paradas`, value: stops, show: stops > 0 },
    { label: "Peajes", value: tolls, show: tolls > 0 },
  ].filter((line) => line.show);
  const subtotal = base + distance + weight + volume + stops + tolls;
  const fuel = (subtotal * num(draft.fuel_surcharge_pct)) / 100;
  const calculated = subtotal + fuel;
  const minimum = num(draft.minimum_charge);
  const total = Math.max(calculated, minimum);
  return { lines, subtotal, fuel, calculated, minimum, total, minimumApplied: minimum > calculated };
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

function CostField({ label, hint, unit, name, value, onChange }: { label: string; hint: string; unit: string; name: string; value: string; onChange: (value: string) => void }) {
  return <label className="block">
    <span className="mb-1 block text-sm font-semibold">{label}</span>
    <span className="mb-1 block text-xs text-content-muted">{hint}</span>
    <span className="flex items-center gap-2">
      <input className={`${inputClass} text-right tabular-nums`} inputMode="decimal" min="0" name={name} onChange={(event) => onChange(event.target.value)} type="number" step="any" value={value} />
      <span className="whitespace-nowrap text-xs text-content-muted">{unit}</span>
    </span>
  </label>;
}

function ExampleInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block">
    <span className="mb-0.5 block text-center text-[10px] uppercase tracking-wide text-[#8fb4ff]">{label}</span>
    <input aria-label={label} className="h-8 w-full rounded-md border border-[#2c3d63] bg-[#16233d] px-1 text-center text-xs text-[#e8efff] outline-none focus:border-[#4ea1ff]" inputMode="decimal" onChange={(event) => onChange(event.target.value)} type="number" step="any" value={value} />
  </label>;
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

type OriginQuickDraft = { code: string; name: string; address: string; city: string; department: string; latitude: string; longitude: string };

function OriginQuickCreate({ onSubmit, onCreated, onCancel }: { onSubmit: (input: OriginFormValues) => Promise<Origin>; onCreated: (origin: Origin) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<OriginQuickDraft>({ code: "", name: "", address: "", city: "", department: "", latitude: "", longitude: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof OriginQuickDraft) => (value: string) => setDraft((previous) => ({ ...previous, [key]: value }));

  async function save() {
    const latitude = Number(draft.latitude), longitude = Number(draft.longitude);
    if (!draft.code.trim() || !draft.name.trim() || !draft.address.trim() || !draft.city.trim()) { setError("Código, nombre, dirección y ciudad son obligatorios."); return; }
    if (!draft.latitude.trim() || !draft.longitude.trim() || Number.isNaN(latitude) || Number.isNaN(longitude)) { setError("Latitud y longitud deben ser números válidos."); return; }
    setSaving(true); setError("");
    try {
      const created = await onSubmit({ code: draft.code.trim(), name: draft.name.trim(), address: draft.address.trim(), city: draft.city.trim(), department: draft.department.trim() || undefined, latitude, longitude });
      onCreated(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible crear el origen operativo."); setSaving(false);
    }
  }

  return <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface-muted p-3" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } }}>
    <p className="text-xs font-semibold text-content-strong">Nuevo origen operativo</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Código" name="origin_code" value={draft.code} onChange={set("code")} required placeholder="Ej: CEDI-MED" />
      <Field label="Nombre" name="origin_name" value={draft.name} onChange={set("name")} required placeholder="Ej: CEDI Medellín" />
      <Field label="Dirección" name="origin_address" value={draft.address} onChange={set("address")} required />
      <Field label="Ciudad" name="origin_city" value={draft.city} onChange={set("city")} required />
      <Field label="Departamento (opcional)" name="origin_department" value={draft.department} onChange={set("department")} />
      <Field label="Latitud" name="origin_latitude" type="number" value={draft.latitude} onChange={set("latitude")} required placeholder="Ej: 6.2442" />
      <Field label="Longitud" name="origin_longitude" type="number" value={draft.longitude} onChange={set("longitude")} required placeholder="Ej: -75.5736" />
    </div>
    {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p> : null}
    <div className="flex gap-2">
      <button className="rounded-md bg-apex px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={saving} onClick={() => void save()} type="button">{saving ? "Creando…" : "Crear y seleccionar"}</button>
      <button className="rounded-md border border-line px-3 py-2 text-xs font-semibold" onClick={onCancel} type="button">Cancelar</button>
    </div>
  </div>;
}
