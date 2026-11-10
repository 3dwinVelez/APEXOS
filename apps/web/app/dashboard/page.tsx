"use client";

import { loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { LOBBY_BANNER, lobbyModuleImage } from "@/lib/lobbyAssets";
import { MODULES, MODULES_BY_SLUG } from "@/lib/modules";
import { actionsForWorkspace } from "@/lib/operationalWorkspace";
import { AlertCircle, ArrowRight, Clock3, Grid2X2, LayoutGrid, Play, RefreshCw, Search, Sparkles, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Trace = { path: string; label: string; at: string };
const TRACE_KEY = "apex_navigation_trace_v1";

function readableLabel(trace: Trace) {
  if (trace.path === "/dashboard") return "Inicio";
  const parts = trace.path.split("/").filter(Boolean).slice(1);
  return parts.map((part) => part.replace(/-/g, " ")).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" · ") || trace.label;
}
function traceModule(path: string) { return path.split("/").filter(Boolean)[1] || ""; }

function userDisplayName() {
  const email = localStorage.getItem("user_email") || "";
  const raw = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "";
  if (!raw) return "";
  return raw.split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function DashboardPage() {
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });
  const [error, setError] = useState("");
  const [roleName, setRoleName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [activity, setActivity] = useState<Trace[]>([]);

  async function refreshAccess() {
    setError(""); setAccess((value) => ({ ...value, loading: true }));
    try { setAccess(await loadModuleAccess(MODULES)); }
    catch { setAccess({ loading: false, isPlatformAdmin: false, bySlug: {} }); setError("No pudimos cargar tus módulos. Revisa la conexión e inténtalo otra vez."); }
  }

  useEffect(() => {
    setRoleName(localStorage.getItem("role_name") || localStorage.getItem("apexos_company_role") || "Usuario operativo");
    setCompanyName(localStorage.getItem("apexos_company_name") || "Tu empresa");
    setDisplayName(userDisplayName());
    try { setActivity(JSON.parse(localStorage.getItem(TRACE_KEY) || "[]") as Trace[]); } catch { setActivity([]); }
    void refreshAccess();
  }, []);

  const activeModules = useMemo(() => MODULES.filter((module) => access.bySlug[module.slug] === true).sort((a, b) => (access.orderBySlug?.[a.slug] ?? 999) - (access.orderBySlug?.[b.slug] ?? 999)), [access]);
  const enabledSlugs = useMemo(() => new Set(activeModules.map((module) => module.slug)), [activeModules]);
  const actions = useMemo(() => actionsForWorkspace(enabledSlugs, roleName).slice(0, 6), [enabledSlugs, roleName]);
  const recent = activity.filter((item) => item.path !== "/dashboard" && enabledSlugs.has(traceModule(item.path))).slice(0, 5);
  const startHref = actions[0]?.href ?? (activeModules[0] ? `/dashboard/${activeModules[0].slug}` : "#mis-modulos");

  if (access.loading) return <WorkspaceLoading />;
  if (error) return <WorkspaceError message={error} retry={refreshAccess} />;

  return <div className="apex-lobby mx-auto max-w-[1500px] space-y-6 pb-8">
    <section aria-labelledby="lobby-hero-title" className="apex-lobby-hero flex min-h-[19rem] sm:min-h-[21rem]">
      <Image src={LOBBY_BANNER} alt="" fill priority sizes="(max-width: 1500px) 100vw, 1500px" />
      <div className="relative z-10 flex max-w-2xl flex-col justify-center gap-4 p-6 sm:p-10">
        <span className="apex-lobby-eyebrow"><Sparkles size={13} /> Bienvenido{displayName ? `, ${displayName}` : ""} · {companyName}</span>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl" id="lobby-hero-title">Tu operación, más simple y <span className="apex-lobby-accent">bajo control.</span></h1>
        <p className="max-w-xl text-sm text-white/75 sm:text-base">Gestiona tu empresa en un solo lugar, de forma ágil, conectada y sin complicaciones.</p>
        <div className="mt-1 flex flex-wrap gap-3">
          <Link className="apex-lobby-cta-primary" href={startHref} prefetch={false}><Play size={16} /> Comenzar</Link>
          <Link className="apex-lobby-cta-secondary" href="#mis-modulos" prefetch={false}><LayoutGrid size={16} /> Explorar módulos</Link>
        </div>
      </div>
    </section>

    {activeModules.length ? <>
      <section aria-labelledby="quick-actions-title">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-content-strong" id="quick-actions-title">Acciones frecuentes</h2><p className="text-sm text-content-muted">Realiza tus tareas principales en un solo clic.</p></div><span className="hidden items-center gap-1 text-xs text-content-subtle sm:flex"><Zap size={14} /> Priorizadas para tu perfil</span></div>
        {actions.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{actions.map((action, index) => { const Icon = action.icon; return <Link className={`group flex min-h-20 items-center gap-3 rounded-card border p-3.5 transition hover:-translate-y-0.5 hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex ${index === 0 ? "border-apex/50 bg-apex/5" : "border-line bg-surface"}`} href={action.href} key={action.id} prefetch={false}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-apex text-white"><Icon size={18} /></span><span className="min-w-0 flex-1"><strong className="block text-sm leading-tight text-content-strong">{action.label}</strong><small className="mt-0.5 block truncate text-content-muted">{action.description}</small></span><ArrowRight className="shrink-0 text-content-subtle transition group-hover:translate-x-1 group-hover:text-apex" size={16} /></Link>; })}</div> : <EmptyActions />}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section aria-labelledby="modules-title" className="rounded-card border border-line bg-surface p-4 sm:p-5" id="mis-modulos">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-content-strong" id="modules-title">Mis módulos</h2><p className="text-sm text-content-muted">Habilitados para tu empresa y perfil.</p></div><span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-content-muted">{activeModules.length}</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeModules.map((module) => { const Icon = module.icon; const image = lobbyModuleImage(module.slug); return <Link className="apex-lobby-tile group" href={`/dashboard/${module.slug}`} key={module.slug} prefetch={false}>
            <span className="apex-lobby-tile-media">{image ? <Image src={image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 320px" /> : <span className="apex-lobby-tile-fallback"><Icon size={30} /></span>}</span>
            <span className="apex-lobby-tile-body"><span className="apex-lobby-tile-icon"><Icon size={16} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-content-strong">{module.name}</strong><small className="block truncate text-content-muted">{module.area}</small></span><ArrowRight className="shrink-0 text-content-subtle transition group-hover:translate-x-1 group-hover:text-apex" size={16} /></span>
          </Link>; })}</div>
        </section>

        <section aria-labelledby="recent-title" className="rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="mb-4"><h2 className="text-lg font-semibold text-content-strong" id="recent-title">Continúa donde estabas</h2><p className="text-sm text-content-muted">Retoma tus últimas actividades en este dispositivo.</p></div>
          {recent.length ? <ol className="divide-y divide-line">{recent.map((item) => { const mod = MODULES_BY_SLUG[traceModule(item.path)]; const Icon = mod?.icon ?? Clock3; return <li key={`${item.path}-${item.at}`}><Link className="group flex items-center gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-apex" href={item.path}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-apex/10 text-apex"><Icon size={16} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium text-content-strong">{readableLabel(item)}</strong><small className="mt-0.5 block truncate text-xs text-content-subtle">{mod?.name ?? "Módulo"} · <time>{new Date(item.at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></small></span><ArrowRight className="shrink-0 text-content-subtle group-hover:text-apex" size={16} /></Link></li>; })}</ol> : <div className="rounded-control border border-dashed border-line bg-surface-muted p-6 text-center"><Clock3 className="mx-auto text-content-subtle" size={24} /><p className="mt-2 text-sm font-semibold text-content-strong">Aún no hay actividad reciente</p><p className="mt-1 text-xs text-content-muted">Cuando visites un módulo, aparecerá aquí para volver rápidamente.</p></div>}
        </section>
      </div>
    </> : <section className="rounded-card border border-dashed border-line bg-surface p-8 text-center"><Grid2X2 className="mx-auto text-content-subtle" size={30} /><h2 className="mt-3 text-lg font-semibold text-content-strong">No tienes módulos habilitados</h2><p className="mx-auto mt-1 max-w-md text-sm text-content-muted">Solicita al administrador de tu empresa que active los módulos y permisos necesarios para tu operación.</p></section>}
  </div>;
}

function WorkspaceLoading() { return <div aria-busy="true" aria-label="Cargando espacio de trabajo" className="mx-auto max-w-[1500px] animate-pulse space-y-6"><div className="h-64 rounded-card bg-surface-muted" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <div className="h-20 rounded-card bg-surface-muted" key={index} />)}</div><div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]"><div className="h-80 rounded-card bg-surface-muted" /><div className="h-80 rounded-card bg-surface-muted" /></div></div>; }
function WorkspaceError({ message, retry }: { message: string; retry: () => void }) { return <section className="mx-auto max-w-xl rounded-card border border-red-200 bg-red-50 p-6 text-center" role="alert"><AlertCircle className="mx-auto text-red-600" size={28} /><h1 className="mt-3 text-lg font-semibold text-red-950">No fue posible preparar tu operación</h1><p className="mt-1 text-sm text-red-800">{message}</p><button className="mt-4 inline-flex h-10 items-center gap-2 rounded-control bg-red-700 px-4 text-sm font-semibold text-white" onClick={retry} type="button"><RefreshCw size={16} />Reintentar</button></section>; }
function EmptyActions() { return <div className="rounded-card border border-dashed border-line bg-surface p-6 text-center"><Search className="mx-auto text-content-subtle" size={24} /><p className="mt-2 text-sm font-semibold text-content-strong">No hay acciones rápidas para estos módulos</p><p className="mt-1 text-xs text-content-muted">Puedes abrir cualquiera desde Mis módulos.</p></div>; }
