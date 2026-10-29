"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileText, Inbox,
  Monitor, RefreshCw, Search, Settings2, Upload, X
} from "lucide-react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/apiBaseUrl";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Tone = "neutral" | "success" | "warning" | "error" | "info";
type ExtractionMetadata = {
  iva_percents?: number[];
  cufe_validation?: { valid: boolean; format?: string | null; length?: number; scheme_name?: string | null } | null;
  pdf_comparison?: { page_count?: number } | null;
  line_count?: number;
  missing_fields?: string[];
  archive?: string | null;
} | null;
type InvoiceRow = {
  id: number;
  full_number: string;
  document_type: string;
  document_type_label: string | null;
  cufe: string | null;
  issuer_name: string | null;
  issuer_tax_id: string | null;
  receiver_name: string | null;
  receiver_tax_id: string | null;
  issue_date: string | null;
  reception_date: string;
  subtotal: number | string;
  iva: number | string;
  tax_total: number | string;
  total: number | string;
  currency: string | null;
  processing_status: string;
  assignment_status: string;
  processing_label: string;
  assignment_label: string;
  invoice_status: string;
  responsible_user_id: number | null;
  responsible_name: string | null;
  group_name: string | null;
  cost_center: string | null;
  segment: string | null;
  needs_review: boolean;
  pdf_available: boolean;
  xml_available: boolean;
  extraction_metadata: ExtractionMetadata;
};
type Summary = { received: number; pending_assignment: number; assigned: number; processed: number; review: number; errors: number; unresolved_errors: number; total_amount: number | string };
type Meta = { page: number; page_size: number; total: number; pages: number };
type Responsible = { id: number; name: string; email: string; role_name?: string | null };
type EmailRow = { id: number; source: string; subject: string | null; from_address: string | null; received_at: string | null; zip_file_name: string | null; status: string; invoice_count: number; processed_attachment_count: number; attachment_count: number; error_message: string | null; created_at: string };
type ErrorRow = { id: number; code: string; message: string; resolved: boolean; created_at: string; invoice_id: number | null; email_id: number | null };
type UploadResult = { duplicate: boolean; status: string; summary?: { created: number; duplicates: number; failed: number }; invoices?: Array<{ id: number; full_number: string; total: number | string }>; errors?: Array<{ code: string; message: string }>; rejected?: Array<{ file_name: string; reason: string }> };
type MailConfig = { provider: string; host: string | null; port: number; secure: boolean; username: string | null; password_env_key: string; folder: string; polling_seconds: number; enabled: boolean; configured: boolean; password_configured: boolean; last_synced_at: string | null; last_error: string | null; env_fallback: boolean };

const PROCESSING_TONE: Record<string, Tone> = {
  received: "neutral", processing: "info", pending_assignment: "warning",
  assigned: "info", processed: "success", review: "warning", error: "error"
};
const ASSIGNMENT_TONE: Record<string, Tone> = { unassigned: "neutral", assigned: "info", returned: "warning" };
const PROCESSING_OPTIONS = [
  { value: "", label: "Todos los estados" },
  { value: "pending_assignment", label: "Pendiente de asignación" },
  { value: "review", label: "En revisión" },
  { value: "assigned", label: "Asignada" },
  { value: "processed", label: "Procesada" },
  { value: "error", label: "Con error" }
];
const ASSIGNMENT_OPTIONS = [
  { value: "", label: "Asignación: todas" },
  { value: "unassigned", label: "Sin asignar" },
  { value: "assigned", label: "Asignada" },
  { value: "returned", label: "Devuelta" }
];
const PAGE_SIZE = 20;

