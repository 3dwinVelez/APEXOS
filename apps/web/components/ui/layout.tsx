import type { HTMLAttributes, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function FormGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge("grid gap-4 md:grid-cols-2", className)} {...props} />;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-card border border-line bg-surface shadow-card"><header className="border-b border-line px-4 py-3"><h2 className="font-semibold text-content-strong">{title}</h2>{description ? <p className="mt-1 text-sm text-content-muted">{description}</p> : null}</header><div className="p-4">{children}</div></section>;
}

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return <ol aria-label="Progreso del formulario" className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr">{steps.map((step, index) => <li aria-current={index === current ? "step" : undefined} className={twMerge("rounded-control border px-3 py-2 text-sm", index === current ? "border-apex bg-apex/10 font-semibold text-apex" : index < current ? "border-success/40 bg-success/10 text-content-strong" : "border-line bg-surface text-content-muted")} key={step}><span className="mr-2 font-mono text-xs">{index + 1}</span>{step}</li>)}</ol>;
}
