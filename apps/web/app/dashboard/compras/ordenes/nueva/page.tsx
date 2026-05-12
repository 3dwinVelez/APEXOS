"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileText,
  Filter,
  Layers3,
  PackagePlus,
  Plus,
  Receipt,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  Warehouse
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { LATAM_CURRENCIES, currencyForCountry, money, taxRatesForCountry } from "@/lib/latam";
import { ComprasNav } from "@/components/compras-nav";

type Supplier = { id: number; name: string; tax_id: string; email: string; city: string; country: string; credit_days: number };
type Item = {
  id: number;
  code: string;
  name: string;
  unit: string;
  unit_cost: number;
  stock_current: number;
  stock_min: number;
  stock_max: number;
  abc_class: string;
};

type PurchaseOrder = {
  id: number;
  number: string;
  status: string;
  total: number;
  subtotal: number;
  tax_total: number;
  currency: string;
  due_date: string;
  party: Supplier;
  metadata: { priority: string; warehouse_id: number; tags: string[]; wms: { inbound_order: string } };
  received_percent: number;
  pending_quantity: number;
  lines: Array<{ id: number; description: string; qty: number; unit_cost: number; total: number; received_quantity: number; pending_quantity: number }>;
};

type PoLine = {
  localId: string;
  item_id: number;
  sku: string;
  description: string;
  unit: string;
  qty: number;
  unit_cost: number;
  discount: number;
  tax_rate: number;
  expected_at: string;
  notes: string;
  stock_current: number;
  stock_min: number;
  stock_max: number;
  abc_class: string;
};

type WorkspaceTab = "crear" | "ordenes" | "trazabilidad";
type AssistantPanel = "inventario" | "wms" | "finanzas";

const statusLabels: Record<string, string> = {
  draft: "Borrador",
  pending_approval: "Pendiente aprobacion",
  sent: "Enviada",
  confirmed: "Aprobada",
  partial: "Recibida parcial",
  received: "Recibida",
  cancelled: "Cancelada",
  closed: "Cerrada"
};

const warehouses = [
  { id: 1, name: "CEDI Principal" },
  { id: 2, name: "Bodega Norte" },
  { id: 3, name: "Tienda / cross dock" }
];

const templates = [
  { name: "Reposicion critica", priority: "alta", tag: "stock critico", detail: "Cubre minimos y productos ABC." },
  { name: "Compra mensual", priority: "normal", tag: "recurrente", detail: "Orden base para abastecimiento." },
  { name: "Urgencia WMS", priority: "urgente", tag: "inbound hoy", detail: "Prioriza recepcion y putaway." }
];

