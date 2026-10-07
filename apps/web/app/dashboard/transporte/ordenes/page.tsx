"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, Package, Plus, Upload, X } from "lucide-react";
import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useState } from "react";

type Order = {
  id: number;
  code: string;
  status: string;
  source_type: string;
  source_reference?: string;
  origin_id?: number | null;
  origin_name: string;
  due_at: string;
  weight_kg: number;
  volume_m3: number;
  delivery_point?: { name: string; city: string };
  plan?: { id: number; code: string; name: string } | null;
  validation_errors?: string[];
};

type Plan = {
  id: number;
  code: string;
  name: string;
  origin_id: number;
  origin?: { name: string; city: string };
  service_level: string;
  due_date: string | null;
  status: string;
  notes?: string | null;
  needs: Order[];
  need_ids: number[];
  total_weight_kg: number;
  total_volume_m3: number;
  total_pallets: number;
  stop_count: number;
};

type Origin = { id: number; code: string; name: string; city: string };

const planStatusLabels: Record<string, string> = { borrador: "Borrador", listo: "Listo para evaluar", confirmado: "Confirmado en viaje" };

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
const requiredHeaders = ["pedido", "origen", "destino", "fecha_disponible", "fecha_entrega", "peso_kg", "volumen_m3"];

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
  return `"${text.replaceAll('"', '""')}"`;
}

function normalizedHeader(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, "_");
}

