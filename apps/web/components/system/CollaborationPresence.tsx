"use client";

import { Activity, Circle, Users, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PresenceState = "viewing" | "editing";
type PresenceMessage = { type: "presence" | "leave"; tabId: string; user: string; company: string; path: string; state: PresenceState; at: number };
type Peer = PresenceMessage;

const signalKey = "apex_collaboration_signal";
const heartbeatMs = 5_000;
const staleMs = 16_000;

function currentIdentity() {
  return {
    user: localStorage.getItem("user_email") || "Usuario local",
    company: localStorage.getItem("apexos_company_id") || "local"
  };
}

function routeLabel(path: string) {
  if (path === "/dashboard") return "Dashboard";
  return path.split("/").filter(Boolean).pop()?.replaceAll("-", " ") || "APEX OS";
}

export function CollaborationPresence() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PresenceState>("viewing");
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const channel = useRef<BroadcastChannel | null>(null);
  const tabId = useRef("");

  useEffect(() => {
    tabId.current = sessionStorage.getItem("apex_collaboration_tab") || crypto.randomUUID();
    sessionStorage.setItem("apex_collaboration_tab", tabId.current);
  }, []);

  useEffect(() => {
    const identity = currentIdentity();
    const channelName = `apex-collaboration:${identity.company}`;
    channel.current?.close();
    channel.current = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);

    const receive = (message: PresenceMessage) => {
      if (!message?.tabId || message.tabId === tabId.current || message.company !== identity.company) return;
      setPeers((current) => {
        const next = { ...current };
        if (message.type === "leave") delete next[message.tabId];
        else next[message.tabId] = message;
        return next;
      });
    };
    const broadcast = (nextState = state, type: PresenceMessage["type"] = "presence") => {
      const message: PresenceMessage = { type, tabId: tabId.current, ...identity, path: pathname, state: nextState, at: Date.now() };
      channel.current?.postMessage(message);
      localStorage.setItem(signalKey, JSON.stringify(message));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== signalKey || !event.newValue) return;
      try { receive(JSON.parse(event.newValue) as PresenceMessage); } catch { /* Señales incompletas se ignoran. */ }
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, [contenteditable='true']")) setState("editing");
    };
    const onBlur = () => window.setTimeout(() => {
      if (!(document.activeElement as HTMLElement | null)?.matches("input, select, textarea, [contenteditable='true']")) setState("viewing");
    }, 0);
    const cleanup = window.setInterval(() => setPeers((current) => Object.fromEntries(Object.entries(current).filter(([, peer]) => Date.now() - peer.at < staleMs))), heartbeatMs);
    const heartbeat = window.setInterval(() => broadcast(), heartbeatMs);
    channel.current?.addEventListener("message", (event) => receive(event.data as PresenceMessage));
    window.addEventListener("storage", onStorage);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    const leave = () => broadcast(state, "leave");
    window.addEventListener("pagehide", leave);
    broadcast();
    return () => {
      leave();
      window.clearInterval(cleanup);
      window.clearInterval(heartbeat);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      channel.current?.close();
    };
  }, [pathname, state]);

  const activePeers = useMemo(() => Object.values(peers).filter((peer) => Date.now() - peer.at < staleMs), [peers]);
  const conflicts = activePeers.filter((peer) => peer.path === pathname && peer.state === "editing");

  return <>
    {conflicts.length ? <div aria-live="assertive" className="fixed bottom-4 left-1/2 z-[80] flex max-w-[min(92vw,680px)] -translate-x-1/2 items-center gap-3 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-overlay"><Activity className="shrink-0" size={18} /><p><strong>Edición concurrente:</strong> {conflicts[0].user} también está modificando esta pantalla. Verifica los cambios antes de guardar.</p><button aria-label="Ocultar aviso de edición concurrente" className="ml-auto rounded-control p-1 hover:bg-amber-100" onClick={() => setPeers((current) => Object.fromEntries(Object.entries(current).filter(([, peer]) => peer.path !== pathname || peer.state !== "editing")))} type="button"><X size={16} /></button></div> : null}
    <div className="relative">
      <button aria-expanded={open} aria-haspopup="dialog" aria-label="Colaboración en tiempo real" className="apex-interactive relative inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:text-content-strong" onClick={() => setOpen((value) => !value)} type="button"><Users size={15} /><span className="hidden xl:inline">Equipo</span><span aria-label={`${activePeers.length + 1} sesiones activas`} className="rounded-full bg-apex/10 px-1.5 text-[10px] text-apex">{activePeers.length + 1}</span></button>
      {open ? <section aria-label="Colaboración en tiempo real" className="apex-dialog-enter absolute right-0 top-12 z-[70] w-[min(360px,calc(100vw-24px))] rounded-card border border-line bg-surface p-4 shadow-overlay" role="dialog">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-content-strong">Equipo activo</h2><p className="mt-1 text-xs text-content-muted">Presencia instantánea en esta empresa.</p></div><button className="rounded-control px-2 py-1 text-xs hover:bg-surface-muted" onClick={() => setOpen(false)} type="button">Cerrar</button></div>
        <ul aria-live="polite" className="mt-3 space-y-2">
          <li className="flex items-center gap-3 rounded-control bg-surface-muted p-3"><Circle className="fill-emerald-500 text-emerald-500" size={10} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-content-strong">Tú · {currentIdentity().user}</p><p className="text-[11px] text-content-muted">{state === "editing" ? "Editando" : "Viendo"} {routeLabel(pathname)}</p></div></li>
          {activePeers.map((peer) => <li className="flex items-center gap-3 rounded-control border border-line p-3" key={peer.tabId}><Circle className="fill-emerald-500 text-emerald-500" size={10} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-content-strong">{peer.user}</p><p className="text-[11px] text-content-muted">{peer.state === "editing" ? "Editando" : "Viendo"} {routeLabel(peer.path)}</p></div></li>)}
        </ul>
        {!activePeers.length ? <p className="mt-3 rounded-control border border-dashed border-line p-3 text-xs text-content-muted">No hay otras sesiones activas en este navegador. El canal está listo para recibirlas.</p> : null}
        <p className="mt-3 text-[10px] text-content-subtle">Canal local seguro · no comparte el contenido de los formularios.</p>
      </section> : null}
    </div>
  </>;
}
