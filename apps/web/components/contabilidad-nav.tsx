"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/contabilidad", label: "Resumen" },
  { href: "/dashboard/contabilidad/plan-cuentas", label: "Plan de cuentas" },
  { href: "/dashboard/contabilidad/asientos", label: "Asientos" },
  { href: "/dashboard/contabilidad/cuentas-por-pagar", label: "Cuentas por pagar" },
  { href: "/dashboard/contabilidad/terceros", label: "Terceros" },
  { href: "/dashboard/contabilidad/retenciones", label: "Retenciones" },
  { href: "/dashboard/contabilidad/estructura", label: "Estructura" },
  { href: "/dashboard/contabilidad/reportes", label: "Reportes" }
];

export function ContabilidadNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} className={`rounded-md border px-3 py-2 text-sm ${active ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700"}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
