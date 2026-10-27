"use client";

import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/apiBaseUrl";
import { formatRegionalMoney } from "@/lib/regionalFormat";
import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { useState } from "react";

type ImportRow = {
  excel_row: number;
  period: string | null;
  account_id: number | null;
  account_code: string | null;
  account_name: string | null;
  branch_code: string | null;
  cost_center_code: string | null;
  amount: number | null;
  amount_cents: number | null;
  status: "ok" | "error";
  errors: Array<{ code: string; message: string }>;
};
type ImportPreview = {
  valid: boolean;
  file_hash: string | null;
  periods: string[];
  totals: { rows: number; valid_rows: number; error_rows: number };
  rows: ImportRow[];
  monthly_semantics: string;
};
type ImportResult = {
  imported: boolean;
  file_hash: string;
  created_count: number;
  updated_count: number;
  periods: string[];
  totals: ImportPreview["totals"];
  rows: ImportRow[];
};

export function budgetPreviewHasErrors(preview: ImportPreview) {
  return preview.totals.error_rows > 0 || preview.rows.some((row) => row.status === "error" || row.errors.length > 0);
}

const IMPORT_PREVIEW_PATH = "/api/v1/accounting/reports/pyg-interactive/budgets/validate";
const IMPORT_PATH = "/api/v1/accounting/reports/pyg-interactive/budgets/import";
const TEMPLATE_PATH = "/api/v1/accounting/reports/pyg-interactive/budgets/template";

function errorDetailsOf(value: unknown): ImportPreview | undefined {
  if (value && typeof value === "object" && "details" in value) {
    const details = (value as { details?: unknown }).details;
    if (details && typeof details === "object" && "rows" in details && "totals" in details) return details as ImportPreview;
  }
  return undefined;
}

export default function AccountingPygBudgetImport({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);

  function showPreview(next: ImportPreview) {
    setPreview(next);
    setOnlyErrors(budgetPreviewHasErrors(next));
  }

  const canImport = Boolean(preview?.valid && !budgetPreviewHasErrors(preview));

  async function send(path: string) {
    if (!file) throw new Error("Selecciona la plantilla de presupuesto diligenciada.");
    const form = new FormData();
    form.append("file", file);
    return api<ImportPreview | ImportResult>(path, { method: "POST", body: form });
  }

  async function downloadTemplate() {
    setError("");
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}${TEMPLATE_PATH}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error("No se pudo descargar la plantilla");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "plantilla-presupuesto-mensual.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar la plantilla");
    }
  }

  async function validate() {
    if (busy) return;
    setBusy(true);
    setError("");
    setImported(null);
    setPreview(null);
    setOnlyErrors(false);
    try {
      showPreview(await send(IMPORT_PREVIEW_PATH) as ImportPreview);
    } catch (err) {
      const details = errorDetailsOf(err);
      if (details) showPreview(details);
      else setPreview(null);
      setError(err instanceof Error ? err.message : "No se pudo validar la plantilla");
    } finally {
      setBusy(false);
    }
  }

  async function importBudget() {
    if (!preview || !canImport || busy) return;
    const lines = preview.totals.valid_rows;
    const periods = preview.periods.join(", ");
    if (!window.confirm(`Importar ${lines} fila(s) de presupuesto mensual para ${periods || "el periodo indicado"}? La importación no sobrescribe tuplas existentes.`)) return;
    setBusy(true);
    setError("");
    try {
      const result = await send(IMPORT_PATH) as ImportResult;
      setImported(result);
      setPreview(null);
      setFile(null);
      setOnlyErrors(false);
      onImported();
    } catch (err) {
      const details = errorDetailsOf(err);
      if (details) showPreview(details);
      setError(err instanceof Error ? err.message : "No se pudo importar el presupuesto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="apex-section-card overflow-hidden">
      <div className="border-b border-line bg-surface-muted p-4">
        <h3 className="text-sm font-semibold text-content-strong">Importar presupuesto desde Excel</h3>
        <p className="mt-1 text-xs text-content-muted">
          Columnas: periodo (AAAA-MM), cuenta contable, centro de costo, sucursal y presupuesto. Cada fila es el presupuesto de un mes; no es una fecha de corte ni un saldo inicial, y cargar un mes jamás altera los meses anteriores. No hay columna de tercero y no se exige que el archivo cuadre en cero.
        </p>
      </div>

      {error ? <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400"><TriangleAlert className="mt-0.5 shrink-0" size={16} />{error}</div> : null}
      {imported ? (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
          <span>Presupuesto importado: {imported.created_count} fila(s) nuevas en {imported.periods.join(", ")}. La matriz PYG y el comparador se actualizaron; ningún asiento de libro fue creado.</span>
        </div>
      ) : null}

      <div className="grid gap-3 p-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line p-3">
          <Download className="text-apex" size={18} />
          <h4 className="mt-2 text-sm font-semibold text-content-strong">1. Descargar plantilla</h4>
          <p className="mt-1 text-xs text-content-muted">Incluye los encabezados fijos y las instrucciones de carga en las primeras filas.</p>
          <button className="mt-3 h-9 rounded-md border border-apex px-3 text-xs font-semibold text-apex hover:bg-surface-muted" onClick={() => void downloadTemplate()} type="button">Descargar Excel</button>
        </div>
        <div className="rounded-lg border border-line p-3">
          <FileSpreadsheet className="text-apex" size={18} />
          <h4 className="mt-2 text-sm font-semibold text-content-strong">2. Validar y previsualizar</h4>
          <p className="mt-1 text-xs text-content-muted">Rechaza cuentas inexistentes, ambiguas o inactivas, periodos inválidos, valores no numéricos o negativos y duplicados.</p>
          <input accept=".xlsx" className="mt-3 block w-full text-xs text-content-strong" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setImported(null); setError(""); setOnlyErrors(false); }} type="file" />
          <button className="mt-3 h-9 w-full rounded-md border border-line px-3 text-xs font-semibold text-content-strong disabled:opacity-50" disabled={!file || busy} onClick={() => void validate()} type="button">{busy ? "Procesando…" : "Validar plantilla"}</button>
        </div>
        <div className="rounded-lg border border-line p-3">
          <Upload className="text-apex" size={18} />
          <h4 className="mt-2 text-sm font-semibold text-content-strong">3. Confirmar importación</h4>
          <p className="mt-1 text-xs text-content-muted">Solo se habilita cuando todas las filas validan. Nunca sobrescribe: las tuplas que ya existen en el almacén se rechazan con error por fila.</p>
          <button className="mt-3 h-9 w-full rounded-md bg-apex px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={!canImport || busy} onClick={() => void importBudget()} type="button">Confirmar importación</button>
        </div>
      </div>

      {preview ? <AccountingPygBudgetPreview preview={preview} onlyErrors={onlyErrors} onFilterChange={setOnlyErrors} /> : null}
    </div>
  );
}

