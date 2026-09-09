"use client";

import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { NOTIFICATION_EVENT, NOTIFICATION_STORAGE_KEY, type StoredNotification } from "./ToastCenter";

function readHistory(): StoredNotification[] {
  try { const value = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StoredNotification[]>([]);
  useEffect(() => {
    setItems(readHistory());
    const receive = () => setItems(readHistory());
    window.addEventListener(NOTIFICATION_EVENT, receive);
    return () => window.removeEventListener(NOTIFICATION_EVENT, receive);
  }, []);
  const unread = items.filter((item) => !item.read).length;
  function persist(next: StoredNotification[]) { setItems(next); localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(next)); }
  function markAllRead() { persist(items.map((item) => ({ ...item, read: true }))); }
  function openCenter() { setOpen(true); markAllRead(); }

  return <>
    <button aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`} className="relative inline-flex h-10 w-10 items-center justify-center rounded-control border border-line bg-surface text-content-body shadow-card hover:border-apex hover:text-apex" onClick={openCenter} type="button"><Bell size={18}/>{unread ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-error px-1 text-center text-xs font-semibold text-white">{unread > 9 ? "9+" : unread}</span> : null}</button>
    {open ? <Drawer title="Notificaciones" onClose={() => setOpen(false)}><div className="mb-4 flex items-center justify-between gap-2"><p className="text-sm text-content-muted">Historial reciente de la operación</p><div className="flex gap-2"><button className="rounded-control border border-line p-2" onClick={markAllRead} title="Marcar todo como leído" type="button"><CheckCheck size={16}/></button><button className="rounded-control border border-line p-2 text-error" onClick={() => persist([])} title="Limpiar historial" type="button"><Trash2 size={16}/></button></div></div>{items.length ? <ol className="space-y-2">{items.map((item) => <li className="rounded-card border border-line bg-surface-muted/50 p-3" key={item.id}><div className="flex items-start justify-between gap-3"><strong className="text-sm text-content-strong">{item.title}</strong><time className="shrink-0 text-xs text-content-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</time></div>{item.description ? <p className="mt-1 text-sm text-content-body">{item.description}</p> : null}</li>)}</ol> : <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-content-muted">Todavía no hay notificaciones.</p>}</Drawer> : null}
  </>;
}
