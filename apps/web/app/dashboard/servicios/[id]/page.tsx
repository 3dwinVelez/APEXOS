"use client";

import { PhotoCapture, type CapturedFile } from "@/components/operations/PhotoCapture";
import { SignatureCapture } from "@/components/operations/SignatureCapture";
import { api } from "@/lib/api";
import { getGpsFix } from "@/lib/gps";
import { buildServiceReportPdfBlob } from "@/lib/serviceReportPdf";
import { ArrowLeft, BookOpen, Camera, CheckCircle2, Download, FileSignature, History, MapPin, Play, Search, Wrench, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ServiceReferencePart = { id: number | string; name: string; quantity: number; unit: string };
type ReferenceManual = { title: string; file_name?: string; mime_type?: string; file_url?: string; base64_data?: string; notes?: string };
type ServiceReference = { code: string; name: string; parts: ServiceReferencePart[]; manuals?: ReferenceManual[]; metadata?: { manuals?: ReferenceManual[] } };
type InspectionStatus = "ok" | "averiada" | "faltante";
type InspectionItem = { part_id: number | string; name: string; quantity: number; unit: string; status: InspectionStatus; comment: string; action: string };
type ServicePhoto = { id: number | string; type: string; file_url?: string; base64_data?: string; metadata?: { mime_type?: string; file_name?: string; part_id?: number | string; part_name?: string; [key: string]: unknown }; created_at?: string };
type ServiceOrder = {
  id: number | string;
  number: string;
  reference: ServiceReference;
  service_type: string;
  status: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  invoice_number: string;
  started_at?: string;
  closed_at?: string;
  start_latitude?: number;
  start_longitude?: number;
  close_latitude?: number;
  close_longitude?: number;
  duration_minutes?: number;
  no_execution_reason?: string;
  incidents: Array<{ id: number | string; description: string; type: string; created_at?: string }>;
  photos: ServicePhoto[];
  metadata?: { inspection?: { items?: InspectionItem[]; decision?: string; problem_count?: number } };
};
type Panel = "inicio" | "inspeccion" | "ejecucion" | "novedad" | "historial";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
const HAS_CONFIGURED_API_URL = Boolean(process.env.NEXT_PUBLIC_API_URL);
const statusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  inspeccion: "Inspeccion",
  ejecucion: "Ejecucion",
  cerrada: "Cerrada",
  no_ejecutada: "No ejecutada"
};
const executionPhotoTypes = ["producto_abierto", "producto_cerrado"];
const closePhotoTypes = ["producto_abierto", "producto_cerrado", "cliente", "firma_cliente"];
const photoLabels: Record<string, string> = {
  fachada: "Fachada",
  pieza_averiada: "Pieza",
  producto_abierto: "Producto abierto",
  producto_cerrado: "Producto cerrado",
  cliente: "Cliente",
  firma_cliente: "Firma",
  no_ejecutada: "No ejecutada"
};
const inspectionStatusLabel: Record<InspectionStatus, string> = { ok: "OK", averiada: "Averiada", faltante: "Faltante" };
const panelConfig: Array<{ id: Panel; label: string; icon: typeof Play }> = [
  { id: "inicio", label: "Inicio", icon: Play },
  { id: "inspeccion", label: "Inspeccion", icon: Search },
  { id: "ejecucion", label: "Ejecucion", icon: Wrench },
  { id: "novedad", label: "Novedad", icon: FileSignature },
  { id: "historial", label: "Historial", icon: History }
];

function panelForStatus(status: string): Panel {
  if (status === "pendiente") return "inicio";
  if (["en_curso", "inspeccion"].includes(status)) return "inspeccion";
  if (status === "ejecucion") return "ejecucion";
  return "historial";
}

function photoSrc(photo: ServicePhoto) {
  if (photo.base64_data) return photo.base64_data.startsWith("data:") ? photo.base64_data : `data:${photo.metadata?.mime_type || "image/jpeg"};base64,${photo.base64_data}`;
  return photo.file_url || "";
}