export function AccountingPygBudgetPreview({ preview, onlyErrors, onFilterChange }: {
  preview: ImportPreview;
  onlyErrors: boolean;
  onFilterChange: (value: boolean) => void;
}) {
  const errorRows = preview.rows.filter((row) => row.status === "error" || row.errors.length > 0);
  const visibleRows = onlyErrors ? errorRows : preview.rows;
  return (
        <div className="px-4 pb-4">
          <div className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-content-strong">{preview.valid && !budgetPreviewHasErrors(preview) ? "Validación correcta" : "Validación con errores por fila"}</h4>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-content-muted">{preview.totals.valid_rows} válidas · {preview.totals.error_rows} con error · {preview.totals.rows} filas</span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-content-muted">Periodos: {preview.periods.join(", ") || "—"}</span>
            </div>
            <p className="mt-1 text-xs text-content-muted">{preview.monthly_semantics}</p>
            {errorRows.length > 0 ? (
              <div role="alert" aria-label="Errores de la plantilla de presupuesto" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
                <p className="font-semibold">Corrige estas filas en el Excel y vuelve a validar:</p>
                <ul className="mt-2 space-y-2">
                  {errorRows.map((row) => (
                    <li key={row.excel_row}>
                      <strong>Fila {row.excel_row}</strong>
                      <ul className="ml-4 list-disc">
                        {row.errors.length ? row.errors.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>) : <li>La fila no es válida. Revisa sus datos en la plantilla.</li>}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div role="group" aria-label="Filtrar filas de presupuesto" className="mt-3 flex flex-wrap gap-2">
              <button type="button" aria-pressed={onlyErrors} onClick={() => onFilterChange(true)} className={`h-9 rounded-md border px-3 text-xs font-semibold ${onlyErrors ? "border-apex bg-apex text-white" : "border-line text-content-strong"}`}>Solo errores ({errorRows.length})</button>
              <button type="button" aria-pressed={!onlyErrors} onClick={() => onFilterChange(false)} className={`h-9 rounded-md border px-3 text-xs font-semibold ${!onlyErrors ? "border-apex bg-apex text-white" : "border-line text-content-strong"}`}>Todas las filas ({preview.rows.length})</button>
            </div>
            <p role="status" className="mt-2 text-xs text-content-muted">Mostrando {visibleRows.length} de {preview.rows.length} filas{onlyErrors ? " · solo errores" : ""}.</p>
            <div className="mt-3 max-h-80 overflow-auto">
              <table aria-label="Filas de la plantilla de presupuesto" className="min-w-full text-xs">
                <thead className="sticky top-0 bg-surface-muted text-left uppercase text-content-muted">
                  <tr>
                    <th className="px-2 py-2">Fila</th>
                    <th className="px-2 py-2">Periodo</th>
                    <th className="px-2 py-2">Cuenta</th>
                    <th className="px-2 py-2">Sucursal</th>
                    <th className="px-2 py-2">Centro</th>
                    <th className="px-2 py-2 text-right">Presupuesto</th>
                    <th className="px-2 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="border-t border-line align-top" key={row.excel_row}>
                      <td className="px-2 py-2 tabular-nums">{row.excel_row}</td>
                      <td className="px-2 py-2 font-mono">{row.period || "—"}</td>
                      <td className="px-2 py-2"><span className="font-mono font-semibold text-content-strong">{row.account_code || "—"}</span>{row.account_name ? <span className="ml-1 text-content-muted">{row.account_name}</span> : null}</td>
                      <td className="px-2 py-2 font-mono">{row.branch_code || "—"}</td>
                      <td className="px-2 py-2 font-mono">{row.cost_center_code || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{row.amount === null ? "—" : formatRegionalMoney(row.amount)}</td>
                      <td className="px-2 py-2">
                        {row.status === "ok" && !row.errors.length ? <span className="text-emerald-400">Válida</span> : (
                          <ul className="space-y-0.5 text-red-400">
                            {row.errors.length ? row.errors.map((rowError, index) => <li key={`${rowError.code}-${index}`}>{rowError.message}</li>) : <li>Revisa los datos de esta fila.</li>}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
  );
}
