"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, Plus, Search, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { buildAccountTree, fetchAccountPages, filterAccountTree, normalizeChartPreview, type AccountTreeNode } from "@/lib/accounting-account-tree";
type Account = {
    id: number;
    code: string;
    name: string;
    type: string;
    level: number;
    parent_id?: number | null;
    allows_tx: boolean;
    active: boolean;
    has_transactions?: boolean;
};
type Preview = {
    existing_count: number;
    catalog_count: number;
    create_count: number;
    custom_parent_count: number;
    custom_parents: Array<{ code: string; name: string; parent_code: string }>;
    link_count: number;
    conflict_count: number;
    warning_count: number;
    conflicts: Array<{
        code: string;
        reason: string;
    }>;
    apply_ready: boolean;
};
const PAGE_SIZE = 500;
const TYPES: Record<string, string> = { asset: "Activo", liability: "Pasivo", equity: "Patrimonio", income: "Ingreso", expense: "Gasto", cost: "Costo", order: "Orden" };
async function fetchAllAccounts() { return fetchAccountPages((offset, limit) => api<Account[]>(`/api/v1/accounting/accounts?limit=${limit}&offset=${offset}`), PAGE_SIZE); }
export default function PlanCuentasPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [editing, setEditing] = useState<Account | null>(null);
    const [country, setCountry] = useState("CO");
    const [query, setQuery] = useState("");
    const [type, setType] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [applying, setApplying] = useState(false);
    const [form, setForm] = useState({ code: "", name: "", parent_code: "", type: "asset", level: 1, allows_tx: true, active: true });
    const [ok, setOk] = useState("");
    const [error, setError] = useState("");
    const load = useCallback(async () => { setLoading(true); setError(""); try {
        setAccounts(await fetchAllAccounts());
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el plan de cuentas");
    }
    finally {
        setLoading(false);
    } }, []);
    useEffect(() => { void load(); }, [load]);
    const tree = useMemo(() => buildAccountTree(accounts.filter((account) => !type || account.type === type)), [accounts, type]);
    const visibleTree = useMemo(() => filterAccountTree(tree, query), [tree, query]);
    const selectableParents = useMemo(() => accounts.filter((account) => [1, 2, 4, 6].includes(account.code.length) && account.active), [accounts]);
    const stats = useMemo(() => ({ total: accounts.length, active: accounts.filter((a) => a.active).length, leaf: accounts.filter((a) => a.allows_tx).length, conflicts: preview?.conflict_count || 0 }), [accounts, preview]);
    function toggle(code: string) { setExpanded((current) => { const next = new Set(current); if (next.has(code))
        next.delete(code);
    else
        next.add(code); return next; }); }
    function openCreate() { setEditing(null); setForm({ code: "", name: "", parent_code: "", type: "asset", level: 1, allows_tx: true, active: true }); setModalOpen(true); setError(""); }
    function openEdit(account: Account) { setEditing(account); setForm({ code: account.code, name: account.name, parent_code: account.code.length >= 8 ? account.code.slice(0, 6) : "", type: account.type, level: account.level, allows_tx: account.allows_tx, active: account.active }); setModalOpen(true); setError(""); }
    async function saveAccount(event: FormEvent) { event.preventDefault(); if (!editing)
        return createManual(event); setSaving(true); try {
        await api<Account>(`/api/v1/accounting/accounts/${editing.id}`, { method: "PUT", body: JSON.stringify({ code: editing.code, name: form.name.trim(), type: form.type, active: form.active, allows_tx: form.allows_tx, level: form.level }) });
        setModalOpen(false);
        setOk(`Cuenta ${editing.code} actualizada`);
        await load();
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar la cuenta");
    }
    finally {
        setSaving(false);
    } }
    async function toggleAccount(account: Account) { try {
        await api<Account>(`/api/v1/accounting/accounts/${account.id}`, { method: "PUT", body: JSON.stringify({ code: account.code, name: account.name, type: account.type, active: !account.active, allows_tx: account.allows_tx }) });
        await load();
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    } }
    async function legacyInit() { try {
        const rows = await api<Account[]>("/api/v1/accounting/chart/init", { method: "POST", body: JSON.stringify({ country }) });
        setOk(`Inicialización existente completada: ${rows.length} cuentas`);
        await load();
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo inicializar el catálogo");
    } }
    async function createManual(event: FormEvent) { event.preventDefault(); const hasParent = Boolean(form.parent_code); if (!/^\d{1,8}$/.test(form.code) || (hasParent && (form.code.length !== form.parent_code.length + 2 || !form.code.startsWith(form.parent_code)))) {
        setError("La cuenta debe usar la longitud jerárquica siguiente a su cuenta padre; una auxiliar de 8 dígitos debe pertenecer a una subcuenta de 6.");
        return;
    } setSaving(true); setError(""); setOk(""); try {
        await api<Account>("/api/v1/accounting/accounts", { method: "POST", body: JSON.stringify({ code: form.code, name: form.name.trim(), type: form.type, parent_code: form.parent_code || null, level: form.level || Math.max(1, Math.ceil(form.code.length / 2)), allows_tx: form.allows_tx, active: form.active }) });
        setModalOpen(false);
        setOk(`Cuenta ${form.code} creada${form.parent_code ? ` bajo ${form.parent_code}` : ""}`);
        await load();
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    }
    finally {
        setSaving(false);
    } }
    async function previewCatalog() { setPreviewing(true); setError(""); setOk(""); try {
        const raw = await api<Record<string, unknown>>("/api/v1/accounting/chart/preview", { method: "POST", body: JSON.stringify({ country }) });
        const result = normalizeChartPreview(raw);
        setPreview(result);
        setOk(`Previsualización lista: ${result.create_count} cuentas nuevas, ${result.link_count} vínculos y ${result.conflict_count} conflictos.`);
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo previsualizar el PUC");
    }
    finally {
        setPreviewing(false);
    } }
    async function applyCatalog() { if (!preview || !preview.apply_ready)
        return; setApplying(true); setError(""); setOk(""); try {
        const result = await api<{
            created_count?: number;
            linked_count?: number;
            created?: unknown[];
            repairs?: unknown[];
        }>("/api/v1/accounting/chart/apply", { method: "POST", body: JSON.stringify({ country: "CO", expected_create_count: preview.create_count, expected_link_count: preview.link_count }) });
        const created = result.created_count ?? result.created?.length ?? preview.create_count;
        const linked = result.linked_count ?? result.repairs?.length ?? preview.link_count;
        setOk(`PUC aplicado: ${created} cuentas creadas y ${linked} vínculos actualizados.`);
        setPreview(null);
        await load();
    }
    catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo aplicar el PUC");
    }
    finally {
        setApplying(false);
    } }
    function renderNode(node: AccountTreeNode<Account>, depth = 0): React.ReactNode { const open = query.trim() ? true : expanded.has(node.code); return <div key={node.id}><div className={`flex items-center gap-2 border-b border-line/50 px-3 py-2 text-sm ${node.orphan ? "bg-amber-50" : ""}`} style={{ paddingLeft: `${12 + depth * 22}px` }}>{node.children.length ? <button type="button" aria-label={`${open ? "Contraer" : "Expandir"} ${node.code}`} onClick={() => toggle(node.code)}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</button> : <span className="w-4"/>}<span className="w-20 font-mono text-xs font-semibold">{node.code}</span><span className="min-w-0 flex-1 truncate">{node.name}</span><span className="hidden text-xs text-neutral-500 md:inline">{TYPES[node.type] || node.type}</span>{node.orphan ? <span className="rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-800">Sin ascendencia</span> : null}<span className={`rounded px-2 py-1 text-[11px] ${node.allows_tx ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{node.allows_tx ? "Movimiento" : "Agrupadora"}</span><button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => openEdit(node)} aria-label={`Editar ${node.code}`}>Editar</button><button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => void toggleAccount(node)} aria-label={`Cambiar estado ${node.code}`}>{node.active ? "Desactivar" : "Activar"}</button></div>{open && node.children.map((child) => renderNode(child, depth + 1))}</div>; }
    return (
        <div className="space-y-5">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-3xl font-semibold">Plan de cuentas PUC</h1>
                    <p className="mt-1 text-sm text-neutral-600">Árbol colombiano completo, búsqueda por ascendencia y altas manuales protegidas.</p>
                </div>
                <div className="flex gap-2">
                    <button className="inline-flex h-10 items-center gap-2 rounded-md border border-apex px-4 text-sm font-medium text-apex" onClick={() => void previewCatalog()} disabled={previewing} type="button"><Eye size={16} />{previewing ? "Previsualizando..." : "Previsualizar PUC"}</button>
                    <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={() => void legacyInit()} type="button">Inicializar catálogo existente</button>
                    <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={openCreate} type="button"><Plus size={16} />Nueva cuenta 8 dígitos</button>
                </div>
            </header>
            <ContabilidadNav />
            {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}
            <section className="grid gap-3 md:grid-cols-4">
                {[["Cuentas cargadas", stats.total], ["Activas", stats.active], ["Transaccionales", stats.leaf], ["Conflictos PUC", stats.conflicts]].map(([label, value]) => <div className="rounded-md border border-line bg-white p-3" key={String(label)}><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
            </section>
            {preview ? <section className="rounded-md border border-apex/30 bg-[#146C6308] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Previsualización del PUC Colombia</h2><p className="text-sm text-neutral-600">{preview.existing_count} existentes · {preview.catalog_count} catálogo · {preview.create_count} crear · {preview.custom_parent_count} padres personalizados · {preview.link_count} vincular · {preview.conflict_count} conflictos</p></div><button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={applying || !preview.apply_ready} onClick={() => void applyCatalog()} type="button"><Upload size={16} />{applying ? "Aplicando..." : "Aplicar cambios"}</button></div>{preview.custom_parents.length ? <ul className="mt-3 space-y-1 text-sm text-neutral-700">{preview.custom_parents.map((parent) => <li key={parent.code}>Se creará <strong>{parent.code}</strong> bajo {parent.parent_code || "su cuenta existente"}: {parent.name}</li>)}</ul> : null}{preview.conflict_count || preview.warning_count ? <ul className="mt-3 space-y-1 text-sm text-red-700">{preview.conflicts.slice(0, 8).map((conflict) => <li key={conflict.code}><strong>{conflict.code}</strong>: {conflict.reason}</li>)}</ul> : <p className="mt-3 text-sm text-emerald-700">Sin conflictos estructurales. La aplicación está lista y conserva cuentas históricas.</p>}</section> : null}
            <section className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-[1fr_180px_auto]">
                <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código o nombre; conserva ascendencia" /></label>
                <input className="h-10 w-20 rounded-md border border-line px-3 text-sm" value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} aria-label="País del catálogo" />
                <select className="h-10 rounded-md border border-line px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos los tipos</option>{Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setExpanded(new Set(accounts.map((account) => account.code)))} type="button">Expandir todo</button>
            </section>
            <section className="overflow-hidden rounded-md border border-line bg-white"><div className="flex items-center justify-between border-b border-line bg-paper px-4 py-3"><h2 className="font-semibold">Estructura jerárquica</h2>{query ? <span className="text-xs text-neutral-500">Mostrando coincidencias y sus ancestros</span> : null}</div>{loading ? <p className="p-5 text-sm text-neutral-500">Cargando todas las páginas del plan...</p> : visibleTree.length ? visibleTree.map((node) => renderNode(node)) : <p className="p-5 text-sm text-neutral-500">No hay cuentas para mostrar.</p>}</section>
            {modalOpen ? <ModalFrame title={editing ? "Editar cuenta" : "Nueva cuenta auxiliar"} onClose={() => setModalOpen(false)} maxWidth="max-w-2xl"><form className="grid gap-4 md:grid-cols-2" onSubmit={saveAccount}><p className="md:col-span-2 rounded-md bg-paper p-3 text-sm text-neutral-600">{editing ? "Las cuentas con movimientos históricos conservan sus datos y las reglas del servidor." : "Las cuentas de 8 dígitos se crean como auxiliares futuras bajo una subcuenta PUC de 6 dígitos. Para conservar altas existentes, el padre puede quedar vacío."}</p>{editing ? null : <label className="text-sm">Cuenta padre<select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.parent_code} onChange={(event) => { const parent = selectableParents.find((item) => item.code === event.target.value); setForm((prev) => ({ ...prev, parent_code: event.target.value, code: event.target.value, type: parent?.type ?? prev.type, level: event.target.value ? Math.ceil((event.target.value.length + 2) / 2) : prev.level })); }}><option value="">Sin padre / alta existente</option>{selectableParents.map((parent) => <option key={parent.id} value={parent.code}>{parent.code} · {parent.name}</option>)}</select></label>}<label className="text-sm">Código de cuenta<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-mono" value={form.code} maxLength={8} disabled={Boolean(editing)} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.replace(/\D/g, "").slice(0, 8), level: event.target.value.length === 8 ? 5 : prev.level }))} required /></label><label className="text-sm md:col-span-2">Nombre<input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required /></label><label className="text-sm">Nivel<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="number" min={1} max={5} value={form.level} onChange={(event) => setForm((prev) => ({ ...prev, level: Number(event.target.value) }))} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allows_tx} onChange={(event) => setForm((prev) => ({ ...prev, allows_tx: event.target.checked }))} />Permite movimientos</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))} />Cuenta activa</label><label className="text-sm">Clase contable<select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>{Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="flex items-end justify-end gap-2 md:col-span-2"><button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setModalOpen(false)} type="button">Cancelar</button><button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving} type="submit">{saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear cuenta"}</button></div></form></ModalFrame> : null}
        </div>
    );
}
