"use client";

import {
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  RefreshCw,
  ShieldCheck,
  WifiOff
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchOfflineCapabilities,
  type OfflineCapabilitiesResponse
} from "@/lib/offline/bootstrapClient.ts";
import { OfflineBootstrapService } from "@/lib/offline/bootstrapService.ts";
import type {
  OfflineActivityRecord,
  OfflineChecklistRecord,
  OfflineOrderRecord
} from "@/lib/offline/types.ts";

type Connectivity =
  | "ONLINE_CONFIRMED"
  | "OFFLINE_DETECTED"
  | "BACKEND_UNREACHABLE"
  | "UNKNOWN";

type SnapshotView = {
  generatedAt: string | null;
  expiresAt: string | null;
  fresh: boolean;
  expired: boolean;
  orders: OfflineOrderRecord[];
};

type OrderDetail = {
  orderId: string;
  activities: OfflineActivityRecord[];
  checklist: OfflineChecklistRecord[];
};

function formatted(value: string | null) {
  if (!value) return "Sin descarga";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function OfflineTechnicianPanel() {
  const [capabilities, setCapabilities] = useState<OfflineCapabilitiesResponse | null>(null);
  const [connectivity, setConnectivity] = useState<Connectivity>("UNKNOWN");
  const [snapshot, setSnapshot] = useState<SnapshotView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  const readPrepared = useCallback(async () => {
    const readService = await new OfflineBootstrapService().openPrepared();
    if (!readService) {
      setSnapshot(null);
      return false;
    }
    const [state, orders] = await Promise.all([
      readService.snapshotState(),
      readService.listOrders()
    ]);
    setSnapshot({
      generatedAt: state.generatedAt,
      expiresAt: state.expiresAt,
      fresh: state.fresh,
      expired: state.expired,
      orders
    });
    return state.available;
  }, []);

  useEffect(() => {
    let active = true;
    const online = () => active && setConnectivity("UNKNOWN");
    const offline = () => active && setConnectivity("OFFLINE_DETECTED");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    const initialize = async () => {
      if (!navigator.onLine) {
        setConnectivity("OFFLINE_DETECTED");
        await readPrepared();
        return;
      }
      try {
        const response = await fetchOfflineCapabilities();
        if (!active) return;
        setCapabilities(response);
        setConnectivity("ONLINE_CONFIRMED");
        await readPrepared();
      } catch {
        if (!active) return;
        setConnectivity("BACKEND_UNREACHABLE");
        await readPrepared();
      }
    };
    initialize();
    return () => {
      active = false;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [readPrepared]);

  const prepare = async () => {
    if (!capabilities?.offlineTechnician.enabled || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const readService = await new OfflineBootstrapService().prepare(capabilities);
      const [state, orders] = await Promise.all([
        readService.snapshotState(),
        readService.listOrders()
      ]);
      setSnapshot({
        generatedAt: state.generatedAt,
        expiresAt: state.expiresAt,
        fresh: state.fresh,
        expired: state.expired,
        orders
      });
      setConnectivity("ONLINE_CONFIRMED");
      setMessage("Informacion almacenada en este dispositivo.");
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "OFFLINE_PREPARE_FAILED";
      console.warn(`[offline] prepare failed: ${code}`);
      setMessage("No fue posible preparar los datos. El flujo conectado sigue disponible.");
    } finally {
      setBusy(false);
    }
  };

  const toggleDetail = async (order: OfflineOrderRecord) => {
    if (detail?.orderId === order.orderId) {
      setDetail(null);
      return;
    }
    const readService = await new OfflineBootstrapService().openPrepared();
    if (!readService) return;
    const [activities, checklist] = await Promise.all([
      readService.listActivities(order.orderId),
      readService.listChecklist(order.orderId)
    ]);
    setDetail({ orderId: order.orderId, activities, checklist });
  };

  if (connectivity === "ONLINE_CONFIRMED" && !capabilities?.offlineTechnician.enabled) {
    return null;
  }
  const offlineView =
    connectivity === "OFFLINE_DETECTED" || connectivity === "BACKEND_UNREACHABLE";

  return (
    <section aria-live="polite" className="border-y border-line bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            {offlineView ? <WifiOff size={18} /> : <Database size={18} />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-neutral-900">
              {offlineView
                ? "Sin conexion - estas consultando datos guardados"
                : snapshot?.fresh
                  ? "Disponible sin conexion"
                  : "Preparar trabajo sin conexion"}
            </p>
            <p className="mt-0.5 text-sm text-neutral-600">
              {snapshot
                ? `Ultima actualizacion: ${formatted(snapshot.generatedAt)}`
                : "Aun no hay informacion almacenada en este dispositivo."}
            </p>
          </div>
        </div>
        {!offlineView && capabilities?.offlineTechnician.enabled ? (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
            onClick={prepare}
            type="button"
          >
            {busy ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
            {snapshot ? "Actualizar descarga" : "Preparar"}
          </button>
        ) : null}
      </div>

      {snapshot?.expired ? (
        <div className="mt-3 flex gap-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <ShieldCheck className="mt-0.5 shrink-0" size={16} />
          <p>La informacion guardada esta desactualizada. Conectate para actualizar tus ordenes.</p>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm font-medium text-neutral-700">{message}</p> : null}

      {offlineView && snapshot?.orders.length ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
            Consulta local de solo lectura
          </p>
          <div className="divide-y divide-line border-y border-line">
            {snapshot.orders.map((order) => (
              <div className="py-3" key={order.localKey}>
                <button
                  aria-expanded={detail?.orderId === order.orderId}
                  className="grid w-full items-center gap-1 text-left sm:grid-cols-[120px_1fr_auto_32px]"
                  onClick={() => toggleDetail(order)}
                  type="button"
                >
                  <span className="text-sm font-semibold text-apex">{order.orderNumber}</span>
                  <span className="min-w-0 text-sm text-neutral-700">
                    {order.customerDisplayName} - {order.serviceAddress}
                  </span>
                  <span className="text-xs font-semibold uppercase text-neutral-500">
                    {order.status.replaceAll("_", " ")}
                  </span>
                  {detail?.orderId === order.orderId ? (
                    <ChevronUp aria-hidden size={16} />
                  ) : (
                    <ChevronDown aria-hidden size={16} />
                  )}
                </button>
                {detail?.orderId === order.orderId ? (
                  <div className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-neutral-500">Actividades</p>
                      <ul className="mt-2 space-y-2">
                        {detail.activities.map((activity) => (
                          <li className="text-sm text-neutral-700" key={activity.localKey}>
                            {activity.title} - {activity.status}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-neutral-500">Checklist</p>
                      <ul className="mt-2 space-y-2">
                        {detail.checklist.map((item) => (
                          <li className="text-sm text-neutral-700" key={item.localKey}>
                            {item.label} - {item.value || "pendiente"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Estos datos pueden estar desactualizados y no pueden modificarse sin conexion.
          </p>
        </div>
      ) : offlineView ? (
        <p className="mt-3 text-sm text-neutral-600">
          No existen datos preparados para consultar sin conexion.
        </p>
      ) : null}
    </section>
  );
}
