"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";

type Order = {
  id: number;
  code: string;
  status: string;
  source_type: string;
  source_reference?: string;
  origin_name: string;
  due_at: string;
  weight_kg: number;
  volume_m3: number;
  delivery_point?: { name: string; city: string };
  validation_errors?: string[];
};

const validationLabels: Record<string, string> = {
  peso_faltante: "peso",
  volumen_faltante: "volumen",
  coordenadas_destino_faltantes: "ubicación del destino",
  ventana_entrega_faltante: "horario de entrega",
};

function orderSource(order: Order) {
  if (order.source_type === "commercial") return "Gestión Comercial";
  if (order.source_type === "sales") return "Ventas";
  return "Archivo externo";
}

function missingData(order: Order) {
  return (order.validation_errors || []).map((error) => validationLabels[error] || error).join(", ");
}
type ImportResult = {
  status: string;
  total: number;
  valid?: number;
  created?: number;
  errors: Array<Record<string, unknown>>;
};
type Intake = {
  mode: "connected" | "standalone";
  sources: Array<"sales" | "commercial">;
  manual_import: boolean;
  reviewed?: number;
  created?: number;
  existing?: number;
};
const sample =
  "pedido,origen,destino,fecha_disponible,fecha_entrega,peso_kg,volumen_m3,prioridad,nivel_servicio,referencia\nPED-001,ORI-BOG,PTO-001,2026-09-15T08:00:00-05:00,2026-09-16T17:00:00-05:00,120,2.5,normal,normal,CLIENTE-001";

