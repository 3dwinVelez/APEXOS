"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { Building2, MapPin, Plus, RefreshCw, UserRound, Warehouse } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Carrier = { id: number; code: string; legal_name: string; tax_id?: string; status: string; score: number };
type Driver = { id: number; code: string; document: string; name: string; phone?: string; license_category?: string; license_expires_at?: string; status: string; carrier?: Carrier };
type DeliveryPoint = { id: number; code: string; name: string; address: string; city: string; latitude?: number; longitude?: number; window_start?: string; window_end?: string; appointment_required: boolean };
type Origin = { id: number; code: string; name: string; address: string; city: string; latitude: number; longitude: number; operation_start?: string; operation_end?: string };

const inputClass = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-apex";

export default function TransportMastersPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [panel, setPanel] = useState<"carrier" | "driver" | "origin" | "point" | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const canWrite = hasStoredRolePermission("transport", "write");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [carrierRows, driverRows, originRows, pointRows] = await Promise.all([
        api<Carrier[]>("/api/v1/transport/carriers"), api<Driver[]>("/api/v1/transport/drivers"),
        api<Origin[]>("/api/v1/transport/origins"), api<DeliveryPoint[]>("/api/v1/transport/delivery-points")
      ]);
      setCarriers(carrierRows); setDrivers(driverRows); setOrigins(originRows); setPoints(pointRows); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible cargar los maestros TMS."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitCarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await api("/api/v1/transport/carriers", { method: "POST", body: JSON.stringify({ code: data.get("code"), legal_name: data.get("legal_name"), tax_id: data.get("tax_id"), phone: data.get("phone"), email: data.get("email"), status: "activo" }) });
    setPanel(null); setMessage("Transportadora creada."); await load();
  }

  async function submitDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await api("/api/v1/transport/drivers", { method: "POST", body: JSON.stringify({ code: data.get("code"), document: data.get("document"), name: data.get("name"), phone: data.get("phone"), carrier_id: data.get("carrier_id") ? Number(data.get("carrier_id")) : undefined, license_number: data.get("license_number"), license_category: data.get("license_category"), license_expires_at: data.get("license_expires_at") || undefined, status: "disponible" }) });
    setPanel(null); setMessage("Conductor creado."); await load();
  }

  async function submitPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await api("/api/v1/transport/delivery-points", { method: "POST", body: JSON.stringify({ code: data.get("code"), name: data.get("name"), address: data.get("address"), city: data.get("city"), department: data.get("department"), country: data.get("country") || "CO", latitude: data.get("latitude") ? Number(data.get("latitude")) : null, longitude: data.get("longitude") ? Number(data.get("longitude")) : null, window_start: data.get("window_start"), window_end: data.get("window_end"), service_minutes: Number(data.get("service_minutes") || 30), appointment_required: data.get("appointment_required") === "on" }) });
    setPanel(null); setMessage("Punto de entrega creado."); await load();
  }

  async function submitOrigin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await api("/api/v1/transport/origins", { method: "POST", body: JSON.stringify({ code: data.get("code"), name: data.get("name"), address: data.get("address"), city: data.get("city"), department: data.get("department"), country: data.get("country") || "CO", latitude: Number(data.get("latitude")), longitude: Number(data.get("longitude")), operation_start: data.get("operation_start"), operation_end: data.get("operation_end"), service_minutes: Number(data.get("service_minutes") || 60) }) });
    setPanel(null); setMessage("Origen operativo creado."); await load();
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-apex">Planeacion TMS</p><h1 className="mt-1 text-3xl font-semibold">Maestros logisticos</h1><p className="mt-2 text-sm text-neutral-600">Recursos, origenes y destinos georreferenciados para construir planes viables.</p></div>
      <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold" onClick={() => void load()}><RefreshCw size={16} />Actualizar</button>
    </header>
    {message ? <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</div> : null}
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      <MasterCard icon={<Building2 size={19} />} title="Transportadoras" count={carriers.length} action={() => setPanel("carrier")} canWrite={canWrite}>
        {carriers.map((row) => <Row key={row.id} title={row.legal_name} detail={`${row.code} · ${row.tax_id || "Sin identificacion"}`} state={row.status} />)}
      </MasterCard>
      <MasterCard icon={<UserRound size={19} />} title="Conductores" count={drivers.length} action={() => setPanel("driver")} canWrite={canWrite}>
        {drivers.map((row) => <Row key={row.id} title={row.name} detail={`${row.code} · ${row.carrier?.legal_name || "Flota propia"}`} state={row.status} />)}
      </MasterCard>
      <MasterCard icon={<Warehouse size={19} />} title="Origenes operativos" count={origins.length} action={() => setPanel("origin")} canWrite={canWrite}>
        {origins.map((row) => <Row key={row.id} title={row.name} detail={`${row.address} · ${row.city}`} state="georreferenciado" />)}
      </MasterCard>
      <MasterCard icon={<MapPin size={19} />} title="Puntos de entrega" count={points.length} action={() => setPanel("point")} canWrite={canWrite}>
        {points.map((row) => <Row key={row.id} title={row.name} detail={`${row.address} · ${row.city}`} state={row.latitude == null ? "sin coordenadas" : "georreferenciado"} />)}
      </MasterCard>
    </div>
    {loading ? <p className="text-sm text-neutral-500">Cargando maestros...</p> : null}
    {panel ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-apex">Nuevo maestro</p><h2 className="text-xl font-semibold">{panel === "carrier" ? "Transportadora" : panel === "driver" ? "Conductor" : panel === "origin" ? "Origen operativo" : "Punto de entrega"}</h2></div><button className="text-sm" onClick={() => setPanel(null)}>Cerrar</button></div>
      {panel === "carrier" ? <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitCarrier(event)}><Field name="code" label="Codigo" required /><Field name="legal_name" label="Razon social" required /><Field name="tax_id" label="Identificacion tributaria" /><Field name="phone" label="Telefono" /><Field name="email" label="Correo" type="email" /><Submit /></form> : null}
      {panel === "driver" ? <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitDriver(event)}><Field name="code" label="Codigo" required /><Field name="document" label="Documento" required /><Field name="name" label="Nombre" required /><Field name="phone" label="Telefono" /><label className="text-sm"><span className="mb-1 block font-medium">Transportadora</span><select className={inputClass} name="carrier_id"><option value="">Flota propia</option>{carriers.map((row) => <option key={row.id} value={row.id}>{row.legal_name}</option>)}</select></label><Field name="license_number" label="Licencia" /><Field name="license_category" label="Categoria" /><Field name="license_expires_at" label="Vencimiento" type="date" /><Submit /></form> : null}
      {panel === "origin" ? <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitOrigin(event)}><Field name="code" label="Codigo" required /><Field name="name" label="Nombre" required /><Field name="address" label="Direccion normalizada" required /><Field name="city" label="Ciudad" required /><Field name="department" label="Departamento/estado" /><Field name="country" label="Pais" defaultValue="CO" /><Field name="latitude" label="Latitud" type="number" step="any" required /><Field name="longitude" label="Longitud" type="number" step="any" required /><Field name="operation_start" label="Inicio operacion" type="time" /><Field name="operation_end" label="Fin operacion" type="time" /><Field name="service_minutes" label="Preparacion minutos" type="number" defaultValue="60" /><Submit /></form> : null}
      {panel === "point" ? <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitPoint(event)}><Field name="code" label="Codigo" required /><Field name="name" label="Nombre" required /><Field name="address" label="Direccion normalizada" required /><Field name="city" label="Ciudad" required /><Field name="department" label="Departamento/estado" /><Field name="country" label="Pais" defaultValue="CO" /><Field name="latitude" label="Latitud" type="number" step="any" /><Field name="longitude" label="Longitud" type="number" step="any" /><Field name="window_start" label="Inicio ventana" type="time" /><Field name="window_end" label="Fin ventana" type="time" /><Field name="service_minutes" label="Minutos de servicio" type="number" defaultValue="30" /><label className="flex items-center gap-2 pt-7 text-sm"><input name="appointment_required" type="checkbox" />Requiere cita</label><Submit /></form> : null}
    </div></div> : null}
  </div>;
}

function MasterCard({ icon, title, count, action, canWrite, children }: { icon: React.ReactNode; title: string; count: number; action: () => void; canWrite: boolean; children: React.ReactNode }) {
  return <section className="rounded-xl border border-line bg-white p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-md bg-paper text-apex">{icon}</span><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-neutral-500">{count} registros</p></div></div>{canWrite ? <button aria-label={`Crear ${title}`} className="grid h-9 w-9 place-items-center rounded-md bg-apex text-white" onClick={action}><Plus size={17} /></button> : null}</div><div className="max-h-[420px] space-y-2 overflow-auto">{children}</div></section>;
}

function Row({ title, detail, state }: { title: string; detail: string; state: string }) { return <div className="rounded-md border border-line px-3 py-2"><div className="flex justify-between gap-2"><p className="text-sm font-semibold">{title}</p><span className="text-xs text-neutral-500">{state}</span></div><p className="mt-1 text-xs text-neutral-600">{detail}</p></div>; }
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><input className={inputClass} {...input} /></label>; }
function Submit() { return <div className="sm:col-span-2 flex justify-end pt-2"><button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" type="submit"><Plus size={16} />Guardar</button></div>; }
