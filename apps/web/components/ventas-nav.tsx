"use client";

import { usePathname } from "next/navigation";
import { TabLink, TabsList } from "@/components/ui/tabs";

const ITEMS = [
  { href: "/dashboard/ventas", label: "Resumen" },
  { href: "/dashboard/ventas/clientes", label: "Clientes" },
  { href: "/dashboard/ventas/ordenes/nueva", label: "Nueva OV" },
  { href: "/dashboard/ventas/ordenes", label: "Órdenes" },
  { href: "/dashboard/ventas/facturas/nueva", label: "Nueva factura" },
  { href: "/dashboard/ventas/facturas", label: "Facturas" },
  { href: "/dashboard/ventas/precios", label: "Precios" },
  { href: "/dashboard/ventas/reportes", label: "Reportes" }
];

export function VentasNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación de ventas" className="mb-4">
      <TabsList label="Secciones de ventas">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <TabLink active={active} href={item.href} key={item.href}>{item.label}</TabLink>
        );
      })}</TabsList>
    </nav>
  );
}

