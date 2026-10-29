"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, Download, ExternalLink, FileCode2,
  FileText, History, Minus, Plus, RefreshCw, RotateCcw, Save, Search, Send, UserCheck, X
} from "lucide-react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/apiBaseUrl";
import { CostCenterSelect, costCenterLabel, type CostCenterOption } from "@/components/cost-center-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-controls";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Tone = "neutral" | "success" | "warning" | "error" | "info";
type Issue = { code: string; message: string; field?: string; severity?: "critical" | "warning" | "info" };
type Doc = { id: number; document_type: string; file_name: string; mime_type: string; size_bytes: number; is_primary: boolean; checksum_sha256: string; created_at: string };
type Log = { id: number; action: string; note: string | null; changes: Record<string, unknown>; user_id: number | null; created_at: string };
type Assignment = { id: number; responsible_name: string; segment: string | null; leader_assignment_status: string; assignment_status: string; detail: string | null; observations: string | null; created_at: string };
type Invoice = {
  id: number;
  full_number: string;
  document_type: string;
  document_type_label: string | null;
  cufe: string | null;
  prefix: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  reception_date: string;
  issuer_tax_id: string | null;
  issuer_name: string | null;
  receiver_tax_id: string | null;
  receiver_name: string | null;
  subtotal: number | string;
  iva: number | string;
  ica: number | string;
  inc: number | string;
  tax_total: number | string;
  total: number | string;
  currency: string | null;
  dian_validation_status: string | null;
  extraction_source: string | null;
  source_archive: string | null;
  extraction_metadata: {
    pdf_comparison?: { page_count?: number; available?: boolean } | null;
    iva_percents?: number[] | null;
    cufe_validation?: { valid?: boolean } | null;
  } | null;
  processing_status: string;
  assignment_status: string;
  leader_assignment_status: string;
  invoice_status: string;
  processing_label: string;
  assignment_label: string;
  leader_label: string;
  needs_review: boolean;
  review_reasons: string[] | null;
  validation_issues: Issue[] | null;
  group_name: string | null;
  cost_center: string | null;
  segment: string | null;
  assignment_detail: string | null;
  observations: string | null;
  notification_emails: string[] | null;
  responsible_user_id: number | null;
  responsible_name: string | null;
  approved_at: string | null;
  segments: string[];
  cost_centers: CostCenterOption[];
  documents: Doc[];
  assignments: Assignment[];
  change_logs: Log[];
  errors: Array<{ id: number; code: string; message: string; created_at: string }>;
  email: { subject: string | null; from_address: string | null; zip_file_name: string | null; received_at: string | null } | null;
};
type Responsible = { id: number; name: string; email: string; role_name?: string | null };

const PROCESSING_TONE: Record<string, Tone> = { received: "neutral", processing: "info", pending_assignment: "warning", assigned: "info", processed: "success", review: "warning", error: "error" };
const ACTION_LABEL: Record<string, string> = {
  received: "Factura recibida", assigned: "Asignación realizada", approved: "Aprobada por el líder",
  returned: "Devuelta por el líder", updated: "Datos administrativos actualizados",
  review_accepted: "Revisión aceptada", review_rejected: "Revisión rechazada", reprocessed: "ZIP reprocesado",
  documents_attached: "Documentos vinculados"
};

function money(value: number | string | null | undefined, currency = "COP") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: currency || "COP", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return amount.toLocaleString("es-CO");
  }
}
function formatDateTime(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}
function describeError(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
function formatBytes(bytes: number) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-content-muted">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm text-content-strong ${mono ? "font-mono" : ""}`}>{value || "--"}</dd>
    </div>
  );
}

export default function FacturaRecibidaDetallePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) { setError("Factura inválida."); setLoading(false); return; }
    setLoading(true);
    try {
      const loaded = await api<Invoice>(`/api/v1/accounting/received-invoices/${id}`, { cache: "no-store" });
      setInvoice(loaded);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar la factura."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="apex-workspace-shell space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!invoice) {
    return (
      <div className="apex-workspace-shell space-y-4">
        <Alert tone="error" title="No se pudo abrir la factura">{error || "La factura no existe o no pertenece a la empresa activa."}</Alert>
        <Link className="inline-flex h-9 items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-content-strong transition-colors hover:border-apex hover:bg-surface-muted" href="/dashboard/contabilidad/facturas-recibidas?tab=monitor"><ArrowLeft size={16} /> Volver al monitor</Link>
      </div>
    );
  }

  const xmlCount = invoice.documents.filter((doc) => doc.document_type === "xml").length;
  const pdfCount = invoice.documents.filter((doc) => doc.document_type === "pdf").length;
  const ivaPercents = invoice.extraction_metadata?.iva_percents || [];

  async function request(method: "POST" | "PATCH", path: string, body: unknown, successText: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<Invoice>(`/api/v1/accounting/received-invoices/${id}${path}`, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      if (result && Array.isArray(result.documents)) setInvoice(result);
      else await load();
      setMessage(successText);
    } catch (caught) {
      setError(describeError(caught, "No fue posible completar la acción."));
    } finally {
      setBusy(false);
    }
  }

  const run = (path: string, body?: unknown, successText?: string) =>
    request("POST", path, body, successText || "Acción aplicada correctamente.");

  const saveAssignment = (mode: "assign" | "update", payload: Record<string, unknown>, successText: string) =>
    request(mode === "assign" ? "POST" : "PATCH", mode === "assign" ? "/assign" : "", payload, successText);

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link className="inline-flex h-9 items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-content-strong transition-colors hover:border-apex hover:bg-surface-muted" href="/dashboard/contabilidad/facturas-recibidas?tab=monitor"><ArrowLeft size={16} /> Volver al monitor</Link>
            <h1 className="mt-2 text-2xl font-semibold text-content-strong md:text-3xl">{invoice.full_number}</h1>
            <p className="mt-1 text-sm text-content-body">{invoice.issuer_name || "(proveedor sin nombre)"} · NIT {invoice.issuer_tax_id || "--"} · {invoice.document_type_label || invoice.document_type}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-1">
              <Badge tone={PROCESSING_TONE[invoice.processing_status] || "neutral"}>{invoice.processing_label}</Badge>
              {invoice.assignment_status === "returned" ? <Badge tone="warning">{invoice.assignment_label}</Badge> : null}
              <Badge tone={invoice.leader_assignment_status === "approved" ? "success" : invoice.leader_assignment_status === "returned" ? "warning" : "neutral"}>{invoice.leader_label}</Badge>
              {invoice.needs_review ? <Badge tone="warning">Revisión pendiente</Badge> : null}
            </div>
            <Button onClick={() => setHistoryOpen(true)} size="compact" type="button" variant="secondary">
              <History size={16} /> Ver historial{invoice.change_logs.length ? ` (${invoice.change_logs.length})` : ""}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
          <span>Recepción {formatDateTime(invoice.reception_date)}</span>
          <span>· Fuente {invoice.extraction_source === "pdf" ? "PDF" : "XML"}</span>
          <span>· Email {invoice.email?.subject || invoice.email?.zip_file_name || "--"}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-4">
          <div className="rounded-card border border-line bg-surface-muted px-3 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-content-muted">Total factura</dt>
            <dd className="mt-0.5 font-mono text-base font-semibold text-apex">{money(invoice.total, invoice.currency || "COP")}</dd>
          </div>
          <div className="rounded-card border border-line bg-surface-muted px-3 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-content-muted">Centro de costo</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-content-strong" title={costCenterLabel(invoice.cost_centers, invoice.cost_center)}>{costCenterLabel(invoice.cost_centers, invoice.cost_center)}</dd>
          </div>
          <div className="rounded-card border border-line bg-surface-muted px-3 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-content-muted">Responsable</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-content-strong">{invoice.responsible_name || "Sin responsable"}</dd>
          </div>
          <div className="rounded-card border border-line bg-surface-muted px-3 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-content-muted">Documentos</dt>
            <dd className="mt-0.5 text-sm font-medium text-content-strong">{invoice.documents.length ? `${xmlCount} XML · ${pdfCount} PDF` : "Sin adjuntos"}</dd>
          </div>
        </dl>
      </header>

      {error ? <Alert tone="error" title="Acción no aplicada">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      {invoice.needs_review ? <ReviewBanner invoice={invoice} busy={busy} onResolve={run} /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-4">
          <section className="apex-section-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-content-strong">Datos fiscales</h2>
              <span className="text-xs text-content-muted">Solo lectura · extraído del documento</span>
            </div>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Número completo" value={invoice.full_number} mono />
              <Field label="Fecha de emisión" value={formatDateTime(invoice.issue_date)} />
              <Field label="Emisor" value={invoice.issuer_name || ""} />
              <Field label="NIT emisor" value={invoice.issuer_tax_id || ""} mono />
              <Field label="Receptor" value={invoice.receiver_name || ""} />
              <Field label="NIT receptor" value={invoice.receiver_tax_id || ""} mono />
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-content-muted">CUFE / CUDE</dt>
                <dd className="mt-0.5 flex flex-wrap items-start gap-2">
                  <span className="min-w-0 break-all font-mono text-xs text-content-strong">{invoice.cufe || "--"}</span>
                  {invoice.extraction_metadata?.cufe_validation ? (
                    <Badge tone={invoice.extraction_metadata.cufe_validation.valid ? "success" : "error"}>
                      {invoice.extraction_metadata.cufe_validation.valid ? "Estructura válida" : "CUFE inválido"}
                    </Badge>
                  ) : null}
                </dd>
              </div>
              <Field label="Estado DIAN" value={invoice.dian_validation_status || "Sin validación reportada"} />
              <Field label="Origen de extracción" value={invoice.extraction_source === "pdf" ? "PDF con texto" : "XML DIAN"} />
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
              {[
                ["Subtotal", invoice.subtotal], ["IVA", invoice.iva], ["ICA", invoice.ica],
                ["INC", invoice.inc], ["Impuestos", invoice.tax_total], ["Total", invoice.total]
              ].map(([label, value]) => {
                const isTotal = label === "Total";
                const isIva = label === "IVA";
                return (
                  <div className={`flex items-center justify-between gap-2 px-3 py-2 ${isTotal ? "bg-apex/10" : "bg-surface-muted"}`} key={String(label)}>
                    <span className="text-[11px] uppercase tracking-wide text-content-muted">{isIva && ivaPercents.length ? `IVA (${ivaPercents.map((percent) => `${percent}%`).join(" · ")})` : label}</span>
                    <span className={`font-mono text-sm ${isTotal ? "font-semibold text-apex" : "text-content-strong"}`}>{money(value as number | string, invoice.currency || "COP")}</span>
                  </div>
                );
              })}
            </div>
            {invoice.validation_issues?.length ? (
              <div className="mt-3 space-y-1">
                {invoice.validation_issues.map((issue) => (
                  <p className={`rounded-md border px-2 py-1 text-xs ${issue.severity === "critical" ? "border-error/30 bg-error/10 text-content-strong" : "border-warning/30 bg-warning/10 text-content-body"}`} key={`${issue.code}-${issue.field || ""}`}>
                    <span className="font-semibold">{issue.code}</span> · {issue.message}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <AssignmentPanel invoice={invoice} busy={busy} onAction={run} onSave={saveAssignment} />

          <section className="apex-section-card p-4">
            <h2 className="font-semibold text-content-strong">Acciones del documento</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                disabled={busy || invoice.processing_status === "processed" || !invoice.source_archive}
                onClick={() => void run("/reprocess", undefined, "ZIP reprocesado; revisa el monitor de facturas.")}
                title={invoice.source_archive ? "Reprocesar el ZIP original" : "La factura no conserva el ZIP original"}
                type="button"
                variant="secondary"
              ><RefreshCw size={16} /> Reprocesar ZIP</Button>
              <Button disabled={busy || invoice.processing_status === "processed"} onClick={() => {
                if (!window.confirm("¿Aprobar esta factura como líder? La acción queda auditada y no admite cambios posteriores.")) return;
                void run("/approve", { observations: invoice.observations || undefined }, "Factura aprobada por el líder.");
              }} type="button" variant="primary"><CheckCircle2 size={16} /> Aprobar</Button>
            </div>
            {!invoice.source_archive ? (
              <p className="mt-2 text-xs text-content-muted">Esta factura no conserva el ZIP original, así que no admite reproceso. Si necesitas los documentos, vuelve a procesarla desde el monitor.</p>
            ) : null}
            {invoice.errors.length ? (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Errores sin resolver</p>
                {invoice.errors.map((item) => <p className="text-xs text-error" key={item.id}>{item.code}: {item.message}</p>)}
              </div>
            ) : null}
          </section>
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <DocumentViewer invoice={invoice} />
        </div>
      </div>

      {historyOpen ? <HistoryModal invoice={invoice} onClose={() => setHistoryOpen(false)} /> : null}
    </div>
  );
}

function ReviewBanner({ invoice, busy, onResolve }: { invoice: Invoice; busy: boolean; onResolve: (path: string, body: unknown, successText: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"accept" | "reject">("accept");
  const [note, setNote] = useState("");
  return (
    <Alert tone="warning" title="La factura requiere revisión antes de asignarse">
      <ul className="list-disc pl-5 text-sm">
        {(invoice.review_reasons?.length ? invoice.review_reasons : invoice.validation_issues?.map((issue) => issue.code) || []).slice(0, 6).map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => { setDecision("accept"); setOpen(true); }} size="compact" type="button" variant="secondary">Aceptar revisión</Button>
        <Button onClick={() => { setDecision("reject"); setOpen(true); }} size="compact" type="button" variant="ghost">Rechazar</Button>
      </div>
      {open ? (
        <ModalFrame footer={<div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)} type="button" variant="ghost">Cancelar</Button><Button disabled={busy || (decision === "reject" && note.trim().length < 3)} loading={busy} onClick={async () => { await onResolve("/review", { decision, observations: note.trim() || undefined }, decision === "accept" ? "Revisión aceptada." : "Revisión rechazada."); setOpen(false); }} type="button">{decision === "accept" ? "Aceptar" : "Rechazar"}</Button></div>} onClose={() => setOpen(false)} title={decision === "accept" ? "Aceptar revisión" : "Rechazar revisión"}>
          <p className="text-sm text-content-body">{decision === "accept" ? "Confirma que validaste los datos y documentos. La factura quedará lista para asignación." : "Indica por qué la factura no puede procesarse en este momento."}</p>
          <Textarea className="mt-3" label="Observaciones" onChange={(event) => setNote(event.target.value)} value={note} />
        </ModalFrame>
      ) : null}
    </Alert>
  );
}

function AssignmentPanel({ invoice, busy, onAction, onSave }: {
  invoice: Invoice;
  busy: boolean;
  onAction: (path: string, body?: unknown, successText?: string) => Promise<void>;
  onSave: (mode: "assign" | "update", payload: Record<string, unknown>, successText: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Responsible[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<{ id: number | null; name: string }>({ id: invoice.responsible_user_id, name: invoice.responsible_name || "" });
  const [costCenter, setCostCenter] = useState(invoice.cost_center || "");
  const [observations, setObservations] = useState(invoice.observations || "");
  const [saving, setSaving] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("");
  const locked = invoice.processing_status === "processed";

  // Listado de usuarios habilitados de la empresa; al escribir se consulta el
  // buscador del servidor, y con el campo vacio se muestra el listado completo.
  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    setUsersLoading(true);
    const handle = setTimeout(async () => {
      try {
        const rows = await api<Responsible[]>(`/api/v1/accounting/received-invoices/responsibles${term ? `?q=${encodeURIComponent(term)}` : ""}`, { cache: "no-store" });
        if (cancelled) return;
        setResults(rows);
        setUsersError("");
      } catch (caught) {
        if (cancelled) return;
        setResults([]);
        setUsersError(describeError(caught, "No fue posible cargar los usuarios habilitados."));
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    }, term ? 220 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  function choose(user: Responsible) {
    setSelected({ id: user.id, name: user.name });
    setQuery("");
    setListOpen(false);
    setActiveIndex(0);
  }

  const currentKey = invoice.responsible_user_id ? `id:${invoice.responsible_user_id}` : invoice.responsible_name ? `name:${invoice.responsible_name}` : "";
  const selectedKey = selected.id ? `id:${selected.id}` : selected.name ? `name:${selected.name}` : "";
  const assigned = invoice.assignment_status === "assigned";
  const responsibleChanged = selectedKey !== currentKey;
  const willAssign = Boolean(selected.name) && (!assigned || responsibleChanged);
  const primaryLabel = willAssign ? (assigned ? "Reasignar" : "Asignar") : "Guardar cambios";
  const blocked = locked || busy || saving || (responsibleChanged && !selected.name);

  async function save() {
    if (blocked) return;
    setSaving(true);
    try {
      if (willAssign) {
        await onSave("assign", {
          responsible_user_id: selected.id,
          responsible_name: selected.name,
          cost_center: costCenter || null,
          observations: observations.trim() || undefined
        }, `Factura asignada a ${selected.name}.`);
      } else {
        await onSave("update", {
          cost_center: costCenter || null,
          observations: observations.trim() || null
        }, "Datos de la asignación actualizados.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="apex-section-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-content-strong">Asignación</h2>
        <Badge tone={invoice.assignment_status === "assigned" ? "info" : invoice.assignment_status === "returned" ? "warning" : "neutral"}>{invoice.assignment_label}</Badge>
      </div>
      <p className="mt-1 text-xs text-content-muted">Responsable actual: {invoice.responsible_name || "sin asignar"} · {invoice.leader_label}</p>
      <div className="mt-3 grid gap-3">
        <div className="grid gap-1.5 text-sm font-medium text-content-strong">
          <label htmlFor="invoice-responsible">Responsable</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
            <input
              aria-autocomplete="list"
              aria-controls="invoice-responsible-options"
              aria-expanded={listOpen}
              aria-label="Buscar responsable"
              className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-content-strong outline-none focus:border-apex"
              disabled={locked}
              id="invoice-responsible"
              onBlur={() => { window.setTimeout(() => setListOpen(false), 120); }}
              onChange={(event) => { setQuery(event.target.value); setListOpen(true); setActiveIndex(0); }}
              onFocus={() => setListOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); setListOpen(true); setActiveIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1))); }
                else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
                else if (event.key === "Enter" && listOpen && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); }
                else if (event.key === "Escape") { setListOpen(false); }
              }}
              placeholder="Buscar entre los usuarios habilitados"
              role="combobox"
              value={query}
            />
            {listOpen ? (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-surface shadow-card" id="invoice-responsible-options" role="listbox">
                <p className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-muted">Usuarios habilitados</p>
                {results.length ? results.map((user, index) => {
                  const isCurrent = user.id === selected.id;
                  return (
                    <button
                      aria-selected={isCurrent}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-surface-muted" : "hover:bg-surface-muted"}`}
                      key={user.id}
                      onClick={() => choose(user)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-content-strong">{user.name}</span>
                        <span className="block truncate text-xs text-content-muted">{user.email}</span>
                      </span>
                      <span className="shrink-0 text-xs text-content-muted">{isCurrent ? "Actual" : user.role_name || ""}</span>
                    </button>
                  );
                }) : (
                  <p className="px-3 py-2 text-xs font-normal text-content-muted">
                    {usersLoading ? "Cargando usuarios habilitados..." : usersError || "Ningún usuario habilitado coincide con la búsqueda."}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {selected.name ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-apex/30 bg-apex/10 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-content-strong"><UserCheck size={16} className="text-apex" /> {selected.name}</span>
            <button aria-label="Quitar responsable" className="text-content-muted hover:text-error" onClick={() => setSelected({ id: null, name: "" })} type="button"><X size={16} /></button>
          </div>
        ) : null}
        <CostCenterSelect centers={invoice.cost_centers} disabled={locked} onChange={setCostCenter} value={costCenter} />
        <Textarea disabled={locked} label="Observaciones" onChange={(event) => setObservations(event.target.value)} value={observations} />
        {invoice.cost_centers.length ? null : (
          <p className="text-xs text-content-muted">
            Registra sociedades, sucursales y centros en{" "}
            <Link className="font-semibold text-apex hover:underline" href="/dashboard/contabilidad/estructura">Contabilidad · Estructura</Link>{" "}
            para poder asignarlos a las facturas.
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button disabled={blocked} loading={busy || saving} onClick={() => void save()} type="button">
            {willAssign ? <Send size={16} /> : <Save size={16} />} {primaryLabel}
          </Button>
          <Button disabled={locked || busy || invoice.assignment_status !== "assigned"} onClick={() => {
            if (!window.confirm("¿Devolver esta asignación al líder?")) return;
            setReturnOpen(true);
          }} type="button" variant="secondary"><RotateCcw size={16} /> Devolver</Button>
        </div>
        {responsibleChanged && !selected.name ? <p className="text-xs text-content-muted">Selecciona un responsable para continuar.</p> : null}
      </div>
      {returnOpen ? (
        <ModalFrame footer={<div className="flex justify-end gap-2"><Button onClick={() => setReturnOpen(false)} type="button" variant="ghost">Cancelar</Button><Button disabled={busy || reason.trim().length < 3} loading={busy} onClick={async () => {
          await onAction("/return", { reason: reason.trim() }, "Asignación devuelta con motivo.");
          setReturnOpen(false);
          setReason("");
        }} type="button" variant="danger">Devolver</Button></div>} onClose={() => setReturnOpen(false)} title="Devolver asignación">
          <p className="text-sm text-content-body">Indica el motivo de la devolución. El responsable y el líder verán el registro en el historial.</p>
          <Textarea className="mt-3" label="Motivo" onChange={(event) => setReason(event.target.value)} value={reason} />
        </ModalFrame>
      ) : null}
    </section>
  );
}

function HistoryModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <ModalFrame maxWidth="md:max-w-3xl" onClose={onClose} title={`Historial y auditoría · ${invoice.full_number}`}>
      <div className="space-y-4">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-content-muted">Movimientos</h3>
          {invoice.change_logs.length ? (
            <ol className="mt-2 space-y-3">
              {invoice.change_logs.map((log) => (
                <li className="border-l-2 border-line pl-3" key={log.id}>
                  <p className="text-sm font-medium text-content-strong">{ACTION_LABEL[log.action] || log.action}</p>
                  <p className="text-xs text-content-muted">{formatDateTime(log.created_at)}{log.user_id ? ` · Usuario #${log.user_id}` : ""}</p>
                  {log.note ? <p className="mt-1 text-xs text-content-body">{log.note}</p> : null}
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-sm text-content-muted">Sin movimientos registrados.</p>}
        </section>
        <section className="border-t border-line pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-content-muted">Asignaciones registradas</h3>
          {invoice.assignments.length ? (
            <ul className="mt-2 space-y-1 text-xs text-content-body">
              {invoice.assignments.map((item) => <li key={item.id}>{formatDateTime(item.created_at)} · {item.responsible_name} · {item.segment || "sin segmento"} · {item.assignment_status}</li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-content-muted">Sin asignaciones registradas.</p>}
        </section>
      </div>
    </ModalFrame>
  );
}

function DocumentViewer({ invoice }: { invoice: Invoice }) {
  const preferred = useMemo(
    () => invoice.documents.find((doc) => doc.document_type === "pdf") || invoice.documents[0] || null,
    [invoice.documents]
  );
  const [activeId, setActiveId] = useState<number | null>(preferred?.id ?? null);
  const active = invoice.documents.find((doc) => doc.id === activeId) || preferred;
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const urlRef = useRef("");
  const loadSeq = useRef(0);

  const pages = Math.max(1, Number(invoice.extraction_metadata?.pdf_comparison?.page_count || 1));

  useEffect(() => {
    if (!invoice.documents.some((doc) => doc.id === activeId)) setActiveId(preferred?.id ?? null);
  }, [invoice.documents, activeId, preferred]);

  const load = useCallback(async (docId: number | null) => {
    const doc = invoice.documents.find((item) => item.id === docId) || preferred;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    setText("");
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
    setUrl("");
    if (!doc) {
      setLoading(false);
      return;
    }
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const response = await fetch(`${API_BASE_URL}/api/v1/accounting/received-invoices/${invoice.id}/documents/${doc.id}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error("No fue posible descargar el documento para el visor.");
      if (doc.document_type === "xml") {
        const body = await response.text();
        if (seq !== loadSeq.current) return;
        setText(body);
      } else {
        const blobUrl = URL.createObjectURL(await response.blob());
        if (seq !== loadSeq.current) { URL.revokeObjectURL(blobUrl); return; }
        urlRef.current = blobUrl;
        setUrl(blobUrl);
      }
    } catch (caught) {
      if (seq === loadSeq.current) setError(describeError(caught, "No fue posible abrir el documento."));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [invoice.id, invoice.documents, preferred]);

  useEffect(() => { void load(activeId); }, [activeId, load]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function download() {
    if (!active) return;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const response = await fetch(`${API_BASE_URL}/api/v1/accounting/received-invoices/${invoice.id}/documents/${active.id}/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error("No fue posible descargar el documento.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = active.file_name;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
    } catch (caught) {
      setError(describeError(caught, "No fue posible descargar el documento."));
    }
  }

  const iframeSrc = useMemo(() => {
    if (!url) return "";
    const zoomParam = zoom === "fit" ? "page-width" : zoom;
    return `${url.includes("#") ? url.split("#")[0] : url}#page=${page}&zoom=${zoomParam}&toolbar=0&navpanes=0`;
  }, [url, page, zoom]);

  const isPdf = active?.document_type === "pdf";
  const hasDocuments = invoice.documents.length > 0;

  return (
    <section aria-label="Visor de documentos" className="apex-section-card overflow-hidden">
      <div className="border-b border-line p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-content-strong">Visor de documentos</h2>
              {hasDocuments ? <Badge tone="neutral">{invoice.documents.length} {invoice.documents.length === 1 ? "archivo" : "archivos"}</Badge> : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-content-muted">
              {active ? `${active.file_name} · ${formatBytes(active.size_bytes)}` : "Sin documentos adjuntos a la factura."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button disabled={!active} onClick={() => void download()} size="compact" type="button" variant="ghost"><Download size={16} /> Descargar</Button>
            <Button disabled={!url} onClick={() => window.open(url, "_blank", "noopener,noreferrer")} size="compact" type="button" variant="ghost"><ExternalLink size={16} /> Abrir</Button>
          </div>
        </div>

        {hasDocuments ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div aria-label="Documentos de la factura" className="flex flex-wrap gap-1" role="tablist">
              {invoice.documents.map((doc) => {
                const selected = doc.id === active?.id;
                return (
                  <button
                    aria-selected={selected}
                    className={`inline-flex items-center gap-1 rounded-control border px-2.5 py-1 text-xs font-semibold ${selected ? "border-apex bg-apex/10 text-apex" : "border-line bg-surface text-content-body hover:bg-surface-muted"}`}
                    key={doc.id}
                    onClick={() => { setActiveId(doc.id); setPage(1); setZoom("fit"); }}
                    role="tab"
                    type="button"
                  >
                    {doc.document_type === "xml" ? <FileCode2 size={14} /> : <FileText size={14} />} {doc.document_type.toUpperCase()} · {formatBytes(doc.size_bytes)}
                  </button>
                );
              })}
            </div>
            {isPdf && url ? (
              <div className="flex flex-wrap items-center gap-1">
                {pages > 1 ? (
                  <>
                    <Button aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} size="compact" type="button" variant="ghost">Anterior</Button>
                    <span className="min-w-14 text-center text-xs text-content-muted">{page} / {pages}</span>
                    <Button aria-label="Página siguiente" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} size="compact" type="button" variant="ghost">Siguiente</Button>
                    <span aria-hidden className="mx-1 h-5 w-px bg-line" />
                  </>
                ) : null}
                <Button aria-label="Alejar" disabled={zoom !== "fit" && zoom <= 50} onClick={() => setZoom((value) => value === "fit" ? 75 : Math.max(50, value - 25))} size="compact" type="button" variant="ghost"><Minus size={16} /></Button>
                <span className="min-w-12 text-center text-xs text-content-muted">{zoom === "fit" ? "Ajuste" : `${zoom}%`}</span>
                <Button aria-label="Acercar" disabled={zoom !== "fit" && zoom >= 200} onClick={() => setZoom((value) => value === "fit" ? 125 : Math.min(200, value + 25))} size="compact" type="button" variant="ghost"><Plus size={16} /></Button>
                <Button disabled={zoom === "fit"} onClick={() => setZoom("fit")} size="compact" type="button" variant="ghost">Ajustar</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <div className="p-3"><Alert tone="error">{error}</Alert></div> : null}
      {loading ? <div className="p-4"><Skeleton className="h-[60vh] w-full" /></div> : null}

      {!loading && !hasDocuments ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-muted text-content-muted"><FileText size={22} /></div>
          <div>
            <h3 className="text-sm font-semibold text-content-strong">Sin documentos almacenados</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-content-muted">Esta factura se registró sin XML ni PDF. Vuelve a procesar sus archivos desde el monitor para conservar los documentos.</p>
          </div>
          <Link className="inline-flex items-center gap-1 text-sm font-semibold text-apex hover:underline" href="/dashboard/contabilidad/facturas-recibidas">Ir al monitor <ExternalLink size={14} /></Link>
        </div>
      ) : null}

      {!loading && hasDocuments && text ? (
        <pre className="max-h-[72vh] min-h-[460px] overflow-auto bg-surface-muted p-4 font-mono text-xs leading-relaxed text-content-body">{text}</pre>
      ) : null}
      {!loading && hasDocuments && url ? (
        <iframe
          className="block h-[72vh] min-h-[460px] w-full border-0 bg-surface-muted"
          key={iframeSrc}
          src={iframeSrc}
          title={isPdf ? `PDF de la factura ${invoice.full_number}` : `Documento ${active?.file_name || ""}`}
        />
      ) : null}
      {!loading && hasDocuments && !text && !url && !error ? <div className="p-6 text-center text-sm text-content-muted">Selecciona un documento para visualizarlo.</div> : null}
    </section>
  );
}
