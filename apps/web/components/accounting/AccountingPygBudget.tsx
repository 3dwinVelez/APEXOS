"use client";

import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { formatRegionalMoney } from "@/lib/regionalFormat";
import { CheckCircle2, Plus, Save, Search, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type OrgBranch = { code: string; name: string; active: boolean; society_code: string | null };
type OrgCenter = { code: string; name: string; active: boolean; branch_code: string | null; society_code: string | null };
type AccountOption = { id: number; code: string; name: string; active: boolean };
type BudgetRowDto = {
  period: string; account_id: number; account_code: string | null; account_name: string | null; account_active: boolean | null;
  branch_code: string; cost_center_code: string; amount: number; updated_at: string | null;
};
type BudgetPayload = { period: string; rows: Array<{ account_id: number; branch_code: string; cost_center_code: string; amount: number }> };
type BudgetResponse = { period: string; rows: BudgetRowDto[]; updated_at: string | null };

type EditorRow = {
  key: string;
  persisted: boolean;
  account_id: number | null;
  branch_code: string;
  cost_center_code: string;
  amount: string;
  account_label?: string;
  account_query?: string;
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export default function AccountingPygBudget({ defaultPeriod, onSaved }: { defaultPeriod: string; onSaved: () => void }) {
  const canWrite = hasStoredRolePermission("accounting", "write");
  const [period, setPeriod] = useState(defaultPeriod || currentMonth());
  const [branches, setBranches] = useState<OrgBranch[]>([]);
  const [centers, setCenters] = useState<OrgCenter[]>([]);
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [savedRows, setSavedRows] = useState<BudgetRowDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const nextKey = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    api<{ branches: OrgBranch[]; cost_centers: OrgCenter[] }>("/api/v1/accounting/organization-tree", { cache: "no-store", signal: controller.signal })
      .then((tree) => {
        setBranches(tree.branches.filter((row) => row.active));
        setCenters(tree.cost_centers.filter((row) => row.active));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<BudgetResponse>(`/api/v1/accounting/reports/pyg-interactive/budgets?period=${encodeURIComponent(period)}`, { cache: "no-store", signal: controller.signal })
      .then((budgets) => {
        setSavedRows(budgets.rows);
        setRows(budgets.rows.map((row) => ({
          key: `persisted:${row.account_id}:${row.branch_code}:${row.cost_center_code}`,
          persisted: true,
          account_id: row.account_id,
          branch_code: row.branch_code,
          cost_center_code: row.cost_center_code,
          amount: String(row.amount),
          account_label: row.account_code ? `${row.account_code}${row.account_name ? ` · ${row.account_name}` : ""}` : "",
          account_query: row.account_code || String(row.account_id)
        })));
      })
      .catch((value) => { if (value?.name !== "AbortError") setError(value instanceof Error ? value.message : "No fue posible leer el presupuesto."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [period, reloadToken]);

  const centersFor = useCallback((branch: string) => centers.filter((center) => center.branch_code === branch), [centers]);

  const setRow = (key: string, patch: Partial<EditorRow>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const addRow = () => {
    nextKey.current += 1;
    setRows((current) => [...current, { key: `new:${nextKey.current}`, persisted: false, account_id: null, branch_code: "", cost_center_code: "", amount: "" }]);
  };
  const removeRow = (key: string) => setRows((current) => current.filter((row) => row.key !== key));

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const invalidAmount = rows.find((row) => row.amount !== "" && (!Number.isFinite(Number(row.amount)) || Number(row.amount) < 0));
      if (invalidAmount) {
        setError("Revisa los valores del presupuesto: deben ser números no negativos.");
        return;
      }
      const incomplete = rows.find((row) => (row.account_id !== null || row.branch_code || row.cost_center_code || row.amount !== "") && !(row.account_id !== null && row.branch_code && row.cost_center_code));
      if (incomplete) {
        setError("Completa la cuenta PUC, sucursal y centro de costo en todas las filas, o elimina las filas incompletas.");
        return;
      }
      const payload: BudgetPayload = {
        period,
        rows: rows
          .filter((row) => row.account_id !== null && row.branch_code && row.cost_center_code && row.amount !== "")
          .map((row) => ({ account_id: row.account_id as number, branch_code: row.branch_code, cost_center_code: row.cost_center_code, amount: Number(row.amount) }))
      };
      const emptiedPersisted = rows.filter((row) => row.persisted && row.amount === "").length;
      if (!payload.rows.length && !emptiedPersisted) {
        setError("Agrega al menos una fila con cuenta, sucursal, centro de costo y valor.");
        return;
      }
      const saved = await api<{ period: string; saved_count: number; created_count: number; updated_count: number }>(
        "/api/v1/accounting/reports/pyg-interactive/budgets",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      setNotice(`Presupuesto ${saved.period} guardado: ${saved.created_count} nuevas y ${saved.updated_count} actualizadas.${emptiedPersisted ? " Las filas existentes con valor vacío conservan su presupuesto anterior (la API no elimina filas)." : ""}`);
      setPeriod(saved.period);
      setReloadToken((current) => current + 1);
      onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : "No fue posible guardar el presupuesto.");
    } finally {
      setSaving(false);
    }
  }, [period, rows, onSaved]);

  return (
    <section className="space-y-4">
      <div className="apex-section-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-muted p-4">
          <div>
            <h2 className="font-semibold text-content-strong">Presupuesto mensual por cuenta PUC, sucursal y centro de costo</h2>
            <p className="mt-1 max-w-3xl text-xs text-content-muted">
              Cada tupla cuenta PUC (clases 4-7) · sucursal · centro de costo tiene un presupuesto mensual. Deja el valor en blanco para dejarla sin planear; un cero explícito es un presupuesto de cero. La matriz usa la suma de los meses del rango seleccionado en modo acumulado.
            </p>
          </div>
          <label className="text-xs text-content-muted">Periodo<input className="mt-1 block h-9 rounded-md border border-line bg-surface px-2 text-content-strong" onChange={(event) => { setPeriod(event.target.value); setNotice(""); }} type="month" value={period} /></label>
        </div>

        {error ? <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400"><TriangleAlert className="mt-0.5 shrink-0" size={16} />{error}</div> : null}
        {notice ? <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400"><CheckCircle2 className="mt-0.5 shrink-0" size={16} />{notice}</div> : null}

        {!canWrite ? (
          <div className="p-4">
            <div className="mb-3 rounded-md bg-surface-muted px-3 py-2 text-xs font-semibold text-content-muted">Consulta de solo lectura: tu rol no tiene permiso de escritura en contabilidad.</div>
            <SavedRowsTable rows={savedRows} branches={branches} centers={centers} />
          </div>
        ) : (
          <>
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-content-strong">Filas del periodo</h3>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-apex px-3 text-xs font-semibold text-apex hover:bg-surface-muted" onClick={addRow} type="button"><Plus size={14} /> Agregar fila</button>
              </div>
              {loading ? <p className="py-6 text-center text-sm text-content-muted">Cargando presupuesto…</p> : rows.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-xs uppercase text-content-muted">
                      <tr>
                        <th className="px-2 py-2 text-left">Cuenta PUC</th>
                        <th className="px-2 py-2 text-left">Sucursal</th>
                        <th className="px-2 py-2 text-left">Centro de costo</th>
                        <th className="px-2 py-2 text-right">Valor mensual</th>
                        <th className="w-10 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <BudgetEditorRow
                          branchOptions={branches}
                          centersFor={centersFor}
                          key={row.key}
                          onChange={(patch) => setRow(row.key, patch)}
                          onRemove={() => removeRow(row.key)}
                          row={row}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-content-muted">Aún no hay presupuesto para {period}. Agrega la primera fila para planear ingresos y gastos por cuenta, sucursal y centro de costo.</p>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-line bg-surface-muted/50 px-4 py-3">
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving || loading} onClick={() => void save()} type="button"><Save size={16} /> {saving ? "Guardando…" : "Guardar presupuesto"}</button>
              <span className="text-xs text-content-muted">Al guardar, la matriz interactiva del mismo periodo se actualiza de inmediato.</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SavedRowsTable({ rows, branches, centers }: { rows: BudgetRowDto[]; branches: OrgBranch[]; centers: OrgCenter[] }) {
  const branchName = (code: string) => branches.find((row) => row.code === code)?.name || code;
  const centerName = (code: string) => centers.find((row) => row.code === code)?.name || code;
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-surface-muted text-xs uppercase text-content-muted">
          <tr>
            <th className="px-3 py-2 text-left">Cuenta</th>
            <th className="px-3 py-2 text-left">Sucursal</th>
            <th className="px-3 py-2 text-left">Centro de costo</th>
            <th className="px-3 py-2 text-right">Valor mensual</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-line" key={`${row.account_id}:${row.branch_code}:${row.cost_center_code}`}>
              <td className="px-3 py-2"><span className="font-semibold text-content-strong">{row.account_code || row.account_id}</span><span className="ml-2 text-xs text-content-muted">{row.account_name || ""}</span></td>
              <td className="px-3 py-2">{branchName(row.branch_code)}</td>
              <td className="px-3 py-2">{centerName(row.cost_center_code)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatRegionalMoney(row.amount)}</td>
            </tr>
          ))}
          {!rows.length ? <tr><td className="px-3 py-6 text-center text-xs text-content-muted" colSpan={4}>Sin filas de presupuesto para este periodo.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function BudgetEditorRow({ row, branchOptions, centersFor, onChange, onRemove }: {
  row: EditorRow;
  branchOptions: OrgBranch[];
  centersFor: (branch: string) => OrgCenter[];
  onChange: (patch: Partial<EditorRow>) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState(row.account_query ?? (row.account_id ? String(row.account_id) : ""));
  const [options, setOptions] = useState<AccountOption[]>([]);
  const [open, setOpen] = useState(false);
  const [accountLabel, setAccountLabel] = useState(row.account_label ?? "");
  const [highlight, setHighlight] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountController = useRef<AbortController | null>(null);

  const searchAccounts = useCallback((text: string) => {
    if (accountController.current) accountController.current.abort();
    const controller = new AbortController();
    accountController.current = controller;
    if (text.trim().length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }
    api<AccountOption[]>(`/api/v1/accounting/accounts?search=${encodeURIComponent(text.trim())}&allows_tx=true&active=true&limit=20`, { cache: "no-store", signal: controller.signal })
      .then((accounts) => {
        const puc = accounts.filter((account) => ["4", "5", "6", "7"].includes(String(account.code)[0] || ""));
        setOptions(puc);
        setHighlight(0);
        setOpen(puc.length > 0);
      })
      .catch(() => undefined);
  }, []);

  const selectAccount = (account: AccountOption) => {
    onChange({ account_id: account.id });
    setQuery(account.code);
    setAccountLabel(`${account.code} · ${account.name}`);
    setOpen(false);
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setAccountLabel("");
    if (row.account_id) onChange({ account_id: null });
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchAccounts(value), 250);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && open && options.length) {
      event.preventDefault();
      setHighlight((current) => (current + 1) % options.length);
    } else if (event.key === "ArrowUp" && open && options.length) {
      event.preventDefault();
      setHighlight((current) => (current - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && open && options[highlight]) {
      event.preventDefault();
      selectAccount(options[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const branchCenters = centersFor(row.branch_code);
  const branchChanged = (branch: string) => {
    const nextCenters = centersFor(branch);
    onChange({ branch_code: branch, cost_center_code: row.cost_center_code && nextCenters.some((center) => center.code === row.cost_center_code) ? row.cost_center_code : "" });
  };

  return (
    <tr className="border-t border-line align-top">
      <td className="px-2 py-2">
        <div className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-content-subtle" size={14} />
            <input
              aria-expanded={open}
              aria-label={`Buscar cuenta PUC${accountLabel ? ` (seleccionada ${accountLabel})` : ""}`}
              autoComplete="off"
              className="h-9 w-full min-w-[260px] rounded-md border border-line bg-surface pl-8 pr-2 text-xs text-content-strong"
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onChange={(event) => onQueryChange(event.target.value)}
              onFocus={() => { if (options.length) setOpen(true); }}
              onKeyDown={onKeyDown}
              placeholder="Buscar por código o nombre (clases 4-7)"
              role="combobox"
              type="text"
              value={query}
            />
          </div>
          {open && options.length ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-xl" role="listbox">
              {options.map((account, index) => (
                <li key={account.id}>
                  <button
                    className={`block w-full px-3 py-1.5 text-left text-xs ${index === highlight ? "bg-apex/10 text-apex" : "text-content-body hover:bg-surface-muted"}`}
                    onMouseDown={(event) => { event.preventDefault(); selectAccount(account); }}
                    onMouseEnter={() => setHighlight(index)}
                    role="option"
                    aria-selected={index === highlight}
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="font-semibold">{account.code}</span><span className="ml-2 text-content-muted">{account.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {accountLabel && !open ? <p className="mt-1 text-[11px] text-apex">{accountLabel}</p> : null}
        </div>
      </td>
      <td className="px-2 py-2">
        <select aria-label="Sucursal" className="h-9 w-full min-w-[150px] rounded-md border border-line bg-surface px-2 text-xs text-content-strong" onChange={(event) => branchChanged(event.target.value)} value={row.branch_code}>
          <option value="">— Selecciona sucursal —</option>
          {branchOptions.map((branch) => <option key={branch.code} value={branch.code}>{branch.name}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <select aria-label="Centro de costo" className="h-9 w-full min-w-[150px] rounded-md border border-line bg-surface px-2 text-xs text-content-strong" disabled={!row.branch_code} onChange={(event) => onChange({ cost_center_code: event.target.value })} value={row.cost_center_code}>
          <option value="">— Selecciona centro —</option>
          {branchCenters.map((center) => <option key={center.code} value={center.code}>{center.name}</option>)}
        </select>
        {row.branch_code && !branchCenters.length ? <p className="mt-1 text-[11px] text-amber-400">Sin centros activos en esta sucursal</p> : null}
      </td>
      <td className="px-2 py-2">
        <input aria-label="Valor mensual del presupuesto" className="h-9 w-32 rounded-md border border-line bg-surface px-2 text-right text-xs tabular-nums text-content-strong" inputMode="decimal" min={0} onChange={(event) => onChange({ amount: event.target.value })} placeholder="0" step="any" type="number" value={row.amount} />
        {row.amount === "" ? <p className="mt-1 text-[11px] text-content-muted">Vacío = sin planear</p> : <p className="mt-1 text-[11px] text-content-muted">{Number(row.amount) === 0 ? "Cero explícito" : formatRegionalMoney(Number(row.amount) || 0)}</p>}
      </td>
      <td className="px-2 py-2 text-right">
        <button aria-label="Quitar fila" className="rounded-md p-1.5 text-content-muted hover:bg-red-500/10 hover:text-red-400" onClick={onRemove} type="button"><Trash2 size={15} /></button>
      </td>
    </tr>
  );
}
