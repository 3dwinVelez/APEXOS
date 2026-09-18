"use client";

import { api } from "@/lib/api";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Download, RefreshCw, Search, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type Novelty = {
  id: number;
  date: string;
  type_code: string;
  status: string;
  origin: string;
  minutes?: number;
  hours?: number;
  requires_review?: boolean;
  metadata?: Record<string, unknown>;
  employee_code?: string;
  employee_metadata?: { name?: string; document?: string };
  updated_at?: string;
};

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  en_revision: "En revision",
  justificada: "Justificada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  anulada: "Anulada",
  requiere_revision: "Requiere revision"
};

export default function WorkdayNoveltiesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Novelty[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ fecha_inicio: from, fecha_fin: to, limit: "200" });
      if (status) params.set("status", status);
      const data = await api<Novelty[]>(`/api/v1/talento-humano/novedades?${params.toString()}`, { cache: "no-store" });
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [
      row.type_code,
      row.status,
      row.origin,
      row.employee_code,
      row.employee_metadata?.name,
      row.employee_metadata?.document
    ].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [query, rows]);

  const counts = useMemo(() => ({
    pending: rows.filter((row) => row.status === "pendiente").length,
    review: rows.filter((row) => row.requires_review || row.status === "requiere_revision").length,
    approved: rows.filter((row) => row.status === "aprobada").length,
    rejected: rows.filter((row) => row.status === "rechazada").length,
    overtimeAlerts: rows.filter((row) => ["EXCESO_HE_DIARIO", "EXCESO_HE_SEMANAL"].includes(row.type_code)).length
  }), [rows]);

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <h1 className="mt-2 text-2xl font-semibold">Novedades de jornada</h1>
          <p className="mt-1 text-sm text-neutral-600">Bandeja de gestion para alertas de marcacion, kilometraje y reglas laborales.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" type="button">
          <Download size={16} /> Exportar
        </button>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <Kpi icon={<Clock3 size={18} />} label="Pendientes" value={counts.pending} />
        <Kpi icon={<AlertTriangle size={18} />} label="Requieren revision" value={counts.review} />
        <Kpi icon={<CheckCircle2 size={18} />} label="Aprobadas" value={counts.approved} />
        <Kpi icon={<XCircle size={18} />} label="Rechazadas" value={counts.rejected} />
        <Kpi icon={<AlertTriangle size={18} />} label="Alertas extra" value={counts.overtimeAlerts} />
      </section>

      <section className="rounded-md border border-line bg-white p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_2fr_auto]">
          <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar empleado, documento, tipo u origen" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => void load()} type="button">
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Consultar
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Empleado</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Tiempo</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Origen</th>
                <th className="px-3 py-3">Alerta legal</th>
                <th className="px-3 py-3">Ultima modificacion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr className="border-t border-line" key={row.id}>
                  <td className="px-3 py-3">{String(row.date || "").slice(0, 10)}</td>
                  <td className="px-3 py-3"><span className="font-semibold">{row.employee_metadata?.name || row.employee_code || "Sin empleado"}</span><span className="block text-xs text-neutral-500">{row.employee_metadata?.document || ""}</span></td>
                  <td className="px-3 py-3">{row.type_code}</td>
                  <td className="px-3 py-3">{row.hours || row.minutes ? `${row.hours || Math.round(Number(row.minutes || 0) / 60 * 100) / 100} h` : "--"}</td>
                  <td className="px-3 py-3"><span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold">{statusLabels[row.status] || row.status}</span></td>
                  <td className="px-3 py-3">{row.origin}</td>
                  <td className="px-3 py-3">{row.requires_review ? "Requiere revision" : ["EXCESO_HE_DIARIO", "EXCESO_HE_SEMANAL"].includes(row.type_code) ? "Alerta" : "--"}</td>
                  <td className="px-3 py-3">{row.updated_at ? new Date(row.updated_at).toLocaleString("es-CO") : "--"}</td>
                </tr>
              ))}
              {!filtered.length ? <tr><td className="px-3 py-8 text-center text-neutral-500" colSpan={8}>Sin novedades para los filtros seleccionados.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <article className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-apex">{icon}</span>
        <span className="text-2xl font-semibold">{value}</span>
      </div>
      <p className="mt-2 text-xs font-semibold uppercase text-neutral-500">{label}</p>
    </article>
  );
}
