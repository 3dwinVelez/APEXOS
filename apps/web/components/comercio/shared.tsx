"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { formatRegionalMoney } from "@/lib/regionalFormat";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";

// Primitivas compartidas del modulo Comercio (M-30). Usan los tokens de la plataforma
// (surface, line, content-*) para que el modulo se lea igual que Gastos Menores o
// Transporte en tema claro y oscuro, sin colores literales que el tema no puede invertir.

export const money = (value: number) => formatRegionalMoney(Number(value) || 0);

export function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

/**
 * Buscador del modulo: ignora acentos y mayusculas y exige que TODOS los terminos
 * aparezcan en el registro, asi "cafe 250" encuentra "Café serrano 250 g".
 */
export function normalized(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function matchesQuery(query: string, ...fields: Array<string | number | null | undefined>) {
  const needle = normalized(query);
  if (!needle) return true;
  const haystack = fields.map(normalized).join(" ");
  return needle.split(/\s+/).every((term) => haystack.includes(term));
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

/**
 * Estado comun mientras se valida el permiso y cuando el perfil no tiene Comercio.
 * Cada pantalla lo usa al inicio del render para no repetir su propio bloqueo.
 */
export function comercioGate(access: ComercioAccess): ReactNode | null {
  if (!access.ready) {
    return (
      <div aria-busy="true" aria-label="Validando permisos de Comercio" className="apex-workspace-shell space-y-4">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-12 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    );
  }
  if (!access.canRead) return <AccessDenied />;
  return null;
}

export function AccessDenied() {
  return (
    <div className="apex-workspace-shell">
      <section className="apex-section-card">
        <EmptyState
          description="Este modulo es autonomo y usa sus propios permisos (Comercio). Solicita acceso de lectura al rol administrador."
          icon={<ShieldOff size={22} />}
          title="Comercio no disponible para este perfil"
        />
      </section>
    </div>
  );
}

export function Field({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-content-strong">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs font-normal text-content-muted">{hint}</span> : null}
    </label>
  );
}

export function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-content-body">
      <input checked={checked} className="h-4 w-4 rounded border-line text-apex focus:ring-apex/30" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

const pillTones = { ok: "success", warn: "warning", bad: "error", muted: "neutral" } as const;

export function StatusPill({ children, tone }: { children: ReactNode; tone: keyof typeof pillTones }) {
  return <Badge tone={pillTones[tone]}>{children}</Badge>;
}

export function ModuleHeader({ actions, eyebrow = "M-30 · Comercial", subtitle, title }: { actions?: ReactNode; eyebrow?: string; subtitle: string; title: string }) {
  return (
    <header className="apex-section-card flex flex-wrap items-end justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-apex">{eyebrow}</p>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-content-body">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Avisos de la pantalla: el error manda y usa role="alert"; el confirmacion es transitorio. */
export function ComercioMessages({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {error ? <Alert tone="error" title="No fue posible completar la accion">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
    </>
  );
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
