"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { VentasNav } from "@/components/ventas-nav";

type Customer = { id: number; name: string; legal_name?: string; tax_id?: string; balance: number; credit_limit: number; metadata?: { withholding_rates?: { code: string; base_amount?: number }[] } };
type Item = { id: number; code: string; name: string; unit: string; unit_price: number; tax_rate: number };
type Warehouse = { id: number; code: string; name: string; warehouse_type: string };
type SaleOrderLine = { id: number; item_id: number; qty: number; unit: string; unit_price: number; discount: number; tax_rate: number; description: string };
type SaleOrder = { id: number; number: string; status: string; party_id: number; lines: SaleOrderLine[] };
type Line = { item_id: number; item_code: string; item_name: string; qty: number; unit: string; unit_price: number; discount: number; tax_rate: number; place_id: number | null; place_name: string; customer_invoice_number: string; source_order_line_id?: number };
type SimulationLine = { line_no: number; item_code: string; item_name: string; qty: number; net_amount?: number; tax_amount?: number; total?: number; revenue_account?: string };
type SimulationRetention = { description: string; amount: number; percent: number };
type InvoiceSimulation = {
  customer?: { name?: string };
  date?: string;
  effective_total?: number;
  retention_total?: number;
  lines?: SimulationLine[];
  retentions?: SimulationRetention[];
};
type CreatedInvoice = { number?: string };
type Retention = { id: number; code: string; description: string; percent: number; minimum_base: number; base_type: string };
type SelectedRetention = { code: string; base_amount: number; percent: number; amount: number };

