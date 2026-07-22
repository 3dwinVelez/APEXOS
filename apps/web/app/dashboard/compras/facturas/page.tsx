"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Plus, Save, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ComprasNav } from "@/components/compras-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Supplier = { id: number; name: string; tax_id?: string | null; credit_days?: number };
type Item = { id: number; code: string; name: string; unit: string; unit_cost: number; tax_rate: number };
type Account = { id: number; code: string; name: string; active: boolean; allows_tx: boolean };
type VatMaster = { code: string; concept: string; percent: number; active: boolean };
type Retention = { code: string; type: "retefuente" | "reteiva" | "reteica"; concept: string; percent: number; minimum_base: number; account_code: string; base: number; amount: number };
type Society = { code: string; name: string; active: boolean };
type Branch = { code: string; name: string; society_code: string; active: boolean };
type CostCenter = { code: string; name: string; society_code: string; branch_code: string; active: boolean };
type OrganizationTree = { societies: Society[]; branches: Branch[]; cost_centers: CostCenter[] };
type WarehouseLocation = { id: number; code: string; warehouse_code: string; warehouse_name: string; label: string };
type PayableInvoice = { id: number; number: string; supplier_reference: string; due_date: string; balance: number };
type PayableSimulation = {
  document_kind: "invoice" | "credit_note";
  document_class: string;
  number: string;
  supplier_reference: string;
  posting_date: string;
  due_term: string;
  due_date: string;
  supplier: { id: number; name: string; tax_id?: string | null };
  society_code: string;
  associated_account_code: string;
  subtotal: number;
  tax_total: number;
  gross_total: number;
  retention_total: number;
  retentions: Retention[];
  total: number;
  referenced_invoice?: { id: number; number: string; supplier_reference: string; due_date: string; balance: number; applied_amount: number } | null;
  totals: { debit: number; credit: number };
  lines: Array<{ line_no: number; account_code: string; account_name: string; debit: number; credit: number; description: string }>;
};
type PurchaseOrder = {
  id: number;
  number: string;
  status: string;
  party_id: number;
  lines: Array<{ id: number; item_id: number; description: string; qty: number; unit_cost: number; total: number; pending_quantity: number; pending_invoice_quantity: number; invoiced_quantity: number }>;
};
type InvoiceLine = {
  localId: string;
  purchase_order_line_id?: number;
  item_id: number;
  item_code: string;
  item_name: string;
  purchase_order_number: string;
  qty: number;
  unit_cost: number;
  vat_code: string;
  description: string;
};

const EMPTY_TREE: OrganizationTree = { societies: [], branches: [], cost_centers: [] };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
}

function numberInputValue(value: number) {
  return value === 0 ? "" : String(value);
}

