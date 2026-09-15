"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useState } from "react";

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
        <div><p className="text-xs font-semibold uppercase text-apex">{intake?.mode === "standalone" ? "Empieza aquí" : "Pedidos externos"}</p><h2 className="font-semibold">Cargar pedidos con Excel</h2><p className="mt-1 text-sm text-neutral-600">Sigue estos tres pasos. No necesitas copiar datos ni conocer formatos técnicos.</p></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-md border border-line p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex"><Download size={17} /></span><h3 className="mt-3 font-semibold">1. Descarga la plantilla</h3><p className="mt-1 text-sm text-neutral-600">Incluye ejemplos, listas y una hoja con la explicación de cada campo.</p><a className="mt-3 inline-flex h-10 items-center rounded-md border border-apex px-4 text-sm font-semibold text-apex" download href="/plantillas/Plantilla_Pedidos_Transporte.xlsx">Descargar plantilla Excel</a></article>
          <article className="rounded-md border border-line p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex"><FileSpreadsheet size={17} /></span><h3 className="mt-3 font-semibold">2. Diligencia los pedidos</h3><p className="mt-1 text-sm text-neutral-600">Una fila es un pedido. Las columnas verdes son obligatorias y las amarillas son opcionales.</p><details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-apex">Ver campos y ejemplos</summary><div className="mt-2 space-y-2 text-neutral-600"><p><strong>Obligatorios:</strong> pedido, origen, destino, fechas, peso y volumen.</p><p><strong>Opcionales:</strong> prioridad, servicio, referencia, pallets, paquetes, valor, moneda y vehículo.</p><p>Puedes agregar columnas propias; APEX OS las conservará como datos personalizados del pedido.</p></div></details></article>
          <article className="rounded-md border border-line p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex"><Upload size={17} /></span><h3 className="mt-3 font-semibold">3. Selecciona y valida</h3><p className="mt-1 text-sm text-neutral-600">Revisaremos todas las filas antes de agregar pedidos a Transporte.</p><label className="mt-3 inline-flex h-10 cursor-pointer items-center rounded-md bg-apex px-4 text-sm font-semibold text-white">{readingFile ? "Leyendo archivo…" : "Seleccionar Excel"}<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={readingFile || !canWrite} onChange={(event) => void loadExcelFile(event)} type="file" /></label></article>
        </div>
        {fileName ? <div className="mt-4 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"><CheckCircle2 className="text-emerald-700" size={20} /><div><p className="font-semibold">{fileName}</p><p className="text-sm text-neutral-600">{fileRows} pedido{fileRows === 1 ? "" : "s"} encontrado{fileRows === 1 ? "" : "s"}. Valida el archivo para continuar.</p></div></div> : null}
        <div className="mt-4 flex flex-wrap gap-2">
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
