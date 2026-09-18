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
  return <span className={twMerge("inline-flex min-h-6 items-center rounded-control px-2 text-xs font-semibold", tones[tone], className)} {...props} />;
}

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children: ReactNode; className?: string }) {
  return <div className={twMerge("rounded-card border p-3 text-sm", tones[tone], className)} role={tone === "error" ? "alert" : "status"}>
    {title ? <p className="font-semibold">{title}</p> : null}
    <div className={title ? "mt-1" : ""}>{children}</div>
  </div>;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={twMerge("animate-pulse rounded-md bg-surface-muted", className)} {...props} />;
}

export function EmptyState({ icon, title, description, detail, primaryAction, secondaryAction, action, className }: {
  icon?: ReactNode;
  title: string;
  description?: string;
  detail?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const copy = description || detail;
  return <div className={twMerge("grid min-h-48 place-items-center border-y border-line px-5 py-10 text-center", className)}>
    <div className="max-w-md">
      {icon ? <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-apex/10 text-apex">{icon}</div> : null}
      <p className="font-semibold text-content-strong">{title}</p>
      {copy ? <p className="mt-1 text-sm leading-6 text-content-muted">{copy}</p> : null}
      {primaryAction || secondaryAction || action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{primaryAction || action}{secondaryAction}</div> : null}
    </div>
  </div>;
}