export default function NuevaOCPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("crear");
  const [assistantPanel, setAssistantPanel] = useState<AssistantPanel>("inventario");
  const [form, setForm] = useState({
    supplier_id: 0,
    warehouse_id: 1,
    expected_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    priority: "normal",
    currency: "USD",
    payment_terms: "30 dias",
    tags: "abastecimiento",
    notes: ""
  });
  const [lines, setLines] = useState<PoLine[]>([]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "No fue posible cargar compras"));
  }, []);

  async function load() {
    const [supplierData, itemData, orderData] = await Promise.all([
      api<Supplier[]>("/api/v1/purchases/suppliers"),
      api<{ data: Item[] }>("/api/v1/inventory/items"),
      api<PurchaseOrder[]>("/api/v1/purchases/orders")
    ]);
    setSuppliers(supplierData || []);
    setItems(itemData.data || []);
    setOrders(orderData || []);
    setSelectedOrder((orderData || [])[0] || null);
  }

  const supplier = suppliers.find((entry) => entry.id === Number(form.supplier_id));
  const taxRates = taxRatesForCountry(supplier?.country || "CO");

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = needle ? items.filter((item) => [item.code, item.name, item.abc_class || ""].some((value) => value.toLowerCase().includes(needle))) : items;
    return source.slice(0, 8);
  }, [items, query]);

  const smartItems = useMemo(() => {
    return items
      .filter((item) => Number(item.stock_current) <= Number(item.stock_min))
      .sort((a, b) => Number(a.stock_current) - Number(b.stock_current))
      .slice(0, 6);
  }, [items]);

  const visibleOrders = useMemo(() => {
    return orders.filter((order) => {
      const byStatus = orderFilter === "all" || order.status === orderFilter;
      const needle = query.trim().toLowerCase();
      const byQuery = !needle || [order.number, order.party.name || "", order.status].some((value) => value.toLowerCase().includes(needle));
      return byStatus && byQuery;
    });
  }, [orders, orderFilter, query]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.qty * line.unit_cost - line.discount), 0);
    const taxes = lines.reduce((sum, line) => sum + Math.max(0, line.qty * line.unit_cost - line.discount) * (line.tax_rate / 100), 0);
    return { subtotal, taxes, total: subtotal + taxes };
  }, [lines]);

  const criticalLineCount = lines.filter((line) => line.stock_current <= line.stock_min).length;
  const canCreate = Boolean(form.supplier_id && lines.length);

  function addItem(item: Item) {
    setLines((current) => {
      const existing = current.find((line) => line.item_id === item.id);
      if (existing) return current.map((line) => line.item_id === item.id ? { ...line, qty: line.qty + suggestedQty(item) } : line);
      return [
        ...current,
        {
          localId: crypto.randomUUID(),
          item_id: item.id,
          sku: item.code,
          description: item.name,
          unit: item.unit || "UND",
          qty: suggestedQty(item),
          unit_cost: Number(item.unit_cost || 0),
          discount: 0,
          tax_rate: 0,
          expected_at: form.expected_at,
          notes: "",
          stock_current: Number(item.stock_current || 0),
          stock_min: Number(item.stock_min || 0),
          stock_max: item.stock_max,
          abc_class: item.abc_class || "C"
        }
      ];
    });
    setQuery("");
  }

  function suggestedQty(item: Item) {
    if (item.stock_max && item.stock_max > item.stock_current) return Math.max(1, Math.ceil(item.stock_max - item.stock_current));
    if (item.stock_current <= item.stock_min) return Math.max(1, Math.ceil(item.stock_min * 2 || 1));
    return 1;
  }

  function updateLine(id: string, patch: Partial<PoLine>) {
    setLines((current) => current.map((line) => line.localId === id ? { ...line, ...patch } : line));
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.localId !== id));
  }

  function applyTemplate(template: (typeof templates)[number]) {
    setForm((current) => ({ ...current, priority: template.priority, tags: template.tag }));
  }

  async function createOrder(approve = false) {
    setSaving(true);
    setError("");
    setOk("");
    try {
      if (!form.supplier_id) throw new Error("Selecciona un proveedor");
      if (!lines.length) throw new Error("Agrega al menos un producto");
      const po = await api<PurchaseOrder>("/api/v1/purchases/orders", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(form.supplier_id),
          expected_at: form.expected_at,
          warehouse_id: Number(form.warehouse_id),
          priority: form.priority,
          currency: form.currency,
          payment_terms: form.payment_terms,
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          notes: form.notes,
          lines: lines.map((line) => ({
            item_id: line.item_id,
            qty: Number(line.qty),
            unit_cost: Number(line.unit_cost),
            unit: line.unit,
            discount: Number(line.discount || 0),
            tax_rate: Number(line.tax_rate || 0),
            expected_at: line.expected_at,
            notes: line.notes || undefined
          }))
        })
      });
      const finalPo = approve ? await api<PurchaseOrder>(`/api/v1/purchases/orders/${po.id}/approve`, { method: "POST", body: JSON.stringify({}) }) : po;
      setOk(approve ? `${finalPo.number} aprobada y lista para WMS` : `${po.number} creada en borrador`);
      setSelectedOrder(finalPo);
      setLines([]);
      setActiveTab("ordenes");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la OC");
    } finally {
      setSaving(false);
    }
  }

  async function approveOrder(order: PurchaseOrder) {
    setError("");
    const updated = await api<PurchaseOrder>(`/api/v1/purchases/orders/${order.id}/approve`, { method: "POST", body: JSON.stringify({}) });
    setSelectedOrder(updated);
    setOk(`${updated.number} aprobada. InboundOrder disponible para WMS.`);
    await load();
  }

  async function duplicateOrder(order: PurchaseOrder) {
    const duplicated = await api<PurchaseOrder>(`/api/v1/purchases/orders/${order.id}/duplicate`, { method: "POST", body: JSON.stringify({}) });
    setSelectedOrder(duplicated);
    setOk(`${order.number} duplicada como ${duplicated.number}`);
    setActiveTab("ordenes");
    await load();
  }

  async function createReceipt(order: PurchaseOrder) {
    const receipt = await api<{ id: string }>(`/api/v1/purchases/orders/${order.id}/create-receipt`, { method: "POST", body: JSON.stringify({}) });
    setOk(`${receipt.id} listo para recepcion movil y putaway`);
  }

  return (
    <div className="space-y-4">
      <header className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-medium text-apex">Compras / Orden de compra</p>
              <h1 className="mt-1 text-3xl font-semibold">Workspace de abastecimiento</h1>
              <p className="mt-1 max-w-3xl text-sm text-neutral-600">
                Crea la OC, controla costos, dispara WMS y mantiene trazabilidad sin convertir compras en un formulario pesado.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <HeaderMetric label="Borrador" value={money(totals.total, form.currency)} />
              <HeaderMetric label="Lineas" value={String(lines.length)} />
              <HeaderMetric label="Riesgo stock" value={String(criticalLineCount)} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedNav active={activeTab} onChange={setActiveTab} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ActionButton icon={Save} label="Guardar borrador" disabled={saving || !canCreate} onClick={() => createOrder(false)} variant="secondary" />
            <ActionButton icon={Send} label="Crear y aprobar" disabled={saving || !canCreate} onClick={() => createOrder(true)} variant="primary" />
          </div>
        </div>
      </header>

      <ComprasNav />

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p> : null}

      {suppliers.length === 0 || items.length === 0 ? (
        <section className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-amber-900">Faltan datos maestros para crear una OC</p>
            <p className="mt-1 text-sm text-amber-800">Necesitas al menos un proveedor activo y un producto de inventario para mantener el flujo confiable.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center rounded-md border border-amber-300 bg-white px-3 text-sm text-amber-900 hover:bg-amber-100" href="/dashboard/compras/proveedores">Crear proveedor</Link>
            <Link className="inline-flex h-10 items-center rounded-md border border-amber-300 bg-white px-3 text-sm text-amber-900 hover:bg-amber-100" href="/dashboard/inventario/productos/nuevo">Crear producto</Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {activeTab === "crear" ? (
            <>
              <section className="rounded-md border border-line bg-white">
                <PanelHeader icon={PackagePlus} title="Construir OC" detail="Primero lo esencial; la configuracion avanzada vive en paneles auxiliares." />
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 lg:grid-cols-4">
                    <Field label="Proveedor">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.supplier_id} onChange={(e) => {
                        const supplierId = Number(e.target.value);
                        const selected = suppliers.find((entry) => entry.id === supplierId);
                        setForm((p) => ({ ...p, supplier_id: supplierId, currency: currencyForCountry(selected.country, p.currency) }));
                      }}>
                        <option value={0}>Seleccionar proveedor</option>
                        {suppliers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Bodega destino">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.warehouse_id} onChange={(e) => setForm((p) => ({ ...p, warehouse_id: Number(e.target.value) }))}>
                        {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Entrega esperada">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={form.expected_at} onChange={(e) => setForm((p) => ({ ...p, expected_at: e.target.value }))} />
                    </Field>
                    <Field label="Prioridad">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                        <option value="normal">Normal</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1fr_150px_150px]">
                    <Field label="Observaciones operativas">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: entregar en muelle 2, validar lote y vencimiento" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                    </Field>
                    <Field label="Moneda">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}>
                        {LATAM_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </Field>
                    <Field label="Pago">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.payment_terms} onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))} />
                    </Field>
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-line bg-white">
                <PanelHeader
                  icon={Boxes}
                  title="Productos"
                  detail="Agrega SKU por busqueda, sugerencias de inventario o cargas masivas."
                  actions={(
                    <div className="flex flex-wrap gap-2">
                      <ActionButton icon={Upload} label="Importar" variant="ghost" compact />
                      <ActionButton icon={Copy} label="Pegar Excel" variant="ghost" compact />
                    </div>
                  )}
                />

                <div className="space-y-4 p-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 text-neutral-400" size={16} />
                      <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar SKU, producto, ABC o estado de inventario" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </div>
                    <span className="rounded-md border border-line bg-paper px-3 py-2 text-xs text-neutral-600">
                      {query ? `${filteredItems.length} resultados` : `${smartItems.length} sugeridos`}
                    </span>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {(query ? filteredItems : smartItems).map((item) => (
                      <button className="rounded-md border border-line bg-paper p-3 text-left text-sm hover:border-apex hover:bg-white" key={item.id} onClick={() => addItem(item)} type="button">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{item.code}</span>
                          <Plus size={15} className="text-apex" />
                        </span>
                        <span className="mt-1 block truncate text-neutral-600">{item.name}</span>
                        <span className="mt-2 block text-xs text-neutral-500">Stock {item.stock_current} / min {item.stock_min} / sugerido {suggestedQty(item)}</span>
                      </button>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-md border border-line">
                    <table className="w-full min-w-[1060px] text-sm">
                      <thead className="bg-paper">
                        <tr className="text-left text-neutral-600">
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Descripcion</th>
                          <th className="px-3 py-2">Inventario</th>
                          <th className="px-3 py-2">Cant.</th>
                          <th className="px-3 py-2">Costo</th>
                          <th className="px-3 py-2">Desc.</th>
                          <th className="px-3 py-2">Imp.</th>
                          <th className="px-3 py-2">Entrega</th>
                          <th className="px-3 py-2">Subtotal</th>
                          <th className="px-3 py-2 text-right">Accion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr className="border-t border-line/70" key={line.localId}>
                            <td className="px-3 py-2 font-semibold">{line.sku}</td>
                            <td className="px-3 py-2">{line.description}</td>
                            <td className="px-3 py-2"><InventorySignal line={line} /></td>
                            <td className="px-3 py-2"><NumberInput value={line.qty} onChange={(value) => updateLine(line.localId, { qty: value })} /></td>
                            <td className="px-3 py-2"><MoneyInput value={line.unit_cost} onChange={(value) => updateLine(line.localId, { unit_cost: value })} /></td>
                            <td className="px-3 py-2"><MoneyInput value={line.discount} onChange={(value) => updateLine(line.localId, { discount: value })} /></td>
                            <td className="px-3 py-2"><TaxSelect rates={taxRates} value={line.tax_rate} onChange={(value) => updateLine(line.localId, { tax_rate: value })} /></td>
                            <td className="px-3 py-2"><input className="h-9 rounded-md border border-line px-2 text-xs" type="date" value={line.expected_at} onChange={(e) => updateLine(line.localId, { expected_at: e.target.value })} /></td>
                            <td className="px-3 py-2 font-medium">{money(Math.max(0, line.qty * line.unit_cost - line.discount) * (1 + line.tax_rate / 100), form.currency)}</td>
                            <td className="px-3 py-2 text-right">
                              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-neutral-500 hover:bg-paper" onClick={() => removeLine(line.localId)} type="button" aria-label="Quitar linea">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {lines.length === 0 ? (
                          <tr>
                            <td className="px-3 py-10 text-center text-neutral-500" colSpan={10}>Agrega productos criticos, busca SKU o importa una cotizacion.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === "ordenes" ? (
            <section className="rounded-md border border-line bg-white">
              <PanelHeader
                icon={ClipboardCheck}
                title="Ordenes recientes"
                detail="Selecciona una OC y ejecuta acciones desde una sola barra operativa."
                actions={(
                  <div className="flex gap-2">
                    <select className="h-9 rounded-md border border-line px-2 text-xs" value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}>
                      <option value="all">Todas</option>
                      {Object.keys(statusLabels).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                    <span className="inline-flex h-9 items-center gap-1 rounded-md border border-line px-2 text-xs text-neutral-500"><Filter size={13} /> {visibleOrders.length}</span>
                  </div>
                )}
              />

              <div className="grid gap-4 p-4 lg:grid-cols-[320px_1fr]">
                <div className="space-y-2">
                  {visibleOrders.slice(0, 12).map((order) => (
                    <button className={`w-full rounded-md border p-3 text-left text-sm hover:border-apex ${selectedOrder?.id === order.id ? "border-apex bg-[#146C6312]" : "border-line"}`} key={order.id} onClick={() => setSelectedOrder(order)} type="button">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{order.number}</span>
                        <StatusPill status={order.status} />
                      </span>
                      <span className="mt-1 block truncate text-xs text-neutral-500">{order.party.name || "Proveedor"} / {money(order.total, order.currency || currencyForCountry(order.party.country))}</span>
                    </button>
                  ))}
                </div>

                <SelectedOrderCard selectedOrder={selectedOrder} onApprove={approveOrder} onDuplicate={duplicateOrder} onReceipt={createReceipt} />
              </div>
            </section>
          ) : null}

          {activeTab === "trazabilidad" ? (
            <section className="rounded-md border border-line bg-white">
              <PanelHeader icon={Layers3} title="Trazabilidad end-to-end" detail="La OC funciona como documento central entre compras, WMS, inventario y finanzas." />
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="rounded-md border border-line p-4">
                  <h3 className="mb-3 text-sm font-semibold">Flujo operativo</h3>
                  <TimelineItem icon={FileText} title="OC creada" detail="Documento central de abastecimiento" done />
                  <TimelineItem icon={ClipboardCheck} title="Aprobacion" detail="Reglas por monto, proveedor o centro operativo" done={selectedOrder?.status !== "draft"} />
                  <TimelineItem icon={Warehouse} title="WMS inbound" detail="Recepcion movil, conteo y putaway" done={Boolean(selectedOrder?.metadata.wms.inbound_order)} />
                  <TimelineItem icon={Receipt} title="Factura / CxP" detail="Referencia financiera y pagos" />
                </div>
                <div className="rounded-md border border-line p-4">
                  <h3 className="mb-3 text-sm font-semibold">Links operativos</h3>
                  <TraceLink icon={Warehouse} label="Recepciones WMS" value={selectedOrder?.metadata.wms.inbound_order || "Pendiente"} />
                  <TraceLink icon={Boxes} label="Inventario" value={`${selectedOrder?.lines.length || 0} lineas conectadas`} />
                  <TraceLink icon={Receipt} label="Finanzas" value={selectedOrder ? money(selectedOrder.total, selectedOrder.currency || currencyForCountry(selectedOrder.party.country)) : "-"} />
                  <TraceLink icon={Truck} label="Proveedor" value={selectedOrder?.party.name || "Sin OC seleccionada"} />
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-md border border-line bg-white">
            <PanelHeader icon={SlidersHorizontal} title="Centro de control" detail="Resumen, automatizaciones y paneles de apoyo." />
            <div className="space-y-4 p-4">
              <div className="space-y-2 text-sm">
                <MetricRow label="Subtotal" value={money(totals.subtotal, form.currency)} />
                <MetricRow label="Impuestos" value={money(totals.taxes, form.currency)} />
                <MetricRow label="Total OC" value={money(totals.total, form.currency)} strong />
              </div>
              <div className="grid gap-2">
                <ActionButton icon={Save} label="Guardar borrador" disabled={saving || !canCreate} onClick={() => createOrder(false)} variant="secondary" />
                <ActionButton icon={Send} label="Crear y aprobar" disabled={saving || !canCreate} onClick={() => createOrder(true)} variant="primary" />
              </div>
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <div className="grid grid-cols-3 gap-1 rounded-md bg-paper p-1">
              <PanelTab label="Inventario" active={assistantPanel === "inventario"} onClick={() => setAssistantPanel("inventario")} />
              <PanelTab label="WMS" active={assistantPanel === "wms"} onClick={() => setAssistantPanel("wms")} />
              <PanelTab label="Finanzas" active={assistantPanel === "finanzas"} onClick={() => setAssistantPanel("finanzas")} />
            </div>
            <div className="mt-4">
              {assistantPanel === "inventario" ? (
                <div className="space-y-2 text-sm">
                  <MetricRow label="Proveedor" value={supplier?.name || "Sin seleccionar"} />
                  <MetricRow label="Lineas criticas" value={`${criticalLineCount} lineas`} />
                  <MetricRow label="Sugeridos" value={`${smartItems.length} SKU`} />
                  <MetricRow label="Lead time" value={supplier ? "6.4 dias" : "-"} />
                </div>
              ) : null}
              {assistantPanel === "wms" ? (
                <div>
                  <FlowStep icon={CheckCircle2} title="OC aprobada" detail="Libera el abastecimiento" active />
                  <FlowStep icon={Warehouse} title="InboundOrder" detail="Disponible para recepcion movil" active={selectedOrder?.status === "confirmed" || selectedOrder?.status === "partial"} />
                  <FlowStep icon={Truck} title="Recibo + putaway" detail="Valida diferencias y destino" active={Boolean(selectedOrder?.received_percent)} />
                </div>
              ) : null}
              {assistantPanel === "finanzas" ? (
                <div className="space-y-2 text-sm">
                  <MetricRow label="Condicion pago" value={form.payment_terms} />
                  <MetricRow label="Moneda" value={form.currency} />
                  <MetricRow label="Base CxP" value={money(totals.total, form.currency)} />
                  <MetricRow label="Centro costo" value="Operativo" />
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Plantillas rapidas</h2>
            <div className="mt-3 space-y-2">
              {templates.map((template) => (
                <button className="w-full rounded-md border border-line p-3 text-left hover:border-apex hover:bg-paper" key={template.name} onClick={() => applyTemplate(template)} type="button">
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {template.name}
                    <ChevronRight size={15} />
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">{template.detail}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function SegmentedNav({ active, onChange }: { active: WorkspaceTab; onChange: (tab: WorkspaceTab) => void }) {
  const tabs: Array<{ id: WorkspaceTab; label: string; icon: LucideIcon }> = [
    { id: "crear", label: "Crear OC", icon: PackagePlus },
    { id: "ordenes", label: "Ordenes", icon: ClipboardCheck },
    { id: "trazabilidad", label: "Trazabilidad", icon: Layers3 }
  ];
  return (
    <div className="grid gap-1 rounded-md bg-paper p-1 sm:inline-grid sm:grid-cols-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm ${active === tab.id ? "bg-white text-apex shadow-sm" : "text-neutral-600 hover:bg-white/70"}`} key={tab.id} onClick={() => onChange(tab.id)} type="button">
            <Icon size={15} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function PanelHeader({ icon: Icon, title, detail, actions }: { icon: LucideIcon; title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#146C6312] text-apex">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {detail ? <p className="text-sm text-neutral-500">{detail}</p> : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

function SelectedOrderCard({ selectedOrder, onApprove, onDuplicate, onReceipt }: { selectedOrder: PurchaseOrder | null; onApprove: (order: PurchaseOrder) => void; onDuplicate: (order: PurchaseOrder) => void; onReceipt: (order: PurchaseOrder) => void }) {
  if (!selectedOrder) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-md border border-dashed border-line bg-paper text-sm text-neutral-500">
        Selecciona una OC para ver acciones, recepcion y trazabilidad.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line">
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-neutral-500">Orden seleccionada</p>
          <h2 className="text-2xl font-semibold">{selectedOrder.number}</h2>
          <p className="text-sm text-neutral-600">{selectedOrder.party.name} / {statusLabels[selectedOrder.status] || selectedOrder.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={Copy} label="Duplicar" variant="ghost" compact onClick={() => onDuplicate(selectedOrder)} />
          <ActionButton icon={ClipboardCheck} label="Aprobar" variant="secondary" compact onClick={() => onApprove(selectedOrder)} />
          <ActionButton icon={Receipt} label="Recepcion WMS" variant="primary" compact onClick={() => onReceipt(selectedOrder)} />
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-4">
        <HeaderMetric label="Recibido" value={`${selectedOrder.received_percent || 0}%`} />
        <HeaderMetric label="Pendiente" value={String(selectedOrder.pending_quantity || 0)} />
        <HeaderMetric label="Total" value={money(selectedOrder.total, selectedOrder.currency || currencyForCountry(selectedOrder.party.country))} />
        <HeaderMetric label="Inbound" value={selectedOrder.metadata.wms.inbound_order || "pendiente"} />
      </div>
      <div className="border-t border-line p-4">
        <h3 className="mb-3 text-sm font-semibold">Lineas de compra</h3>
        <div className="space-y-2">
          {selectedOrder.lines.slice(0, 6).map((line) => (
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2 text-sm" key={line.id}>
              <span className="min-w-0 truncate">{line.description}</span>
              <span className="shrink-0 font-medium">{line.qty} und</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, variant, compact, disabled, onClick }: { icon: LucideIcon; label: string; variant: "primary" | "secondary" | "ghost"; compact?: boolean; disabled?: boolean; onClick?: () => void }) {
  const styles = {
    primary: "bg-apex text-white hover:bg-apex/90 disabled:bg-apex/50",
    secondary: "border border-line bg-white text-neutral-800 hover:bg-paper disabled:text-neutral-400",
    ghost: "border border-line bg-white text-neutral-700 hover:bg-paper disabled:text-neutral-400"
  };
  return (
    <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium disabled:cursor-not-allowed ${compact ? "h-9 text-xs" : ""} ${styles[variant]}`} disabled={disabled} onClick={onClick} type="button">
      <Icon size={compact ? 14 : 16} />
      {label}
    </button>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2">
      <p className="truncate text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, suffix, onChange }: { value: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-line bg-white">
      <input className="h-full w-20 rounded-md px-2 text-sm outline-none" min={0} step="0.01" type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix ? <span className="pr-2 text-xs text-neutral-500">{suffix}</span> : null}
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <NumberInput value={value} onChange={onChange} />;
}

function TaxSelect({ rates, value, onChange }: { rates: readonly number[]; value: number; onChange: (value: number) => void }) {
  return (
    <select className="h-9 rounded-md border border-line px-2 text-xs" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {rates.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
    </select>
  );
}

function InventorySignal({ line }: { line: PoLine }) {
  const critical = line.stock_current <= line.stock_min;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${critical ? "bg-amber-50 text-amber-800" : "bg-neutral-100 text-neutral-700"}`}>
      {critical ? <AlertTriangle size={12} /> : <Sparkles size={12} />}
      {line.stock_current}/{line.stock_min} / {line.abc_class}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const critical = ["cancelled", "partial"].includes(status);
  return <span className={`rounded-full px-2 py-1 text-[11px] ${critical ? "bg-amber-50 text-amber-800" : "bg-neutral-100 text-neutral-700"}`}>{statusLabels[status] || status}</span>;
}

function MetricRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-neutral-500">{label}</span>
      <span className={strong ? "text-lg font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`h-8 rounded-md px-2 text-xs font-medium ${active ? "bg-white text-apex shadow-sm" : "text-neutral-600 hover:bg-white/70"}`} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function FlowStep({ icon: Icon, title, detail, active }: { icon: LucideIcon; title: string; detail: string; active?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-line py-3 last:border-b-0">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? "bg-[#146C6312] text-apex" : "bg-neutral-100 text-neutral-500"}`}>
        <Icon size={17} />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-neutral-500">{detail}</span>
      </span>
    </div>
  );
}

function TimelineItem({ icon: Icon, title, detail, done }: { icon: LucideIcon; title: string; detail: string; done?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-line py-3 last:border-b-0">
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${done ? "bg-[#146C6312] text-apex" : "bg-neutral-100 text-neutral-500"}`}>
        <Icon size={15} />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-neutral-500">{detail}</span>
      </span>
      {done ? <CheckCircle2 className="ml-auto text-apex" size={16} /> : <ArrowRight className="ml-auto text-neutral-400" size={16} />}
    </div>
  );
}

function TraceLink({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-neutral-500">{value}</span>
      </span>
      <ChevronRight className="ml-auto text-neutral-400" size={16} />
    </div>
  );
}
