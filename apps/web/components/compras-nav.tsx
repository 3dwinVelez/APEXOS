"use client";

import { usePathname } from "next/navigation";
import { TabLink, TabsList } from "@/components/ui/tabs";

const ITEMS = [
  { href: "/dashboard/compras", label: "Resumen" },
  { href: "/dashboard/compras/proveedores", label: "Proveedores" },
  { href: "/dashboard/compras/ordenes/nueva", label: "Nueva OC" },
  { href: "/dashboard/compras/ordenes/recibir", label: "Recibir OC" },
  { href: "/dashboard/compras/facturas", label: "Facturas" },
  { href: "/dashboard/compras/importaciones", label: "Importaciones" },
  { href: "/dashboard/compras/reportes/ordenes", label: "Reporte de OC" }
  ,{ href: "/dashboard/compras/reportes/facturas", label: "Reporte de facturas" }
];

export function ComprasNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación de compras" className="mb-4">
      <TabsList label="Secciones de compras">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <TabLink active={active} href={item.href} key={item.href}>{item.label}</TabLink>
        );
      })}</TabsList>
    </nav>
  );
}