export default function NuevaFacturaPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [retentions, setRetentions] = useState<Retention[]>([]);
  const [selectedRetentions, setSelectedRetentions] = useState<SelectedRetention[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [simulation, setSimulation] = useState<InvoiceSimulation | null>(null);
  const [showSim, setShowSim] = useState(false);
  const [saving, setSaving] = useState(false);

  const [header, setHeader] = useState({
    customer_id: 0, sales_order_id: 0, place_id: 0, posting_date: new Date().toISOString().split("T")[0],
    due_term: "AP30", header_text: "", society_code: "SOC-01", branch_code: "SOC-01",
    cost_center_code: "SOC-01", associated_account_code: "1305", notes: ""
  });

  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    Promise.all([
      api<Customer[]>("/api/v1/sales/customers"),
      api<{ data: Item[] }>("/api/v1/inventory/items"),
      api<Warehouse[]>("/api/v1/inventory/warehouses"),
      api<Retention[]>("/api/v1/accounts-receivable/retentions"),
      api<SaleOrder[]>("/api/v1/sales/orders")
    ]).then(([c, i, w, r, o]) => {
      setCustomers(c || []);
      setItems(i?.data || []);
      setWarehouses(w || []);
      setRetentions(r || []);
      setOrders(o || []);
    }).catch((err) => setError(err instanceof Error ? err.message : "Error cargando datos"));
  }, []);

  const selectedCustomer = customers.find((c) => c.id === header.customer_id);

  function addLine() {
    setLines((prev) => [...prev, { item_id: 0, item_code: "", item_name: "", qty: 1, unit: "UND", unit_price: 0, discount: 0, tax_rate: 0, place_id: header.place_id || null, place_name: "", customer_invoice_number: "" }]);
  }

  function selectSalesOrder(orderId: number) {
    const order = orders.find((row) => row.id === orderId);
    setHeader((current) => ({ ...current, sales_order_id: orderId, customer_id: order?.party_id || current.customer_id }));
    if (!order) return;
    setLines(order.lines.map((orderLine) => {
      const item = items.find((row) => row.id === orderLine.item_id);
      return {
        item_id: orderLine.item_id,
        item_code: item?.code || "",
        item_name: item?.name || orderLine.description,
        qty: orderLine.qty,
        unit: orderLine.unit || item?.unit || "UND",
        unit_price: orderLine.unit_price,
        discount: orderLine.discount || 0,
        tax_rate: orderLine.tax_rate ?? item?.tax_rate ?? 0,
        place_id: header.place_id || null,
        place_name: "",
        customer_invoice_number: "",
        source_order_line_id: orderLine.id
      };
    }));
  }

  function updateLine<K extends keyof Line>(index: number, field: K, value: Line[K]) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      if (field === "item_id") {
        const item = items.find((i) => i.id === Number(value));
        if (item) {
          next[index].item_code = item.code;
          next[index].item_name = item.name;
          next[index].unit = item.unit;
          next[index].unit_price = item.unit_price;
          next[index].tax_rate = item.tax_rate;
        }
      }
      if (field === "place_id") {
        const wh = warehouses.find((w) => w.id === Number(value));
        if (wh) next[index].place_name = wh.name;
      }
      return next;
    });
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  // Calculated totals
  const totals = lines.reduce((acc, line) => {
    const subtotal = line.qty * line.unit_price;
    const discount = subtotal * (line.discount / 100);
    const net = subtotal - discount;
    const tax = net * (line.tax_rate / 100);
    const total = net + tax;
    return {
      subtotal: acc.subtotal + net,
      tax_total: acc.tax_total + tax,
      discount_total: acc.discount_total + discount,
      total: acc.total + total
    };
  }, { subtotal: 0, tax_total: 0, discount_total: 0, total: 0 });

  async function handleSimulate() {
    setError(""); setSimulation(null);
    if (!header.customer_id) { setError("Seleccione un cliente"); return; }
    if (!lines.length || lines.some((l) => !l.item_id || !l.place_id)) { setError("Cada linea debe tener producto y bodega de origen"); return; }
    try {
      const res = await api<InvoiceSimulation>("/api/v1/sales/invoices/simulate", {
        method: "POST",
        body: JSON.stringify({
          customer_id: header.customer_id,
          sales_order_id: header.sales_order_id || undefined,
          posting_date: header.posting_date,
          due_term: header.due_term,
          header_text: header.header_text || "Factura de venta",
          society_code: header.society_code,
          branch_code: header.branch_code,
          cost_center_code: header.cost_center_code,
          associated_account_code: header.associated_account_code,
          retention_codes: selectedRetentions,
          lines: lines.map((l) => ({
            item_id: l.item_id, qty: l.qty, unit_price: l.unit_price, discount: l.discount, tax_rate: l.tax_rate,
            place_id: l.place_id || undefined, customer_invoice_number: l.customer_invoice_number || undefined,
            source_order_line_id: l.source_order_line_id
          }))
        })
      });
      setSimulation(res);
      setShowSim(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en simulacion");
    }
  }

  async function handleSubmit() {
    setError(""); setOk("");
    if (!header.customer_id) { setError("Seleccione un cliente"); return; }
    if (!lines.length || lines.some((l) => !l.item_id || !l.place_id)) { setError("Cada linea debe tener producto y bodega de origen"); return; }
    setSaving(true);
    try {
      const res = await api<{ invoice: CreatedInvoice }>("/api/v1/sales/invoices", {
        method: "POST",
        body: JSON.stringify({
          customer_id: header.customer_id,
          sales_order_id: header.sales_order_id || undefined,
          place_id: header.place_id || undefined,
          posting_date: header.posting_date,
          due_term: header.due_term,
          header_text: header.header_text || "Factura de venta",
          society_code: header.society_code,
          branch_code: header.branch_code,
          cost_center_code: header.cost_center_code,
          associated_account_code: header.associated_account_code,
          notes: header.notes || undefined,
          retention_codes: selectedRetentions,
          lines: lines.map((l) => ({
            item_id: l.item_id, qty: l.qty, unit_price: l.unit_price,
            discount: l.discount, tax_rate: l.tax_rate,
            place_id: l.place_id || undefined,
            customer_invoice_number: l.customer_invoice_number || undefined,
            source_order_line_id: l.source_order_line_id
          }))
        })
      });
      setOk(`Factura ${res.invoice?.number} creada exitosamente`);
      setTimeout(() => router.push("/dashboard/ventas/facturas"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear factura");
    } finally {
      setSaving(false);
    }
  }

  function toggleRetention(retention: Retention) {
    setSelectedRetentions((current) => current.some((item) => item.code === retention.code)
      ? current.filter((item) => item.code !== retention.code)
      : [...current, {
        code: retention.code,
        base_amount: retention.base_type === "iva" ? totals.tax_total : totals.subtotal,
        percent: retention.percent,
        amount: ((retention.base_type === "iva" ? totals.tax_total : totals.subtotal) * retention.percent) / 100
      }]);
  }

  async function importExcel(file: File | undefined) {
    if (!file) return;
    setSaving(true); setError(""); setOk("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<{ count: number }>("/api/v1/sales/invoices/import", { method: "POST", body });
      setOk(`Importacion atomica completada: ${result.count} factura(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error importando Excel");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Nueva factura de venta</h1>
      <VentasNav />
      <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line bg-white px-4 text-sm">
        Importar facturas Excel
        <input className="hidden" type="file" accept=".xlsx" disabled={saving} onChange={(event) => importExcel(event.target.files?.[0])} />
      </label>
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      {/* Cabecera */}
      <section className="rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 font-semibold">Cabecera</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={header.customer_id} onChange={(e) => setHeader((p) => ({ ...p, customer_id: Number(e.target.value) }))}>
            <option value={0}>Seleccione cliente</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.tax_id ? `(${c.tax_id})` : ""}</option>)}
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={header.sales_order_id} onChange={(e) => selectSalesOrder(Number(e.target.value))}>
            <option value={0}>Sin orden de venta</option>
            {orders.filter((order) => !["cancelled", "closed", "invoiced"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.number} · {order.status}</option>)}
          </select>
          {selectedCustomer && (
            <div className="text-xs text-neutral-500 flex items-center gap-2">
              <span>Saldo: <strong className={selectedCustomer.balance > (selectedCustomer.credit_limit || 0) ? "text-red-600" : "text-emerald-700"}>${selectedCustomer.balance.toLocaleString()}</strong></span>
              <span>Crédito: ${(selectedCustomer.credit_limit || 0).toLocaleString()}</span>
            </div>
          )}
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={header.place_id} onChange={(e) => {
            const placeId = Number(e.target.value);
            setHeader((p) => ({ ...p, place_id: placeId }));
            setLines((rows) => rows.map((row) => ({ ...row, place_id: placeId || null })));
          }}>
            <option value={0}>Bodega (opcional)</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
          <input className="h-10 rounded-md border border-line px-3 text-sm" type="date" value={header.posting_date} onChange={(e) => setHeader((p) => ({ ...p, posting_date: e.target.value }))} />
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={header.due_term} onChange={(e) => setHeader((p) => ({ ...p, due_term: e.target.value }))}>
            <option value="AP15">AP15 (15 días)</option>
            <option value="AP30">AP30 (30 días)</option>
            <option value="AP60">AP60 (60 días)</option>
            <option value="AP90">AP90 (90 días)</option>
          </select>
          <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Concepto / header text *" value={header.header_text} onChange={(e) => setHeader((p) => ({ ...p, header_text: e.target.value }))} />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={header.society_code} onChange={(e) => setHeader((p) => ({ ...p, society_code: e.target.value }))} placeholder="Sociedad" />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={header.branch_code} onChange={(e) => setHeader((p) => ({ ...p, branch_code: e.target.value }))} placeholder="Sucursal" />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={header.cost_center_code} onChange={(e) => setHeader((p) => ({ ...p, cost_center_code: e.target.value }))} placeholder="Centro costo" />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={header.associated_account_code} onChange={(e) => setHeader((p) => ({ ...p, associated_account_code: e.target.value }))} placeholder="Cuenta asociada (1305)" />
        </div>
        <textarea className="mt-3 w-full rounded-md border border-line px-3 py-2 text-sm" rows={2} placeholder="Notas (opcional)" value={header.notes} onChange={(e) => setHeader((p) => ({ ...p, notes: e.target.value }))} />
      </section>

      {/* Detalle */}
      <section className="rounded-lg border border-line bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Detalle</h2>
          <button className="h-8 rounded-md bg-apex px-3 text-xs text-white" onClick={addLine}>+ Agregar línea</button>
        </div>
        {lines.length === 0 ? <p className="text-sm text-neutral-400">Agregue productos a la factura</p> : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-neutral-600">
                <th className="py-1 pr-2 font-medium">Producto</th>
                <th className="py-1 pr-2 font-medium w-20">Cant</th>
                <th className="py-1 pr-2 font-medium w-24">Precio</th>
                <th className="py-1 pr-2 font-medium w-16">Dto%</th>
                <th className="py-1 pr-2 font-medium w-16">IVA%</th>
                <th className="py-1 pr-2 font-medium w-28">Bodega</th>
                <th className="py-1 pr-2 font-medium w-28">Fact. cliente</th>
                <th className="py-1 pr-2 font-medium w-24 text-right">Subtotal</th>
                <th className="py-1 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const sub = line.qty * line.unit_price;
                const dsc = sub * (line.discount / 100);
                const net = sub - dsc;
                const tax = net * (line.tax_rate / 100);
                return (
                  <tr key={i} className="border-b border-line">
                    <td className="py-1 pr-2">
                      <select className="h-8 w-full rounded border border-line px-2 text-xs" value={line.item_id} onChange={(e) => updateLine(i, "item_id", Number(e.target.value))}>
                        <option value={0}>Seleccionar</option>
                        {items.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-2"><input className="h-8 w-full rounded border border-line px-2 text-xs" type="number" min={0.01} step="0.01" value={line.qty} onChange={(e) => updateLine(i, "qty", Number(e.target.value))} /></td>
                    <td className="py-1 pr-2"><input className="h-8 w-full rounded border border-line px-2 text-xs" type="number" min={0} step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, "unit_price", Number(e.target.value))} /></td>
                    <td className="py-1 pr-2"><input className="h-8 w-full rounded border border-line px-2 text-xs" type="number" min={0} max={100} step="0.1" value={line.discount} onChange={(e) => updateLine(i, "discount", Number(e.target.value))} /></td>
                    <td className="py-1 pr-2"><input className="h-8 w-full rounded border border-line px-2 text-xs" type="number" min={0} step="0.1" value={line.tax_rate} onChange={(e) => updateLine(i, "tax_rate", Number(e.target.value))} /></td>
                    <td className="py-1 pr-2">
                      <select className="h-8 w-full rounded border border-line px-2 text-xs" value={line.place_id || ""} onChange={(e) => updateLine(i, "place_id", Number(e.target.value))}>
                        <option value="">Seleccione bodega</option>
                        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-2"><input className="h-8 w-full rounded border border-line px-2 text-xs" placeholder="Nº fact. cliente" value={line.customer_invoice_number} onChange={(e) => updateLine(i, "customer_invoice_number", e.target.value)} /></td>
                    <td className="py-1 pr-2 text-right text-xs font-mono">${(net + tax).toFixed(2)}</td>
                    <td className="py-1"><button className="text-red-500 text-xs" onClick={() => removeLine(i)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Totales */}
      <section className="rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 font-semibold">Retenciones de venta</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {retentions.map((retention) => {
            const selected = selectedRetentions.find((item) => item.code === retention.code);
            return (
              <div className="rounded-md border border-line p-3" key={retention.id}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleRetention(retention)} />
                  {retention.code} · {retention.description}
                </label>
                {selected ? <div className="mt-2 grid grid-cols-3 gap-2">
                  <input aria-label="Base" className="h-8 rounded border border-line px-2 text-xs" type="number" value={selected.base_amount} onChange={(e) => setSelectedRetentions((rows) => rows.map((row) => row.code === selected.code ? { ...row, base_amount: Number(e.target.value) } : row))} />
                  <input aria-label="Porcentaje" className="h-8 rounded border border-line px-2 text-xs" type="number" value={selected.percent} onChange={(e) => setSelectedRetentions((rows) => rows.map((row) => row.code === selected.code ? { ...row, percent: Number(e.target.value) } : row))} />
                  <input aria-label="Importe" className="h-8 rounded border border-line px-2 text-xs" type="number" value={selected.amount} onChange={(e) => setSelectedRetentions((rows) => rows.map((row) => row.code === selected.code ? { ...row, amount: Number(e.target.value) } : row))} />
                </div> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap justify-end gap-4 text-sm">
          <span>Subtotal: <strong className="font-mono">${totals.subtotal.toFixed(2)}</strong></span>
          <span>IVA: <strong className="font-mono">${totals.tax_total.toFixed(2)}</strong></span>
          <span className="text-lg">Total: <strong className="font-mono">${totals.total.toFixed(2)}</strong></span>
        </div>
      </section>

      {/* Acciones */}
      <div className="flex gap-3">
        <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={handleSimulate} disabled={saving}>Simular contabilidad</button>
        <button className="h-10 rounded-md bg-apex px-4 text-sm text-white disabled:opacity-50" onClick={handleSubmit} disabled={saving || !lines.length}>
          {saving ? "Creando..." : "Emitir factura"}
        </button>
      </div>

      {/* Simulation modal */}
      {showSim && simulation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowSim(false)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold">Vista previa contable</h3>
            <div className="space-y-1 text-sm">
              <p><strong>Cliente:</strong> {simulation.customer?.name}</p>
              <p><strong>Fecha:</strong> {simulation.date}</p>
              <p><strong>Total:</strong> ${simulation.effective_total?.toFixed(2)} {simulation.retention_total > 0 ? `(Ret: $${simulation.retention_total.toFixed(2)})` : ""}</p>
              <table className="mt-2 w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="py-1 pr-2">Línea</th>
                    <th className="py-1 pr-2">Producto</th>
                    <th className="py-1 pr-2">Cant</th>
                    <th className="py-1 pr-2">Neto</th>
                    <th className="py-1 pr-2">IVA</th>
                    <th className="py-1 pr-2">Total</th>
                    <th className="py-1 pr-2">Cta. ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.lines?.map((l, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-1 pr-2">{l.line_no}</td>
                      <td className="py-1 pr-2">{l.item_code} · {l.item_name}</td>
                      <td className="py-1 pr-2">{l.qty}</td>
                      <td className="py-1 pr-2">${l.net_amount?.toFixed(2)}</td>
                      <td className="py-1 pr-2">${l.tax_amount?.toFixed(2)}</td>
                      <td className="py-1 pr-2">${l.total?.toFixed(2)}</td>
                      <td className="py-1 pr-2 font-mono">{l.revenue_account || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {simulation.retentions?.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium">Retenciones aplicadas:</p>
                  {simulation.retentions.map((r, i) => (
                    <p key={i} className="text-xs">{r.description}: <strong>${r.amount.toFixed(2)}</strong> ({r.percent}%)</p>
                  ))}
                </div>
              )}
            </div>
            <button className="mt-4 h-8 rounded-md bg-neutral-100 px-3 text-xs" onClick={() => setShowSim(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
