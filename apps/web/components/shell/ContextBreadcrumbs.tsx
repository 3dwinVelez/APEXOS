"use client";

import { MODULES_BY_SLUG } from "@/lib/modules";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const labels: Record<string, string> = { dashboard: "Inicio", productos: "Productos", nuevo: "Nuevo", ordenes: "Órdenes", stock: "Stock", reportes: "Reportes", configuracion: "Configuración", maestros: "Maestros" };

export function ContextBreadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  return (
    <nav aria-label="Ruta de navegación" className="mb-3 flex min-w-0 items-center gap-1 overflow-x-auto text-xs text-content-muted">
      <Link aria-label="Inicio" className="rounded-control p-1 hover:bg-surface-muted hover:text-content-strong" href="/dashboard"><Home size={14} /></Link>
      {parts.slice(1).map((part, index) => {
        const href = `/${parts.slice(0, index + 2).join("/")}`;
        const moduleName = MODULES_BY_SLUG[part]?.name;
        const label = moduleName || labels[part] || part.replace(/-/g, " ").replace(/^./, (value) => value.toUpperCase());
        const current = index === parts.length - 2;
        return <span className="flex shrink-0 items-center gap-1" key={href}><ChevronRight size={12} /><Link aria-current={current ? "page" : undefined} className={current ? "font-semibold text-content-strong" : "hover:text-content-strong"} href={href}>{label}</Link></span>;
      })}
    </nav>
  );
}
