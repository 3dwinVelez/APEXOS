"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/compras", label: "Resumen" },
  { href: "/dashboard/compras/proveedores", label: "Proveedores" },
  { href: "/dashboard/compras/ordenes/nueva", label: "Nueva OC" },
  { href: "/dashboard/compras/ordenes/recibir", label: "Recibir OC" },
  { href: "/dashboard/compras/facturas", label: "Facturas" }
];

export function ComprasNav() {
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

