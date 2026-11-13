"use client";
import { InventorySearchSelect } from "@/components/inventory-ui";

import { FormEvent, useEffect, useState } from "react";
import { Layers3 } from "lucide-react";
import { api } from "@/lib/api";
import { InventoryNav } from "@/components/inventory-nav";
import { InventoryGuidedForm } from "@/components/inventory-workflow";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { InventoryPagination } from "@/components/inventory-ui";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/system/ToastCenter";

type Account = { id: number; code: string; name: string; active: boolean; allows_tx: boolean };
type Society = { code: string; name: string; active: boolean };
type Branch = { code: string; name: string; society_code: string; active: boolean };
type OrganizationTree = { societies: Society[]; branches: Branch[]; cost_centers: Array<{ code: string; name: string; society_code: string; branch_code: string; active: boolean }> };
type Family = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  society_code?: string | null;
  branch_code?: string | null;
  code_start?: string | null;
  code_end?: string | null;
  active: boolean;
  accounting?: Partial<typeof EMPTY_ACCOUNTING> | null;
};

const EMPTY_ACCOUNTING = {
  goods_receipt_account_code: "",
  gr_ir_account_code: "",
  sales_cost_account_code: "",
  sales_revenue_account_code: "",
  return_revenue_account_code: "",
  manual_in_account_code: "",
  manual_out_account_code: ""
};
const EMPTY_TREE: OrganizationTree = { societies: [], branches: [], cost_centers: [] };
const EMPTY_DRAFT = { code: "", name: "", description: "", society_code: "", branch_code: "", code_start: "", code_end: "", accounting: EMPTY_ACCOUNTING };