export default function TransportOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("");
  const [csv, setCsv] = useState(sample);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const canWrite = hasStoredRolePermission("transport", "write");
  const load = useCallback(async () => {
    try {
      setOrders(
        await api<Order[]>(
          `/api/v1/transport/orders${status ? `?status=${status}` : ""}`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible cargar los pedidos.",
      );
    }
  }, [status]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const mode = await api<Intake>("/api/v1/transport/orders/intake");
        if (!active) return;
        setIntake(mode);
        if (mode.mode === "connected" && canWrite) {
          setSyncing(true);
          const synced = await api<Intake>("/api/v1/transport/orders/sync", { method: "POST" });
          if (active) {
            setIntake(synced);
            setMessage(synced.created ? `${synced.created} pedidos nuevos llegaron desde APEX OS.` : "Los pedidos de APEX OS ya están al día.");
          }
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "No fue posible conectar los pedidos.");
      } finally {
        if (active) {
          setSyncing(false);
          await load();
        }
      }
    })();
    return () => { active = false; };
  }, [canWrite, load]);

  async function syncOrders() {
    setSyncing(true);
    try {
      const synced = await api<Intake>("/api/v1/transport/orders/sync", { method: "POST" });
      setIntake(synced);
      setMessage(synced.created ? `${synced.created} pedidos nuevos recibidos.` : "Todo está sincronizado.");
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function loadCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setMessage("Selecciona un archivo CSV.");
      return;
    }
    setCsv(await file.text());
    setResult(null);
    setMessage(`${file.name} está listo para validar.`);
  }
  async function importCsv(event: FormEvent, dryRun: boolean) {
    event.preventDefault();
    const response = await api<ImportResult>(
      "/api/v1/transport/orders/import",
      { method: "POST", body: JSON.stringify({ csv, dry_run: dryRun }) },
    );
    setResult(response);
    setMessage(
      response.status === "invalid"
        ? "Corrige las filas reportadas antes de importar."
        : dryRun
          ? "Archivo validado correctamente."
          : `${response.created} pedidos importados.`,
    );
    if (!dryRun) await load();
  }
  async function cancel(order: Order) {
    if (!confirm(`Cancelar la orden ${order.code}?`)) return;
    await api(`/api/v1/transport/orders/${order.id}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: "Cancelada desde gestion de ordenes" }),
    });
    await load();
  }
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-apex">
          Paso 1 de 6 · Preparar
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Preparar pedidos para transporte</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Recibe pedidos de los módulos activos o carga un archivo externo. Aquí todos se convierten en entregas listas para planear.
        </p>
      </header>
      {message ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          {message}
        </div>
      ) : null}
      {intake?.mode === "connected" ? <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase text-emerald-800">Conexión automática activa</p><h2 className="font-semibold">Pedidos de APEX OS</h2><p className="mt-1 text-sm text-neutral-700">{intake.sources.includes("commercial") ? "Gestión Comercial" : "Ventas"}{intake.sources.length > 1 ? " y Ventas" : ""} envía sus pedidos a Transporte sin volver a digitarlos.</p></div>
          <button className="rounded-md bg-apex px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={!canWrite || syncing} onClick={() => void syncOrders()}>{syncing ? "Sincronizando…" : "Actualizar pedidos"}</button>
        </div>
        {intake.reviewed !== undefined ? <p className="mt-3 text-xs text-neutral-600">Revisados: {intake.reviewed} · Nuevos: {intake.created || 0} · Ya existentes: {intake.existing || 0}</p> : null}
      </section> : null}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase text-apex">{intake?.mode === "standalone" ? "Empieza aquí" : "Pedidos externos"}</p><h2 className="font-semibold">Cargar pedidos desde un archivo</h2><p className="mt-1 text-xs text-neutral-500">Usa nombres cotidianos como pedido, origen, destino, peso y fecha de entrega.</p></div>
          <span className="text-xs text-neutral-500">
            Primero valida; después importa
          </span>
        </div>
        <label className="mt-3 inline-flex cursor-pointer rounded-md border border-line bg-paper px-4 py-2 text-sm font-semibold">
          Seleccionar archivo CSV
          <input accept=".csv,text/csv" className="sr-only" onChange={(event) => void loadCsvFile(event)} type="file" />
        </label>
        <p className="mt-3 text-xs font-semibold text-neutral-600">También puedes pegar la información:</p>
        <textarea
          aria-label="Pedidos para transportar"
          className="mt-3 min-h-40 w-full rounded-md border border-line p-3 font-mono text-xs"
          onChange={(event) => setCsv(event.target.value)}
          value={csv}
        />
        <div className="mt-3 flex gap-2">
          <button
            className="rounded-md border border-apex px-4 py-2 text-sm font-semibold text-apex"
            disabled={!canWrite}
            onClick={(event) => void importCsv(event, true)}
          >
            Validar archivo
          </button>
          <button
            className="rounded-md bg-apex px-4 py-2 text-sm font-semibold text-white"
            disabled={!canWrite || result?.status !== "validated"}
            onClick={(event) => void importCsv(event, false)}
          >
            Agregar a Transporte
          </button>
        </div>
        {result?.errors?.length ? (
          <pre className="mt-3 overflow-auto rounded-md bg-paper p-3 text-xs">
            {JSON.stringify(result.errors, null, 2)}
          </pre>
        ) : null}
      </section>
      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div><h2 className="font-semibold">Pedidos registrados</h2><p className="text-xs text-neutral-500">Los incompletos indican qué debes corregir antes de planear.</p></div>
          <select
            className="rounded-md border border-line px-3 py-2 text-sm"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="incompleta">Incompletas</option>
            <option value="planificada">Planificadas</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </div>
        {!orders.length ? <div className="p-6 text-center"><p className="font-semibold">Todavía no hay pedidos para transportar</p><p className="mt-1 text-sm text-neutral-600">{intake?.mode === "connected" ? "Actualiza los pedidos de APEX OS o carga un archivo externo." : "Selecciona un CSV o pega la información de ejemplo; valida y agrégala a Transporte."}</p></div> : null}
        <div className="space-y-2 p-3 md:hidden">
          {orders.map((order) => <article className="rounded-md border border-line p-3" key={order.id}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{order.code}</p><p className="text-xs text-neutral-500">{order.delivery_point?.name || "Destino por completar"} · {orderSource(order)}</p></div><span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold">{order.status}</span></div>
            <p className="mt-2 text-sm">{order.weight_kg} kg · {order.volume_m3} m³</p>
            <p className="text-xs text-neutral-500">Entrega: {new Date(order.due_at).toLocaleString()}</p>
            {order.validation_errors?.length ? <p className="mt-2 text-xs font-semibold text-rose-700">Debes completar: {missingData(order)}</p> : null}
          </article>)}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Orden</th>
                <th className="p-3">Destino</th>
                <th className="p-3">Carga</th>
                <th className="p-3">Vence</th>
                <th className="p-3">Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr className="border-t border-line" key={order.id}>
                  <td className="p-3 font-semibold">
                    {order.code}
                    <p className="text-xs font-normal text-neutral-500">
                      {orderSource(order)} · {order.source_reference || order.origin_name}
                    </p>
                  </td>
                  <td className="p-3">
                    {order.delivery_point?.name}
                    <p className="text-xs text-neutral-500">
                      {order.delivery_point?.city}
                    </p>
                  </td>
                  <td className="p-3">
                    {order.weight_kg} kg · {order.volume_m3} m³
                  </td>
                  <td className="p-3">
                    {new Date(order.due_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {order.status}
                    {order.validation_errors?.length ? (
                      <p className="text-xs text-rose-700">
                        Completa: {missingData(order)}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 text-right">
                    {canWrite &&
                    ["pendiente", "incompleta", "planificada"].includes(
                      order.status,
                    ) ? (
                      <button
                        className="text-sm font-semibold text-rose-700"
                        onClick={() => void cancel(order)}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
