"use client";

import { api } from "@/lib/api";
import { scheduleMonitorPunchEvidence } from "@/lib/hrScheduleMonitor";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type HrTimelinePhoto = { id?: number | string; source?: "activity" | "punch" | "identity"; base64_data?: string; base64?: string; file_url?: string; file_name?: string; name?: string; items?: HrTimelinePhoto[] };
const empty: HrTimelinePhoto[] = [];
function visible(items: HrTimelinePhoto[]) {
  const files = items.flatMap(item => item.items?.length ? item.items : [item]).map(item => ({ ...item, ...scheduleMonitorPunchEvidence({ extra_evidence: item }) }));
  return files.filter((item, index) => {
    const key = item.base64_data || item.file_url;
    return key && files.findIndex(other => (other.base64_data || other.file_url) === key) === index;
  });
}

export default function HrTimelineEvidence({ evidence }: { evidence?: HrTimelinePhoto[] }) {
  const items = evidence || empty;
  const [photos, setPhotos] = useState(() => visible(items));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<HrTimelinePhoto | null>(null);
  const [retry, setRetry] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  function closePhoto() { setExpanded(null); window.requestAnimationFrame(() => trigger.current?.focus()); }
  useEffect(() => {
    let cancelled = false;
    const ready = visible(items);
    setPhotos(ready); setError(""); setExpanded(null);
    const pending = items.filter(item => !visible([item]).length && item.id != null);
    if (!pending.length) { setLoading(false); return; }
    setLoading(true);
    void Promise.allSettled(pending.map(item => api<HrTimelinePhoto>(`/api/v1/hr/monitor-evidence/${item.source || "activity"}/${encodeURIComponent(String(item.id))}`, { cache: "no-store" }))).then(results => {
      if (cancelled) return;
      const loaded = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
      setPhotos(visible([...ready, ...loaded]));
      if (results.some(result => result.status === "rejected")) setError("No se pudo cargar una evidencia. El registro existe, pero su archivo no esta disponible.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [items, retry]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopImmediatePropagation(); closePhoto(); }
      if (event.key === "Tab") { event.preventDefault(); event.stopImmediatePropagation(); closeButton.current?.focus(); }
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [expanded]);

  return <>
    <div className="flex flex-wrap items-center gap-2" aria-label="Fotos del evento">
      {photos.map((photo, index) => photo.base64_data?.startsWith("data:image/") ? <button key={index} type="button" className="h-24 w-24 overflow-hidden rounded-md border border-line" title="Ampliar evidencia de actividad" onClick={event => { trigger.current = event.currentTarget; setExpanded(photo); }}>
        <Image alt={photo.file_name || "Evidencia de actividad"} src={photo.base64_data} height={96} width={96} unoptimized className="h-full w-full object-cover" />
      </button> : photo.file_url && /^https?:\/\//i.test(photo.file_url) ? <a key={index} className="rounded-md border border-line px-3 py-2 text-sm" href={photo.file_url} target="_blank" rel="noreferrer">Ver {photo.file_name || "evidencia"}</a> : null)}
      {loading ? <span role="status" className="text-xs text-content-muted">Cargando foto...</span> : null}
      {error ? <div role="alert" className="text-xs text-red-600">{error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Reintentar foto</button></div> : null}
    </div>
    {expanded?.base64_data ? createPortal(<div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 p-6" role="dialog" aria-modal="true" aria-label="Evidencia fotografica ampliada">
      <div className="relative h-[80vh] w-full max-w-4xl"><button ref={closeButton} type="button" autoFocus className="absolute right-0 top-0 z-10 rounded-md bg-white px-4 py-2 text-black" aria-label="Cerrar foto de evidencia" onClick={closePhoto}>Cerrar</button>
        <Image alt={expanded.file_name || "Evidencia ampliada"} src={expanded.base64_data} fill unoptimized className="object-contain" sizes="90vw" />
      </div>
    </div>, document.body) : null}
  </>;
}
