"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";
import { useWorkspaceToolWindow } from "@/lib/workspaceTools";
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
  const { open, close } = useWorkspaceToolWindow("team");
  const [state, setState] = useState<PresenceState>("viewing");
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const channel = useRef<BroadcastChannel | null>(null);
  const remote = useRef<WebSocket | null>(null);
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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const remoteUrl = (process.env.NEXT_PUBLIC_WS_URL || apiUrl.replace(/^http/, "ws")).replace(/\/$/, "");

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
      if (remote.current?.readyState === WebSocket.OPEN) remote.current.send(JSON.stringify(message));
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
    if (remoteUrl) {
      remote.current = new WebSocket(`${remoteUrl}/collaboration/live`);
      remote.current.addEventListener("open", () => remote.current?.send(JSON.stringify({ type: "authenticate", token: localStorage.getItem("token") || "", company_id: identity.company })));
      remote.current.addEventListener("message", (event) => { try { const value = JSON.parse(String(event.data)); if (value.type !== "authenticated") receive(value as PresenceMessage); } catch { /* Ignorar mensajes remotos inválidos. */ } });
    }
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
      remote.current?.close();
    };
  }, [pathname, state]);

  const activePeers = useMemo(() => Object.values(peers).filter((peer) => Date.now() - peer.at < staleMs), [peers]);
  const conflicts = activePeers.filter((peer) => peer.path === pathname && peer.state === "editing");

  return <>
    {conflicts.length ? <div aria-live="assertive" className="fixed bottom-4 left-1/2 z-[80] flex max-w-[min(92vw,680px)] -translate-x-1/2 items-center gap-3 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-overlay"><Activity className="shrink-0" size={18} /><p><strong>Edición concurrente:</strong> {conflicts[0].user} también está modificando esta pantalla. Verifica los cambios antes de guardar.</p><button aria-label="Ocultar aviso de edición concurrente" className="ml-auto rounded-control p-1 hover:bg-amber-100" onClick={() => setPeers((current) => Object.fromEntries(Object.entries(current).filter(([, peer]) => peer.path !== pathname || peer.state !== "editing")))} type="button"><X size={16} /></button></div> : null}
    {open ? <ModalFrame tone="brand" title="Equipo" description="Presencia instantánea en esta empresa." icon={<Users size={18} />} maxWidth="md:!max-w-lg" onClose={close}>
      <section aria-label="Colaboración en tiempo real">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-content-strong">Equipo activo</h3>
          <span aria-label={`${activePeers.length + 1} sesiones activas`} className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-apex">{activePeers.length + 1} sesiones</span>
        </div>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-3 rounded-control bg-surface-muted p-3"><Circle className="fill-emerald-500 text-emerald-500" size={10} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-content-strong">Tú · {currentIdentity().user}</p><p className="text-[11px] text-content-muted">{state === "editing" ? "Editando" : "Viendo"} {routeLabel(pathname)}</p></div></li>
          {activePeers.map((peer) => <li className="flex items-center gap-3 rounded-control border border-line p-3" key={peer.tabId}><Circle className="fill-emerald-500 text-emerald-500" size={10} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-content-strong">{peer.user}</p><p className="text-[11px] text-content-muted">{peer.state === "editing" ? "Editando" : "Viendo"} {routeLabel(peer.path)}</p></div></li>)}
        </ul>
        {!activePeers.length ? <p className="mt-3 rounded-control border border-dashed border-line p-3 text-xs text-content-muted">No hay otras sesiones activas en este navegador. El canal está listo para recibirlas.</p> : null}
        <p className="mt-3 text-[10px] text-content-subtle">Canal local seguro · no comparte el contenido de los formularios.</p>
      </section>
    </ModalFrame> : null}
  </>;
}
