import type { ReactNode } from "react";
export const transportInput="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-apex";
export const transportButton="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-apex px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
export function TransportCard({title,children}:{title:string;children:ReactNode}) {return <section className="rounded-xl border border-line bg-white p-4"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>;}
export function TransportMetric({label,value,hint,percent,safeWhenFull=false}:{label:string;value:ReactNode;hint?:string;percent?:number;safeWhenFull?:boolean}) {
  const normalized = Math.max(0, Math.min(100, Number(percent || 0)));
  const tone = safeWhenFull ? "bg-emerald-500" : normalized >= 95 ? "bg-rose-500" : normalized >= 50 ? "bg-amber-400" : "bg-emerald-500";
  return <div className="rounded-xl border border-line bg-white p-4">
    <div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-neutral-500">{label}</p><p className="text-lg font-semibold leading-none">{value}</p></div>
    {percent !== undefined ? <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(normalized)}><div className={`h-full rounded-full transition-[width,background-color] duration-500 ${tone}`} style={{width:`${normalized}%`}} /></div> : null}
    {hint&&<p className="mt-2 text-xs text-neutral-500">{hint}</p>}
  </div>;
}
