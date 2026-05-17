"use client";

import { api } from "@/lib/api";
import { ActionCard } from "@/components/ui/ActionCard";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { AlertTriangle, Fuel, Plus, Save, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Vehicle = {
  id: number;
  plate: string;
  model: string;
  type: string;
  brand: string;
  year: number;
  fuel: string;
  load_capacity: string;
  mileage: number;
  soat_expires: string;
  technical_review_expires: string;
  insurance_expires: string;
  owner: string;
  status: string;
};

const vehicleTypes = [
  { type: "Camion", category: "Carga pesada", fuel: "Diesel", capacity: "5 - 10 toneladas" },
  { type: "Camioneta", category: "Carga mediana", fuel: "Gasolina/Diesel", capacity: "1 - 3 toneladas" },
  { type: "Furgon", category: "Carga cerrada", fuel: "Diesel", capacity: "2 - 5 toneladas" },
  { type: "Moto", category: "Mensajeria", fuel: "Gasolina", capacity: "hasta 50kg" },
  { type: "Otro", category: "Otro tipo", fuel: "", capacity: "" }
];

function expired(date: string) {
  return Boolean(date && new Date(date) < new Date());
}

export default function TransportPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedType, setSelectedType] = useState(vehicleTypes[0]);
  const [message, setMessage] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    plate: "",
    model: "",
    type: "Camion",
    brand: "",
    year: new Date().getFullYear(),
    fuel: "Diesel",
    load_capacity: "5 - 10 toneladas",
    mileage: 0,
    soat_expires: "",
    technical_review_expires: "",
    insurance_expires: "",
    owner: "",
    status: "activo"
  });

  async function load() {
    setVehicles(await api<Vehicle[]>("/api/v1/transport/vehicles").catch(() => []));
  }

  useEffect(() => {
    load();
  }, []);

  function chooseType(type: typeof vehicleTypes[number]) {
    setSelectedType(type);
    setForm((current) => ({ ...current, type: type.type, fuel: type.fuel, load_capacity: type.capacity, model: current.model || type.type }));
  }

  async function save() {
    if (!form.plate) {
      setMessage("La placa es obligatoria.");
      return;
    }
    await api("/api/v1/transport/vehicles", { method: "POST", body: JSON.stringify({ ...form, plate: form.plate.toUpperCase() }) });
    setMessage("Vehículo registrado en el maestro de Transporte.");
    setForm((current) => ({ ...current, plate: "", model: "", brand: "", owner: "", mileage: 0 }));
    setShowNew(false);
    await load();
  }

  const docsRisk = useMemo(() => vehicles.filter((v) => expired(v.soat_expires) || expired(v.technical_review_expires) || expired(v.insurance_expires)).length, [vehicles]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">M-14 · Logística</p>
          <h1 className="text-3xl font-semibold">Transporte</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Maestro transversal de vehículos para rutas, horarios, servicios, logística y seguimiento operativo.</p>
        </div>
        <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => setShowNew(true)} type="button"><Plus size={17} /> Nuevo vehículo</button>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-line bg-white p-4"><Truck className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{vehicles.length}</p><p className="text-sm text-neutral-500">Vehículos</p></div>
        <div className="rounded-md border border-line bg-white p-4"><ShieldCheck className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{vehicles.filter((v) => v.status === "activo").length}</p><p className="text-sm text-neutral-500">Activos</p></div>
        <div className="rounded-md border border-line bg-white p-4"><AlertTriangle className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{docsRisk}</p><p className="text-sm text-neutral-500">Documentos vencidos</p></div>
        <div className="rounded-md border border-line bg-white p-4"><Fuel className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{new Set(vehicles.map((v) => v.type).filter(Boolean)).size}</p><p className="text-sm text-neutral-500">Tipos de flota</p></div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <ActionCard title="Registrar vehículo" detail="Crear placa, tipo, documentos y datos base de operación." icon={Plus} onClick={() => setShowNew(true)} primary />
        <ActionCard title="Revisar vencimientos" detail={`${docsRisk} vehículo(s) con documentos por revisar.`} icon={AlertTriangle} onClick={() => undefined} />
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="mb-4 text-base font-semibold">Flota registrada</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {vehicles.map((vehicle) => {
            const risk = expired(vehicle.soat_expires) || expired(vehicle.technical_review_expires) || expired(vehicle.insurance_expires);
            return (
              <article className={`rounded-md border p-4 ${risk ? "border-red-200 bg-red-50" : "border-line"}`} key={vehicle.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold">{vehicle.plate}</p>
                    <p className="text-sm text-neutral-600">{vehicle.brand} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ""}</p>
                  </div>
                  <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold">{vehicle.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-xs text-neutral-500">Tipo</p><p className="font-semibold">{vehicle.type || "-"}</p></div>
                  <div><p className="text-xs text-neutral-500">Combustible</p><p className="font-semibold">{vehicle.fuel || "-"}</p></div>
                  <div><p className="text-xs text-neutral-500">Capacidad</p><p className="font-semibold">{vehicle.load_capacity || "-"}</p></div>
                </div>
                {risk ? <p className="mt-3 text-xs font-semibold text-red-700">Documento vencido o por revisar.</p> : null}
              </article>
            );
          })}
          {!vehicles.length ? <p className="text-sm text-neutral-500">No hay vehículos registrados.</p> : null}
        </div>
      </section>

      {showNew ? (
        <ModalFrame title="Nuevo vehículo" onClose={() => setShowNew(false)}>
            <div className="grid grid-cols-2 gap-2">
              {vehicleTypes.map((type) => (
                <button className={`rounded-md border p-3 text-left text-sm ${selectedType.type === type.type ? "border-apex bg-paper" : "border-line hover:bg-paper"}`} key={type.type} onClick={() => chooseType(type)} type="button">
                  <span className="font-semibold">{type.type}</span>
                  <span className="mt-1 block text-xs text-neutral-500">{type.category}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Placa" value={form.plate} onChange={(e) => setForm((p) => ({ ...p, plate: e.target.value.toUpperCase() }))} />
              <div className="grid grid-cols-2 gap-2">
                <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Marca" value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} />
                <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Modelo" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
                <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" value={form.year} onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))} />
                <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Combustible" value={form.fuel} onChange={(e) => setForm((p) => ({ ...p, fuel: e.target.value }))} />
              </div>
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Capacidad" value={form.load_capacity} onChange={(e) => setForm((p) => ({ ...p, load_capacity: e.target.value }))} />
              <div className="grid grid-cols-3 gap-2">
                <input className="h-10 rounded-md border border-line px-2 text-xs" type="date" value={form.soat_expires} onChange={(e) => setForm((p) => ({ ...p, soat_expires: e.target.value }))} />
                <input className="h-10 rounded-md border border-line px-2 text-xs" type="date" value={form.technical_review_expires} onChange={(e) => setForm((p) => ({ ...p, technical_review_expires: e.target.value }))} />
                <input className="h-10 rounded-md border border-line px-2 text-xs" type="date" value={form.insurance_expires} onChange={(e) => setForm((p) => ({ ...p, insurance_expires: e.target.value }))} />
              </div>
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={save} type="button"><Save size={16} /> Registrar vehículo</button>
            </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
