"use client";

import { IncidentList } from "@/components/apex-control/IncidentList";
import { LiveFeed } from "@/components/apex-control/LiveFeed";
import { OverviewPanel } from "@/components/apex-control/OverviewPanel";
import {
  acknowledgeApexControlIncident,
  connectApexControlLive,
  getApexControlEvents,
  getApexControlIncidents,
  getApexControlStatus,
  STATUS_LABEL,
  type ApexControlEvent,
  type ApexControlIncident,
  type ApexControlStatus
} from "@/lib/apexControl";
import { Bell, ExternalLink, Radar } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const POLL_MS = 15_000;

type Tab = "overview" | "live";

export default function ApexControlPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<ApexControlStatus | null>(null);
  const [events, setEvents] = useState<ApexControlEvent[]>([]);
  const [incidents, setIncidents] = useState<ApexControlIncident[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nextStatus, nextEvents, nextIncidents] = await Promise.all([
        getApexControlStatus(),
        getApexControlEvents({ limit: 120 }),
        getApexControlIncidents({ status: "all", limit: 50 })
      ]);
      setStatus(nextStatus);
      setEvents(nextEvents.events);
      setIncidents(nextIncidents);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo leer el estado del sistema.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(true); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => connectApexControlLive({
    onConnection: (state) => setConnected(state === "connected"),
    onSnapshot: (snapshot) => {
      setStatus((current) => {
        if (!current) return current;
        return {
          ...current,
          status: snapshot.status,
          score: snapshot.score,
          counts: snapshot.counts,
          components: snapshot.components,
          generated_at: snapshot.taken_at
        };
      });
    },
    onEvent: (event) => {
      setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 150));
    },
    onNotification: (notification) => {
      setNotice(`${notification.title}: ${notification.message}`);
    }
  }), []);

  async function handleAcknowledge(incident: ApexControlIncident) {
    setBusyId(incident.id);
    setError("");
    try {
      const updated = await acknowledgeApexControlIncident(incident.id);
      setIncidents((current) => current.map((item) => item.id === updated.id ? updated : item));
      setStatus((current) => current ? { ...current, incidents: current.incidents.map((item) => item.id === updated.id ? updated : item) } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo acusar el incidente.");
    } finally {
      setBusyId("");
    }
  }

  const overall = status?.status || "unknown";

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-control border border-line bg-surface p-2 text-apex"><Radar className="h-6 w-6" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-apex">APEX Control</p>
            <h1 className="text-xl font-extrabold text-content-strong">Torre de Control</h1>
            <p className="text-xs text-content-muted">Sistema nervioso: salud técnica en vivo, incidentes y briefing diario.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-content-muted">
            <Bell className="h-3.5 w-3.5" /> {status?.notifications_unread ?? 0} sin leer
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${overall === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300" : overall === "down" ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300" : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"}`}>
            {STATUS_LABEL[overall]}
          </span>
        </div>
      </header>

      <aside className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 py-2 text-xs text-content-muted">
        <p>
          <span className="font-semibold text-content-strong">Vista secundaria.</span>{" "}
          Esta página vive dentro de APEXOS y deja de responder si la API se cae. La vigilancia independiente, las tres ramas,
          Telegram y la fábrica de Qoder están en APEX Control Tower; iníciala con <code className="font-mono">apex-control.bat</code>.
        </p>
        <a
          href="http://127.0.0.1:4310"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 font-semibold text-apex hover:border-apex"
        >
          Abrir torre externa <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </aside>

      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-control border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="font-semibold uppercase">Cerrar</button>
        </div>
      ) : null}

      {status?.enabled === false ? (
        <div className="rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          APEX Control está deshabilitado por configuración (APEX_CONTROL_ENABLED=false). El panel muestra la última muestra disponible.
        </div>
      ) : null}

      <nav className="flex gap-1 border-b border-line">
        {([
          { id: "overview", label: "Resumen" },
          { id: "live", label: "En vivo" }
        ] as const).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === item.id ? "border-apex text-apex" : "border-transparent text-content-muted hover:text-content-strong"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <>
          <OverviewPanel status={status} loading={loading} error={error} onRefresh={() => void refresh()} />
          <IncidentList incidents={incidents} busyId={busyId} onAcknowledge={handleAcknowledge} onRefresh={() => void refresh()} />
        </>
      ) : (
        <>
          <LiveFeed events={events} connected={connected} />
          <IncidentList incidents={incidents} busyId={busyId} onAcknowledge={handleAcknowledge} onRefresh={() => void refresh()} />
        </>
      )}
    </div>
  );
}
