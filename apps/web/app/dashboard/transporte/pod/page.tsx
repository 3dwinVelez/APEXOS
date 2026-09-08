"use client";

import { api } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
type Row = {
  id: number;
  result: string;
  attempt_number: number;
  occurred_at: string;
  pod?: {
    receiver_name: string;
    signature?: string;
    photos: string[];
    latitude?: number;
    longitude?: number;
  };
  trip: {
    code: string;
    vehicle_plate?: string;
    driver?: { name: string };
    carrier?: { legal_name: string };
  };
  stop: { delivery_point?: { name: string; city: string } };
  need?: { code: string };
};
type Stats = {
  total: number;
  complete: number;
  partial: number;
  rejected: number;
  complete_pct: number;
  partial_pct: number;
  first_attempt_pct: number;
};
export default function TransportPodPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    complete: 0,
    partial: 0,
    rejected: 0,
    complete_pct: 0,
    partial_pct: 0,
    first_attempt_pct: 0,
  });
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  async function openEvidence(reference: string) {
    try {
      setError("");
      const response = await api<{ url: string }>(
        `/api/v1/transport/evidence/view?reference=${encodeURIComponent(reference)}`,
        { cache: "no-store" },
      );
      window.open(response.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible abrir la evidencia.",
      );
    }
  }
  const load = useCallback(async () => {
    const query = result ? `?result=${result}` : "";
    const [items, summary] = await Promise.all([
      api<Row[]>(`/api/v1/transport/pod${query}`),
      api<Stats>(`/api/v1/transport/pod/stats${query}`),
    ]);
    setRows(items);
    setStats(summary);
  }, [result]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-apex">
          Evidencia TMS
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Pruebas de entrega</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Receptores, firma, fotografías, ubicación y desempeño del primer
          intento.
        </p>
      </header>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Total", stats.total],
          ["Completas", stats.complete],
          ["Parciales", stats.partial],
          ["Rechazos", stats.rejected],
          ["Primer intento", `${stats.first_attempt_pct}%`],
        ].map(([label, value]) => (
          <div
            className="rounded-xl border border-line bg-white p-3"
            key={label}
          >
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-semibold">Evidencias registradas</h2>
          <select
            className="rounded-md border border-line px-3 py-2 text-sm"
            onChange={(event) => setResult(event.target.value)}
            value={result}
          >
            <option value="">Todos</option>
            <option value="completa">Completa</option>
            <option value="parcial">Parcial</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </div>
        <div className="divide-y divide-line">
          {rows.map((row) => (
            <article
              className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_180px]"
              key={row.id}
            >
              <div>
                <strong>{row.need?.code || row.trip.code}</strong>
                <p className="text-sm text-neutral-500">
                  {row.stop.delivery_point?.name} ·{" "}
                  {row.stop.delivery_point?.city}
                </p>
                <p className="text-xs">
                  {row.trip.driver?.name || "Sin conductor"} ·{" "}
                  {row.trip.vehicle_plate || "Sin vehículo"}
                </p>
              </div>
              <div>
                <p className="font-medium">
                  {row.result} · intento {row.attempt_number}
                </p>
                <p className="text-sm">
                  Receptor: {row.pod?.receiver_name || "--"}
                </p>
                <p className="text-xs text-neutral-500">
                  {row.pod?.photos?.length || 0} fotos · firma{" "}
                  {row.pod?.signature ? "sí" : "no"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.pod?.photos?.map((photo, index) => (
                    <button
                      className="rounded border border-line px-2 py-1 text-xs font-semibold text-apex"
                      key={photo}
                      onClick={() => void openEvidence(photo)}
                    >
                      Ver foto {index + 1}
                    </button>
                  ))}
                  {row.pod?.signature ? (
                    <button
                      className="rounded border border-line px-2 py-1 text-xs font-semibold text-apex"
                      onClick={() => void openEvidence(row.pod!.signature!)}
                    >
                      Ver firma
                    </button>
                  ) : null}
                </div>
              </div>
              <time className="text-xs text-neutral-500">
                {new Date(row.occurred_at).toLocaleString()}
              </time>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