function money(value: number | string | null | undefined, currency = "COP") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: currency || "COP", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return amount.toLocaleString("es-CO");
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${formatDate(value)} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function describeError(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function Kpi({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string | number; hint?: string; tone: Tone }) {
  const toneClass = tone === "error" ? "text-error" : tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-apex";
  return (
    <article className="apex-section-card flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-content-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-content-strong">{value}</p>
        {hint ? <p className="mt-1 text-xs text-content-muted">{hint}</p> : null}
      </div>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface-muted ${toneClass}`}>{icon}</span>
    </article>
  );
}

export default function FacturasRecibidasPage() {
  const [filters, setFilters] = useState({ q: "", from: "", to: "", issue_from: "", issue_to: "", nit: "", number: "", supplier: "", processing_status: "", assignment_status: "", responsible_user_id: "" });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, page_size: PAGE_SIZE, total: 0, pages: 1 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [responsibles, setResponsibles] = useState<Responsible[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [tab, setTab] = useState<"monitor" | "emails" | "errors">("monitor");
  const [pdfInvoice, setPdfInvoice] = useState<InvoiceRow | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    Object.entries(applied).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [applied, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(applied).forEach(([key, value]) => { if (value) params.set(key, value); });
      const kpiParams = new URLSearchParams();
      if (applied.from) kpiParams.set("from", applied.from);
      if (applied.to) kpiParams.set("to", applied.to);
      const [list, kpis] = await Promise.all([
        api<{ data: InvoiceRow[]; meta: Meta }>(`/api/v1/accounting/received-invoices?${query}`, { cache: "no-store" }),
        api<Summary>(`/api/v1/accounting/received-invoices/summary?${kpiParams.toString()}`, { cache: "no-store" })
      ]);
      setRows(list.data);
      setMeta(list.meta);
      setSummary(kpis);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar el monitor de facturas recibidas."));
    } finally {
      setLoading(false);
    }
  }, [query, applied]);

  useEffect(() => {
    void api<Responsible[]>("/api/v1/accounting/received-invoices/responsibles", { cache: "no-store" }).then(setResponsibles).catch(() => setResponsibles([]));
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "monitor" || requested === "emails" || requested === "errors") setTab(requested);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function applyFilters(event?: FormEvent) {
    event?.preventDefault();
    setPage(1);
    setApplied(filters);
  }
  function clearFilters() {
    const empty = { q: "", from: "", to: "", issue_from: "", issue_to: "", nit: "", number: "", supplier: "", processing_status: "", assignment_status: "", responsible_user_id: "" };
    setFilters(empty);
    setApplied(empty);
    setPage(1);
  }
  const hasFilters = Object.values(applied).some(Boolean);

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Link className="mb-2 inline-flex h-9 items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-content-strong transition-colors hover:border-apex hover:bg-surface-muted" href="/dashboard/contabilidad"><ArrowLeft size={16} /> Volver a Contabilidad</Link>
          <p className="text-sm font-medium text-apex">M-07 · Finanzas</p>
          <h1 className="text-2xl font-semibold text-content-strong md:text-3xl">Facturas electrónicas recibidas</h1>
          <p className="mt-1 text-sm text-content-body">Recepción desde el buzón, extracción XML/PDF, revisión y asignación con trazabilidad.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setUploadOpen(true)} type="button"><Upload size={16} /> Cargar ZIP</Button>
          <Button onClick={() => setMailOpen(true)} type="button" variant="secondary"><Settings2 size={16} /> Buzón IMAP</Button>
          <Button onClick={() => void load()} type="button" variant="ghost"><RefreshCw size={16} /> Actualizar</Button>
        </div>
      </header>

      {error ? <Alert tone="error" title="No se pudo completar la consulta">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <section aria-label="Indicadores de facturas recibidas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<Inbox size={20} />} label="Recibidas" value={summary?.received ?? "--"} hint={summary ? `Valor ${money(summary.total_amount)}` : undefined} tone="info" />
        <Kpi icon={<FileText size={20} />} label="Pendientes de asignación" value={summary?.pending_assignment ?? "--"} tone="warning" />
        <Kpi icon={<CheckCircle2 size={20} />} label="Procesadas" value={summary?.processed ?? "--"} hint={summary?.assigned ? `${summary.assigned} asignadas` : undefined} tone="success" />
        <Kpi icon={<Search size={20} />} label="En revisión" value={summary?.review ?? "--"} tone="warning" />
        <Kpi icon={<AlertTriangle size={20} />} label="Errores sin resolver" value={summary?.unresolved_errors ?? "--"} tone="error" />
      </section>

      <nav aria-label="Secciones del módulo" className="flex flex-wrap gap-2">
        {([["monitor", "Monitor"], ["emails", "Correos procesados"], ["errors", "Errores"]] as const).map(([key, label]) => (
          <button className={`rounded-md border px-3 py-2 text-sm ${tab === key ? "border-apex bg-apex/10 text-apex" : "border-line bg-surface text-content-body"}`} key={key} onClick={() => setTab(key)} type="button">{label}</button>
        ))}
      </nav>

      {tab === "monitor" ? (
        <form className="apex-section-card space-y-3 p-3" onSubmit={applyFilters}>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
              <input aria-label="Buscar factura" className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-content-strong outline-none focus:border-apex" onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Buscar por número, proveedor, NIT o CUFE" value={filters.q} />
            </div>
            <Select aria-label="Estado de procesamiento" onChange={(event) => setFilters({ ...filters, processing_status: event.target.value })} value={filters.processing_status}>
              {PROCESSING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Select aria-label="Estado de asignación" onChange={(event) => setFilters({ ...filters, assignment_status: event.target.value })} value={filters.assignment_status}>
              {ASSIGNMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="Recepción desde" onChange={(event) => setFilters({ ...filters, from: event.target.value })} type="date" value={filters.from} />
            <Input label="Recepción hasta" onChange={(event) => setFilters({ ...filters, to: event.target.value })} type="date" value={filters.to} />
            <Input label="Emisión desde" onChange={(event) => setFilters({ ...filters, issue_from: event.target.value })} type="date" value={filters.issue_from} />
            <Input label="Emisión hasta" onChange={(event) => setFilters({ ...filters, issue_to: event.target.value })} type="date" value={filters.issue_to} />
            <Input label="NIT proveedor" onChange={(event) => setFilters({ ...filters, nit: event.target.value })} value={filters.nit} />
            <Input label="Número de factura" onChange={(event) => setFilters({ ...filters, number: event.target.value })} value={filters.number} />
            <Input label="Proveedor" onChange={(event) => setFilters({ ...filters, supplier: event.target.value })} value={filters.supplier} />
            <Select label="Responsable" onChange={(event) => setFilters({ ...filters, responsible_user_id: event.target.value })} value={filters.responsible_user_id}>
              <option value="">Todos los responsables</option>
              {responsibles.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-content-muted">{hasFilters ? "Filtros activos en la vista." : "Sin filtros: se muestran las facturas más recientes."}</p>
            <div className="flex gap-2">
              {hasFilters ? <Button onClick={clearFilters} type="button" variant="ghost"><X size={16} /> Limpiar</Button> : null}
              <Button type="submit" variant="secondary"><Search size={16} /> Aplicar filtros</Button>
            </div>
          </div>
        </form>
      ) : null}

      {tab === "monitor" ? (
        <MonitorPanel
          loading={loading}
          meta={meta}
          onPage={setPage}
          onPreviewPdf={setPdfInvoice}
          page={page}
          rows={rows}
        />
      ) : null}

      {tab === "emails" ? <EmailsPanel /> : null}
      {tab === "errors" ? <ErrorsPanel onResolved={() => { setMessage("Error marcado como resuelto."); void load(); }} /> : null}

      {uploadOpen ? (
        <UploadModal onClose={() => setUploadOpen(false)} onDone={(result) => {
          setUploadOpen(false);
          setMessage(result.duplicate ? "El ZIP ya había sido procesado; no se duplicó ninguna factura." : `ZIP procesado: ${result.summary?.created || 0} creada(s), ${result.summary?.duplicates || 0} duplicada(s), ${result.summary?.failed || 0} con error.`);
          setTab("monitor");
          void load();
        }} />
      ) : null}

      {mailOpen ? <MailConfigModal onClose={() => setMailOpen(false)} onSynced={(text) => { setMailOpen(false); setMessage(text); void load(); }} /> : null}

      {pdfInvoice ? <InvoicePdfModal invoice={pdfInvoice} onClose={() => setPdfInvoice(null)} /> : null}
    </div>
  );
}

type InvoiceDocument = { id: number; document_type: string; file_name: string; size_bytes: number; is_primary: boolean };
type InvoiceDetail = { documents: InvoiceDocument[] };

function cufeStatus(row: InvoiceRow) {
  if (!row.cufe) return { label: "No informado", tone: "warning" as Tone };
  const validation = row.extraction_metadata?.cufe_validation;
  if (!validation) return { label: "Sin validar", tone: "neutral" as Tone };
  return validation.valid
    ? { label: validation.format ? `Válido · ${validation.format}` : "Válido", tone: "success" as Tone }
    : { label: "Inválido", tone: "error" as Tone };
}

function ivaPercents(row: InvoiceRow) {
  const percents = row.extraction_metadata?.iva_percents;
  return Array.isArray(percents) ? percents.filter((value) => Number.isFinite(Number(value))) : [];
}

function MonitorPanel({ rows, loading, meta, page, onPage, onPreviewPdf }: {
  rows: InvoiceRow[];
  loading: boolean;
  meta: Meta;
  page: number;
  onPage: (page: number) => void;
  onPreviewPdf: (invoice: InvoiceRow) => void;
}) {
  const stats = useMemo(() => ({
    cufe: rows.filter((row) => row.extraction_metadata?.cufe_validation?.valid).length,
    withIva: rows.filter((row) => Number(row.iva) > 0).length,
    withoutCostCenter: rows.filter((row) => !row.cost_center).length,
    pdf: rows.filter((row) => row.pdf_available).length
  }), [rows]);

  return (
    <section aria-label="Monitor de facturas extraídas" className="apex-section-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line p-3">
        <div>
          <div className="flex items-center gap-2"><Monitor className="text-apex" size={18} /><h2 className="font-semibold text-content-strong">Monitor de extracción</h2></div>
          <p className="mt-1 text-xs text-content-muted">Datos obtenidos del XML/PDF, validación del CUFE, IVA y centro de costo de la vista actual.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-content-muted">
          <span><strong className="text-content-strong">{rows.length}</strong> en la vista</span>
          <span><strong className="text-success">{stats.cufe}</strong> con CUFE validado</span>
          <span><strong className="text-content-strong">{stats.withIva}</strong> con IVA</span>
          <span><strong className="text-warning">{stats.withoutCostCenter}</strong> sin centro de costo</span>
          <span><strong className="text-content-strong">{stats.pdf}</strong> con PDF</span>
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-content-muted">
              <th className="px-2 py-2">Factura</th>
              <th className="px-2 py-2">Emisor</th>
              <th className="px-2 py-2">Receptor</th>
              <th className="px-2 py-2">Fechas</th>
              <th className="px-2 py-2 text-right">Total · IVA</th>
              <th className="px-2 py-2">CUFE</th>
              <th className="px-2 py-2">Centro de costo</th>
              <th className="px-2 py-2">Estado</th>
              <th className="sticky right-0 z-10 border-l border-line bg-surface-muted px-2 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 4 }).map((_, index) => (
              <tr className="border-b border-line" key={`monitor-skeleton-${index}`}>
                {Array.from({ length: 9 }).map((__, cell) => <td className="px-2 py-3" key={cell}><Skeleton className="h-4 w-full" /></td>)}
              </tr>
            )) : rows.map((row) => {
              const cufe = cufeStatus(row);
              const percents = ivaPercents(row);
              return (
                <tr className="border-b border-line last:border-0 hover:bg-surface-muted/60" key={row.id}>
                  <td className="px-2 py-2">
                    <Link aria-label={`Abrir factura ${row.full_number}`} className="whitespace-nowrap font-mono font-semibold text-apex hover:underline" href={`/dashboard/contabilidad/facturas-recibidas/${row.id}`}>{row.full_number}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] uppercase text-content-muted">
                      <span>{row.document_type_label || row.document_type}</span>
                      {row.xml_available ? <span>· XML</span> : null}
                      {row.pdf_available ? <span>· PDF</span> : null}
                    </div>
                  </td>
                  <td className="max-w-[160px] px-2 py-2">
                    <p className="truncate text-content-strong" title={row.issuer_name || ""}>{row.issuer_name || "(sin nombre)"}</p>
                    <p className="font-mono text-xs text-content-muted">{row.issuer_tax_id || "--"}</p>
                  </td>
                  <td className="max-w-[140px] px-2 py-2">
                    <p className="truncate text-content-body" title={row.receiver_name || ""}>{row.receiver_name || "(sin nombre)"}</p>
                    <p className="font-mono text-xs text-content-muted">{row.receiver_tax_id || "--"}</p>
                  </td>
                  <td className="px-2 py-2">
                    <p className="whitespace-nowrap text-xs"><span className="text-content-muted">Emisión</span> {formatDate(row.issue_date)}</p>
                    <p className="mt-0.5 whitespace-nowrap text-xs"><span className="text-content-muted">Recepción</span> {formatDate(row.reception_date)}</p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <p className="font-mono font-semibold">{money(row.total, row.currency || "COP")}</p>
                    <p className="text-xs text-content-muted">{Number(row.iva) > 0 ? `IVA${percents.length ? ` ${percents.map((value) => `${value}%`).join(" · ")}` : ""} ${money(row.iva, row.currency || "COP")}` : "Sin IVA"}</p>
                  </td>
                  <td className="max-w-[120px] px-2 py-2">
                    <p className="truncate font-mono text-xs text-content-body" title={row.cufe || ""}>{row.cufe || "--"}</p>
                    <Badge tone={cufe.tone}>{cufe.label}</Badge>
                  </td>
                  <td className="px-2 py-2">
                    <p className={`whitespace-nowrap font-mono text-xs font-semibold ${row.cost_center ? "text-content-strong" : "text-content-muted"}`}>{row.cost_center || "Sin centro de costo"}</p>
                    <p className="text-xs text-content-muted">{row.responsible_name || "Sin responsable"}{row.segment ? ` · ${row.segment}` : ""}</p>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={PROCESSING_TONE[row.processing_status] || "neutral"}>{row.processing_label}</Badge>
                      <Badge tone={ASSIGNMENT_TONE[row.assignment_status] || "neutral"}>{row.assignment_label}</Badge>
                    </div>
                  </td>
                  <td className="sticky right-0 border-l border-line bg-surface px-2 py-2">
                    <div className="flex justify-end">
                      <Button aria-label={`Ver PDF de ${row.full_number}`} disabled={!row.pdf_available} onClick={() => onPreviewPdf(row)} size="compact" type="button" variant="ghost"><Eye size={16} /> PDF</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-line md:hidden">
        {loading ? Array.from({ length: 3 }).map((_, index) => <div className="p-4" key={index}><Skeleton className="h-24 w-full" /></div>) : rows.map((row) => {
          const cufe = cufeStatus(row);
          const percents = ivaPercents(row);
          return (
            <article className="p-4" key={row.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link className="font-mono text-sm font-semibold text-apex" href={`/dashboard/contabilidad/facturas-recibidas/${row.id}`}>{row.full_number}</Link>
                  <p className="truncate text-sm text-content-strong">{row.issuer_name || "(sin nombre)"}</p>
                  <p className="text-xs text-content-muted">NIT {row.issuer_tax_id || "--"} · {formatDate(row.issue_date)}</p>
                </div>
                <p className="shrink-0 font-mono text-sm font-semibold">{money(row.total, row.currency || "COP")}</p>
              </div>
              <p className="mt-1 text-xs text-content-muted">Recepción {formatDate(row.reception_date)} · Centro de costo {row.cost_center || "sin asignar"}{row.responsible_name ? ` · ${row.responsible_name}` : ""}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Badge tone={PROCESSING_TONE[row.processing_status] || "neutral"}>{row.processing_label}</Badge>
                <Badge tone={ASSIGNMENT_TONE[row.assignment_status] || "neutral"}>{row.assignment_label}</Badge>
                <Badge tone={cufe.tone}>{cufe.label}</Badge>
                <Badge>{Number(row.iva) > 0 ? `IVA ${percents.length ? `${percents.map((value) => `${value}%`).join(" · ")} · ` : ""}${money(row.iva, row.currency || "COP")}` : "Sin IVA"}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <Button aria-label={`Ver PDF de ${row.full_number}`} disabled={!row.pdf_available} onClick={() => onPreviewPdf(row)} size="compact" type="button" variant="secondary"><Eye size={16} /> PDF</Button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !rows.length ? (
        <EmptyState
          description="Carga un ZIP, sincroniza el buzón o ejecuta la carpeta monitoreada para ver los datos extraídos."
          icon={<Monitor size={22} />}
          title="Aún no hay facturas para monitorear"
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-sm">
        <span className="text-content-muted">{meta.total} factura(s) · página {meta.page} de {meta.pages}</span>
        <div className="flex gap-2">
          <Button disabled={page <= 1 || loading} onClick={() => onPage(Math.max(1, page - 1))} size="compact" type="button" variant="secondary">Anterior</Button>
          <Button disabled={page >= meta.pages || loading} onClick={() => onPage(page + 1)} size="compact" type="button" variant="secondary">Siguiente</Button>
        </div>
      </div>
    </section>
  );
}

function InvoicePdfModal({ invoice, onClose }: { invoice: InvoiceRow; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [document, setDocument] = useState<InvoiceDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setLoading(true);
    setError("");
    api<InvoiceDetail>(`/api/v1/accounting/received-invoices/${invoice.id}`, { cache: "no-store" })
      .then(async (detail) => {
        const pdf = detail.documents.find((item) => item.document_type === "pdf" && item.is_primary)
          || detail.documents.find((item) => item.document_type === "pdf");
        if (!pdf) throw new Error("Esta factura no tiene PDF adjunto.");
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const response = await fetch(`${API_BASE_URL}/api/v1/accounting/received-invoices/${invoice.id}/documents/${pdf.id}/file`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!response.ok) throw new Error("No fue posible abrir el PDF de la factura.");
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) { URL.revokeObjectURL(objectUrl); return; }
        setDocument(pdf);
        setUrl(objectUrl);
      })
      .catch((caught) => { if (!cancelled) setError(describeError(caught, "No fue posible abrir el PDF.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [invoice.id]);

  function download() {
    if (!url || !document) return;
    const anchor = documentAnchor(url, document.file_name);
    anchor.click();
  }

  return (
    <ModalFrame
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={!url} onClick={download} type="button" variant="secondary">Descargar PDF</Button>
          <Button onClick={onClose} type="button" variant="ghost">Cerrar</Button>
        </div>
      )}
      maxWidth="md:max-w-5xl"
      onClose={onClose}
      title={`PDF · ${invoice.full_number}`}
    >
      {loading ? <Skeleton className="h-[70vh] w-full" /> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {url ? <iframe className="h-[70vh] w-full rounded-md border border-line bg-surface" src={url} title={`PDF de la factura ${invoice.full_number}`} /> : null}
    </ModalFrame>
  );
}

function documentAnchor(url: string, fileName: string) {
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "factura.pdf";
  return anchor;
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (result: UploadResult) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await api<UploadResult>("/api/v1/accounting/received-invoices/upload", { method: "POST", body: form, cache: "no-store" });
      setResult(response);
      if (!response.errors?.length && !response.rejected?.length) onDone(response);
    } catch (caught) {
      setError(describeError(caught, "No fue posible procesar el ZIP."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalFrame footer={<div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="ghost">Cerrar</Button><Button disabled={!file || busy} loading={busy} onClick={() => void submit()} type="button"><Upload size={16} /> Procesar ZIP</Button></div>} onClose={onClose} title="Cargar ZIP de facturas">
      <div className="space-y-3 text-sm">
        <p className="text-content-body">El ZIP puede contener varios pares XML/PDF. Se valida la firma, el tamaño, las rutas internas y el tipo real de cada archivo antes de procesarlo.</p>
        <label className="grid gap-1.5 font-medium text-content-strong">
          Archivo ZIP
          <input accept=".zip,application/zip" className="block w-full rounded-md border border-line bg-surface p-2 text-sm" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setResult(null); setError(""); }} type="file" />
        </label>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {result ? (
          <Alert tone={result.errors?.length || result.rejected?.length ? "warning" : "success"} title={result.duplicate ? "ZIP ya procesado" : "ZIP procesado"}>
            <p>Creadas: {result.summary?.created || 0} · Duplicadas: {result.summary?.duplicates || 0} · Con error: {result.summary?.failed || 0}</p>
            {result.invoices?.length ? <ul className="mt-2 list-disc pl-5">{result.invoices.map((invoice) => <li key={invoice.id}><Link className="text-apex underline" href={`/dashboard/contabilidad/facturas-recibidas/${invoice.id}`}>{invoice.full_number} · {money(invoice.total)}</Link></li>)}</ul> : null}
            {result.errors?.length ? <ul className="mt-2 list-disc pl-5">{result.errors.map((item) => <li key={item.code}>{item.message}</li>)}</ul> : null}
            {result.rejected?.length ? <ul className="mt-2 list-disc pl-5">{result.rejected.map((item) => <li key={item.file_name}>{item.file_name}: {item.reason}</li>)}</ul> : null}
          </Alert>
        ) : null}
      </div>
    </ModalFrame>
  );
}

function MailConfigModal({ onClose, onSynced }: { onClose: () => void; onSynced: (message: string) => void }) {
  const [config, setConfig] = useState<MailConfig | null>(null);
  const [form, setForm] = useState({ host: "", port: "993", secure: true, username: "", password_env_key: "INVOICE_IMAP_PASSWORD", folder: "INBOX", polling_seconds: "30", enabled: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<MailConfig>("/api/v1/accounting/received-invoices/mail-config", { cache: "no-store" }).then((loaded) => {
      setConfig(loaded);
      setForm((current) => ({
        ...current,
        host: loaded.host || "",
        port: String(loaded.port || 993),
        secure: loaded.secure !== false,
        username: loaded.username || "",
        password_env_key: loaded.password_env_key || "INVOICE_IMAP_PASSWORD",
        folder: loaded.folder || "INBOX",
        polling_seconds: String(loaded.polling_seconds || 30),
        enabled: Boolean(loaded.enabled)
      }));
    }).catch((caught) => setError(describeError(caught, "No fue posible consultar la configuración del buzón.")));
  }, []);

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await api<MailConfig>("/api/v1/accounting/received-invoices/mail-config", {
        method: "PUT",
        body: JSON.stringify({
          provider: "imap", host: form.host, port: Number(form.port), secure: form.secure,
          username: form.username, password_env_key: form.password_env_key, folder: form.folder,
          polling_seconds: Number(form.polling_seconds), enabled: form.enabled
        })
      });
      setConfig(saved);
      setMessage("Configuración guardada. La contraseña solo se lee de la variable de entorno indicada.");
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar la configuración."));
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setError(""); setMessage("");
    try {
      const status = await api<{ ok: boolean; folder: string; messages: number }>("/api/v1/accounting/received-invoices/mail-config/test", { method: "POST" });
      setMessage(`Conexión correcta con ${form.host} · carpeta ${status.folder} · ${status.messages} mensaje(s).`);
    } catch (caught) {
      setError(describeError(caught, "No fue posible conectar con el buzón."));
    } finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ messages: number; pending: number; created: number; duplicates: number; ignored: number; failed: number }>("/api/v1/accounting/received-invoices/mail-config/sync", { method: "POST", body: JSON.stringify({ limit: 20 }) });
      onSynced(`Sincronización: ${result.messages || 0} correo(s) revisado(s), ${result.created || 0} factura(s) nueva(s), ${result.duplicates || 0} duplicada(s), ${result.ignored || 0} sin factura, ${result.failed || 0} error(es).`);
    } catch (caught) {
      setError(describeError(caught, "No fue posible sincronizar el buzón."));
    } finally { setBusy(false); }
  }

  return (
    <ModalFrame footer={<div className="flex flex-wrap justify-end gap-2"><Button onClick={onClose} type="button" variant="ghost">Cerrar</Button><Button disabled={busy} onClick={() => void test()} type="button" variant="secondary">Probar conexión</Button><Button disabled={busy} onClick={() => void sync()} type="button" variant="secondary"><RefreshCw size={16} /> Sincronizar ahora</Button><Button disabled={busy} loading={busy} onClick={() => void save()} type="button">Guardar</Button></div>} onClose={onClose} title="Buzón IMAP de facturas">
      <div className="space-y-3 text-sm">
        <p className="text-content-body">La lectura se hace por IMAP. La contraseña nunca se guarda en la base ni viaja al navegador: solo se registra el nombre de la variable de entorno que la contiene.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Servidor IMAP" onChange={(event) => setForm({ ...form, host: event.target.value })} placeholder="imap.empresa.com" value={form.host} />
          <Input label="Puerto" onChange={(event) => setForm({ ...form, port: event.target.value })} type="number" value={form.port} />
          <Input label="Usuario" onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="facturas@empresa.com" value={form.username} />
          <Input hint="Ej.: INVOICE_IMAP_PASSWORD" label="Variable de entorno de la contraseña" onChange={(event) => setForm({ ...form, password_env_key: event.target.value })} value={form.password_env_key} />
          <Input label="Carpeta" onChange={(event) => setForm({ ...form, folder: event.target.value })} value={form.folder} />
          <Input hint="El job revisa el buzón cada 30 s; el intervalo se redondea al siguiente ciclo." label="Intervalo (segundos)" max={3600} min={10} onChange={(event) => setForm({ ...form, polling_seconds: event.target.value })} type="number" value={form.polling_seconds} />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2"><input checked={form.secure} onChange={(event) => setForm({ ...form, secure: event.target.checked })} type="checkbox" /> Conexión segura TLS</label>
          <label className="flex items-center gap-2"><input checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} type="checkbox" /> Consulta automática activa</label>
        </div>
        <p className={`rounded-md border p-2 text-xs ${config?.password_configured ? "border-success/30 bg-success/10 text-content-strong" : "border-warning/30 bg-warning/10 text-content-strong"}`}>
          {config?.password_configured ? "Contraseña disponible en el entorno del servidor." : `Falta definir ${form.password_env_key} en el entorno del servidor.`}
          {config?.last_synced_at ? ` Última sincronización: ${formatDateTime(config.last_synced_at)}.` : ""}
          {config?.last_error ? ` Último error: ${config.last_error}` : ""}
        </p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
      </div>
    </ModalFrame>
  );
}

function EmailsPanel() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, page_size: 10, total: 0, pages: 1 });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: "1", page_size: "10" });
    if (status) params.set("status", status);
    api<{ data: EmailRow[]; meta: Meta }>(`/api/v1/accounting/received-invoices/emails?${params.toString()}`, { cache: "no-store" })
      .then((result) => { if (!cancelled) { setRows(result.data); setMeta(result.meta); setError(""); } })
      .catch((caught) => { if (!cancelled) setError(describeError(caught, "No fue posible cargar los correos procesados.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status]);

  return (
    <section className="apex-section-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
        <div>
          <h2 className="font-semibold text-content-strong">Correos procesados</h2>
          <p className="text-xs text-content-muted">Cada asunto o adjunto se registra una sola vez para evitar reprocesos.</p>
        </div>
        <Select aria-label="Estado del correo" onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="">Todos</option>
          <option value="processed">Procesado</option>
          <option value="processed_with_errors">Procesado con errores</option>
          <option value="error">Con error</option>
          <option value="duplicate">Duplicado</option>
        </Select>
      </div>
      {error ? <div className="p-3"><Alert tone="error">{error}</Alert></div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead><tr className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-content-muted"><th className="px-3 py-2">Asunto / ZIP</th><th className="px-3 py-2">Origen</th><th className="px-3 py-2">Recibido</th><th className="px-3 py-2 text-right">Adjuntos</th><th className="px-3 py-2 text-right">Facturas</th><th className="px-3 py-2">Estado</th></tr></thead>
          <tbody>
            {loading ? <tr><td className="px-3 py-4" colSpan={6}><Skeleton className="h-6 w-full" /></td></tr> : rows.map((row) => (
              <tr className="border-b border-line last:border-0" key={row.id}>
                <td className="max-w-[320px] px-3 py-2"><p className="truncate font-medium text-content-strong">{row.subject || row.zip_file_name || "(sin asunto)"}</p><p className="truncate text-xs text-content-muted">{row.from_address || row.zip_file_name || "--"}</p>{row.error_message ? <p className="text-xs text-error">{row.error_message}</p> : null}</td>
                <td className="px-3 py-2 text-xs uppercase">{row.source}</td>
                <td className="px-3 py-2">{formatDateTime(row.received_at || row.created_at)}</td>
                <td className="px-3 py-2 text-right">{row.processed_attachment_count}/{row.attachment_count}</td>
                <td className="px-3 py-2 text-right">{row.invoice_count}</td>
                <td className="px-3 py-2"><Badge tone={row.status === "processed" ? "success" : row.status === "error" ? "error" : row.status === "duplicate" ? "neutral" : "warning"}>{row.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length ? <EmptyState description="Los correos procesados aparecerán aquí al sincronizar el buzón o cargar un ZIP." title="Sin correos registrados" /> : null}
      <p className="border-t border-line px-3 py-2 text-xs text-content-muted">{meta.total} correo(s) registrados.</p>
    </section>
  );
}

function ErrorsPanel({ onResolved }: { onResolved: () => void }) {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api<{ data: ErrorRow[]; meta: Meta }>("/api/v1/accounting/received-invoices/errors?resolved=false&page_size=50", { cache: "no-store" })
      .then((result) => { setRows(result.data); setError(""); })
      .catch((caught) => setError(describeError(caught, "No fue posible cargar los errores.")))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resolve(id: number) {
    setBusyId(id);
    try {
      await api(`/api/v1/accounting/received-invoices/errors/${id}/resolve`, { method: "POST", body: JSON.stringify({}) });
      setRows((current) => current.filter((row) => row.id !== id));
      onResolved();
    } catch (caught) {
      setError(describeError(caught, "No fue posible resolver el error."));
    } finally { setBusyId(null); }
  }

  return (
    <section className="apex-section-card overflow-hidden">
      <div className="border-b border-line p-3">
        <h2 className="font-semibold text-content-strong">Errores de procesamiento</h2>
        <p className="text-xs text-content-muted">ZIP dañados, protegidos, vacíos o documentos con datos insuficientes. Reprocesa la factura cuando corrijas el origen.</p>
      </div>
      {error ? <div className="p-3"><Alert tone="error">{error}</Alert></div> : null}
      <div className="divide-y divide-line">
        {loading ? <div className="p-4"><Skeleton className="h-16 w-full" /></div> : rows.map((row) => (
          <article className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between" key={row.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="error">{row.code}</Badge><span className="text-xs text-content-muted">{formatDateTime(row.created_at)}</span></div>
              <p className="mt-1 text-sm text-content-body">{row.message}</p>
              {row.invoice_id ? <Link className="text-xs font-semibold text-apex hover:underline" href={`/dashboard/contabilidad/facturas-recibidas/${row.invoice_id}`}>Abrir factura #{row.invoice_id}</Link> : null}
            </div>
            <Button disabled={busyId === row.id} onClick={() => void resolve(row.id)} size="compact" type="button" variant="secondary"><CheckCircle2 size={16} /> Marcar resuelto</Button>
          </article>
        ))}
      </div>
      {!loading && !rows.length ? <EmptyState description="No hay errores pendientes: todos los documentos se procesaron correctamente." icon={<CheckCircle2 size={22} />} title="Sin errores pendientes" /> : null}
    </section>
  );
}
