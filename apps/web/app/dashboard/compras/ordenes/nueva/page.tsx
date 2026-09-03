"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Filter,
  Layers3,
  PackagePlus,
  Pencil,
  Plus,
  Receipt,
  Save,
  Search,
  Send,
  Trash2,
  Truck,
  Warehouse
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { LATAM_CURRENCIES, currencyForCountry, money } from "@/lib/latam";
import { ComprasNav } from "@/components/compras-nav";
import { ZeroFriendlyNumberInput } from "@/components/ui/ZeroFriendlyNumberInput";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { downloadPurchaseOrderPdf, type PurchaseOrderPdfData } from "@/lib/purchaseOrderPdf";

type Supplier = { id: number; name: string; tax_id: string; email: string; city: string; country: string; credit_days: number };
type Item = {
  id: number;
  code: string;
  legacy_code?: string | null;
  name: string;
  unit: string;
  unit_cost: number;
  tax_rate: number;
  stock_current: number;
  stock_min: number;
  stock_max: number;
  abc_class: string;
};
type WarehouseOption = { id: number; code: string; name: string; society_code: string; branch_code: string; active: boolean };

type PurchaseOrder = {
  id: number;
  number: string;
  status: string;
  total: number;
  subtotal: number;
  tax_total: number;
  currency: string;
  due_date: string;
  created_at: string;
  notes?: string | null;
  party: Supplier;
  metadata: { priority?: string; warehouse_id?: number; tags?: string[]; payment_terms?: string; expected_at?: string; wms?: { inbound_order?: string } };
  received_percent: number;
  pending_quantity: number;
  lines: Array<{ id: number; item_id: number; item?:{code:string;legacy_code?:string|null}|null; description: string; qty: number; unit?: string; unit_cost: number; discount?: number; total: number; metadata?: { expected_at?: string; notes?: string }; received_quantity: number; pending_quantity: number }>;
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

function blankLine(expectedAt: string): PoLine {
  return { localId: crypto.randomUUID(), item_id: 0, sku: "", description: "", unit: "UND", qty: 0, unit_cost: 0, discount: 0, tax_rate: 0, expected_at: expectedAt, notes: "", stock_current: 0, stock_min: 0, stock_max: 0, abc_class: "C" };
}

function blankLines(expectedAt: string, count = 10) {
  return Array.from({ length: count }, () => blankLine(expectedAt));
}

export default function NuevaOCPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [closingOrder, setClosingOrder] = useState<PurchaseOrder | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [skuSearchLineId, setSkuSearchLineId] = useState<string | null>(null);
  const [skuSearch, setSkuSearch] = useState("");
  const [skuSearchMessage, setSkuSearchMessage] = useState("");
  const [supplierSearchOpen,setSupplierSearchOpen]=useState(false);
  const [supplierSearch,setSupplierSearch]=useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("crear");
  const [form, setForm] = useState({
    supplier_id: 0,
    warehouse_id: 0,
    expected_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    priority: "normal",
    currency: "USD",
    payment_terms: "30 dias",
    tags: "abastecimiento",
    notes: ""
  });
  const [lines, setLines] = useState<PoLine[]>(() => blankLines(form.expected_at));

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "No fue posible cargar compras"));
  }, []);

  async function load() {
    const [supplierData, itemData, warehouseData, orderData] = await Promise.all([
      api<Supplier[]>("/api/v1/purchases/suppliers"),
      api<{ data: Item[] }>("/api/v1/inventory/items"),
      api<WarehouseOption[]>("/api/v1/inventory/warehouses"),
      api<PurchaseOrder[]>("/api/v1/purchases/orders")
    ]);
    setSuppliers(supplierData || []);
    setItems(itemData.data || []);
    const activeWarehouses = (warehouseData || []).filter((warehouse) => warehouse.active !== false);
    setWarehouses(activeWarehouses);
    setForm((current) => ({ ...current, warehouse_id: current.warehouse_id || activeWarehouses[0]?.id || 0 }));
    setOrders(orderData || []);
    setSelectedOrder((orderData || [])[0] || null);
  }

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = needle ? items.filter((item) => [item.code, item.legacy_code || "", item.name, item.abc_class || ""].some((value) => value.toLowerCase().includes(needle))) : items;
    return source.slice(0, 8);
  }, [items, query]);

  const smartItems = useMemo(() => {
    return items
      .filter((item) => Number(item.stock_current) <= Number(item.stock_min))
      .sort((a, b) => Number(a.stock_current) - Number(b.stock_current))
      .slice(0, 6);
  }, [items]);

  const skuSearchResults = useMemo(() => {
    const needle = skuSearch.trim().toLowerCase();
    return items.filter((item) => !needle || [item.code, item.legacy_code || "", item.name, item.abc_class || ""].some((value) => value.toLowerCase().includes(needle))).slice(0, 50);
  }, [items, skuSearch]);

  const visibleOrders = useMemo(() => {
    return orders.filter((order) => {
      const byStatus = orderFilter === "all" || order.status === orderFilter;
      const needle = query.trim().toLowerCase();
      const byQuery = !needle || [order.number, order.party.name || "", order.status].some((value) => value.toLowerCase().includes(needle));
      return byStatus && byQuery;
    });
  }, [orders, orderFilter, query]);

  const activeLines = lines.filter((line) => line.item_id && line.qty > 0);
  const canCreate = Boolean(form.supplier_id && form.warehouse_id && activeLines.length);

  function addItem(item: Item) {
    setLines((current) => {
      const existing = current.find((line) => line.item_id === item.id);
      if (existing) return current.map((line) => line.item_id === item.id ? { ...line, qty: line.qty + suggestedQty(item) } : line);
      const emptyIndex = current.findIndex((line) => !line.item_id);
      const nextLine = {
          localId: emptyIndex >= 0 ? current[emptyIndex].localId : crypto.randomUUID(),
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
        };
      if (emptyIndex < 0) return [...current, nextLine];
      return current.map((line, index) => index === emptyIndex ? nextLine : line);
    });
    setQuery("");
  }

  function updateSku(id: string, sku: string) {
    const normalized = sku.trim().toUpperCase();
    const item = items.find((entry) => entry.code.toUpperCase() === normalized || (entry.legacy_code || "").toUpperCase() === normalized);
    if (!item) return updateLine(id, { item_id: 0, sku: sku.toUpperCase(), description: "", qty: 0, unit_cost: 0, tax_rate: 0 });
    updateLine(id, { item_id: item.id, sku: item.code, description: item.name, unit: item.unit || "UND", qty: 1, unit_cost: Number(item.unit_cost || 0), tax_rate: 0, stock_current: Number(item.stock_current || 0), stock_min: Number(item.stock_min || 0), stock_max: Number(item.stock_max || 0), abc_class: item.abc_class || "C" });
  }

  function openSkuSearch(lineId: string, search = "", message = "") {
    setSkuSearchLineId(lineId);
    setSkuSearch(search);
    setSkuSearchMessage(message);
  }

  function handleSkuEnter(line: PoLine) {
    const code = line.sku.trim().toUpperCase();
    if (!code) return openSkuSearch(line.localId);
    const item = items.find((entry) => entry.code.toUpperCase() === code || (entry.legacy_code || "").toUpperCase() === code);
    if (item) return assignItemToLine(line.localId, item);
    const message = `El SKU ${code} no existe. Busca y selecciona un producto del maestro.`;
    setError(message);
    openSkuSearch(line.localId, code, message);
  }

  function assignItemToLine(lineId: string, item: Item) {
    updateLine(lineId, { item_id: item.id, sku: item.code, description: item.name, unit: item.unit || "UND", qty: 1, unit_cost: Number(item.unit_cost || 0), tax_rate: 0, stock_current: Number(item.stock_current || 0), stock_min: Number(item.stock_min || 0), stock_max: Number(item.stock_max || 0), abc_class: item.abc_class || "C" });
    setSkuSearchLineId(null);
    setSkuSearch("");
    setSkuSearchMessage("");
    setError("");
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
    setLines((current) => current.map((line) => line.localId === id ? blankLine(form.expected_at) : line));
  }

  function editOrder(order: PurchaseOrder) {
    if (order.status !== "draft") return setError("Solo se pueden editar ordenes de compra en borrador");
    const expectedAt = order.metadata?.expected_at || order.due_date?.slice(0, 10) || form.expected_at;
    const editLines = order.lines.map((line) => {
      const item = items.find((entry) => entry.id === line.item_id);
      return {
        localId: crypto.randomUUID(),
        item_id: line.item_id,
        sku: item?.code || "",
        description: line.description || item?.name || "",
        unit: line.unit || item?.unit || "UND",
        qty: Number(line.qty),
        unit_cost: Number(line.unit_cost),
        discount: Number(line.discount || 0),
        tax_rate: 0,
        expected_at: line.metadata?.expected_at || expectedAt,
        notes: line.metadata?.notes || "",
        stock_current: Number(item?.stock_current || 0),
        stock_min: Number(item?.stock_min || 0),
        stock_max: Number(item?.stock_max || 0),
        abc_class: item?.abc_class || "C"
      };
    });
    setEditingOrder(order);
    setSelectedOrder(order);
    setForm({
      supplier_id: order.party.id,
      warehouse_id: Number(order.metadata?.warehouse_id || 0),
      expected_at: expectedAt,
      priority: order.metadata?.priority || "normal",
      currency: order.currency || "USD",
      payment_terms: order.metadata?.payment_terms || "30 dias",
      tags: (order.metadata?.tags || []).join(", "),
      notes: order.notes || ""
    });
    setLines([...editLines, ...blankLines(expectedAt, Math.max(0, 10 - editLines.length))]);
    setError("");
    setOk(`Editando ${order.number}. Los cambios conservaran el mismo numero de orden.`);
    setActiveTab("crear");
  }

  function cancelEdit() {
    setEditingOrder(null);
    setLines(blankLines(form.expected_at));
    setOk("");
  }

  async function createOrder(approve = false, createAnother = false) {
    setSaving(true);
    setError("");
    setOk("");
    try {
      if (!form.supplier_id) throw new Error("Selecciona un proveedor");
      if (!form.warehouse_id) throw new Error("Selecciona una bodega destino");
      if (!activeLines.length) throw new Error("Ingresa al menos un SKU válido con cantidad");
      const po = await api<PurchaseOrder>(editingOrder ? `/api/v1/purchases/orders/${editingOrder.id}` : "/api/v1/purchases/orders", {
        method: editingOrder ? "PUT" : "POST",
        body: JSON.stringify({
          supplier_id: Number(form.supplier_id),
          expected_at: form.expected_at,
          warehouse_id: Number(form.warehouse_id),
          priority: form.priority,
          currency: form.currency,
          payment_terms: form.payment_terms,
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          notes: form.notes,
          lines: activeLines.map((line) => ({
            item_id: line.item_id,
            qty: Number(line.qty),
            unit_cost: Number(line.unit_cost),
            unit: line.unit,
            discount: Number(line.discount || 0),
            tax_rate: 0,
            expected_at: line.expected_at,
            notes: line.notes || undefined
          }))
        })
      });
      const finalPo = approve ? await api<PurchaseOrder>(`/api/v1/purchases/orders/${po.id}/approve`, { method: "POST", body: JSON.stringify({}) }) : po;
      setOk(approve ? `${finalPo.number} aprobada y lista para WMS` : editingOrder ? `${po.number} actualizada en borrador` : `${po.number} creada en borrador`);
      setEditingOrder(null);
      setLines(blankLines(form.expected_at));
      if (createAnother) {
        setSelectedOrder(null);
        setForm((current) => ({ ...current, notes: "" }));
        setActiveTab("crear");
      } else {
        setSelectedOrder(finalPo);
        setActiveTab("ordenes");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la OC");
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

  async function downloadOrder(order: PurchaseOrder) {
    setError("");
    try {
      const printable = await api<PurchaseOrderPdfData>(`/api/v1/purchases/orders/${order.id}/print-data`);
      downloadPurchaseOrderPdf(printable);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible generar el PDF de la orden");
    }
  }

  async function closeOrder() {
    if (!closingOrder) return;
    const reason = closeReason.trim();
    if (reason.length < 3) return setError("Escribe el motivo por el cual se cierra la orden");
    setSaving(true);
    setError("");
    try {
      await api<PurchaseOrder>(`/api/v1/purchases/orders/${closingOrder.id}/close`, { method: "POST", body: JSON.stringify({ reason }) });
      const refreshed = await api<PurchaseOrder[]>("/api/v1/purchases/orders");
      setOrders(refreshed || []);
      setSelectedOrder((refreshed || []).find((order) => order.id === closingOrder.id) || null);
      setOk(`${closingOrder.number} cerrada. El saldo pendiente ya no queda disponible para recepcion.`);
      setClosingOrder(null);
      setCloseReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible cerrar la orden");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <p className="text-sm font-medium text-apex">Compras / Orden de compra</p>
          <h1 className="mt-1 text-2xl font-semibold">Orden de compra</h1>
          <p className="mt-1 text-sm text-neutral-600">Crea, consulta y aprueba órdenes de abastecimiento.</p>
        </div>

        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedNav active={activeTab} onChange={setActiveTab} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {editingOrder ? <ActionButton icon={Trash2} label="Cancelar edicion" disabled={saving} onClick={cancelEdit} variant="ghost" /> : null}
            <ActionButton icon={Save} label={editingOrder ? "Guardar cambios" : "Guardar borrador"} disabled={saving || !canCreate} onClick={() => createOrder(false)} variant="secondary" />
            {!editingOrder ? <ActionButton icon={Plus} label="Aprobar y nueva" disabled={saving || !canCreate} onClick={() => createOrder(true, true)} variant="secondary" /> : null}
            <ActionButton icon={Send} label={editingOrder ? "Guardar y aprobar" : "Crear y aprobar"} disabled={saving || !canCreate} onClick={() => createOrder(true)} variant="primary" />
          </div>
        </div>
      </header>

      <ComprasNav />

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p> : null}

      {suppliers.length === 0 || items.length === 0 || warehouses.length === 0 ? (
        <section className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-amber-900">Faltan datos maestros para crear una OC</p>
            <p className="mt-1 text-sm text-amber-800">Necesitas al menos un proveedor activo, una bodega destino y un producto de inventario para mantener el flujo confiable.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center rounded-md border border-amber-300 bg-white px-3 text-sm text-amber-900 hover:bg-amber-100" href="/dashboard/compras/proveedores">Crear proveedor</Link>
            <Link className="inline-flex h-10 items-center rounded-md border border-amber-300 bg-white px-3 text-sm text-amber-900 hover:bg-amber-100" href="/dashboard/inventario/bodegas">Crear bodega</Link>
            <Link className="inline-flex h-10 items-center rounded-md border border-amber-300 bg-white px-3 text-sm text-amber-900 hover:bg-amber-100" href="/dashboard/inventario/productos/nuevo">Crear producto</Link>
          </div>
        </section>
      ) : null}

      <section>
        <div className="space-y-4">
          {activeTab === "crear" ? (
            <>
              {editingOrder ? (
                <div className="flex flex-col gap-2 rounded-md border border-apex/30 bg-[#146C6312] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-semibold text-apex">Editando borrador {editingOrder.number}</p><p className="text-xs text-neutral-600">Al guardar se actualizara esta misma orden.</p></div>
                  <button className="text-sm font-medium text-apex hover:underline" onClick={cancelEdit} type="button">Cancelar edicion</button>
                </div>
              ) : null}
              <section className="rounded-md border border-line bg-white">
                <PanelHeader icon={PackagePlus} title="Datos de la orden" detail="Proveedor, destino, entrega y condiciones." />
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 lg:grid-cols-4">
                    <Field label="Proveedor">
                      <input className="control" placeholder="Escribe NIT o Enter para buscar" value={form.supplier_id?(suppliers.find(s=>s.id===form.supplier_id)?.tax_id||""):supplierSearch} onChange={e=>{setSupplierSearch(e.target.value);const match=suppliers.find(s=>s.tax_id===e.target.value.trim());setForm(p=>({...p,supplier_id:match?.id||0}))}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();setSupplierSearchOpen(true)}}}/>
                    </Field>
                    <Field label="Nombre del proveedor"><input className="control bg-paper" readOnly value={suppliers.find(s=>s.id===form.supplier_id)?.name||""}/></Field>
                    <Field label="Bodega destino">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" disabled={!warehouses.length} value={form.warehouse_id} onChange={(e) => setForm((p) => ({ ...p, warehouse_id: Number(e.target.value) }))}>
                        {warehouses.length ? <option value={0}>Seleccionar bodega</option> : <option value={0}>Crea una bodega primero</option>}
                        {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name} / {warehouse.society_code}-{warehouse.branch_code}</option>)}
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
                <PanelHeader icon={Boxes} title="Productos" detail="Escribe el SKU directamente en la tabla o selecciónalo desde el buscador." />

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
                          <span className="font-semibold">{item.code}</span>{item.legacy_code ? <span className="block text-xs text-neutral-500">Anterior: {item.legacy_code}</span> : null}
                          <Plus size={15} className="text-apex" />
                        </span>
                        <span className="mt-1 block truncate text-neutral-600">{item.name}</span>
                        <span className="mt-2 block text-xs text-neutral-500">Stock {item.stock_current} / mínimo {item.stock_min} / sugerido {suggestedQty(item)}</span>
                      </button>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-md border border-line">
                    <datalist id="purchase-order-skus">{items.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</datalist>
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-paper">
                        <tr className="text-left text-neutral-600">
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Descripcion</th>
                          <th className="px-3 py-2">Cant.</th>
                          <th className="px-3 py-2">Costo</th>
                          <th className="px-3 py-2">Subtotal</th>
                          <th className="px-3 py-2 text-right">Accion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr className="border-t border-line/70" key={line.localId}>
                            <td className="px-3 py-2"><input aria-label="SKU" className="h-9 w-44 rounded-md border border-line px-2 font-mono text-sm uppercase" list="purchase-order-skus" placeholder="Escribe o Enter para buscar" value={line.sku} onChange={(event) => updateSku(line.localId, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleSkuEnter(line); } }} /></td>
                            <td className="px-3 py-2">{line.description || <span className="text-neutral-400">Seleccione un SKU existente</span>}</td>
                            <td className="px-3 py-2"><NumberInput value={line.qty} onChange={(value) => updateLine(line.localId, { qty: value })} /></td>
                            <td className="px-3 py-2"><MoneyInput value={line.unit_cost} onChange={(value) => updateLine(line.localId, { unit_cost: value })} /></td>
                            <td className="px-3 py-2 font-medium">{line.item_id ? money(Math.max(0, line.qty * line.unit_cost), form.currency) : "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-neutral-500 hover:bg-paper" onClick={() => removeLine(line.localId)} type="button" aria-label="Quitar linea">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
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
                    <button className={`w-full rounded-md border p-3 text-left text-sm hover:border-apex ${selectedOrder?.id === order.id ? "border-apex bg-[#146C6312]" : "border-line"}`} key={order.id} onClick={() => setSelectedOrder(order)} onDoubleClick={() => order.status === "draft" && editOrder(order)} title={order.status === "draft" ? "Doble clic para editar este borrador" : "Seleccionar orden"} type="button">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{order.number}</span>
                        <StatusPill status={order.status} />
                      </span>
                      <span className="mt-1 block truncate text-xs text-neutral-500">{order.party.name || "Proveedor"} / {money(order.total, order.currency || currencyForCountry(order.party.country))}</span>
                    </button>
                  ))}
                </div>

                <SelectedOrderCard selectedOrder={selectedOrder} onApprove={approveOrder} onDuplicate={duplicateOrder} onEdit={editOrder} onDownload={downloadOrder} onClose={(order) => { setClosingOrder(order); setCloseReason(""); setError(""); }} />
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
                  <TimelineItem icon={Warehouse} title="WMS inbound" detail="Recepcion movil, conteo y putaway" done={Boolean(selectedOrder?.metadata.wms?.inbound_order)} />
                  <TimelineItem icon={Receipt} title="Factura / CxP" detail="Referencia financiera y pagos" />
                </div>
                <div className="rounded-md border border-line p-4">
                  <h3 className="mb-3 text-sm font-semibold">Links operativos</h3>
                  <TraceLink icon={Warehouse} label="Recepciones WMS" value={selectedOrder?.metadata.wms?.inbound_order || "Pendiente"} />
                  <TraceLink icon={Boxes} label="Inventario" value={`${selectedOrder?.lines.length || 0} lineas conectadas`} />
                  <TraceLink icon={Receipt} label="Finanzas" value={selectedOrder ? money(selectedOrder.total, selectedOrder.currency || currencyForCountry(selectedOrder.party.country)) : "-"} />
                  <TraceLink icon={Truck} label="Proveedor" value={selectedOrder?.party.name || "Sin OC seleccionada"} />
                </div>
              </div>
            </section>
          ) : null}
        </div>

      </section>
      {skuSearchLineId ? <ModalFrame maxWidth="md:max-w-3xl" onClose={() => { setSkuSearchLineId(null); setSkuSearchMessage(""); }} title="Buscar SKU para la posición">
        <div className="space-y-4">
          {skuSearchMessage ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{skuSearchMessage}</p> : null}
          <label className="relative block"><Search className="absolute left-3 top-3 text-neutral-400" size={16} /><input autoFocus className="h-10 w-full rounded-md border border-line pl-10 pr-3 text-sm" placeholder="Buscar por código, nombre o clasificación ABC" value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} /></label>
          <div className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-md border border-line">
            {skuSearchResults.map((item) => <button className="flex w-full items-center justify-between gap-4 p-3 text-left text-sm hover:bg-paper" key={item.id} onClick={() => assignItemToLine(skuSearchLineId, item)} type="button"><span><strong className="font-mono">{item.code}</strong>{item.legacy_code ? <span className="ml-2 font-mono text-neutral-500">Anterior: {item.legacy_code}</span> : null}<span className="ml-2">{item.name}</span><span className="mt-1 block text-xs text-neutral-500">Unidad {item.unit || "UND"} · ABC {item.abc_class || "C"}</span></span><span className="shrink-0 text-right"><strong>{money(Number(item.unit_cost || 0), form.currency)}</strong><span className="block text-xs text-neutral-500">Stock {item.stock_current}</span></span></button>)}
            {!skuSearchResults.length ? <p className="p-6 text-center text-sm text-neutral-500">No hay SKU que coincidan con la búsqueda.</p> : null}
          </div>
        </div>
      </ModalFrame> : null}
      {supplierSearchOpen?<ModalFrame maxWidth="md:max-w-3xl" onClose={()=>setSupplierSearchOpen(false)} title="Buscar proveedor"><input autoFocus className="control mb-3" placeholder="Buscar dinámicamente por NIT o nombre" value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)}/><div className="max-h-[55vh] divide-y overflow-auto rounded border border-line">{suppliers.filter(s=>!supplierSearch.trim()||[s.tax_id,s.name].some(v=>String(v||"").toLowerCase().includes(supplierSearch.toLowerCase()))).map(s=><button className="flex w-full justify-between p-3 text-left hover:bg-paper" key={s.id} onClick={()=>{setForm(p=>({...p,supplier_id:s.id,currency:currencyForCountry(s.country,p.currency)}));setSupplierSearch("");setSupplierSearchOpen(false)}}><span>{s.name}</span><span className="font-mono">{s.tax_id}</span></button>)}</div></ModalFrame>:null}
      {closingOrder ? <ModalFrame maxWidth="md:max-w-xl" onClose={() => !saving && setClosingOrder(null)} title={`Cerrar orden ${closingOrder.number}`}>
        <div className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Se cerraran {closingOrder.pending_quantity} unidades pendientes. Lo ya recibido conserva inventario, costo y contabilizacion; esta accion no genera movimientos nuevos.
          </div>
          <label className="block text-sm font-medium">Motivo del cierre
            <textarea autoFocus className="mt-1 min-h-28 w-full rounded-md border border-line p-3 text-sm" maxLength={500} placeholder="Ej: el proveedor confirma que no despachara el saldo restante" value={closeReason} onChange={(event) => setCloseReason(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button className="h-10 rounded-md border border-line px-4 text-sm" disabled={saving} onClick={() => setClosingOrder(null)} type="button">Cancelar</button>
            <button className="h-10 rounded-md bg-rose-700 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving || closeReason.trim().length < 3} onClick={closeOrder} type="button">Confirmar cierre</button>
          </div>
        </div>
      </ModalFrame> : null}
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

function SelectedOrderCard({ selectedOrder, onApprove, onDuplicate, onEdit, onDownload, onClose }: { selectedOrder: PurchaseOrder | null; onApprove: (order: PurchaseOrder) => void; onDuplicate: (order: PurchaseOrder) => void; onEdit: (order: PurchaseOrder) => void; onDownload: (order: PurchaseOrder) => void; onClose: (order: PurchaseOrder) => void }) {
  if (!selectedOrder) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-md border border-dashed border-line bg-paper text-sm text-neutral-500">
        Selecciona una OC para ver sus acciones y trazabilidad.
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
          <ActionButton icon={Download} label="Descargar PDF" variant="ghost" compact onClick={() => onDownload(selectedOrder)} />
          {selectedOrder.status === "draft" ? <ActionButton icon={Pencil} label="Editar borrador" variant="primary" compact onClick={() => onEdit(selectedOrder)} /> : null}
          <ActionButton icon={Copy} label="Duplicar" variant="ghost" compact onClick={() => onDuplicate(selectedOrder)} />
          {selectedOrder.status === "draft" ? <ActionButton icon={ClipboardCheck} label="Aprobar" variant="secondary" compact onClick={() => onApprove(selectedOrder)} /> : null}
          {["confirmed", "partial"].includes(selectedOrder.status) && Number(selectedOrder.pending_quantity) > 0 ? <ActionButton icon={CheckCircle2} label="Cerrar saldo pendiente" variant="secondary" compact onClick={() => onClose(selectedOrder)} /> : null}
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-4">
        <HeaderMetric label="Recibido" value={`${selectedOrder.received_percent || 0}%`} />
        <HeaderMetric label="Pendiente" value={String(selectedOrder.pending_quantity || 0)} />
        <HeaderMetric label="Total" value={money(selectedOrder.total, selectedOrder.currency || currencyForCountry(selectedOrder.party.country))} />
        <HeaderMetric label="Inbound" value={selectedOrder.metadata.wms?.inbound_order || "pendiente"} />
      </div>
      <div className="border-t border-line p-4">
        <h3 className="mb-3 text-sm font-semibold">Lineas de compra</h3>
        <div className="space-y-2">
          {selectedOrder.lines.slice(0, 6).map((line) => (
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2 text-sm" key={line.id}>
              <span className="min-w-0 truncate"><b className="font-mono">{line.item?.code||line.item_id}</b> · {line.description}</span>
              <span className="shrink-0 font-medium">Pedida {line.qty} · Entregada {line.received_quantity||0}</span>
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
      <ZeroFriendlyNumberInput className="h-full w-20 rounded-md px-2 text-sm outline-none" min={0} step="0.01" value={value} onValueChange={onChange} />
      {suffix ? <span className="pr-2 text-xs text-neutral-500">{suffix}</span> : null}
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <NumberInput value={value} onChange={onChange} />;
}

function StatusPill({ status }: { status: string }) {
  const critical = ["cancelled", "partial"].includes(status);
  return <span className={`rounded-full px-2 py-1 text-[11px] ${critical ? "bg-amber-50 text-amber-800" : "bg-neutral-100 text-neutral-700"}`}>{statusLabels[status] || status}</span>;
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
