"use client";

import { useI18n } from "@/lib/i18n";
import { Clock3, Route } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Trace = { path: string; label: string; at: string };
const key = "apex_navigation_trace_v1";

export function TraceabilityCenter() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Trace[]>([]);

  useEffect(() => {
    let current: Trace[] = [];
    try { current = JSON.parse(localStorage.getItem(key) || "[]") as Trace[]; } catch { current = []; }
    const next = [{ path: pathname, label: pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "dashboard", at: new Date().toISOString() }, ...current.filter((item) => item.path !== pathname)].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(next));
    setItems(next);
  }, [pathname]);

  return <div className="relative">
    <button aria-expanded={open} aria-haspopup="dialog" className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:text-content-strong" onClick={() => setOpen((value) => !value)} type="button"><Route size={15} />{t("traceability")}</button>
    {open ? <section aria-label="Trazabilidad de navegación" className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-24px))] rounded-card border border-line bg-surface p-3 shadow-overlay">
      <div className="mb-2 flex items-center gap-2"><Clock3 size={15} className="text-apex" /><h2 className="text-sm font-semibold">Recorrido reciente</h2></div>
      <div className="space-y-1">{items.map((item) => <Link className="flex items-center justify-between gap-3 rounded-control px-2 py-2 text-xs hover:bg-surface-muted" href={item.path} key={item.path}><span className="truncate capitalize">{item.label}</span><time className="shrink-0 text-content-subtle">{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></Link>)}</div>
    </section> : null}
  </div>;
}
