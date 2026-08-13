import type { HTMLAttributes, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type Tone = "neutral" | "success" | "warning" | "error" | "info";
const tones: Record<Tone, string> = {
  neutral: "border-line bg-surface-muted text-content-body",
  success: "border-success/30 bg-success/10 text-content-strong",
  warning: "border-warning/30 bg-warning/10 text-content-strong",
  error: "border-error/30 bg-error/10 text-content-strong",
  info: "border-info/30 bg-info/10 text-content-strong"
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={twMerge("inline-flex min-h-6 items-center rounded px-2 text-xs font-semibold", tones[tone], className)} {...props} />;
}

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children: ReactNode; className?: string }) {
  return <div className={twMerge("rounded-md border p-3 text-sm", tones[tone], className)} role={tone === "error" ? "alert" : "status"}>
    {title ? <p className="font-semibold">{title}</p> : null}
    <div className={title ? "mt-1" : ""}>{children}</div>
  </div>;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={twMerge("animate-pulse rounded-md bg-surface-muted", className)} {...props} />;
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="grid min-h-40 place-items-center border-y border-line px-4 py-8 text-center">
    <div><p className="font-semibold text-content-strong">{title}</p>{detail ? <p className="mt-1 text-sm text-content-muted">{detail}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div>
  </div>;
}
