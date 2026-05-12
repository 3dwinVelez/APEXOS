"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Edit3,
  Factory,
  FileText,
  Layers3,
  PackagePlus,
  Plus,
  Receipt,
  Save,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  Truck,
  Warehouse
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { LATAM_CURRENCIES, money, taxRatesForCountry } from "@/lib/latam";
import { InventoryNav } from "@/components/inventory-nav";

type InventoryItem = {
  id: number;
  code: string;
  name: string;
  type: string;
  unit: string;
  unit_cost: number;
  unit_price: number;
  tax_rate: number;
  stock_current: number;
  stock_min: number;
  stock_max: number | null;
  weight_kg: number;
  volume_m3: number;
  abc_class: string;
  metadata: {
    family: string;
    brand: string;
    channel: string;
    wms_profile: string;
    purchase_profile: string;
    sales_profile: string;
    costing_method: string;
    lot_control: boolean;
    expiry_control: boolean;
    serial_control: boolean;
    notes: string;
    currency: string;
  };
};

type InventoryListResponse = {
  data: InventoryItem[];
  total: number;
  page: number;
  pages: number;
};

type WorkspaceTab = "crear" | "directorio" | "trazabilidad";
type AssistantPanel = "operacion" | "costos" | "wms";

const INITIAL_FORM = {
  code: "",
  name: "",
  type: "product",
  unit: "UND",
  unit_cost: 0,
  unit_price: 0,
  tax_rate: 0,
  currency: "USD",
  stock_min: 0,
  stock_max: 0,
  weight_kg: 0,
  volume_m3: 0,
  family: "general",
  brand: "",
  channel: "omnicanal",
  wms_profile: "almacenable",
  purchase_profile: "comprable",
  sales_profile: "vendible",
  costing_method: "promedio",
  lot_control: false,
  expiry_control: false,
  serial_control: false,
  notes: ""
};

const templates = [
  { label: "Retail / producto", type: "product", unit: "UND", margin: 35, stock_min: 5, stock_max: 50, family: "mercancia", wms_profile: "picking" },
  { label: "Materia prima", type: "raw_material", unit: "KG", margin: 0, stock_min: 20, stock_max: 200, family: "produccion", wms_profile: "reserva" },
  { label: "Servicio", type: "service", unit: "UND", margin: 60, stock_min: 0, stock_max: 0, family: "servicios", wms_profile: "no almacenable" },
  { label: "Componente", type: "component", unit: "UND", margin: 10, stock_min: 10, stock_max: 100, family: "ensamble", wms_profile: "reserva" }
];

const typeLabels: Record<string, string> = {
  product: "Producto",
  service: "Servicio",
  asset: "Activo",
  component: "Componente",
  raw_material: "Materia prima"
};

