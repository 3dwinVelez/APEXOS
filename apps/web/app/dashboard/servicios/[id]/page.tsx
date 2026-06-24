"use client";

import { PhotoCapture, type CapturedFile } from "@/components/operations/PhotoCapture";
import { SignatureCapture } from "@/components/operations/SignatureCapture";
import { api } from "@/lib/api";
import { getGpsFix } from "@/lib/gps";
import { buildServiceReportPdfBlob } from "@/lib/serviceReportPdf";
import { ArrowLeft, BookOpen, Camera, CheckCircle2, Circle, Download, FileSignature, MapPin, PackageSearch, Play, Star, Wrench, XCircle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ServiceReferencePart = { id: number | string; name: string; quantity: number; unit: string };
type ReferenceManual = { title: string; file_name?: string; mime_type?: string; file_url?: string; base64_data?: string; notes?: string };
type ServiceReference = { code: string; name: string; parts: ServiceReferencePart[]; manuals?: ReferenceManual[]; metadata?: { manuals?: ReferenceManual[] } };
type InspectionStatus = "ok" | "averiada" | "faltante";
type InspectionItem = { part_id: number | string; name: string; quantity: number; unit: string; status: InspectionStatus; comment: string; action: string; supplier_name?: string };
type ServicePhoto = { id: number | string; type: string; file_url?: string; base64_data?: string; metadata?: { mime_type?: string; file_name?: string; part_id?: number | string; part_name?: string; [key: string]: unknown }; created_at?: string };
type SatisfactionQuestion = { id: string; label: string; active?: boolean };
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
  metadata?: {
    inspection?: { items?: InspectionItem[]; decision?: string; problem_count?: number };
    satisfaction_survey?: { answers?: Array<{ question_id: string; question: string; rating: number }>; average?: number; completed_at?: string };
  };
};
type Panel = "inicio" | "inspeccion" | "ejecucion" | "novedad" | "historial";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
const HAS_CONFIGURED_API_URL = Boolean(process.env.NEXT_PUBLIC_API_URL);
const statusLabel: Record<string, string> = {
  agendado: "Agendado",
  pendiente: "Pendiente",
  en_curso: "En curso",
  inspeccion: "Inspeccion",
  ejecucion: "Ejecucion",
  cerrada: "Cerrada",
  no_ejecutada: "No ejecutada"
};
const executionPhotoTypes = ["producto_abierto", "producto_cerrado"];
const closePhotoTypes = ["producto_abierto", "producto_cerrado", "firma_cliente"];
const satisfactionQuestions = [
  { id: "service_quality", label: "¿Cómo calificas la calidad del servicio realizado?" },
  { id: "technician_attention", label: "¿Cómo calificas la atención y claridad del técnico?" },
  { id: "final_result", label: "¿Qué tan satisfecho quedaste con el resultado final?" }
] as const;
const fallbackSatisfactionQuestions = (): SatisfactionQuestion[] => satisfactionQuestions.map((question) => ({ ...question, active: true }));
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
type InspectionMode = "decision" | "pieces";
const workflowSteps = [
  { id: "pendiente", label: "Inicio" },
  { id: "inspeccion", label: "Inspección" },
  { id: "ejecucion", label: "Ejecución" },
  { id: "cerrada", label: "Cierre" }
] as const;

function isLocalServiceOrderId(id: unknown) {
  return /^\d+$/.test(String(id || ""));
}

function panelForStatus(status: string): Panel {
  if (status === "pendiente") return "inicio";
  if (["en_curso", "inspeccion"].includes(status)) return "inspeccion";
  if (status === "ejecucion") return "ejecucion";
  return "historial";
}