function dueDateFromTerm(postingDate: string, dueTerm: string) {
  const days = Number(String(dueTerm || "AP0").replace(/\D/g, "")) || 0;
  const date = new Date(`${postingDate || today()}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function PurchaseInvoicesPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [payableAccounts, setPayableAccounts] = useState<Account[]>([]);
  const [tree, setTree] = useState<OrganizationTree>(EMPTY_TREE);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [vats, setVats] = useState<VatMaster[]>([]);
  const [openOrders, setOpenOrders] = useState<PurchaseOrder[]>([]);
  const [chooser, setChooser] = useState<"order" | "item" | "invoice" | null>(null);
  const [chooserSearch, setChooserSearch] = useState("");
  const [openInvoices, setOpenInvoices] = useState<PayableInvoice[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] = useState<PayableSimulation | null>(null);
  const [header, setHeader] = useState({
    document_kind: "invoice",
    with_purchase_order: true,
    purchase_order_reference: "",
    purchase_order_id: "",
    invoice_reference: "",
    referenced_invoice_id: "",
    posting_date: today(),
    due_term: "AP30",
    due_date: dueDateFromTerm(today(), "AP30"),
    supplier_reference: "",
    header_text: "",
    supplier_id: "",
    society_code: "",
    branch_code: "",
    cost_center_code: "",
    location_id: "",
    associated_account_code: ""
  });
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [retentions, setRetentions] = useState<Retention[]>([]);

  async function loadSupplierRetentions(supplierId: string) {
    if (!supplierId) { setRetentions([]); return; }
    const result = await api<{ retentions: Omit<Retention, "base" | "amount">[] }>(`/api/v1/accounting/suppliers/${supplierId}/retentions`);
    setRetentions(result.retentions.map((row) => ({ ...row, base: 0, amount: 0 })));
  }

  async function load() {
    const [supplierRows, itemRows, accounts, orgTree, vatRows, locationRows] = await Promise.all([
      api<Supplier[]>("/api/v1/purchases/suppliers"),
      api<{ data: Item[] }>("/api/v1/inventory/items?limit=200"),
      api<Account[]>("/api/v1/accounting/payable-accounts"),
      api<OrganizationTree>("/api/v1/accounting/organization-tree"),
      api<VatMaster[]>("/api/v1/accounting/vat-masters"),
      api<WarehouseLocation[]>("/api/v1/inventory/locations")
    ]);
    setSuppliers(supplierRows || []);
    setItems(itemRows.data || []);
    setPayableAccounts(accounts || []);
    setTree(orgTree || EMPTY_TREE);
    setLocations(locationRows || []);
    setVats((vatRows || []).filter((item) => item.active !== false));
    setHeader((current) => ({
      ...current,
      supplier_id: current.supplier_id || (supplierRows[0]?.id ? String(supplierRows[0].id) : ""),
      society_code: current.society_code || orgTree.societies.find((item) => item.active !== false)?.code || "",
      location_id: current.location_id || (locationRows[0]?.id ? String(locationRows[0].id) : ""),
      associated_account_code: current.associated_account_code || accounts[0]?.code || ""
    }));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar facturas de compras"));
  }, []);
  useEffect(() => { if (header.supplier_id) void loadSupplierRetentions(header.supplier_id).catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar retenciones")); }, [header.supplier_id]);

  const branches = tree.branches.filter((item) => item.active !== false && item.society_code === header.society_code);
  const costCenters = tree.cost_centers.filter((item) => item.active !== false && item.society_code === header.society_code && (!header.branch_code || item.branch_code === header.branch_code));
  const activeVats = vats.filter((item) => item.active !== false);
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.qty * line.unit_cost, 0);
    const tax = lines.reduce((sum, line) => {
      const vat = activeVats.find((item) => item.code === line.vat_code);
      return sum + line.qty * line.unit_cost * ((vat?.percent || 0) / 100);
    }, 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, activeVats]);
  useEffect(() => {
    setRetentions((current) => current.map((row) => {
      if (row.base > 0 || row.amount > 0) return row;
      const base = row.type === "reteiva" ? totals.tax : totals.subtotal;
      return { ...row, base, amount: base >= row.minimum_base ? Math.round(base * row.percent) / 100 : 0 };
    }));
  }, [totals.subtotal, totals.tax]);
  const missingRequiredHeader = !header.supplier_reference.trim()
    || !header.header_text.trim()
    || !header.supplier_id
    || !header.posting_date
    || !header.society_code
    || !header.branch_code
    || !header.cost_center_code
    || !header.associated_account_code
    || (header.with_purchase_order
      ? (!header.purchase_order_id && !header.purchase_order_reference.trim())
      : !header.location_id);
  const canProcessInvoice = !missingRequiredHeader && lines.length > 0 && totals.total > 0;

  function setPostingDate(value: string) {
    setHeader((current) => ({ ...current, posting_date: value, due_date: dueDateFromTerm(value, current.due_term) }));
  }

  function setDueTerm(value: string) {
    const dueTerm = value.toUpperCase();
    setHeader((current) => ({ ...current, due_term: dueTerm, due_date: dueDateFromTerm(current.posting_date, dueTerm) }));
  }

  async function loadOpenOrders(search = "") {
    if (!header.supplier_id) throw new Error("Seleccione un proveedor");
    const params = new URLSearchParams({ supplier_id: header.supplier_id });
    if (search.trim()) params.set("search", search.trim());
    setOpenOrders(await api<PurchaseOrder[]>(`/api/v1/purchases/orders/open?${params.toString()}`));
  }

  async function loadOpenInvoices(search = "") {
    if (!header.supplier_id) throw new Error("Seleccione un proveedor");
    const params = new URLSearchParams({ supplier_id: header.supplier_id });
    if (search.trim()) params.set("search", search.trim());
    setOpenInvoices(await api<PayableInvoice[]>(`/api/v1/accounting/payables/open-invoices?${params.toString()}`));
  }

  async function openInvoiceChooser() {
    try {
      await loadOpenInvoices();
      setChooser("invoice");
      setChooserSearch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar facturas abiertas");
    }
  }

  async function openOrderChooser() {
    try {
      await loadOpenOrders();
      setChooser("order");
      setChooserSearch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar ordenes abiertas");
    }
  }

  function applyOrder(order: PurchaseOrder) {
    setHeader((current) => ({ ...current, purchase_order_id: String(order.id), purchase_order_reference: order.number }));
    setSimulation(null);
    setLines(order.lines.map((line) => {
      const item = items.find((row) => row.id === line.item_id);
      return {
        localId: crypto.randomUUID(),
        purchase_order_line_id: line.id,
        item_id: line.item_id,
        item_code: item?.code || String(line.item_id),
        item_name: item?.name || line.description,
        purchase_order_number: order.number,
        qty: Number(line.pending_invoice_quantity || line.qty || 0),
        unit_cost: Number(line.unit_cost || 0),
        vat_code: activeVats[0]?.code || "",
        description: line.description
      };
    }));
    setChooser(null);
  }

  function addManualItem(item: Item) {
    setSimulation(null);
    setLines((current) => [...current, {
      localId: crypto.randomUUID(),
      item_id: item.id,
      item_code: item.code,
      item_name: item.name,
      purchase_order_number: "",
      qty: 1,
      unit_cost: Number(item.unit_cost || 0),
      vat_code: activeVats[0]?.code || "",
      description: item.name
    }]);
    setChooser(null);
  }

  function updateLine(id: string, patch: Partial<InvoiceLine>) {
    setSimulation(null);
    setLines((current) => current.map((line) => line.localId === id ? { ...line, ...patch } : line));
  }

  function removeLine(id: string) {
    setSimulation(null);
    setLines((current) => current.filter((line) => line.localId !== id));
  }

  function invoicePayload() {
    return {
      ...header,
      document_kind: header.document_kind,
      with_purchase_order: header.with_purchase_order,
      purchase_order_id: header.purchase_order_id ? Number(header.purchase_order_id) : undefined,
      purchase_order_reference: header.purchase_order_reference.trim(),
      referenced_invoice_id: header.referenced_invoice_id ? Number(header.referenced_invoice_id) : undefined,
      invoice_reference: header.invoice_reference.trim(),
      location_id: header.with_purchase_order ? undefined : Number(header.location_id),
      supplier_reference: header.supplier_reference.trim(),
      header_text: header.header_text.trim(),
      supplier_id: Number(header.supplier_id),
      retentions: retentions.map(({ code, base, amount }) => ({ code, base: Number(base), amount: Number(amount) })),
      lines: lines.map((line) => ({
        purchase_order_line_id: line.purchase_order_line_id,
        item_id: line.item_id,
        qty: Number(line.qty),
        unit_cost: Number(line.unit_cost),
        vat_code: line.vat_code,
        description: line.description
      }))
    };
  }

  function validateInvoiceForm() {
    setError("");
    if (!header.supplier_reference.trim()) {
      setError("Ingrese la referencia de la factura del proveedor.");
      return false;
    }
    if (!header.header_text.trim()) {
      setError("Ingrese el texto de cabecera de la factura.");
      return false;
    }
    if (header.with_purchase_order && !header.purchase_order_id && !header.purchase_order_reference.trim()) {
      setError("Seleccione o ingrese una orden de compra.");
      return false;
    }
    if (!header.with_purchase_order && !header.location_id) {
      setError("Seleccione una bodega o ubicación.");
      return false;
    }
    if (!lines.length || totals.total <= 0) {
      setError("Agregue al menos una posición con un total mayor que cero.");
      return false;
    }
    if (!formRef.current?.reportValidity()) {
      setError("Complete todos los campos obligatorios antes de continuar.");
      return false;
    }
    return true;
  }

  async function simulateAccounting() {
    if (!validateInvoiceForm()) return;
    setSimulating(true);
    setOk("");
    setSimulation(null);
    try {
      setSimulation(await api<PayableSimulation>("/api/v1/purchases/invoices/simulate", {
        method: "POST",
        body: JSON.stringify(invoicePayload())
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo simular la contabilizacion");
    } finally {
      setSimulating(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!validateInvoiceForm()) return;
    setSaving(true);
    setOk("");
    try {
      const created = await api<{ number: string }>("/api/v1/purchases/invoices", {
        method: "POST",
        body: JSON.stringify(invoicePayload())
      });
      setOk(`${header.document_kind === "credit_note" ? "Nota credito" : "Factura"} ${created.number} registrada en compras, CXP, contabilidad e inventario`);
      setLines([]);
      setSimulation(null);
      setHeader((current) => ({ ...current, supplier_reference: "", header_text: "", purchase_order_id: "", purchase_order_reference: "", invoice_reference: "", referenced_invoice_id: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la factura");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">Compras</p>
        <h1 className="text-3xl font-semibold">Factura y nota credito de proveedor</h1>
        <p className="mt-1 text-sm text-neutral-600">Registra documentos con o sin orden de compra y afecta CXP, contabilidad e inventario por bodega.</p>
      </header>
      <ComprasNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      <form className="space-y-4" onSubmit={save} ref={formRef}>
        <section className="rounded-md border border-line bg-white p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <label className="text-sm">Tipo documento
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.document_kind} onChange={(event) => setHeader((current) => ({ ...current, document_kind: event.target.value }))}>
                <option value="invoice">Factura compra - CP</option>
                <option value="credit_note">Nota credito compra - NCP</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input checked={header.with_purchase_order} onChange={(event) => { const withPo = event.target.checked; setHeader((current) => ({ ...current, with_purchase_order: withPo, purchase_order_id: "", purchase_order_reference: "", location_id: withPo ? "" : current.location_id || (locations[0]?.id ? String(locations[0].id) : "") })); setLines([]); }} type="checkbox" />
              Con referencia a pedido
            </label>
            <label className="text-sm">Proveedor
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.supplier_id} onChange={(event) => { const supplierId = event.target.value; setHeader((current) => ({ ...current, supplier_id: supplierId, purchase_order_id: "", purchase_order_reference: "" })); setLines([]); void loadSupplierRetentions(supplierId); }} required>
                <option value="">Seleccionar</option>
                {suppliers.map((item) => <option key={item.id} value={item.id}>{item.tax_id ? `${item.tax_id} - ` : ""}{item.name}</option>)}
              </select>
            </label>
            {header.with_purchase_order ? (
              <label className="text-sm">Orden de compra
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase" value={header.purchase_order_reference} onChange={(event) => setHeader((current) => ({ ...current, purchase_order_reference: event.target.value.toUpperCase(), purchase_order_id: "" }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!header.purchase_order_reference.trim()) void openOrderChooser(); } }} placeholder="Enter vacio para buscar" />
              </label>
            ) : null}
            {header.document_kind === "credit_note" ? (
              <label className="text-sm">Referencia a factura
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase" value={header.invoice_reference} onChange={(event) => setHeader((current) => ({ ...current, invoice_reference: event.target.value.toUpperCase(), referenced_invoice_id: "" }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!header.invoice_reference.trim()) void openInvoiceChooser(); } }} placeholder="Enter vacio para buscar" />
              </label>
            ) : null}
            <label className="text-sm">Fecha contabilizacion
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={header.posting_date} onChange={(event) => setPostingDate(event.target.value)} required />
            </label>
            <label className="text-sm">Condicion AP
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase" value={header.due_term} onChange={(event) => setDueTerm(event.target.value)} required />
            </label>
            <label className="text-sm">Fecha vencimiento
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={header.due_date} onChange={(event) => setHeader((current) => ({ ...current, due_date: event.target.value }))} required />
            </label>
            <label className="text-sm">Referencia factura
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase" value={header.supplier_reference} onChange={(event) => setHeader((current) => ({ ...current, supplier_reference: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))} required />
            </label>
            {!header.with_purchase_order ? (
              <label className="text-sm">Bodega / ubicacion
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.location_id} onChange={(event) => setHeader((current) => ({ ...current, location_id: event.target.value }))} required>
                  <option value="">Seleccionar</option>
                  {locations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            ) : null}
            <label className="text-sm">Sociedad
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.society_code} onChange={(event) => setHeader((current) => ({ ...current, society_code: event.target.value, branch_code: "", cost_center_code: "" }))} required>
                <option value="">Seleccionar</option>
                {tree.societies.filter((item) => item.active !== false).map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Sucursal
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.branch_code} onChange={(event) => setHeader((current) => ({ ...current, branch_code: event.target.value, cost_center_code: "" }))} required>
                <option value="">Seleccionar</option>
                {branches.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Centro costo
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.cost_center_code} onChange={(event) => setHeader((current) => ({ ...current, cost_center_code: event.target.value }))} required>
                <option value="">Seleccionar</option>
                {costCenters.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Cuenta asociada
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.associated_account_code} onChange={(event) => setHeader((current) => ({ ...current, associated_account_code: event.target.value }))} required>
                <option value="">Seleccionar</option>
                {payableAccounts.map((item) => <option key={item.id} value={item.code}>{item.code} - {item.name}</option>)}
              </select>
            </label>
            <label className="text-sm md:col-span-3">Texto de cabecera
              <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.header_text} onChange={(event) => setHeader((current) => ({ ...current, header_text: event.target.value }))} required />
            </label>
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold">Retenciones tributarias de cabecera</h2>
          <p className="mb-3 text-sm text-neutral-500">Se heredan del proveedor. La base y el importe pueden ajustarse para este documento.</p>
          <div className="space-y-2">
            {retentions.map((row, index) => <div className="grid items-end gap-3 rounded-md bg-paper p-3 md:grid-cols-6" key={row.code}>
              <div className="md:col-span-2"><p className="text-sm font-medium">{row.concept}</p><p className="text-xs text-neutral-500">{row.type.toUpperCase()} · {row.code} · cuenta {row.account_code}</p></div>
              <label className="text-xs">Porcentaje<input className="mt-1 h-9 w-full rounded-md border border-line bg-white px-2" disabled value={`${row.percent}%`} /></label>
              <label className="text-xs">Base minima<input className="mt-1 h-9 w-full rounded-md border border-line bg-white px-2" disabled value={money(row.minimum_base)} /></label>
              <label className="text-xs">Base<input className="mt-1 h-9 w-full rounded-md border border-line bg-white px-2" min="0" step="0.01" type="number" value={row.base} onChange={(event) => setRetentions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, base: Number(event.target.value) } : item))} /></label>
              <label className="text-xs">Importe<input className="mt-1 h-9 w-full rounded-md border border-line bg-white px-2" min="0" step="0.01" type="number" value={row.amount} onChange={(event) => setRetentions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value) } : item))} /></label>
            </div>)}
            {!retentions.length ? <p className="text-sm text-neutral-500">El proveedor no tiene retenciones asignadas desde Contabilidad.</p> : null}
          </div>
        </section>

        <section className="rounded-md border border-line bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <div>
              <h2 className="text-base font-semibold">Detalle</h2>
              <p className="text-sm text-neutral-500">{header.with_purchase_order ? "Las posiciones vienen de la orden seleccionada." : "Agrega productos manualmente."}</p>
            </div>
            {!header.with_purchase_order ? (
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm" onClick={() => { setChooser("item"); setChooserSearch(""); }} type="button"><Plus size={16} /> Producto</button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Producto</th><th className="px-3 py-2">OC</th><th className="px-3 py-2">Cantidad</th><th className="px-3 py-2">Costo unitario</th><th className="px-3 py-2">IVA</th><th className="px-3 py-2">Descripcion</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Accion</th></tr></thead>
              <tbody>
                {lines.map((line) => (
                  <tr className="border-b border-line/70 last:border-0" key={line.localId}>
                    <td className="px-3 py-2 font-mono text-xs">{line.item_code} <span className="font-sans text-neutral-600">{line.item_name}</span></td>
                    <td className="px-3 py-2 font-mono text-xs">{line.purchase_order_number || "--"}</td>
                    <td className="px-3 py-2"><input className="h-9 w-28 rounded-md border border-line px-2 text-sm" min="0.01" step="0.01" type="number" value={numberInputValue(line.qty)} onChange={(event) => updateLine(line.localId, { qty: event.target.value === "" ? 0 : Number(event.target.value) })} /></td>
                    <td className="px-3 py-2"><input className="h-9 w-32 rounded-md border border-line px-2 text-sm" min="0" step="0.01" type="number" value={numberInputValue(line.unit_cost)} onChange={(event) => updateLine(line.localId, { unit_cost: event.target.value === "" ? 0 : Number(event.target.value) })} /></td>
                    <td className="px-3 py-2"><select className="h-9 rounded-md border border-line px-2 text-sm" value={line.vat_code} onChange={(event) => updateLine(line.localId, { vat_code: event.target.value })}>{activeVats.map((item) => <option key={item.code} value={item.code}>{item.concept} {item.percent}%</option>)}</select></td>
                    <td className="px-3 py-2"><input className="h-9 w-full rounded-md border border-line px-2 text-sm" value={line.description} onChange={(event) => updateLine(line.localId, { description: event.target.value })} /></td>
                    <td className="px-3 py-2 text-right">{money(line.qty * line.unit_cost)}</td>
                    <td className="px-3 py-2 text-right"><button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-700" onClick={() => removeLine(line.localId)} type="button"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
                {!lines.length ? <tr><td className="px-3 py-5 text-neutral-500" colSpan={8}>No hay posiciones.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-line bg-white p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-3 text-sm">
            <span>Subtotal: <strong>{money(totals.subtotal)}</strong></span>
            <span>IVA: <strong>{money(totals.tax)}</strong></span>
            <span>Total bruto: <strong>{money(totals.total)}</strong></span>
            <span>Retenciones: <strong>{money(retentions.reduce((sum, row) => sum + row.amount, 0))}</strong></span>
            <span>Neto a pagar: <strong>{money(totals.total - retentions.reduce((sum, row) => sum + row.amount, 0))}</strong></span>
          </div>
          <div className="flex flex-wrap gap-2">
            {missingRequiredHeader ? <p className="w-full text-xs text-amber-700">Complete la referencia de factura y los demás datos obligatorios para continuar.</p> : null}
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-apex px-4 text-sm font-medium text-apex disabled:opacity-60" disabled={simulating || !canProcessInvoice} onClick={simulateAccounting} type="button">
              <Calculator size={16} /> {simulating ? "Simulando..." : "Simular contabilizacion"}
            </button>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60" disabled={saving || !canProcessInvoice} type="submit"><Save size={16} /> Registrar factura</button>
          </div>
        </section>

      </form>

      {simulation ? (
        <ModalFrame title="Simulacion contable" onClose={() => setSimulation(null)} maxWidth="max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-neutral-600">Clase {simulation.document_class} - {simulation.document_kind === "credit_note" ? "Nota credito proveedor" : "Factura proveedor"} - vence {new Date(simulation.due_date).toLocaleDateString("es-CO")}</p>
              <p className="mt-1 text-sm text-neutral-500">Proveedor: {simulation.supplier.name} - Referencia: {simulation.supplier_reference}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-paper px-3 py-2">Debitos: {money(simulation.totals.debit)}</span>
              <span className="rounded-md bg-paper px-3 py-2">Creditos: {money(simulation.totals.credit)}</span>
              <span className="rounded-md bg-paper px-3 py-2">Total: {money(simulation.total)}</span>
              <span className="rounded-md bg-paper px-3 py-2">Retenciones: {money(simulation.retention_total)}</span>
              {simulation.referenced_invoice ? <span className="rounded-md bg-paper px-3 py-2">Cruza {simulation.referenced_invoice.number}: {money(simulation.referenced_invoice.applied_amount)}</span> : null}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2">Descripcion</th>
                  <th className="px-3 py-2 text-right">Debito</th>
                  <th className="px-3 py-2 text-right">Credito</th>
                </tr>
              </thead>
              <tbody>
                {simulation.lines.map((line) => (
                  <tr className="border-b border-line/70 last:border-0" key={line.line_no}>
                    <td className="px-3 py-2 font-mono text-xs">{line.account_code} - {line.account_name}</td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-right">{money(line.debit)}</td>
                    <td className="px-3 py-2 text-right">{money(line.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModalFrame>
      ) : null}

      {chooser === "order" ? (
        <ModalFrame title="Ordenes abiertas" onClose={() => setChooser(null)} maxWidth="max-w-4xl">
          <ChooserSearch value={chooserSearch} onChange={setChooserSearch} />
          <div className="mt-3 max-h-[60vh] overflow-auto rounded-md border border-line">
            {openOrders.filter((order) => !chooserSearch || order.number.toLowerCase().includes(chooserSearch.toLowerCase())).map((order) => (
              <button className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-3 text-left text-sm last:border-0 hover:bg-paper" key={order.id} onClick={() => applyOrder(order)} type="button">
                <span><span className="font-mono text-xs">{order.number}</span><span className="ml-3 text-neutral-500">{order.lines.length} posiciones</span></span>
                <span>{order.status}</span>
              </button>
            ))}
          </div>
        </ModalFrame>
      ) : null}

      {chooser === "item" ? (
        <ModalFrame title="Buscar producto" onClose={() => setChooser(null)} maxWidth="max-w-4xl">
          <ChooserSearch value={chooserSearch} onChange={setChooserSearch} />
          <div className="mt-3 max-h-[60vh] overflow-auto rounded-md border border-line">
            {items.filter((item) => {
              const text = chooserSearch.toLowerCase();
              return !text || item.code.toLowerCase().includes(text) || item.name.toLowerCase().includes(text);
            }).map((item) => (
              <button className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-3 text-left text-sm last:border-0 hover:bg-paper" key={item.id} onClick={() => addManualItem(item)} type="button">
                <span><span className="font-mono text-xs">{item.code}</span><span className="ml-3">{item.name}</span></span>
                <span>{money(item.unit_cost)}</span>
              </button>
            ))}
          </div>
        </ModalFrame>
      ) : null}

      {chooser === "invoice" ? (
        <ModalFrame title="Facturas abiertas" onClose={() => setChooser(null)} maxWidth="max-w-4xl">
          <ChooserSearch value={chooserSearch} onChange={setChooserSearch} />
          <div className="mt-3 max-h-[60vh] overflow-auto rounded-md border border-line">
            {openInvoices.filter((invoice) => {
              const text = chooserSearch.toLowerCase();
              return !text || invoice.number.toLowerCase().includes(text) || invoice.supplier_reference.toLowerCase().includes(text);
            }).map((invoice) => (
              <button className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-3 text-left text-sm last:border-0 hover:bg-paper" key={invoice.id} onClick={() => { setHeader((current) => ({ ...current, referenced_invoice_id: String(invoice.id), invoice_reference: invoice.number })); setChooser(null); }} type="button">
                <span><span className="font-mono text-xs">{invoice.number}</span><span className="ml-3 font-mono text-xs">{invoice.supplier_reference}</span></span>
                <span>{money(invoice.balance)}</span>
              </button>
            ))}
            {!openInvoices.length ? <p className="p-4 text-sm text-neutral-500">No hay facturas abiertas para este proveedor.</p> : null}
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function ChooserSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={16} />
      <input autoFocus className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Buscar" />
    </label>
  );
}
