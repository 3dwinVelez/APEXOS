"use client";

import { api } from "@/lib/api";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { LiveUnit } from "@/components/tms-live-map";

const LiveMap = dynamic(() => import("@/components/tms-live-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[560px] place-items-center rounded-xl bg-paper text-sm text-neutral-500">
      Cargando mapa...
    </div>
  ),
});
type Alert = {
  code: string;
  severity: string;
  message: string;
  trip_id: number;
  trip_code: string;
  vehicle_plate?: string;
};
type Monitor = {
  generated_at: string;
  refresh_seconds: number;
  summary: {
    active: number;
    with_signal: number;
    stale: number;
    without_signal: number;
    inside_geofence: number;
    off_route: number;
    alerts: number;
  };
  units: LiveUnit[];
  alerts: Alert[];
};
export default function TransportMonitoringPage() {
  const [data, setData] = useState<Monitor | null>(null);
  const [selected, setSelected] = useState<number>();
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api<Monitor>("/api/v1/transport/monitoring/live"));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible actualizar el monitoreo.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);
  if (!data)
    return (
      <p className="text-sm text-neutral-500">Cargando monitoreo TMS...</p>
    );
  const unit = data.units.find((row) => row.trip_id === selected);
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-apex">
          Control de flota
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Monitoreo en vivo</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Mapa OpenStreetMap, análisis Turf.js, ETA, geocercas y desviaciones.
          Actualización cada {data.refresh_seconds} segundos.
        </p>
      </header>
      {error ? (
        <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        {Object.entries(data.summary).map(([label, value]) => (
          <div
            className="rounded-xl border border-line bg-white p-3"
            key={label}
          >
            <p className="text-xs text-neutral-500">
              {label.replaceAll("_", " ")}
            </p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <LiveMap
          onSelect={setSelected}
          selectedId={selected}
          units={data.units}
        />
        <aside className="space-y-3">
          {unit ? (
            <section className="rounded-xl border border-line bg-white p-4">
              <h2 className="font-semibold">
                {unit.vehicle_plate || unit.trip_code}
              </h2>
              <p className="text-sm text-neutral-500">
                {unit.status} · señal {unit.signal_status}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-neutral-500">ETA</dt>
                  <dd>{unit.eta_minutes ?? "--"} min</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Distancia</dt>
                  <dd>{unit.distance_to_stop_km ?? "--"} km</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Desvío</dt>
                  <dd>{unit.route_deviation_m ?? "--"} m</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Corredor</dt>
                  <dd>{unit.corridor_radius_m ?? "--"} m</dd>
                </div>
              </dl>
            </section>
          ) : null}
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold">Alertas activas</h2>
            <div className="mt-3 space-y-2">
              {data.alerts.map((alert, index) => (
                <button
                  className="w-full rounded-md border border-line p-3 text-left text-sm"
                  key={`${alert.trip_id}-${alert.code}-${index}`}
                  onClick={() => setSelected(alert.trip_id)}
                >
                  <strong>{alert.vehicle_plate || alert.trip_code}</strong>
                  <p className="text-xs text-rose-700">{alert.message}</p>
                </button>
              ))}
              {!data.alerts.length ? (
                <p className="text-sm text-neutral-500">Sin alertas.</p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
