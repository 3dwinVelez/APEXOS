"use client";

import { Check, Clipboard, RotateCcw, RotateCw, ShieldCheck, Smartphone, Sparkles, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseAuth } from "@/lib/supabaseClient";
import { currentRegion, formatRegionalDate, formatRegionalMoney, type ApexRegion } from "@/lib/regionalFormat";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const steps = [
  ["dashboard", "Conoce tu tablero", "/dashboard"],
  ["inventory", "Revisa Inventarios", "/dashboard/inventario"],
  ["reports", "Explora Apex Heart", "/dashboard/reportes/apex-heart"],
  ["security", "Verifica tu cuenta", "/dashboard/configuracion"]
] as const;

export function WorldClassToolkit() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [mfa, setMfa] = useState<{ factorId: string; challengeId: string; qr: string; code: string; verified: boolean } | null>(null);
  const [region, setRegion] = useState<ApexRegion>("CO");
  const key = useMemo(() => `apex_onboarding_v1:${typeof window === "undefined" ? "anonymous" : localStorage.getItem("user_email") || "anonymous"}`, []);

  useEffect(() => {
    try { setCompleted(JSON.parse(localStorage.getItem(key) || "[]")); } catch { setCompleted([]); } setRegion(currentRegion());
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, [key]);

  useEffect(() => {
    const matched = steps.filter(([, , href]) => pathname === href || pathname.startsWith(`${href}/`)).map(([id]) => id);
    if (!matched.length) return;
    setCompleted((current) => {
      const next = [...new Set([...current, ...matched])];
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key, pathname]);

  const copyLink = async () => { await navigator.clipboard.writeText(window.location.href); setMessage("Enlace copiado"); };
  const action = (name: "undo" | "redo") => { window.dispatchEvent(new CustomEvent(`apex:${name}`)); setMessage(name === "undo" ? "Solicitud de deshacer enviada" : "Solicitud de rehacer enviada"); };
  const install = async () => { if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } };
  const startMfa = async () => { try { if (localStorage.getItem("auth_provider") !== "supabase") throw new Error("2FA requiere una sesión Supabase."); const enrolled = await supabaseAuth.enrollTotp(); const challenge = await supabaseAuth.challengeTotp(enrolled.id); setMfa({ factorId: enrolled.id, challengeId: challenge.id, qr: enrolled.totp.qr_code, code: "", verified: false }); setMessage("Escanea el código y confirma seis dígitos."); } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible iniciar 2FA"); } };
  const verifyMfa = async () => { if (!mfa || !/^\d{6}$/.test(mfa.code)) { setMessage("Ingresa los seis dígitos."); return; } try { await supabaseAuth.verifyTotp(mfa.factorId, mfa.challengeId, mfa.code); setMfa({ ...mfa, verified: true }); setMessage("2FA activado y verificado."); } catch (error) { setMessage(error instanceof Error ? error.message : "Código inválido"); } };
  const changeRegion = (next: ApexRegion) => { localStorage.setItem("apex_region", next); setRegion(next); window.dispatchEvent(new CustomEvent("apex:region", { detail: next })); setMessage("Formato regional actualizado"); };

  return <div className="relative">
    <button aria-expanded={open} aria-haspopup="dialog" aria-label="Centro de productividad" className="apex-interactive inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:text-content-strong" onClick={() => setOpen((value) => !value)} type="button"><Sparkles size={15}/><span className="hidden xl:inline">Productividad</span></button>
    {open ? <section aria-label="Centro de productividad" className="apex-dialog-enter fixed left-3 right-3 top-16 z-[70] max-h-[calc(100vh-80px)] overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-overlay sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[min(390px,calc(100vw-24px))]" role="dialog">
      <div className="flex justify-between gap-3"><div><h2 className="font-semibold text-content-strong">Tu progreso en APEX OS</h2><p className="text-xs text-content-muted">{completed.length} de {steps.length} recorridos completados</p></div><button aria-label="Cerrar centro de productividad" onClick={() => setOpen(false)} type="button"><X size={17}/></button></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted"><span className="block h-full bg-apex transition-all" style={{ width: `${completed.length / steps.length * 100}%` }}/></div>
      <ol className="mt-3 space-y-1">{steps.map(([id, label, href]) => <li key={id}><Link className="flex items-center gap-2 rounded-control px-2 py-2 text-xs hover:bg-surface-muted" href={href}><span className={`grid h-5 w-5 place-items-center rounded-full ${completed.includes(id) ? "bg-apex text-white" : "border border-line"}`}>{completed.includes(id) ? <Check size={12}/> : null}</span>{label}</Link></li>)}</ol>
      <section className="mt-4 border-t border-line pt-3"><h3 className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="text-apex" size={15}/>Confianza de la sesión</h3><div className="mt-2 grid grid-cols-2 gap-2 text-[11px]"><span className="rounded-control bg-emerald-500/10 p-2 text-emerald-700">Sesión protegida</span><span className="rounded-control bg-emerald-500/10 p-2 text-emerald-700">Permisos activos</span><span className="rounded-control bg-emerald-500/10 p-2 text-emerald-700">Auditoría habilitada</span><button className="rounded-control bg-amber-500/10 p-2 text-left text-amber-800" onClick={() => void startMfa()} type="button">{mfa?.verified ? "2FA verificado" : "Activar 2FA"}</button></div>{mfa && !mfa.verified ? <div className="mt-3 rounded-control border border-line p-3"><Image alt="Código QR para configurar 2FA" className="mx-auto h-36 w-36" height={144} src={mfa.qr} unoptimized width={144}/><label className="mt-2 block text-xs">Código de seis dígitos<input autoComplete="one-time-code" className="mt-1 h-10 w-full rounded-control border border-line px-3" inputMode="numeric" maxLength={6} onChange={(event) => setMfa({ ...mfa, code: event.target.value.replace(/\D/g, "") })} value={mfa.code}/></label><button className="mt-2 h-9 w-full rounded-control bg-apex text-xs font-semibold text-white" onClick={() => void verifyMfa()} type="button">Verificar y activar</button></div> : null}</section>
      <section className="mt-4 border-t border-line pt-3"><h3 className="text-xs font-semibold">Formato regional</h3><select aria-label="Región para fechas y moneda" className="mt-2 h-9 w-full rounded-control border border-line bg-surface px-2 text-xs" onChange={(event) => changeRegion(event.target.value as ApexRegion)} value={region}><option value="CO">Colombia · COP</option><option value="MX">México · MXN</option><option value="US">Estados Unidos · USD</option><option value="BR">Brasil · BRL</option></select><p className="mt-1 text-[11px] text-content-muted">{formatRegionalMoney(123456.78, region)} · {formatRegionalDate(new Date(), region)}</p></section><section className="mt-4 border-t border-line pt-3"><h3 className="text-xs font-semibold">Acciones rápidas</h3><div className="mt-2 grid grid-cols-4 gap-2"><button aria-label="Copiar enlace" className="grid h-10 place-items-center rounded-control border border-line" onClick={() => void copyLink()} type="button"><Clipboard size={15}/></button><button aria-label="Deshacer" className="grid h-10 place-items-center rounded-control border border-line" onClick={() => action("undo")} type="button"><RotateCcw size={15}/></button><button aria-label="Rehacer" className="grid h-10 place-items-center rounded-control border border-line" onClick={() => action("redo")} type="button"><RotateCw size={15}/></button><button aria-label="Instalar aplicación" className="grid h-10 place-items-center rounded-control border border-line disabled:opacity-40" disabled={!installPrompt} onClick={() => void install()} type="button"><Smartphone size={15}/></button></div>{message ? <p aria-live="polite" className="mt-2 text-xs text-apex">{message}</p> : null}</section>
    </section> : null}
  </div>;
}
