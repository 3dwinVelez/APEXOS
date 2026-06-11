"use client";

import { downloadExcelWorkbook, downloadTablePdf, type ReportColumn } from "@/lib/reportExports";
import { api } from "@/lib/api";
import { ArrowLeft, Download, Eye, FileSpreadsheet, PackageSearch, Search, Star, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type InspectionItem = { part_id?: string; name?: string; quantity?: number; unit?: string; status?: string; comment?: string; action?: string; supplier?: string; supplier_name?: string };
type SurveyAnswer = { question_id?: string; question?: string; rating?: number };
type Reference = { id: string; code?: string; name?: string; category?: string; brand?: string; model?: string; estimated_minutes?: number };
type Order = {
  id: string; number: string; reference_id?: string; technician_employee_id?: string; service_type?: string; status?: string;
  customer_name?: string; customer_address?: string; customer_phone?: string; invoice_number?: string; scheduled_date?: string;
  started_at?: string; closed_at?: string; duration_minutes?: number; no_execution_reason?: string;
  metadata?: { inspection?: { items?: InspectionItem[] }; satisfaction_survey?: { answers?: SurveyAnswer[]; average?: number; completed_at?: string }; [key: string]: unknown };
  reference?: Reference;
  technician?: { id?: string; code?: string; user?: { name?: string; email?: string } };
  incidents?: Incident[];
  photos?: Evidence[];
};
type Incident = { id: string; order_id: string; type?: string; description?: string; action?: string; metadata?: Record<string, unknown> };
type Evidence = { id: string; order_id: string; evidence_type?: string; storage_path?: string; metadata?: Record<string, unknown> };
type ServiceRow = Record<string, string | number> & {
  id: string; fecha: string; orden: string; tecnico: string; cliente: string; estado: string; servicio: string; referencia: string;
  duracion_min: number; tiempo_estimado_min: number; desviacion_min: number; novedades: number; evidencias: number; hallazgos: string;
};
type SatisfactionRow = Record<string, string | number> & {
  id: string; fecha: string; orden: string; tecnico: string; cliente: string; estado: string; promedio: number; calidad: number; atencion: number; resultado: number; respuestas: number;
};
type PieceRow = Record<string, string | number> & {
  id: string; fecha: string; orden: string; tecnico: string; cliente: string; referencia: string; pieza: string; cantidad: number; unidad: string;
  estado_pieza: string; accion_requerida: string; observacion: string; proveedor: string; novedad: string;
};
type ReportTab = "servicios" | "satisfaccion" | "piezas";

const statusLabels: Record<string, string> = { pendiente: "Pendiente", en_curso: "En curso", inspeccion: "Inspeccion", ejecucion: "Ejecucion", cerrada: "Cerrada", no_ejecutada: "No ejecutada", cancelada: "Cancelada" };
const serviceColumns: Array<ReportColumn<ServiceRow>> = [
  { key: "fecha", label: "Fecha", width: 70 }, { key: "orden", label: "Orden", width: 75 }, { key: "tecnico", label: "Tecnico", width: 110 },
  { key: "cliente", label: "Cliente", width: 110 }, { key: "estado", label: "Estado", width: 75 }, { key: "servicio", label: "Servicio", width: 80 },
  { key: "referencia", label: "Referencia", width: 145 }, { key: "duracion_min", label: "Duracion min", width: 75 }, { key: "novedades", label: "Novedades", width: 65 }, { key: "hallazgos", label: "Hallazgos", width: 180 }
];
const satisfactionColumns: Array<ReportColumn<SatisfactionRow>> = [
  { key: "fecha", label: "Fecha", width: 75 }, { key: "orden", label: "Orden", width: 80 }, { key: "tecnico", label: "Tecnico", width: 130 },
  { key: "cliente", label: "Cliente", width: 130 }, { key: "estado", label: "Estado", width: 80 }, { key: "promedio", label: "Promedio", width: 70 },
  { key: "calidad", label: "Calidad", width: 70 }, { key: "atencion", label: "Atencion", width: 70 }, { key: "resultado", label: "Resultado", width: 70 }, { key: "respuestas", label: "Respuestas", width: 70 }
];
const pieceColumns: Array<ReportColumn<PieceRow>> = [
  { key: "fecha", label: "Fecha", width: 70 }, { key: "orden", label: "Orden", width: 75 }, { key: "tecnico", label: "Tecnico", width: 105 },
  { key: "referencia", label: "Referencia", width: 120 }, { key: "pieza", label: "Pieza requerida", width: 125 }, { key: "cantidad", label: "Cantidad", width: 60 },
  { key: "estado_pieza", label: "Estado", width: 70 }, { key: "accion_requerida", label: "Accion", width: 95 }, { key: "proveedor", label: "Proveedor", width: 105 }, { key: "observacion", label: "Observacion", width: 165 }
];

function today() { return new Date().toISOString().slice(0, 10); }
function thirtyDaysAgo() { const date = new Date(); date.setDate(date.getDate() - 30); return date.toISOString().slice(0, 10); }
function technicianName(order: Order) { return order.technician?.user?.name || order.technician?.user?.email || order.technician?.code || "Sin tecnico"; }
function rating(answers: SurveyAnswer[], id: string) { return Number(answers.find((answer) => answer.question_id === id)?.rating || 0); }
function stars(value: number) { return value ? `${value.toFixed(1)} / 5` : "Sin evaluar"; }

export default function ServiceReportsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ReportTab>("servicios");
  const [selected, setSelected] = useState<ServiceRow | SatisfactionRow | PieceRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await api<{ data: Order[] }>("/api/v1/services/orders?limit=500");
      setOrders((response.data || []).filter((order) => {
        const date = order.scheduled_date?.slice(0, 10) || "";
        return (!from || date >= from) && (!to || date <= to);
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar la reportería de servicios.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (localStorage.getItem("role_name")?.toLowerCase() === "tecnico") {
      router.replace("/dashboard/servicios");
      return;
    }
    load();
  }, [load, router]);

  const reportData = useMemo(() => {
    const services: ServiceRow[] = [];
    const satisfaction: SatisfactionRow[] = [];
    const pieces: PieceRow[] = [];
    orders.forEach((order) => {
      const reference = order.reference;
      const technician = technicianName(order);
      const orderIncidents = order.incidents || [];
      const orderEvidence = order.photos || [];
      const started = order.started_at ? new Date(order.started_at).getTime() : 0;
      const closed = order.closed_at ? new Date(order.closed_at).getTime() : 0;
      const duration = Number(order.duration_minutes || (started && closed ? Math.max(0, Math.round((closed - started) / 60000)) : 0));
      const expected = Number(reference?.estimated_minutes || 0);
      const referenceLabel = [reference?.code, reference?.name].filter(Boolean).join(" - ") || "Sin referencia";
      const finding = order.no_execution_reason || orderIncidents.map((incident) => [incident.description, incident.action].filter(Boolean).join(" / ")).filter(Boolean).join(" | ") || "Sin hallazgos";
      services.push({
        id: order.id, fecha: order.scheduled_date?.slice(0, 10) || "", orden: order.number, tecnico: technician, cliente: order.customer_name || "--",
        estado: statusLabels[order.status || ""] || order.status || "Pendiente", servicio: order.service_type || "servicio", referencia: referenceLabel,
        duracion_min: duration, tiempo_estimado_min: expected, desviacion_min: expected ? duration - expected : 0, novedades: orderIncidents.length, evidencias: orderEvidence.length, hallazgos: finding
      });
      const answers = order.metadata?.satisfaction_survey?.answers || [];
      const average = Number(order.metadata?.satisfaction_survey?.average || (answers.length ? answers.reduce((sum, answer) => sum + Number(answer.rating || 0), 0) / answers.length : 0));
      satisfaction.push({
        id: order.id, fecha: order.scheduled_date?.slice(0, 10) || "", orden: order.number, tecnico: technician, cliente: order.customer_name || "--",
        estado: statusLabels[order.status || ""] || order.status || "Pendiente", promedio: Number(average.toFixed(2)), calidad: rating(answers, "service_quality"),
        atencion: rating(answers, "technician_attention"), resultado: rating(answers, "final_result"), respuestas: answers.length
      });
      const incidentText = orderIncidents.map((incident) => incident.description).filter(Boolean).join(" | ");
      (order.metadata?.inspection?.items || []).filter((item) => ["averiada", "faltante"].includes(String(item.status || "").toLowerCase())).forEach((item, index) => {
        pieces.push({
          id: `${order.id}-${item.part_id || index}`, fecha: order.scheduled_date?.slice(0, 10) || "", orden: order.number, tecnico: technician,
          cliente: order.customer_name || "--", referencia: referenceLabel, pieza: item.name || "Pieza sin identificar", cantidad: Number(item.quantity || 1),
          unidad: item.unit || "und", estado_pieza: item.status || "pendiente", accion_requerida: item.action || "Solicitar cambio",
          observacion: item.comment || incidentText || "Sin observacion", proveedor: item.supplier_name || item.supplier || "Por definir", novedad: incidentText || "Inspeccion tecnica"
        });
      });
    });
    return { services, satisfaction, pieces };
  }, [orders]);

  const filteredServices = useMemo(() => filterRows(reportData.services, query, status), [query, reportData.services, status]);
  const allowedOrders = useMemo(() => new Set(filteredServices.map((row) => row.orden)), [filteredServices]);
  const filteredSatisfaction = reportData.satisfaction.filter((row) => allowedOrders.has(row.orden) && searchable(row, query));
  const filteredPieces = reportData.pieces.filter((row) => allowedOrders.has(row.orden) && searchable(row, query));
  const activeRows = tab === "servicios" ? filteredServices : tab === "satisfaccion" ? filteredSatisfaction : filteredPieces;
  const activeColumns = tab === "servicios" ? serviceColumns : tab === "satisfaccion" ? satisfactionColumns : pieceColumns;
  const evaluated = filteredSatisfaction.filter((row) => row.respuestas >= 3);
  const avgSatisfaction = evaluated.length ? evaluated.reduce((sum, row) => sum + row.promedio, 0) / evaluated.length : 0;

  function exportExcel() {
    downloadExcelWorkbook(`apexos-servicios-consolidado-${from}-${to}.xls`, [
      { name: "Servicios", columns: serviceColumns as Array<ReportColumn<Record<string, string | number>>>, rows: filteredServices },
      { name: "Satisfaccion cliente", columns: satisfactionColumns as Array<ReportColumn<Record<string, string | number>>>, rows: filteredSatisfaction },
      { name: "Piezas requeridas", columns: pieceColumns as Array<ReportColumn<Record<string, string | number>>>, rows: filteredPieces }
    ]);
  }
  function exportPdf() {
    const names = { servicios: "Consolidado operativo de servicios", satisfaccion: "Evaluacion del servicio al cliente", piezas: "Novedades y piezas requeridas" };
    downloadTablePdf(`apexos-${tab}-${from}-${to}.pdf`, names[tab], `Periodo ${from} a ${to} | ${activeRows.length} registros`, activeColumns as Array<ReportColumn<Record<string, string | number>>>, activeRows);
  }
  function exportSelected() {
    if (!selected) return;
    const columns = (tab === "servicios" ? serviceColumns : tab === "satisfaccion" ? satisfactionColumns : pieceColumns) as Array<ReportColumn<Record<string, string | number>>>;
    downloadTablePdf(`apexos-${tab}-${selected.orden}.pdf`, `Reporte ${selected.orden}`, `Detalle individual de ${tab}`, columns, [selected]);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex h-10 items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/servicios"><ArrowLeft size={17} /> Servicios</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-apex">Centro administrativo de reportes</p>
          <h1 className="mt-1 text-3xl font-semibold">Servicios, clientes y piezas</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Consolida operación, satisfacción del cliente y requerimientos de piezas para proveedores desde la trazabilidad registrada en cada orden.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold" onClick={exportPdf} type="button"><Download size={16} /> PDF de esta vista</button>
          <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={exportExcel} type="button"><FileSpreadsheet size={16} /> Excel consolidado</button>
        </div>
      </header>

      <section className="grid gap-3 rounded-md border border-line bg-white p-4 lg:grid-cols-[1fr_1fr_1fr_2fr_auto]">
        <Field label="Desde"><input className="h-10 w-full rounded-md border border-line px-3 font-normal" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="Hasta"><input className="h-10 w-full rounded-md border border-line px-3 font-normal" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        <Field label="Estado"><select className="h-10 w-full rounded-md border border-line px-3 font-normal" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Busqueda"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 font-normal" placeholder="Orden, tecnico, cliente, pieza o proveedor" value={query} onChange={(event) => setQuery(event.target.value)} /></div></Field>
        <button className="inline-flex h-10 items-center self-end rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={load} type="button">Actualizar</button>
      </section>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Servicios evaluados" value={`${evaluated.length}/${filteredServices.length}`} />
        <Metric label="Satisfaccion promedio" value={stars(avgSatisfaction)} />
        <Metric label="Ordenes con novedades" value={filteredServices.filter((row) => row.novedades > 0).length} />
        <Metric label="Piezas por solicitar" value={filteredPieces.reduce((sum, row) => sum + row.cantidad, 0)} />
      </section>

      <nav className="grid gap-2 rounded-md border border-line bg-white p-2 sm:grid-cols-3">
        <TabButton active={tab === "servicios"} icon={<Wrench size={17} />} label="Consolidado operativo" count={filteredServices.length} onClick={() => setTab("servicios")} />
        <TabButton active={tab === "satisfaccion"} icon={<Star size={17} />} label="Evaluacion al cliente" count={filteredSatisfaction.length} onClick={() => setTab("satisfaccion")} />
        <TabButton active={tab === "piezas"} icon={<PackageSearch size={17} />} label="Piezas y novedades" count={filteredPieces.length} onClick={() => setTab("piezas")} />
      </nav>

      <ReportTable columns={activeColumns as Array<ReportColumn<Record<string, string | number>>>} loading={loading} rows={activeRows} onSelect={(row) => setSelected(row as ServiceRow | SatisfactionRow | PieceRow)} />

      {selected ? <DetailDrawer row={selected} onClose={() => setSelected(null)} onDownload={exportSelected} /> : null}
    </div>
  );
}

function searchable(row: Record<string, string | number>, query: string) {
  const term = query.trim().toLowerCase();
  return !term || Object.values(row).join(" ").toLowerCase().includes(term);
}
function filterRows(rows: ServiceRow[], query: string, status: string) {
  return rows.filter((row) => (status === "all" || row.estado === statusLabels[status]) && searchable(row, query));
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1 text-sm font-semibold">{label}{children}</label>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-md border border-line bg-white p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>; }
function TabButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return <button className={`flex h-12 items-center justify-between rounded-md px-3 text-sm font-semibold ${active ? "bg-apex text-white" : "hover:bg-paper"}`} onClick={onClick} type="button"><span className="flex items-center gap-2">{icon}{label}</span><span className={`rounded-md px-2 py-1 text-xs ${active ? "bg-white/15" : "bg-paper"}`}>{count}</span></button>;
}
function ReportTable({ columns, rows, loading, onSelect }: { columns: Array<ReportColumn<Record<string, string | number>>>; rows: Array<Record<string, string | number>>; loading: boolean; onSelect: (row: Record<string, string | number>) => void }) {
  return <section className="overflow-hidden rounded-md border border-line bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-paper text-xs uppercase text-neutral-500"><tr>{columns.map((column) => <th className="px-4 py-3" key={String(column.key)}>{column.label}</th>)}<th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-line">{rows.map((row) => <tr className="hover:bg-paper" key={String(row.id)}>{columns.map((column) => <td className="max-w-[260px] px-4 py-3" key={String(column.key)}><span className="line-clamp-2">{row[column.key]}</span></td>)}<td className="px-4 py-3"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 font-semibold" onClick={() => onSelect(row)} type="button"><Eye size={15} /> Ver</button></td></tr>)}{!rows.length ? <tr><td className="px-4 py-10 text-center text-neutral-500" colSpan={columns.length + 1}>{loading ? "Cargando..." : "Sin registros para los filtros seleccionados."}</td></tr> : null}</tbody></table></div></section>;
}
function DetailDrawer({ row, onClose, onDownload }: { row: Record<string, string | number>; onClose: () => void; onDownload: () => void }) {
  return <div className="fixed inset-0 z-50 bg-neutral-950/40"><aside className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-xl"><header className="flex items-start justify-between gap-3 border-b border-line p-4"><div><p className="text-sm font-semibold text-apex">Detalle del reporte</p><h2 className="text-2xl font-semibold">{row.orden}</h2></div><button className="rounded-md border border-line p-2" onClick={onClose} type="button"><X size={17} /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="grid gap-3 sm:grid-cols-2">{Object.entries(row).filter(([key]) => key !== "id").map(([key, value]) => <div className="rounded-md bg-paper p-3" key={key}><p className="text-xs font-semibold uppercase text-neutral-500">{key.replace(/_/g, " ")}</p><p className="mt-1 font-semibold">{value || "--"}</p></div>)}</div></div><footer className="border-t border-line p-4"><button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-apex font-semibold text-white" onClick={onDownload} type="button"><Download size={16} /> Descargar reporte individual PDF</button></footer></aside></div>;
}
