"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/contabilidad", label: "Resumen" },
  { href: "/dashboard/contabilidad/plan-cuentas", label: "Plan de cuentas" },
  { href: "/dashboard/contabilidad/asientos", label: "Asientos" },
  { href: "/dashboard/contabilidad/importar-saldos-iniciales", label: "Saldos iniciales" },
  { href: "/dashboard/contabilidad/facturas-recibidas", label: "Facturas recibidas" },
  { href: "/dashboard/contabilidad/cuentas-por-pagar", label: "Cuentas por pagar" },
  { href: "/dashboard/cxc/documentos", label: "Cuentas por cobrar" },
  { href: "/dashboard/tesoreria", label: "Tesorería" },
  { href: "/dashboard/contabilidad/terceros", label: "Terceros" },
  { href: "/dashboard/contabilidad/iva", label: "IVA" },
  { href: "/dashboard/contabilidad/retenciones", label: "Retenciones" },
  { href: "/dashboard/contabilidad/estructura", label: "Estructura" },
  { href: "/dashboard/contabilidad/reportes", label: "Reportes" },
  { href: "/dashboard/contabilidad/pyg", label: "PYG" }
];

export function ContabilidadNav() {
  const pathname = usePathname();
  const activeHref = ITEMS.reduce((best, item) => {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return matches && item.href.length > best.length ? item.href : best;
  }, "");
  return (
    <nav aria-label="Navegación de contabilidad" className="mb-4 flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link key={item.href} href={item.href} className={`rounded-md border px-3 py-2 text-sm ${active ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700"}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