export default function InventoryFamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tree, setTree] = useState<OrganizationTree>(EMPTY_TREE);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false), [editingCode, setEditingCode] = useState("");
  const [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  async function load() {
    const [familyRows, accountRows, orgTree] = await Promise.all([
      api<Family[]>("/api/v1/inventory/families?active=all"),
      api<Account[]>("/api/v1/accounting/accounts?active=true"),
      api<OrganizationTree>("/api/v1/accounting/organization-tree")
    ]);
    setFamilies(familyRows || []);
    setAccounts((accountRows || []).filter((item) => item.active !== false && item.allows_tx !== false));
    setTree(orgTree || EMPTY_TREE);
    setDraft((current) => {
      const society = current.society_code || orgTree.societies.find((item) => item.active !== false)?.code || "";
      const branch = current.branch_code || orgTree.branches.find((item) => item.active !== false && item.society_code === society)?.code || "";
      return { ...current, society_code: society, branch_code: branch };
    });
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar familias"));
  }, []);

  function setAccounting(field: keyof typeof EMPTY_ACCOUNTING, value: string) {
    setDraft((current) => ({ ...current, accounting: { ...current.accounting, [field]: value } }));
  }

  function editFamily(family: Family) {
    setEditorOpen(true); setEditingCode(family.code); setError("");
    setDraft({
      code: family.code,
      name: family.name,
      description: family.description || "",
      society_code: family.society_code || "",
      branch_code: family.branch_code || "",
      code_start: family.code_start || "",
      code_end: family.code_end || "",
      accounting: { ...EMPTY_ACCOUNTING, ...(family.accounting || {}) }
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      const rows = await api<Family[]>("/api/v1/inventory/families", {
        method: "POST",
        body: JSON.stringify({ ...draft, code: draft.code.toUpperCase() })
      });
      setFamilies(rows);
      setDraft({ ...EMPTY_DRAFT, society_code: draft.society_code, branch_code: draft.branch_code });
      setOk("Familia guardada"); setEditorOpen(false);
      showToast({ tone: "success", title: "Familia guardada", description: `${draft.code.toUpperCase()} quedó disponible para clasificar productos.` });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "No se pudo guardar la familia";
      setError(detail);
      showToast({ tone: "error", title: "No se pudo guardar la familia", description: detail });
    } finally {
      setSaving(false);
    }
  }

  const visible = families.filter(row => [row.code, row.name, row.society_code, row.branch_code].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / 25)));
  const accountOptions = accounts.map((item) => <option key={item.id} value={item.code}>{item.code} - {item.name}</option>);
  const activeSocieties = tree.societies.filter((item) => item.active !== false);
  const activeBranches = tree.branches.filter((item) => item.active !== false && item.society_code === draft.society_code);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">Inventario</p>
        <h1 className="text-3xl font-semibold">Familias y contabilizacion</h1>
        <p className="mt-1 text-sm text-content-body">Parametriza las cuentas que compras, inventario y ventas usaran por naturaleza de producto.</p>
      </header>
      <InventoryNav />
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm">Buscar familia<input type="search" className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 sm:w-80" placeholder="Código, nombre o sucursal" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><Button onClick={() => { setEditingCode(""); setError(""); setDraft({ ...EMPTY_DRAFT, society_code: activeSocieties[0]?.code || "", branch_code: "" }); setEditorOpen(true); }} type="button">Nueva familia</Button></div>
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {ok ? <p aria-live="polite" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{ok}</p> : null}

      {editorOpen ? <ModalFrame title={editingCode ? "Editar familia" : "Nueva familia"} onClose={() => { if (!saving) setEditorOpen(false); }} maxWidth="md:!max-w-4xl"><InventoryGuidedForm key={editingCode || "new"} busy={saving} error={error} onSubmit={save} onCancel={() => setEditorOpen(false)} submitLabel="Guardar familia" steps={[{ title: "Identificación", description: "Defina la unidad contable y el rango de códigos para sus productos.", content: <>        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">Sociedad
            <InventorySearchSelect className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.society_code} onChange={(event) => setDraft((current) => ({ ...current, society_code: event.target.value, branch_code: "" }))} required>
              <option value="">Seleccionar sociedad</option>
              {activeSocieties.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
            </InventorySearchSelect>
          </label>
          <label className="text-sm">Sucursal
            <InventorySearchSelect className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.branch_code} onChange={(event) => setDraft((current) => ({ ...current, branch_code: event.target.value }))} required>
              <option value="">Seleccionar sucursal</option>
              {activeBranches.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
            </InventorySearchSelect>
          </label>
          <label className="text-sm">Codigo
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm uppercase" readOnly={Boolean(editingCode)} value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} required />
          </label>
          <label className="text-sm">Familia
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required />
          </label>
          <label className="text-sm">Codigo inicial
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" inputMode="numeric" value={draft.code_start} onChange={(event) => setDraft((current) => ({ ...current, code_start: event.target.value.replace(/\D/g, "") }))} required />
          </label>
          <label className="text-sm">Codigo final
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" inputMode="numeric" value={draft.code_end} onChange={(event) => setDraft((current) => ({ ...current, code_end: event.target.value.replace(/\D/g, "") }))} required />
          </label>
          <label className="text-sm">Descripcion
            <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
          </label>
        </div>
</> }, { title: "Contabilización", description: "Seleccione las cuentas transaccionales para cada operación de inventario.", content: <>        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AccountSelect label="Cuenta ingreso mercancia" value={draft.accounting.goods_receipt_account_code} onChange={(value) => setAccounting("goods_receipt_account_code", value)} options={accountOptions} />
          <AccountSelect label="Cuenta EM/RF" value={draft.accounting.gr_ir_account_code} onChange={(value) => setAccounting("gr_ir_account_code", value)} options={accountOptions} />
          <AccountSelect label="Cuenta ventas costo" value={draft.accounting.sales_cost_account_code} onChange={(value) => setAccounting("sales_cost_account_code", value)} options={accountOptions} />
          <AccountSelect label="Cuenta venta ingreso" value={draft.accounting.sales_revenue_account_code} onChange={(value) => setAccounting("sales_revenue_account_code", value)} options={accountOptions} />
          <AccountSelect label="Cuenta devolucion ingreso" value={draft.accounting.return_revenue_account_code} onChange={(value) => setAccounting("return_revenue_account_code", value)} options={accountOptions} />
          <AccountSelect label="Cuenta ingreso manual" value={draft.accounting.manual_in_account_code} onChange={(value) => setAccounting("manual_in_account_code", value)} options={accountOptions} />
          <AccountSelect label="Cuenta salida manual" value={draft.accounting.manual_out_account_code} onChange={(value) => setAccounting("manual_out_account_code", value)} options={accountOptions} />
        </div>
</> }]} /></ModalFrame> : null}


      <section className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase text-content-muted"><th className="px-4 py-3">Codigo</th><th className="px-4 py-3">Familia</th><th className="px-4 py-3">Sociedad</th><th className="px-4 py-3">Sucursal</th><th className="px-4 py-3">Rango productos</th><th className="px-4 py-3 text-right">Accion</th></tr></thead>
          <tbody>
            {visible.slice((currentPage - 1) * 25, currentPage * 25).map((family) => (
              <tr className="border-b border-line/70 last:border-0" key={family.id}>
                <td className="px-4 py-3 font-mono text-xs">{family.code}</td>
                <td className="px-4 py-3">{family.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{family.society_code || "--"}</td>
                <td className="px-4 py-3 font-mono text-xs">{family.branch_code || "--"}</td>
                <td className="px-4 py-3 font-mono text-xs">{family.code_start && family.code_end ? `${family.code_start}-${family.code_end}` : "--"}</td>
                <td className="px-4 py-3 text-right"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-xs" onClick={() => editFamily(family)} type="button"><Layers3 size={14} /> Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <InventoryPagination page={currentPage} total={visible.length} onChange={setPage} label="Páginas de familias" />
    </div>
  );
}

function AccountSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: React.ReactNode }) {
  return (
    <label className="text-sm">{label}
      <InventorySearchSelect className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Seleccionar cuenta</option>
        {options}
      </InventorySearchSelect>
    </label>
  );
}
