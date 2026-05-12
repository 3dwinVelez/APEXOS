"use client";

import { api } from "@/lib/api";
import { getGpsFix } from "@/lib/gps";
import { PhotoCapture, type CapturedFile } from "@/components/operations/PhotoCapture";
import { ArrowLeft, CheckCircle2, Play, Search, Wrench, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ServiceReference = { code: string; name: string; parts: Array<{ id: number; name: string; quantity: number; unit: string }> };
type ServiceOrder = {
  id: number;
  number: string;
  reference: ServiceReference;
  service_type: string;
  status: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  invoice_number: string;
  incidents: Array<{ id: number; description: string; type: string }>;
  photos: Array<{ id: number; type: string }>;
};

const statusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  inspeccion: "Inspeccion",
  ejecucion: "Ejecucion",
  cerrada: "Cerrada",
  no_ejecutada: "No ejecutada"
};

const steps = ["Inicio", "Inspeccion", "Ejecucion", "Cierre"];

function stepForStatus(status: string) {
  if (status === "pendiente") return 1;
  if (status === "en_curso" || status === "inspeccion") return 2;
  if (status === "ejecucion") return 3;
  return 4;
}

export default function ServiceOperationPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [message, setMessage] = useState("");
  const [incident, setIncident] = useState("");
  const [noExecutionReason, setNoExecutionReason] = useState("");
  const [gpsMessage, setGpsMessage] = useState("");
  const [captures, setCaptures] = useState<Record<string, CapturedFile | null>>({});

  async function load() {
    setOrder(await api<ServiceOrder>(`/api/v1/services/orders/${params.id}`));
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [params.id]);

  async function uploadPhoto(type: string, file: CapturedFile | null, metadata: Record<string, unknown> = {}) {
    setCaptures((current) => ({ ...current, [type]: file }));
    if (!file) return;
    await api(`/api/v1/services/orders/${params.id}/photos`, {
      method: "POST",
      body: JSON.stringify({
        type,
        base64_data: file.base64,
        size_bytes: file.size,
        mime_type: file.type,
        file_name: file.name,
        metadata
      })
    });
    setMessage(`Evidencia ${type} cargada.`);
    await load();
  }

  async function update(action: "start" | "inspection" | "execution" | "close" | "close-not-executed") {
    let gps = null;
    if (["start", "close", "close-not-executed"].includes(action)) {
      try {
        setGpsMessage("Obteniendo GPS...");
        gps = await getGpsFix();
        setGpsMessage(`GPS capturado (${Math.round(gps.accuracy_meters || 0)}m).`);
      } catch (error) {
        setGpsMessage(error instanceof Error ? error.message : "GPS obligatorio no disponible.");
        return;
      }
    }
    const body = action === "close-not-executed" ? { no_execution_reason: noExecutionReason || "Cliente no disponible / evidencia pendiente" } : {};
    const updated = await api<ServiceOrder>(`/api/v1/services/orders/${params.id}/${action}`, { method: "PATCH", body: JSON.stringify({ ...body, ...(gps || {}) }) });
    setOrder(updated);
    setMessage(`Orden ${statusLabel[updated.status] || updated.status}.`);
  }

  async function addIncident() {
    if (!incident.trim()) return;
    await api(`/api/v1/services/orders/${params.id}/incidents`, { method: "POST", body: JSON.stringify({ type: "averia", action: "revision", description: incident }) });
    setIncident("");
    setMessage("Novedad registrada.");
    await load();
  }

  const currentStep = useMemo(() => stepForStatus(order.status || "pendiente"), [order.status]);

  if (!order) return <div className="p-6 text-sm text-neutral-500">Cargando servicio...</div>;

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-8">
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <Link className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/servicios"><ArrowLeft size={16} /> Monitor</Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-apex">{order.number}</p>
            <h1 className="text-2xl font-semibold">{order.customer_name}</h1>
            <p className="mt-1 text-sm text-neutral-600">{order.customer_address}</p>
          </div>
          <span className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold">{statusLabel[order.status] || order.status}</span>
        </div>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
      {gpsMessage ? <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{gpsMessage}</div> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          {steps.map((step, index) => {
            const done = currentStep > index + 1;
            const active = currentStep === index + 1;
            return (
              <div className="flex flex-1 items-center" key={step}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${done || active ? "border-apex bg-apex text-white" : "border-line bg-paper text-neutral-400"}`}>{done ? "OK" : index + 1}</div>
                  <span className={`text-[10px] font-semibold ${active ? "text-apex" : "text-neutral-400"}`}>{step}</span>
                </div>
                {index < steps.length - 1 ? <div className={`mx-1 h-px flex-1 ${done ? "bg-apex" : "bg-line"}`} /> : null}
              </div>
            );
          })}
        </div>
        <div className="rounded-md bg-paper p-3 text-sm text-neutral-700">
          <p className="font-semibold">{order.reference.code} · {order.reference.name}</p>
          <p className="mt-1 text-xs text-neutral-500">{order.reference.parts.length || 0} pieza(s) para inspeccion · {order.service_type}</p>
        </div>
      </section>

      {order.status === "pendiente" ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Inicio del servicio</h2>
          <PhotoCapture label="Foto de fachada" required value={captures.fachada || null} onChange={(file) => uploadPhoto("fachada", file)} />
          <button className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-apex text-sm font-semibold text-white disabled:opacity-50" disabled={!captures.fachada && !order.photos.some((photo) => photo.type === "fachada")} onClick={() => update("start")} type="button"><Play size={17} /> Iniciar y registrar GPS</button>
        </section>
      ) : null}

      {["en_curso", "inspeccion"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Inspeccion</h2>
          <div className="space-y-2">
            {order.reference.parts.map((part) => (
              <div className="flex items-center justify-between gap-3 rounded-md border border-line p-3" key={part.id}>
                <div><p className="text-sm font-semibold">{part.name}</p><p className="text-xs text-neutral-500">{part.quantity} {part.unit}</p></div>
                <span className="text-xs text-neutral-500">{order.photos.some((photo) => photo.type === `pieza_${part.id}`) ? "Foto OK" : "Sin foto"}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {order.reference.parts.map((part) => (
              <PhotoCapture key={part.id} label={`Foto ${part.name}`} value={captures[`pieza_${part.id}`] || null} onChange={(file) => uploadPhoto(`pieza_${part.id}`, file, { part_id: part.id, part_name: part.name })} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="h-10 rounded-md border border-line text-sm font-semibold hover:bg-paper" onClick={() => update("execution")} type="button"><Wrench className="mr-1 inline" size={15} /> Armable</button>
            <button className="h-10 rounded-md border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => update("close-not-executed")} type="button"><XCircle className="mr-1 inline" size={15} /> No armable</button>
          </div>
        </section>
      ) : null}

      {order.status === "ejecucion" ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Ejecucion y cierre</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <PhotoCapture label="Producto antes" required value={captures.producto_abierto || null} onChange={(file) => uploadPhoto("producto_abierto", file)} />
            <PhotoCapture label="Producto despues" required value={captures.producto_cerrado || null} onChange={(file) => uploadPhoto("producto_cerrado", file)} />
            <PhotoCapture label="Cliente recibe" required value={captures.cliente || null} onChange={(file) => uploadPhoto("cliente", file)} />
            <PhotoCapture label="Firma o soporte" required capture={false} value={captures.firma_cliente || null} onChange={(file) => uploadPhoto("firma_cliente", file)} />
          </div>
          <button className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50" disabled={!["producto_abierto", "producto_cerrado", "cliente", "firma_cliente"].every((type) => captures[type] || order.photos.some((photo) => photo.type === type))} onClick={() => update("close")} type="button"><CheckCircle2 size={17} /> Cerrar servicio</button>
        </section>
      ) : null}

      {!["cerrada", "no_ejecutada"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Novedad</h2>
          <textarea className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="Describe averia, faltante o accion requerida" value={incident} onChange={(event) => setIncident(event.target.value)} />
          <button className="mt-2 h-10 w-full rounded-md border border-line text-sm font-semibold hover:bg-paper" onClick={addIncident} type="button"><Search className="mr-1 inline" size={15} /> Registrar novedad</button>
          <textarea className="mt-3 min-h-16 w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="Motivo si no se puede ejecutar" value={noExecutionReason} onChange={(event) => setNoExecutionReason(event.target.value)} />
          <PhotoCapture label="Evidencia no ejecutada" value={captures.no_ejecutada || null} onChange={(file) => uploadPhoto("no_ejecutada", file, { reason: noExecutionReason })} />
          <button className="mt-2 h-10 w-full rounded-md border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={!noExecutionReason.trim() || (!captures.no_ejecutada && !order.photos.some((photo) => photo.type === "no_ejecutada"))} onClick={() => update("close-not-executed")} type="button">Cerrar no ejecutada</button>
        </section>
      ) : null}
    </div>
  );
}
