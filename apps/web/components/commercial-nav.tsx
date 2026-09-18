"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/gestion-comercial", label: "Resumen" },
  { href: "/dashboard/gestion-comercial/mi-dia", label: "Mi día" },
  { href: "/dashboard/gestion-comercial/agenda", label: "Agenda" },
  { href: "/dashboard/gestion-comercial/maestros?seccion=customers", label: "Clientes", section: "customers" },
  { href: "/dashboard/gestion-comercial/maestros", label: "Maestros" },
  { href: "/dashboard/gestion-comercial/presupuestos", label: "Presupuestos" },
  { href: "/dashboard/gestion-comercial/cotizaciones", label: "Cotizaciones" },
  { href: "/dashboard/gestion-comercial/pedidos", label: "Pedidos" },
  { href: "/dashboard/gestion-comercial/reportes", label: "Reportes" }
];

export function CommercialNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <nav aria-label="Navegación de Gestión Comercial" className="apex-section-card mb-4 overflow-x-auto p-2">
      <div className="flex min-w-max gap-1">
        {ITEMS.map((item) => {
          const itemPath = item.href.split("?")[0];
          let active = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
          if (item.href === "/dashboard/gestion-comercial") active = pathname === item.href;
          if (item.section) active = pathname === itemPath && searchParams.get("seccion") === item.section;
          if (itemPath === "/dashboard/gestion-comercial/maestros" && !item.section) active = pathname === itemPath && searchParams.get("seccion") !== "customers";
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${active ? "border-apex bg-apex/10 text-apex" : "border-transparent text-neutral-700 hover:border-line hover:bg-paper"}`}
              href={item.href}
              key={`${item.href}-${item.label}`}
              prefetch={false}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
