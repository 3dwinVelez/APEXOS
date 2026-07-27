"use client";

import { PhotoCapture, type CapturedFile } from "@/components/operations/PhotoCapture";
import { SignatureCapture } from "@/components/operations/SignatureCapture";
import { api } from "@/lib/api";
import { buildServiceReportPdfBlob } from "@/lib/serviceReportPdf";
import { uploadServiceImageData, getServiceImageUrl } from "@/lib/supabaseStorage";
import { ArrowLeft, BookOpen, Camera, CheckCircle2, Circle, Download, FileSignature, PackageSearch, Play, Star, Wrench, X, XCircle, ZoomIn } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ServiceReferencePart = { id: number | string; name: string; quantity: number; unit: string };
type ReferenceManual = { title: string; file_name?: string; mime_type?: string; file_url?: string; base64_data?: string; notes?: string };
type ServiceReference = { code: string; name: string; parts: ServiceReferencePart[]; manuals?: ReferenceManual[]; metadata?: { manuals?: ReferenceManual[] } };
type InspectionStatus = "ok" | "averiada" | "faltante";
type InspectionItem = { part_id: number | string; name: string; quantity: number; unit: string; status: InspectionStatus; comment: string; action: string; supplier_name?: string };
type ServicePhoto = { id: number | string; type: string; file_url?: string; base64_data?: string; storage_path?: string; metadata?: { mime_type?: string; file_name?: string; part_id?: number | string; part_name?: string; [key: string]: unknown }; created_at?: string };
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
    customer_phone_secondary?: string;
    inspection?: { items?: InspectionItem[]; decision?: string; problem_count?: number };
    satisfaction_survey?: { answers?: Array<{ question_id: string; question: string; rating: number }>; average?: number; completed_at?: string };
  };
};
type Panel = "inicio" | "inspeccion" | "ejecucion" | "novedad" | "historial";
type UploadStatus = "idle" | "pending" | "uploading" | "uploaded" | "failed";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
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
  const value = String(id || "");
  return /^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

const signedUrlCache = new Map<string, string>();

function photoSrc(photo: ServicePhoto) {
  if (photo.storage_path) {
    const cached = signedUrlCache.get(photo.storage_path);
    if (cached) return cached;
    // Resolver asincrónicamente sin bloqueAR
    getServiceImageUrl(photo.storage_path, 3600)
      .then((url) => { if (url) signedUrlCache.set(photo.storage_path, url); })
      .catch(() => undefined);
    // Fallback: si no hay signed URL cacheada, usar base64 o file_url
  }
  if (photo.base64_data) return photo.base64_data.startsWith("data:") ? photo.base64_data : `data:${photo.metadata?.mime_type || "image/jpeg"};base64,${photo.base64_data}`;
  return photo.file_url || "";
}

function mergeOrderState(current: ServiceOrder | null, incoming: ServiceOrder | null | undefined) {
  if (!incoming?.id) return current;
  if (!current?.id) return incoming;
  const photosById = new Map<string, ServicePhoto>();
  for (const photo of current.photos || []) photosById.set(String(photo.id), photo);
  for (const photo of incoming.photos || []) photosById.set(String(photo.id), photo);
  return {
    ...current,
    ...incoming,
    reference: incoming.reference || current.reference,
    incidents: incoming.incidents?.length ? incoming.incidents : current.incidents,
    photos: Array.from(photosById.values())
  };
}

function manualHref(manual: ReferenceManual) {
  return manual.base64_data || manual.file_url || "";
}

