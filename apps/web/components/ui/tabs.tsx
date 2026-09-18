"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function TabsList({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={twMerge("relative -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]", className)}><div aria-label={label} className="flex w-max min-w-full gap-2" role="tablist">{children}</div></div>;
}

export function TabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link aria-current={active ? "page" : undefined} className={twMerge("shrink-0 rounded-control border px-3 py-2 text-sm font-medium transition-colors", active ? "border-apex bg-apex/10 text-apex" : "border-line bg-surface text-content-body hover:border-apex hover:text-content-strong")} href={href} role="tab" aria-selected={active}>{children}</Link>;
}

export function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button aria-selected={active} className={twMerge("shrink-0 rounded-control border px-3 py-2 text-sm font-medium transition-colors", active ? "border-apex bg-apex/10 text-apex" : "border-line bg-surface text-content-body hover:border-apex")} onClick={onClick} role="tab" type="button">{children}</button>;
}
