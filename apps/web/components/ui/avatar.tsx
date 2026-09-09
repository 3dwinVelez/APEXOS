import type { HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Avatar({ name, className, ...props }: HTMLAttributes<HTMLSpanElement> & { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AP";
  return <span aria-label={name} className={twMerge("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-apex/15 text-sm font-semibold text-apex", className)} role="img" {...props}>{initials}</span>;
}
