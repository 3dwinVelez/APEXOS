"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { correctionDescriptionMinimum, serviceCorrectionModeLabels, serviceCorrectionValidationIssues, type ServiceCorrectionMode } from "@/lib/serviceCorrectionForm";
import { uploadAuthorizedServiceImageData, uploadServiceImageData } from "@/lib/supabaseStorage";
import { AlertTriangle, Camera, Check, FileClock, History, LockKeyhole, MessageSquarePlus, PackageSearch, Pencil, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Evidence = { id: number | string; type: string; created_at?: string };
type ReferencePart = { id: number | string; name: string; quantity: number; unit: string };
type InspectionItem = { part_id: number | string; name: string; quantity: number; unit: string; status: string; comment?: string; action?: string; supplier_name?: string };
type Order = {
  id: number | string;
  version?: number;
  status: string;
  notes?: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  invoice_number?: string;
  service_type: string;
  scheduled_date?: string;
  administratively_modified?: boolean;
  billing_status?: string;
  billing_blocked?: boolean;
  photos?: Evidence[];
  reference?: { parts?: ReferencePart[] };
  metadata?: { inspection?: { items?: InspectionItem[] } };
};
type Change = { id: string; change_type: string; field_name?: string; old_value?: unknown; new_value?: unknown; evidence_id?: number; created_at: string };
type Correction = {
  id: string;
  status: "DRAFT" | "APPLIED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "REVERTED";
  reason_code: string;
  description: string;
  requested_by: number;
  requested_at: string;
  applied_at?: string;
  approved_at?: string;
  changes?: Change[];
  metadata?: { proposed_changes?: Array<{ type?: string }> };
};
type Mode = ServiceCorrectionMode;

const reasons = [
  ["INCOMPLETE_INFORMATION", "Informacion incompleta"],
  ["DATA_ENTRY_ERROR", "Error de digitacion"],
  ["MISSING_EVIDENCE", "Evidencia faltante"],
  ["INCORRECT_EVIDENCE", "Evidencia incorrecta"],
  ["INCORRECT_STATUS", "Estado incorrecto"],
  ["INCOMPLETE_CLOSURE", "Cierre incompleto"],
  ["CUSTOMER_REQUEST", "Solicitud del cliente"],
  ["BILLING_CORRECTION", "Correccion para facturacion"],
  ["OTHER", "Otro"]
] as const;

const fields = [
  ["notes", "Observaciones"],
  ["customer_name", "Nombre del cliente"],
  ["customer_address", "Direccion"],
  ["customer_phone", "Telefono"],
  ["service_type", "Tipo de servicio"],
  ["scheduled_date", "Fecha programada"],
  ["invoice_number", "Numero de factura"]
] as const;

const administrativeStatuses = ["agendado", "pendiente", "en_curso", "inspeccion", "ejecucion", "cerrada", "no_ejecutada", "cancelada", "revision", "reabierta", "lista_facturacion"];
const evidenceTypes = [
  ["administrative_support", "Soporte administrativo"],
  ["novedad", "Novedad"],
  ["pieza_averiada", "Pieza faltante o averiada"],
  ["fachada", "Fachada"],
  ["producto_abierto", "Producto abierto"],
  ["producto_cerrado", "Producto cerrado"],
  ["cliente", "Cliente"],
  ["firma_cliente", "Firma del cliente"]
] as const;
const SPECIAL_EDIT_PERMISSION = "edit_any_state";

function allowed() {
  return hasStoredRolePermission("services.orders", SPECIAL_EDIT_PERMISSION);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Sin dato";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function orderFieldValue(order: Order, field: string) {
  const value = order[field as keyof Order];
  return value === null || value === undefined ? "" : String(value);
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No fue posible leer el archivo"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function isUuidOrder(order: Order) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(order.id || ""));
}

export function AdministrativeCorrectionPanel({ order, onApplied, initiallyOpen = false }: { order: Order; onApplied: () => Promise<void> | void; initiallyOpen?: boolean }) {
  const canCorrect = allowed();
  const canHistory = canCorrect;
  const canApprove = false;
  const canInfo = canCorrect;
  const canObservation = canCorrect;
  const canState = canCorrect;
  const canEvidence = canCorrect;
  const canForceClose = canCorrect;
  const [open, setOpen] = useState(initiallyOpen && canCorrect);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Correction[]>([]);
  const [mode, setMode] = useState<Mode>(() => canInfo ? "field" : canObservation ? "observation" : canState ? "status" : canEvidence ? "add-evidence" : "force-close");
  const [reason, setReason] = useState("INCOMPLETE_INFORMATION");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [field, setField] = useState("notes");
  const [value, setValue] = useState(String(order.notes || ""));
  const [observation, setObservation] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [evidenceType, setEvidenceType] = useState("administrative_support");
  const [file, setFile] = useState<File | null>(null);
  const [pieceSelection, setPieceSelection] = useState("");
  const [pieceName, setPieceName] = useState("");
  const [pieceQuantity, setPieceQuantity] = useState(1);
  const [pieceUnit, setPieceUnit] = useState("und");
  const [pieceStatus, setPieceStatus] = useState<"faltante" | "averiada">("faltante");
  const [pieceComment, setPieceComment] = useState("");
  const [pieceAction, setPieceAction] = useState("cotizar_repuesto");
  const [pieceSupplier, setPieceSupplier] = useState("");
  const [pendingRequirements, setPendingRequirements] = useState("");
  const [rejections, setRejections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error" | "info">("info");
  const [busyStep, setBusyStep] = useState("");

  const loadHistory = useCallback(async () => {
    if (!canHistory) return;
    const rows = await api<Correction[]>(`/api/v1/services/orders/${order.id}/corrections`);
    setHistory(rows);
  }, [canHistory, order.id]);

  useEffect(() => { if (historyOpen) void loadHistory().catch(() => setMessage("No fue posible consultar el historial de correcciones.")); }, [historyOpen, loadHistory]);

  const currentFieldValue = useMemo(() => orderFieldValue(order, field), [field, order]);
  const beforeValue = useMemo(() => displayValue(currentFieldValue), [currentFieldValue]);
  const nextStates = administrativeStatuses.filter((status) => status !== order.status);
  const activePhotos = Array.isArray(order.photos) ? order.photos : [];
  const minimumDescription = correctionDescriptionMinimum(reason);
  const validationIssues = useMemo(() => serviceCorrectionValidationIssues({
    mode,
    reason,
    description,
    confirmed,
    expectedVersion: Number(order.version || 1),
    currentValue: mode === "status" ? order.status : currentFieldValue,
    nextValue: value,
    observation,
    pieceSelection,
    pieceName,
    pieceQuantity,
    pieceUnit,
    pieceComment,
    fileSelected: Boolean(file),
    evidenceId
  }), [mode, reason, description, confirmed, order.version, order.status, currentFieldValue, value, observation, pieceSelection, pieceName, pieceQuantity, pieceUnit, pieceComment, file, evidenceId]);
  const selectedFieldLabel = fields.find(([key]) => key === field)?.[1] || field;
  const selectedReasonLabel = reasons.find(([code]) => code === reason)?.[1] || reason;

  function resetForm() {
    setDescription("");
    setConfirmed(false);
    setObservation("");
    setPendingRequirements("");
    setEvidenceId("");
    setFile(null);
    setPieceSelection("");
    setPieceName("");
    setPieceQuantity(1);
    setPieceUnit("und");
    setPieceStatus("faltante");
    setPieceComment("");
    setPieceAction("cotizar_repuesto");
    setPieceSupplier("");
    setBusyStep("");
  }

  function choosePiece(selection: string) {
    setPieceSelection(selection);
    if (selection === "manual") {
      setPieceName("");
      setPieceQuantity(1);
      setPieceUnit("und");
      return;
    }
    const selected = order.reference?.parts?.find((part) => String(part.id) === selection);
    if (selected) {
      setPieceName(selected.name);
      setPieceQuantity(Number(selected.quantity || 1));
      setPieceUnit(selected.unit || "und");
    }
  }

  function selectMode(next: Mode) {
    if (next !== mode) setFile(null);
    setMode(next);
    setMessage("");
    setMessageTone("info");
    if (next === "field") setValue(orderFieldValue(order, field));
    if (next === "status") setValue(nextStates[0] || "");
    if (next === "piece-issue") {
      setEvidenceType("pieza_averiada");
      setReason("MISSING_EVIDENCE");
    }
    if (next === "add-evidence") setReason("MISSING_EVIDENCE");
  }

  async function applyDraft(correction: Correction, pieceId?: number) {
    if (mode === "add-evidence" || (mode === "piece-issue" && file)) {
      if (!file) throw new Error("Selecciona la evidencia que deseas agregar.");
      const base64 = await fileBase64(file);
      if (isUuidOrder(order)) {
        const companyId = String(typeof window !== "undefined" ? localStorage.getItem("apexos_company_id") || "" : "").trim();
        if (!companyId) throw new Error("No se encontro la empresa activa para anexar la evidencia.");
        const uploaded = await uploadServiceImageData(companyId, String(order.id), { base64, name: file.name, type: file.type });
        const metadata = mode === "piece-issue" ? { part_id: pieceId, part_name: pieceName.trim() } : undefined;
        await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/evidence`, { method: "POST", body: JSON.stringify({ type: evidenceType, storage_path: uploaded.storagePath, storage_bucket: uploaded.bucket, metadata }) });
        return;
      }
      const clientUploadId = `admin:${order.id}:${correction.id}:${crypto.randomUUID()}`;
      const authorization = await api<{ authorization_id: string; signed_upload_url: string; path: string }>(`/api/v1/services/orders/${order.id}/corrections/evidence-upload-authorizations`, {
        method: "POST",
        body: JSON.stringify({ mime_type: file.type, size_bytes: file.size, purpose: evidenceType, client_upload_id: clientUploadId })
      });
      await uploadAuthorizedServiceImageData(authorization, { base64, name: file.name, type: file.type });
      const confirmation = await api<{ status: string }>(`/api/v1/services/corrections/evidence-upload-authorizations/${authorization.authorization_id}/confirm`, { method: "POST" });
      if (confirmation.status !== "validated") throw new Error("La evidencia no supero la validacion autoritativa.");
      if (mode === "piece-issue" && !Number.isInteger(pieceId)) throw new Error("No fue posible identificar la pieza para asociar la foto.");
      const metadata = mode === "piece-issue" ? { part_id: pieceId, part_name: pieceName.trim() } : undefined;
      await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/evidence`, { method: "POST", body: JSON.stringify({ authorization_id: authorization.authorization_id, type: evidenceType, metadata }) });
      return;
    }
    await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/apply`, { method: "POST" });
  }

  async function submit() {
    if (validationIssues.length) {
      setMessageTone("error");
      setMessage(`Completa ${validationIssues.length} requisito(s) antes de guardar.`);
      return;
    }
    setBusy(true);
    setBusyStep("Registrando la corrección...");
    setMessage("");
    let registeredCorrectionId = "";
    try {
      const base = { reason_code: reason, description, confirmed, expected_version: order.version || 1, idempotency_key: crypto.randomUUID() };
      let correction: Correction;
      let submittedPieceId: number | undefined;
      if (mode === "reopen") {
        correction = await api<Correction>(`/api/v1/services/orders/${order.id}/reopen`, { method: "POST", body: JSON.stringify(base) });
      } else if (mode === "force-close") {
        correction = await api<Correction>(`/api/v1/services/orders/${order.id}/force-close`, { method: "POST", body: JSON.stringify({ ...base, observation, pending_requirements: pendingRequirements.split("\n").map((item) => item.trim()).filter(Boolean), evidence_reviewed: true }) });
      } else {
        const partId = Number(pieceSelection === "manual" || !Number.isInteger(Number(pieceSelection)) ? -Date.now() : pieceSelection);
        if (mode === "piece-issue") submittedPieceId = partId;
        const pieceChange = { type: "PIECE_ISSUE_ADDED", value: { part_id: partId, name: pieceName.trim(), quantity: pieceQuantity, unit: pieceUnit.trim(), status: pieceStatus, comment: pieceComment.trim(), action: pieceAction, supplier_name: pieceSupplier.trim() } };
        const changes = mode === "field" ? [{ type: "FIELD_UPDATED", field, value }]
          : mode === "observation" ? [{ type: "OBSERVATION_ADDED", value: observation }]
            : mode === "piece-issue" ? [pieceChange, ...(file ? [{ type: "EVIDENCE_ADDED", value: "pieza_averiada" }] : [])]
            : mode === "status" ? [{ type: "STATUS_CHANGED", value }]
              : mode === "remove-evidence" ? [{ type: "EVIDENCE_REMOVED", evidence_id: Number(evidenceId) }]
                : [{ type: "EVIDENCE_ADDED", value: evidenceType }];
        correction = await api<Correction>(`/api/v1/services/orders/${order.id}/corrections`, { method: "POST", body: JSON.stringify({ ...base, changes }) });
      }
      registeredCorrectionId = correction.id;
      setBusyStep(mode === "add-evidence" || (mode === "piece-issue" && file) ? "Validando y anexando el soporte..." : "Aplicando el cambio a la orden...");
      await applyDraft(correction, submittedPieceId);
      setBusyStep("Comprobando la información guardada...");
      setMessageTone("success");
      setMessage("Correccion aplicada y auditada correctamente.");
      await onApplied();
      resetForm();
      await loadHistory();
    } catch (error) {
      setMessageTone("error");
      const detail = error instanceof Error ? error.message : "No fue posible procesar la correccion.";
      setMessage(registeredCorrectionId
        ? `La solicitud ${registeredCorrectionId} quedó registrada, pero no pudo aplicarse. ${detail} Abre el historial para revisar o reintentar.`
        : detail);
      if (registeredCorrectionId) {
        setHistoryOpen(true);
        await loadHistory().catch(() => undefined);
      }
    } finally {
      setBusy(false);
      setBusyStep("");
    }
  }

  async function approveCorrection(correction: Correction) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/approve`, { method: "POST" });
      setMessage("Correccion aprobada. Un usuario con permiso de correccion puede aplicarla.");
      await loadHistory();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "No fue posible aprobar la correccion.");
    } finally { setBusy(false); }
  }

  async function applyApproved(correction: Correction) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/apply`, { method: "POST" });
      setMessageTone("success");
      setMessage("Correccion pendiente aplicada en una transaccion controlada.");
      await Promise.all([loadHistory(), Promise.resolve(onApplied())]);
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "No fue posible aplicar la correccion."); }
    finally { setBusy(false); }
  }

  function draftNeedsEvidence(correction: Correction) {
    return (correction.metadata?.proposed_changes || []).some((change) => change.type === "EVIDENCE_ADDED");
  }

  async function rejectCorrection(correction: Correction) {
    setBusy(true);
    try {
      await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/reject`, { method: "POST", body: JSON.stringify({ rejection_reason: rejections[correction.id] || "Solicitud rechazada por el aprobador" }) });
      await loadHistory();
    } catch (error) { setMessageTone("error"); setMessage(error instanceof Error ? error.message : "No fue posible rechazar la correccion."); }
    finally { setBusy(false); }
  }

  if (!canCorrect && !canHistory) return null;

  return (
    <section className="rounded-md border border-teal-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="text-teal-700" size={18} /><h2 className="text-base font-semibold">Control administrativo</h2></div>
          {order.administratively_modified ? <p className="mt-1 text-xs font-semibold text-teal-800">Orden modificada administrativamente</p> : null}
        </div>
        <div className="flex gap-2">
          {canHistory ? <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold" onClick={() => setHistoryOpen((current) => !current)} type="button"><History size={16} /> Historial</button> : null}
          {canCorrect ? <button className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white" onClick={() => setOpen((current) => !current)} type="button"><FileClock size={16} /> Corregir</button> : null}
        </div>
      </div>

      {message ? <p aria-live="polite" className={`mt-3 rounded-md border p-3 text-sm font-medium ${messageTone === "error" ? "border-red-200 bg-red-50 text-red-900" : messageTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>{message}</p> : null}

      {open ? (
        <div className="mt-4 space-y-5 border-t border-line pt-4">
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><p>Todos los cambios quedan auditados. El estado de pago no bloquea esta edicion y los registros contables no se modifican.</p></div>
          <section aria-labelledby="correction-step-action" className="rounded-lg border border-line bg-neutral-50/60 p-3 sm:p-4">
            <div className="mb-3 flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">1</span><div><h3 className="font-semibold" id="correction-step-action">¿Qué necesitas corregir?</h3><p className="mt-0.5 text-sm text-neutral-600">Elige una acción. El formulario mostrará únicamente los datos necesarios.</p></div></div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {canInfo ? <button aria-pressed={mode === "field"} className={`min-h-16 rounded-md border p-3 text-left text-sm ${mode === "field" ? "border-teal-700 bg-teal-50 text-teal-950 ring-1 ring-teal-700" : "border-line bg-white hover:border-teal-300"}`} onClick={() => selectMode("field")} type="button"><span className="flex items-center gap-2 font-semibold"><Pencil size={17} /> Editar información</span><span className="mt-1 block text-xs font-normal text-neutral-600">Cliente, contacto, fecha, servicio u observaciones.</span></button> : null}
              {canObservation ? <button aria-pressed={mode === "observation"} className={`min-h-16 rounded-md border p-3 text-left text-sm ${mode === "observation" ? "border-teal-700 bg-teal-50 text-teal-950 ring-1 ring-teal-700" : "border-line bg-white hover:border-teal-300"}`} onClick={() => selectMode("observation")} type="button"><span className="flex items-center gap-2 font-semibold"><MessageSquarePlus size={17} /> Agregar novedad</span><span className="mt-1 block text-xs font-normal text-neutral-600">Registra una observación sin reemplazar la anterior.</span></button> : null}
              {canCorrect ? <button aria-pressed={mode === "piece-issue"} className={`min-h-16 rounded-md border p-3 text-left text-sm ${mode === "piece-issue" ? "border-teal-700 bg-teal-50 text-teal-950 ring-1 ring-teal-700" : "border-line bg-white hover:border-teal-300"}`} onClick={() => selectMode("piece-issue")} type="button"><span className="flex items-center gap-2 font-semibold"><PackageSearch size={17} /> Reportar pieza</span><span className="mt-1 block text-xs font-normal text-neutral-600">Pieza faltante o averiada, con soporte opcional.</span></button> : null}
              {canEvidence ? <button aria-pressed={mode === "add-evidence"} className={`min-h-16 rounded-md border p-3 text-left text-sm ${mode === "add-evidence" ? "border-teal-700 bg-teal-50 text-teal-950 ring-1 ring-teal-700" : "border-line bg-white hover:border-teal-300"}`} onClick={() => selectMode("add-evidence")} type="button"><span className="flex items-center gap-2 font-semibold"><Camera size={17} /> Anexar soporte</span><span className="mt-1 block text-xs font-normal text-neutral-600">Foto nueva con validación y trazabilidad.</span></button> : null}
            </div>
            <details className="mt-3 rounded-md border border-line bg-white p-3" open={["status", "remove-evidence", "reopen", "force-close"].includes(mode) || undefined}>
              <summary className="cursor-pointer text-sm font-semibold">Acciones de estado y evidencia</summary>
              <p className="mt-1 text-xs text-neutral-600">Úsalas cuando necesites cambiar el ciclo de la orden o retirar un soporte.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {canState && nextStates.length ? <button aria-pressed={mode === "status"} className={`rounded-md border px-3 py-2 text-sm font-semibold ${mode === "status" ? "border-teal-700 bg-teal-50 text-teal-950" : "border-line"}`} onClick={() => selectMode("status")} type="button">Cambiar estado</button> : null}
                {canEvidence ? <button aria-pressed={mode === "remove-evidence"} className={`rounded-md border px-3 py-2 text-sm font-semibold ${mode === "remove-evidence" ? "border-teal-700 bg-teal-50 text-teal-950" : "border-line"}`} onClick={() => selectMode("remove-evidence")} type="button">Retirar evidencia</button> : null}
                {canState && ["cerrada", "no_ejecutada"].includes(order.status) ? <button aria-pressed={mode === "reopen"} className={`rounded-md border px-3 py-2 text-sm font-semibold ${mode === "reopen" ? "border-teal-700 bg-teal-50 text-teal-950" : "border-line"}`} onClick={() => selectMode("reopen")} type="button">Reabrir orden</button> : null}
                {canForceClose && order.status !== "cerrada" ? <button aria-pressed={mode === "force-close"} className={`rounded-md border px-3 py-2 text-sm font-semibold ${mode === "force-close" ? "border-teal-700 bg-teal-50 text-teal-950" : "border-line"}`} onClick={() => selectMode("force-close")} type="button">Cerrar administrativamente</button> : null}
              </div>
            </details>
          </section>

          <section aria-labelledby="correction-step-detail" className="rounded-lg border border-line p-3 sm:p-4">
            <div className="mb-4 flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">2</span><div><h3 className="font-semibold" id="correction-step-detail">Define el cambio</h3><p className="mt-0.5 text-sm text-neutral-600">Acción seleccionada: <strong>{serviceCorrectionModeLabels[mode]}</strong>.</p></div></div>
          {mode === "field" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Dato que vas a editar<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={field} onChange={(event) => { setField(event.target.value); setValue(orderFieldValue(order, event.target.value)); }}>{fields.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm font-semibold">Nuevo valor{field === "notes" ? <textarea className="mt-1 min-h-20 w-full rounded-md border border-line p-3 font-normal" value={value} onChange={(event) => setValue(event.target.value)} /> : <input className="mt-1 h-11 w-full rounded-md border border-line px-3 font-normal" value={value} onChange={(event) => setValue(event.target.value)} />}</label><div className="rounded-md bg-neutral-50 p-3 text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Valor actual</span><p className="mt-1 break-words">{beforeValue}</p></div><div className="rounded-md bg-teal-50 p-3 text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-teal-700">Valor nuevo</span><p className="mt-1 break-words">{value || "Sin dato"}</p></div></div> : null}
          {mode === "observation" ? <label className="block text-sm font-semibold">Nueva novedad <span className="font-normal text-neutral-500">(no reemplaza las observaciones existentes)</span><textarea className="mt-1 min-h-24 w-full rounded-md border border-line p-3 font-normal" placeholder="Describe qué ocurrió y qué seguimiento requiere" value={observation} onChange={(event) => setObservation(event.target.value)} /></label> : null}
          {mode === "piece-issue" ? <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Pieza de la referencia<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={pieceSelection} onChange={(event) => choosePiece(event.target.value)}><option value="">Selecciona una pieza</option>{order.reference?.parts?.map((part) => <option key={part.id} value={String(part.id)}>{part.name}</option>)}<option value="manual">Otra pieza</option></select></label>
            <label className="text-sm font-semibold">Condicion<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={pieceStatus} onChange={(event) => setPieceStatus(event.target.value as "faltante" | "averiada")}><option value="faltante">Faltante</option><option value="averiada">Averiada</option></select></label>
            <label className="text-sm font-semibold">Nombre de la pieza<input className="mt-1 h-11 w-full rounded-md border border-line px-3" disabled={pieceSelection !== "manual"} value={pieceName} onChange={(event) => setPieceName(event.target.value)} /></label>
            <div className="grid grid-cols-[1fr_1fr] gap-2"><label className="text-sm font-semibold">Cantidad<input className="mt-1 h-11 w-full rounded-md border border-line px-3" min="0.01" step="0.01" type="number" value={pieceQuantity} onChange={(event) => setPieceQuantity(Number(event.target.value))} /></label><label className="text-sm font-semibold">Unidad<input className="mt-1 h-11 w-full rounded-md border border-line px-3" value={pieceUnit} onChange={(event) => setPieceUnit(event.target.value)} /></label></div>
            <label className="text-sm font-semibold sm:col-span-2">Detalle de la novedad<textarea className="mt-1 min-h-20 w-full rounded-md border border-line p-3" placeholder="Indica que falta o que dano presenta" value={pieceComment} onChange={(event) => setPieceComment(event.target.value)} /></label>
            <label className="text-sm font-semibold">Accion requerida<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={pieceAction} onChange={(event) => setPieceAction(event.target.value)}><option value="cotizar_repuesto">Cotizar repuesto</option><option value="solicitar_repuesto">Solicitar repuesto</option><option value="reemplazar">Reemplazar</option><option value="revisar">Revisar</option></select></label>
            <label className="text-sm font-semibold">Proveedor sugerido<input className="mt-1 h-11 w-full rounded-md border border-line px-3" placeholder="Opcional" value={pieceSupplier} onChange={(event) => setPieceSupplier(event.target.value)} /></label>
            <label className="text-sm font-semibold sm:col-span-2">Foto de soporte <span className="font-normal text-neutral-500">(opcional)</span><input accept="image/png,image/jpeg,image/webp" className="mt-1 block h-11 w-full rounded-md border border-line bg-white p-2 text-sm" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
          </div> : null}
          {mode === "status" ? <label className="block text-sm font-semibold">Nuevo estado<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={value} onChange={(event) => setValue(event.target.value)}>{nextStates.map((state) => <option key={state} value={state}>{state.replaceAll("_", " ")}</option>)}</select></label> : null}
          {mode === "remove-evidence" ? activePhotos.length ? <label className="block text-sm font-semibold">Evidencia a retirar<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Selecciona evidencia</option>{activePhotos.map((photo) => <option key={photo.id} value={photo.id}>{photo.type} - #{photo.id}</option>)}</select><span className="mt-1 block text-xs font-normal text-neutral-500">El archivo se conserva para auditoría y se retira de la vista operativa.</span></label> : <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">La orden no tiene evidencias activas para retirar.</p> : null}
          {mode === "add-evidence" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Tipo de soporte<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}>{evidenceTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm font-semibold">Foto o archivo validado<input accept="image/png,image/jpeg,image/webp" className="mt-1 block h-11 w-full rounded-md border border-line bg-white p-2 text-sm" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></div> : null}
          {mode === "force-close" ? <div className="grid gap-3"><label className="text-sm font-semibold">Observacion de cierre<textarea className="mt-1 min-h-20 w-full rounded-md border border-line p-3" value={observation} onChange={(event) => setObservation(event.target.value)} /></label><label className="text-sm font-semibold">Requisitos pendientes, uno por linea<textarea className="mt-1 min-h-20 w-full rounded-md border border-line p-3" value={pendingRequirements} onChange={(event) => setPendingRequirements(event.target.value)} /></label><p className="flex items-center gap-2 text-xs font-medium text-neutral-600"><Check size={15} /> Al confirmar declaras que revisaste las evidencias minimas y que los pendientes seguiran visibles.</p></div> : null}
          {mode === "reopen" ? <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">La orden pasará de <strong>{order.status.replaceAll("_", " ")}</strong> a <strong>reabierta</strong>. El cierre anterior quedará en la auditoría.</p> : null}
          </section>

          <section aria-labelledby="correction-step-confirm" className="rounded-lg border border-line p-3 sm:p-4">
            <div className="mb-4 flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">3</span><div><h3 className="font-semibold" id="correction-step-confirm">Justifica, revisa y guarda</h3><p className="mt-0.5 text-sm text-neutral-600">La justificación y el comparativo quedarán en el historial.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Motivo<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><label className="text-sm font-semibold">Versión que se va a editar<input className="mt-1 h-11 w-full rounded-md border border-line bg-neutral-50 px-3" readOnly value={order.version || 1} /><span className="mt-1 block text-xs font-normal text-neutral-500">Si otra persona actualiza la orden, se rechazará sin sobrescribirla.</span></label></div>
            <label className="mt-3 block text-sm font-semibold">Justificación de la corrección <span className="font-normal text-neutral-500">(mínimo {minimumDescription} caracteres)</span><textarea className="mt-1 min-h-24 w-full rounded-md border border-line p-3 font-normal" placeholder="Explica qué estaba incorrecto y por qué debe cambiarse" value={description} onChange={(event) => setDescription(event.target.value)} /><span className={`mt-1 block text-right text-xs font-normal ${description.trim().length >= minimumDescription ? "text-emerald-700" : "text-neutral-500"}`}>{description.trim().length}/{minimumDescription}</span></label>

            <div className="mt-3 rounded-md border border-line bg-neutral-50 p-3 text-sm"><p className="font-semibold">Resumen antes de guardar</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><div><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Acción</span><p>{serviceCorrectionModeLabels[mode]}</p></div><div><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Motivo</span><p>{selectedReasonLabel}</p></div><div><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Versión</span><p>{order.version || 1}</p></div></div>{mode === "field" ? <p className="mt-2 text-xs text-neutral-600">{selectedFieldLabel}: <strong>{beforeValue}</strong> → <strong>{value || "Sin dato"}</strong></p> : null}{mode === "status" ? <p className="mt-2 text-xs text-neutral-600">Estado: <strong>{order.status.replaceAll("_", " ")}</strong> → <strong>{value.replaceAll("_", " ")}</strong></p> : null}{file ? <p className="mt-2 text-xs text-neutral-600">Archivo seleccionado: <strong>{file.name}</strong></p> : null}</div>

            <label className={`mt-3 flex items-start gap-3 rounded-md border p-3 text-sm ${confirmed ? "border-emerald-300 bg-emerald-50" : "border-line bg-white"}`}><input className="mt-1 h-4 w-4 accent-teal-700" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span><strong>Confirmo la corrección.</strong><span className="mt-0.5 block text-neutral-600">Revisé el antes y el después y entiendo que esta operación quedará auditada.</span></span></label>

            <div aria-live="polite" className={`mt-3 rounded-md border p-3 text-sm ${validationIssues.length ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`} id="correction-readiness"><p className="font-semibold">{validationIssues.length ? `Falta completar ${validationIssues.length} requisito(s)` : "Todo listo para guardar"}</p>{validationIssues.length ? <ul className="mt-2 space-y-1">{validationIssues.map((issue) => <li className="flex items-start gap-2" key={issue}><X className="mt-0.5 shrink-0" size={15} /> {issue}</li>)}</ul> : <p className="mt-1 flex items-center gap-2"><Check size={16} /> El cambio puede registrarse y aplicarse.</p>}</div>

            <button aria-describedby="correction-readiness" className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60" disabled={busy} onClick={submit} type="button">{busy ? <RefreshCw className="animate-spin" size={17} /> : <LockKeyhole size={17} />} {busy ? busyStep || "Procesando..." : "Guardar y aplicar corrección"}</button>
          </section>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div><h3 className="font-semibold">Historial de correcciones</h3><p className="mt-1 text-sm text-neutral-600">Cada registro conserva motivo, responsable, estado y comparativo.</p></div>
          {history.length ? history.map((correction) => (
            <article className="rounded-md border border-line p-3" key={correction.id}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{reasons.find(([code]) => code === correction.reason_code)?.[1] || correction.reason_code}</p><p className="mt-1 text-xs text-neutral-500">{new Date(correction.requested_at).toLocaleString()} - usuario #{correction.requested_by}</p></div><span className={`rounded-md px-2 py-1 text-xs font-semibold ${correction.status === "APPLIED" ? "bg-emerald-100 text-emerald-800" : correction.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{correction.status}</span></div>
              <p className="mt-2 text-sm text-neutral-700">{correction.description}</p>
              {(Array.isArray(correction.changes) ? correction.changes : []).map((change) => <div className="mt-2 grid gap-2 rounded-md bg-neutral-50 p-2 text-xs sm:grid-cols-2" key={change.id}><span><strong>Anterior:</strong> {displayValue(change.old_value)}</span><span><strong>Nuevo:</strong> {displayValue(change.new_value)}</span></div>)}
              {correction.status === "DRAFT" && canCorrect ? draftNeedsEvidence(correction)
                ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Este borrador requiere volver a seleccionar el archivo desde “Anexar soporte”.</p>
                : <button className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white" disabled={busy} onClick={() => applyApproved(correction)} type="button"><RefreshCw size={16} /> Reintentar aplicación</button>
              : null}
              {correction.status === "PENDING_APPROVAL" && canApprove ? <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Motivo para rechazar" value={rejections[correction.id] || ""} onChange={(event) => setRejections((current) => ({ ...current, [correction.id]: event.target.value }))} /><button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white" disabled={busy} onClick={() => approveCorrection(correction)} type="button"><Check size={16} /> Aprobar</button><button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-50" disabled={busy || String(rejections[correction.id] || "").trim().length < 8} onClick={() => rejectCorrection(correction)} type="button"><X size={16} /> Rechazar</button></div> : null}
              {correction.status === "APPROVED" && canCorrect ? <button className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white" disabled={busy} onClick={() => applyApproved(correction)} type="button"><LockKeyhole size={16} /> Aplicar aprobada</button> : null}
            </article>
          )) : <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">No hay correcciones administrativas registradas.</p>}
        </div>
      ) : null}
    </section>
  );
}