export default function ServiceOperationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [noExecutionReason, setNoExecutionReason] = useState("");
  const [working, setWorking] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadStatus>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [captures, setCaptures] = useState<Record<string, CapturedFile | null>>({});
  const [inspection, setInspection] = useState<InspectionItem[]>([]);
  const [closureMode, setClosureMode] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SatisfactionQuestion[]>(fallbackSatisfactionQuestions());
  const [satisfactionRatings, setSatisfactionRatings] = useState<Record<string, number>>({});
  const [activePanel, setActivePanel] = useState<Panel>("inicio");
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>("decision");
  const [zoomedPhoto, setZoomedPhoto] = useState<ServicePhoto | null>(null);
  const inFlightUploads = useRef(new Set<string>());

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
      setOrder((current) => mergeOrderState(current, data));
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
    if (file && (type === "pieza_averiada" ? hasPersistedProblemEvidence(metadata.part_id as number | string) : hasPersistedPhoto(type))) {
      setMessage(`La evidencia ${photoLabels[type] || type} ya fue registrada y no puede repetirse.`);
      return false;
    }
    setCaptures((current) => ({ ...current, [captureKey]: file }));
    if (!file) {
      setUploadStatus((current) => ({ ...current, [captureKey]: "idle" }));
      setUploadProgress((current) => ({ ...current, [captureKey]: 0 }));
      return true;
    }
    if (inFlightUploads.current.has(captureKey)) return false;
    inFlightUploads.current.add(captureKey);
    setUploading((current) => ({ ...current, [captureKey]: true }));
    setUploadStatus((current) => ({ ...current, [captureKey]: "uploading" }));
    setUploadProgress((current) => ({ ...current, [captureKey]: 20 }));
    try {
      const companyId = typeof window !== "undefined" ? localStorage.getItem("apexos_company_id") || "" : "";
      const serviceId = String(params.id);
      let storagePath = "";
      if (file.base64 && companyId) {
        try {
          const uploaded = await uploadServiceImageData(companyId, serviceId, {
            base64: file.base64,
            name: file.name,
            type: file.type
          });
          storagePath = uploaded.storagePath;
          setUploadProgress((current) => ({ ...current, [captureKey]: 50 }));
        } catch (storageError) {
          // Si falla Storage, continuamos con base64 como fallback
          console.warn("Storage upload failed, falling back to base64:", storageError);
        }
      }
      const clientUploadId = `${params.id}:${captureKey}:${file.name}:${file.size}:${file.processedAt || Date.now()}`;
      const savedPhoto = await api<ServicePhoto>(`/api/v1/services/orders/${params.id}/photos`, {
        method: "POST",
        body: JSON.stringify({
          type,
          ...(storagePath ? { storage_path: storagePath } : { base64_data: file.base64 }),
          size_bytes: file.size,
          mime_type: file.type,
          file_name: file.name,
          metadata: {
            ...metadata,
            client_upload_id: clientUploadId,
            original_size_bytes: file.originalSize || file.size,
            optimized_size_bytes: file.size,
            captured_at: file.processedAt || new Date().toISOString()
          }
        })
      });
      setUploadProgress((current) => ({ ...current, [captureKey]: 95 }));
      if (!savedPhoto?.id) throw new Error(`La evidencia ${photoLabels[type] || type} se envio, pero no quedo visible para esta orden.`);
      setOrder((current) => current ? {
        ...current,
        photos: current.photos.some((photo) => photo.id === savedPhoto.id)
          ? current.photos.map((photo) => photo.id === savedPhoto.id ? savedPhoto : photo)
          : [...current.photos, savedPhoto]
      } : current);
      setUploadStatus((current) => ({ ...current, [captureKey]: "uploaded" }));
      setUploadProgress((current) => ({ ...current, [captureKey]: 100 }));
      setMessage(`Evidencia ${photoLabels[type] || type} cargada.`);
      return true;
    } catch (error) {
      setUploadStatus((current) => ({ ...current, [captureKey]: "failed" }));
      setMessage(error instanceof Error ? error.message : "No fue posible guardar la evidencia.");
      return false;
    } finally {
      inFlightUploads.current.delete(captureKey);
      setUploading((current) => ({ ...current, [captureKey]: false }));
    }
  }

  function setProblemEvidence(partId: number | string, file: CapturedFile | null) {
    setCaptures((current) => ({ ...current, [`pieza_${partId}`]: file }));
    setUploadStatus((current) => ({ ...current, [`pieza_${partId}`]: file ? "pending" : "idle" }));
    if (file) setMessage("Evidencia lista. Guarda la inspeccion para registrarla en la orden.");
  }

  async function uploadSignature(file: CapturedFile | null, metadata: Record<string, unknown> = {}) {
    await uploadPhoto("firma_cliente", file, {
      evidence_kind: "customer_signature",
      signed_by: order?.customer_name || "",
      signed_at: file ? new Date().toISOString() : "",
      ...metadata
    });
  }

  async function update(action: "start" | "inspection" | "execution" | "close" | "close-not-executed") {
    if (action === "close" && !closeReady()) {
      setMessage(`No se puede cerrar todavia. Pendiente: ${closePendingItems().join(", ")}.`);
      return;
    }
    if (action === "close-not-executed" && !noExecutionReady()) {
      setMessage("No se puede cerrar como no ejecutada todavia. Completa motivo, evidencia y firma.");
      return;
    }
    setWorking(true);
    try {
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
          metadata: {
            ...(action === "start" ? { start_without_gps: true, start_method: "technician_manual_confirmation" } : {}),
            ...(action === "close" || action === "close-not-executed" ? { close_without_gps: true, close_method: "technician_manual_confirmation" } : {}),
            ...(satisfactionSurvey ? { satisfaction_survey: satisfactionSurvey } : {})
          }
        })
      });
      const finalStatus = action === "close" ? "cerrada" : action === "close-not-executed" ? "no_ejecutada" : "";
      const safeUpdated = updated?.id ? updated : finalStatus && order ? { ...order, status: finalStatus, closed_at: new Date().toISOString() } : updated;
      if (!safeUpdated?.id) throw new Error("El servicio avanzo, pero no fue posible leer la orden actualizada.");
      setOrder((current) => mergeOrderState(current, safeUpdated));
      setActivePanel(panelForStatus(safeUpdated.status));
      setMessage(`Orden ${statusLabel[safeUpdated.status] || safeUpdated.status}.`);
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

  function hasPersistedProblemEvidence(partId: number | string) {
    return Boolean(order?.photos.some((photo) => photo.type === "pieza_averiada" && String(photo.metadata?.part_id) === String(partId)));
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

  function closePendingItems() {
    if (!order || order.status !== "ejecucion") return [];
    const missingPhotos = closePhotoTypes.filter((type) => !hasPersistedPhoto(type)).map((type) => photoLabels[type] || type);
    const missingSurvey = surveyQuestions.filter((question) => !(satisfactionRatings[question.id] >= 1)).map((question) => question.label);
    return [
      ...missingPhotos.map((item) => `Evidencia: ${item}`),
      ...missingSurvey.map((item) => `Encuesta: ${item}`)
    ];
  }

  function noExecutionReady() {
    return Boolean(noExecutionReason.trim() && hasPersistedPhoto("no_ejecutada") && hasPersistedPhoto("firma_cliente") && !uploadsPending(["no_ejecutada", "firma_cliente"]));
  }

  function openIncidentReport() {
    setInspectionMode("decision");
    setClosureMode(false);
    setActivePanel("novedad");
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
    for (const item of problems) {
      const captureKey = `pieza_${item.part_id}`;
      const pendingFile = captures[captureKey];
      if (pendingFile && !hasPersistedProblemEvidence(item.part_id)) {
        const uploaded = await uploadPhoto("pieza_averiada", pendingFile, {
          part_id: item.part_id,
          part_name: item.name,
          status: item.status,
          comment: item.comment,
          action: item.action,
          supplier_name: item.supplier_name || ""
        }, captureKey);
        if (!uploaded) return null;
      }
    }
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
      setOrder((current) => mergeOrderState(current, updated));
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
      setOrder((current) => mergeOrderState(current, updated));
      setClosureMode(false);
      const problems = inspection.filter((item) => item.status !== "ok");
      setNoExecutionReason(problems.map((item) => `${inspectionStatusLabel[item.status]}: ${item.name}${item.comment ? ` - ${item.comment}` : ""}`).join("\n"));
      openIncidentReport();
      setMessage("Producto no armable. Completa el reporte unico de novedad para cerrar la orden.");
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
  const inspectedItems = order.metadata?.inspection?.items || [];
  const inspectionIssues = inspectedItems.filter((item) => item.status !== "ok");
  const inspectionOkCount = inspectedItems.length - inspectionIssues.length;

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

      <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
        <p className="text-sm font-semibold">{order.reference?.code} · {order.reference?.name}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {order.reference?.parts.length || 0} pieza(s) · {order.service_type} · {[order.customer_phone, order.metadata?.customer_phone_secondary].filter(Boolean).join(" / ") || "Sin telefono"}
        </p>
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
            <button className="hidden min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 md:inline-flex" onClick={openIncidentReport} type="button">
              <FileSignature size={16} /> Reportar novedad
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
          <div className="rounded-md border border-line bg-paper p-3">
            <p className="font-semibold">Confirma el inicio para continuar con la inspección.</p>
          </div>
          <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white disabled:opacity-50" disabled={working} onClick={() => update("start")} type="button"><Play size={18} /> Iniciar servicio</button>
        </section>
      ) : null}

      {activePanel === "inspeccion" && ["en_curso", "inspeccion"].includes(order.status) ? (
        <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <h2 className="mb-3 text-base font-semibold">Inspección</h2>
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
            <button className={`min-h-20 rounded-md border p-4 text-left shadow-sm transition active:scale-[0.99] ${inspectionMode === "pieces" ? "border-apex bg-apex/10" : "border-line bg-paper hover:border-apex"}`} onClick={() => setInspectionMode("pieces")} type="button">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-apex text-white"><PackageSearch size={23} /></span>
                <span>
                  <span className="block text-xl font-semibold">Piezas</span>
                  <span className="mt-1 block text-sm text-neutral-600">Revisar piezas y soportes</span>
                </span>
              </span>
            </button>
            <button className="min-h-20 rounded-md border border-emerald-500 bg-emerald-700 p-4 text-left text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-50" disabled={working} onClick={markArmable} type="button">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/15 text-white"><Wrench size={23} /></span>
                <span>
                  <span className="block text-xl font-semibold">Armable</span>
                  <span className="mt-1 block text-sm text-emerald-50">Continuar</span>
                </span>
              </span>
            </button>
            <button className="min-h-20 rounded-md border border-red-500 bg-red-700 p-4 text-left text-white shadow-sm transition hover:bg-red-600 active:scale-[0.99] disabled:opacity-50" disabled={working} onClick={markNotArmable} type="button">
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/15 text-white"><XCircle size={23} /></span>
                <span>
                  <span className="block text-xl font-semibold">No armable</span>
                  <span className="mt-1 block text-sm text-red-50">Enviar a reporte de novedad</span>
                </span>
              </span>
            </button>
          </div>

          {inspectionMode === "pieces" ? (
            <div className="mt-4 space-y-3 rounded-md border border-line bg-paper p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Inventario de piezas</h3>
                  <p className="mt-1 text-sm text-neutral-600">Marca la pieza y adjunta el soporte.</p>
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
                        <PhotoCapture
                          label={`Evidencia - ${part.name}`}
                          required
                          locked={hasPersistedProblemEvidence(part.part_id)}
                          loading={uploading[`pieza_${part.part_id}`]}
                          progress={uploadProgress[`pieza_${part.part_id}`]}
                          status={uploadStatus[`pieza_${part.part_id}`]}
                          value={captures[`pieza_${part.part_id}`] || null}
                          onChange={(file) => setProblemEvidence(part.part_id, file)}
                        />
                        {hasPersistedProblemEvidence(part.part_id) ? <p className="text-xs font-semibold text-emerald-700">Evidencia registrada para esta pieza.</p> : null}
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
                <PhotoCapture label="Foto 1: Producto abierto" required locked={hasPersistedPhoto("producto_abierto")} loading={uploading.producto_abierto} progress={uploadProgress.producto_abierto} status={uploadStatus.producto_abierto} value={captures.producto_abierto || null} onChange={(file) => uploadPhoto("producto_abierto", file)} />
                <PhotoCapture label="Foto 2: Producto cerrado" required locked={hasPersistedPhoto("producto_cerrado")} loading={uploading.producto_cerrado} progress={uploadProgress.producto_cerrado} status={uploadStatus.producto_cerrado} value={captures.producto_cerrado || null} onChange={(file) => uploadPhoto("producto_cerrado", file)} />
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
                <SignatureCapture label="Firma del cliente" required locked={hasPersistedPhoto("firma_cliente")} value={captures.firma_cliente || null} onChange={(file) => uploadSignature(file)} />
              </div>
              <button className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 text-base font-semibold text-white disabled:opacity-50" disabled={working || !closeReady()} onClick={() => update("close")} type="button"><CheckCircle2 size={18} /> {uploadsPending(closePhotoTypes) ? "Guardando soportes..." : "Cerrar servicio"}</button>
              {!closeReady() ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">Pendiente para cerrar</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {closePendingItems().map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
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
            <PhotoCapture label="2. Evidencia de la novedad" required locked={hasPersistedPhoto("no_ejecutada")} loading={uploading.no_ejecutada} progress={uploadProgress.no_ejecutada} status={uploadStatus.no_ejecutada} value={captures.no_ejecutada || null} onChange={(file) => uploadPhoto("no_ejecutada", file, { reason: noExecutionReason })} />
            <SignatureCapture label="3. Firma del cliente" required locked={hasPersistedPhoto("firma_cliente")} value={captures.firma_cliente || null} onChange={(file) => uploadSignature(file, { reason: noExecutionReason, closure: "no_ejecutada" })} />
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
                  {src ? <button className="group relative block w-full overflow-hidden rounded-md" onClick={() => setZoomedPhoto(photo)} type="button"><Image className="aspect-square w-full object-cover" height={480} src={src} alt={photoLabels[photo.type] || photo.type} unoptimized width={480} /><span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"><ZoomIn size={28} /></span></button> : <div className="flex aspect-square items-center justify-center rounded-md bg-white text-xs text-neutral-500">Sin preview</div>}
                  <p className="mt-2 text-xs font-semibold">{photoLabels[photo.type] || photo.type}</p>
                  {photo.metadata?.part_name ? <p className="text-[11px] text-neutral-500">{String(photo.metadata.part_name)}</p> : null}
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            {inspectedItems.length ? (
              <div className="rounded-md border border-line bg-paper p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Inspeccion de piezas</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{inspectedItems.length} revisadas · {inspectionOkCount} OK · {inspectionIssues.length} con novedad</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${inspectionIssues.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{inspectionIssues.length ? `${inspectionIssues.length} novedad(es)` : "Todo OK"}</span>
                </div>
                {inspectionIssues.length ? <div className="mt-3 grid gap-2">{inspectionIssues.map((item) => <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" key={item.part_id}><span className="font-semibold">{item.name}: {inspectionStatusLabel[item.status]}</span>{item.comment ? ` · ${item.comment}` : ""}</p>)}</div> : null}
                <details className="mt-3 border-t border-line pt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-apex">Ver detalle de todas las piezas</summary>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {inspectedItems.map((item) => <p className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs" key={item.part_id}><span className="truncate">{item.name}</span><span className={`shrink-0 font-semibold ${item.status === "ok" ? "text-emerald-700" : "text-amber-800"}`}>{inspectionStatusLabel[item.status]}</span></p>)}
                  </div>
                </details>
              </div>
            ) : null}
            {order.incidents.map((item) => <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900" key={item.id}>{item.type}: {item.description}</p>)}
            {!order.photos.length && !order.incidents.length ? <p className="text-sm text-neutral-500">Sin evidencia registrada.</p> : null}
          </div>
        </section>
      ) : null}
      {zoomedPhoto && photoSrc(zoomedPhoto) ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Vista ampliada de evidencia" onClick={() => setZoomedPhoto(null)}>
          <button className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-md bg-white text-neutral-900" onClick={() => setZoomedPhoto(null)} type="button" aria-label="Cerrar vista ampliada"><X size={22} /></button>
          <div className="flex max-h-full max-w-6xl flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <Image className="max-h-[82vh] h-auto w-auto max-w-full object-contain" height={1400} src={photoSrc(zoomedPhoto)} alt={photoLabels[zoomedPhoto.type] || zoomedPhoto.type} unoptimized width={1800} />
            <p className="text-sm font-semibold text-white">{photoLabels[zoomedPhoto.type] || zoomedPhoto.type}</p>
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur md:hidden">
        {orderCompleted ? (
          <button className="inline-flex h-16 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-lg font-semibold text-white shadow-sm" onClick={() => router.replace("/dashboard/servicios")} type="button"><CheckCircle2 size={22} /> Servicio completado</button>
        ) : activePanel === "historial" ? (
          <button className="h-14 w-full rounded-md bg-apex px-3 text-base font-semibold text-white shadow-sm disabled:opacity-60" disabled={downloadingPdf} onClick={downloadPdf} type="button">{downloadingPdf ? "Generando PDF..." : "Descargar PDF"}</button>
        ) : activePanel !== "novedad" ? <button className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-white text-base font-semibold text-red-700 shadow-sm" onClick={openIncidentReport} type="button"><FileSignature size={18} /> Reportar novedad</button> : null}
      </div>
    </div>
  );
}

function SupportState({ ready, label }: { ready: boolean; label: string }) {
  return <div className={`rounded-md border p-2 ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-line bg-paper text-neutral-500"}`}><span className="flex items-center justify-center gap-1">{ready ? <CheckCircle2 size={14} /> : <Circle size={14} />}{label}</span></div>;
}
