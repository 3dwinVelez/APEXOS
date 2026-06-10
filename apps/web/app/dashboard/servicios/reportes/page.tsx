"use client";

import { supabaseFetch } from "@/lib/supabaseClient";
import { ArrowLeft, Download, Eye, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Reference = { id: string; code?: string; name?: string; category?: string; brand?: string; model?: string; estimated_minutes?: number };
type Order = {
  id: string;
  number: string;
  reference_id?: string;
  technician_employee_id?: string;
  service_type?: string;
  status?: string;
  customer_name?: string;
  customer_address?: string;
  scheduled_date?: string;
  started_at?: string;
  closed_at?: string;
  duration_minutes?: number;
  no_execution_reason?: string;
  metadata?: Record<string, unknown>;
};
type Employee = { id: string; first_name?: string; last_name?: string; metadata?: Record<string, unknown> };
type Incident = { id: string; order_id: string; type?: string; description?: string; action?: string };
type Evidence = { id: string; order_id: string; evidence_type?: string; storage_path?: string; metadata?: Record<string, unknown> };
type Row = {
  id: string;
  number: string;
  date: string;
  technician: string;
  serviceType: string;
  productType: string;
  reference: string;
  customer: string;
  status: string;
  startedAt?: string;
  closedAt?: string;
  duration: number;
  expected: number;
  variance: number;
  findings: string;
  incidents: Incident[];
  evidence: Evidence[];
  scenario: string;
};

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  inspeccion: "Inspeccion",
  ejecucion: "Ejecucion",
  cerrada: "Cerrada",
  no_ejecutada: "No ejecutada",
  cancelada: "Cancelada"
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hour(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 5) : date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function minutesLabel(minutes: number) {
  const safe = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function employeeName(employee?: Employee) {
  const metaName = typeof employee?.metadata?.name === "string" ? employee.metadata.name : "";
  return [employee?.first_name, employee?.last_name].filter(Boolean).join(" ").trim() || metaName || "Sin tecnico";
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvValue(row[key])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ServiceReportsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      setMessage("");
      const [orderRows, referenceRows, employeeRows, incidentRows, evidenceRows] = await Promise.all([
        supabaseFetch<Order[]>(`/rest/v1/service_orders?select=id,number,reference_id,technician_employee_id,service_type,status,customer_name,customer_address,scheduled_date,started_at,closed_at,duration_minutes,no_execution_reason,metadata&scheduled_date=gte.${from}&scheduled_date=lte.${to}&order=scheduled_date.desc&limit=250`),
        supabaseFetch<Reference[]>("/rest/v1/service_references?select=id,code,name,category,estimated_minutes&limit=200"),
        supabaseFetch<Employee[]>("/rest/v1/employees?select=id,first_name,last_name,metadata&limit=250"),
        supabaseFetch<Incident[]>("/rest/v1/service_incidents?select=id,order_id,type,description,action&limit=500"),
        supabaseFetch<Evidence[]>("/rest/v1/service_evidence?select=id,order_id,evidence_type,storage_path,metadata&limit=500")
      ]);
      setOrders(orderRows);
      setReferences(referenceRows);
      setEmployees(employeeRows);
      setIncidents(incidentRows);
      setEvidence(evidenceRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar el reporte de servicios.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [from, to]);

  const rows = useMemo(() => {
    const refs = new Map(references.map((reference) => [String(reference.id), reference]));
    const employeeMap = new Map(employees.map((employee) => [String(employee.id), employee]));
    return orders.map((order) => {
      const reference = refs.get(String(order.reference_id || ""));
      const orderIncidents = incidents.filter((incident) => incident.order_id === order.id);
      const orderEvidence = evidence.filter((item) => item.order_id === order.id);
      const started = order.started_at ? new Date(order.started_at).getTime() : 0;
      const closed = order.closed_at ? new Date(order.closed_at).getTime() : 0;
      const duration = Number(order.duration_minutes || (started && closed ? Math.max(0, Math.round((closed - started) / 60000)) : 0));
      const expected = Number(reference?.estimated_minutes || 0);
      return {
        id: order.id,
        number: order.number,
        date: order.scheduled_date || "",
        technician: employeeName(employeeMap.get(String(order.technician_employee_id || ""))),
        serviceType: order.service_type || "servicio",
        productType: reference?.category || order.service_type || "--",
        reference: [reference?.code, reference?.name].filter(Boolean).join(" - ") || "Sin referencia",
        customer: order.customer_name || "--",
        status: order.status || "pendiente",
        startedAt: order.started_at,
        closedAt: order.closed_at,
        duration,
        expected,
        variance: expected ? duration - expected : 0,
        findings: order.no_execution_reason || orderIncidents.map((incident) => [incident.description, incident.action].filter(Boolean).join(" / ")).filter(Boolean).join(" | ") || "Sin hallazgos",
        incidents: orderIncidents,
        evidence: orderEvidence,
        scenario: String(order.metadata?.scenario || order.metadata?.route_code || "")
      } satisfies Row;
    });
  }, [employees, evidence, incidents, orders, references]);

  const filtered = rows.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return [row.number, row.technician, row.customer, row.reference, row.serviceType, row.productType, row.findings].join(" ").toLowerCase().includes(term);
  });

  const kpis = {
    total: filtered.length,
    closed: filtered.filter((row) => row.status === "cerrada").length,
    notExecuted: filtered.filter((row) => row.status === "no_ejecutada").length,
    avgDuration: filtered.length ? Math.round(filtered.reduce((sum, row) => sum + row.duration, 0) / filtered.length) : 0,
    findings: filtered.filter((row) => row.findings !== "Sin hallazgos").length
  };

  function exportRows() {
    downloadCsv("apexos-reporte-servicios-tecnicos.csv", filtered.map((row) => ({
      fecha: row.date,
      orden: row.number,
      tecnico: row.technician,
      cliente: row.customer,
      estado: statusLabels[row.status] || row.status,
      tipo_servicio: row.serviceType,
      tipo_producto: row.productType,
      referencia: row.reference,
      inicio: hour(row.startedAt),
      cierre: hour(row.closedAt),
      duracion: minutesLabel(row.duration),
      tiempo_estimado: minutesLabel(row.expected),
      desviacion_minutos: row.variance,
      hallazgos: row.findings,
      evidencias: row.evidence.length,
      novedades: row.incidents.length,
      escenario: row.scenario
    })));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex h-10 items-center gap-2 rounded-md text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/servicios"><ArrowLeft size={17} /> Servicios</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-apex">Reportes tecnicos</p>
          <h1 className="mt-1 text-3xl font-semibold">Servicios, tiempos y hallazgos</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Analiza servicios realizados, estados, tipos de producto, tiempos de ejecucion, hallazgos, novedades y evidencias.</p>
        </div>
        <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={exportRows} type="button"><Download size={16} /> Exportar CSV</button>
      </header>

      <section className="grid gap-3 rounded-md border border-line bg-white p-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="text-sm font-semibold">Desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm font-semibold">Hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label className="text-sm font-semibold">Estado<select className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="inline-flex h-10 items-center self-end rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={load} type="button">Actualizar</button>
      </section>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="Servicios" value={kpis.total} />
        <Metric label="Cerrados" value={kpis.closed} />
        <Metric label="No ejecutados" value={kpis.notExecuted} />
        <Metric label="Duracion prom." value={minutesLabel(kpis.avgDuration)} />
        <Metric label="Con hallazgos" value={kpis.findings} />
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 className="font-semibold">Detalle profesional de servicios</h2><p className="text-sm text-neutral-500">{filtered.length} registro(s) encontrados</p></div>
          <label className="relative w-full sm:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar orden, tecnico, cliente o referencia" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {filtered.map((row) => (
            <button className="rounded-md border border-line bg-white p-3 text-left shadow-sm active:scale-[0.99]" key={row.id} onClick={() => setSelected(row)} type="button">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.number} - {row.customer}</p>
                  <p className="mt-1 text-xs text-neutral-500">{row.date || "Sin fecha"} - {row.technician}</p>
                </div>
                <span className="shrink-0 rounded-md bg-paper px-2 py-1 text-[11px] font-semibold text-neutral-700">{statusLabels[row.status] || row.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                <span className="rounded-md bg-paper px-2 py-1">Duracion: {minutesLabel(row.duration)}</span>
                <span className="rounded-md bg-paper px-2 py-1">Evidencias: {row.evidence.length}</span>
                <span className="rounded-md bg-paper px-2 py-1">Novedades: {row.incidents.length}</span>
                <span className="rounded-md bg-paper px-2 py-1">{row.productType}</span>
              </div>
              <p className="mt-3 line-clamp-2 text-xs text-neutral-600">{row.reference}</p>
              {row.findings !== "Sin hallazgos" ? <p className="mt-2 line-clamp-2 rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900">{row.findings}</p> : null}
            </button>
          ))}
          {!filtered.length ? <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-neutral-500">{loading ? "Cargando..." : "Sin servicios para el filtro seleccionado."}</p> : null}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500"><tr>{["Fecha", "Orden", "Tecnico", "Cliente", "Estado", "Producto", "Referencia", "Inicio", "Cierre", "Duracion", "Hallazgos", ""].map((head) => <th className="px-4 py-3" key={head}>{head}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => (
                <tr className="hover:bg-paper" key={row.id}>
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3 font-semibold">{row.number}</td>
                  <td className="px-4 py-3">{row.technician}</td>
                  <td className="px-4 py-3">{row.customer}</td>
                  <td className="px-4 py-3">{statusLabels[row.status] || row.status}</td>
                  <td className="px-4 py-3">{row.productType}</td>
                  <td className="max-w-[260px] truncate px-4 py-3">{row.reference}</td>
                  <td className="px-4 py-3">{hour(row.startedAt)}</td>
                  <td className="px-4 py-3">{hour(row.closedAt)}</td>
                  <td className="px-4 py-3 font-semibold">{minutesLabel(row.duration)}</td>
                  <td className="max-w-[260px] truncate px-4 py-3">{row.findings}</td>
                  <td className="px-4 py-3"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 font-semibold hover:bg-white" onClick={() => setSelected(row)} type="button"><Eye size={15} /> Ver</button></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td className="px-4 py-8 text-center text-neutral-500" colSpan={12}>{loading ? "Cargando..." : "Sin servicios para el filtro seleccionado."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-neutral-950/40">
          <aside className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div><p className="text-sm font-semibold text-apex">Detalle tecnico</p><h2 className="text-2xl font-semibold">{selected.number}</h2><p className="text-sm text-neutral-500">{selected.customer} - {selected.technician}</p></div>
              <button className="rounded-md border border-line px-3 py-2 text-sm font-semibold" onClick={() => setSelected(null)} type="button">Cerrar</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-3"><Metric label="Duracion" value={minutesLabel(selected.duration)} /><Metric label="Estimado" value={minutesLabel(selected.expected)} /><Metric label="Desviacion" value={`${selected.variance} min`} /></div>
              <div className="mt-4 rounded-md border border-line p-3"><p className="font-semibold">Hallazgos / novedades</p><p className="mt-2 text-sm text-neutral-700">{selected.findings}</p></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Detail label="Estado" value={statusLabels[selected.status] || selected.status} />
                <Detail label="Tipo de servicio" value={selected.serviceType} />
                <Detail label="Producto" value={selected.productType} />
                <Detail label="Referencia" value={selected.reference} />
                <Detail label="Inicio" value={hour(selected.startedAt)} />
                <Detail label="Cierre" value={hour(selected.closedAt)} />
              </div>
              <div className="mt-4 space-y-2">
                <p className="font-semibold">Evidencias</p>
                {selected.evidence.map((item) => <div className="rounded-md border border-line p-3 text-sm" key={item.id}><Wrench className="mr-2 inline text-apex" size={15} />{item.evidence_type || "evidencia"} - {item.storage_path || "sin ruta"}</div>)}
                {!selected.evidence.length ? <p className="rounded-md bg-paper p-3 text-sm text-neutral-500">Sin evidencias registradas.</p> : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border border-line bg-white p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md bg-paper p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
