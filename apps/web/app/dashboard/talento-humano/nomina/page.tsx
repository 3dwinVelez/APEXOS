"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

type Account = { id: number; code: string; name: string; active: boolean; allows_tx: boolean };
type PayrollRate = { code: string; name: string; percent: number; multiplier: number; starts_at?: string; ends_at?: string; active: boolean };
type PayrollConcept = { code: string; name: string; type: string; basis: string; account_code: string; active: boolean };
type PayrollConfig = {
  parameters: Record<string, string | number | boolean>;
  overtime_rates: PayrollRate[];
  concepts: PayrollConcept[];
};

const EMPTY_CONFIG: PayrollConfig = { parameters: {}, overtime_rates: [], concepts: [] };

function numberValue(value: string | number | boolean | undefined) {
  return typeof value === "number" ? String(value) : String(value ?? "");
}

export default function NominaConfigPage() {
  const [config, setConfig] = useState<PayrollConfig>(EMPTY_CONFIG);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [cfg, accountRows] = await Promise.all([
      api<PayrollConfig>("/api/v1/hr/payroll/config"),
      api<Account[]>("/api/v1/accounting/accounts?active=true")
    ]);
    setConfig(cfg);
    setAccounts(accountRows.filter((item) => item.active !== false));
  }

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "No se pudo cargar configuracion de nomina"));
  }, []);

  function setParam(key: string, value: string | number | boolean) {
    setConfig((current) => ({ ...current, parameters: { ...(current.parameters || {}), [key]: value } }));
  }

  function setRate(index: number, patch: Partial<PayrollRate>) {
    setConfig((current) => ({ ...current, overtime_rates: current.overtime_rates.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));
  }

  function setConcept(index: number, patch: Partial<PayrollConcept>) {
    setConfig((current) => ({ ...current, concepts: current.concepts.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await api<PayrollConfig>("/api/v1/hr/payroll/config", { method: "PUT", body: JSON.stringify(config) });
      setMessage("Configuracion de nomina guardada");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo guardar configuracion");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">Talento Humano - Nomina</p>
          <h1 className="text-3xl font-semibold">Configuracion de nomina Colombia</h1>
          <p className="mt-1 text-sm text-neutral-600">Primer maestro para recargos, jornada nocturna y conceptos con cuenta contable.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-60" disabled={saving} onClick={save} type="button"><Save size={16} /> Guardar</button>
      </header>

      {message ? <p className="rounded-md border border-line bg-white p-3 text-sm text-neutral-700">{message}</p> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="text-base font-semibold">Parametros base</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Param label="Horas ordinarias dia" value={numberValue(config.parameters.ordinary_hours_day)} onChange={(value) => setParam("ordinary_hours_day", Number(value || 0))} />
          <Param label="Horas ordinarias semana" value={numberValue(config.parameters.ordinary_hours_week)} onChange={(value) => setParam("ordinary_hours_week", Number(value || 0))} />
          <Param label="Inicio hora nocturna" type="time" value={numberValue(config.parameters.night_start)} onChange={(value) => setParam("night_start", value)} />
          <Param label="Fin hora nocturna" type="time" value={numberValue(config.parameters.night_end)} onChange={(value) => setParam("night_end", value)} />
          <Param label="% salud empleado" value={numberValue(config.parameters.health_employee_percent)} onChange={(value) => setParam("health_employee_percent", Number(value || 0))} />
          <Param label="% pension empleado" value={numberValue(config.parameters.pension_employee_percent)} onChange={(value) => setParam("pension_employee_percent", Number(value || 0))} />
          <Param label="% salud empleador" value={numberValue(config.parameters.health_employer_percent)} onChange={(value) => setParam("health_employer_percent", Number(value || 0))} />
          <Param label="% pension empleador" value={numberValue(config.parameters.pension_employer_percent)} onChange={(value) => setParam("pension_employer_percent", Number(value || 0))} />
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-base font-semibold">Horas extras y recargos</h2>
            <p className="text-sm text-neutral-500">Porcentajes editables. El multiplicador se usa para liquidacion.</p>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm" onClick={() => setConfig((current) => ({ ...current, overtime_rates: [...current.overtime_rates, { code: "", name: "", percent: 0, multiplier: 1, active: true }] }))} type="button"><Plus size={16} /> Agregar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Codigo</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">%</th><th className="px-3 py-2">Multiplicador</th><th className="px-3 py-2">Inicio</th><th className="px-3 py-2">Fin</th><th className="px-3 py-2">Activo</th><th /></tr></thead>
            <tbody>{config.overtime_rates.map((row, index) => (
              <tr className="border-b border-line/70" key={`${row.code}-${index}`}>
                <td className="px-3 py-2"><input className="h-9 w-full rounded-md border border-line px-2" value={row.code} onChange={(event) => setRate(index, { code: event.target.value.toUpperCase() })} /></td>
                <td className="px-3 py-2"><input className="h-9 w-full rounded-md border border-line px-2" value={row.name} onChange={(event) => setRate(index, { name: event.target.value })} /></td>
                <td className="px-3 py-2"><input className="h-9 w-24 rounded-md border border-line px-2" type="number" value={row.percent} onChange={(event) => setRate(index, { percent: Number(event.target.value), multiplier: Math.round((1 + Number(event.target.value || 0) / 100) * 1000) / 1000 })} /></td>
                <td className="px-3 py-2"><input className="h-9 w-24 rounded-md border border-line px-2" type="number" step="0.001" value={row.multiplier} onChange={(event) => setRate(index, { multiplier: Number(event.target.value) })} /></td>
                <td className="px-3 py-2"><input className="h-9 rounded-md border border-line px-2" type="time" value={row.starts_at || ""} onChange={(event) => setRate(index, { starts_at: event.target.value })} /></td>
                <td className="px-3 py-2"><input className="h-9 rounded-md border border-line px-2" type="time" value={row.ends_at || ""} onChange={(event) => setRate(index, { ends_at: event.target.value })} /></td>
                <td className="px-3 py-2"><input checked={row.active !== false} type="checkbox" onChange={(event) => setRate(index, { active: event.target.checked })} /></td>
                <td className="px-3 py-2 text-right"><button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-700" onClick={() => setConfig((current) => ({ ...current, overtime_rates: current.overtime_rates.filter((_, rowIndex) => rowIndex !== index) }))} type="button"><Trash2 size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-base font-semibold">Conceptos y cuentas contables</h2>
            <p className="text-sm text-neutral-500">Cada concepto de nomina queda asociado a una cuenta del plan contable.</p>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm" onClick={() => setConfig((current) => ({ ...current, concepts: [...current.concepts, { code: "", name: "", type: "earning", basis: "hours", account_code: "", active: true }] }))} type="button"><Plus size={16} /> Agregar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Codigo</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Base</th><th className="px-3 py-2">Cuenta contable</th><th className="px-3 py-2">Activo</th><th /></tr></thead>
            <tbody>{config.concepts.map((row, index) => (
              <tr className="border-b border-line/70" key={`${row.code}-${index}`}>
                <td className="px-3 py-2"><input className="h-9 w-full rounded-md border border-line px-2" value={row.code} onChange={(event) => setConcept(index, { code: event.target.value.toUpperCase() })} /></td>
                <td className="px-3 py-2"><input className="h-9 w-full rounded-md border border-line px-2" value={row.name} onChange={(event) => setConcept(index, { name: event.target.value })} /></td>
                <td className="px-3 py-2"><select className="h-9 rounded-md border border-line px-2" value={row.type} onChange={(event) => setConcept(index, { type: event.target.value })}><option value="earning">Devengo</option><option value="deduction">Deduccion</option><option value="employer_cost">Aporte empleador</option></select></td>
                <td className="px-3 py-2"><input className="h-9 w-full rounded-md border border-line px-2" value={row.basis} onChange={(event) => setConcept(index, { basis: event.target.value })} /></td>
                <td className="px-3 py-2"><select className="h-9 w-full rounded-md border border-line px-2" value={row.account_code} onChange={(event) => setConcept(index, { account_code: event.target.value })}><option value="">Seleccionar</option>{accounts.map((account) => <option key={account.id} value={account.code}>{account.code} - {account.name}</option>)}</select></td>
                <td className="px-3 py-2"><input checked={row.active !== false} type="checkbox" onChange={(event) => setConcept(index, { active: event.target.checked })} /></td>
                <td className="px-3 py-2 text-right"><button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-700" onClick={() => setConfig((current) => ({ ...current, concepts: current.concepts.filter((_, rowIndex) => rowIndex !== index) }))} type="button"><Trash2 size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Param({ label, value, onChange, type = "number" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="text-sm">
      {label}
      <input className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