export default function TransportOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileRows, setFileRows] = useState(0);
  const [readingFile, setReadingFile] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [planBusy, setPlanBusy] = useState(false);
  const [planForm, setPlanForm] = useState({ name: "", origin_id: "", service_level: "normal", due_date: "" });
  const [addingNeedId, setAddingNeedId] = useState<number | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const canWrite = hasStoredRolePermission("transport", "write");
  const load = useCallback(async () => {
    try {
      const [orderList, planList, originList] = await Promise.all([
        api<Order[]>(`/api/v1/transport/orders${status ? `?status=${status}` : ""}`),
        api<Plan[]>("/api/v1/transport/plans"),
        api<Origin[]>("/api/v1/transport/origins"),
      ]);
      setOrders(orderList);
      setPlans(planList);
      setOrigins(originList);
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
            if (synced.created) setMessage(`${synced.created} pedidos nuevos llegaron desde APEX OS.`);
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
      if (synced.created) setMessage(`${synced.created} pedidos nuevos recibidos.`);
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planForm.origin_id) {
      setMessage("Selecciona un origen para el plan.");
      return;
    }
    setPlanBusy(true);
    try {
      await api<Plan>("/api/v1/transport/plans", {
        method: "POST",
        body: JSON.stringify({
          name: planForm.name,
          origin_id: Number(planForm.origin_id),
          service_level: planForm.service_level || "normal",
          due_date: planForm.due_date || undefined,
        }),
      });
      setPlanForm({ name: "", origin_id: "", service_level: "normal", due_date: "" });
      setShowPlanModal(false);
      setMessage("Plan creado. Agrega pedidos para completarlo.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible crear el plan.");
    } finally {
      setPlanBusy(false);
    }
  }

  async function addNeedToPlan(planId: number, needId: number) {
    setAddingNeedId(needId);
    try {
      await api<Plan>(`/api/v1/transport/plans/${planId}/needs`, {
        method: "POST",
        body: JSON.stringify({ need_ids: [needId] }),
      });
      setMessage("Pedido agregado al plan.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible agregar el pedido al plan.");
    } finally {
      setAddingNeedId(null);
    }
  }

  async function removeNeedFromPlan(planId: number, needId: number) {
    setPlanBusy(true);
    try {
      await api(`/api/v1/transport/plans/${planId}/needs/${needId}`, { method: "DELETE" });
      setMessage("Pedido retirado del plan.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible retirar el pedido del plan.");
    } finally {
      setPlanBusy(false);
    }
  }

  async function setPlanStatus(plan: Plan, nextStatus: "borrador" | "listo") {
    setPlanBusy(true);
    try {
      await api<Plan>(`/api/v1/transport/plans/${plan.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });
      setMessage(nextStatus === "listo" ? `Plan ${plan.code} listo para evaluar escenarios.` : `Plan ${plan.code} volvió a borrador.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible actualizar el plan.");
    } finally {
      setPlanBusy(false);
    }
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm(`¿Eliminar el plan ${plan.code}? Sus pedidos quedarán sin asignar.`)) return;
    setPlanBusy(true);
    try {
      await api(`/api/v1/transport/plans/${plan.id}`, { method: "DELETE" });
      setMessage(`Plan ${plan.code} eliminado.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible eliminar el plan.");
    } finally {
      setPlanBusy(false);
    }
  }

  function compatiblePlans(order: Order) {
    return plans.filter(
      (plan) => plan.status !== "confirmado" && (!order.origin_id || plan.origin_id === order.origin_id),
    );
  }

  async function loadExcelFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setMessage("Selecciona un archivo de Excel con extensión .xlsx.");
      return;
    }
    setReadingFile(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.getWorksheet("Pedidos") || workbook.worksheets[0];
      if (!sheet) throw new Error("El archivo no contiene una hoja de pedidos.");
      let headerRow = 0;
      let headers: string[] = [];
      for (let index = 1; index <= Math.min(sheet.rowCount, 20); index += 1) {
        const candidate = sheet.getRow(index).values as unknown[];
        const normalized = candidate.slice(1).map(normalizedHeader);
        if (requiredHeaders.every((header) => normalized.includes(header))) { headerRow = index; headers = normalized; break; }
      }
      if (!headerRow) throw new Error("No encontramos los encabezados obligatorios. Descarga la plantilla y conserva la fila de títulos.");
      const missing = requiredHeaders.filter((header) => !headers.includes(header));
      if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);
      const rows: string[][] = [];
      for (let index = headerRow + 1; index <= sheet.rowCount; index += 1) {
        const values = headers.map((_, column) => sheet.getRow(index).getCell(column + 1).value);
        if (!values.some((value) => String(value ?? "").trim())) continue;
        rows.push(values.map(csvCell));
      }
      if (!rows.length) throw new Error("La hoja Pedidos no contiene filas para cargar.");
      setCsv([headers.map(csvCell).join(","), ...rows.map((row) => row.join(","))].join("\n"));
      setFileName(file.name);
      setFileRows(rows.length);
      setResult(null);
      setMessage(`${file.name}: ${rows.length} pedido${rows.length === 1 ? "" : "s"} listo${rows.length === 1 ? "" : "s"} para validar.`);
    } catch (error) {
      setCsv("");
      setFileName("");
      setFileRows(0);
      setMessage(error instanceof Error ? error.message : "No fue posible leer el archivo de Excel.");
    } finally {
      setReadingFile(false);
    }
  }
  async function importExcel(dryRun: boolean) {
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
    if (!dryRun) {
      await load();
      if (response.created) {
        setCsv("");
        setFileName("");
        setFileRows(0);
        setResult(null);
        setShowExcelModal(false);
      }
    }
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
    <div className="space-y-4">
      {intake?.mode === "connected" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Conexión automática activa
          </span>
          <span className="text-neutral-600">{intake.sources.includes("commercial") ? "Gestión Comercial" : "Ventas"}{intake.sources.length > 1 ? " y Ventas envían" : " envía"} pedidos sin digitar.</span>
          {intake.reviewed !== undefined ? <span className="text-xs text-neutral-500">Revisados {intake.reviewed} · Nuevos {intake.created || 0} · Ya existentes {intake.existing || 0}</span> : null}
          <button className="ml-auto inline-flex h-8 items-center rounded-md bg-apex px-3 text-xs font-semibold text-white disabled:opacity-60" disabled={!canWrite || syncing} onClick={() => void syncOrders()} type="button">{syncing ? "Sincronizando…" : "Actualizar pedidos"}</button>
        </div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          {message}
        </div>
      ) : null}
      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-3">
            <Package className="text-apex" size={20} />
            <div>
              <h2 className="font-semibold">Monitor de pedidos</h2>
              <p className="text-xs text-neutral-500">
                {orders.length} pedido{orders.length === 1 ? "" : "s"} · {orders.filter((order) => order.status === "pendiente").length} pendiente{orders.filter((order) => order.status === "pendiente").length === 1 ? "" : "s"} · {orders.filter((order) => order.status === "planificada").length} en plan · {orders.filter((order) => order.status === "incompleta" || (order.validation_errors?.length ?? 0) > 0).length} por corregir
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => setShowExcelModal(true)} type="button">
              <FileSpreadsheet size={15} /> Subir Excel
            </button>
            {canWrite ? (
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={() => setShowPlanModal(true)} type="button">
                <Plus size={15} /> Nuevo plan
              </button>
            ) : null}
          </div>
        </div>
        {!orders.length ? <div className="p-6 text-center">
          <p className="font-semibold">Todavía no hay pedidos para transportar</p>
          <p className="mt-1 text-sm text-neutral-600">{intake?.mode === "connected" ? "Actualiza los pedidos de APEX OS o cárgalos con Excel." : "Carga tus pedidos con Excel para comenzar a consolidar."}</p>
          {canWrite ? <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold" onClick={() => setShowExcelModal(true)} type="button"><FileSpreadsheet size={15} /> Subir Excel</button>
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={() => setShowPlanModal(true)} type="button"><Plus size={15} /> Nuevo plan</button>
          </div> : null}
        </div> : null}
        <div className="max-h-[560px] space-y-2 overflow-auto p-3 md:hidden">
          {orders.map((order) => <article className="rounded-md border border-line p-3" key={order.id}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{order.code}</p><p className="text-xs text-neutral-500">{order.delivery_point?.name || "Destino por completar"} · {orderSource(order)}</p></div><span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold">{order.status}</span></div>
            <p className="mt-2 text-sm">{order.weight_kg} kg · {order.volume_m3} m³</p>
            <p className="text-xs text-neutral-500">Entrega: {new Date(order.due_at).toLocaleString()}</p>
            {order.plan ? <p className="mt-2"><span className="rounded-md bg-apex/10 px-2 py-1 text-xs font-semibold text-apex">En {order.plan.code}</span></p> : canWrite && order.status === "pendiente" && compatiblePlans(order).length ? (
              <select
                className="mt-2 w-full rounded-md border border-line px-2 py-1 text-xs"
                disabled={addingNeedId === order.id}
                onChange={(event) => {
                  const planId = Number(event.target.value);
                  if (planId) void addNeedToPlan(planId, order.id);
                  event.target.value = "";
                }}
                value=""
              >
                <option value="">Agregar a plan…</option>
                {compatiblePlans(order).map((plan) => <option key={plan.id} value={plan.id}>{plan.code} · {plan.name}</option>)}
              </select>
            ) : null}
            {order.validation_errors?.length ? <p className="mt-2 text-xs font-semibold text-rose-700">Debes completar: {missingData(order)}</p> : null}
          </article>)}
        </div>
        <div className="hidden max-h-[560px] overflow-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Orden</th>
                <th className="p-3">Destino</th>
                <th className="p-3">Carga</th>
                <th className="p-3">Vence</th>
                <th className="p-3">Plan</th>
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
                    {order.plan ? (
                      <span className="rounded-md bg-apex/10 px-2 py-1 text-xs font-semibold text-apex">En {order.plan.code}</span>
                    ) : canWrite && order.status === "pendiente" ? (
                      <span className="flex items-center gap-1">
                        <select
                          className="rounded-md border border-line px-2 py-1 text-xs"
                          disabled={addingNeedId === order.id}
                          onChange={(event) => {
                            const planId = Number(event.target.value);
                            if (planId) void addNeedToPlan(planId, order.id);
                            event.target.value = "";
                          }}
                          value=""
                        >
                          <option value="">Agregar a plan…</option>
                          {compatiblePlans(order).map((plan) => <option key={plan.id} value={plan.id}>{plan.code} · {plan.name}</option>)}
                        </select>
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
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
      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-apex">Consolidación de rutas</p>
            <h2 className="font-semibold">Planes de despacho</h2>
            <p className="mt-1 text-sm text-neutral-600">Agrupa pedidos en planes; cada plan pasa al paso 2 donde se evalúan sus escenarios de ruta.</p>
          </div>
          {canWrite ? (
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-apex px-3 text-sm font-semibold text-apex" onClick={() => setShowPlanModal(true)} type="button">
              <Plus size={15} /> Nuevo plan
            </button>
          ) : null}
        </div>
        {!plans.length ? (
          <div className="mt-4 rounded-md border border-dashed border-line p-4 text-center">
            <p className="font-semibold">Todavía no hay planes de despacho</p>
            <p className="mt-1 text-sm text-neutral-600">Crea el primer plan y agrega los pedidos pendientes que quieras despachar juntos.</p>
            {canWrite ? <button className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={() => setShowPlanModal(true)} type="button"><Plus size={15} /> Crear el primer plan</button> : null}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {plans.map((plan) => (
              <article className="rounded-md border border-line p-4" key={plan.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{plan.name} <span className="text-xs font-normal text-neutral-500">{plan.code}</span></p>
                    <p className="text-xs text-neutral-500">{plan.origin?.name || "Origen"} · {plan.origin?.city || ""}{plan.due_date ? ` · Vence ${new Date(plan.due_date).toLocaleDateString()}` : ""}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${plan.status === "confirmado" ? "bg-emerald-100 text-emerald-800" : plan.status === "listo" ? "bg-apex/10 text-apex" : "bg-paper text-neutral-600"}`}>{planStatusLabels[plan.status] || plan.status}</span>
                </div>
                <p className="mt-2 text-sm text-neutral-600">{plan.stop_count} parada{plan.stop_count === 1 ? "" : "s"} · {plan.total_weight_kg} kg · {plan.total_volume_m3} m³ · {plan.total_pallets} pallet{plan.total_pallets === 1 ? "" : "s"}</p>
                {plan.needs.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plan.needs.map((need) => (
                      <span className="inline-flex items-center gap-1 rounded-md bg-paper px-2 py-1 text-xs font-semibold" key={need.id}>
                        {need.code}
                        {canWrite && plan.status !== "confirmado" ? (
                          <button aria-label={`Retirar ${need.code} del plan`} disabled={planBusy} onClick={() => void removeNeedFromPlan(plan.id, need.id)} type="button">
                            <X size={12} />
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : <p className="mt-3 text-xs text-neutral-500">Sin pedidos. Agrega pedidos pendientes desde el monitor de arriba.</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {plan.status === "listo" ? (
                    <a className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" href={`/dashboard/transporte/planeacion?plan=${plan.id}`}>
                      Evaluar escenarios <ArrowRight size={14} />
                    </a>
                  ) : null}
                  {canWrite && plan.status !== "confirmado" ? (
                    plan.status === "borrador" ? (
                      <button className="rounded-md border border-apex px-3 py-2 text-xs font-semibold text-apex disabled:opacity-60" disabled={planBusy || !plan.needs.length} onClick={() => void setPlanStatus(plan, "listo")}>
                        Marcar listo para evaluar
                      </button>
                    ) : (
                      <button className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-neutral-600 disabled:opacity-60" disabled={planBusy} onClick={() => void setPlanStatus(plan, "borrador")}>
                        Volver a borrador
                      </button>
                    )
                  ) : null}
                  {canWrite && plan.status !== "confirmado" ? (
                    <button className="rounded-md px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60" disabled={planBusy} onClick={() => void deletePlan(plan)}>
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {showPlanModal ? (
        <ModalFrame title="Nuevo plan de despacho" onClose={() => setShowPlanModal(false)} maxWidth="md:max-w-xl">
          <form className="space-y-4" onSubmit={(event) => void createPlan(event)}>
            <p className="text-sm text-neutral-600">Agrupa pedidos que salen del mismo origen para evaluarlos juntos en el paso 2.</p>
            <Field label="Nombre del plan" required>
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" onChange={(event) => setPlanForm((form) => ({ ...form, name: event.target.value }))} placeholder="Ej. Plan 1" required value={planForm.name} />
            </Field>
            <Field label="Origen" required>
              <select className="h-10 w-full rounded-md border border-line px-3 text-sm" onChange={(event) => setPlanForm((form) => ({ ...form, origin_id: event.target.value }))} required value={planForm.origin_id}>
                <option value="">Selecciona un origen</option>
                {origins.map((origin) => <option key={origin.id} value={origin.id}>{origin.name} ({origin.city})</option>)}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nivel de servicio">
                <input className="h-10 w-full rounded-md border border-line px-3 text-sm" onChange={(event) => setPlanForm((form) => ({ ...form, service_level: event.target.value }))} placeholder="normal" value={planForm.service_level} />
              </Field>
              <Field label="Fecha de entrega">
                <input className="h-10 w-full rounded-md border border-line px-3 text-sm" onChange={(event) => setPlanForm((form) => ({ ...form, due_date: event.target.value }))} type="date" value={planForm.due_date} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setShowPlanModal(false)} type="button">Cancelar</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={planBusy || !planForm.origin_id}>
                <Plus size={16} /> {planBusy ? "Creando…" : "Crear plan"}
              </button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
      {showExcelModal ? (
        <ModalFrame title="Cargar pedidos con Excel" onClose={() => setShowExcelModal(false)} maxWidth="md:max-w-3xl">
          <p className="text-sm text-neutral-600">Sigue estos tres pasos. No necesitas copiar datos ni conocer formatos técnicos.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-md border border-line p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex"><Download size={17} /></span><h3 className="mt-3 font-semibold">1. Descarga la plantilla</h3><p className="mt-1 text-sm text-neutral-600">Incluye ejemplos, listas y una hoja con la explicación de cada campo.</p><a className="mt-3 inline-flex h-10 items-center rounded-md border border-apex px-4 text-sm font-semibold text-apex" download href="/plantillas/Plantilla_Pedidos_Transporte.xlsx">Descargar plantilla Excel</a></article>
            <article className="rounded-md border border-line p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex"><FileSpreadsheet size={17} /></span><h3 className="mt-3 font-semibold">2. Diligencia los pedidos</h3><p className="mt-1 text-sm text-neutral-600">Una fila es un pedido. Las columnas verdes son obligatorias y las amarillas son opcionales.</p><details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-apex">Ver campos y ejemplos</summary><div className="mt-2 space-y-2 text-neutral-600"><p><strong>Obligatorios:</strong> pedido, origen, destino, fechas, peso y volumen.</p><p><strong>Opcionales:</strong> prioridad, servicio, referencia, pallets, paquetes, valor, moneda y vehículo.</p><p>Puedes agregar columnas propias; APEX OS las conservará como datos personalizados del pedido.</p></div></details></article>
            <article className="rounded-md border border-line p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex"><Upload size={17} /></span><h3 className="mt-3 font-semibold">3. Selecciona y valida</h3><p className="mt-1 text-sm text-neutral-600">Revisaremos todas las filas antes de agregar pedidos a Transporte.</p><label className="mt-3 inline-flex h-10 cursor-pointer items-center rounded-md bg-apex px-4 text-sm font-semibold text-white">{readingFile ? "Leyendo archivo…" : "Seleccionar Excel"}<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={readingFile || !canWrite} onChange={(event) => void loadExcelFile(event)} type="file" /></label></article>
          </div>
          {fileName ? <div className="mt-4 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"><CheckCircle2 className="text-emerald-700" size={20} /><div><p className="font-semibold">{fileName}</p><p className="text-sm text-neutral-600">{fileRows} pedido{fileRows === 1 ? "" : "s"} encontrado{fileRows === 1 ? "" : "s"}. Valida el archivo para continuar.</p></div></div> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button className="rounded-md border border-line px-4 py-2 text-sm font-semibold" onClick={() => setShowExcelModal(false)} type="button">Cerrar</button>
            <button
              className="rounded-md border border-apex px-4 py-2 text-sm font-semibold text-apex"
              disabled={!canWrite || !csv || readingFile}
              onClick={() => void importExcel(true)}
            >
              Validar archivo
            </button>
            <button
              className="rounded-md bg-apex px-4 py-2 text-sm font-semibold text-white"
              disabled={!canWrite || !csv || result?.status !== "validated"}
              onClick={() => void importExcel(false)}
            >
              Agregar a Transporte
            </button>
          </div>
          {result?.errors?.length ? (
            <pre className="mt-3 overflow-auto rounded-md bg-paper p-3 text-xs">
              {result.errors.map((error) => `Fila ${String(error.row || "")}: revisa ${[...(Array.isArray(error.missing) ? error.missing : []), ...(error.origin_code ? ["origen"] : []), ...(error.delivery_point_code ? ["destino"] : [])].join(", ")}.`).join("\n")}
            </pre>
          ) : null}
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}{required ? " *" : ""}</span>
      {children}
    </label>
  );
}
