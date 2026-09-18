"use client";

import { api } from "@/lib/api";
import { Download, Upload } from "lucide-react";
import { FormEvent, useState } from "react";

export function ProductImportPanel({ onImported }: { onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (!file) return; setBusy(true); try { const data = new FormData(); data.append("file", file); const result = await api<{ imported: number; inventory_licensed: boolean }>("/api/v1/commercial-management/products/import", { method: "POST", body: data }); setMessage(`${result.imported} producto(s) importados. ${result.inventory_licensed ? "Los precios fueron validados contra Inventarios." : "Se usó el catálogo comercial independiente."}`); await onImported(); } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible importar la plantilla."); } finally { setBusy(false); } }
  return <section className="rounded-md border border-line bg-paper p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Importación de productos y precios</h3><p className="mt-1 text-xs text-neutral-600">La misma plantilla funciona con o sin Inventarios. Si está activo, APEX exige el mismo código y precio.</p></div><a className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold" download href="/plantillas/Plantilla_Productos_Gestion_Comercial.xlsx"><Download size={15}/>Descargar plantilla</a></div><form className="mt-3 flex flex-wrap gap-2" onSubmit={submit}><input accept=".xlsx" className="min-w-64 flex-1 rounded-md border border-line bg-white p-2 text-xs" onChange={(e) => setFile(e.target.files?.[0] || null)} type="file"/><button className="apex-primary-action inline-flex h-10 items-center gap-2 px-4 text-xs font-semibold" disabled={!file || busy} type="submit"><Upload size={15}/>{busy ? "Importando..." : "Importar"}</button></form>{message ? <p className="mt-2 text-xs">{message}</p> : null}</section>;
}
