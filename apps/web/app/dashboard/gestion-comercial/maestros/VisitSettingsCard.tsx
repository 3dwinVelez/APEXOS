"use client";

import { api } from "@/lib/api";
import { FormEvent, useEffect, useState } from "react";

export function VisitSettingsCard() {
  const [minutes, setMinutes] = useState(60);
  const [validityDays, setValidityDays] = useState(15);
  const [message, setMessage] = useState("");
  useEffect(() => { void api<{ default_visit_duration_minutes: number; default_quote_validity_days: number }>("/api/v1/commercial-management/settings").then((data) => { setMinutes(data.default_visit_duration_minutes); setValidityDays(data.default_quote_validity_days); }).catch(() => setMessage("No fue posible cargar la configuración.")); }, []);
  async function save(event: FormEvent) { event.preventDefault(); try { await api("/api/v1/commercial-management/settings", { method: "PUT", body: JSON.stringify({ default_visit_duration_minutes: minutes, default_quote_validity_days: validityDays }) }); setMessage("Parámetros comerciales actualizados."); } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible guardar."); } }
  return <section className="apex-section-card p-4"><form className="flex flex-wrap items-end gap-3" onSubmit={save}><div className="min-w-64 flex-1"><h2 className="text-sm font-semibold">Parámetros de visitas y cotizaciones</h2><p className="mt-1 text-xs text-neutral-600">La duración bloquea solapamientos y la vigencia define hasta cuándo es válida cada cotización.</p></div><label className="text-sm font-medium">Duración de visita (min)<input className="mt-1 h-10 w-44 rounded-md border border-line px-3" min={15} max={480} step={15} type="number" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}/></label><label className="text-sm font-medium">Vigencia cotización (días)<input className="mt-1 h-10 w-44 rounded-md border border-line px-3" min={1} max={365} type="number" value={validityDays} onChange={(event) => setValidityDays(Number(event.target.value))}/></label><button className="apex-primary-action h-10 px-4 text-sm font-semibold" type="submit">Guardar parámetros</button></form>{message ? <p className="mt-2 text-xs text-neutral-600">{message}</p> : null}</section>;
}
