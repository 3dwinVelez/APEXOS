"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/inventario", label: "Resumen" },
  { href: "/dashboard/inventario/productos/nuevo", label: "Productos" },
  { href: "/dashboard/inventario/productos", label: "Lista de productos" },
  { href: "/dashboard/inventario/familias", label: "Familias" },
  { href: "/dashboard/inventario/bodegas", label: "Bodegas" },
  { href: "/dashboard/inventario/wms", label: "WMS" },
  { href: "/dashboard/inventario/stock", label: "Stock" },
  { href: "/dashboard/inventario/cargue-inicial", label: "Cargue inicial" },
  { href: "/dashboard/inventario/traslados", label: "Traslados" },
  { href: "/dashboard/inventario/reportes", label: "Reportes" }
];

export function InventoryNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            className={`rounded-md border px-3 py-2 text-sm ${active ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700"}`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

