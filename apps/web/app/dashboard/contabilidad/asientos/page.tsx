"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, FilePlus2, Hash, ListPlus, Plus, Save, Search, Settings2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Account = { id: number; code: string; name: string; active: boolean; allows_tx: boolean };
type ThirdParty = { id: number; name: string; legal_name?: string | null; tax_id?: string | null; active: boolean };
type Society = { code: string; name: string; active: boolean };
type Branch = { code: string; name: string; society_code: string; active: boolean };
type CostCenter = { code: string; name: string; society_code: string; branch_code: string; active: boolean };
type OrganizationTree = { societies: Society[]; branches: Branch[]; cost_centers: CostCenter[] };
type DocumentType = { code: string; description: string; active: boolean };
type Numbering = { document_type: string; prefix: string; next_number: number; active: boolean };
type DocumentMasters = { document_types: DocumentType[]; numbering: Numbering[] };
type DocumentLine = {
  account_code: string;
  branch_code: string;
  cost_center_code: string;
  party_id: string;
  party_query: string;
  movement: "debit" | "credit";
  description: string;
  amount: string;
};
type AccountingDocument = {
  id: number;
  full_number: string;
  document_type: string;
  posting_date: string;
  created_at: string;
  created_by?: number | null;
  created_by_name?: string | null;
  created_by_user?: { id: number; name: string; email: string } | null;
  reference?: string | null;
  header_text: string;
  society_code: string;
  total_debit: number;
  total_credit: number;
  lines: Array<{ id: number; line_no: number; account_code: string; branch_code: string; cost_center_code: string; party_tax_id?: string | null; debit: number; credit: number; description: string }>;
};

const EMPTY_TREE: OrganizationTree = { societies: [], branches: [], cost_centers: [] };
const EMPTY_MASTERS: DocumentMasters = { document_types: [], numbering: [] };
const EMPTY_LINE: DocumentLine = { account_code: "", branch_code: "", cost_center_code: "", party_id: "", party_query: "", movement: "debit", description: "", amount: "" };

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