export default function NuevoProductoPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("crear");
  const [assistantPanel, setAssistantPanel] = useState<AssistantPanel>("operacion");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    loadItems().catch((err) => setError(err instanceof Error ? err.message : "No fue posible cargar productos"));
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const response = await api<InventoryListResponse>("/api/v1/inventory/itemslimit=100&sort_by=name");
      setItems(response.data || []);
      setSelectedItem((current) => current ? (response.data || []).find((item) => item.id === current.id) || (response.data || [])[0] || null : (response.data || [])[0] || null);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => [
      item.code,
      item.name,
      item.type,
      item.unit,
      item.abc_class || "",
      item.metadata.family || "",
      item.metadata.brand || ""
    ].some((value) => value.toLowerCase().includes(needle)));
  }, [items, query]);

  const totals = useMemo(() => {
    return items.reduce((acc, item) => {
      const critical = Number(item.stock_current || 0) <= Number(item.stock_min || 0) && item.type !== "service";
      return {
        critical: acc.critical + (critical ? 1 : 0),
        stockValue: acc.stockValue + Number(item.stock_current || 0) * Number(item.unit_cost || 0),
        sellable: acc.sellable + (["product", "service"].includes(item.type) ? 1 : 0)
      };
    }, { critical: 0, stockValue: 0, sellable: 0 });
  }, [items]);

  const margin = form.unit_price ? Math.round(((Number(form.unit_price) - Number(form.unit_cost)) / Number(form.unit_price)) * 100) : 0;
  const canSave = Boolean(form.code.trim() && form.name.trim() && form.type && form.unit);
  const taxRates = taxRatesForCountry("CO");

  function applyTemplate(template: (typeof templates)[number]) {
    setForm((current) => ({
      ...current,
      type: template.type,
      unit: template.unit,
      stock_min: template.stock_min,
      stock_max: template.stock_max,
      family: template.family,
      wms_profile: template.wms_profile,
      unit_price: current.unit_cost > 0 ? Math.round(current.unit_cost / (1 - template.margin / 100)) : current.unit_price
    }));
  }

  function autoSku() {
    const prefix = form.type === "raw_material" ? "RAW" : form.type === "service" ? "SRV" : form.type === "component" ? "CMP" : "SKU";
    const base = (form.name || form.family || "ITEM").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12).toUpperCase();
    const next = String(items.length + 1).padStart(3, "0");
    setForm((current) => ({ ...current, code: `${prefix}-${base || "ITEM"}-${next}` }));
  }

  async function createItem(keepCreating = false) {
    setSaving(true);
    setError("");
    setOk("");
    try {
      const created = await api<InventoryItem>("/api/v1/inventory/items", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          type: form.type,
          unit: form.unit,
          unit_cost: Number(form.unit_cost),
          unit_price: Number(form.unit_price),
          tax_rate: Number(form.tax_rate),
          stock_min: Number(form.stock_min),
          stock_max: Number(form.stock_max) || null,
          weight_kg: Number(form.weight_kg || 0),
          volume_m3: Number(form.volume_m3 || 0),
          metadata: {
            family: form.family,
            brand: form.brand,
            channel: form.channel,
            wms_profile: form.wms_profile,
            purchase_profile: form.purchase_profile,
            sales_profile: form.sales_profile,
            costing_method: form.costing_method,
            currency: form.currency,
            lot_control: form.lot_control,
            expiry_control: form.expiry_control,
            serial_control: form.serial_control,
            notes: form.notes
          }
        })
      });
      setOk(`${created.code} creado y disponible en compras, ventas, WMS y costos`);
      await loadItems();
      setSelectedItem(created);
      if (!keepCreating) setActiveTab("directorio");
      setForm(keepCreating ? { ...INITIAL_FORM, type: form.type, unit: form.unit, family: form.family, wms_profile: form.wms_profile } : INITIAL_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible crear el producto");
    } finally {
      setSaving(false);
    }
  }

  async function updateSelectedItem(patch: Partial<Omit<InventoryItem, "metadata">> & { metadata?: Partial<InventoryItem["metadata"]> }) {
    if (!selectedItem) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api<InventoryItem>(`/api/v1/inventory/items/${selectedItem.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setOk(`${updated.code} actualizado`);
      setSelectedItem({ ...selectedItem, ...updated });
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible actualizar el producto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-medium text-apex">Inventario / Productos</p>
              <h1 className="mt-1 text-3xl font-semibold">Workspace de productos</h1>
              <p className="mt-1 max-w-3xl text-sm text-neutral-600">
                Crea un maestro simple de entender, pero suficientemente potente para compras, ventas, WMS, produccion, costos y analitica.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <HeaderMetric label="Productos" value={String(items.length)} />
              <HeaderMetric label="Criticos" value={String(totals.critical)} />
              <HeaderMetric label="Valor stock ref." value={money(totals.stockValue, form.currency)} />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedNav active={activeTab} onChange={setActiveTab} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-paper" onClick={autoSku} type="button">
              <Sparkles size={16} />
              Generar SKU
            </button>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !canSave} onClick={() => createItem(false)} type="button">
              <Save size={16} />
              Crear producto
            </button>
          </div>
        </div>
      </header>

      <InventoryNav />

      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {activeTab === "crear" ? (
            <>
              <section className="rounded-md border border-line bg-white">
                <PanelHeader icon={PackagePlus} title="Crear producto" detail="Captura lo minimo para operar; los detalles viven agrupados por impacto." />
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 lg:grid-cols-[180px_1fr_180px_150px]">
                    <Field label="SKU / Codigo">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm uppercase" placeholder="SKU-001" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/\s+/g, "-") }))} />
                    </Field>
                    <Field label="Nombre">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: Cafe molido 500g, servicio instalacion, saco azucar 25kg" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                    </Field>
                    <Field label="Tipo">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                        <option value="product">Producto</option>
                        <option value="service">Servicio</option>
                        <option value="raw_material">Materia prima</option>
                        <option value="component">Componente</option>
                        <option value="asset">Activo</option>
                      </select>
                    </Field>
                    <Field label="Unidad">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}>
                        <option value="UND">UND</option>
                        <option value="KG">KG</option>
                        <option value="GR">GR</option>
                        <option value="LT">LT</option>
                        <option value="MT">MT</option>
                        <option value="CAJA">CAJA</option>
                        <option value="HORA">HORA</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-4">
                    <Field label="Familia">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.family} onChange={(e) => setForm((p) => ({ ...p, family: e.target.value }))} />
                    </Field>
                    <Field label="Marca / linea">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Opcional" value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} />
                    </Field>
                    <Field label="Canal">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.channel} onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}>
                        <option value="omnicanal">Omnicanal</option>
                        <option value="b2b">B2B</option>
                        <option value="retail">Retail</option>
                        <option value="produccion">Produccion</option>
                        <option value="interno">Uso interno</option>
                      </select>
                    </Field>
                    <Field label="Impuesto">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.tax_rate} onChange={(e) => setForm((p) => ({ ...p, tax_rate: Number(e.target.value) }))}>
                        {taxRates.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-line bg-white">
                <PanelHeader icon={DollarSign} title="Costos, precio y stock" detail="El producto nace listo para margen, reposicion y decisiones de compra." />
                <div className="grid gap-4 p-4 lg:grid-cols-3">
                  <div className="grid gap-3 rounded-md border border-line bg-paper p-3">
                    <Field label="Moneda">
                      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}>
                        {LATAM_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </Field>
                    <Field label="Costo unitario">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={form.unit_cost} onChange={(e) => setForm((p) => ({ ...p, unit_cost: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Precio venta">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={form.unit_price} onChange={(e) => setForm((p) => ({ ...p, unit_price: Number(e.target.value) }))} />
                    </Field>
                    <MiniMetric label="Margen estimado" value={`${Number.isFinite(margin) ? margin : 0}%`} />
                  </div>

                  <div className="grid gap-3 rounded-md border border-line bg-paper p-3">
                    <Field label="Stock minimo">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={form.stock_min} onChange={(e) => setForm((p) => ({ ...p, stock_min: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Stock maximo">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={form.stock_max} onChange={(e) => setForm((p) => ({ ...p, stock_max: Number(e.target.value) }))} />
                    </Field>
                    <MiniMetric label="Reposicion sugerida" value={String(Math.max(0, Number(form.stock_max) - Number(form.stock_min)))} />
                  </div>

                  <div className="grid gap-3 rounded-md border border-line bg-paper p-3">
                    <Field label="Peso kg">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} step="0.01" type="number" value={form.weight_kg} onChange={(e) => setForm((p) => ({ ...p, weight_kg: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Volumen m3">
                      <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} step="0.001" type="number" value={form.volume_m3} onChange={(e) => setForm((p) => ({ ...p, volume_m3: Number(e.target.value) }))} />
                    </Field>
                    <MiniMetric label="Perfil WMS" value={form.wms_profile} />
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-line bg-white">
                <PanelHeader icon={Layers3} title="Perfiles transversales" detail="Define como se comporta el producto en cada modulo sin llenar pantallas separadas." />
                <div className="grid gap-4 p-4 lg:grid-cols-3">
                  <ProfileSelect icon={ClipboardCheck} title="Compras" value={form.purchase_profile} onChange={(value) => setForm((p) => ({ ...p, purchase_profile: value }))} options={["comprable", "no comprable", "bajo contrato", "importado"]} />
                  <ProfileSelect icon={ShoppingCart} title="Ventas" value={form.sales_profile} onChange={(value) => setForm((p) => ({ ...p, sales_profile: value }))} options={["vendible", "no vendible", "solo cotizacion", "kit"]} />
                  <ProfileSelect icon={Warehouse} title="WMS" value={form.wms_profile} onChange={(value) => setForm((p) => ({ ...p, wms_profile: value }))} options={["almacenable", "picking", "reserva", "cross dock", "no almacenable"]} />
                </div>

                <div className="grid gap-3 border-t border-line p-4 lg:grid-cols-[1fr_220px]">
                  <Field label="Notas operativas">
                    <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Ej: requiere lote, vencimiento, temperatura, serial, inspeccion de calidad" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                  </Field>
                  <Field label="Costeo">
                    <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.costing_method} onChange={(e) => setForm((p) => ({ ...p, costing_method: e.target.value }))}>
                      <option value="promedio">Promedio</option>
                      <option value="fifo">FIFO</option>
                      <option value="estandar">Estandar</option>
                      <option value="identificado">Identificado</option>
                    </select>
                  </Field>
                </div>

                <div className="flex flex-col gap-3 border-t border-line p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Toggle label="Lote" checked={form.lot_control} onChange={(value) => setForm((p) => ({ ...p, lot_control: value }))} />
                    <Toggle label="Vencimiento" checked={form.expiry_control} onChange={(value) => setForm((p) => ({ ...p, expiry_control: value }))} />
                    <Toggle label="Serial" checked={form.serial_control} onChange={(value) => setForm((p) => ({ ...p, serial_control: value }))} />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-medium hover:bg-paper disabled:opacity-50" disabled={saving || !canSave} onClick={() => createItem(true)} type="button">
                      <Plus size={16} />
                      Crear y seguir
                    </button>
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !canSave} onClick={() => createItem(false)} type="button">
                      <Save size={16} />
                      Crear producto
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === "directorio" ? (
            <section className="rounded-md border border-line bg-white">
              <PanelHeader
                icon={Boxes}
                title="Directorio de productos"
                detail="Busca, revisa y ajusta productos sin salir del contexto operativo."
                actions={(
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-2.5 text-neutral-400" size={16} />
                    <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar SKU, nombre, tipo o familia" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                )}
              />

              <div className="grid gap-4 p-4 lg:grid-cols-[340px_1fr]">
                <div className="space-y-2">
                  {loading ? <p className="rounded-md border border-line p-3 text-sm text-neutral-500">Cargando productos...</p> : null}
                  {filteredItems.map((item) => (
                    <button className={`w-full rounded-md border p-3 text-left text-sm hover:border-apex ${selectedItem.id === item.id ? "border-apex bg-[#146C6312]" : "border-line"}`} key={item.id} onClick={() => setSelectedItem(item)} type="button">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{item.code}</span>
                        <ItemStatus item={item} />
                      </span>
                      <span className="mt-1 block truncate text-xs text-neutral-500">{item.name} / {typeLabels[item.type] || item.type} / {item.unit}</span>
                    </button>
                  ))}
                  {!loading && filteredItems.length === 0 ? <p className="rounded-md border border-dashed border-line p-4 text-center text-sm text-neutral-500">No hay productos con ese criterio.</p> : null}
                </div>

                <ProductProfile item={selectedItem} saving={saving} onPatch={updateSelectedItem} />
              </div>
            </section>
          ) : null}

          {activeTab === "trazabilidad" ? (
            <section className="rounded-md border border-line bg-white">
              <PanelHeader icon={Layers3} title="Trazabilidad transversal" detail="El producto es el dato maestro que une operaciones, finanzas y analitica." />
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="rounded-md border border-line p-4">
                  <h3 className="mb-3 text-sm font-semibold">Flujo del producto</h3>
                  <TimelineItem icon={Tag} title="Maestro creado" detail="SKU, unidad, familia y reglas base" done={Boolean(selectedItem)} />
                  <TimelineItem icon={ClipboardCheck} title="Compras" detail="OC, proveedor frecuente y costo" done={selectedItem.metadata.purchase_profile !== "no comprable"} />
                  <TimelineItem icon={Warehouse} title="WMS" detail="Ubicacion, lote, vencimiento y putaway" done={selectedItem.metadata.wms_profile !== "no almacenable"} />
                  <TimelineItem icon={ShoppingCart} title="Ventas" detail="Precio, impuesto y disponibilidad" done={selectedItem.metadata.sales_profile !== "no vendible"} />
                  <TimelineItem icon={Receipt} title="Finanzas" detail="Costo, margen, inventario y COGS" done={Boolean(selectedItem.unit_cost || selectedItem.unit_price)} />
                </div>
                <div className="rounded-md border border-line p-4">
                  <h3 className="mb-3 text-sm font-semibold">Impacto actual</h3>
                  <TraceLink icon={Boxes} label="Stock actual" value={`${selectedItem.stock_current || 0} ${selectedItem.unit || ""}`} />
                  <TraceLink icon={DollarSign} label="Margen" value={`${selectedItem ? itemMargin(selectedItem) : 0}%`} />
                  <TraceLink icon={Warehouse} label="Perfil WMS" value={selectedItem?.metadata.wms_profile || "-"} />
                  <TraceLink icon={Factory} label="Tipo operativo" value={selectedItem ? typeLabels[selectedItem.type] || selectedItem.type : "-"} />
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-md border border-line bg-white">
            <PanelHeader icon={ShieldCheck} title="Centro de control" detail="Resumen y decisiones del producto." />
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-3 gap-1 rounded-md bg-paper p-1">
                <PanelTab label="Operacion" active={assistantPanel === "operacion"} onClick={() => setAssistantPanel("operacion")} />
                <PanelTab label="Costos" active={assistantPanel === "costos"} onClick={() => setAssistantPanel("costos")} />
                <PanelTab label="WMS" active={assistantPanel === "wms"} onClick={() => setAssistantPanel("wms")} />
              </div>

              {assistantPanel === "operacion" ? (
                <div className="space-y-2 text-sm">
                  <MetricRow label="SKU" value={form.code || selectedItem?.code || "-"} />
                  <MetricRow label="Tipo" value={typeLabels[form.type] || form.type} />
                  <MetricRow label="Unidad" value={form.unit} />
                  <MetricRow label="Stock critico" value={`${totals.critical} productos`} />
                </div>
              ) : null}

              {assistantPanel === "costos" ? (
                <div className="space-y-2 text-sm">
                  <MetricRow label="Costo" value={money(form.unit_cost, form.currency)} />
                  <MetricRow label="Precio" value={money(form.unit_price, form.currency)} />
                  <MetricRow label="Margen" value={`${Number.isFinite(margin) ? margin : 0}%`} />
                  <MetricRow label="Metodo" value={form.costing_method} />
                </div>
              ) : null}

              {assistantPanel === "wms" ? (
                <div>
                  <FlowStep icon={Warehouse} title="Almacenable" detail="Puede tener ubicacion fisica" active={form.wms_profile !== "no almacenable"} />
                  <FlowStep icon={ShieldCheck} title="Control lote" detail="Trazabilidad por lote o serial" active={form.lot_control || form.serial_control} />
                  <FlowStep icon={AlertTriangle} title="Stock minimo" detail="Dispara alerta de reposicion" active={Number(form.stock_min) > 0} warn />
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Plantillas rapidas</h2>
            <div className="mt-3 space-y-2">
              {templates.map((template) => (
                <button className="w-full rounded-md border border-line p-3 text-left hover:border-apex hover:bg-paper" key={template.label} onClick={() => applyTemplate(template)} type="button">
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {template.label}
                    <ArrowRight size={15} />
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">{typeLabels[template.type]} / {template.unit} / stock {template.stock_min}-{template.stock_max}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">Acciones conectadas</h2>
            <div className="mt-3 grid gap-2">
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper" href="/dashboard/compras/ordenes/nueva">
                <ClipboardCheck size={16} />
                Comprar
              </Link>
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper" href="/dashboard/inventario/wms">
                <Warehouse size={16} />
                Ubicar en WMS
              </Link>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function SegmentedNav({ active, onChange }: { active: WorkspaceTab; onChange: (tab: WorkspaceTab) => void }) {
  const tabs: Array<{ id: WorkspaceTab; label: string; icon: LucideIcon }> = [
    { id: "crear", label: "Crear producto", icon: PackagePlus },
    { id: "directorio", label: "Directorio", icon: Boxes },
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

function ProductProfile({ item, saving, onPatch }: { item: InventoryItem | null; saving: boolean; onPatch: (patch: Partial<Omit<InventoryItem, "metadata">> & { metadata?: Partial<InventoryItem["metadata"]> }) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ unit_cost: 0, unit_price: 0, stock_min: 0, stock_max: 0, family: "", notes: "" });

  useEffect(() => {
    if (!item) return;
    setDraft({
      unit_cost: item.unit_cost || 0,
      unit_price: item.unit_price || 0,
      stock_min: item.stock_min || 0,
      stock_max: item.stock_max || 0,
      family: item.metadata.family || "",
      notes: item.metadata.notes || ""
    });
    setEditing(false);
  }, [item?.id, item?.unit_cost, item?.unit_price, item?.stock_min, item?.stock_max, item?.metadata.family, item?.metadata.notes]);

  if (!item) {
    return <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed border-line bg-paper text-sm text-neutral-500">Selecciona o crea un producto.</div>;
  }

  return (
    <div className="rounded-md border border-line">
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-neutral-500">Producto seleccionado</p>
          <h2 className="text-2xl font-semibold">{item.code}</h2>
          <p className="text-sm text-neutral-600">{item.name} / {typeLabels[item.type] || item.type} / {item.unit}</p>
        </div>
        <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-xs font-medium hover:bg-paper" onClick={() => setEditing((value) => !value)} type="button">
          <Edit3 size={14} />
          {editing ? "Cerrar" : "Editar"}
        </button>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-4">
        <HeaderMetric label="Stock" value={String(item.stock_current)} />
        <HeaderMetric label="Min / Max" value={`${item.stock_min}/${item.stock_max || "-"}`} />
        <HeaderMetric label="Margen" value={`${itemMargin(item)}%`} />
        <HeaderMetric label="ABC" value={item.abc_class || "C"} />
      </div>

      {editing ? (
        <div className="grid gap-3 border-t border-line p-4 lg:grid-cols-2">
          <Field label="Costo">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={draft.unit_cost} onChange={(e) => setDraft((p) => ({ ...p, unit_cost: Number(e.target.value) }))} />
          </Field>
          <Field label="Precio">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={draft.unit_price} onChange={(e) => setDraft((p) => ({ ...p, unit_price: Number(e.target.value) }))} />
          </Field>
          <Field label="Stock minimo">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={draft.stock_min} onChange={(e) => setDraft((p) => ({ ...p, stock_min: Number(e.target.value) }))} />
          </Field>
          <Field label="Stock maximo">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={draft.stock_max} onChange={(e) => setDraft((p) => ({ ...p, stock_max: Number(e.target.value) }))} />
          </Field>
          <Field label="Familia">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.family} onChange={(e) => setDraft((p) => ({ ...p, family: e.target.value }))} />
          </Field>
          <Field label="Notas">
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
          </Field>
          <div className="lg:col-span-2">
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving} onClick={() => onPatch({ unit_cost: draft.unit_cost, unit_price: draft.unit_price, stock_min: draft.stock_min, stock_max: draft.stock_max || null, metadata: { ...(item.metadata || {}), family: draft.family, notes: draft.notes } })} type="button">
              <Save size={16} />
              Guardar cambios
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold">Configuracion operativa</h3>
          <InfoLine icon={Tag} label="Familia" value={item.metadata.family || "Sin familia"} />
          <InfoLine icon={Warehouse} label="WMS" value={item.metadata.wms_profile || "almacenable"} />
          <InfoLine icon={ClipboardCheck} label="Compras" value={item.metadata.purchase_profile || "comprable"} />
          <InfoLine icon={ShoppingCart} label="Ventas" value={item.metadata.sales_profile || "vendible"} />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Señales</h3>
          <Signal icon={item.stock_current <= item.stock_min ? AlertTriangle : CheckCircle2} title="Stock" detail={item.stock_current <= item.stock_min ? "Requiere reposicion" : "Nivel operativo"} warn={item.stock_current <= item.stock_min} />
          <Signal icon={DollarSign} title="Costo / precio" detail={`${money(item.unit_cost, item.metadata.currency || "USD")} / ${money(item.unit_price, item.metadata.currency || "USD")}`} />
          <Signal icon={ShieldCheck} title="Trazabilidad" detail={item.metadata.lot_control ? "Control por lote" : "Control estandar"} />
        </div>
      </div>
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

function ProfileSelect({ icon: Icon, title, value, options, onChange }: { icon: LucideIcon; title: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="text-apex" size={16} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2">
      <p className="truncate text-sm font-semibold">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium ${checked ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700 hover:bg-paper"}`} onClick={() => onChange(!checked)} type="button">
      <span className={`h-2 w-2 rounded-full ${checked ? "bg-apex" : "bg-neutral-300"}`} />
      {label}
    </button>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
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

function FlowStep({ icon: Icon, title, detail, active, warn }: { icon: LucideIcon; title: string; detail: string; active: boolean; warn?: boolean }) {
  const activeClass = warn ? "bg-amber-50 text-amber-800" : "bg-[#146C6312] text-apex";
  return (
    <div className="flex gap-3 border-b border-line py-3 last:border-b-0">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? activeClass : "bg-neutral-100 text-neutral-500"}`}>
        <Icon size={17} />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-neutral-500">{detail}</span>
      </span>
    </div>
  );
}

function TimelineItem({ icon: Icon, title, detail, done }: { icon: LucideIcon; title: string; detail: string; done: boolean }) {
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
      <ArrowRight className="ml-auto text-neutral-400" size={16} />
    </div>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
      <Icon className="text-apex" size={15} />
      <span className="min-w-0">
        <span className="block text-xs text-neutral-500">{label}</span>
        <span className="block truncate text-sm font-medium">{value}</span>
      </span>
    </div>
  );
}

function Signal({ icon: Icon, title, detail, warn }: { icon: LucideIcon; title: string; detail: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${warn ? "bg-amber-50 text-amber-800" : "bg-[#146C6312] text-apex"}`}>
        <Icon size={15} />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-neutral-500">{detail}</span>
      </span>
    </div>
  );
}

function ItemStatus({ item }: { item: InventoryItem }) {
  if (item.type !== "service" && item.stock_current <= item.stock_min) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-800"><AlertTriangle size={11} /> Critico</span>;
  if (item.metadata.wms_profile === "no almacenable") return <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-700"><FileText size={11} /> Servicio</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#146C6312] px-2 py-1 text-[11px] text-apex"><Truck size={11} /> Activo</span>;
}

function itemMargin(item: InventoryItem) {
  if (!item.unit_price) return 0;
  return Math.round(((Number(item.unit_price) - Number(item.unit_cost || 0)) / Number(item.unit_price)) * 100);
}
