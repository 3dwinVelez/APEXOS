"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { InventoryNav } from "@/components/inventory-nav";
import { api } from "@/lib/api";

type Item = { id: number; code: string; name: string; unit: string; stock_current: number; unit_cost: number };
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
  reason: string;
  warehouse: string;
  from_warehouse: string;
  to_warehouse: string;
};
type KardexResponse = { item: Item; data: KardexRow[]; total: number; current_stock: number; current_average_cost: number };
type CostRow = {
  id: number;
  code: string;
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
  warehouse_rows: Array<{ location_id: number; warehouse_id: number; warehouse_code: string; warehouse_name: string; location_code: string; type: string; qty: number }>;
};
type CostsResponse = { data: CostRow[]; total: number; totals: { stock_units: number; inventory_value: number } };

function money(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
}

function dateTime(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

function movementLabel(type: string) {
  const labels: Record<string, string> = { in: "Entrada", out: "Salida", transfer: "Transferencia", transfer_dispatch: "Despacho a tránsito", transfer_receive: "Descarga de tránsito", adjustment: "Ajuste" };
  return labels[type] || type;
}

function documentLabel(type: string) {
  const labels: Record<string, string> = { warehouse_transfer: "Traslado entre bodegas", purchase_order_receipt: "Recepción de orden de compra", purchase_return: "Devolución de compra", purchase_invoice: "Factura de compra", sales_invoice: "Factura de venta", movement: "Movimiento de inventario" };
  return labels[type] || type || "Movimiento de inventario";
}

export default function ReportesInventarioPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [kardex, setKardex] = useState<KardexResponse | null>(null);
  const [costs, setCosts] = useState<CostsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stockDetail, setStockDetail] = useState<CostRow | null>(null);
  const [movementDetail, setMovementDetail] = useState<KardexRow | null>(null);
  const [transferDetail, setTransferDetail] = useState<any>(null);

  async function loadBase() {
    const [itemRows, costRows] = await Promise.all([
      api<{ data: Item[] }>("/api/v1/inventory/items?limit=200&sort_by=code"),
      api<CostsResponse>("/api/v1/inventory/costs?limit=200")
    ]);
    setItems(itemRows.data || []);
    setCosts(costRows);
    const firstItem = itemRows.data?.[0];
    if (firstItem) setSelectedItemId((current) => current || String(firstItem.id));
  }

  const loadKardex = useCallback(async (itemId: string) => {
    if (!itemId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      setKardex(await api<KardexResponse>(`/api/v1/inventory/kardex/${itemId}?${params.toString()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el kardex");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadBase().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar reportes"));
  }, []);

  useEffect(() => {
    if (selectedItemId) void loadKardex(selectedItemId);
  }, [loadKardex, selectedItemId]);

  const filteredCosts = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (costs?.data || []).filter((item) => !text || [item.code, item.name, item.family_code, item.family_name].some((value) => value.toLowerCase().includes(text)));
  }, [costs, query]);

  const selectedCost = filteredCosts.find((item) => String(item.id) === selectedItemId) || costs?.data.find((item) => String(item.id) === selectedItemId);

  async function openMovement(row: KardexRow) {
    setMovementDetail(row);
    setTransferDetail(null);
    if (row.document_type === "warehouse_transfer" && row.document_id) {
      try { setTransferDetail(await api("/api/v1/inventory/transfers/" + row.document_id)); }
      catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar el documento"); }
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-medium text-apex">Inventario - Reportes</p>
        <h1 className="text-3xl font-semibold">Kardex y costos</h1>
        <p className="mt-1 text-sm text-neutral-600">Consulta movimientos por producto y el costo promedio actual del SKU.</p>
      </header>
      <InventoryNav />

      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_auto]">
          <label className="text-sm">Producto
            <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}>
              <option value="">Seleccionar SKU</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Desde
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="text-sm">Hasta
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <button className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60" disabled={loading || !selectedItemId} onClick={() => loadKardex(selectedItemId)} type="button">
            <Search size={16} /> Consultar
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Stock actual" value={String(kardex?.current_stock ?? selectedCost?.stock_current ?? 0)} />
        <Metric label="Costo promedio" value={money(kardex?.current_average_cost ?? selectedCost?.average_cost ?? 0)} />
        <Metric label="Valor inventario SKU" value={money((kardex?.current_stock ?? selectedCost?.stock_current ?? 0) * (kardex?.current_average_cost ?? selectedCost?.average_cost ?? 0))} />
        <Metric label="Movimientos" value={String(kardex?.total ?? 0)} />
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <h2 className="text-base font-semibold">Kardex del producto</h2>
          <p className="text-sm text-neutral-500">Entradas suman, salidas restan y el saldo queda acumulado por fecha.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Bodega</th>
                <th className="px-3 py-2 text-right">Entrada</th>
                <th className="px-3 py-2 text-right">Salida</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-right">Costo</th>
                <th className="px-3 py-2 text-right">Valor mov.</th>
              </tr>
            </thead>
            <tbody>
              {(kardex?.data || []).map((row) => (
                <tr className="border-b border-line/70 last:border-0" key={row.id}>
                  <td className="px-3 py-2">{dateTime(row.created_at)}</td>
                  <td className="px-3 py-2">{movementLabel(row.type)}</td>
                  <td className="px-3 py-2"><button className="font-mono text-xs text-apex hover:underline" onDoubleClick={() => void openMovement(row)} title="Doble clic para ver el documento" type="button">{row.document_number || documentLabel(row.document_type) || row.reason || "--"}</button></td>
                  <td className="px-3 py-2"><button className="text-left hover:text-apex hover:underline" onDoubleClick={() => { const cost = costs?.data.find((item) => item.code === row.item_code); if (cost) setStockDetail(cost); }} title="Doble clic para ver existencias por bodega" type="button"><span className="font-mono text-xs">{row.item_code}</span> {row.item_name}</button></td>
                  <td className="px-3 py-2">{row.warehouse || row.from_warehouse || row.to_warehouse || "--"}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{row.in_qty || ""}</td>
                  <td className="px-3 py-2 text-right text-rose-700">{row.out_qty || ""}</td>
                  <td className="px-3 py-2 text-right font-semibold">{row.balance}</td>
                  <td className="px-3 py-2 text-right">{money(row.unit_cost)}</td>
                  <td className="px-3 py-2 text-right">{money(row.value)}</td>
                </tr>
              ))}
              {!kardex?.data?.length ? <tr><td className="px-3 py-6 text-neutral-500" colSpan={10}>No hay movimientos para este producto.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">Mini reporte de costos</h2>
            <p className="text-sm text-neutral-500">Costo promedio actual, último costo y valor de inventario por SKU.</p>
          </div>
          <input className="h-10 rounded-md border border-line px-3 text-sm md:w-80" placeholder="Buscar SKU, familia o producto" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
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
              {filteredCosts.flatMap((row) => (row.warehouse_rows?.length ? row.warehouse_rows : [{ location_id: 0, warehouse_id: 0, warehouse_code: "--", warehouse_name: "Sin bodega", location_code: "", type: "warehouse", qty: 0 }]).map((warehouse) => (
                <tr className="border-b border-line/70 last:border-0 hover:bg-paper/70" key={row.id + "-" + warehouse.location_id}>
                  <td className="px-3 py-2"><button className="font-mono text-xs text-apex hover:underline" onDoubleClick={() => setStockDetail(row)} title="Doble clic para ver existencias por bodega" type="button">{row.code}</button></td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.family_code ? `${row.family_code} - ${row.family_name}` : "--"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.society_code || "--"}</td>
                  <td className="px-3 py-2">{warehouse.type === "transit" ? "Tránsito" : warehouse.warehouse_code + " - " + warehouse.warehouse_name} {warehouse.location_code ? "/ " + warehouse.location_code : ""}</td>
                  <td className="px-3 py-2 text-right">{warehouse.type === "warehouse" ? warehouse.qty : 0}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{warehouse.type === "transit" ? warehouse.qty : 0}</td>
                  <td className="px-3 py-2 text-right">{money(row.average_cost)}</td>
                  <td className="px-3 py-2 text-right">{money(row.last_unit_cost)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{money(warehouse.qty * row.average_cost)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </section>
      {stockDetail ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={() => setStockDetail(null)}><section className="w-full max-w-3xl rounded-lg bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}><header className="flex items-start justify-between border-b border-line p-4"><div><p className="text-sm text-neutral-500">Existencias por bodega</p><h2 className="text-xl font-semibold">{stockDetail.code} - {stockDetail.name}</h2></div><button onClick={() => setStockDetail(null)} type="button"><X size={20} /></button></header><table className="w-full text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-4 py-2">Bodega</th><th className="px-4 py-2">Ubicación</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2 text-right">Cantidad</th></tr></thead><tbody>{stockDetail.warehouse_rows.map((row) => <tr className="border-b border-line/70" key={row.location_id}><td className="px-4 py-2">{row.warehouse_code} - {row.warehouse_name}</td><td className="px-4 py-2">{row.location_code || "--"}</td><td className="px-4 py-2">{row.type === "transit" ? "En tránsito" : "Disponible"}</td><td className="px-4 py-2 text-right">{row.qty}</td></tr>)}</tbody></table></section></div> : null}
      {movementDetail ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={() => setMovementDetail(null)}><section className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}><header className="flex items-start justify-between border-b border-line p-4"><div><p className="text-sm text-neutral-500">{documentLabel(movementDetail.document_type)}</p><h2 className="text-xl font-semibold">{movementDetail.document_number || "Movimiento " + movementDetail.id}</h2></div><button onClick={() => setMovementDetail(null)} type="button"><X size={20} /></button></header><div className="grid gap-2 p-4 text-sm md:grid-cols-2"><p><strong>Fecha:</strong> {dateTime(movementDetail.created_at)}</p><p><strong>Movimiento:</strong> {movementLabel(movementDetail.type)}</p><p><strong>Origen:</strong> {movementDetail.from_warehouse || "--"}</p><p><strong>Destino:</strong> {movementDetail.to_warehouse || "--"}</p><p><strong>Cantidad:</strong> {movementDetail.in_qty || movementDetail.out_qty}</p><p><strong>Costo:</strong> {money(movementDetail.unit_cost)}</p></div>{transferDetail ? <div className="border-t border-line p-4"><h3 className="mb-2 font-semibold">Detalle del traslado</h3><p className="mb-3 text-sm">{transferDetail.origin?.name} → {transferDetail.destination?.name}</p><table className="w-full text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Cantidad</th></tr></thead><tbody>{transferDetail.lines?.map((line: any) => <tr className="border-b border-line/70" key={line.id}><td className="px-3 py-2 font-mono">{line.item?.code}</td><td className="px-3 py-2">{line.item?.name}</td><td className="px-3 py-2 text-right">{line.qty}</td></tr>)}</tbody></table></div> : null}</section></div> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <span className="block text-sm text-neutral-500">{label}</span>
      <strong className="mt-1 block text-xl">{value}</strong>
    </div>
  );
}
