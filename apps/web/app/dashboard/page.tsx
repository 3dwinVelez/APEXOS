"use client";

import { loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { actionsForWorkspace } from "@/lib/operationalWorkspace";
import { AlertCircle, ArrowRight, Clock3, Grid2X2, RefreshCw, Search, Sparkles } from "lucide-react";
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

export default function DashboardPage() {
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });
  const [error, setError] = useState("");
  const [roleName, setRoleName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [activity, setActivity] = useState<Trace[]>([]);

  async function refreshAccess() {
    setError(""); setAccess((value) => ({ ...value, loading: true }));
    try { setAccess(await loadModuleAccess(MODULES)); }
    catch { setAccess({ loading: false, isPlatformAdmin: false, bySlug: {} }); setError("No pudimos cargar tus módulos. Revisa la conexión e inténtalo otra vez."); }
  }

  useEffect(() => {
    setRoleName(localStorage.getItem("role_name") || localStorage.getItem("apexos_company_role") || "Usuario operativo");
    setCompanyName(localStorage.getItem("apexos_company_name") || "Tu empresa");
    try { setActivity(JSON.parse(localStorage.getItem(TRACE_KEY) || "[]") as Trace[]); } catch { setActivity([]); }
    void refreshAccess();
  }, []);

  const activeModules = useMemo(() => MODULES.filter((module) => access.bySlug[module.slug] === true).sort((a, b) => (access.orderBySlug?.[a.slug] ?? 999) - (access.orderBySlug?.[b.slug] ?? 999)), [access]);
  const enabledSlugs = useMemo(() => new Set(activeModules.map((module) => module.slug)), [activeModules]);
  const actions = useMemo(() => actionsForWorkspace(enabledSlugs, roleName).slice(0, 6), [enabledSlugs, roleName]);
  const recent = activity.filter((item) => item.path !== "/dashboard" && enabledSlugs.has(traceModule(item.path))).slice(0, 5);

  if (access.loading) return <WorkspaceLoading />;
  if (error) return <WorkspaceError message={error} retry={refreshAccess} />;

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-8">
    <header className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-apex">{companyName}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-content-strong">Mi operación</h1><p className="mt-1 text-sm text-content-muted">Accesos directos para ejecutar tu trabajo diario.</p></div>
      <p className="text-xs text-content-subtle">Perfil: <span className="font-semibold text-content-muted">{roleName}</span></p>
    </header>

    {activeModules.length ? <>
      <section aria-labelledby="quick-actions-title">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-content-strong" id="quick-actions-title">Acciones frecuentes</h2><p className="text-sm text-content-muted">Empieza una tarea sin recorrer menús.</p></div><span className="hidden items-center gap-1 text-xs text-content-subtle sm:flex"><Sparkles size={14} /> Priorizadas para tu perfil</span></div>
        {actions.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{actions.map((action, index) => { const Icon = action.icon; return <Link className={`group flex min-h-24 items-center gap-4 rounded-card border p-4 transition hover:-translate-y-0.5 hover:border-apex hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex ${index === 0 ? "border-apex/40 bg-apex/5" : "border-line bg-surface"}`} href={action.href} key={action.id} prefetch={false}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-apex text-white"><Icon size={20} /></span><span className="min-w-0 flex-1"><strong className="block text-sm text-content-strong">{action.label}</strong><small className="mt-1 block text-content-muted">{action.description}</small></span><ArrowRight className="shrink-0 text-content-subtle transition group-hover:translate-x-1 group-hover:text-apex" size={18} /></Link>; })}</div> : <EmptyActions />}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section aria-labelledby="modules-title" className="rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-content-strong" id="modules-title">Mis módulos</h2><p className="text-sm text-content-muted">Solo los habilitados para tu empresa y perfil.</p></div><span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-content-muted">{activeModules.length}</span></div>
          <div className="grid gap-2 sm:grid-cols-2">{activeModules.map((module) => { const Icon = module.icon; return <Link className="group flex min-h-16 items-center gap-3 rounded-control border border-transparent p-3 transition hover:border-line hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-apex" href={`/dashboard/${module.slug}`} key={module.slug} prefetch={false}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-apex/10 text-apex"><Icon size={18} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-content-strong">{module.name}</strong><small className="block truncate text-content-muted">{module.area}</small></span><ArrowRight className="text-content-subtle group-hover:text-apex" size={16} /></Link>; })}</div>
        </section>

        <section aria-labelledby="recent-title" className="rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="mb-4"><h2 className="text-lg font-semibold text-content-strong" id="recent-title">Actividad reciente</h2><p className="text-sm text-content-muted">Tus últimas áreas visitadas en este dispositivo.</p></div>
          {recent.length ? <ol className="divide-y divide-line">{recent.map((item) => <li key={`${item.path}-${item.at}`}><Link className="group flex items-center gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-apex" href={item.path}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-apex"><Clock3 size={15} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium text-content-strong">{readableLabel(item)}</strong><time className="text-xs text-content-subtle">{new Date(item.at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></span><ArrowRight className="text-content-subtle group-hover:text-apex" size={16} /></Link></li>)}</ol> : <div className="rounded-control border border-dashed border-line bg-surface-muted p-6 text-center"><Clock3 className="mx-auto text-content-subtle" size={24} /><p className="mt-2 text-sm font-semibold text-content-strong">Aún no hay actividad reciente</p><p className="mt-1 text-xs text-content-muted">Cuando visites un módulo, aparecerá aquí para volver rápidamente.</p></div>}
        </section>
      </div>
    </> : <section className="rounded-card border border-dashed border-line bg-surface p-8 text-center"><Grid2X2 className="mx-auto text-content-subtle" size={30} /><h2 className="mt-3 text-lg font-semibold text-content-strong">No tienes módulos habilitados</h2><p className="mx-auto mt-1 max-w-md text-sm text-content-muted">Solicita al administrador de tu empresa que active los módulos y permisos necesarios para tu operación.</p></section>}
  </div>;
}

function WorkspaceLoading() { return <div aria-busy="true" aria-label="Cargando espacio de trabajo" className="mx-auto max-w-[1500px] animate-pulse space-y-6"><div className="h-20 rounded-card bg-surface-muted" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div className="h-24 rounded-card bg-surface-muted" key={index} />)}</div><div className="grid gap-6 xl:grid-cols-2"><div className="h-72 rounded-card bg-surface-muted" /><div className="h-72 rounded-card bg-surface-muted" /></div></div>; }
function WorkspaceError({ message, retry }: { message: string; retry: () => void }) { return <section className="mx-auto max-w-xl rounded-card border border-red-200 bg-red-50 p-6 text-center" role="alert"><AlertCircle className="mx-auto text-red-600" size={28} /><h1 className="mt-3 text-lg font-semibold text-red-950">No fue posible preparar Mi operación</h1><p className="mt-1 text-sm text-red-800">{message}</p><button className="mt-4 inline-flex h-10 items-center gap-2 rounded-control bg-red-700 px-4 text-sm font-semibold text-white" onClick={retry} type="button"><RefreshCw size={16} />Reintentar</button></section>; }
function EmptyActions() { return <div className="rounded-card border border-dashed border-line bg-surface p-6 text-center"><Search className="mx-auto text-content-subtle" size={24} /><p className="mt-2 text-sm font-semibold text-content-strong">No hay acciones rápidas para estos módulos</p><p className="mt-1 text-xs text-content-muted">Puedes abrir cualquiera desde Mis módulos.</p></div>; }
