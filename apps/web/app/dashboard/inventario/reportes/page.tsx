"use client";
import { InventorySearchSelect } from "@/components/inventory-ui";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InventoryPagination } from "@/components/inventory-ui";
import { Download, Search } from "lucide-react";
import { InventoryNav } from "@/components/inventory-nav";
import { api } from "@/lib/api";
import { downloadExcelWorkbook } from "@/lib/reportExports";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Item = {
  id: number;
  code: string;
  legacy_code?: string | null;
  name: string;
  unit: string;
  stock_current: number;
  unit_cost: number;
};
type KardexRow = {
  id: number;
  created_at: string;
  type: string;
  item_code: string;
  item_name: string;
  in_qty: number;
  out_qty: number;
  balance: number;
  unit_cost: number;
  value: number;
  document_type: string;
  document_id?: number | null;
  document_number: string;
  accounting_document_id?: number | null;
  accounting_document_number?: string;
  reason: string;
  warehouse: string;
  from_warehouse: string;
  to_warehouse: string;
};
type KardexResponse = {
  item: Item;
  data: KardexRow[];
  total: number;
  current_stock: number;
  current_average_cost: number;
};
type CostRow = {
  id: number;
  code: string;
  legacy_code?: string | null;
  name: string;
  family_code: string;
  family_name: string;
  unit: string;
  stock_current: number;
  society_code: string;
  physical_stock: number;
  transit_stock: number;
  available_stock: number;
  average_cost: number;
  last_unit_cost: number;
  value_balance: number;
  last_cost_date?: string | null;
  last_source_type: string;
  warehouses: string[];
  warehouse_rows: Array<{
    location_id: number;
    warehouse_id: number;
    warehouse_code: string;
    warehouse_name: string;
    location_code: string;
    type: string;
    qty: number;
  }>;
};
type CostsResponse = {
  data: CostRow[];
  total: number;
  totals: { stock_units: number; inventory_value: number };
};
type TransferDetail = {
  origin?: { name?: string };
  destination?: { name?: string };
  lines?: Array<{ id: number; qty: number; item?: { code?: string; name?: string } }>;
};
type Warehouse = { id: number; code: string; name: string };
type AccountingDetail = { full_number?: string; document_type?: string; posting_date?: string; reference?: string; header_text?: string; created_by_name?: string; lines?: Array<{ id: number; account_code: string; description?: string; debit: number; credit: number; party_tax_id?: string }> };

