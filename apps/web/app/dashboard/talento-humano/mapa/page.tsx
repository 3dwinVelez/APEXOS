"use client";

import { api } from "@/lib/api";
import { ArrowLeft, ExternalLink, MapPin, RefreshCw, Route } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type GpsPing = {
  id: number;
  user_name: string;
  vehicle_plate: string;
  route_id: number;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  captured_at: string;
  age_seconds: number;
};

export default function LiveGpsMapPage() {
  const [pings, setPings] = useState<GpsPing[]>([]);
  const [selected, setSelected] = useState<GpsPing | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<GpsPing[]>("/api/v1/hr/gps/active?minutes=120");
      setPings(data);
      setSelected((current) => current ? data.find((item) => item.user_name === current.user_name) || data[0] || null : data[0] || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
    const timer = window.setInterval(() => load().catch(() => undefined), 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Control de horarios</Link>
          <p className="text-sm font-medium text-apex">Talento Humano</p>
          <h1 className="text-3xl font-semibold">Mapa GPS en vivo</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Operarios con senal GPS reciente, vehiculo y ruta asignada.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={load} type="button">
          <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar
        </button>
      </header>

      <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-md border border-line bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Operarios activos</h2>
            <span className="rounded-md bg-paper px-2 py-1 text-xs">{pings.length}</span>
          </div>
          <div className="space-y-2">
            {pings.map((ping) => (
              <button className={`w-full rounded-md border p-3 text-left hover:bg-paper ${selected.id === ping.id ? "border-apex" : "border-line"}`} key={ping.id} onClick={() => setSelected(ping)} type="button">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{ping.user_name}</p>
                  <span className={`h-2.5 w-2.5 rounded-full ${ping.age_seconds < 300 ? "bg-emerald-500" : "bg-amber-500"}`} />
                </div>
                <p className="mt-1 text-xs text-neutral-500">{ping.vehicle_plate || "Sin vehiculo"} · hace {Math.round(ping.age_seconds / 60)} min</p>
              </button>
            ))}
            {!pings.length ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-500">Sin senales GPS activas. Abre marcacion movil y activa GPS.</p> : null}
          </div>
        </aside>

        <section className="min-h-[520px] rounded-md border border-line bg-white p-4">
          <div className="relative min-h-[420px] overflow-hidden rounded-md border border-line bg-[linear-gradient(90deg,#eef2f7_1px,transparent_1px),linear-gradient(#eef2f7_1px,transparent_1px)] bg-[size:48px_48px]">
            {pings.map((ping, index) => {
              const left = 12 + ((Math.abs(ping.longitude * 1000) + index * 17) % 76);
              const top = 12 + ((Math.abs(ping.latitude * 1000) + index * 23) % 76);
              return (
                <button
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border bg-white px-3 py-2 text-xs font-semibold shadow-sm ${selected.id === ping.id ? "border-apex text-apex" : "border-line"}`}
                  key={ping.id}
                  onClick={() => setSelected(ping)}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  type="button"
                >
                  <MapPin size={14} /> {ping.user_name}
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="mt-4 rounded-md border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{selected.user_name}</h2>
                  <p className="mt-1 text-sm text-neutral-600">{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)} · precision {Math.round(selected.accuracy_meters || 0)}m</p>
                  <p className="mt-1 text-sm text-neutral-600"><Route className="mr-1 inline" size={14} /> Ruta {selected.route_id || "--"} · {selected.vehicle_plate || "Sin vehiculo"}</p>
                </div>
                <a className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" href={`https://www.google.com/mapsq=${selected.latitude},${selected.longitude}&z=17`} rel="noreferrer" target="_blank">
                  Ver GPS <ExternalLink size={14} />
                </a>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
