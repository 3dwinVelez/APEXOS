"use client";

import { useMemo, useState } from "react";
import { InventoryNav } from "@/components/inventory-nav";

const reports = [
  { name: "Stock crítico", area: "stock", zone: "picking", abc: "A", value: "18 SKUs", signal: "reponer hoy" },
  { name: "Kardex por producto", area: "movimientos", zone: "reserva", abc: "B", value: "1.248 mov.", signal: "trazabilidad" },
  { name: "Clasificación ABC", area: "rotacion", zone: "todas", abc: "A", value: "32% ventas", signal: "slotting" },
  { name: "Rotación de inventario", area: "rotacion", zone: "picking", abc: "B", value: "14.2 vueltas", signal: "últimos 30 días" },
  { name: "Ubicaciones subutilizadas", area: "ocupacion", zone: "reserva", abc: "C", value: "27 ubic.", signal: "optimizar espacio" },
  { name: "Vencimientos", area: "riesgo", zone: "cuarentena", abc: "A", value: "9 lotes", signal: "FEFO" }
];

export default function ReportesInventarioPage() {
  const [area, setArea] = useState("todos");
  const [zone, setZone] = useState("todas");
  const [abc, setAbc] = useState("todos");
  const [period, setPeriod] = useState("30");

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const byArea = area === "todos" || report.area === area;
      const byZone = zone === "todas" || report.zone === zone || report.zone === "todas";
      const byAbc = abc === "todos" || report.abc === abc;
      return byArea && byZone && byAbc;
    });
  }, [abc, area, zone]);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario · Reportes</p>
        <h1 className="text-3xl font-semibold">Reportes operativos</h1>
      </header>
      <InventoryNav />

      <section className="rounded-md border border-line bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={area} onChange={(event) => setArea(event.target.value)}>
            <option value="todos">Todas las métricas</option>
            <option value="stock">Stock</option>
            <option value="movimientos">Movimientos</option>
            <option value="rotacion">Rotación</option>
            <option value="ocupacion">Ocupación</option>
            <option value="riesgo">Riesgo</option>
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={zone} onChange={(event) => setZone(event.target.value)}>
            <option value="todas">Todas las zonas</option>
            <option value="picking">Picking</option>
            <option value="reserva">Reserva</option>
            <option value="cuarentena">Cuarentena</option>
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={abc} onChange={(event) => setAbc(event.target.value)}>
            <option value="todos">Todas ABC</option>
            <option value="A">ABC A</option>
            <option value="B">ABC B</option>
            <option value="C">ABC C</option>
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredReports.map((report) => (
          <article className="rounded-md border border-line bg-white p-4" key={`${report.name}-${report.zone}`}>
            <p className="text-sm font-semibold">{report.name}</p>
            <p className="mt-3 text-2xl font-semibold">{report.value}</p>
            <p className="mt-1 text-sm text-neutral-500">{report.signal} · {period} días · {report.zone}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
