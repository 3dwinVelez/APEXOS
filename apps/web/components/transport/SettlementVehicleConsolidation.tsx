"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search, Truck } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Badge } from "@/components/ui/feedback";

type PackageRef = { id: number; code: string; carrier_name?: string | null; status: string; period_code?: string | null };
type Line = { package_id: number; package_code: string; guide_reference?: string | null; route_description?: string | null; origin_name?: string | null; destination_city?: string | null; service_date?: string | null; calculated_amount: number; adjusted_amount: number; approved_amount: number };
type Vehicle = { vehicle_key: string; vehicle_plate: string; vehicle_type?: string | null; line_count: number; guide_count: number; weight_kg: number; volume_m3: number; distance_km: number; calculated_total: number; adjusted_total: number; approved_total: number; packages: PackageRef[]; lines: Line[] };
export type ConsolidationResponse = { generated_at: string; total_packages: number; matched_packages?: number; has_more?: boolean; totals: { vehicle_count: number; line_count: number; guide_count: number; weight_kg: number; distance_km: number; calculated_total: number; adjusted_total: number; approved_total: number }; vehicles: Vehicle[] };

const labels: Record<string, string> = { borrador: "Creado", validando: "Validando", preliquidada: "Preliquidada", con_novedad: "Con novedad", en_revision: "En revisión", rechazada: "Rechazada", aprobada: "Aprobada", contabilizada: "Contabilizada", liquidada: "Liquidada", reversada: "Reversada", cancelada: "Cancelada" };
const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const button = "min-h-10 rounded-lg border border-line px-3 text-sm font-semibold hover:border-apex focus-visible:outline focus-visible:outline-2 focus-visible:outline-apex disabled:opacity-40";
const states = (vehicle: Vehicle) => [...new Set(vehicle.packages.map(pkg => pkg.status))].map(status => ({ status, count: vehicle.packages.filter(pkg => pkg.status === status).length }));
const sum = (lines: Line[]) => lines.reduce((total, line) => total + Number(line.adjusted_amount || 0), 0);

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-line bg-surface-muted p-3"><p className="text-xs text-content-muted">{label}</p><p className="mt-1 text-lg font-semibold text-content-strong">{value}</p></div>; }
function Pagination({ page, count, size, onChange, label }: { page: number; count: number; size: number; onChange: (value: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(count / size));
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-content-muted">{count ? (page - 1) * size + 1 : 0}–{Math.min(page * size, count)} de {count}</span><div className="flex items-center gap-2"><button className={button} type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</button><span>{page} / {pages}</span><button className={button} type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Siguiente</button></div></nav>;
}

export function SettlementVehicleConsolidation({ data, onOpenPackage }: { data: ConsolidationResponse | null; onOpenPackage: (pkg: { id: number }) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [drill, setDrill] = useState<{ vehicle: Vehicle; status: string } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const showDetail = (vehicle: Vehicle, status: string, element: HTMLButtonElement) => { opener.current = element; setDrill({ vehicle, status }); };
  const closeDetail = () => { setDrill(null); requestAnimationFrame(() => opener.current?.focus()); };
  const vehicles = (data?.vehicles || []).filter(vehicle => normalize(`${vehicle.vehicle_plate} ${vehicle.vehicle_type || ""}`).includes(normalize(query.trim())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(vehicles.length / 8)));
  return <section className="space-y-4" aria-label="Consolidado por vehículo">
    {data?.has_more ? <p role="alert" className="rounded-lg border border-line bg-surface p-3 text-sm">Se muestran {data.total_packages} de {data.matched_packages} paquetes. El resumen es parcial: reduzca el periodo, las fechas o seleccione un vehículo para consultar el resultado completo.</p> : null}
    <div><h2 className="text-lg font-semibold text-content-strong">Ingresos por vehículo</h2><p className="text-sm text-content-muted">Resumen de {data?.total_packages || 0} paquetes del filtro actual. Seleccione un vehículo o una etiqueta de estado para explorar sus liquidaciones.</p></div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Vehículos" value={String(data?.totals.vehicle_count || 0)} /><Metric label="Documentos / guías" value={String(data?.totals.guide_count || 0)} /><Metric label="Importe ajustado" value={money(data?.totals.adjusted_total || 0)} /></div>
    <label className="block max-w-md text-sm font-semibold">Buscar vehículo<div className="mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface px-3"><Search size={16} aria-hidden="true" /><input className="h-10 min-w-0 flex-1 bg-transparent font-normal outline-none" type="search" value={query} placeholder="Placa o tipo de vehículo" onChange={event => { setQuery(event.target.value); setPage(1); }} /></div></label>
    {!vehicles.length ? <p role="status" className="rounded-lg border border-line bg-surface p-6 text-sm text-content-muted">{data?.vehicles.length ? "No hay vehículos que coincidan con la búsqueda." : "No hay documentos con vehículo en el filtro actual."}</p> : null}
    <div className="grid gap-3 lg:grid-cols-2">{vehicles.slice((currentPage - 1) * 8, currentPage * 8).map(vehicle => <article key={vehicle.vehicle_key} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><span className="rounded-lg bg-surface-muted p-2 text-apex"><Truck size={20} aria-hidden="true" /></span><div><h3 className="font-semibold text-content-strong">{vehicle.vehicle_plate}</h3><p className="text-xs text-content-muted">{vehicle.vehicle_type || "Tipo sin registrar"}</p></div></div><button className={button} type="button" onClick={event => showDetail(vehicle, "", event.currentTarget)} aria-label={`Ver detalle de ${vehicle.vehicle_plate}`}>Ver detalle</button></div>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm text-content-muted">{vehicle.packages.length} paquetes · {vehicle.guide_count} documentos / guías</p><p className="font-semibold">{money(vehicle.adjusted_total)} <span className="text-xs font-normal text-content-muted">ajustado</span></p></div>
      <div className="flex flex-wrap gap-2" aria-label={`Estados de ${vehicle.vehicle_plate}`}>{states(vehicle).map(({ status, count }) => <button className="min-h-9 rounded-full border border-line bg-surface-muted px-3 text-xs font-semibold hover:border-apex focus-visible:outline focus-visible:outline-2 focus-visible:outline-apex" type="button" key={status} onClick={event => showDetail(vehicle, status, event.currentTarget)}>{labels[status] || status} <span className="ml-1 text-apex">{count}</span></button>)}</div>
    </article>)}</div>
    {vehicles.length ? <Pagination page={currentPage} count={vehicles.length} size={8} onChange={setPage} label="Páginas de vehículos" /> : null}
    {drill ? <VehicleDetail key={`${drill.vehicle.vehicle_key}-${drill.status}`} vehicle={drill.vehicle} initialStatus={drill.status} onClose={closeDetail} onOpenPackage={pkg => { setDrill(null); onOpenPackage(pkg); }} /> : null}
  </section>;
}

function VehicleDetail({ vehicle, initialStatus, onClose, onOpenPackage }: { vehicle: Vehicle; initialStatus: string; onClose: () => void; onOpenPackage: (pkg: PackageRef) => void }) {
  useEffect(() => {
    // Escape belongs to this dialog, not to global shortcuts behind its overlay.
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [onClose]);
  const [status, setStatus] = useState(initialStatus), [query, setQuery] = useState("");
  const [page, setPage] = useState(1), [expanded, setExpanded] = useState<number | null>(null), [linePage, setLinePage] = useState(1);
  const linesByPackage = useMemo(() => { const map = new Map<number, Line[]>(); for (const line of vehicle.lines) { const rows = map.get(line.package_id) || []; rows.push(line); map.set(line.package_id, rows); } return map; }, [vehicle]);
  const filtered = vehicle.packages.filter(pkg => (!status || pkg.status === status) && normalize([pkg.code, pkg.period_code, pkg.carrier_name, ...(linesByPackage.get(pkg.id) || []).flatMap(line => [line.guide_reference, line.route_description, line.origin_name, line.destination_city])].join(" ")).includes(normalize(query.trim())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 8)));
  const amount = filtered.reduce((total, pkg) => total + sum(linesByPackage.get(pkg.id) || []), 0);
  const reset = () => { setPage(1); setExpanded(null); setLinePage(1); };
  return <ModalFrame title={`Consolidado · ${vehicle.vehicle_plate}`} onClose={onClose} maxWidth="md:max-w-5xl">
    <div className="space-y-4">
      <p className="text-sm text-content-muted">{vehicle.vehicle_type || "Tipo sin registrar"} · {vehicle.packages.length} paquetes · {vehicle.guide_count} documentos / guías · {vehicle.line_count} líneas</p>
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Preliquidado del vehículo" value={money(vehicle.calculated_total)} /><Metric label="Ajustado del vehículo" value={money(vehicle.adjusted_total)} /><Metric label="Aprobado del vehículo" value={money(vehicle.approved_total)} /></div>
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Datos operativos del vehículo</summary><p className="mt-2 text-sm text-content-muted">Peso: {vehicle.weight_kg.toLocaleString("es-CO")} kg · Distancia: {vehicle.distance_km.toLocaleString("es-CO")} km · Volumen: {vehicle.volume_m3.toLocaleString("es-CO")} m³</p></details>
      <div className="flex flex-wrap gap-2" aria-label="Filtrar paquetes por estado">{[{ status: "", count: vehicle.packages.length }, ...states(vehicle)].map(row => <button type="button" key={row.status} aria-pressed={status === row.status} className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${status === row.status ? "border-apex bg-apex text-white" : "border-line bg-surface-muted hover:border-apex"}`} onClick={() => { setStatus(row.status); reset(); }}>{row.status ? labels[row.status] || row.status : "Todos"} ({row.count})</button>)}</div>
      <label className="block text-sm font-semibold">Buscar paquete o documento<input type="search" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 font-normal" placeholder="Liquidación, guía, destino o periodo" value={query} onChange={event => { setQuery(event.target.value); reset(); }} /></label>
      <p role="status" className="text-sm text-content-muted">{filtered.length} paquetes encontrados · {money(amount)} ajustados en este resultado. Los importes superiores corresponden al vehículo completo.</p>
      <div className="space-y-2">{filtered.slice((currentPage - 1) * 8, currentPage * 8).map(pkg => {
        const lines = linesByPackage.get(pkg.id) || [], isOpen = expanded === pkg.id;
        return <article className="rounded-lg border border-line bg-surface" key={pkg.id}>
          <div className="flex flex-wrap items-center justify-between gap-3 p-3"><button className="flex min-h-10 min-w-0 items-center gap-2 text-left" type="button" aria-expanded={isOpen} aria-controls={`vehicle-package-${pkg.id}`} onClick={() => { setExpanded(isOpen ? null : pkg.id); setLinePage(1); }}>{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<span><span className="font-semibold">{pkg.code}</span><span className="block text-xs text-content-muted">{pkg.period_code || "Sin periodo"} · {lines.length} documentos</span></span></button><div className="flex flex-wrap items-center gap-3"><Badge tone={["aprobada", "contabilizada", "liquidada"].includes(pkg.status) ? "success" : ["rechazada", "reversada"].includes(pkg.status) ? "error" : "neutral"}>{labels[pkg.status] || pkg.status}</Badge><span className="text-sm font-semibold">{money(sum(lines))}</span><button type="button" className={button} aria-label={`Abrir ${pkg.code}`} onClick={() => onOpenPackage(pkg)}>Abrir liquidación</button></div></div>
          {isOpen ? <div className="space-y-3 border-t border-line bg-surface-muted p-3" id={`vehicle-package-${pkg.id}`}>
            <div className="grid gap-2 sm:grid-cols-2">{lines.slice((linePage - 1) * 10, linePage * 10).map((line, index) => <div key={`${line.guide_reference}-${index}`} className="rounded-lg border border-line bg-surface p-3 text-sm"><p className="break-words font-semibold">{line.guide_reference || "Sin referencia"}</p><p className="mt-1 break-words text-content-muted">{line.route_description || [line.origin_name, line.destination_city].filter(Boolean).join(" → ") || "Ruta sin registrar"}</p><p className="mt-1 text-xs text-content-muted">{line.service_date ? new Date(line.service_date).toLocaleDateString("es-CO", { timeZone: "UTC" }) : "Fecha sin registrar"}</p><dl className="mt-3 grid grid-cols-2 gap-2"><div><dt className="text-xs text-content-muted">Ajustado</dt><dd>{money(line.adjusted_amount)}</dd></div><div><dt className="text-xs text-content-muted">Aprobado</dt><dd>{money(line.approved_amount)}</dd></div></dl></div>)}</div>
            {!lines.length ? <p className="text-sm text-content-muted">No hay documentos en este paquete para el vehículo.</p> : <Pagination page={linePage} count={lines.length} size={10} onChange={setLinePage} label={`Documentos de ${pkg.code}`} />}
          </div> : null}
        </article>;
      })}</div>
      {!filtered.length ? <div className="rounded-lg border border-line p-4 text-sm"><p>No hay paquetes que coincidan con estos filtros.</p><button className={`${button} mt-2`} type="button" onClick={() => { setQuery(""); setStatus(""); reset(); }}>Limpiar filtros</button></div> : null}
      {filtered.length ? <Pagination page={currentPage} count={filtered.length} size={8} onChange={value => { setPage(value); setExpanded(null); setLinePage(1); }} label="Páginas de paquetes" /> : null}
    </div>
  </ModalFrame>;
}
