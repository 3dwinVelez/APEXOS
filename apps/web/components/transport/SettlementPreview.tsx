"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
type Preview={currency:string;total:number;recoverable:number;variance:number;lines:{concept:string;total:number;source:string;recoverable:boolean}[]};
export function SettlementPreview({tripId}:{tripId:number}) {
  const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;api<Preview>(`/api/v1/transport/trips/${tripId}/settlement-preview`,{cache:"no-store"}).then(p=>{if(active)setPreview(p);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[tripId]);
  if(error)return <p role="alert">{error}</p>;
  if(!preview)return <p aria-live="polite">Calculando preliquidación…</p>;
  const money=(n:number)=>`${preview.currency} ${n.toLocaleString("es-CO")}`;
  return <div className="my-3 space-y-3"><p className="text-sm text-neutral-500">Calculada desde el viaje y sus novedades. Cada concepto conserva su origen.</p><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th className="py-2">Concepto / origen</th><th className="text-right">Valor</th></tr></thead><tbody>{preview.lines.map(l=><tr key={l.concept} className="border-b border-line"><td className="py-2">{l.concept}<span className="block text-xs text-neutral-500">{l.source}{l.recoverable?" · Recuperable del responsable":""}</span></td><td className="text-right">{money(l.total)}</td></tr>)}</tbody></table><p className="font-semibold">Total a liquidar: {money(preview.total)}</p><p className="text-xs">Diferencia frente al compromiso: {money(preview.variance)} · Recuperable: {money(preview.recoverable)}</p></div>;
}