function workflowStep(status: string) {
  if (status === "pendiente") return 0;
  if (["en_curso", "inspeccion"].includes(status)) return 1;
  if (status === "ejecucion") return 2;
  return 3;
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
  const router = useRouter();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [noExecutionReason, setNoExecutionReason] = useState("");
  const [gpsMessage, setGpsMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [captures, setCaptures] = useState<Record<string, CapturedFile | null>>({});
  const [inspection, setInspection] = useState<InspectionItem[]>([]);
  const [closureMode, setClosureMode] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SatisfactionQuestion[]>(fallbackSatisfactionQuestions());
  const [satisfactionRatings, setSatisfactionRatings] = useState<Record<string, number>>({});
  const [activePanel, setActivePanel] = useState<Panel>("inicio");
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>("decision");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      if (!isLocalServiceOrderId(params.id)) {
        setOrder(null);
        setMessage("Esta solicitud externa aun no esta disponible como orden operativa local. Vuelve al monitor y completala antes de ejecutar el servicio.");
        return;
      }
      const [data, questions] = await Promise.all([
        api<ServiceOrder>(`/api/v1/services/orders/${params.id}`),
        api<SatisfactionQuestion[]>("/api/v1/services/satisfaction-questions").catch(() => fallbackSatisfactionQuestions())
      ]);
      if (!data?.id) throw new Error("No se encontro el servicio solicitado o no tienes permisos para verlo.");
      const activeQuestions = questions.filter((question) => question.active !== false && question.id && question.label);
      setOrder(data);
      setSurveyQuestions(activeQuestions.length ? activeQuestions : fallbackSatisfactionQuestions());
      setActivePanel((current) => current === "inicio" && data.status !== "pendiente" ? panelForStatus(data.status) : current);
    } catch (error) {
      setOrder(null);
      setMessage(error instanceof Error ? error.message : "No fue posible cargar el servicio.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    if (order.metadata?.inspection?.decision === "no_armable" && !["cerrada", "no_ejecutada"].includes(order.status)) {
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
      const gpsResult = ["close", "close-not-executed"].includes(action) ? await optionalGps(action) : { gps: null, metadata: {} };
      const satisfactionSurvey = action === "close" ? {
        version: 1,
        answers: surveyQuestions.map((question) => ({
          question_id: question.id,
          question: question.label,
          rating: satisfactionRatings[question.id]
        })),
        average: surveyQuestions.reduce((total, question) => total + (satisfactionRatings[question.id] || 0), 0) / surveyQuestions.length,
        completed_at: new Date().toISOString()
      } : undefined;
      const body = action === "close-not-executed" ? { no_execution_reason: noExecutionReason || "Cliente no disponible / evidencia pendiente" } : {};
      const updated = await api<ServiceOrder>(`/api/v1/services/orders/${params.id}/${action}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...body,
          ...(gpsResult.gps || {}),
          metadata: {
            ...gpsResult.metadata,
            ...(action === "start" ? { start_without_gps: true, start_method: "technician_manual_confirmation" } : {}),
            ...(satisfactionSurvey ? { satisfaction_survey: satisfactionSurvey } : {})
          }
        })
      });
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

  function hasPersistedPhoto(type: string) {
    return Boolean(order?.photos.some((photo) => photo.type === type));
  }

  function uploadsPending(types: string[]) {
    return types.some((type) => uploading[type]);
  }

  function executionPhotosReady() {
    return executionPhotoTypes.every((type) => hasPersistedPhoto(type)) && !uploadsPending(executionPhotoTypes);
  }

  function satisfactionReady() {
    return surveyQuestions.every((question) => satisfactionRatings[question.id] >= 1);
  }

  function closeReady() {
    return closePhotoTypes.every((type) => hasPersistedPhoto(type)) && satisfactionReady() && !uploadsPending(closePhotoTypes);
  }

  function noExecutionReady() {
    return Boolean(noExecutionReason.trim() && hasPersistedPhoto("no_ejecutada") && hasPersistedPhoto("firma_cliente") && !uploadsPending(["no_ejecutada", "firma_cliente"]));
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
    const problems = inspection.filter((item) => item.status !== "ok");
    return api<ServiceOrder>(`/api/v1/services/orders/${params.id}/inspection`, {
      method: "PATCH",
      body: JSON.stringify({
        decision,
        items: inspection,
        metadata: {
          source: "apexos_service_flow",
          inspection_method: "three_decision_buttons",
          piece_issue_count: problems.length,
          piece_supports_required: problems.length,
          piece_supports_captured: problems.filter((item) => hasProblemEvidence(item.part_id)).length
        }
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
      savePdfBlob(await buildServiceReportPdfBlob(order));
      setMessage("PDF generado con evidencias fotograficas desde los datos cargados del servicio.");
      return;
    } catch (localError) {
      if (HAS_CONFIGURED_API_URL) {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/api/v1/services/orders/${params.id}/report-pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (response.ok) {
          savePdfBlob(await response.blob());
          setMessage("PDF descargado desde API. Algunas evidencias podrian aparecer como referencia si no estan disponibles en el navegador.");
          return;
        }
      }
      setMessage(localError instanceof Error ? localError.message : "No fue posible descargar el PDF con evidencias.");
    } finally {
      setDownloadingPdf(false);
    }
  }

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
  const orderCompleted = ["cerrada", "no_ejecutada"].includes(order.status);

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

      <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-apex">Avance de la orden</p>
            <p className="mt-1 text-sm text-neutral-600">Paso {workflowStep(order.status) + 1} de {workflowSteps.length}: <span className="font-semibold text-neutral-900">{workflowSteps[workflowStep(order.status)].label}</span></p>
          </div>
          {!["cerrada", "no_ejecutada"].includes(order.status) ? (
            <button className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => setActivePanel("novedad")} type="button">
              <FileSignature size={16} /> Novedad
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1">
          {workflowSteps.map((step, index) => {
            const current = index === workflowStep(order.status);
            const completed = index < workflowStep(order.status) || ["cerrada", "no_ejecutada"].includes(order.status);
            return (
              <div className="min-w-0" key={step.id}>
                <div className={`h-1.5 rounded-full ${completed || current ? "bg-apex" : "bg-line"}`} />
                <div className={`mt-2 flex items-center gap-1 text-[11px] font-semibold sm:text-xs ${current ? "text-apex" : completed ? "text-neutral-700" : "text-neutral-400"}`}>
                  {completed ? <CheckCircle2 className="shrink-0" size={14} /> : <Circle className="shrink-0" size={14} />}
                  <span className="truncate">{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>
        {order.status === "no_ejecutada" ? <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900">La orden finalizó mediante una novedad soportada.</p> : null}
      </section>

      {activePanel === "inicio" && order.status === "pendiente" ? (
        <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <h2 className="mb-3 text-base font-semibold">Inicio del servicio</h2>
          <div className="rounded-md border border-line bg-paper p-4">
            <p className="font-semibold">Confirma que estás en el punto de servicio</p>
            <p className="mt-1 text-sm text-neutral-600">No se solicitará GPS en este paso. Confirma el inicio y continúa con la inspección del producto.</p>
          </div>
          <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white disabled:opacity-50" disabled={working} onClick={() => update("start")} type="button"><Play size={18} /> Iniciar servicio</button>
        </section>
      ) : null}

      {activePanel === "inspeccion" && ["en_curso", "inspeccion"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <h2 className="mb-2 text-base font-semibold">Inspección</h2>
          <p className="mb-3 text-sm text-neutral-600">Elige una acción. Usa Piezas solo cuando necesites reportar una pieza defectuosa o faltante.</p>
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
          <div className="grid gap-3">
            <button className={`min-h-24 rounded-md border p-4 text-left shadow-sm transition active:scale-[0.99] ${inspectionMode === "pieces" ? "border-apex bg-apex/10" : "border-line bg-paper hover:border-apex"}`} onClick={() => setInspectionMode("pieces")} type="button">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-apex text-white"><PackageSearch size={24} /></span>
                <span>
                  <span className="block text-xl font-semibold">Piezas</span>
                  <span className="mt-1 block text-sm text-neutral-600">Reportar pieza defectuosa o faltante con foto y comentario.</span>
                </span>
              </span>
            </button>
            <button className="min-h-24 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-left text-emerald-950 shadow-sm transition active:scale-[0.99] disabled:opacity-50" disabled={working} onClick={markArmable} type="button">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-white"><Wrench size={24} /></span>
                <span>
                  <span className="block text-xl font-semibold">Armable</span>
                  <span className="mt-1 block text-sm text-emerald-800">El producto puede continuar a ejecución.</span>
                </span>
              </span>
            </button>
            <button className="min-h-24 rounded-md border border-red-200 bg-red-50 p-4 text-left text-red-950 shadow-sm transition active:scale-[0.99] disabled:opacity-50" disabled={working} onClick={markNotArmable} type="button">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-red-700 text-white"><XCircle size={24} /></span>
                <span>
                  <span className="block text-xl font-semibold">No armable</span>
                  <span className="mt-1 block text-sm text-red-800">Cerrar por defecto o inconsistencia con soporte final.</span>
                </span>
              </span>
            </button>
          </div>

          {inspectionMode === "pieces" ? (
            <div className="mt-4 space-y-3 rounded-md border border-line bg-paper p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Inventario de piezas</h3>
                  <p className="mt-1 text-sm text-neutral-600">Marca solo las piezas con novedad. Cada pieza reportada requiere comentario y foto.</p>
                </div>
                <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => setInspectionMode("decision")} type="button">Volver</button>
              </div>
              <div className="space-y-3">
                {inspection.map((part, index) => (
                  <div className="rounded-md border border-line bg-white p-3" key={part.part_id}>
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
                        <input className="h-12 w-full rounded-md border border-line px-3 text-base" placeholder="Proveedor sugerido (opcional)" value={part.supplier_name || ""} onChange={(event) => updateInspection(part.part_id, { supplier_name: event.target.value })} />
                        <PhotoCapture label={`Evidencia - ${part.name}`} required loading={uploading[`pieza_${part.part_id}`]} value={captures[`pieza_${part.part_id}`] || null} onChange={(file) => uploadPhoto("pieza_averiada", file, { part_id: part.part_id, part_name: part.name, status: part.status, comment: part.comment, action: part.action, supplier_name: part.supplier_name || "" }, `pieza_${part.part_id}`)} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
              <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white disabled:opacity-50" disabled={!executionPhotosReady()} onClick={() => setClosureMode(true)} type="button"><Camera size={18} /> {uploadsPending(executionPhotoTypes) ? "Guardando evidencias..." : "Continuar al cierre"}</button>
            </>
          ) : (
            <>
              <h2 className="mb-3 text-base font-semibold">Cierre del servicio</h2>
              <div className="grid gap-3">
                <div className="rounded-md border border-line bg-paper p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">Encuesta rápida del cliente</p>
                      <p className="mt-1 text-sm text-neutral-600">Pide al cliente tocar las estrellas. Son {surveyQuestions.length} pregunta(s) y toma menos de un minuto.</p>
                    </div>
                    <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold">
                      {surveyQuestions.filter((question) => satisfactionRatings[question.id] >= 1).length} de {surveyQuestions.length} respondidas
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {surveyQuestions.map((question, index) => {
                      const selectedRating = satisfactionRatings[question.id] || 0;
                      return (
                        <fieldset className="rounded-md border border-line bg-white p-3" key={question.id}>
                          <legend className="px-1 text-sm font-semibold">{index + 1}. {question.label}</legend>
                          <div className="mt-2 flex min-h-12 items-center gap-1 sm:gap-2">
                            {[1, 2, 3, 4, 5].map((rating) => (
                              <button
                                aria-label={`${rating} de 5 estrellas para ${question.label}`}
                                aria-pressed={selectedRating === rating}
                                className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-white transition hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                key={rating}
                                onClick={() => setSatisfactionRatings((current) => ({ ...current, [question.id]: rating }))}
                                type="button"
                              >
                                <Star className={rating <= selectedRating ? "fill-amber-400 text-amber-400" : "text-neutral-400"} size={25} />
                              </button>
                            ))}
                            {selectedRating ? <span className="ml-1 text-sm font-semibold">{selectedRating}/5</span> : null}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                </div>
                <SignatureCapture label="Firma del cliente" required value={captures.firma_cliente || null} onChange={(file) => uploadSignature(file)} />
              </div>
              <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 text-base font-semibold text-white disabled:opacity-50" disabled={working || !closeReady()} onClick={() => update("close")} type="button"><CheckCircle2 size={18} /> {uploadsPending(closePhotoTypes) ? "Guardando soportes..." : "Cerrar servicio"}</button>
            </>
          )}
        </section>
      ) : null}

      {activePanel === "novedad" && !["cerrada", "no_ejecutada"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
            <h2 className="text-base font-semibold">Reportar novedad y cerrar orden</h2>
            <p className="mt-1 text-sm">Esta acción finaliza completamente la orden. Para proteger la trazabilidad debes registrar los tres soportes obligatorios.</p>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
            <SupportState ready={Boolean(noExecutionReason.trim())} label="Motivo" />
            <SupportState ready={hasPersistedPhoto("no_ejecutada")} label="Evidencia" />
            <SupportState ready={hasPersistedPhoto("firma_cliente")} label="Firma" />
          </div>
          <label className="text-sm font-semibold">1. Describe la novedad y por qué no puede continuar</label>
          <textarea className="mt-1 min-h-24 w-full rounded-md border border-line px-3 py-3 text-base md:text-sm" placeholder="Ejemplo: producto incompleto, cliente ausente o pieza faltante..." value={noExecutionReason} onChange={(event) => setNoExecutionReason(event.target.value)} />
          <div className="mt-3 grid gap-3">
            <PhotoCapture label="2. Evidencia de la novedad" required loading={uploading.no_ejecutada} value={captures.no_ejecutada || null} onChange={(file) => uploadPhoto("no_ejecutada", file, { reason: noExecutionReason })} />
            <SignatureCapture label="3. Firma del cliente" required value={captures.firma_cliente || null} onChange={(file) => uploadSignature(file, { reason: noExecutionReason, closure: "no_ejecutada" })} />
          </div>
          <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-red-700 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={working || !noExecutionReady()} onClick={() => update("close-not-executed")} type="button"><FileSignature size={17} /> {uploadsPending(["no_ejecutada", "firma_cliente"]) ? "Guardando soportes..." : "Confirmar novedad y cerrar orden"}</button>
          <button className="mt-2 h-11 w-full rounded-md border border-line text-sm font-semibold hover:bg-paper" onClick={() => setActivePanel(panelForStatus(order.status))} type="button">Volver al paso actual</button>
        </section>
      ) : null}

      {orderCompleted ? (
        <section className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-center shadow-sm">
          <CheckCircle2 className="mx-auto text-emerald-700" size={40} />
          <h2 className="mt-2 text-xl font-semibold text-emerald-950">Orden finalizada correctamente</h2>
          <p className="mt-1 text-sm text-emerald-900">Los soportes quedaron registrados. Continúa con el siguiente servicio desde el monitor.</p>
          <button className="mt-4 inline-flex h-16 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-lg font-semibold text-white shadow-sm hover:bg-emerald-800" onClick={() => router.replace("/dashboard/servicios")} type="button"><CheckCircle2 size={22} /> Servicio completado</button>
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
          {order.metadata?.satisfaction_survey?.answers?.length ? (
            <div className="rounded-md border border-line bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Encuesta de satisfaccion</h3>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                  Promedio {Number(order.metadata.satisfaction_survey.average || 0).toFixed(1)}/5
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {order.metadata.satisfaction_survey.answers.map((answer) => (
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white p-3 text-sm" key={answer.question_id}>
                    <span>{answer.question}</span>
                    <span className="shrink-0 font-semibold text-amber-700">{answer.rating}/5</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {order.photos.map((photo) => {
              const src = photoSrc(photo);
              return (
                <div className="rounded-md border border-line bg-paper p-2" key={photo.id}>
                  {src ? <Image className="aspect-square w-full rounded-md object-cover" height={480} src={src} alt={photoLabels[photo.type] || photo.type} unoptimized width={480} /> : <div className="flex aspect-square items-center justify-center rounded-md bg-white text-xs text-neutral-500">Sin preview</div>}
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
        {orderCompleted ? (
          <button className="inline-flex h-16 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-lg font-semibold text-white shadow-sm" onClick={() => router.replace("/dashboard/servicios")} type="button"><CheckCircle2 size={22} /> Servicio completado</button>
        ) : activePanel === "historial" ? (
          <button className="h-14 w-full rounded-md bg-apex px-3 text-base font-semibold text-white shadow-sm disabled:opacity-60" disabled={downloadingPdf} onClick={downloadPdf} type="button">{downloadingPdf ? "Generando PDF..." : "Descargar PDF"}</button>
        ) : activePanel !== "novedad" ? <button className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-white text-base font-semibold text-red-700 shadow-sm" onClick={() => setActivePanel("novedad")} type="button"><FileSignature size={18} /> Reportar novedad</button> : null}
      </div>
    </div>
  );
}

function SupportState({ ready, label }: { ready: boolean; label: string }) {
  return <div className={`rounded-md border p-2 ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-line bg-paper text-neutral-500"}`}><span className="flex items-center justify-center gap-1">{ready ? <CheckCircle2 size={14} /> : <Circle size={14} />}{label}</span></div>;
}