export default function AsientosContablesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<ThirdParty[]>([]);
  const [tree, setTree] = useState<OrganizationTree>(EMPTY_TREE);
  const [masters, setMasters] = useState<DocumentMasters>(EMPTY_MASTERS);
  const [documents, setDocuments] = useState<AccountingDocument[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [mastersOpen, setMastersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [header, setHeader] = useState({ posting_date: today(), document_type: "CC", society_code: "", reference: "", header_text: "" });
  const [lines, setLines] = useState<DocumentLine[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE, movement: "credit" }]);
  const [typeDraft, setTypeDraft] = useState({ code: "", description: "" });
  const [numberingDraft, setNumberingDraft] = useState({ document_type: "CC", prefix: "CC", next_number: 1 });
  const [chooser, setChooser] = useState<{ type: "account" | "party"; lineIndex: number } | null>(null);
  const [chooserSearch, setChooserSearch] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<AccountingDocument | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [accountRows, partyRows, orgTree, docMasters, docRows] = await Promise.all([
        api<Account[]>("/api/v1/accounting/accounts?active=true"),
        api<ThirdParty[]>("/api/v1/accounting/third-parties?active=true&limit=300"),
        api<OrganizationTree>("/api/v1/accounting/organization-tree"),
        api<DocumentMasters>("/api/v1/accounting/document-masters"),
        api<AccountingDocument[]>("/api/v1/accounting/documents?limit=50")
      ]);
      setAccounts(accountRows.filter((item) => item.active !== false && item.allows_tx !== false));
      setParties(partyRows.filter((item) => item.active !== false));
      setTree(orgTree);
      setMasters(docMasters);
      setDocuments(docRows);
      setHeader((current) => ({
        ...current,
        document_type: current.document_type || docMasters.document_types.find((item) => item.active !== false)?.code || "CC",
        society_code: current.society_code || orgTree.societies.find((item) => item.active !== false)?.code || ""
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar contabilidad");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeDocTypes = masters.document_types.filter((item) => item.active !== false);
  const activeSocieties = tree.societies.filter((item) => item.active !== false);
  const branches = tree.branches.filter((item) => item.active !== false && item.society_code === header.society_code);
  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + (line.movement === "debit" ? Number(line.amount) || 0 : 0), 0);
    const credit = lines.reduce((sum, line) => sum + (line.movement === "credit" ? Number(line.amount) || 0 : 0), 0);
    return { debit, credit, diff: Math.round((debit - credit) * 100) / 100, balanced: Math.abs(debit - credit) <= 0.01 && debit > 0 };
  }, [lines]);
  const nextNumber = masters.numbering.find((item) => item.document_type === header.document_type);

  function updateLine(index: number, patch: Partial<DocumentLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function partyLabel(party: ThirdParty) {
    return `${party.tax_id ? `${party.tax_id} - ` : ""}${party.legal_name || party.name}`;
  }

  function findPartyFromInput(value: string) {
    const text = value.trim().toLowerCase();
    if (!text) return null;
    return parties.find((party) => {
      const label = partyLabel(party).toLowerCase();
      return String(party.id) === value.trim() || party.tax_id === value.trim() || label === text || label.includes(text);
    }) || null;
  }

  function openChooser(type: "account" | "party", lineIndex: number) {
    setChooser({ type, lineIndex });
    setChooserSearch("");
  }

  function selectAccount(lineIndex: number, account: Account) {
    updateLine(lineIndex, { account_code: account.code });
    setChooser(null);
  }

  function selectParty(lineIndex: number, party: ThirdParty) {
    updateLine(lineIndex, { party_id: String(party.id), party_query: partyLabel(party) });
    setChooser(null);
  }

  function resolveAccount(lineIndex: number) {
    const value = lines[lineIndex]?.account_code.trim();
    if (!value) {
      openChooser("account", lineIndex);
      return;
    }
    const match = accounts.find((account) => account.code === value || `${account.code} - ${account.name}`.toLowerCase() === value.toLowerCase());
    if (match) updateLine(lineIndex, { account_code: match.code });
  }

  function resolveParty(lineIndex: number) {
    const value = lines[lineIndex]?.party_query.trim();
    if (!value) {
      openChooser("party", lineIndex);
      return;
    }
    const match = findPartyFromInput(value);
    if (match) updateLine(lineIndex, { party_id: String(match.id), party_query: partyLabel(match) });
    else updateLine(lineIndex, { party_id: "" });
  }

  function addLine() {
    setLines((current) => [...current, { ...EMPTY_LINE, movement: current.length % 2 === 0 ? "debit" : "credit" }]);
  }

  function removeLine(index: number) {
    setLines((current) => current.length <= 2 ? current : current.filter((_, lineIndex) => lineIndex !== index));
  }

  function openCreate() {
    setHeader((current) => ({ ...current, posting_date: today(), reference: "", header_text: "" }));
    setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE, movement: "credit" }]);
    setModalOpen(true);
  }

  async function saveDocument(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const resolvedLines = lines.map((line, index) => {
        const party = line.party_id ? parties.find((item) => item.id === Number(line.party_id)) : findPartyFromInput(line.party_query);
        if (!party) throw new Error(`El tercero de la linea ${index + 1} debe existir en el maestro`);
        return { ...line, party_id: String(party.id), party_query: partyLabel(party) };
      });
      const payload = {
        ...header,
        lines: resolvedLines.map((line) => ({ ...line, party_id: Number(line.party_id), amount: Number(line.amount) }))
      };
      const created = await api<AccountingDocument>("/api/v1/accounting/documents", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setDocuments((current) => [created, ...current]);
      setModalOpen(false);
      setOk(`Comprobante ${created.full_number} contabilizado`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo contabilizar el documento");
    } finally {
      setSaving(false);
    }
  }

  async function saveType(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await api<DocumentMasters>("/api/v1/accounting/document-masters/types", {
        method: "POST",
        body: JSON.stringify(typeDraft)
      });
      setMasters(data);
      setTypeDraft({ code: "", description: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el tipo de documento");
    } finally {
      setSaving(false);
    }
  }

  async function saveNumbering(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await api<DocumentMasters>("/api/v1/accounting/document-masters/numbering", {
        method: "POST",
        body: JSON.stringify({ ...numberingDraft, next_number: Number(numberingDraft.next_number) })
      });
      setMasters(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la numeracion");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Asientos contables</h1>
          <p className="mt-1 text-sm text-neutral-600">Registro de comprobantes con cabecera, detalle, numeracion y validacion de doble partida.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm" onClick={() => setMastersOpen(true)} type="button">
            <Settings2 size={16} /> Maestros
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={openCreate} type="button">
            <FilePlus2 size={16} /> Nuevo asiento
          </button>
        </div>
      </header>
      <ContabilidadNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric icon={BookOpenCheck} label="Comprobantes" value={documents.length} />
        <Metric icon={ListPlus} label="Tipos activos" value={activeDocTypes.length} />
        <Metric icon={Hash} label="Proximo numero" value={nextNumber?.next_number || 1} />
        <div className="rounded-md border border-line bg-white p-3">
          <p className="text-xs text-neutral-500">Ultimo comprobante</p>
          <p className="mt-1 truncate text-2xl font-semibold">{documents[0]?.full_number || "--"}</p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-neutral-500">
              <th className="px-4 py-3">Numero</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Sociedad</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Texto</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3 text-right">Debitos</th>
              <th className="px-4 py-3 text-right">Creditos</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-4 py-5 text-neutral-500" colSpan={9}>Cargando...</td></tr> : null}
            {!loading && documents.length === 0 ? <tr><td className="px-4 py-5 text-neutral-500" colSpan={9}>No hay comprobantes registrados.</td></tr> : null}
            {documents.map((doc) => (
              <tr className="border-b border-line/70 last:border-0" key={doc.id}>
                <td className="px-4 py-3 font-mono text-xs">
                  <button className="font-mono text-xs text-apex underline-offset-2 hover:underline" onDoubleClick={() => setSelectedDocument(doc)} type="button" title="Doble click para ver el registro contable">{doc.full_number}</button>
                </td>
                <td className="px-4 py-3">{new Date(doc.posting_date).toLocaleDateString("es-CO")}</td>
                <td className="px-4 py-3">{doc.society_code}</td>
                <td className="px-4 py-3">{doc.reference || "--"}</td>
                <td className="px-4 py-3">{doc.header_text}</td>
                <td className="px-4 py-3">{dateTime(doc.created_at)}</td>
                <td className="px-4 py-3">{doc.created_by_name || doc.created_by_user?.email || "--"}</td>
                <td className="px-4 py-3 text-right">{money(doc.total_debit)}</td>
                <td className="px-4 py-3 text-right">{money(doc.total_credit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {modalOpen ? (
        <ModalFrame title="Nuevo asiento contable" onClose={() => setModalOpen(false)} maxWidth="max-w-6xl">
          <form className="space-y-4" onSubmit={saveDocument}>
            <section className="grid gap-3 md:grid-cols-5">
              <label className="text-sm">
                Fecha contabilizacion
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={header.posting_date} onChange={(event) => setHeader((current) => ({ ...current, posting_date: event.target.value }))} required />
              </label>
              <label className="text-sm">
                Tipo documento
                <select className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.document_type} onChange={(event) => setHeader((current) => ({ ...current, document_type: event.target.value }))} required>
                  {activeDocTypes.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.description}</option>)}
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
                Referencia
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.reference} onChange={(event) => setHeader((current) => ({ ...current, reference: event.target.value }))} />
              </label>
              <label className="text-sm">
                Numero
                <input className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-3 text-sm" value={`${nextNumber?.prefix || header.document_type}-${String(nextNumber?.next_number || 1).padStart(6, "0")}`} readOnly />
              </label>
              <label className="text-sm md:col-span-5">
                Texto de cabecera
                <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" value={header.header_text} onChange={(event) => setHeader((current) => ({ ...current, header_text: event.target.value }))} required />
              </label>
            </section>

            <section className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[1180px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                    <th className="px-3 py-2">Cuenta</th>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2">Centro costo</th>
                    <th className="px-3 py-2">Tercero</th>
                    <th className="px-3 py-2">Mov.</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Descripcion</th>
                    <th className="px-3 py-2 text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const lineCostCenters = tree.cost_centers.filter((item) => item.active !== false && item.branch_code === line.branch_code && item.society_code === header.society_code);
                    return (
                      <tr className="border-b border-line/70 last:border-0" key={index}>
                        <td className="px-3 py-2">
                          <input
                            className="h-10 w-full rounded-md border border-line px-2 text-sm"
                            value={line.account_code}
                            onBlur={() => resolveAccount(index)}
                            onChange={(event) => updateLine(index, { account_code: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                resolveAccount(index);
                              }
                            }}
                            placeholder="Codigo cuenta"
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
                          <select className="h-10 w-full rounded-md border border-line px-2 text-sm" value={line.cost_center_code} onChange={(event) => updateLine(index, { cost_center_code: event.target.value })} required>
                            <option value="">Centro</option>
                            {lineCostCenters.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="h-10 w-full rounded-md border border-line px-2 text-sm"
                            value={line.party_query}
                            onBlur={() => resolveParty(index)}
                            onChange={(event) => updateLine(index, { party_query: event.target.value, party_id: "" })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                resolveParty(index);
                              }
                            }}
                            placeholder="Documento o tercero"
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
                          <input className="h-10 w-full rounded-md border border-line px-2 text-sm" type="number" min="0.01" step="0.01" value={line.amount} onChange={(event) => updateLine(index, { amount: event.target.value })} required />
                        </td>
                        <td className="px-3 py-2">
                          <input className="h-10 w-full rounded-md border border-line px-2 text-sm" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} required />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-700 disabled:opacity-40" disabled={lines.length <= 2} onClick={() => removeLine(index)} type="button" aria-label="Borrar linea">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-center md:justify-between">
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm" onClick={addLine} type="button">
                <Plus size={16} /> Linea
              </button>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>Debitos: <strong>{money(totals.debit)}</strong></span>
                <span>Creditos: <strong>{money(totals.credit)}</strong></span>
                <span className={totals.balanced ? "text-emerald-700" : "text-rose-700"}>Diferencia: <strong>{money(Math.abs(totals.diff))}</strong></span>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 font-medium text-white disabled:opacity-60" disabled={saving || !totals.balanced} type="submit">
                  <Save size={16} /> {saving ? "Contabilizando..." : "Contabilizar"}
                </button>
              </div>
            </section>
          </form>
        </ModalFrame>
      ) : null}

      {selectedDocument ? (
        <AccountingDocumentModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />
      ) : null}

      {mastersOpen ? (
        <ModalFrame title="Maestros de comprobantes" onClose={() => setMastersOpen(false)} maxWidth="max-w-5xl">
          <div className="grid gap-4 md:grid-cols-2">
            <form className="space-y-3" onSubmit={saveType}>
              <h2 className="text-base font-semibold">Tipos de documento</h2>
              <div className="grid gap-2 md:grid-cols-[120px_1fr]">
                <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Codigo" value={typeDraft.code} onChange={(event) => setTypeDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} required />
                <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Descripcion" value={typeDraft.description} onChange={(event) => setTypeDraft((current) => ({ ...current, description: event.target.value }))} required />
              </div>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" type="submit">
                <ListPlus size={16} /> Guardar tipo
              </button>
              <div className="max-h-72 overflow-auto rounded-md border border-line">
                {masters.document_types.map((item) => <p className="border-b border-line px-3 py-2 text-sm last:border-0" key={item.code}><strong>{item.code}</strong> {item.description}</p>)}
              </div>
            </form>
            <form className="space-y-3" onSubmit={saveNumbering}>
              <h2 className="text-base font-semibold">Numeracion</h2>
              <div className="grid gap-2 md:grid-cols-3">
                <select className="h-10 rounded-md border border-line px-3 text-sm" value={numberingDraft.document_type} onChange={(event) => setNumberingDraft((current) => ({ ...current, document_type: event.target.value, prefix: event.target.value }))}>
                  {activeDocTypes.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
                </select>
                <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Prefijo" value={numberingDraft.prefix} onChange={(event) => setNumberingDraft((current) => ({ ...current, prefix: event.target.value.toUpperCase() }))} />
                <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" min={1} value={numberingDraft.next_number} onChange={(event) => setNumberingDraft((current) => ({ ...current, next_number: Number(event.target.value) }))} required />
              </div>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" type="submit">
                <Hash size={16} /> Guardar numeracion
              </button>
              <div className="max-h-72 overflow-auto rounded-md border border-line">
                {masters.numbering.map((item) => <p className="border-b border-line px-3 py-2 text-sm last:border-0" key={item.document_type}><strong>{item.document_type}</strong> {item.prefix}-{String(item.next_number).padStart(6, "0")}</p>)}
              </div>
            </form>
          </div>
        </ModalFrame>
      ) : null}

      {chooser ? (
        <ModalFrame title={chooser.type === "account" ? "Buscar cuenta contable" : "Buscar tercero"} onClose={() => setChooser(null)} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={16} />
              <input
                autoFocus
                className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm"
                value={chooserSearch}
                onChange={(event) => setChooserSearch(event.target.value)}
                placeholder={chooser.type === "account" ? "Buscar por codigo o nombre" : "Buscar por documento o nombre"}
              />
            </label>
            <div className="max-h-[60vh] overflow-auto rounded-md border border-line">
              {chooser.type === "account" ? (
                <table className="w-full min-w-[620px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                      <th className="px-3 py-2">Codigo</th>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2 text-right">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.filter((account) => {
                      const text = chooserSearch.toLowerCase();
                      return !text || account.code.toLowerCase().includes(text) || account.name.toLowerCase().includes(text);
                    }).map((account) => (
                      <tr className="border-b border-line/70 last:border-0" key={account.id}>
                        <td className="px-3 py-2 font-mono text-xs">{account.code}</td>
                        <td className="px-3 py-2">{account.name}</td>
                        <td className="px-3 py-2 text-right">
                          <button className="h-9 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={() => selectAccount(chooser.lineIndex, account)} type="button">Seleccionar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
                      <th className="px-3 py-2">Documento</th>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2 text-right">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parties.filter((party) => {
                      const text = chooserSearch.toLowerCase();
                      const label = partyLabel(party).toLowerCase();
                      return !text || label.includes(text) || String(party.id).includes(text);
                    }).map((party) => (
                      <tr className="border-b border-line/70 last:border-0" key={party.id}>
                        <td className="px-3 py-2 font-mono text-xs">{party.tax_id || party.id}</td>
                        <td className="px-3 py-2">{party.legal_name || party.name}</td>
                        <td className="px-3 py-2 text-right">
                          <button className="h-9 rounded-md bg-apex px-3 text-sm font-medium text-white" onClick={() => selectParty(chooser.lineIndex, party)} type="button">Seleccionar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpenCheck; label: string; value: string | number }) {
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
          <p><span className="block text-xs text-neutral-500">Clase / numero</span>{document.document_type} / {document.full_number}</p>
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
                <th className="px-3 py-2">NIT tercero</th>
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
                  <td className="px-3 py-2 font-mono text-xs">{line.party_tax_id || "--"}</td>
                  <td className="px-3 py-2">{line.description}</td>
                  <td className="px-3 py-2 text-right">{money(line.debit)}</td>
                  <td className="px-3 py-2 text-right">{money(line.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-paper font-semibold">
                <td className="px-3 py-2" colSpan={6}>Totales</td>
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