function money(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function dateTime(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function movementLabel(type: string) {
  const labels: Record<string, string> = {
    in: "Entrada",
    out: "Salida",
    transfer: "Transferencia",
    transfer_dispatch: "Traslado",
    transfer_receive: "Descarga de tránsito",
    adjustment: "Ajuste",
  };
  return labels[type] || type;
}

function documentLabel(type: string) {
  const labels: Record<string, string> = {
    warehouse_transfer: "Traslado entre bodegas",
    purchase_order_receipt: "Recepción de orden de compra",
    purchase_return: "Devolución de compra",
    purchase_invoice: "Factura de compra",
    sales_invoice: "Factura de venta",
    movement: "Movimiento de inventario",
  };
  return labels[type] || type || "Movimiento de inventario";
}

export default function ReportesInventarioPage(){return <InventoryReports/>}

export function InventoryReports({mode="all"}:{mode?:"all"|"kardex"|"costs"}) {
  const [reportTab, setReportTab] = useState<"kardex" | "costs">(mode === "costs" ? "costs" : "kardex");
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedSku, setSelectedSku] = useState("");
  const [skuError, setSkuError] = useState("");
  const [skuPickerOpen, setSkuPickerOpen] = useState(false);
  const [skuPickerSearch, setSkuPickerSearch] = useState("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date()).slice(0, 7) + "-01");
  const [toDate, setToDate] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date()));
  const [costPage, setCostPage] = useState(1), [kardexPage, setKardexPage] = useState(1), [costState, setCostState] = useState("");
  const kardexSequence = useRef(0), costSequence = useRef(0);
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const [kardex, setKardex] = useState<KardexResponse | null>(null);
  const [costs, setCosts] = useState<CostsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [costLoading, setCostLoading] = useState(true);
  const [stockDetail, setStockDetail] = useState<CostRow | null>(null);
  const [movementDetail, setMovementDetail] = useState<KardexRow | null>(null);
  const [transferDetail, setTransferDetail] = useState<TransferDetail | null>(null);
  const [accountingDetail, setAccountingDetail] = useState<AccountingDetail | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const showKardex=reportTab==="kardex",showCosts=reportTab==="costs";

  async function loadBase() {
    const [itemRows, warehouseRows] = await Promise.all([
      api<{ data: Item[] }>("/api/v1/inventory/items?all=true&sort_by=code"),
      api<Warehouse[]>("/api/v1/inventory/warehouses"),
    ]);
    setItems(itemRows.data || []);
    setWarehouses(warehouseRows || []);
  }

  const loadKardex = useCallback(
    async (itemId: string) => {
      if (!itemId) return;
      const sequence = ++kardexSequence.current;
      if (fromDate && toDate && fromDate > toDate) { setKardex(null); setError("La fecha inicial no puede ser posterior a la final."); setLoading(false); return; }
      setLoading(true);
      setKardex(null);
      setError("");
      try {
        const params = new URLSearchParams({ limit: "300" });
        if (fromDate) params.set("from_date", new Date(fromDate + "T00:00:00").toISOString());
        if (toDate) params.set("to_date", new Date(toDate + "T23:59:59.999").toISOString());
        if (warehouseId) params.set("warehouse_id", warehouseId);
        const response = await api<KardexResponse>(
            `/api/v1/inventory/kardex/${itemId}?${params.toString()}`,
          );
        if (sequence === kardexSequence.current) { setKardex(response); setKardexPage(1); }
      } catch (err) {
        if (sequence !== kardexSequence.current) return;
        setError(
          err instanceof Error ? err.message : "No se pudo cargar el kardex",
        );
      } finally {
        if (sequence === kardexSequence.current) setLoading(false);
      }
    },
    [fromDate, toDate, warehouseId],
  );

  useEffect(() => {
    loadBase().catch((err) =>
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar reportes",
      ),
    );
  }, []);

  useEffect(() => {
    if (selectedItemId) void loadKardex(selectedItemId);
    else { kardexSequence.current += 1; setKardex(null); setLoading(false); }
  }, [loadKardex, selectedItemId]);

  useEffect(() => {
    const params = new URLSearchParams({ all: "true" });
    if (warehouseId) params.set("warehouse_id", warehouseId);
    const sequence = ++costSequence.current;
    setCostLoading(true); setCosts(null);
    api<CostsResponse>(`/api/v1/inventory/costs?${params}`).then(rows => { if (sequence === costSequence.current) { setCosts(rows); setCostPage(1); } }).catch((err) => { if (sequence === costSequence.current) setError(err instanceof Error ? err.message : "No se pudo filtrar por bodega"); }).finally(() => { if (sequence === costSequence.current) setCostLoading(false); });
  }, [warehouseId]);

  const filteredCosts = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (costs?.data || []).filter(
      (item) =>
        (!costState || (costState === "stock" ? (warehouseId ? item.physical_stock + item.transit_stock : item.stock_current) > 0 : costState === "transit" ? item.transit_stock > 0 : (warehouseId ? item.physical_stock + item.transit_stock : item.stock_current) <= 0)) && (!text ||
        [item.code, item.legacy_code || "", item.name, item.family_code, item.family_name].some(
          (value) => value.toLowerCase().includes(text),
        )),
    );
  }, [costs, query, costState, warehouseId]);
  const currentCostPage = Math.min(costPage, Math.max(1, Math.ceil(filteredCosts.length / 25)));
  const currentKardexPage = Math.min(kardexPage, Math.max(1, Math.ceil((kardex?.data.length || 0) / 25)));
  useEffect(() => { setCostPage(1); }, [query, costState]);
  const skuPickerResults = useMemo(() => {
    const needle = skuPickerSearch.trim().toLowerCase();
    return items.filter((item) => !needle || item.code.toLowerCase().includes(needle) || (item.legacy_code || "").toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle)).slice(0, 100);
  }, [items, skuPickerSearch]);

  const selectedCost =
    filteredCosts.find((item) => String(item.id) === selectedItemId) ||
    costs?.data.find((item) => String(item.id) === selectedItemId);

  function selectSku(item: Item) {
    setSelectedItemId(String(item.id));
    setSelectedSku(item.code);
    setSkuError("");
    setSkuPickerOpen(false);
    setSkuPickerSearch("");
  }

  function validateSku() {
    const code = selectedSku.trim().toUpperCase();
    if (!code) {
      setSelectedItemId("");
      setSkuError("");
      setSkuPickerSearch("");
      setSkuPickerOpen(true);
      return;
    }
    const item = items.find((row) => row.code.toUpperCase() === code || (row.legacy_code || "").toUpperCase() === code);
    if (!item) {
      setSelectedItemId("");
      setSkuError(`El SKU ${code} no existe o está inactivo.`);
      return;
    }
    selectSku(item);
  }

  async function openMovement(row: KardexRow) {
    setMovementDetail(row);
    setTransferDetail(null);
    setAccountingDetail(null);
    if (row.document_type === "warehouse_transfer" && row.document_id) {
      try {
        setTransferDetail(
          await api("/api/v1/inventory/transfers/" + row.document_id),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo cargar el documento",
        );
      }
    }
    if (row.accounting_document_id) {
      try {
        setAccountingDetail(await api<AccountingDetail>(`/api/v1/accounting/documents/${row.accounting_document_id}`));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el asiento contable");
      }
    }
  }

  function exportKardex() {
    downloadExcelWorkbook(`kardex-${kardex?.item.code || "producto"}.xls`, [{ name: "Kardex", columns: [
      { key: "fecha", label: "Fecha" }, { key: "tipo", label: "Tipo" }, { key: "documento", label: "Documento" }, { key: "contabilidad", label: "Documento contable" }, { key: "sku", label: "SKU" }, { key: "codigo_anterior", label: "Código anterior" }, { key: "producto", label: "Producto" }, { key: "bodega", label: "Bodega" }, { key: "entrada", label: "Entrada" }, { key: "salida", label: "Salida" }, { key: "saldo", label: "Variación acumulada" }, { key: "costo", label: "Costo" }, { key: "valor", label: "Valor" }
    ], rows: (kardex?.data || []).map((row) => ({ fecha: dateTime(row.created_at), tipo: movementLabel(row.type), documento: row.document_number, contabilidad: row.accounting_document_number, sku: row.item_code, codigo_anterior: kardex?.item.legacy_code || "", producto: row.item_name, bodega: row.warehouse, entrada: row.in_qty, salida: row.out_qty, saldo: row.balance, costo: row.unit_cost, valor: row.value })) }]);
  }

  function exportCosts() {
    const rows = filteredCosts.flatMap((item) => (item.warehouse_rows.length ? item.warehouse_rows : [{ warehouse_code: "--", warehouse_name: "Sin bodega", location_code: "", type: "warehouse", qty: 0 }]).map((warehouse) => ({ sku: item.code, codigo_anterior: item.legacy_code || "", producto: item.name, familia: item.family_name, sociedad: item.society_code, bodega: warehouse.type === "transit" ? "Transito" : `${warehouse.warehouse_code} - ${warehouse.warehouse_name}`, ubicacion: warehouse.location_code, cantidad: warehouse.qty, costo_promedio: item.average_cost, ultimo_costo: item.last_unit_cost, valor: warehouse.qty * item.average_cost })));
    downloadExcelWorkbook("inventario-costos.xls", [{ name: "Costos por bodega", columns: [
      { key: "sku", label: "SKU" }, { key: "codigo_anterior", label: "Código anterior" }, { key: "producto", label: "Producto" }, { key: "familia", label: "Familia" }, { key: "sociedad", label: "Sociedad" }, { key: "bodega", label: "Bodega" }, { key: "ubicacion", label: "Ubicacion" }, { key: "cantidad", label: "Cantidad" }, { key: "costo_promedio", label: "Costo promedio" }, { key: "ultimo_costo", label: "Ultimo costo" }, { key: "valor", label: "Valor" }
    ], rows }]);
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario - Reportes</p>
        <h1 className="text-3xl font-semibold">{mode==="kardex"?"Kardex de inventario":mode==="costs"?"Costos de inventario":"Kardex y costos"}</h1>
        <p className="mt-1 text-sm text-content-body">
          Consulta movimientos por producto y el costo promedio actual del SKU.
        </p>
      </header>
      <InventoryNav />
      {mode === "all" ? <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface p-3" aria-label="Elegir reporte">{[{ id: "kardex" as const, title: "Movimientos · Kardex" }, { id: "costs" as const, title: "Costos y valorización" }].map(row => <button key={row.id} type="button" aria-pressed={reportTab === row.id} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${reportTab === row.id ? "bg-apex text-white" : "border border-line text-content-body"}`} onClick={() => setReportTab(row.id)}>{row.title}</button>)}</div> : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-md border border-line bg-surface p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_160px_160px_auto]">
          <label className={`text-sm ${showKardex?"":"hidden"}`}>
            Producto
            <div className="mt-1 flex"><input className={`h-10 min-w-0 flex-1 rounded-l-md border px-3 font-mono text-sm ${skuError ? "border-red-400" : "border-line"}`} placeholder="Escribe el SKU" value={selectedSku} onBlur={validateSku} onChange={(event) => { setSelectedSku(event.target.value.toUpperCase()); setSelectedItemId(""); setSkuError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); validateSku(); } }} /><button aria-label="Buscar producto" className="h-10 w-10 rounded-r-md border border-l-0 border-line text-apex hover:bg-paper" onClick={() => { setSkuPickerSearch(selectedSku); setSkuPickerOpen(true); }} type="button"><Search className="mx-auto" size={16} /></button></div>
            {skuError ? <span className="mt-1 block text-xs text-red-600">{skuError}</span> : null}
          </label>
          <label className="text-sm">Bodega<InventorySearchSelect className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">Todas las bodegas</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name}</option>)}</InventorySearchSelect></label>
          <label className={`text-sm ${showKardex?"":"hidden"}`}>
            Desde
            <input
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${showKardex?"":"hidden"}`}>
            Hasta
            <input
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <button
            className={`mt-6 h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60 ${showKardex?"inline-flex":"hidden"}`}
            disabled={loading || !selectedItemId || invalidRange}
            onClick={() => loadKardex(selectedItemId)}
            type="button"
          >
            <Search size={16} /> Consultar
          </button>
        </div>
        {showKardex ? <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><button className="min-h-10 rounded-lg border border-line px-3" type="button" onClick={() => { const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date()); setFromDate(today.slice(0, 7) + "-01"); setToDate(today); }}>Mes actual</button><button className="min-h-10 rounded-lg border border-line px-3" type="button" onClick={() => { setFromDate(""); setToDate(""); }}>Consultar histórico</button><span className="text-content-muted">{fromDate || toDate ? `Movimientos: ${fromDate || "inicio"} a ${toDate || "hoy"}` : "Movimientos históricos"}. Los costos y existencias corresponden al saldo actual.</span>{invalidRange ? <p role="alert" className="text-rose-700">La fecha inicial no puede ser posterior a la final.</p> : null}</div> : <p className="mt-3 text-sm text-content-muted">Valorización actual por producto y bodega. Use la búsqueda o las etiquetas para resumir el resultado.</p>}
      </section>

      {skuPickerOpen ? <ModalFrame maxWidth="md:!max-w-3xl" onClose={() => { setSkuPickerOpen(false); setSkuPickerSearch(""); }} title="Seleccionar producto">
        <div className="space-y-4"><label className="relative block"><Search className="absolute left-3 top-3 text-content-muted" size={16} /><input autoFocus className="h-10 w-full rounded-md border border-line pl-10 pr-3 text-sm" placeholder="Buscar por SKU, código anterior o nombre" value={skuPickerSearch} onChange={(event) => setSkuPickerSearch(event.target.value)} /></label><div className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-md border border-line">{skuPickerResults.map((item) => <button className="flex w-full items-center justify-between gap-4 p-3 text-left text-sm hover:bg-paper" key={item.id} onClick={() => selectSku(item)} type="button"><span><strong className="font-mono">{item.code}</strong>{item.legacy_code ? <span className="ml-2 font-mono text-content-muted">Anterior: {item.legacy_code}</span> : null}<span className="ml-2">{item.name}</span></span><span className="text-xs text-content-muted">{item.unit || "UND"}</span></button>)}{!skuPickerResults.length ? <p className="p-6 text-center text-sm text-content-muted">No hay SKU que coincidan con la búsqueda.</p> : null}</div></div>
      </ModalFrame> : null}

      <section className={`grid gap-3 md:grid-cols-4 ${showKardex?"":"hidden"}`}>
        <Metric
          label="Stock actual"
          value={String(
            kardex?.current_stock ?? selectedCost?.stock_current ?? 0,
          )}
        />
        <Metric
          label="Costo promedio"
          value={money(
            kardex?.current_average_cost ?? selectedCost?.average_cost ?? 0,
          )}
        />
        <Metric
          label="Valor inventario SKU"
          value={money(
            (kardex?.current_stock ?? selectedCost?.stock_current ?? 0) *
              (kardex?.current_average_cost ?? selectedCost?.average_cost ?? 0),
          )}
        />
        <Metric label="Movimientos" value={String(kardex?.total ?? 0)} />
      </section>

      <section className={`rounded-md border border-line bg-surface ${showKardex?"":"hidden"}`}>
        <div className="flex items-center justify-between border-b border-line p-4">
          <div>
          <h2 className="text-base font-semibold">Kardex del producto</h2>
          <p className="text-sm text-content-muted">
            Entradas y salidas del rango consultado. El acumulado representa su variación; las existencias actuales se muestran en el resumen superior.
          </p>
          </div>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm" onClick={exportKardex} type="button"><Download size={15} /> Excel</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs uppercase text-content-muted">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Bodega</th>
                <th className="px-3 py-2 text-right">Entrada</th>
                <th className="px-3 py-2 text-right">Salida</th>
                <th className="px-3 py-2 text-right">Variación acumulada</th>
                <th className="px-3 py-2 text-right">Costo</th>
                <th className="px-3 py-2 text-right">Valor mov.</th>
              </tr>
            </thead>
            <tbody>
              {(kardex?.data || []).slice((currentKardexPage - 1) * 25, currentKardexPage * 25).map((row) => (
                <tr
                  className="border-b border-line/70 last:border-0"
                  key={row.id}
                >
                  <td className="px-3 py-2">{dateTime(row.created_at)}</td>
                  <td className="px-3 py-2">{movementLabel(row.type)}</td>
                  <td className="px-3 py-2">
                    <button
                      className="font-mono text-xs text-apex hover:underline"
                      onClick={() => void openMovement(row)}
                      title="Ver detalle del documento"
                      type="button"
                    >
                      {row.document_number ||
                        documentLabel(row.document_type) ||
                        row.reason ||
                        "--"}
                    </button>
                    {row.accounting_document_number ? <span className="mt-1 block font-mono text-[11px] text-content-muted">Contabilidad: {row.accounting_document_number}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="text-left hover:text-apex hover:underline"
                      onClick={() => {
                        const cost = costs?.data.find(
                          (item) => item.code === row.item_code,
                        );
                        if (cost) setStockDetail(cost);
                      }}
                      title="Ver existencias por bodega"
                      type="button"
                    >
                      <span className="font-mono text-xs">{row.item_code}</span>{" "}
                      {row.item_name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {row.warehouse ||
                      row.from_warehouse ||
                      row.to_warehouse ||
                      "--"}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-700">
                    {row.in_qty || ""}
                  </td>
                  <td className="px-3 py-2 text-right text-rose-700">
                    {row.out_qty || ""}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {row.balance}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {money(row.unit_cost)}
                  </td>
                  <td className="px-3 py-2 text-right">{money(row.value)}</td>
                </tr>
              ))}
              {!kardex?.data?.length ? (
                <tr>
                  <td className="px-3 py-6 text-content-muted" colSpan={10}>
                    No hay movimientos para este producto.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {showKardex && kardex ? <div className="rounded-lg border border-line bg-surface"><InventoryPagination page={currentKardexPage} total={kardex.data.length} onChange={setKardexPage} label="Páginas del Kardex" />{kardex.total > kardex.data.length ? <p role="status" className="px-3 pb-3 text-sm text-content-muted">Se cargaron {kardex.data.length} de {kardex.total} movimientos. Reduzca el rango para consultar y exportar un resultado completo.</p> : null}</div> : null}
      <section className={`rounded-md border border-line bg-surface ${showCosts?"":"hidden"}`}>
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">Costos y valorización</h2>
            <p className="text-sm text-content-muted">
              Costo promedio actual, último costo y valor de inventario por SKU.
            </p>
          </div>
          <div className="flex gap-2"><input
            className="h-10 rounded-md border border-line px-3 text-sm md:w-80"
            placeholder="Buscar SKU, familia o producto"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          /><button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm" onClick={exportCosts} type="button"><Download size={15} /> Excel</button></div>
        </div>
        <div className="space-y-3 border-b border-line p-4"><div className="flex flex-wrap gap-2" aria-label="Filtrar valorización">{[{ id: "", label: "Todos" }, { id: "stock", label: "Con existencias" }, { id: "empty", label: "Sin existencias" }, { id: "transit", label: "En tránsito" }].map(row => <button key={row.id} type="button" aria-pressed={costState === row.id} className={`min-h-10 rounded-full border px-3 text-sm ${costState === row.id ? "border-apex bg-apex text-white" : "border-line bg-surface"}`} onClick={() => setCostState(row.id)}>{row.label}</button>)}</div><p role="status" className="text-sm text-content-muted">{filteredCosts.length} productos · Valor actual del resultado: {money(filteredCosts.reduce((sum, row) => sum + (row.warehouse_rows || []).reduce((subtotal, warehouse) => subtotal + Number(warehouse.qty) * Number(row.average_cost), 0), 0))}. Excel incluye todos los productos filtrados, no solo esta página.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs uppercase text-content-muted">
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Familia</th>
                <th className="px-3 py-2">Sociedad</th>
                <th className="px-3 py-2">Bodegas</th>
                <th className="px-3 py-2 text-right">Fisico</th>
                <th className="px-3 py-2 text-right">Transito</th>
                <th className="px-3 py-2 text-right">Costo promedio</th>
                <th className="px-3 py-2 text-right">Ultimo costo</th>
                <th className="px-3 py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filteredCosts.slice((currentCostPage - 1) * 25, currentCostPage * 25).flatMap((row) =>
                (row.warehouse_rows?.length
                  ? row.warehouse_rows
                  : [
                      {
                        location_id: 0,
                        warehouse_id: 0,
                        warehouse_code: "--",
                        warehouse_name: "Sin bodega",
                        location_code: "",
                        type: "warehouse",
                        qty: 0,
                      },
                    ]
                ).map((warehouse) => (
                  <tr
                    className="border-b border-line/70 last:border-0 hover:bg-paper/70"
                    key={row.id + "-" + warehouse.location_id}
                  >
                    <td className="px-3 py-2">
                      <button
                        className="font-mono text-xs text-apex hover:underline"
                        onClick={() => setStockDetail(row)}
                        title="Ver existencias por bodega"
                        type="button"
                      >
                        {row.code}
                      </button>
                    </td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">
                      {row.family_code
                        ? `${row.family_code} - ${row.family_name}`
                        : "--"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.society_code || "--"}
                    </td>
                    <td className="px-3 py-2">
                      {warehouse.type === "transit"
                        ? "Tránsito"
                        : warehouse.warehouse_code +
                          " - " +
                          warehouse.warehouse_name}{" "}
                      {warehouse.location_code
                        ? "/ " + warehouse.location_code
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {warehouse.type === "warehouse" ? warehouse.qty : 0}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-700">
                      {warehouse.type === "transit" ? warehouse.qty : 0}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {money(row.average_cost)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {money(row.last_unit_cost)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {money(warehouse.qty * row.average_cost)}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
      {showCosts ? <div className="rounded-lg border border-line bg-surface"><InventoryPagination page={currentCostPage} total={filteredCosts.length} onChange={setCostPage} label="Páginas de costos" /></div> : null}
      {showCosts && costLoading ? <p role="status" className="text-sm text-content-muted">Cargando valorización…</p> : null}
      {showCosts && !costLoading && !filteredCosts.length ? <p role="status" className="text-sm text-content-muted">No hay productos que coincidan con los filtros de costos.</p> : null}
      {showCosts && costs && costs.total > costs.data.length ? <p role="status" className="text-sm text-content-muted">Consulta parcial: {costs.data.length} de {costs.total} productos cargados. La búsqueda y Excel incluyen solo este conjunto.</p> : null}
      {stockDetail ? (
        <ModalFrame title={`Existencias · ${stockDetail.code} · ${stockDetail.name}`} onClose={() => setStockDetail(null)} maxWidth="md:!max-w-4xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left">
                  <th className="px-4 py-2">Bodega</th>
                  <th className="px-4 py-2">Ubicación</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {stockDetail.warehouse_rows.map((row) => (
                  <tr className="border-b border-line/70" key={row.location_id}>
                    <td className="px-4 py-2">
                      {row.warehouse_code} - {row.warehouse_name}
                    </td>
                    <td className="px-4 py-2">{row.location_code || "--"}</td>
                    <td className="px-4 py-2">
                      {row.type === "transit" ? "En tránsito" : "Disponible"}
                    </td>
                    <td className="px-4 py-2 text-right">{row.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModalFrame>
      ) : null}
      {movementDetail ? (
        <ModalFrame title={`${documentLabel(movementDetail.document_type)} · ${movementDetail.document_number || movementDetail.id}`} onClose={() => setMovementDetail(null)} maxWidth="md:!max-w-4xl">
          <div className="overflow-x-auto">
            <div className="grid gap-2 p-4 text-sm md:grid-cols-2">
              <p>
                <strong>Fecha:</strong> {dateTime(movementDetail.created_at)}
              </p>
              <p>
                <strong>Movimiento:</strong>{" "}
                {movementLabel(movementDetail.type)}
              </p>
              <p>
                <strong>Origen:</strong> {movementDetail.from_warehouse || "--"}
              </p>
              <p>
                <strong>Destino:</strong> {movementDetail.to_warehouse || "--"}
              </p>
              <p>
                <strong>Cantidad:</strong>{" "}
                {movementDetail.in_qty || movementDetail.out_qty}
              </p>
              <p>
                <strong>Costo:</strong> {money(movementDetail.unit_cost)}
              </p>
              {movementDetail.accounting_document_number ? (
                <p><strong>Documento contable:</strong> {movementDetail.accounting_document_number}</p>
              ) : null}
            </div>
            {transferDetail ? (
              <div className="border-t border-line p-4">
                <h3 className="mb-2 font-semibold">Detalle del traslado</h3>
                <p className="mb-3 text-sm">
                  {transferDetail.origin?.name} →{" "}
                  {transferDetail.destination?.name}
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper text-left">
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferDetail.lines?.map((line) => (
                      <tr className="border-b border-line/70" key={line.id}>
                        <td className="px-3 py-2 font-mono">
                          {line.item?.code}
                        </td>
                        <td className="px-3 py-2">{line.item?.name}</td>
                        <td className="px-3 py-2 text-right">{line.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {accountingDetail ? (
              <div className="border-t border-line p-4">
                <h3 className="mb-2 font-semibold">Asiento contable {accountingDetail.full_number}</h3>
                <div className="mb-3 grid gap-2 text-sm md:grid-cols-2">
                  <p><strong>Clase:</strong> {accountingDetail.document_type || "--"}</p>
                  <p><strong>Fecha:</strong> {dateTime(accountingDetail.posting_date)}</p>
                  <p><strong>Referencia:</strong> {accountingDetail.reference || "--"}</p>
                  <p><strong>Usuario:</strong> {accountingDetail.created_by_name || "--"}</p>
                  <p className="md:col-span-2"><strong>Texto:</strong> {accountingDetail.header_text || "--"}</p>
                </div>
                <table className="w-full text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">Cuenta</th><th className="px-3 py-2">Descripcion</th><th className="px-3 py-2">NIT</th><th className="px-3 py-2 text-right">Debito</th><th className="px-3 py-2 text-right">Credito</th></tr></thead><tbody>{accountingDetail.lines?.map((line) => <tr className="border-b border-line/70" key={line.id}><td className="px-3 py-2 font-mono">{line.account_code}</td><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2">{line.party_tax_id || "--"}</td><td className="px-3 py-2 text-right">{money(line.debit)}</td><td className="px-3 py-2 text-right">{money(line.credit)}</td></tr>)}</tbody></table>
              </div>
            ) : null}
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <span className="block text-sm text-content-muted">{label}</span>
      <strong className="mt-1 block text-xl">{value}</strong>
    </div>
  );
}
