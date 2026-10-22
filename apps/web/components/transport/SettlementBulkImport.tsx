"use client";
import { useState } from "react";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { TransportSearchSelect } from "./TransportSearchSelect";

type Center = { code: string; branch_code: string; society_code: string };
type Package = { id: number; code: string; version: number; status: string; adjusted_total: number; items?: unknown[]; accounting?: { payload?: { documents?: unknown[] } }; metadata?: { settlement_import?: { reference: string; center: Center } } };
type Outcome = { id: number; code: string; success: boolean; message?: string; package?: Package; reused?: boolean };
type Preview = { valid: boolean; preview_hash: string; period: string; errors: { row: number; message: string }[]; packages: { reference: string; plate: string; center: Center; documents: number; total: number; existing_id: number | null }[] };
type Options = { income_accounts: { code: string; name: string }[]; receivable_accounts: { code: string; name: string }[] };
type Catalogs = { vehicles: { plate: string; center?: Center; error?: string }[]; customers: { tax_id: string; name: string }[]; destinations: { code: string; name: string }[]; rates: { code: string; name: string; version: number }[] };
const input = "mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm";
const button = "min-h-10 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-40";
const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(Number(value || 0));
const labels: Record<string, string> = { en_revision: "Pendiente de aprobación", aprobada: "Aprobado", contabilizada: "Contabilizado", liquidada: "Liquidado", rechazada: "Rechazado", cancelada: "Cancelado" };