function manualHref(manual: ReferenceManual) {
  return manual.base64_data || manual.file_url || "";
}

function mapLink(lat?: number, lon?: number) {
  return lat && lon ? `https://www.google.com/maps?q=${lat},${lon}&z=17` : "";
}

export default function ServiceOperationPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [incident, setIncident] = useState("");
  const [noExecutionReason, setNoExecutionReason] = useState("");
  const [noExecutionMode, setNoExecutionMode] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [captures, setCaptures] = useState<Record<string, CapturedFile | null>>({});
  const [inspection, setInspection] = useState<InspectionItem[]>([]);
  const [closureMode, setClosureMode] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>("inicio");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const data = await api<ServiceOrder>(`/api/v1/services/orders/${params.id}`);
      if (!data?.id) throw new Error("No se encontro el servicio solicitado o no tienes permisos para verlo.");
      setOrder(data);
      setActivePanel((current) => current === "inicio" && data.status !== "pendiente" ? panelForStatus(data.status) : current);
    } catch (error) {
      setOrder(null);
      setMessage(error instanceof Error ? error.message : "No fue posible cargar el servicio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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
    if (executionPhotoTypes.every((type) => order.photos.some((photo) => photo.type === type))) setClosureMode(true);
    const saved = order.metadata?.inspection?.items;
    if (saved?.length) {
      setInspection(saved.map((item) => ({ ...item, part_id: item.part_id, quantity: Number(item.quantity || 1), unit: item.unit || "und", status: (["ok", "averiada", "faltante"].includes(item.status) ? item.status : "ok") as InspectionStatus, action: item.action || "ninguna" })));
      return;
    }
    const parts = order.reference?.parts || [];
    setInspection(parts.map((part) => ({ part_id: part.id, name: part.name, quantity: Number(part.quantity || 1), unit: part.unit || "und", status: "ok", comment: "", action: "ninguna" })));
  }, [order, noExecutionReason]);

  async function uploadPhoto(type: string, file: CapturedFile | null, metadata: Record<string, unknown> = {}, captureKey = type) {
    setCaptures((current) => ({ ...current, [captureKey]: file }));
    if (!file) return;
    setUploading((current) => ({ ...current, [captureKey]: true }));
    try {
      const savedPhoto = await api<ServicePhoto>(`/api/v1/services/orders/${params.id}/photos`, {
        method: "POST",
        body: JSON.stringify({ type, base64_data: file.base64, size_bytes: file.size, mime_type: file.type, file_name: file.name, metadata })
      });
      setOrder((current) => current ? { ...current, photos: [...current.photos.filter((photo) => photo.id !== savedPhoto.id), savedPhoto] } : current);
      setMessage(`Evidencia ${photoLabels[type] || type} cargada.`);
    } catch (error) {
      setCaptures((current) => ({ ...current, [captureKey]: null }));
      setMessage(error instanceof Error ? error.message : "No fue posible guardar la evidencia.");
    } finally {
      setUploading((current) => ({ ...current, [captureKey]: false }));
    }
  }

  async function uploadSignature(file: CapturedFile | null, metadata: Record<string, unknown> = {}) {
    await uploadPhoto("firma_cliente", file, {
      evidence_kind: "customer_signature",
      signed_by: order?.customer_name || "",
      signed_at: file ? new Date().toISOString() : "",
      ...metadata
    });
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
      const updated = await api<ServiceOrder>(`/api/v1/services/orders/${params.id}/${action}`, { method: "PATCH", body: JSON.stringify({ ...body, ...(gpsResult.gps || {}), metadata: gpsResult.metadata }) });
      setOrder(updated);
      setActivePanel(panelForStatus(updated.status));
      setMessage(`Orden ${statusLabel[updated.status] || updated.status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible avanzar el servicio.");
    } finally {
      setWorking(false);
    }
  }

  function updateInspection(partId: number | string, patch: Partial<InspectionItem>) {
    setInspection((current) => current.map((item) => String(item.part_id) === String(partId) ? { ...item, ...patch } : item));
  }

  function hasProblemEvidence(partId: number | string) {
    return Boolean(captures[`pieza_${partId}`]) || Boolean(order?.photos.some((photo) => photo.type === "pieza_averiada" && String(photo.metadata?.part_id) === String(partId)));
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
    const missing = problems.filter((item) => !item.comment.trim() || !hasProblemEvidence(item.part_id));
    if (missing.length) {
      setMessage(`Completa comentario y evidencia en: ${missing.map((item) => item.name).join(", ")}.`);
      return false;
    }
    return true;
  }

  async function saveInspection(decision: "armable" | "no_armable") {
    if (!validateInspection()) return null;
    return api<ServiceOrder>(`/api/v1/services/orders/${params.id}/inspection`, { method: "PATCH", body: JSON.stringify({ decision, items: inspection, metadata: { source: "apexos_service_flow" } }) });
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
      setActivePanel("ejecucion");
      setMessage("Inspeccion guardada. Producto armable.");
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
      setActivePanel("novedad");
      setMessage("Producto no armable. Registra motivo final y evidencia.");
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

  function savePdfBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order?.number || "servicio"}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    if (!order || downloadingPdf) return;
    setDownloadingPdf(true);
    setMessage("");
    try {
      if (HAS_CONFIGURED_API_URL) {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/api/v1/services/orders/${params.id}/report-pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (response.ok) {
          savePdfBlob(await response.blob());
          setMessage("PDF descargado.");
          return;
        }
      }
      savePdfBlob(buildServiceReportPdfBlob(order));
      setMessage(HAS_CONFIGURED_API_URL ? "La API no entrego el PDF; se genero un reporte local con los datos cargados." : "PDF generado desde los datos cargados del servicio.");
    } catch (error) {
      try {
        savePdfBlob(buildServiceReportPdfBlob(order));
        setMessage("PDF generado localmente porque la descarga de API no respondio.");
      } catch {
        setMessage(error instanceof Error ? error.message : "No fue posible descargar el PDF.");
      }
    } finally {
      setDownloadingPdf(false);
    }
  }

  const visiblePanels = useMemo(() => {
    if (!order) return [];
    return panelConfig.filter((panel) => {
      if (panel.id === "inicio") return order.status === "pendiente";
      if (panel.id === "inspeccion") return ["en_curso", "inspeccion"].includes(order.status);
      if (panel.id === "ejecucion") return order.status === "ejecucion";
      if (panel.id === "novedad") return !["cerrada", "no_ejecutada"].includes(order.status);
      return true;
    });
  }, [order]);

  if (!order) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <Link className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/servicios"><ArrowLeft size={18} /> Monitor</Link>
        <div className="rounded-md border border-line bg-white p-4 text-sm font-medium text-neutral-700">
          {loading ? "Cargando servicio..." : message || "No fue posible cargar el servicio."}
        </div>
      </div>
    );
  }
  const referenceManuals = order.reference?.manuals?.length ? order.reference.manuals : order.reference?.metadata?.manuals || [];

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-32 md:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-neutral-600 hover:text-apex md:border-0 md:bg-transparent md:px-0" href="/dashboard/servicios"><ArrowLeft size={18} /> Monitor</Link>
        <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-apex">{order.number}</p>
            <h1 className="break-words text-2xl font-semibold">{order.customer_name}</h1>
            <p className="mt-1 text-sm text-neutral-600">{order.customer_address}</p>
          </div>
          <span className="w-fit rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold">{statusLabel[order.status] || order.status}</span>
        </div>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{message}</div> : null}
      {gpsMessage ? <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm font-medium text-sky-900">{gpsMessage}</div> : null}

      <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
        <p className="text-sm font-semibold">{order.reference?.code} · {order.reference?.name}</p>
        <p className="mt-1 text-xs text-neutral-500">{order.reference?.parts.length || 0} pieza(s) · {order.service_type} · {order.customer_phone || "Sin telefono"}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600">
          <span className="rounded-md bg-paper px-3 py-2">{order.photos.length} evidencias</span>
          <span className="rounded-md bg-paper px-3 py-2">{order.incidents.length} novedades</span>
        </div>
      </section>

      <nav className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0">
        {visiblePanels.map((panel) => {
          const Icon = panel.icon;
          return (
            <button className={`inline-flex min-h-12 min-w-32 items-center justify-center gap-1 rounded-md border px-3 text-sm font-semibold sm:min-w-0 ${activePanel === panel.id ? "border-apex bg-apex text-white" : "border-line bg-white text-neutral-700"}`} key={panel.id} onClick={() => setActivePanel(panel.id)} type="button">
              <Icon className="shrink-0" size={16} /> <span className="truncate">{panel.label}</span>
            </button>
          );
        })}
      </nav>

      {activePanel === "inicio" && order.status === "pendiente" ? (
        <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <h2 className="mb-3 text-base font-semibold">Inicio del servicio</h2>
          <PhotoCapture label="Foto de fachada" required loading={uploading.fachada} value={captures.fachada || null} onChange={(file) => uploadPhoto("fachada", file)} />
          <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white disabled:opacity-50" disabled={working || (!captures.fachada && !hasPhoto("fachada"))} onClick={() => update("start")} type="button"><Play size={18} /> Iniciar y registrar GPS</button>
        </section>
      ) : null}

      {activePanel === "inspeccion" && ["en_curso", "inspeccion"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <h2 className="mb-3 text-base font-semibold">Inspeccion</h2>
          {referenceManuals.length ? (
            <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-950">
                <BookOpen size={16} /> Manuales y guias de la referencia
              </div>
              <div className="grid gap-2">
                {referenceManuals.map((manual, index) => {
                  const href = manualHref(manual);
                  return (
                    <div className="rounded-md border border-sky-100 bg-white p-3" key={`${manual.file_name || manual.title}-${index}`}>
                      <p className="text-sm font-semibold">{manual.title || manual.file_name || `Documento ${index + 1}`}</p>
                      {manual.notes ? <p className="mt-1 text-xs text-neutral-600">{manual.notes}</p> : null}
                      {href ? <a className="mt-2 inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper sm:w-auto" href={href} target="_blank" rel="noreferrer"><Download className="shrink-0" size={15} /> <span className="truncate">Ver documento</span></a> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="space-y-3">
            {inspection.map((part, index) => (
              <div className="rounded-md border border-line p-3" key={part.part_id}>
                <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{index + 1}. {part.name}</p>
                    <p className="text-xs text-neutral-500">{part.quantity} {part.unit}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                    {(["ok", "averiada", "faltante"] as InspectionStatus[]).map((status) => (
                      <button className={`h-11 min-w-0 rounded-md border px-2 text-sm font-semibold ${part.status === status ? "border-apex bg-apex text-white" : "border-line bg-white"}`} key={status} onClick={() => updateInspection(part.part_id, { status, action: status === "ok" ? "ninguna" : part.action })} type="button">
                        {inspectionStatusLabel[status]}
                      </button>
                    ))}
                  </div>
                </div>
                {part.status !== "ok" ? (
                  <div className="mt-3 space-y-3 rounded-md bg-paper p-3">
                    <textarea className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-base md:text-sm" placeholder="Comentario obligatorio" value={part.comment} onChange={(event) => updateInspection(part.part_id, { comment: event.target.value })} />
                    <select className="h-12 w-full rounded-md border border-line px-3 text-base" value={part.action} onChange={(event) => updateInspection(part.part_id, { action: event.target.value })}>
                      <option value="cambio">Solicitar cambio</option>
                      <option value="garantia">Solicitar garantia</option>
                      <option value="revision">Requiere revision</option>
                      <option value="ninguna">Sin accion adicional</option>
                    </select>
                    <PhotoCapture label={`Evidencia - ${part.name}`} required loading={uploading[`pieza_${part.part_id}`]} value={captures[`pieza_${part.part_id}`] || null} onChange={(file) => uploadPhoto("pieza_averiada", file, { part_id: part.part_id, part_name: part.name, status: part.status, comment: part.comment, action: part.action }, `pieza_${part.part_id}`)} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button className="h-12 rounded-md border border-line text-base font-semibold hover:bg-paper disabled:opacity-50" disabled={working} onClick={markArmable} type="button"><Wrench className="mr-1 inline" size={17} /> Armable</button>
            <button className="h-12 rounded-md border border-red-200 text-base font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={working} onClick={markNotArmable} type="button"><XCircle className="mr-1 inline" size={17} /> No armable</button>
          </div>
        </section>
      ) : null}

      {activePanel === "ejecucion" && order.status === "ejecucion" ? (
        <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          {!closureMode ? (
            <>
              <h2 className="mb-3 text-base font-semibold">Ejecucion</h2>
              <div className="grid gap-2">
                <PhotoCapture label="Foto 1: Producto abierto" required loading={uploading.producto_abierto} value={captures.producto_abierto || null} onChange={(file) => uploadPhoto("producto_abierto", file)} />
                <PhotoCapture label="Foto 2: Producto cerrado" required loading={uploading.producto_cerrado} value={captures.producto_cerrado || null} onChange={(file) => uploadPhoto("producto_cerrado", file)} />
              </div>
              <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white disabled:opacity-50" disabled={!executionPhotosReady()} onClick={() => setClosureMode(true)} type="button"><Camera size={18} /> Continuar al cierre</button>
            </>
          ) : (
            <>
              <h2 className="mb-3 text-base font-semibold">Cierre del servicio</h2>
              <div className="grid gap-2">
                <PhotoCapture label="Foto del cliente que recibe" required loading={uploading.cliente} value={captures.cliente || null} onChange={(file) => uploadPhoto("cliente", file)} />
                <SignatureCapture label="Firma del cliente" required value={captures.firma_cliente || null} onChange={(file) => uploadSignature(file)} />
              </div>
              <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 text-base font-semibold text-white disabled:opacity-50" disabled={working || !closePhotosReady()} onClick={() => update("close")} type="button"><CheckCircle2 size={18} /> Cerrar servicio</button>
            </>
          )}
        </section>
      ) : null}

      {activePanel === "novedad" && !["cerrada", "no_ejecutada"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <h2 className="mb-3 text-base font-semibold">{noExecutionMode ? "Cierre no ejecutado" : "Novedad"}</h2>
          <textarea className="min-h-24 w-full rounded-md border border-line px-3 py-3 text-base md:text-sm" placeholder="Describe averia, faltante o accion requerida" value={incident} onChange={(event) => setIncident(event.target.value)} />
          <button className="mt-2 h-12 w-full rounded-md border border-line text-base font-semibold hover:bg-paper" onClick={addIncident} type="button"><Search className="mr-1 inline" size={17} /> Registrar novedad</button>
          <textarea className="mt-3 min-h-20 w-full rounded-md border border-line px-3 py-3 text-base md:text-sm" placeholder="Motivo si no se puede ejecutar" value={noExecutionReason} onChange={(event) => setNoExecutionReason(event.target.value)} />
          <PhotoCapture label="Evidencia no ejecutada" loading={uploading.no_ejecutada} value={captures.no_ejecutada || null} onChange={(file) => uploadPhoto("no_ejecutada", file, { reason: noExecutionReason })} />
          {noExecutionMode ? <SignatureCapture label="Firma del cliente" required value={captures.firma_cliente || null} onChange={(file) => uploadSignature(file, { reason: noExecutionReason, closure: "no_ejecutada" })} /> : null}
          <button className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-red-200 text-base font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={working || (noExecutionMode ? !noExecutionReady() : !noExecutionReason.trim() || !hasPhoto("no_ejecutada"))} onClick={() => update("close-not-executed")} type="button"><FileSignature size={17} /> Cerrar no ejecutada</button>
        </section>
      ) : null}

      {activePanel === "historial" ? (
        <section className="space-y-3 rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Historial y evidencias</h2>
            <button className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={downloadingPdf} onClick={downloadPdf} type="button"><Download className="shrink-0" size={16} /> <span className="truncate">{downloadingPdf ? "Generando..." : "PDF"}</span></button>
          </div>
          <div className="grid gap-2 text-sm text-neutral-700">
            {order.started_at ? <p className="rounded-md bg-paper p-3">Inicio: {new Date(order.started_at).toLocaleString()}</p> : null}
            {order.closed_at ? <p className="rounded-md bg-paper p-3">Cierre: {new Date(order.closed_at).toLocaleString()} · {order.duration_minutes ?? "--"} min</p> : null}
            {order.no_execution_reason ? <p className="rounded-md bg-amber-50 p-3 text-amber-900">No ejecutada: {order.no_execution_reason}</p> : null}
            {mapLink(order.start_latitude, order.start_longitude) ? <a className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-line px-3 font-semibold" href={mapLink(order.start_latitude, order.start_longitude)} target="_blank" rel="noreferrer"><MapPin className="shrink-0" size={16} /> <span className="truncate">GPS inicio</span></a> : null}
            {mapLink(order.close_latitude, order.close_longitude) ? <a className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-line px-3 font-semibold" href={mapLink(order.close_latitude, order.close_longitude)} target="_blank" rel="noreferrer"><MapPin className="shrink-0" size={16} /> <span className="truncate">GPS cierre</span></a> : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {order.photos.map((photo) => {
              const src = photoSrc(photo);
              return (
                <div className="rounded-md border border-line bg-paper p-2" key={photo.id}>
                  {src ? <img className="aspect-square w-full rounded-md object-cover" src={src} alt={photoLabels[photo.type] || photo.type} /> : <div className="flex aspect-square items-center justify-center rounded-md bg-white text-xs text-neutral-500">Sin preview</div>}
                  <p className="mt-2 text-xs font-semibold">{photoLabels[photo.type] || photo.type}</p>
                  {photo.metadata?.part_name ? <p className="text-[11px] text-neutral-500">{String(photo.metadata.part_name)}</p> : null}
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            {order.metadata?.inspection?.items?.map((item) => <p className="rounded-md bg-paper p-3 text-sm" key={item.part_id}>{item.name}: <span className="font-semibold">{inspectionStatusLabel[item.status]}</span>{item.comment ? ` · ${item.comment}` : ""}</p>)}
            {order.incidents.map((item) => <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900" key={item.id}>{item.type}: {item.description}</p>)}
            {!order.photos.length && !order.incidents.length ? <p className="text-sm text-neutral-500">Sin evidencia registrada.</p> : null}
          </div>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur md:hidden">
        {activePanel === "historial" ? (
          <button className="h-14 w-full rounded-md bg-apex px-3 text-base font-semibold text-white shadow-sm disabled:opacity-60" disabled={downloadingPdf} onClick={downloadPdf} type="button">{downloadingPdf ? "Generando PDF..." : "Descargar PDF"}</button>
        ) : (
          <button className="h-14 w-full rounded-md border border-line bg-white text-base font-semibold shadow-sm" onClick={() => setActivePanel("historial")} type="button">Ver historial</button>
        )}
      </div>
    </div>
  );
}
