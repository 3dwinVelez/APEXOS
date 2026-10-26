"use client";

import { useEffect, useState, type ReactNode } from "react";
import { hasStoredRolePermission } from "@/lib/rolePermissions";

// Utilidades compartidas del modulo Comercio (M-30). Los estilos reutilizan las clases
// globales de la plataforma (apex-section-card, control, btn-primary) para que el modulo
// se vea igual que Gastos Menores y demas modulos en escritorio y movil.

export const money = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value) || 0);

export function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

export type ComercioAccess = { ready: boolean; canRead: boolean; canWrite: boolean; canApprove: boolean };

export function useComercioAccess(): ComercioAccess {
  const [access, setAccess] = useState<ComercioAccess>({ ready: false, canRead: false, canWrite: false, canApprove: false });
  useEffect(() => {
    setAccess({
      ready: true,
      canRead: hasStoredRolePermission("comercio", "read"),
      canWrite: hasStoredRolePermission("comercio", "write"),
      canApprove: hasStoredRolePermission("comercio", "approve")
    });
  }, []);
  return access;
}

export function AccessDenied() {
  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
      <h1 className="text-xl font-semibold text-amber-950">Comercio no disponible para este perfil</h1>
      <p className="mt-2 text-sm text-amber-900">
        Este modulo es autonomo y usa sus propios permisos (Comercio). Solicita acceso de lectura al rol administrador.
      </p>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

export function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: ReactNode }) {
  const classes = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    bad: "border-red-200 bg-red-50 text-red-700",
    muted: "border-line bg-neutral-100 text-neutral-600"
  }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}>{children}</span>;
}

export function ModuleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="apex-section-card p-4">
      <p className="text-sm font-medium text-apex">M-30 · Comercial</p>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
    </header>
  );
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