export function SettlementBulkImport({ onChanged }: { onChanged: () => void }) {
  const canImport = hasStoredRolePermission("transport", "import") && hasStoredRolePermission("transport", "write");
  const canApprove = hasStoredRolePermission("transport", "approve_settlements");
  const canAccount = hasStoredRolePermission("transport", "account_settlements");
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<Preview | null>(null);
  const [packages, setPackages] = useState<Package[]>([]), [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [summary, setSummary] = useState<Outcome[] | null>(null), [confirmation, setConfirmation] = useState("");
  const [options, setOptions] = useState<Options | null>(null), [accountOpen, setAccountOpen] = useState(false);
  const [accounts, setAccounts] = useState({ income_account_code: "", receivable_account_code: "", posting_date: "", due_date: "" });
  const chosen = packages.filter(pkg => selected.includes(pkg.id));
  const pending = chosen.filter(pkg => pkg.status === "en_revision");
  const approved = chosen.filter(pkg => pkg.status === "aprobada");
  async function refresh() {
    const rows = await api<Package[]>("/api/v1/transport/settlement-packages?limit=300", { cache: "no-store" });
    setPackages(rows.filter(pkg => pkg.metadata?.settlement_import));
  }
  function close() {
    if (busy) return;
    if (summary) setConfirmation(`${summary.filter(row => row.success).length} liquidaciones contabilizadas correctamente; ${summary.filter(row => !row.success).length} con errores. Total contabilizado: ${money(summary.reduce((sum, row) => sum + (row.success ? Number(row.package?.adjusted_total || 0) : 0), 0))}.${summary.every(row => row.reused) ? " Se recuperaron documentos existentes, sin crear duplicados." : ""}`);
    setOpen(false);
  }
  async function show() { setSummary(null); setConfirmation(""); setSelected([]); setFile(null); setPreview(null); setRowErrors([]); setAccountOpen(false); setOpen(true); setError(""); setMessage(""); setBusy(true); try { await refresh(); } catch (error) { setError(error instanceof Error ? error.message : "No se cargaron las importaciones."); } finally { setBusy(false); } }
  async function upload(commit: boolean) {
    if (!file || busy || (commit && !preview?.valid)) return;
    setBusy(true); setError(""); setMessage(""); setRowErrors([]);
    try {
      const body = new FormData(); body.append("file", file);
      const result = await api<Preview | { valid: true; packages: Package[] }>(`/api/v1/transport/settlement-import/${commit ? `commit?preview_hash=${preview!.preview_hash}` : "validate"}`, { method: "POST", body });
      if ("preview_hash" in result) setPreview(result);
      else {
        setSelected(result.packages.map(pkg => pkg.id)); setPreview(null);
        setMessage(`${result.packages.length} paquetes disponibles. Continúe con la aprobación y luego la contabilización; repetir la misma plantilla recupera sus paquetes existentes.`);
        if (result.packages.length && result.packages.every(pkg => ["contabilizada", "liquidada"].includes(pkg.status))) setSummary(result.packages.map(pkg => ({ id: pkg.id, code: pkg.code, success: true, package: pkg, reused: true })));
        await refresh(); onChanged();
      }
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo procesar la plantilla."); if (commit) setPreview(null); }
    finally { setBusy(false); }
  }
  async function references() {
    setBusy(true); setError("");
    try {
      const data = await api<Catalogs>("/api/v1/transport/settlement-import/catalogs", { cache: "no-store" });
      const rows: unknown[][] = [["tipo", "codigo", "descripcion", "version", "centro_costos", "sucursal", "sociedad"],
        ...data.vehicles.map(row => ["vehiculo", row.plate, row.error || row.plate, "", row.center?.code || "", row.center?.branch_code || "", row.center?.society_code || ""]),
        ...data.customers.map(row => ["cliente", row.tax_id || "", row.name, "", "", "", ""]),
        ...data.destinations.map(row => ["destino", row.code, row.name, "", "", "", ""]),
        ...data.rates.map(row => ["tarifario", row.code, row.name, row.version, "", "", ""])];
      const csv = "\uFEFF" + rows.map(row => row.map(value => { const text = String(value ?? ""); return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`; }).join(";")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "Referencias_Liquidaciones_Transporte.csv"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setError(error instanceof Error ? error.message : "No se descargaron las referencias."); } finally { setBusy(false); }
  }
  async function accountForm() {
    setBusy(true); setError("");
    try { setOptions(await api<Options>("/api/v1/transport/settlement-accounting-options", { cache: "no-store" })); setAccountOpen(true); }
    catch (error) { setError(error instanceof Error ? error.message : "No se cargaron las cuentas."); } finally { setBusy(false); }
  }
  async function execute(action: "approve" | "account") {
    const targets = action === "approve" ? pending : approved;
    if (!targets.length || busy) return;
    setBusy(true); setError(""); setMessage(""); setRowErrors([]);
    try {
      const result = await api<{ results: { id: number; success: boolean; message?: string; package?: Package }[] }>(`/api/v1/transport/settlement-import/${action}`, { method: "POST", body: JSON.stringify({ packages: targets.map(pkg => ({ id: pkg.id, version: pkg.version })), ...(action === "account" ? accounts : { comment: "Aprobación masiva desde Liquidaciones" }) }) });
      const failed = result.results.filter(row => !row.success);
      setRowErrors(failed.map(row => `${packages.find(pkg => pkg.id === row.id)?.code || row.id}: ${row.message}`));
      setMessage(`${result.results.length - failed.length} paquetes procesados; ${failed.length} requieren revisión. Cada paquete se procesa en su propia transacción.`);
      if (action === "account") {
        setSummary(targets.map(pkg => { const row = result.results.find(row => row.id === pkg.id); return { id: pkg.id, code: pkg.code, success: row?.success === true, package: row?.package, message: row?.message || (!row ? "No se recibió confirmación. Actualice el estado antes de reintentar." : undefined) }; }));
        setSelected(failed.map(row => row.id)); setAccountOpen(false);
      }
      await refresh().catch(() => setError("La operación respondió, pero no se pudo actualizar la lista. Actualice los paquetes antes de continuar.")); onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "No se procesó la selección. Actualice para comprobar su estado antes de reintentar."); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  if (!canImport && !canApprove && !canAccount) return null;
  return <>
    <button className={`inline-flex items-center gap-2 ${button}`} type="button" onClick={() => void show()}><Upload size={16} />Carga masiva</button>
    {!open && confirmation ? <p role="status" className="rounded-lg border border-line bg-surface p-3 text-sm text-content-body">{confirmation}</p> : null}
    {open ? <ModalFrame title={summary ? "Resultado de la contabilización masiva" : "Carga masiva de liquidaciones"} maxWidth="md:max-w-6xl" onClose={close}>
      {summary ? <div className="space-y-4" aria-busy={busy}>
        <h3 className="text-lg font-semibold" role="status">{summary.every(row => row.success) ? "Liquidaciones procesadas correctamente" : "Proceso finalizado con errores por revisar"}</h3>
        <p className="text-sm text-content-body">{summary.length} liquidaciones solicitadas · {summary.filter(row => row.success).length} contabilizadas correctamente · {summary.filter(row => !row.success).length} con errores.</p>
        <p className="text-sm font-semibold">Total contabilizado: {money(summary.reduce((sum, row) => sum + (row.success ? Number(row.package?.adjusted_total || 0) : 0), 0))}</p>
        {summary.every(row => row.reused) ? <p className="text-sm text-content-body">Estas liquidaciones ya estaban contabilizadas. Se recuperaron los documentos existentes sin generar duplicados.</p> : null}
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th>Liquidación</th><th>Centro de costos</th><th>Documentos contables</th><th>Valor contabilizado</th><th>Resultado</th></tr></thead><tbody>{summary.map(row => <tr key={row.id} className="border-b border-line"><td className="py-3">{row.code}</td><td>{row.package?.metadata?.settlement_import?.center.code || packages.find(pkg => pkg.id === row.id)?.metadata?.settlement_import?.center.code || "—"}</td><td>{row.success ? row.package?.accounting?.payload?.documents?.length ?? "—" : 0}</td><td>{money(row.success ? Number(row.package?.adjusted_total || 0) : 0)}</td><td>{row.success ? "Contabilizado correctamente" : <span role="alert" className="text-rose-700">{row.message || "No se contabilizó. Revise el estado antes de reintentar."}</span>}</td></tr>)}</tbody></table></div>
        <p className="text-sm text-content-muted">Revise el resultado antes de cerrar. Los documentos con error no se incluyen en el total contabilizado.</p>
        <div className="flex flex-wrap gap-2">{summary.some(row => !row.success) ? <button className={button} type="button" disabled={busy} onClick={() => { setSummary(null); setMessage(""); }}>Revisar errores</button> : null}<button className={`${button} bg-apex text-white`} type="button" disabled={busy} onClick={close}>Finalizar y volver a liquidaciones</button></div>
      </div> :
      <div className="space-y-4" aria-busy={busy}>
        <p className="text-sm text-content-body">Importar → aprobar → contabilizar. El sistema calcula los fletes y asigna la sociedad, sucursal y centro de costos del vehículo. La carga no concede aprobaciones ni permisos.</p>
        {error ? <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {message ? <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
        {canImport ? <section className="space-y-3 rounded-lg border border-line p-3">
          <h3 className="font-semibold">1. Preparar y validar Excel</h3>
          <p className="text-sm text-content-muted">Máximo 200 filas, 30 paquetes y 2 MB. Una fila por criterio; repita paquete y documento para agrupar criterios. Use referencias únicas para evitar duplicados. Moneda COP y periodo contable actual.</p>
          <div className="flex flex-wrap items-center gap-2"><a className={`inline-flex items-center ${button}`} href="/plantillas/Plantilla_Liquidaciones_Transporte.xlsx" download>Descargar plantilla</a><button type="button" className={button} disabled={busy} onClick={() => void references()}>Descargar referencias de la empresa</button></div>
          <label className="block text-sm">Archivo de liquidaciones<input className="mt-1 block w-full rounded border border-line p-2 text-sm" type="file" accept=".xlsx" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setError(""); }} /></label>
          <button type="button" className={button} disabled={!file || busy} onClick={() => void upload(false)}>{busy ? "Procesando…" : "Validar plantilla"}</button>
          {preview ? <div className="space-y-2">
            <p className="text-sm font-semibold">Periodo {preview.period} · {preview.packages.length} paquetes · {money(preview.packages.reduce((sum, pkg) => sum + pkg.total, 0))}</p>
            {preview.errors.map((row, index) => <p key={index} role="alert" className="text-sm text-rose-700">Fila {row.row}: {row.message}</p>)}
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th>Paquete externo</th><th>Placa / centro</th><th>Sociedad / sucursal</th><th>Documentos</th><th>Valor</th></tr></thead><tbody>{preview.packages.map(pkg => <tr key={pkg.reference} className="border-b border-line"><td className="py-2">{pkg.reference}{pkg.existing_id ? " · Ya importado" : ""}</td><td>{pkg.plate} / {pkg.center.code}</td><td>{pkg.center.society_code} / {pkg.center.branch_code}</td><td>{pkg.documents}</td><td>{money(pkg.total)}</td></tr>)}</tbody></table></div>
            <button type="button" className={`${button} bg-apex text-white`} disabled={!preview.valid || busy} onClick={() => void upload(true)}>Importar y enviar a aprobación</button>
          </div> : null}
        </section> : null}
        <section className="space-y-3 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">2. Revisar paquetes importados</h3><button type="button" className={button} disabled={busy} onClick={() => void refresh().catch(error => setError(error.message))}>Actualizar paquetes</button></div>
          <p className="text-sm text-content-muted">Seleccione hasta 30 paquetes. {chosen.length} seleccionados · {money(chosen.reduce((sum, pkg) => sum + Number(pkg.adjusted_total), 0))}. Las aprobaciones reforzadas y los bloqueos documentales se conservan.</p>
          <div className="max-h-72 overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th>Elegir</th><th>Liquidación / referencia</th><th>Centro de costos</th><th>Estado</th><th>Valor</th></tr></thead><tbody>{packages.map(pkg => <tr key={pkg.id} className="border-b border-line"><td><input type="checkbox" aria-label={`Seleccionar ${pkg.code}`} checked={selected.includes(pkg.id)} disabled={busy || (!selected.includes(pkg.id) && selected.length >= 30)} onChange={event => setSelected(current => event.target.checked ? [...current, pkg.id] : current.filter(id => id !== pkg.id))} /></td><td className="py-2">{pkg.code}<span className="block text-xs text-content-muted">{pkg.metadata?.settlement_import?.reference}</span></td><td>{pkg.metadata?.settlement_import?.center.code}</td><td>{labels[pkg.status] || pkg.status}</td><td>{money(pkg.adjusted_total)}</td></tr>)}</tbody></table>{!packages.length ? <p className="py-4 text-sm text-content-muted">No hay paquetes importados para mostrar.</p> : null}</div>
          <div className="flex flex-wrap gap-2">{canApprove ? <button type="button" className={button} disabled={busy || !pending.length} onClick={() => void execute("approve")}>Aprobar pendientes ({pending.length})</button> : null}{canAccount ? <button type="button" className={button} disabled={busy || !approved.length} onClick={() => void accountForm()}>Preparar contabilización ({approved.length})</button> : null}</div>
          {rowErrors.map((message, index) => <p key={index} role="alert" className="text-sm text-rose-700">{message}</p>)}
        </section>
        {accountOpen && options ? <form className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void execute("account"); }}>
          <h3 className="font-semibold sm:col-span-2">3. Contabilizar {approved.length} paquetes aprobados</h3>
          <p className="text-sm text-content-body sm:col-span-2">Se generarán documentos de ingreso y cartera por cliente en el centro de cada vehículo. Los paquetes no aprobados no se contabilizan.</p>
          <label className="text-sm">Cuenta de ingreso<TransportSearchSelect className={input} required disabled={busy} value={accounts.income_account_code} onChange={event => setAccounts(current => ({ ...current, income_account_code: event.target.value }))}><option value="">Seleccionar cuenta</option>{options.income_accounts.map(row => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}</TransportSearchSelect></label>
          <label className="text-sm">Cuenta por cobrar<TransportSearchSelect className={input} required disabled={busy} value={accounts.receivable_account_code} onChange={event => setAccounts(current => ({ ...current, receivable_account_code: event.target.value }))}><option value="">Seleccionar cuenta</option>{options.receivable_accounts.map(row => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}</TransportSearchSelect></label>
          <label className="text-sm">Fecha contable<input className={input} type="date" required disabled={busy} value={accounts.posting_date} onChange={event => setAccounts(current => ({ ...current, posting_date: event.target.value }))} /></label>
          <label className="text-sm">Fecha de vencimiento<input className={input} type="date" required disabled={busy} min={accounts.posting_date} value={accounts.due_date} onChange={event => setAccounts(current => ({ ...current, due_date: event.target.value }))} /></label>
          <div className="flex gap-2 sm:col-span-2"><button type="button" className={button} disabled={busy} onClick={() => setAccountOpen(false)}>Cancelar contabilización</button><button type="submit" className={`${button} bg-apex text-white`} disabled={busy || !approved.length}>Contabilizar selección</button></div>
        </form> : null}
      </div>}
    </ModalFrame> : null}
  </>;
}
