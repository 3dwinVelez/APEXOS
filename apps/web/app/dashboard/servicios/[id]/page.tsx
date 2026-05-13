"use client";

import { api } from "@/lib/api";
import { getGpsFix } from "@/lib/gps";
import { PhotoCapture, type CapturedFile } from "@/components/operations/PhotoCapture";
import { ArrowLeft, Camera, CheckCircle2, FileSignature, Play, Search, Wrench, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ServiceReferencePart = { id: number; name: string; quantity: number; unit: string };
type ServiceReference = { code: string; name: string; parts: ServiceReferencePart[] };
type InspectionStatus = "ok" | "averiada" | "faltante";
type InspectionItem = {
  part_id: number;
  name: string;
  quantity: number;
  unit: string;
  status: InspectionStatus;
  comment: string;
  action: string;
};
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
  photos: Array<{ id: number; type: string; metadata?: { part_id?: number; part_name?: string; [key: string]: unknown } }>;
  metadata?: { inspection?: { items?: InspectionItem[]; decision?: string; problem_count?: number } };
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
const executionPhotoTypes = ["producto_abierto", "producto_cerrado"];
const closePhotoTypes = ["producto_abierto", "producto_cerrado", "cliente", "firma_cliente"];
const inspectionStatusTone: Record<InspectionStatus, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  averiada: "border-amber-200 bg-amber-50 text-amber-800",
  faltante: "border-red-200 bg-red-50 text-red-800"
};
const inspectionStatusLabel: Record<InspectionStatus, string> = {
  ok: "OK",
  averiada: "Averiada",
  faltante: "Faltante"
};

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
  const [noExecutionMode, setNoExecutionMode] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [captures, setCaptures] = useState<Record<string, CapturedFile | null>>({});
  const [inspection, setInspection] = useState<InspectionItem[]>([]);
  const [closureMode, setClosureMode] = useState(false);

  async function load() {
    setOrder(await api<ServiceOrder>(`/api/v1/services/orders/${params.id}`));
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [params.id]);

  useEffect(() => {
    if (!order) return;
    if (order.metadata?.inspection?.decision === "no_armable" && !["cerrada", "no_ejecutada"].includes(order.status)) {
      setNoExecutionMode(true);
      const problems = order.metadata.inspection.items?.filter((item) => item.status !== "ok") || [];
      if (problems.length && !noExecutionReason.trim()) {
        setNoExecutionReason(problems.map((item) => `${inspectionStatusLabel[item.status]}: ${item.name}${item.comment ? ` - ${item.comment}` : ""}`).join("\n"));
      }
    }
    if (executionPhotoTypes.every((type) => order.photos.some((photo) => photo.type === type))) {
      setClosureMode(true);
    }
    const saved = order.metadata?.inspection?.items;
    if (saved?.length) {
      setInspection(saved.map((item) => ({
        part_id: Number(item.part_id),
        name: item.name,
        quantity: Number(item.quantity || 1),
        unit: item.unit || "und",
        status: (["ok", "averiada", "faltante"].includes(item.status) ? item.status : "ok") as InspectionStatus,
        comment: item.comment || "",
        action: item.action || "ninguna"
      })));
      return;
    }
    setInspection((current) => {
      const parts = order.reference?.parts || [];
      const sameParts = current.length === parts.length && parts.every((part) => current.some((item) => item.part_id === part.id));
      if (sameParts) return current;
      return parts.map((part) => ({
        part_id: part.id,
        name: part.name,
        quantity: Number(part.quantity || 1),
        unit: part.unit || "und",
        status: "ok",
        comment: "",
        action: "ninguna"
      }));
    });
  }, [order, noExecutionReason]);

  async function uploadPhoto(type: string, file: CapturedFile | null, metadata: Record<string, unknown> = {}) {
    setCaptures((current) => ({ ...current, [type]: file }));
    if (!file) return;
    try {
      const savedPhoto = await api<ServiceOrder["photos"][number]>(`/api/v1/services/orders/${params.id}/photos`, {
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
      setOrder((current) => current ? { ...current, photos: [...current.photos.filter((photo) => photo.id !== savedPhoto.id), savedPhoto] } : current);
      setMessage(`Evidencia ${type} cargada.`);
    } catch (error) {
      setCaptures((current) => ({ ...current, [type]: null }));
      setMessage(error instanceof Error ? error.message : "No fue posible guardar la evidencia.");
    }
  }

  async function optionalGps(action: string) {
    try {
      setGpsMessage("Obteniendo GPS...");
      const gps = await getGpsFix();
      setGpsMessage(`GPS capturado (${Math.round(gps.accuracy_meters || 0)}m).`);
      return { gps, metadata: { gps_status: "captured", gps_action: action } };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "GPS no disponible.";
      setGpsMessage(`${reason} Se continua el flujo y queda trazado como GPS pendiente.`);
      return { gps: null, metadata: { gps_status: "unavailable", gps_action: action, gps_error: reason } };
    }
  }

  async function update(action: "start" | "inspection" | "execution" | "close" | "close-not-executed") {
    setWorking(true);
    try {
      const gpsResult = ["start", "close", "close-not-executed"].includes(action) ? await optionalGps(action) : { gps: null, metadata: {} };
      const body = action === "close-not-executed" ? { no_execution_reason: noExecutionReason || "Cliente no disponible / evidencia pendiente" } : {};
      const updated = await api<ServiceOrder>(`/api/v1/services/orders/${params.id}/${action}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, ...(gpsResult.gps || {}), metadata: gpsResult.metadata })
      });
      setOrder(updated);
      setMessage(`Orden ${statusLabel[updated.status] || updated.status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible avanzar el servicio.");
    } finally {
      setWorking(false);
    }
  }

  function updateInspection(partId: number, patch: Partial<InspectionItem>) {
    setInspection((current) => current.map((item) => item.part_id === partId ? { ...item, ...patch } : item));
  }

  function hasProblemEvidence(partId: number) {
    return Boolean(captures[`pieza_${partId}`]) || order?.photos.some((photo) => photo.type === "pieza_averiada" && Number(photo.metadata?.part_id) === partId);
  }

  function hasPhoto(type: string) {
    return Boolean(captures[type]) || Boolean(order?.photos.some((photo) => photo.type === type));
  }

  function executionPhotosReady() {
    return executionPhotoTypes.every((type) => hasPhoto(type));
  }

  function closePhotosReady() {
    return closePhotoTypes.every((type) => hasPhoto(type));
  }

  function noExecutionReady() {
    return Boolean(noExecutionReason.trim() && hasPhoto("no_ejecutada") && hasPhoto("firma_cliente"));
  }

  function validateInspection() {
    const problems = inspection.filter((item) => item.status !== "ok");
    const missingComment = problems.filter((item) => !item.comment.trim());
    const missingEvidence = problems.filter((item) => !hasProblemEvidence(item.part_id));

    if (missingComment.length || missingEvidence.length) {
      const pieces = [...new Set([...missingComment, ...missingEvidence].map((item) => item.name))].join(", ");
      setMessage(`Completa comentario y evidencia en: ${pieces}.`);
      return false;
    }
    return true;
  }

  async function saveInspection(decision: "armable" | "no_armable") {
    if (!validateInspection()) return null;
    return api<ServiceOrder>(`/api/v1/services/orders/${params.id}/inspection`, {
      method: "PATCH",
      body: JSON.stringify({
        decision,
        items: inspection,
        metadata: { source: "apexos_service_flow" }
      })
    });
  }

  async function markArmable() {
    setWorking(true);
    try {
      const inspected = await saveInspection("armable");
      if (!inspected) return;
      const updated = await api<ServiceOrder>(`/api/v1/services/orders/${params.id}/execution`, { method: "PATCH", body: JSON.stringify({}) });
      setOrder(updated);
      setNoExecutionMode(false);
      setClosureMode(false);
      setMessage("Inspeccion guardada. Producto armable, continua con ejecucion.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar la inspeccion.");
    } finally {
      setWorking(false);
    }
  }

  async function markNotArmable() {
    setWorking(true);
    try {
      const updated = await saveInspection("no_armable");
      if (!updated) return;
      setOrder(updated);
      setNoExecutionMode(true);
      setClosureMode(false);
      const problems = inspection.filter((item) => item.status !== "ok");
      setNoExecutionReason(problems.map((item) => `${inspectionStatusLabel[item.status]}: ${item.name}${item.comment ? ` - ${item.comment}` : ""}`).join("\n"));
      setMessage("Producto no armable. Registra motivo final y evidencia antes de cerrar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar la inspeccion.");
    } finally {
      setWorking(false);
    }
  }

  async function addIncident() {
    if (!incident.trim()) return;
    await api(`/api/v1/services/orders/${params.id}/incidents`, { method: "POST", body: JSON.stringify({ type: "averia", action: "revision", description: incident }) });
    setIncident("");
    setMessage("Novedad registrada.");
    await load();
  }

  const currentStep = useMemo(() => stepForStatus(order?.status || "pendiente"), [order?.status]);

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
          <p className="font-semibold">{order.reference?.code} · {order.reference?.name}</p>
          <p className="mt-1 text-xs text-neutral-500">{order.reference?.parts.length || 0} pieza(s) para inspeccion · {order.service_type}</p>
        </div>
      </section>

      {order.status === "pendiente" ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Inicio del servicio</h2>
          <PhotoCapture label="Foto de fachada" required value={captures.fachada || null} onChange={(file) => uploadPhoto("fachada", file)} />
          <button className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-apex text-sm font-semibold text-white disabled:opacity-50" disabled={working || (!captures.fachada && !order.photos.some((photo) => photo.type === "fachada"))} onClick={() => update("start")} type="button"><Play size={17} /> Iniciar y registrar GPS</button>
        </section>
      ) : null}

      {["en_curso", "inspeccion"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Inspeccion</h2>
          <p className="mb-3 text-sm text-neutral-600">Marca cada pieza como OK, averiada o faltante. Las piezas con problema requieren comentario y evidencia.</p>
          <div className="space-y-3">
            {inspection.map((part, index) => {
              const hasProblem = part.status !== "ok";
              const evidenceOk = hasProblemEvidence(part.part_id);
              return (
                <div className={`rounded-md border p-3 ${inspectionStatusTone[part.status]}`} key={part.part_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{index + 1}. {part.name}</p>
                      <p className="text-xs opacity-75">{part.quantity} {part.unit}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["ok", "averiada", "faltante"] as InspectionStatus[]).map((status) => (
                        <button
                          className={`h-8 rounded-md border px-3 text-xs font-semibold ${part.status === status ? "border-current bg-white/70" : "border-line bg-white text-neutral-600"}`}
                          key={status}
                          onClick={() => updateInspection(part.part_id, { status, action: status === "ok" ? "ninguna" : part.action })}
                          type="button"
                        >
                          {inspectionStatusLabel[status]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {hasProblem ? (
                    <div className="mt-3 space-y-3 rounded-md border border-white/70 bg-white/80 p-3 text-neutral-800">
                      <textarea
                        className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm"
                        placeholder="Comentario obligatorio de la averia o pieza faltante"
                        value={part.comment}
                        onChange={(event) => updateInspection(part.part_id, { comment: event.target.value })}
                      />
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={part.action} onChange={(event) => updateInspection(part.part_id, { action: event.target.value })}>
                        <option value="cambio">Solicitar cambio</option>
                        <option value="garantia">Solicitar garantia al proveedor</option>
                        <option value="revision">Requiere revision</option>
                        <option value="ninguna">Sin accion adicional</option>
                      </select>
                      <PhotoCapture
                        label={`Evidencia - ${part.name}`}
                        required
                        value={captures[`pieza_${part.part_id}`] || null}
                        onChange={(file) => uploadPhoto("pieza_averiada", file, { part_id: part.part_id, part_name: part.name, status: part.status, comment: part.comment, action: part.action })}
                      />
                      <p className={`text-xs font-semibold ${evidenceOk ? "text-emerald-700" : "text-red-700"}`}>{evidenceOk ? "Evidencia registrada" : "Evidencia obligatoria pendiente"}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!inspection.length ? <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-neutral-500">Esta referencia no tiene piezas registradas.</div> : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="h-10 rounded-md border border-line text-sm font-semibold hover:bg-paper disabled:opacity-50" disabled={working} onClick={markArmable} type="button"><Wrench className="mr-1 inline" size={15} /> Armable</button>
            <button className="h-10 rounded-md border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={working} onClick={markNotArmable} type="button"><XCircle className="mr-1 inline" size={15} /> No armable</button>
          </div>
        </section>
      ) : null}

      {order.status === "ejecucion" ? (
        <section className="rounded-md border border-line bg-white p-4">
          {!closureMode ? (
            <>
              <div className="mb-4 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-apex/10 text-apex"><Wrench size={24} /></div>
                <h2 className="text-base font-semibold">Trabajo finalizado</h2>
                <p className="mt-1 text-sm text-neutral-600">Documenta el resultado del montaje con dos fotos obligatorias del producto.</p>
              </div>
              <div className="grid gap-2">
                <PhotoCapture label="Foto 1: Producto abierto" required value={captures.producto_abierto || null} onChange={(file) => uploadPhoto("producto_abierto", file)} />
                <PhotoCapture label="Foto 2: Producto cerrado" required value={captures.producto_cerrado || null} onChange={(file) => uploadPhoto("producto_cerrado", file)} />
              </div>
              <div className={`mt-3 rounded-md border p-3 text-sm font-semibold ${executionPhotosReady() ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                {executionPhotosReady() ? "Ambas fotos capturadas. Puedes continuar al cierre." : "Pendiente: foto del producto abierto y foto del producto cerrado."}
              </div>
              <button className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-apex text-sm font-semibold text-white disabled:opacity-50" disabled={!executionPhotosReady()} onClick={() => setClosureMode(true)} type="button">
                <Camera size={17} /> Continuar al cierre
              </button>
            </>
          ) : (
            <>
              <div className="mb-4">
                <h2 className="text-base font-semibold">Cierre del servicio</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <div><span className="block font-semibold">Cliente</span>{order.customer_name}</div>
                  <div><span className="block font-semibold">Tipo</span>{order.service_type}</div>
                  <div><span className="block font-semibold">Referencia</span>{order.reference?.name || "Sin referencia"}</div>
                  <div><span className="block font-semibold">Novedades</span>{order.incidents.length}</div>
                </div>
              </div>
              <div className="grid gap-2">
                <PhotoCapture label="Foto del cliente que recibe" required value={captures.cliente || null} onChange={(file) => uploadPhoto("cliente", file)} />
                <PhotoCapture label="Firma o soporte del cliente" required capture={false} value={captures.firma_cliente || null} onChange={(file) => uploadPhoto("firma_cliente", file)} />
              </div>
              <div className={`mt-3 rounded-md border p-3 text-sm font-semibold ${closePhotosReady() ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                {closePhotosReady() ? "Firma/foto del cliente registradas. Listo para cerrar." : "Pendiente: foto del cliente y firma o soporte."}
              </div>
              <button className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50" disabled={working || !closePhotosReady()} onClick={() => update("close")} type="button"><CheckCircle2 size={17} /> Cerrar servicio</button>
            </>
          )}
        </section>
      ) : null}

      {!["cerrada", "no_ejecutada"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">{noExecutionMode ? "Cierre no ejecutado" : "Novedad"}</h2>
          {noExecutionMode ? <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Completa motivo y evidencia. El cierre no se ejecuta automaticamente desde inspeccion.</p> : null}
          <textarea className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="Describe averia, faltante o accion requerida" value={incident} onChange={(event) => setIncident(event.target.value)} />
          <button className="mt-2 h-10 w-full rounded-md border border-line text-sm font-semibold hover:bg-paper" onClick={addIncident} type="button"><Search className="mr-1 inline" size={15} /> Registrar novedad</button>
          <textarea className="mt-3 min-h-16 w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="Motivo si no se puede ejecutar" value={noExecutionReason} onChange={(event) => setNoExecutionReason(event.target.value)} />
          <PhotoCapture label="Evidencia no ejecutada" value={captures.no_ejecutada || null} onChange={(file) => uploadPhoto("no_ejecutada", file, { reason: noExecutionReason })} />
          {noExecutionMode ? <PhotoCapture label="Firma o soporte del cliente" required capture={false} value={captures.firma_cliente || null} onChange={(file) => uploadPhoto("firma_cliente", file, { reason: noExecutionReason, closure: "no_ejecutada" })} /> : null}
          {noExecutionMode ? (
            <div className={`mt-3 rounded-md border p-3 text-sm font-semibold ${noExecutionReady() ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              {noExecutionReady() ? "Todo listo para cerrar como no ejecutado." : "Pendiente: motivo, evidencia y firma del cliente."}
            </div>
          ) : null}
          <button className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={working || (noExecutionMode ? !noExecutionReady() : !noExecutionReason.trim() || !hasPhoto("no_ejecutada"))} onClick={() => update("close-not-executed")} type="button"><FileSignature size={15} /> Cerrar no ejecutada</button>
        </section>
      ) : null}
    </div>
  );
}
