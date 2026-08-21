"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { asCollection, asRecord } from "@/lib/api-collections";
import { VentasNav } from "@/components/ventas-nav";

type Tab = "customer" | "item" | "date" | "detail";

type CustomerRow = { customer_id: number; customer?: { name: string }; count: number; subtotal: number; tax_total: number; total: number };
type ItemRow = { item?: { code: string; name: string }; qty: number; subtotal: number; total: number; count: number };
type DateRow = { period: string; count: number; subtotal: number; tax_total: number; total: number };
type DetailInvoice = { id: number; number: string; customer?: { name: string }; total: number; date: string; header_text: string; lines: DetailLine[]; cxc?: { number: string; balance: number } };
type DetailLine = { item?: { code: string }; description: string; qty: number; unit_price: number; total: number; cost_value: number };
type ReportData = { grand_total?: number; rows?: Array<CustomerRow | ItemRow | DateRow>; count?: number; invoices?: DetailInvoice[] };

export default function ReportesPage() {
  const [tab, setTab] = useState<Tab>("customer");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    date_from: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
    date_to: new Date().toISOString().split("T")[0],
    customer_id: "",
    item_id: "",
    search: "",
    group_by: "day"
  });

  function loadReport() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ date_from: filters.date_from, date_to: filters.date_to });
    let url = "";
    switch (tab) {
      case "customer":
        if (filters.customer_id) params.set("customer_id", filters.customer_id);
        url = `/api/v1/sales/reports/by-customer?${params.toString()}`;
        break;
      case "item":
        url = `/api/v1/sales/reports/by-item?${params.toString()}`;
        break;
      case "date":
        params.set("group_by", filters.group_by);
        url = `/api/v1/sales/reports/by-date?${params.toString()}`;
        break;
      case "detail":
        if (filters.customer_id) params.set("customer_id", filters.customer_id);
        if (filters.search) params.set("search", filters.search);
        url = `/api/v1/sales/reports/detail?${params.toString()}`;
        break;
    }
    api<unknown>(url)
      .then((response) => {
        const report = asRecord<ReportData>(response, ["report"]);
        const invoices = asCollection<DetailInvoice>(report.invoices, ["invoices"]).map((invoice) => ({
          ...invoice,
          lines: asCollection<DetailLine>(invoice.lines, ["lines"])
        }));
        setData({
          ...report,
          rows: asCollection<CustomerRow | ItemRow | DateRow>(report.rows, ["rows"]),
          invoices
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar reporte"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadReport();
    // Los filtros se aplican solo al pulsar "Consultar"; el cambio de pestaña sí recarga automáticamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const TABS: { key: Tab; label: string }[] = [
    { key: "customer", label: "Por cliente" },
    { key: "item", label: "Por producto" },
    { key: "date", label: "Por fecha" },
    { key: "detail", label: "Detalle" }
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Reportes de ventas</h1>
      <VentasNav />

      {/* Tabs */}
      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-md border px-3 py-2 text-sm ${tab === t.key ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-neutral-500">Desde</label>
          <input className="h-9 rounded-md border border-line px-3 text-sm" type="date" value={filters.date_from} onChange={(e) => setFilters((p) => ({ ...p, date_from: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Hasta</label>
          <input className="h-9 rounded-md border border-line px-3 text-sm" type="date" value={filters.date_to} onChange={(e) => setFilters((p) => ({ ...p, date_to: e.target.value }))} />
        </div>
        {tab === "customer" || tab === "detail" ? (
          <div>
            <label className="block text-xs text-neutral-500">Cliente ID</label>
            <input className="h-9 rounded-md border border-line px-3 text-sm w-24" type="number" placeholder="ID" value={filters.customer_id} onChange={(e) => setFilters((p) => ({ ...p, customer_id: e.target.value }))} />
          </div>
        ) : null}
        {tab === "detail" ? (
          <div>
            <label className="block text-xs text-neutral-500">Buscar</label>
            <input className="h-9 rounded-md border border-line px-3 text-sm" type="text" placeholder="Nº factura o texto" value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
          </div>
        ) : null}
        {tab === "date" ? (
          <div>
            <label className="block text-xs text-neutral-500">Agrupar</label>
            <select className="h-9 rounded-md border border-line px-3 text-sm" value={filters.group_by} onChange={(e) => setFilters((p) => ({ ...p, group_by: e.target.value }))}>
              <option value="day">Día</option>
              <option value="month">Mes</option>
            </select>
          </div>
        ) : null}
        <button className="h-9 rounded-md bg-apex px-4 text-sm text-white" onClick={loadReport}>Consultar</button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-neutral-500">Cargando...</p> : !data ? <p className="text-sm text-neutral-500">Sin datos</p> : (
        <section className="rounded-lg border border-line bg-white p-4">
          {tab === "customer" && (
            <>
              <p className="mb-2 text-sm text-neutral-500">Total: <strong>${data.grand_total?.toLocaleString()}</strong> en {data.rows?.length || 0} clientes</p>
              <table className="w-full border-collapse text-sm">
                <thead><tr className="border-b border-line text-left text-neutral-600">
                  <th className="py-2 pr-4 font-medium">Cliente</th>
                  <th className="py-2 pr-4 font-medium">Facturas</th>
                  <th className="py-2 pr-4 font-medium">Subtotal</th>
                  <th className="py-2 pr-4 font-medium">IVA</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                </tr></thead>
                <tbody>
                  {(data.rows as CustomerRow[]).map((r, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2 pr-4">{r.customer?.name || `#${r.customer_id}`}</td>
                      <td className="py-2 pr-4">{r.count}</td>
                      <td className="py-2 pr-4 font-mono">${r.subtotal.toLocaleString()}</td>
                      <td className="py-2 pr-4 font-mono">${r.tax_total.toLocaleString()}</td>
                      <td className="py-2 pr-4 font-mono">${r.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {tab === "item" && (
            <>
              <p className="mb-2 text-sm text-neutral-500">Total: <strong>${data.grand_total?.toLocaleString()}</strong></p>
              <table className="w-full border-collapse text-sm">
                <thead><tr className="border-b border-line text-left text-neutral-600">
                  <th className="py-2 pr-4 font-medium">Producto</th>
                  <th className="py-2 pr-4 font-medium">Cantidad</th>
                  <th className="py-2 pr-4 font-medium">Subtotal</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                  <th className="py-2 pr-4 font-medium">Ventas</th>
                </tr></thead>
                <tbody>
                  {(data.rows as ItemRow[]).map((r, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2 pr-4">{r.item?.code || ""} · {r.item?.name || ""}</td>
                      <td className="py-2 pr-4">{r.qty}</td>
                      <td className="py-2 pr-4 font-mono">${r.subtotal.toLocaleString()}</td>
                      <td className="py-2 pr-4 font-mono">${r.total.toLocaleString()}</td>
                      <td className="py-2 pr-4">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {tab === "date" && (
            <>
              <p className="mb-2 text-sm text-neutral-500">Agrupado por {filters.group_by === "month" ? "mes" : "día"} — Total: <strong>${data.grand_total?.toLocaleString()}</strong></p>
              <table className="w-full border-collapse text-sm">
                <thead><tr className="border-b border-line text-left text-neutral-600">
                  <th className="py-2 pr-4 font-medium">Periodo</th>
                  <th className="py-2 pr-4 font-medium">Facturas</th>
                  <th className="py-2 pr-4 font-medium">Subtotal</th>
                  <th className="py-2 pr-4 font-medium">IVA</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                </tr></thead>
                <tbody>
                  {(data.rows as DateRow[]).map((r, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2 pr-4 font-mono">{r.period}</td>
                      <td className="py-2 pr-4">{r.count}</td>
                      <td className="py-2 pr-4 font-mono">${r.subtotal.toLocaleString()}</td>
                      <td className="py-2 pr-4 font-mono">${r.tax_total.toLocaleString()}</td>
                      <td className="py-2 pr-4 font-mono">${r.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {tab === "detail" && (
            <>
              <p className="mb-2 text-sm text-neutral-500">{data.count || 0} facturas encontradas</p>
              {data.invoices?.map((inv: DetailInvoice) => (
                <details key={inv.id} className="mb-2 rounded border border-line">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-paper">
                    {inv.number} · {inv.customer?.name} · ${inv.total.toLocaleString()} · {new Date(inv.date).toLocaleDateString()}
                  </summary>
                  <div className="border-t border-line px-3 py-2">
                    <p className="text-xs text-neutral-500">Concepto: {inv.header_text}</p>
                    <table className="mt-1 w-full border-collapse text-xs">
                      <thead><tr className="border-b border-line text-left">
                        <th className="py-1 pr-2">SKU</th>
                        <th className="py-1 pr-2">Producto</th>
                        <th className="py-1 pr-2">Cant</th>
                        <th className="py-1 pr-2">Precio</th>
                        <th className="py-1 pr-2">Total</th>
                        <th className="py-1 pr-2">Costo</th>
                      </tr></thead>
                      <tbody>
                        {inv.lines.map((line, li: number) => (
                          <tr key={li} className="border-b border-line">
                            <td className="py-1 pr-2 font-mono">{line.item?.code || ""}</td>
                            <td className="py-1 pr-2">{line.description}</td>
                            <td className="py-1 pr-2">{line.qty}</td>
                            <td className="py-1 pr-2">${line.unit_price.toFixed(2)}</td>
                            <td className="py-1 pr-2">${line.total.toFixed(2)}</td>
                            <td className="py-1 pr-2">${line.cost_value.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {inv.cxc && <p className="mt-1 text-xs">CxC: {inv.cxc.number} · Saldo: ${inv.cxc.balance.toFixed(2)}</p>}
                  </div>
                </details>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
