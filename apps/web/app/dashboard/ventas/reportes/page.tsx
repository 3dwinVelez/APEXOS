"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { VentasNav } from "@/components/ventas-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Tab = "customer" | "item" | "date" | "detail";

type CustomerRow = { customer_id: number; customer?: { name: string }; count: number; subtotal: number; tax_total: number; total: number };
type ItemRow = { item?: { code: string; legacy_code?: string | null; name: string }; qty: number; subtotal: number; total: number; count: number };
type DateRow = { period: string; count: number; subtotal: number; tax_total: number; total: number };
type DetailInvoice = { id: number; number: string; customer?: { name: string }; total: number; date: string; header_text: string; lines: DetailLine[]; cxc?: { number: string; balance: number } };
type DetailLine = { item?: { code: string; legacy_code?: string | null }; description: string; qty: number; unit_price: number; total: number; cost_value: number };
type ReportData = { grand_total?: number; rows?: CustomerRow[] | ItemRow[] | DateRow[]; count?: number; invoices?: DetailInvoice[] };
type Customer = { id: number; name: string; legal_name?: string | null; tax_id?: string | null };
type Item = { id: number; code: string; legacy_code?: string | null; name: string; family_code?: string | null };
type Lookup = "customer" | "item";

export default function ReportesPage() {
  const [tab, setTab] = useState<Tab>("customer");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [customerText, setCustomerText] = useState("");
  const [itemText, setItemText] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupSearch, setLookupSearch] = useState("");
  const [filters, setFilters] = useState({
    date_from: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
    date_to: new Date().toISOString().split("T")[0],
    customer_id: "",
    item_id: "",
    search: "",
    group_by: "day"
  });

  useEffect(() => {
    Promise.all([
      api<Customer[]>("/api/v1/sales/customers"),
      api<{ data: Item[] }>("/api/v1/inventory/items?all=true&sort_by=code")
    ]).then(([customerRows, itemRows]) => {
      setCustomers(customerRows);
      setItems(itemRows.data || []);
    }).catch((err) => setError(err instanceof Error ? err.message : "No fue posible cargar los maestros de búsqueda"));
  }, []);

  const visibleCustomers = useMemo(() => {
    const needle = lookupSearch.trim().toLowerCase();
    return customers.filter((row) => !needle || [String(row.id), row.tax_id || "", row.name, row.legal_name || ""].some((value) => value.toLowerCase().includes(needle))).slice(0, 100);
  }, [customers, lookupSearch]);
  const visibleItems = useMemo(() => {
    const needle = lookupSearch.trim().toLowerCase();
    return items.filter((row) => !needle || [row.code, row.legacy_code || "", row.name, row.family_code || ""].some((value) => value.toLowerCase().includes(needle))).slice(0, 100);
  }, [items, lookupSearch]);

  function selectCustomer(customer: Customer) {
    setFilters((current) => ({ ...current, customer_id: String(customer.id) }));
    setCustomerText(`${customer.tax_id ? `${customer.tax_id} - ` : ""}${customer.name}`);
    setLookup(null);
    setLookupSearch("");
  }

  function selectItem(item: Item) {
    setFilters((current) => ({ ...current, item_id: String(item.id) }));
    setItemText(`${item.code}${item.legacy_code ? ` · Anterior: ${item.legacy_code}` : ""} - ${item.name}`);
    setLookup(null);
    setLookupSearch("");
  }

  function handleLookupEnter(kind: Lookup) {
    const text = (kind === "customer" ? customerText : itemText).trim().toLowerCase();
    if (text) {
      if (kind === "customer") {
        const match = customers.find((row) => [String(row.id), row.tax_id || "", row.name, row.legal_name || ""].some((value) => value.toLowerCase() === text));
        if (match) return selectCustomer(match);
      } else {
        const match = items.find((row) => [row.code, row.legacy_code || "", row.name].some((value) => value.toLowerCase() === text));
        if (match) return selectItem(match);
      }
    }
    setLookup(kind);
    setLookupSearch(text);
  }

  function loadReport() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ date_from: filters.date_from, date_to: filters.date_to });
    if (filters.customer_id) params.set("customer_id", filters.customer_id);
    if (filters.item_id) params.set("item_id", filters.item_id);
    let url = "";
    switch (tab) {
      case "customer":
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
        if (filters.search) params.set("search", filters.search);
        url = `/api/v1/sales/reports/detail?${params.toString()}`;
        break;
    }
    api(url)
      .then((res) => setData(res))
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
        <div>
          <label className="block text-xs text-neutral-500">Cliente</label>
          <div className="flex"><input className="h-9 w-64 rounded-l-md border border-line px-3 text-sm" placeholder="Código, NIT o nombre; Enter para buscar" value={customerText} onChange={(event) => { setCustomerText(event.target.value); setFilters((current) => ({ ...current, customer_id: "" })); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleLookupEnter("customer"); } }} /><button aria-label="Buscar cliente" className="h-9 w-9 rounded-r-md border border-l-0 border-line text-apex" onClick={() => handleLookupEnter("customer")} type="button"><Search className="mx-auto" size={16} /></button></div>
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Producto</label>
          <div className="flex"><input className="h-9 w-64 rounded-l-md border border-line px-3 text-sm" placeholder="SKU, código anterior o nombre; Enter para buscar" value={itemText} onChange={(event) => { setItemText(event.target.value); setFilters((current) => ({ ...current, item_id: "" })); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleLookupEnter("item"); } }} /><button aria-label="Buscar producto" className="h-9 w-9 rounded-r-md border border-l-0 border-line text-apex" onClick={() => handleLookupEnter("item")} type="button"><Search className="mx-auto" size={16} /></button></div>
        </div>
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
                  {(data.rows as CustomerRow[] || []).map((r, i) => (
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
                  {(data.rows as ItemRow[] || []).map((r, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2 pr-4"><span className="font-mono">{r.item?.code || ""}</span>{r.item?.legacy_code ? <span className="ml-2 font-mono text-xs text-neutral-500">Anterior: {r.item.legacy_code}</span> : null} · {r.item?.name || ""}</td>
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
                  {(data.rows as DateRow[] || []).map((r, i) => (
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
              {(data.invoices || []).map((inv: DetailInvoice) => (
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
                        {(inv.lines || []).map((line, li: number) => (
                          <tr key={li} className="border-b border-line">
                            <td className="py-1 pr-2 font-mono">{line.item?.code || ""}{line.item?.legacy_code ? <span className="block text-neutral-500">Anterior: {line.item.legacy_code}</span> : null}</td>
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
      {lookup ? <ModalFrame maxWidth="md:max-w-3xl" onClose={() => { setLookup(null); setLookupSearch(""); }} title={lookup === "customer" ? "Buscar cliente" : "Buscar producto"}>
        <div className="space-y-3"><label className="relative block"><Search className="absolute left-3 top-3 text-neutral-400" size={16} /><input autoFocus className="h-10 w-full rounded-md border border-line pl-10 pr-10 text-sm" placeholder={lookup === "customer" ? "Buscar por código, NIT o nombre" : "Buscar por SKU, código anterior, nombre o familia"} value={lookupSearch} onChange={(event) => setLookupSearch(event.target.value)} /><button aria-label="Limpiar búsqueda" className="absolute right-3 top-3 text-neutral-400" onClick={() => setLookupSearch("")} type="button"><X size={16} /></button></label>
          <div className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-md border border-line">{lookup === "customer" ? visibleCustomers.map((customer) => <button className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-paper" key={customer.id} onClick={() => selectCustomer(customer)} type="button"><span><strong>{customer.name}</strong>{customer.legal_name && customer.legal_name !== customer.name ? <span className="block text-xs text-neutral-500">{customer.legal_name}</span> : null}</span><span className="font-mono text-xs text-neutral-500">{customer.tax_id || `#${customer.id}`}</span></button>) : visibleItems.map((item) => <button className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-paper" key={item.id} onClick={() => selectItem(item)} type="button"><span><strong className="font-mono">{item.code}</strong>{item.legacy_code ? <span className="ml-2 font-mono text-neutral-500">Anterior: {item.legacy_code}</span> : null}<span className="ml-2">{item.name}</span></span><span className="text-xs text-neutral-500">{item.family_code || "Sin familia"}</span></button>)}
            {lookup === "customer" && !visibleCustomers.length ? <p className="p-6 text-center text-sm text-neutral-500">No hay clientes que coincidan con la búsqueda.</p> : null}{lookup === "item" && !visibleItems.length ? <p className="p-6 text-center text-sm text-neutral-500">No hay productos que coincidan con la búsqueda.</p> : null}</div></div>
      </ModalFrame> : null}
    </div>
  );
}
