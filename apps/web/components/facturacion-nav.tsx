"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/facturacion", label: "Resumen" },
  { href: "/dashboard/facturacion/emitir", label: "Emitir factura" },
  { href: "/dashboard/facturacion/documentos", label: "Documentos" }
];

export function FacturacionNav() {
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

