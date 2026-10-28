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
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
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
  extraction_metadata: { pdf_comparison?: { page_count?: number; available?: boolean } | null } | null;
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
  review_accepted: "Revisión aceptada", review_rejected: "Revisión rechazada", reprocessed: "ZIP reprocesado"
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
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-apex" href="/dashboard/contabilidad/facturas-recibidas"><ArrowLeft size={16} /> Volver a la bandeja</Link>
      </div>
    );
  }

  async function run(path: string, body?: unknown, successText?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<Invoice>(`/api/v1/accounting/received-invoices/${id}${path}`, {
        method: "POST",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      if (result && Array.isArray(result.documents)) setInvoice(result);
      else await load();
      setMessage(successText || "Acción aplicada correctamente.");
    } catch (caught) {
      setError(describeError(caught, "No fue posible completar la acción."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link className="inline-flex items-center gap-1 text-sm font-medium text-apex hover:underline" href="/dashboard/contabilidad/facturas-recibidas"><ArrowLeft size={16} /> Facturas recibidas</Link>
            <h1 className="mt-1 text-2xl font-semibold text-content-strong md:text-3xl">{invoice.full_number}</h1>
            <p className="mt-1 text-sm text-content-body">{invoice.issuer_name || "(proveedor sin nombre)"} · NIT {invoice.issuer_tax_id || "--"} · {invoice.document_type_label || invoice.document_type}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge tone={PROCESSING_TONE[invoice.processing_status] || "neutral"}>{invoice.processing_label}</Badge>
            <Badge tone={invoice.assignment_status === "assigned" ? "info" : invoice.assignment_status === "returned" ? "warning" : "neutral"}>{invoice.assignment_label}</Badge>
            <Badge tone={invoice.leader_assignment_status === "approved" ? "success" : invoice.leader_assignment_status === "returned" ? "warning" : "neutral"}>{invoice.leader_label}</Badge>
            {invoice.needs_review ? <Badge tone="warning">Revisión pendiente</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
          <span>Recepción {formatDateTime(invoice.reception_date)}</span>
          <span>· Fuente {invoice.extraction_source === "pdf" ? "PDF" : "XML"}</span>
          <span>· Email {invoice.email?.subject || invoice.email?.zip_file_name || "--"}</span>
        </div>
      </header>

      <ContabilidadNav />

      {error ? <Alert tone="error" title="Acción no aplicada">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      {invoice.needs_review ? <ReviewBanner invoice={invoice} busy={busy} onResolve={run} /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 space-y-4">
          <section className="apex-section-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-content-strong">Datos fiscales</h2>
              <span className="text-xs text-content-muted">Solo lectura · extraído del documento</span>
            </div>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Número completo" value={invoice.full_number} mono />
              <Field label="CUFE / CUDE" value={invoice.cufe || "--"} mono />
              <Field label="Fecha de emisión" value={formatDateTime(invoice.issue_date)} />
              <Field label="Estado DIAN" value={invoice.dian_validation_status || "Sin validación reportada"} />
              <Field label="Emisor" value={invoice.issuer_name || ""} />
              <Field label="NIT emisor" value={invoice.issuer_tax_id || ""} mono />
              <Field label="Receptor" value={invoice.receiver_name || ""} />
              <Field label="NIT receptor" value={invoice.receiver_tax_id || ""} mono />
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-card border border-line bg-surface-muted p-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Subtotal", invoice.subtotal], ["IVA", invoice.iva], ["ICA", invoice.ica],
                ["INC", invoice.inc], ["Impuestos", invoice.tax_total], ["Total", invoice.total]
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-xs uppercase tracking-wide text-content-muted">{label}</p>
                  <p className={`font-mono text-sm ${label === "Total" ? "font-semibold text-apex" : "text-content-strong"}`}>{money(value as number | string, invoice.currency || "COP")}</p>
                </div>
              ))}
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

          <AdministrativePanel invoice={invoice} busy={busy} onSaved={setInvoice} onMessage={setMessage} onError={setError} />

          <AssignmentPanel invoice={invoice} busy={busy} onAction={run} />

          <HistoryPanel invoice={invoice} />
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <DocumentViewer invoice={invoice} />
          <section className="apex-section-card p-4">
            <h2 className="font-semibold text-content-strong">Acciones del documento</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button disabled={busy || invoice.processing_status === "processed"} onClick={() => void run("/reprocess", undefined, "ZIP reprocesado; revisa la bandeja de facturas.")} type="button" variant="secondary"><RefreshCw size={16} /> Reprocesar ZIP</Button>
              <Button disabled={busy || invoice.processing_status === "processed"} onClick={() => {
                if (!window.confirm("¿Aprobar esta factura como líder? La acción queda auditada y no admite cambios posteriores.")) return;
                void run("/approve", { observations: invoice.observations || undefined }, "Factura aprobada por el líder.");
              }} type="button" variant="primary"><CheckCircle2 size={16} /> Aprobar</Button>
            </div>
            {invoice.errors.length ? (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Errores sin resolver</p>
                {invoice.errors.map((item) => <p className="text-xs text-error" key={item.id}>{item.code}: {item.message}</p>)}
              </div>
            ) : null}
          </section>
        </div>
      </div>
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

function AdministrativePanel({ invoice, busy, onSaved, onMessage, onError }: { invoice: Invoice; busy: boolean; onSaved: (invoice: Invoice) => void; onMessage: (message: string) => void; onError: (message: string) => void }) {
  const [form, setForm] = useState({
    group_name: invoice.group_name || "",
    cost_center: invoice.cost_center || "",
    observations: invoice.observations || "",
    notification_emails: (invoice.notification_emails || []).join(", ")
  });
  const [saving, setSaving] = useState(false);
  const locked = invoice.processing_status === "processed";

  async function save() {
    setSaving(true);
    onError("");
    onMessage("");
    try {
      await api(`/api/v1/accounting/received-invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          group_name: form.group_name || null,
          cost_center: form.cost_center || null,
          observations: form.observations || null,
          notification_emails: form.notification_emails.split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      const refreshed = await api<Invoice>(`/api/v1/accounting/received-invoices/${invoice.id}`, { cache: "no-store" });
      onSaved(refreshed);
      onMessage("Datos administrativos guardados con trazabilidad de cambios.");
    } catch (caught) {
      onError(describeError(caught, "No fue posible guardar los datos administrativos."));
    } finally { setSaving(false); }
  }

  return (
    <section className="apex-section-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-content-strong">Datos administrativos</h2>
        <span className="text-xs text-content-muted">Editables con historial</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Input disabled={locked} label="Grupo / área" onChange={(event) => setForm({ ...form, group_name: event.target.value })} value={form.group_name} />
        <Input disabled={locked} label="Centro de costo" onChange={(event) => setForm({ ...form, cost_center: event.target.value })} value={form.cost_center} />
        <Input className="sm:col-span-2" disabled={locked} hint="Separa varios correos con coma." label="Correos de notificación" onChange={(event) => setForm({ ...form, notification_emails: event.target.value })} value={form.notification_emails} />
        <Textarea className="sm:col-span-2" disabled={locked} label="Observaciones" onChange={(event) => setForm({ ...form, observations: event.target.value })} value={form.observations} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-content-muted">Los valores fiscales no se editan: provienen del XML/PDF original.</p>
        <Button disabled={locked || busy} loading={saving} onClick={() => void save()} size="compact" type="button" variant="secondary"><Save size={16} /> Guardar</Button>
      </div>
    </section>
  );
}

function AssignmentPanel({ invoice, busy, onAction }: { invoice: Invoice; busy: boolean; onAction: (path: string, body?: unknown, successText?: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Responsible[]>([]);
  const [selected, setSelected] = useState<{ id: number | null; name: string }>({ id: invoice.responsible_user_id, name: invoice.responsible_name || "" });
  const [segment, setSegment] = useState(invoice.segment || "");
  const [detail, setDetail] = useState(invoice.assignment_detail || "");
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = invoice.processing_status === "processed";

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api<Responsible[]>(`/api/v1/accounting/received-invoices/responsibles?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" })
        .then(setResults).catch(() => setResults([]));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  async function assign() {
    if (!selected.name) return;
    await onAction("/assign", {
      responsible_user_id: selected.id,
      responsible_name: selected.name,
      segment: segment || undefined,
      assignment_detail: detail || undefined
    }, `Factura asignada a ${selected.name}.`);
  }

  return (
    <section className="apex-section-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-content-strong">Asignación</h2>
        <Badge tone={invoice.assignment_status === "assigned" ? "info" : invoice.assignment_status === "returned" ? "warning" : "neutral"}>{invoice.assignment_label}</Badge>
      </div>
      <p className="mt-1 text-xs text-content-muted">Responsable actual: {invoice.responsible_name || "sin asignar"} · {invoice.leader_label}</p>
      <div className="mt-3 grid gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
          <input
            aria-label="Buscar responsable"
            className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-content-strong outline-none focus:border-apex"
            disabled={locked}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar responsable por nombre o correo"
            value={query}
          />
          {results.length ? (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-surface shadow-card">
              {results.map((user) => (
                <button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted" key={user.id} onClick={() => { setSelected({ id: user.id, name: user.name }); setQuery(""); setResults([]); }} type="button">
                  <span className="min-w-0"><span className="block truncate font-medium text-content-strong">{user.name}</span><span className="block truncate text-xs text-content-muted">{user.email}</span></span>
                  <span className="text-xs text-content-muted">{user.role_name || ""}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {selected.name ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-apex/30 bg-apex/10 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-content-strong"><UserCheck size={16} className="text-apex" /> {selected.name}</span>
            <button aria-label="Quitar responsable" className="text-content-muted hover:text-error" onClick={() => setSelected({ id: null, name: "" })} type="button"><X size={16} /></button>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select disabled={locked} label="Segmento" onChange={(event) => setSegment(event.target.value)} value={segment}>
            <option value="">Sin segmento</option>
            {invoice.segments.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Input disabled={locked} label="Detalle de la asignación" onChange={(event) => setDetail(event.target.value)} value={detail} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={locked || busy || !selected.name} loading={busy} onClick={() => void assign()} type="button"><Send size={16} /> Asignar</Button>
        <Button disabled={locked || busy || invoice.assignment_status !== "assigned"} onClick={() => {
          if (!window.confirm("¿Devolver esta asignación al líder?")) return;
          setReturnOpen(true);
        }} type="button" variant="secondary"><RotateCcw size={16} /> Devolver</Button>
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

function HistoryPanel({ invoice }: { invoice: Invoice }) {
  return (
    <section className="apex-section-card p-4">
      <div className="flex items-center gap-2"><History size={18} className="text-apex" /><h2 className="font-semibold text-content-strong">Historial y auditoría</h2></div>
      <ol className="mt-3 space-y-3">
        {invoice.change_logs.map((log) => (
          <li className="border-l-2 border-line pl-3" key={log.id}>
            <p className="text-sm font-medium text-content-strong">{ACTION_LABEL[log.action] || log.action}</p>
            <p className="text-xs text-content-muted">{formatDateTime(log.created_at)}{log.user_id ? ` · Usuario #${log.user_id}` : ""}</p>
            {log.note ? <p className="mt-1 text-xs text-content-body">{log.note}</p> : null}
          </li>
        ))}
      </ol>
      {invoice.assignments.length ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Asignaciones registradas</p>
          <ul className="mt-2 space-y-1 text-xs text-content-body">
            {invoice.assignments.map((item) => <li key={item.id}>{formatDateTime(item.created_at)} · {item.responsible_name} · {item.segment || "sin segmento"} · {item.assignment_status}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function DocumentViewer({ invoice }: { invoice: Invoice }) {
  const [activeId, setActiveId] = useState<number | null>(invoice.documents[0]?.id ?? null);
  const active = invoice.documents.find((doc) => doc.id === activeId) || invoice.documents[0] || null;
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const urlRef = useRef("");
  const loadSeq = useRef(0);

  const pages = Math.max(1, Number(invoice.extraction_metadata?.pdf_comparison?.page_count || 1));

  const load = useCallback(async (docId: number | null) => {
    const doc = invoice.documents.find((item) => item.id === docId) || invoice.documents[0] || null;
    if (!doc) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    setText("");
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
    setUrl("");
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
  }, [invoice.id, invoice.documents]);

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
    const suffix = `#page=${page}&zoom=${zoom}`;
    return url.includes("#") ? `${url.split("#")[0]}${suffix}` : `${url}${suffix}`;
  }, [url, page, zoom]);

  return (
    <section className="apex-section-card overflow-hidden">
      <div className="border-b border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-content-strong">Visor de documentos</h2>
          <div className="flex flex-wrap items-center gap-1">
            <Button aria-label="Alejar" disabled={!active || !url || zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 25))} size="compact" type="button" variant="ghost"><Minus size={16} /></Button>
            <span className="min-w-12 text-center text-xs text-content-muted">{zoom}%</span>
            <Button aria-label="Acercar" disabled={!active || !url || zoom >= 200} onClick={() => setZoom((value) => Math.min(200, value + 25))} size="compact" type="button" variant="ghost"><Plus size={16} /></Button>
            <Button aria-label="Página anterior" disabled={!active || !url || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} size="compact" type="button" variant="ghost">Pág. {page}</Button>
            <Button aria-label="Página siguiente" disabled={!active || !url || page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} size="compact" type="button" variant="ghost">Sig.</Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {invoice.documents.map((doc) => (
            <button className={`inline-flex items-center gap-1 rounded-control border px-2 py-1 text-xs font-semibold ${doc.id === active?.id ? "border-apex bg-apex/10 text-apex" : "border-line bg-surface text-content-body"}`} key={doc.id} onClick={() => { setActiveId(doc.id); setPage(1); setZoom(100); }} type="button">
              {doc.document_type === "xml" ? <FileCode2 size={14} /> : <FileText size={14} />} {doc.document_type.toUpperCase()} · {formatBytes(doc.size_bytes)}
            </button>
          ))}
        </div>
      </div>

      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-content-muted">
          <span className="min-w-0 truncate">{active.file_name}</span>
          <div className="flex gap-1">
            <Button disabled={!url} onClick={() => window.open(url, "_blank", "noopener,noreferrer")} size="compact" type="button" variant="ghost"><ExternalLink size={16} /> Abrir</Button>
            <Button onClick={() => void download()} size="compact" type="button" variant="ghost"><Download size={16} /> Descargar</Button>
          </div>
        </div>
      ) : null}

      {error ? <div className="p-3"><Alert tone="error">{error}</Alert></div> : null}
      {loading ? <div className="p-4"><Skeleton className="h-[60vh] w-full" /></div> : null}
      {!loading && text ? (
        <pre className="max-h-[70vh] overflow-auto bg-surface-muted p-3 text-xs text-content-body">{text}</pre>
      ) : null}
      {!loading && url ? (
        <iframe className="h-[70vh] w-full border-0 bg-surface-muted" key={iframeSrc} src={iframeSrc} title={`Visor ${active?.file_name || "documento"}`} />
      ) : null}
      {!loading && !text && !url && !error ? <div className="p-6 text-center text-sm text-content-muted">Selecciona un documento para visualizarlo.</div> : null}
      {!invoice.documents.length ? <div className="p-6 text-center text-sm text-content-muted">La factura no tiene documentos almacenados.</div> : null}
    </section>
  );
}
