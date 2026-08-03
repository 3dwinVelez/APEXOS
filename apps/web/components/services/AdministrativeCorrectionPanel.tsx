"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { uploadAuthorizedServiceImageData } from "@/lib/supabaseStorage";
import { AlertTriangle, Check, FileClock, History, LockKeyhole, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Evidence = { id: number | string; type: string; created_at?: string };
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
  photos: Evidence[];
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
  changes: Change[];
};
type Mode = "field" | "observation" | "status" | "add-evidence" | "remove-evidence" | "reopen" | "force-close";

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
const SPECIAL_EDIT_PERMISSION = "edit_any_state";

function allowed() {
  return hasStoredRolePermission("services.orders", SPECIAL_EDIT_PERMISSION);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Sin dato";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No fue posible leer el archivo"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
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
  const [pendingRequirements, setPendingRequirements] = useState("");
  const [rejections, setRejections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadHistory = useCallback(async () => {
    if (!canHistory) return;
    const rows = await api<Correction[]>(`/api/v1/services/orders/${order.id}/corrections`);
    setHistory(rows);
  }, [canHistory, order.id]);

  useEffect(() => { if (historyOpen) void loadHistory().catch(() => setMessage("No fue posible consultar el historial de correcciones.")); }, [historyOpen, loadHistory]);

  const beforeValue = useMemo(() => displayValue(field.includes(".") ? "Dato estructurado" : order[field as keyof Order]), [field, order]);
  const nextStates = administrativeStatuses.filter((status) => status !== order.status);

  function resetForm() {
    setDescription("");
    setConfirmed(false);
    setObservation("");
    setPendingRequirements("");
    setEvidenceId("");
    setFile(null);
  }

  async function applyDraft(correction: Correction) {
    if (mode === "add-evidence") {
      if (!file) throw new Error("Selecciona la evidencia que deseas agregar.");
      const base64 = await fileBase64(file);
      const clientUploadId = `admin:${order.id}:${correction.id}:${file.name}:${file.size}`;
      const authorization = await api<{ authorization_id: string; signed_upload_url: string; path: string }>(`/api/v1/services/orders/${order.id}/corrections/evidence-upload-authorizations`, {
        method: "POST",
        body: JSON.stringify({ mime_type: file.type, size_bytes: file.size, purpose: evidenceType, client_upload_id: clientUploadId })
      });
      await uploadAuthorizedServiceImageData(authorization, { base64, name: file.name, type: file.type });
      const confirmation = await api<{ status: string }>(`/api/v1/services/corrections/evidence-upload-authorizations/${authorization.authorization_id}/confirm`, { method: "POST" });
      if (confirmation.status !== "validated") throw new Error("La evidencia no supero la validacion autoritativa.");
      await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/evidence`, { method: "POST", body: JSON.stringify({ authorization_id: authorization.authorization_id, type: evidenceType }) });
      return;
    }
    await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/apply`, { method: "POST" });
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const base = { reason_code: reason, description, confirmed, expected_version: order.version || 1, idempotency_key: crypto.randomUUID() };
      let correction: Correction;
      if (mode === "reopen") {
        correction = await api<Correction>(`/api/v1/services/orders/${order.id}/reopen`, { method: "POST", body: JSON.stringify(base) });
      } else if (mode === "force-close") {
        correction = await api<Correction>(`/api/v1/services/orders/${order.id}/force-close`, { method: "POST", body: JSON.stringify({ ...base, observation, pending_requirements: pendingRequirements.split("\n").map((item) => item.trim()).filter(Boolean), evidence_reviewed: true }) });
      } else {
        const changes = mode === "field" ? [{ type: "FIELD_UPDATED", field, value }]
          : mode === "observation" ? [{ type: "OBSERVATION_ADDED", value: observation }]
            : mode === "status" ? [{ type: "STATUS_CHANGED", value }]
              : mode === "remove-evidence" ? [{ type: "EVIDENCE_REMOVED", evidence_id: Number(evidenceId) }]
                : [{ type: "EVIDENCE_ADDED", value: evidenceType }];
        correction = await api<Correction>(`/api/v1/services/orders/${order.id}/corrections`, { method: "POST", body: JSON.stringify({ ...base, changes }) });
      }
      await applyDraft(correction);
      setMessage("Correccion aplicada y auditada correctamente.");
      await onApplied();
      resetForm();
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible procesar la correccion.");
    } finally {
      setBusy(false);
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
      setMessage(error instanceof Error ? error.message : "No fue posible aprobar la correccion.");
    } finally { setBusy(false); }
  }

  async function applyApproved(correction: Correction) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/apply`, { method: "POST" });
      setMessage("Correccion aprobada aplicada en una transaccion controlada.");
      await Promise.all([loadHistory(), Promise.resolve(onApplied())]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible aplicar la correccion."); }
    finally { setBusy(false); }
  }

  async function rejectCorrection(correction: Correction) {
    setBusy(true);
    try {
      await api(`/api/v1/services/orders/${order.id}/corrections/${correction.id}/reject`, { method: "POST", body: JSON.stringify({ rejection_reason: rejections[correction.id] || "Solicitud rechazada por el aprobador" }) });
      await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible rechazar la correccion."); }
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

      {message ? <p className="mt-3 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-medium text-teal-950">{message}</p> : null}

      {open ? (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><p>Todos los cambios quedan auditados. El estado de pago no bloquea esta edicion y los registros contables no se modifican.</p></div>
          <label className="block text-sm font-semibold">Tipo de correccion<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={mode} onChange={(event) => { const next = event.target.value as Mode; setMode(next); if (next === "status") setValue(nextStates[0] || ""); }}>{canInfo ? <option value="field">Corregir informacion</option> : null}{canObservation ? <option value="observation">Anexar novedad</option> : null}{canState && nextStates.length ? <option value="status">Cambiar estado</option> : null}{canEvidence ? <><option value="add-evidence">Agregar evidencia</option><option value="remove-evidence">Retirar evidencia</option></> : null}{canState && ["cerrada", "no_ejecutada"].includes(order.status) ? <option value="reopen">Reabrir para correccion</option> : null}{canForceClose ? <option value="force-close">Cerrar administrativamente</option> : null}</select></label>

          {mode === "field" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Campo<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={field} onChange={(event) => { setField(event.target.value); setValue(displayValue(order[event.target.value as keyof Order]) === "Sin dato" ? "" : displayValue(order[event.target.value as keyof Order])); }}>{fields.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm font-semibold">Nuevo valor<input className="mt-1 h-11 w-full rounded-md border border-line px-3" value={value} onChange={(event) => setValue(event.target.value)} /></label><div className="rounded-md bg-neutral-50 p-3 text-sm"><span className="text-xs font-semibold text-neutral-500">Anterior</span><p className="break-words">{beforeValue}</p></div><div className="rounded-md bg-teal-50 p-3 text-sm"><span className="text-xs font-semibold text-teal-700">Nuevo</span><p className="break-words">{value || "Sin dato"}</p></div></div> : null}
          {mode === "observation" ? <label className="block text-sm font-semibold">Nueva observacion<textarea className="mt-1 min-h-24 w-full rounded-md border border-line p-3" value={observation} onChange={(event) => setObservation(event.target.value)} /></label> : null}
          {mode === "status" ? <label className="block text-sm font-semibold">Nuevo estado<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={value} onChange={(event) => setValue(event.target.value)}>{nextStates.map((state) => <option key={state} value={state}>{state.replaceAll("_", " ")}</option>)}</select></label> : null}
          {mode === "remove-evidence" ? <label className="block text-sm font-semibold">Evidencia a retirar<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Selecciona evidencia</option>{order.photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.type} - #{photo.id}</option>)}</select></label> : null}
          {mode === "add-evidence" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Tipo<input className="mt-1 h-11 w-full rounded-md border border-line px-3" pattern="[a-z0-9_-]+" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} /></label><label className="text-sm font-semibold">Archivo validado<input accept="image/png,image/jpeg,image/webp" className="mt-1 block h-11 w-full rounded-md border border-line bg-white p-2 text-sm" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></div> : null}
          {mode === "force-close" ? <div className="grid gap-3"><label className="text-sm font-semibold">Observacion de cierre<textarea className="mt-1 min-h-20 w-full rounded-md border border-line p-3" value={observation} onChange={(event) => setObservation(event.target.value)} /></label><label className="text-sm font-semibold">Requisitos pendientes, uno por linea<textarea className="mt-1 min-h-20 w-full rounded-md border border-line p-3" value={pendingRequirements} onChange={(event) => setPendingRequirements(event.target.value)} /></label><p className="flex items-center gap-2 text-xs font-medium text-neutral-600"><Check size={15} /> Al confirmar declaras que revisaste las evidencias minimas y que los pendientes seguiran visibles.</p></div> : null}

          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Motivo<select className="mt-1 h-11 w-full rounded-md border border-line bg-white px-3" value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><label className="text-sm font-semibold">Version esperada<input className="mt-1 h-11 w-full rounded-md border border-line bg-neutral-50 px-3" readOnly value={order.version || 1} /></label></div>
          <label className="block text-sm font-semibold">Descripcion detallada<textarea className="mt-1 min-h-24 w-full rounded-md border border-line p-3" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="flex items-start gap-3 rounded-md border border-line p-3 text-sm"><input className="mt-1 h-4 w-4 accent-teal-700" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>Confirmo que revise el antes y despues y que esta operacion quedara registrada en auditoria.</span></label>
          <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-teal-700 font-semibold text-white disabled:opacity-50" disabled={busy || !confirmed || description.trim().length < 12 || (mode === "field" && !canInfo) || (mode === "observation" && !canObservation) || (mode === "status" && !canState) || (mode === "add-evidence" && (!canEvidence || !file)) || (mode === "remove-evidence" && (!canEvidence || !evidenceId)) || (mode === "reopen" && !canState) || (mode === "force-close" && !canForceClose)} onClick={submit} type="button">{busy ? <RefreshCw className="animate-spin" size={17} /> : <LockKeyhole size={17} />} Registrar correccion controlada</button>
        </div>
      ) : null}

      {historyOpen ? <div className="mt-4 space-y-3 border-t border-line pt-4">{history.length ? history.map((correction) => <article className="rounded-md border border-line p-3" key={correction.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{reasons.find(([code]) => code === correction.reason_code)?.[1] || correction.reason_code}</p><p className="mt-1 text-xs text-neutral-500">{new Date(correction.requested_at).toLocaleString()} - usuario #{correction.requested_by}</p></div><span className={`rounded-md px-2 py-1 text-xs font-semibold ${correction.status === "APPLIED" ? "bg-emerald-100 text-emerald-800" : correction.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{correction.status}</span></div><p className="mt-2 text-sm text-neutral-700">{correction.description}</p>{correction.changes.map((change) => <div className="mt-2 grid gap-2 rounded-md bg-neutral-50 p-2 text-xs sm:grid-cols-2" key={change.id}><span><strong>Anterior:</strong> {displayValue(change.old_value)}</span><span><strong>Nuevo:</strong> {displayValue(change.new_value)}</span></div>)}{correction.status === "PENDING_APPROVAL" && canApprove ? <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Motivo para rechazar" value={rejections[correction.id] || ""} onChange={(event) => setRejections((current) => ({ ...current, [correction.id]: event.target.value }))} /><button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white" disabled={busy} onClick={() => approveCorrection(correction)} type="button"><Check size={16} /> Aprobar</button><button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-50" disabled={busy || String(rejections[correction.id] || "").trim().length < 8} onClick={() => rejectCorrection(correction)} type="button"><X size={16} /> Rechazar</button></div> : null}{correction.status === "APPROVED" && canCorrect ? <button className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white" disabled={busy} onClick={() => applyApproved(correction)} type="button"><LockKeyhole size={16} /> Aplicar aprobada</button> : null}</article>) : <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">No hay correcciones administrativas registradas.</p>}</div> : null}
    </section>
  );
}
