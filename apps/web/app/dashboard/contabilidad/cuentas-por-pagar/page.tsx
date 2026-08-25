"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit3, FilePlus2, ListPlus, Percent, Plus, Save, Search, Settings2, Trash2, WalletCards } from "lucide-react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Account = { id: number; code: string; name: string; active: boolean; allows_tx: boolean; type?: string };
type Supplier = { id: number; name: string; legal_name?: string | null; tax_id?: string | null; active: boolean };
type Society = { code: string; name: string; active: boolean };
type Branch = { code: string; name: string; society_code: string; active: boolean };
type CostCenter = { code: string; name: string; society_code: string; branch_code: string; active: boolean };
type OrganizationTree = { societies: Society[]; branches: Branch[]; cost_centers: CostCenter[] };
type VatMaster = { code: string; concept: string; percent: number; account_code: string; active: boolean };
type AccountingDocument = {
  id: number;
  full_number: string;
  document_type: string;
  posting_date: string;
  created_at: string;
  created_by_name?: string | null;
  created_by_user?: { id: number; name: string; email: string } | null;
  reference?: string | null;
  header_text: string;
  society_code: string;
  total_debit: number;
  total_credit: number;
  lines: Array<{ id: number; line_no: number; account_code: string; branch_code: string; cost_center_code: string; debit: number; credit: number; description: string }>;
};
type PayableLine = {
  account_code: string;
  branch_code: string;
  cost_center_code: string;
  movement: "debit" | "credit";
  vat_code: string;
  description: string;
  amount: string;
};
type PayableDocument = {
  id: number;
  document_kind: "invoice" | "credit_note";
  document_class: string;
  number: string;
  supplier_reference: string;
  referenced_invoice_id?: number | null;
  posting_date: string;
  due_term: string;
  due_date: string;
  header_text: string;
  supplier_id: number;
  supplier_tax_id?: string | null;
  society_code: string;
  associated_account_code: string;
  subtotal: number;
  tax_total: number;
  total: number;
  applied_total: number;
  balance: number;
  accounting_document_id?: number | null;
  accounting_document?: AccountingDocument | null;
  affected_invoices?: Array<{ id: number; number: string; supplier_reference: string; due_date: string; total: number; balance: number; applied_amount?: number }>;
  lines?: Array<{
    line_no: number;
    account_code: string;
    branch_code: string;
    cost_center_code: string;
    movement: "debit" | "credit";
    vat_code?: string | null;
    description: string;
    amount: number;
    total: number;
  }>;
};
type PayableSimulation = {
  document_kind: "invoice" | "credit_note";
  document_class: string;
  number: string;
  supplier_reference: string;
  due_date: string;
  subtotal: number;
  tax_total: number;
  total: number;
  referenced_invoice?: { id: number; number: string; supplier_reference: string; due_date: string; balance: number; applied_amount: number } | null;
  totals: { debit: number; credit: number };
  lines: Array<{ line_no: number; account_code: string; account_name: string; debit: number; credit: number; description: string }>;
};
type ImportCost = { id: number; concept: string; account_code: string; estimated_amount: number; classification: string };

const EMPTY_TREE: OrganizationTree = { societies: [], branches: [], cost_centers: [] };
const EMPTY_LINE: PayableLine = { account_code: "", branch_code: "", cost_center_code: "", movement: "debit", vat_code: "COMPRAS-19", description: "", amount: "" };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
}

