"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";

const control = "min-h-10 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-40";
export function InventoryRouteDialog({ title, description, returnHref, background, busy, childDialogOpen, children }: { title: string; description: string; returnHref: string; background: ReactNode; busy?: boolean; childDialogOpen?: boolean; children: ReactNode }) {
  const router = useRouter();
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="combobox"][aria-expanded="true"]'))) return; const top = [...document.querySelectorAll('[role="dialog"]')].at(-1); if (event.key === "Escape" && top?.contains(content.current) && !childDialogOpen) { event.preventDefault(); event.stopPropagation(); if (!busy) router.push(returnHref); } };
    document.addEventListener("keydown", close, true); return () => document.removeEventListener("keydown", close, true);
  }, [busy, childDialogOpen, returnHref, router]);
  return <><div aria-hidden="true" className="pointer-events-none select-none">{background}</div><ModalFrame title={title} onClose={() => { if (!busy && !childDialogOpen) router.push(returnHref); }} maxWidth="md:!max-w-6xl"><div ref={content} className="inventory-workspace inventory-route-content"><p className="mb-4 text-sm text-content-muted">{description}</p>{children}</div></ModalFrame></>;
}

type Step = { title: string; description: string; content: ReactNode };
export function InventoryGuidedForm({ steps, onSubmit, onCancel, busy = false, submitLabel = "Guardar registro", error, review, extraAction }: { steps: Step[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; busy?: boolean; submitLabel?: string; error?: string; review?: ReactNode; extraAction?: { label: string; onClick: () => void } }) {
  const [step, setStep] = useState(0), [values, setValues] = useState<{ label: string; value: string }[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const reviewStep = steps.length;
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="combobox"][aria-expanded="true"]'))) return; const top = [...document.querySelectorAll('[role="dialog"]')].at(-1); if (event.key === "Escape" && top?.contains(form.current)) { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); } };
    document.addEventListener("keydown", close, true); return () => document.removeEventListener("keydown", close, true);
  }, [busy, onCancel]);
  function validate(scope: HTMLElement | null) {
    const fields = [...(scope?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not([role=combobox]),select,textarea") || [])];
    const invalid = fields.find(field => !field.disabled && !field.checkValidity());
    if (invalid) { invalid.reportValidity(); return false; } return true;
  }
  function next() {
    if (!validate(form.current?.querySelector(`[data-inventory-step="${step}"]`) || null)) return;
    if (step === reviewStep - 1) {
      setValues([...(form.current?.querySelectorAll<HTMLLabelElement>("label") || [])].flatMap(label => {
        const field = label.querySelector<HTMLSelectElement>("select") || label.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([role="combobox"]),textarea');
        if (!field || field.disabled) return [];
        const clone = label.cloneNode(true) as HTMLElement; clone.querySelectorAll("input,select,textarea,svg,[aria-hidden]").forEach(node => node.remove());
        const value = field instanceof HTMLSelectElement ? field.selectedOptions[0]?.text : field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked ? "Sí" : "No" : field.value;
        return [{ label: clone.textContent?.trim() || field.name || "Campo", value: value || "Sin especificar" }];
      }));
    }
    setStep(current => Math.min(reviewStep, current + 1));
  }
  return <form ref={form} noValidate className="space-y-4" onInvalidCapture={event => { const target = event.target as HTMLElement; const section = target.closest<HTMLElement>("[data-inventory-step]"); if (section) { setStep(Number(section.dataset.inventoryStep)); requestAnimationFrame(() => { const control = target instanceof HTMLSelectElement ? target.nextElementSibling?.querySelector<HTMLInputElement>("input") : target; control?.focus(); }); } }} onSubmit={event => { event.preventDefault(); if (busy) return; if (step !== reviewStep) return next(); if (validate(form.current)) onSubmit(event); }}>
    <ol aria-label="Etapas del registro" className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr">{[...steps.map(row => row.title), "Revisar y confirmar"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${step === index ? "border-apex bg-apex/10 font-semibold text-apex" : "border-line bg-surface-muted text-content-muted"}`}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">{index < step ? <Check size={13} /> : index + 1}</span>{label}</li>)}</ol>
    {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    {steps.map((row, index) => <fieldset key={row.title} disabled={busy} hidden={step !== index} data-inventory-step={index} className="space-y-4"><div><h3 className="text-lg font-semibold text-content-strong">{row.title}</h3><p className="mt-1 text-sm text-content-muted">{row.description}</p></div>{row.content}</fieldset>)}
    {step === reviewStep ? <section className="space-y-3" aria-label="Revisión del registro"><div><h3 className="text-lg font-semibold">Revise antes de confirmar</h3><p className="text-sm text-content-muted">Compruebe los datos. Puede volver a los pasos anteriores para corregirlos.</p></div>{review || <dl className="grid gap-3 sm:grid-cols-2">{values.map((row, index) => <div key={index} className="rounded-lg border border-line bg-surface-muted p-3"><dt className="text-xs text-content-muted">{row.label}</dt><dd className="mt-1 break-words text-sm font-semibold">{row.value}</dd></div>)}</dl>}</section> : null}
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface pt-4 pb-1"><button type="button" disabled={busy} className={control} onClick={onCancel}>Cancelar</button><div className="flex gap-2">{step ? <button type="button" disabled={busy} className={control} onClick={() => setStep(current => current - 1)}>Anterior</button> : null}{step < reviewStep ? <button type="button" disabled={busy} className={`${control} inline-flex items-center gap-2 bg-apex text-white`} onClick={next}>Continuar <ChevronRight size={15} /></button> : <><button type="submit" disabled={busy} className={`${control} bg-apex text-white`}>{busy ? "Procesando…" : submitLabel}</button>{extraAction ? <button type="button" disabled={busy} className={control} onClick={() => { if (validate(form.current)) extraAction.onClick(); }}>{extraAction.label}</button> : null}</>}</div></div>
  </form>;
}
