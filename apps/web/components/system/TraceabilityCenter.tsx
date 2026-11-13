"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";
import { useI18n } from "@/lib/i18n";
import { useWorkspaceToolWindow } from "@/lib/workspaceTools";
import { Clock3, Route } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Trace = { path: string; label: string; at: string };
const key = "apex_navigation_trace_v1";

export function TraceabilityCenter() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { open, close } = useWorkspaceToolWindow("traceability");
  const [items, setItems] = useState<Trace[]>([]);

  useEffect(() => {
    let current: Trace[] = [];
    try { current = JSON.parse(localStorage.getItem(key) || "[]") as Trace[]; } catch { current = []; }
    const next = [{ path: pathname, label: pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "dashboard", at: new Date().toISOString() }, ...current.filter((item) => item.path !== pathname)].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(next));
    setItems(next);
  }, [pathname]);

  if (!open) return null;

  return <ModalFrame tone="brand" title={t("traceability")} description="Recorrido reciente entre los módulos de esta sesión." icon={<Route size={18} />} maxWidth="md:!max-w-lg" onClose={close}>
    <section aria-label="Trazabilidad de navegación">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-content-strong"><Clock3 className="text-apex" size={15} />Recorrido reciente</h3>
      <div className="mt-3 space-y-1">{items.map((item) => <Link className="flex items-center justify-between gap-3 rounded-control px-2 py-2 text-xs hover:bg-surface-muted" href={item.path} key={item.path}><span className="truncate capitalize">{item.label}</span><time className="shrink-0 text-content-subtle">{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></Link>)}</div>
    </section>
  </ModalFrame>;
}