function dateTime(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

export default function CuentasPorPagarPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [associatedAccounts, setAssociatedAccounts] = useState<Account[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [tree, setTree] = useState<OrganizationTree>(EMPTY_TREE);
  const [vatMasters, setVatMasters] = useState<VatMaster[]>([]);
  const [documents, setDocuments] = useState<PayableDocument[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [mastersOpen, setMastersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [simulation, setSimulation] = useState<PayableSimulation | null>(null);
  const [chooser, setChooser] = useState<{ type: "associated" | "line_account" | "cost_center" | "invoice"; lineIndex?: number } | null>(null);
  const [chooserSearch, setChooserSearch] = useState("");
  const [invoiceOptions, setInvoiceOptions] = useState<PayableDocument[]>([]);
  const [supplierQueryId, setSupplierQueryId] = useState("");
  const [supplierOpenOnly, setSupplierOpenOnly] = useState(true);
  const [supplierDocuments, setSupplierDocuments] = useState<PayableDocument[]>([]);
  const [selectedAccountingDocument, setSelectedAccountingDocument] = useState<AccountingDocument | null>(null);
  const [header, setHeader] = useState({
    document_kind: "invoice",
    posting_date: today(),
    due_term: "AP30",
    due_date: "",
    supplier_reference: "",
    invoice_reference: "",
    referenced_invoice_id: "",
    header_text: "",
    supplier_id: "",
    society_code: "",
    associated_account_code: ""
  });
  const [lines, setLines] = useState<PayableLine[]>([{ ...EMPTY_LINE }]);
  const [vatDraft, setVatDraft] = useState({ code: "", concept: "Compras", percent: 19, account_code: "2408" });
  const [editingVat, setEditingVat] = useState<string | null>(null);
  const [importCosts, setImportCosts] = useState<ImportCost[]>([]);
  const [importPrefilled, setImportPrefilled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accountRows, payableRows, supplierRows, orgTree, vats, docRows] = await Promise.all([
        api<Account[]>("/api/v1/accounting/accounts?active=true"),
        api<Account[]>("/api/v1/accounting/payable-accounts"),
        api<Supplier[]>("/api/v1/accounting/third-parties?type=supplier&active=true&limit=300"),
        api<OrganizationTree>("/api/v1/accounting/organization-tree"),
        api<VatMaster[]>("/api/v1/accounting/vat-masters"),
        api<PayableDocument[]>("/api/v1/accounting/payables/documents?limit=80")
      ]);
      setAccounts(accountRows.filter((item) => item.active !== false && item.allows_tx !== false));
      setAssociatedAccounts(payableRows);
      setSuppliers(supplierRows);
      setTree(orgTree);
      setVatMasters(vats);
      setDocuments(docRows);
      setSupplierQueryId((current) => current || (supplierRows[0]?.id ? String(supplierRows[0].id) : ""));
      setHeader((current) => ({
        ...current,
        due_date: current.due_date || dueDateFromTerm(current.posting_date, current.due_term),
        society_code: current.society_code || orgTree.societies.find((item) => item.active !== false)?.code || "",
        associated_account_code: current.associated_account_code || payableRows[0]?.code || "",
        supplier_id: current.supplier_id || (supplierRows[0]?.id ? String(supplierRows[0].id) : "")
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar cuentas por pagar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeSocieties = tree.societies.filter((item) => item.active !== false);
  const branches = tree.branches.filter((item) => item.active !== false && item.society_code === header.society_code);
  const activeVats = vatMasters.filter((item) => item.active !== false);

  useEffect(() => {
    if (loading || importPrefilled) return;
    const params = new URLSearchParams(window.location.search);
    const importId = Number(params.get("import_id"));
    const supplierId = Number(params.get("supplier_id"));
    if (!importId || !supplierId) { setImportPrefilled(true); return; }
    setImportPrefilled(true);
    api<ImportCost[]>(`/api/v1/purchases/imports/${importId}/invoiceable-costs?supplier_id=${supplierId}`).then((costs) => {
      if (!costs.length) throw new Error("Este proveedor no tiene costos pendientes en la importación");
      const society = tree.societies.find((item) => item.active !== false)?.code || "";
      const branch = tree.branches.find((item) => item.active !== false && item.society_code === society)?.code || "";
      const center = tree.cost_centers.find((item) => item.active !== false && item.society_code === society && item.branch_code === branch)?.code || "";
      const zeroVat = vatMasters.find((item) => item.active !== false && Number(item.percent) === 0)?.code || activeVats[0]?.code || "COMPRAS-19";
      setHeader((current) => ({ ...current, document_kind: "invoice", supplier_id: String(supplierId), society_code: society, header_text: `Costos importación #${importId}` }));
      setLines(costs.map((cost) => ({ account_code: cost.account_code, branch_code: branch, cost_center_code: center, movement: "debit", vat_code: zeroVat, description: cost.concept, amount: String(cost.estimated_amount) })));
      setImportCosts(costs); setModalOpen(true);
    }).catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar costos de importación"));
  }, [activeVats, importPrefilled, loading, tree, vatMasters]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
    const tax = lines.reduce((sum, line) => {
      const vat = activeVats.find((item) => item.code === line.vat_code);
      return sum + ((Number(line.amount) || 0) * ((vat?.percent || 0) / 100));
    }, 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, activeVats]);

  function supplierLabel(supplier?: Supplier) {
    if (!supplier) return "--";
    return `${supplier.tax_id ? `${supplier.tax_id} - ` : ""}${supplier.legal_name || supplier.name}`;
  }

  function updateLine(index: number, patch: Partial<PayableLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
    setSimulation(null);
  }

  function daysBetween(start: string, end: string) {
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
  }

  function dueDateFromTerm(postingDate: string, dueTerm: string) {
    const days = Number(String(dueTerm || "AP0").replace(/\D/g, "")) || 0;
    const date = new Date(`${postingDate || today()}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function setPostingDate(value: string) {
    setHeader((current) => ({ ...current, posting_date: value, due_date: dueDateFromTerm(value, current.due_term) }));
    setSimulation(null);
  }

  function setDueTerm(value: string) {
    const dueTerm = value.toUpperCase();
    setHeader((current) => ({ ...current, due_term: dueTerm, due_date: dueDateFromTerm(current.posting_date, dueTerm) }));
    setSimulation(null);
  }

  function setDueDate(value: string) {
    setHeader((current) => ({ ...current, due_date: value, due_term: `AP${daysBetween(current.posting_date, value)}` }));
    setSimulation(null);
  }

  async function loadOpenInvoices(search = "") {
    if (!header.supplier_id) {
      setError("Seleccione primero un proveedor para buscar facturas abiertas");
      return;
    }
    const params = new URLSearchParams({ supplier_id: header.supplier_id, limit: "100" });
    if (search.trim()) params.set("search", search.trim());
    setInvoiceOptions(await api<PayableDocument[]>(`/api/v1/accounting/payables/open-invoices?${params.toString()}`));
  }

  async function openChooser(type: "associated" | "line_account" | "cost_center" | "invoice", lineIndex?: number) {
    if (type === "invoice") await loadOpenInvoices();
    setChooser({ type, lineIndex });
    setChooserSearch("");
  }

  function resolveAccount(code: string, allowPayableOnly = false) {
    const source = allowPayableOnly ? associatedAccounts : accounts;
    return source.find((item) => item.code === code.trim()) || null;
  }

  function resolveCostCenter(code: string) {
    return tree.cost_centers.find((item) => item.active !== false && item.code === code.trim() && item.society_code === header.society_code) || null;
  }

  function addLine() {
    setLines((current) => [...current, { ...EMPTY_LINE, movement: header.document_kind === "credit_note" ? "credit" : "debit" }]);
  }

  function removeLine(index: number) {
    setLines((current) => current.length <= 1 ? current : current.filter((_, lineIndex) => lineIndex !== index));
  }

  function openCreate(kind: "invoice" | "credit_note" = "invoice") {
    setHeader((current) => ({ ...current, document_kind: kind, posting_date: today(), due_term: "AP30", due_date: dueDateFromTerm(today(), "AP30"), supplier_reference: "", invoice_reference: "", referenced_invoice_id: "", header_text: "" }));
    setLines([{ ...EMPTY_LINE, movement: kind === "credit_note" ? "credit" : "debit", vat_code: activeVats[0]?.code || "COMPRAS-19" }]);
    setSimulation(null);
    setModalOpen(true);
  }

  function payload() {
    return {
      ...header,
      supplier_reference: header.supplier_reference.trim().toUpperCase(),
      invoice_reference: header.invoice_reference.trim().toUpperCase(),
      referenced_invoice_id: header.referenced_invoice_id ? Number(header.referenced_invoice_id) : undefined,
      supplier_id: Number(header.supplier_id),
      lines: lines.map((line) => ({ ...line, amount: Number(line.amount) }))
    };
  }

  async function searchSupplierDocuments() {
    if (!supplierQueryId) {
      setError("Seleccione un proveedor para consultar documentos");
      return;
    }
    setError("");
    const params = new URLSearchParams({ open_only: String(supplierOpenOnly), limit: "200" });
    setSupplierDocuments(await api<PayableDocument[]>(`/api/v1/accounting/payables/suppliers/${supplierQueryId}/documents?${params.toString()}`));
  }

  async function simulateDocument() {
    setSimulating(true);
    setError("");
    setSimulation(null);
    try {
      setSimulation(await api<PayableSimulation>("/api/v1/accounting/payables/documents/simulate", {
        method: "POST",
        body: JSON.stringify(payload())
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo simular el documento");
    } finally {
      setSimulating(false);
    }
  }

  async function saveDocument(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const created = await api<PayableDocument>("/api/v1/accounting/payables/documents", {
        method: "POST",
        body: JSON.stringify(payload())
      });
      if (importCosts.length) {
        await Promise.all(importCosts.map((cost, index) => api(`/api/v1/purchases/imports/costs/${cost.id}/link-invoice`, { method: "POST", body: JSON.stringify({ cxp_cabdoc_id: created.id, actual_amount: Number(lines[index]?.amount || 0) }) })));
        setImportCosts([]);
      }
      setDocuments((current) => [created, ...current]);
      setModalOpen(false);
      setOk(`${created.number} contabilizado`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el documento");
    } finally {
      setSaving(false);
    }
  }

  async function saveVat(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const rows = await api<VatMaster[]>("/api/v1/accounting/vat-masters", {
        method: "POST",
        body: JSON.stringify({ ...vatDraft, percent: Number(vatDraft.percent) })
      });
      setVatMasters(rows);
      setVatDraft({ code: "", concept: "Compras", percent: 19, account_code: "2408" });
      setEditingVat(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el IVA");
    } finally {
      setSaving(false);
    }
  }

  function editVat(item: VatMaster) {
    setVatDraft({ code: item.code, concept: item.concept, percent: item.percent, account_code: item.account_code || "2408" });
    setEditingVat(item.code);
  }

  async function deleteVat(code: string) {
    if (!window.confirm("Confirma borrar este maestro de IVA.")) return;
    setSaving(true);
    setError("");
    try {
      setVatMasters(await api<VatMaster[]>(`/api/v1/accounting/vat-masters/${encodeURIComponent(code)}`, { method: "DELETE" }));
      if (editingVat === code) {
        setVatDraft({ code: "", concept: "Compras", percent: 19, account_code: "2408" });
        setEditingVat(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar el IVA");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Cuentas por pagar</h1>
          <p className="mt-1 text-sm text-neutral-600">Facturas y notas credito de proveedor con vencimiento, IVA parametrizable y cuenta asociada.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-sm" href="/dashboard/tesoreria?direction=disbursement">Pagar proveedor</Link>
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-sm" href="/dashboard/tesoreria?direction=disbursement&tab=report">Reporte de pagos</Link>
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-sm" href="/dashboard/tesoreria/anticipos?direction=supplier">Anticipos a proveedores</Link>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm" onClick={() => setMastersOpen(true)} type="button">
            <Settings2 size={16} /> IVA
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={() => openCreate("invoice")} type="button">
            <FilePlus2 size={16} /> Nuevo documento
          </button>
        </div>
      </header>
      <ContabilidadNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric icon={WalletCards} label="Documentos" value={documents.length} />
        <Metric icon={Percent} label="Maestros IVA" value={activeVats.length} />
        <Metric icon={ListPlus} label="Proveedores" value={suppliers.length} />
        <div className="rounded-md border border-line bg-white p-3">
          <p className="text-xs text-neutral-500">Total registrado</p>
          <p className="mt-1 text-2xl font-semibold">{money(documents.reduce((sum, doc) => sum + doc.total, 0))}</p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-neutral-500">
              <th className="px-4 py-3">Numero</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Clase</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Vence</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Cuenta asociada</th>
              <th className="px-4 py-3 text-right">IVA</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-4 py-5 text-neutral-500" colSpan={11}>Cargando...</td></tr> : null}
            {!loading && documents.length === 0 ? <tr><td className="px-4 py-5 text-neutral-500" colSpan={11}>No hay documentos de proveedor.</td></tr> : null}
            {documents.map((doc) => (
              <tr className="border-b border-line/70 last:border-0" key={doc.id}>
                <td className="px-4 py-3 font-mono text-xs">
                  <button className="font-mono text-xs text-apex underline-offset-2 hover:underline disabled:text-neutral-500 disabled:no-underline" disabled={!doc.accounting_document} onClick={() => doc.accounting_document ? setSelectedAccountingDocument(doc.accounting_document) : undefined} type="button" title="Ver documento y registro contable">{doc.number}</button>
                </td>
                <td className="px-4 py-3">{doc.document_kind === "credit_note" ? "Nota credito" : "Factura"}</td>
                <td className="px-4 py-3 font-mono text-xs">{doc.document_class}</td>
                <td className="px-4 py-3 font-mono text-xs">{doc.supplier_reference}</td>
                <td className="px-4 py-3">{new Date(doc.posting_date).toLocaleDateString("es-CO")}</td>
                <td className="px-4 py-3">{new Date(doc.due_date).toLocaleDateString("es-CO")} <span className="text-neutral-500">({doc.due_term})</span></td>
                <td className="px-4 py-3">{supplierLabel(suppliers.find((item) => item.id === doc.supplier_id))}</td>
                <td className="px-4 py-3 font-mono text-xs">{doc.associated_account_code}</td>
                <td className="px-4 py-3 text-right">{money(doc.tax_total)}</td>
                <td className="px-4 py-3 text-right">{money(doc.total)}</td>
                <td className="px-4 py-3 text-right font-semibold">{money(doc.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Consulta por proveedor</h2>
            <p className="mt-1 text-sm text-neutral-600">Documentos de proveedor con referencia, vencimiento, detalle y saldo vivo.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(260px,1fr)_160px_120px]">
            <label className="text-sm">
              Proveedor
              <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={supplierQueryId} onChange={(event) => setSupplierQueryId(event.target.value)}>
                <option value="">Seleccionar</option>
                {suppliers.map((item) => <option key={item.id} value={item.id}>{supplierLabel(item)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input checked={supplierOpenOnly} onChange={(event) => setSupplierOpenOnly(event.target.checked)} type="checkbox" />
              Solo saldo vivo
            </label>
            <button className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-apex px-4 text-sm font-medium text-apex" onClick={searchSupplierDocuments} type="button">
              <Search size={16} /> Buscar
            </button>
          </div>
        </div>
        {supplierDocuments.length ? (
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                  <th className="px-3 py-2">Comprobante</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Referencia</th>
                  <th className="px-3 py-2">Factura afectada</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Vencimiento</th>
                  <th className="px-3 py-2">Detalle</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {supplierDocuments.map((doc) => (
                  <tr className="border-b border-line/70 align-top last:border-0" key={doc.id}>
                    <td className="px-3 py-2 font-mono text-xs">
                      <button className="font-mono text-xs text-apex underline-offset-2 hover:underline disabled:text-neutral-500 disabled:no-underline" disabled={!doc.accounting_document} onClick={() => doc.accounting_document ? setSelectedAccountingDocument(doc.accounting_document) : undefined} type="button" title="Ver documento y registro contable">{doc.number}</button>
                    </td>
                    <td className="px-3 py-2">{doc.document_kind === "credit_note" ? "Nota credito" : "Factura"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{doc.supplier_reference}</td>
                    <td className="px-3 py-2">
                      {doc.document_kind === "credit_note" && doc.affected_invoices?.length ? (
                        <div className="space-y-1">
                          {doc.affected_invoices.map((invoice) => (
                            <p className="text-xs" key={invoice.id}>
                              <span className="font-mono">{invoice.number}</span> ref. <span className="font-mono">{invoice.supplier_reference}</span>{invoice.applied_amount ? ` - ${money(invoice.applied_amount)}` : ""}
                            </p>
                          ))}
                        </div>
                      ) : "--"}
                    </td>
                    <td className="px-3 py-2">{new Date(doc.posting_date).toLocaleDateString("es-CO")}</td>
                    <td className="px-3 py-2">{new Date(doc.due_date).toLocaleDateString("es-CO")}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        {(doc.lines || []).map((line) => (
                          <p className="text-xs" key={line.line_no}>
                            <span className="font-mono">{line.account_code}</span> {line.description} - {line.cost_center_code} - {money(line.total || line.amount)}
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{money(doc.total)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(doc.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {modalOpen ? (
        <ModalFrame title={header.document_kind === "credit_note" ? "Nota credito de proveedor" : "Factura de proveedor"} onClose={() => setModalOpen(false)} maxWidth="max-w-6xl">
          <form className="space-y-4" onSubmit={saveDocument}>
            <section className="grid gap-3 md:grid-cols-6">
              <label className="text-sm">
                Tipo documento
                <select
                  className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm"
                  value={header.document_kind}
                  onChange={(event) => {
                    const kind = event.target.value as "invoice" | "credit_note";
                    setHeader((current) => ({ ...current, document_kind: kind, invoice_reference: "", referenced_invoice_id: "" }));
                    setLines((current) => current.map((line) => ({ ...line, movement: kind === "credit_note" ? "credit" : "debit" })));
                    setSimulation(null);
                  }}
                >
                  <option value="invoice">Factura proveedor - RE</option>
                  <option value="credit_note">Nota credito proveedor - KG</option>
                </select>
              </label>
              <label className="text-sm">
                Fecha contabilizacion
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={header.posting_date} onChange={(event) => setPostingDate(event.target.value)} required />
              </label>
              <label className="text-sm">
                Condicion AP
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase" value={header.due_term} onChange={(event) => setDueTerm(event.target.value)} placeholder="AP30" required />
              </label>
              <label className="text-sm">
                Fecha vencimiento
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={header.due_date} onChange={(event) => setDueDate(event.target.value)} required />
              </label>
              <label className="text-sm">
                Proveedor
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.supplier_id} onChange={(event) => { setHeader((current) => ({ ...current, supplier_id: event.target.value, invoice_reference: "", referenced_invoice_id: "" })); setInvoiceOptions([]); setSimulation(null); }} required>
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.map((item) => <option key={item.id} value={item.id}>{supplierLabel(item)}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Sociedad
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.society_code} onChange={(event) => setHeader((current) => ({ ...current, society_code: event.target.value }))} required>
                  <option value="">Seleccionar</option>
                  {activeSocieties.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Cuenta asociada
                <input
                  className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm"
                  value={header.associated_account_code}
                  onBlur={() => {
                    if (header.associated_account_code && !resolveAccount(header.associated_account_code, true)) setError("La cuenta asociada debe existir en cuentas por pagar/proveedores");
                  }}
                  onChange={(event) => { setHeader((current) => ({ ...current, associated_account_code: event.target.value })); setSimulation(null); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (!header.associated_account_code.trim()) openChooser("associated");
                    }
                  }}
                  placeholder="Cuenta asociada"
                  required
                />
              </label>
              <label className="text-sm">
                Referencia factura
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase" value={header.supplier_reference} onChange={(event) => { setHeader((current) => ({ ...current, supplier_reference: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })); setSimulation(null); }} required />
              </label>
              {header.document_kind === "credit_note" ? (
                <label className="text-sm">
                  Referencia a factura
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase"
                    value={header.invoice_reference}
                    onChange={(event) => { setHeader((current) => ({ ...current, invoice_reference: event.target.value.toUpperCase(), referenced_invoice_id: "" })); setSimulation(null); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (!header.invoice_reference.trim()) void openChooser("invoice");
                      }
                    }}
                    placeholder="Comprobante o referencia"
                  />
                </label>
              ) : null}
              <label className="text-sm md:col-span-6">
                Descripcion de cabecera
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.header_text} onChange={(event) => setHeader((current) => ({ ...current, header_text: event.target.value }))} required />
              </label>
            </section>

            {simulation ? (
              <section className="rounded-md border border-line bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Simulacion contable</h2>
                    <p className="mt-1 text-sm text-neutral-600">Clase {simulation.document_class} - {simulation.document_kind === "credit_note" ? "Nota credito proveedor" : "Factura proveedor"} - vence {new Date(simulation.due_date).toLocaleDateString("es-CO")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-md bg-paper px-3 py-2">Debitos: {money(simulation.totals.debit)}</span>
                    <span className="rounded-md bg-paper px-3 py-2">Creditos: {money(simulation.totals.credit)}</span>
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
              </section>
            ) : null}

            <section className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[1120px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="px-3 py-2">Cuenta</th>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2">Centro costo</th>
                    <th className="px-3 py-2">Mov.</th>
                    <th className="px-3 py-2">IVA</th>
                    <th className="px-3 py-2">Descripcion</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2 text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                      <tr className="border-b border-line/70 last:border-0" key={index}>
                        <td className="px-3 py-2">
                          <input
                            className="h-10 w-full rounded-md border border-line px-2 text-sm"
                            value={line.account_code}
                            onBlur={() => {
                              if (line.account_code && !resolveAccount(line.account_code)) setError(`La cuenta de la linea ${index + 1} no existe`);
                            }}
                            onChange={(event) => updateLine(index, { account_code: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (!line.account_code.trim()) openChooser("line_account", index);
                              }
                            }}
                            placeholder="Cuenta"
                            required
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select className="h-10 w-full rounded-md border border-line px-2 text-sm" value={line.branch_code} onChange={(event) => updateLine(index, { branch_code: event.target.value, cost_center_code: "" })} required>
                            <option value="">Sucursal</option>
                            {branches.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="h-10 w-full rounded-md border border-line px-2 text-sm"
                            value={line.cost_center_code}
                            onBlur={() => {
                              if (line.cost_center_code && !resolveCostCenter(line.cost_center_code)) setError(`El centro de costo de la linea ${index + 1} no existe`);
                            }}
                            onChange={(event) => updateLine(index, { cost_center_code: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (!line.cost_center_code.trim()) openChooser("cost_center", index);
                              }
                            }}
                            placeholder="Centro"
                            required
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select className="h-10 w-full rounded-md border border-line px-2 text-sm" value={line.movement} onChange={(event) => updateLine(index, { movement: event.target.value as "debit" | "credit" })}>
                            <option value="debit">Debito</option>
                            <option value="credit">Credito</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select className="h-10 w-full rounded-md border border-line px-2 text-sm" value={line.vat_code} onChange={(event) => updateLine(index, { vat_code: event.target.value })}>
                            {activeVats.map((item) => <option key={item.code} value={item.code}>{item.concept} {item.percent}%</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input className="h-10 w-full rounded-md border border-line px-2 text-sm" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} required />
                        </td>
                        <td className="px-3 py-2">
                          <input className="h-10 w-full rounded-md border border-line px-2 text-sm" type="number" min="0.01" step="0.01" value={line.amount} onChange={(event) => updateLine(index, { amount: event.target.value })} required />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-700 disabled:opacity-40" disabled={lines.length <= 1} onClick={() => removeLine(index)} type="button" aria-label="Borrar linea">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-center md:justify-between">
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm" onClick={addLine} type="button">
                <Plus size={16} /> Linea
              </button>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>Subtotal: <strong>{money(totals.subtotal)}</strong></span>
                <span>IVA: <strong>{money(totals.tax)}</strong></span>
                <span>Total: <strong>{money(totals.total)}</strong></span>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-apex px-4 font-medium text-apex disabled:opacity-60" disabled={simulating || totals.total <= 0} onClick={simulateDocument} type="button">
                  {simulating ? "Simulando..." : "Simular"}
                </button>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 font-medium text-white disabled:opacity-60" disabled={saving || totals.total <= 0} type="submit">
                  <Save size={16} /> {saving ? "Contabilizando..." : "Contabilizar"}
                </button>
              </div>
            </section>
          </form>
        </ModalFrame>
      ) : null}

      {mastersOpen ? (
        <ModalFrame title="Maestro de IVA" onClose={() => setMastersOpen(false)} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <form className="grid gap-2 md:grid-cols-[150px_1fr_120px_220px_150px]" onSubmit={saveVat}>
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Codigo" value={vatDraft.code} onChange={(event) => setVatDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} required />
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Concepto" value={vatDraft.concept} onChange={(event) => setVatDraft((current) => ({ ...current, concept: event.target.value }))} required />
              <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" min={0} step="0.01" value={vatDraft.percent} onChange={(event) => setVatDraft((current) => ({ ...current, percent: Number(event.target.value) }))} required />
              <select className="h-10 rounded-md border border-line px-3 text-sm" value={vatDraft.account_code} onChange={(event) => setVatDraft((current) => ({ ...current, account_code: event.target.value }))} required>
                <option value="">Cuenta IVA</option>
                {accounts.map((item) => <option key={item.id} value={item.code}>{item.code} - {item.name}</option>)}
              </select>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" type="submit">
                <ListPlus size={16} /> Guardar
              </button>
            </form>
            <div className="max-h-80 overflow-auto rounded-md border border-line">
              {vatMasters.map((item) => (
                <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-0" key={item.code}>
                  <p><strong>{item.code}</strong> {item.concept} - {item.percent}% - cuenta {item.account_code}</p>
                  <div className="flex gap-2">
                    <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => editVat(item)} type="button" aria-label="Editar IVA">
                      <Edit3 size={14} />
                    </button>
                    <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => deleteVat(item.code)} type="button" aria-label="Borrar IVA">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {chooser ? (
        <ModalFrame title={chooser.type === "invoice" ? "Buscar factura con saldo" : chooser.type === "cost_center" ? "Buscar centro de costo" : "Buscar cuenta"} onClose={() => setChooser(null)} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={16} />
              <input autoFocus className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" value={chooserSearch} onChange={(event) => setChooserSearch(event.target.value)} placeholder="Buscar por codigo o nombre" />
            </label>
            <div className="max-h-[60vh] overflow-auto rounded-md border border-line">
              {chooser.type === "invoice" ? (
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Comprobante</th><th className="px-3 py-2">Referencia</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2 text-right">Accion</th></tr></thead>
                  <tbody>
                    {invoiceOptions.filter((item) => {
                      const text = chooserSearch.toLowerCase();
                      return !text || item.number.toLowerCase().includes(text) || item.supplier_reference.toLowerCase().includes(text);
                    }).map((item) => (
                      <tr className="border-b border-line/70 last:border-0" key={item.id}>
                        <td className="px-3 py-2 font-mono text-xs">{item.number}</td>
                        <td className="px-3 py-2 font-mono text-xs">{item.supplier_reference}</td>
                        <td className="px-3 py-2">{new Date(item.due_date).toLocaleDateString("es-CO")}</td>
                        <td className="px-3 py-2 text-right">{money(item.balance)}</td>
                        <td className="px-3 py-2 text-right"><button className="h-9 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={() => { setHeader((current) => ({ ...current, invoice_reference: item.number, referenced_invoice_id: String(item.id) })); setChooser(null); setSimulation(null); }} type="button">Seleccionar</button></td>
                      </tr>
                    ))}
                    {invoiceOptions.length === 0 ? <tr><td className="px-3 py-4 text-neutral-500" colSpan={5}>No hay facturas con saldo vivo para este proveedor.</td></tr> : null}
                  </tbody>
                </table>
              ) : chooser.type === "cost_center" ? (
                <table className="w-full min-w-[620px] border-collapse text-sm">
                  <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Codigo</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2 text-right">Accion</th></tr></thead>
                  <tbody>
                    {tree.cost_centers.filter((item) => {
                      const text = chooserSearch.toLowerCase();
                      return item.active !== false && item.society_code === header.society_code && (!text || item.code.toLowerCase().includes(text) || item.name.toLowerCase().includes(text));
                    }).map((item) => (
                      <tr className="border-b border-line/70 last:border-0" key={item.code}>
                        <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2 font-mono text-xs">{item.branch_code}</td>
                        <td className="px-3 py-2 text-right"><button className="h-9 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={() => { if (chooser.lineIndex !== undefined) updateLine(chooser.lineIndex, { cost_center_code: item.code, branch_code: item.branch_code }); setChooser(null); }} type="button">Seleccionar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[620px] border-collapse text-sm">
                  <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Codigo</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2 text-right">Accion</th></tr></thead>
                  <tbody>
                    {(chooser.type === "associated" ? associatedAccounts : accounts).filter((item) => {
                      const text = chooserSearch.toLowerCase();
                      return !text || item.code.toLowerCase().includes(text) || item.name.toLowerCase().includes(text);
                    }).map((item) => (
                      <tr className="border-b border-line/70 last:border-0" key={item.id}>
                        <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2 text-right"><button className="h-9 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={() => { if (chooser.type === "associated") setHeader((current) => ({ ...current, associated_account_code: item.code })); else if (chooser.lineIndex !== undefined) updateLine(chooser.lineIndex, { account_code: item.code }); setChooser(null); }} type="button">Seleccionar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {selectedAccountingDocument ? (
        <AccountingDocumentModal document={selectedAccountingDocument} onClose={() => setSelectedAccountingDocument(null)} />
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">{label}</p>
        <Icon size={15} className="text-apex" />
      </div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function AccountingDocumentModal({ document, onClose }: { document: AccountingDocument; onClose: () => void }) {
  return (
    <ModalFrame title={`Registro contable ${document.full_number}`} onClose={onClose} maxWidth="max-w-5xl">
      <div className="space-y-4">
        <section className="grid gap-3 rounded-md border border-line bg-paper p-3 text-sm md:grid-cols-4">
          <p><span className="block text-xs text-neutral-500">Fecha contabilizacion</span>{new Date(document.posting_date).toLocaleDateString("es-CO")}</p>
          <p><span className="block text-xs text-neutral-500">Creado</span>{dateTime(document.created_at)}</p>
          <p><span className="block text-xs text-neutral-500">Usuario</span>{document.created_by_name || document.created_by_user?.email || "--"}</p>
          <p><span className="block text-xs text-neutral-500">Sociedad</span>{document.society_code}</p>
          <p><span className="block text-xs text-neutral-500">Referencia</span>{document.reference || "--"}</p>
          <p className="md:col-span-3"><span className="block text-xs text-neutral-500">Texto</span>{document.header_text}</p>
        </section>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                <th className="px-3 py-2">Linea</th>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2">Sucursal</th>
                <th className="px-3 py-2">Centro costo</th>
                <th className="px-3 py-2">Descripcion</th>
                <th className="px-3 py-2 text-right">Debito</th>
                <th className="px-3 py-2 text-right">Credito</th>
              </tr>
            </thead>
            <tbody>
              {document.lines.map((line) => (
                <tr className="border-b border-line/70 last:border-0" key={line.id || line.line_no}>
                  <td className="px-3 py-2">{line.line_no}</td>
                  <td className="px-3 py-2 font-mono text-xs">{line.account_code}</td>
                  <td className="px-3 py-2 font-mono text-xs">{line.branch_code}</td>
                  <td className="px-3 py-2 font-mono text-xs">{line.cost_center_code}</td>
                  <td className="px-3 py-2">{line.description}</td>
                  <td className="px-3 py-2 text-right">{money(line.debit)}</td>
                  <td className="px-3 py-2 text-right">{money(line.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-paper font-semibold">
                <td className="px-3 py-2" colSpan={5}>Totales</td>
                <td className="px-3 py-2 text-right">{money(document.total_debit)}</td>
                <td className="px-3 py-2 text-right">{money(document.total_credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ModalFrame>
  );
}
