"use client";
import { TransportSearchSelect } from "@/components/transport/TransportSearchSelect";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";

export type TransportAdminCatalogKey = "transport_destinations" | "transport_settlement_types" | "transport_carriers";
type Entry = { id?: number; code: string; name?: string; legal_name?: string; address?: string; city?: string; tax_id?: string; active?: boolean; status?: string; documentary_policy?: string; requires_reinforced_approval?: boolean; reserved?: boolean; [key: string]: unknown };
const catalogs = {
  transport_destinations: { title: "Destinos / tiendas", route: "delivery-points", fields: [["code", "Código"], ["name", "Nombre"], ["address", "Dirección"], ["city", "Ciudad"]] },
  transport_settlement_types: { title: "Tipos de liquidación", route: "settlement-types", fields: [["code", "Código"], ["name", "Nombre"], ["description", "Descripción"]] },
  transport_carriers: { title: "Transportadoras", route: "carriers", fields: [["code", "Código"], ["legal_name", "Razón social"], ["tax_id", "NIT / identificación"]] }
} as const;

export function TransportAdminCatalog({ catalog }: { catalog: TransportAdminCatalogKey }) {
  const config = catalogs[catalog];
  const [rows, setRows] = useState<Entry[]>([]);
  const [draft, setDraft] = useState<Entry | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const canWrite = hasStoredRolePermission("transport", "write");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setRows(await api<Entry[]>(catalog === "transport_destinations" ? "/api/v1/transport/delivery-points?include_inactive=true&limit=200" : `/api/v1/transport/${config.route}`));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible cargar el maestro."); }
    finally { setLoading(false); }
  }, [catalog, config.route]);
  useEffect(() => { setDraft(null); void load(); }, [load]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft || pending.current) return;
    pending.current = true; setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/v1/transport/${config.route}${draft.id ? `/${draft.id}` : ""}`, { method: draft.id ? "PUT" : "POST", body: JSON.stringify(draft) });
      setDraft(null); await load(); setMessage("Maestro guardado correctamente.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible guardar."); }
    finally { pending.current = false; setSaving(false); }
  }
  return <section className="space-y-4" aria-label={config.title}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{config.title}</h3><p className="text-sm text-content-body">Operación logística · Catálogo central de Administración</p></div><div className="flex gap-2"><button type="button" className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => void load()}>Actualizar</button>{canWrite ? <button type="button" className="rounded-md bg-apex px-3 py-2 text-sm text-white" onClick={() => { setMessage(""); setDraft({ code: "", name: "", active: true, status: "activo", documentary_policy: "alerta" }); }}>Nuevo registro</button> : null}</div></div>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    <label className="block text-sm">Buscar registro<input className="mt-1 w-full rounded-md border border-line p-2" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {loading ? <p role="status">Cargando maestro…</p> : <div className="overflow-x-auto rounded-md border border-line"><table className="w-full text-left text-sm"><thead className="bg-paper"><tr><th className="p-3">Código</th><th>Nombre</th><th>Detalle</th><th>Acciones</th></tr></thead><tbody>{rows.filter(row => `${row.code} ${row.name || row.legal_name}`.toLowerCase().includes(search.toLowerCase())).map(row => <tr className="border-t border-line" key={row.code}><td className="p-3">{row.code}</td><td>{row.name || row.legal_name}</td><td>{row.address ? `${row.address} · ${row.city}` : row.tax_id || row.documentary_policy}</td><td>{canWrite && !row.reserved ? <button type="button" className="rounded-md border border-line px-3 py-1" onClick={() => setDraft({ ...row })}>Editar</button> : "—"}</td></tr>)}</tbody></table>{!rows.length ? <p className="p-4 text-sm">No hay registros configurados.</p> : null}</div>}
    {draft ? <form className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-2" onSubmit={save}><h4 className="font-semibold sm:col-span-2">{draft.id ? "Editar registro" : "Nuevo registro"}</h4>{config.fields.map(([key, label]) => <label key={key} className="text-sm">{label}<input className="mt-1 w-full rounded-md border border-line p-2" required={!["tax_id", "description"].includes(key)} value={String(draft[key] || "")} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}{catalog === "transport_settlement_types" ? <><label className="text-sm">Política de soportes<TransportSearchSelect className="mt-1 w-full rounded-md border border-line p-2" value={draft.documentary_policy} onChange={event => setDraft({ ...draft, documentary_policy: event.target.value })}><option value="alerta">Alerta</option><option value="bloqueo">Bloqueo</option></TransportSearchSelect></label><label className="text-sm">Soportes requeridos (separados por coma)<input className="mt-1 w-full rounded-md border border-line p-2" value={Array.isArray(draft.required_documents) ? draft.required_documents.join(", ") : ""} onChange={event => setDraft({ ...draft, required_documents: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.requires_reinforced_approval)} onChange={event => setDraft({ ...draft, requires_reinforced_approval: event.target.checked })} />Aprobador distinto del creador</label></> : null}<div className="flex justify-end gap-2 sm:col-span-2"><button type="button" disabled={saving} onClick={() => setDraft(null)}>Cancelar</button><button type="submit" disabled={saving} className="rounded-md bg-apex px-3 py-2 text-white">{saving ? "Guardando…" : "Guardar registro"}</button></div></form> : null}
  </section>;
}
