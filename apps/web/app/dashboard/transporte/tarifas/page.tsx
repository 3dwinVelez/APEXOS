"use client";

import { api, isActiveMasterItem, loadVehicleMasterCatalogs } from "@/lib/api";
import type { VehicleMasterCatalogs } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { BadgeDollarSign, CheckCircle2, CopyPlus, Plus, RefreshCw } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/feedback";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Carrier = { id: number; legal_name: string };
type Origin = { id: number; code: string; name: string; city: string };
type RateCard = {
  id: number; code: string; version: number; name: string; status: string; carrier_id?: number; origin_id?: number;
  origin_department?: string; origin_city?: string; origin_municipality?: string;
  destination_city?: string; destination_department?: string; destination_municipality?: string; service_level?: string; vehicle_type?: string;
  valid_from: string; valid_to: string; currency: string; base_rate: number; minimum_charge: number;
  price_per_km: number; price_per_kg: number; price_per_m3: number; price_per_stop: number;
  fuel_surcharge_pct: number; tolls_flat: number; carrier?: Carrier; origin?: Origin;
};

const inputClass = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-apex";
const money = (value: number, currency = "COP") => new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));

export default function TransportRatesPage() {
  const [rates, setRates] = useState<RateCard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [masters, setMasters] = useState<VehicleMasterCatalogs | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canWrite = hasStoredRolePermission("transport", "write");

  const load = useCallback(async () => {
    try {
      const [rateRows, carrierRows, originRows, masterCatalogs] = await Promise.all([
        api<RateCard[]>("/api/v1/transport/rate-cards?include_inactive=true"),
        api<Carrier[]>("/api/v1/transport/carriers"), api<Origin[]>("/api/v1/transport/origins"),
        loadVehicleMasterCatalogs()
      ]);
      setRates(rateRows); setCarriers(carrierRows); setOrigins(originRows); setMasters(masterCatalogs); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible cargar los tarifarios."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      await api("/api/v1/transport/rate-cards", { method: "POST", body: JSON.stringify(ratePayload(data)) });
      setOpen(false); setMessage("Tarifario creado y publicado con vigencia controlada."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible crear el tarifario."); }
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

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Costeo y contratacion</p><h1 className="mt-1 text-3xl font-semibold">Tarifarios de transporte</h1><p className="mt-2 text-sm text-neutral-600">Vigencias, versiones y reglas de costo comparables por origen, destino, servicio y vehículo.</p></div>
      <div className="flex gap-2"><button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold" onClick={() => void load()}><RefreshCw size={16} />Actualizar</button>{canWrite ? <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => setOpen(true)}><Plus size={16} />Nuevo tarifario</button> : null}</div>
    </header>
    {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      {!rates.length ? <EmptyState description={canWrite ? "Crea la primera regla para habilitar comparaciones automáticas de costo, cobertura y nivel de servicio." : "Todavía no hay reglas tarifarias disponibles. Solicita acceso de escritura para configurar la primera."} icon={<BadgeDollarSign size={22} />} primaryAction={canWrite ? <button className="rounded-md bg-apex px-4 py-2 text-sm font-semibold text-white" onClick={() => setOpen(true)} type="button">Crear primer tarifario</button> : undefined} title="Aún no hay tarifarios de transporte" /> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="p-3">Tarifa</th><th>Alcance</th><th>Vigencia</th><th>Componentes</th><th>Estado</th><th></th></tr></thead><tbody>
        {rates.map((rate) => <tr className="border-t border-line" key={rate.id}><td className="p-3"><p className="font-semibold">{rate.code} · v{rate.version}</p><p className="text-xs text-neutral-500">{rate.name} · {rate.carrier?.legal_name || "Flota propia"}</p></td><td><p>{rateOriginLabel(rate)} → {rateDestinationLabel(rate)}</p><p className="text-xs text-neutral-500">{rate.service_level || "Cualquier servicio"} · {rate.vehicle_type || "Cualquier vehículo"}</p></td><td><p>{new Date(rate.valid_from).toLocaleDateString()} – {new Date(rate.valid_to).toLocaleDateString()}</p><p className="text-xs text-neutral-500">Mínimo {money(rate.minimum_charge, rate.currency)}</p></td><td><p>Base {money(rate.base_rate, rate.currency)} + {money(rate.price_per_km, rate.currency)}/km</p><p className="text-xs text-neutral-500">kg {money(rate.price_per_kg, rate.currency)} · m³ {money(rate.price_per_m3, rate.currency)} · parada {money(rate.price_per_stop, rate.currency)}</p></td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${rate.status === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{rate.status}</span></td><td><div className="flex justify-end gap-2 pr-3">{canWrite && rate.status === "borrador" ? <button aria-label="Activar tarifario" className="rounded-md border border-line p-2 text-apex" onClick={() => void activate(rate)}><CheckCircle2 size={16} /></button> : null}{canWrite ? <button aria-label="Crear nueva version" className="rounded-md border border-line p-2 text-apex" onClick={() => void version(rate)}><CopyPlus size={16} /></button> : null}</div></td></tr>)}
      </tbody></table></div>}
    </section>
    {open ? <ModalFrame maxWidth="md:max-w-3xl" onClose={() => setOpen(false)} title="Nueva versión tarifaria">
      <p className="mb-3 text-sm text-neutral-600">Regla de cálculo con vigencia controlada. Origen, destino, municipios, niveles de servicio y vehículos se toman de los maestros del módulo; los campos vacíos aplican a cualquier valor.</p>
      <RateForm carriers={carriers} origins={origins} masters={masters} onSubmit={createRate} />
    </ModalFrame> : null}
  </div>;
}

function ratePayload(data: FormData) {
  const optionalNumber = (name: string) => data.get(name) ? Number(data.get(name)) : undefined;
  return {
    code: data.get("code"), name: data.get("name"), carrier_id: optionalNumber("carrier_id"), origin_id: optionalNumber("origin_id"),
    origin_department: data.get("origin_department"), origin_city: data.get("origin_city"), origin_municipality: data.get("origin_municipality"),
    destination_city: data.get("destination_city"), destination_department: data.get("destination_department"), destination_municipality: data.get("destination_municipality"), service_level: data.get("service_level"),
    vehicle_type: data.get("vehicle_type"), valid_from: data.get("valid_from"), valid_to: data.get("valid_to"), currency: data.get("currency") || "COP",
    base_rate: Number(data.get("base_rate") || 0), minimum_charge: Number(data.get("minimum_charge") || 0), price_per_km: Number(data.get("price_per_km") || 0),
    price_per_kg: Number(data.get("price_per_kg") || 0), price_per_m3: Number(data.get("price_per_m3") || 0), price_per_stop: Number(data.get("price_per_stop") || 0),
    fuel_surcharge_pct: Number(data.get("fuel_surcharge_pct") || 0), tolls_flat: Number(data.get("tolls_flat") || 0), status: "activa"
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

function RateForm({ carriers, origins, masters, onSubmit }: { carriers: Carrier[]; origins: Origin[]; masters: VehicleMasterCatalogs | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [currency, setCurrency] = useState("COP");
  const [originDepartment, setOriginDepartment] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [originMunicipality, setOriginMunicipality] = useState("");
  const [destinationDepartment, setDestinationDepartment] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [destinationMunicipality, setDestinationMunicipality] = useState("");
  const departments = (masters?.departments || []).filter(isActiveMasterItem);
  const citiesForDepartment = (departmentName: string) => {
    const code = departments.find((item) => item.name === departmentName)?.code;
    return (masters?.cities || []).filter((item) => isActiveMasterItem(item) && (!code || item.parent_code === code));
  };
  const municipalitiesForCities = (cities: ReturnType<typeof citiesForDepartment>) => {
    const codes = new Set(cities.map((item) => item.code));
    return (masters?.municipalities || []).filter((item) => isActiveMasterItem(item) && (!codes.size || codes.has(item.parent_code)));
  };
  const originCities = citiesForDepartment(originDepartment);
  const originMunicipalities = municipalitiesForCities(originCity ? originCities.filter((item) => item.name === originCity) : originCities);
  const destinationCities = citiesForDepartment(destinationDepartment);
  const destinationMunicipalities = municipalitiesForCities(destinationCity ? destinationCities.filter((item) => item.name === destinationCity) : destinationCities);
  const serviceLevels = (masters?.serviceLevels || []).filter(isActiveMasterItem);
  const vehicleTypes = (masters?.types || []).filter(isActiveMasterItem);
  const currencies = (masters?.currencies || []).filter(isActiveMasterItem);
  return <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={onSubmit}>
    <FormSection title="Identificación" />
    <Field name="code" label="Código de tarifa" required /><Field name="name" label="Nombre" required />
    <FormSection title="Alcance" />
    <Select name="carrier_id" label="Transportadora" options={carriers.map((row) => [row.id, row.legal_name])} empty="Flota propia" />
    <Select name="origin_id" label="Origen operativo (sede)" options={origins.map((row) => [row.id, `${row.code} · ${row.name}`])} empty="Cualquier origen" />
    <FormSection title="Alcance de origen" />
    <Select name="origin_department" label="Departamento origen" options={departments.map((item) => [item.name, item.name])} empty="Cualquier departamento" value={originDepartment} onChange={(value) => { setOriginDepartment(value); setOriginCity(""); setOriginMunicipality(""); }} />
    <Select name="origin_city" label="Ciudad origen" options={originCities.map((item) => [item.name, item.name])} empty="Cualquier ciudad" value={originCity} onChange={(value) => { setOriginCity(value); setOriginMunicipality(""); }} />
    <Select name="origin_municipality" label="Municipio origen" options={originMunicipalities.map((item) => [item.name, item.name])} empty="Cualquier municipio" value={originMunicipality} onChange={setOriginMunicipality} />
    <FormSection title="Alcance de destino" />
    <Select name="destination_department" label="Departamento destino" options={departments.map((item) => [item.name, item.name])} empty="Cualquier departamento" value={destinationDepartment} onChange={(value) => { setDestinationDepartment(value); setDestinationCity(""); setDestinationMunicipality(""); }} />
    <Select name="destination_city" label="Ciudad destino" options={destinationCities.map((item) => [item.name, item.name])} empty="Cualquier ciudad" value={destinationCity} onChange={(value) => { setDestinationCity(value); setDestinationMunicipality(""); }} />
    <Select name="destination_municipality" label="Municipio destino" options={destinationMunicipalities.map((item) => [item.name, item.name])} empty="Cualquier municipio" value={destinationMunicipality} onChange={setDestinationMunicipality} />
    <FormSection title="Servicio y vehículo" />
    <Select name="service_level" label="Nivel de servicio" options={serviceLevels.map((item) => [item.name, item.name])} empty="Cualquier servicio" />
    <Select name="vehicle_type" label="Tipo de vehículo" options={vehicleTypes.map((item) => [item.name, item.name])} empty="Cualquier vehículo" />
    <FormSection title="Vigencia" />
    <Field name="valid_from" label="Válida desde" type="date" required /><Field name="valid_to" label="Válida hasta" type="date" required />
    <Select name="currency" label="Moneda" options={currencies.map((item) => [item.code, item.name])} value={currency} onChange={setCurrency} />
    <FormSection title="Componentes de costo" />
    <Field name="base_rate" label="Cargo base" type="number" min="0" step="any" defaultValue="0" /><Field name="minimum_charge" label="Cobro mínimo" type="number" min="0" step="any" defaultValue="0" />
    <Field name="price_per_km" label="Precio por km" type="number" min="0" step="any" defaultValue="0" /><Field name="price_per_kg" label="Precio por kg" type="number" min="0" step="any" defaultValue="0" />
    <Field name="price_per_m3" label="Precio por m³" type="number" min="0" step="any" defaultValue="0" /><Field name="price_per_stop" label="Precio por parada" type="number" min="0" step="any" defaultValue="0" />
    <Field name="fuel_surcharge_pct" label="Recargo combustible %" type="number" min="0" step="any" defaultValue="0" /><Field name="tolls_flat" label="Peajes fijos" type="number" min="0" step="any" defaultValue="0" />
    <div className="flex justify-end pt-3 sm:col-span-2 lg:col-span-3"><button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white"><BadgeDollarSign size={17} />Crear y activar</button></div>
  </form>;
}

function FormSection({ title }: { title: string }) { return <p className="border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-apex sm:col-span-2 lg:col-span-3">{title}</p>; }

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><input className={inputClass} {...input} /></label>; }
function Select({ name, label, options, empty, value, onChange }: { name: string; label: string; options: Array<[string | number, string]>; empty?: string; value?: string; onChange?: (value: string) => void }) {
  return <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><select className={inputClass} name={name} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined}>
    {empty !== undefined ? <option value="">{empty}</option> : null}
    {options.map(([optionValue, text]) => <option key={String(optionValue)} value={optionValue}>{text}</option>)}
  </select></label>;
}
