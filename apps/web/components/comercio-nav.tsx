"use client";

import { usePathname } from "next/navigation";
import { TabLink, TabsList } from "@/components/ui/tabs";

const ITEMS = [
  { href: "/dashboard/comercio", label: "Inicio" },
  { href: "/dashboard/comercio/productos", label: "Productos" },
  { href: "/dashboard/comercio/vender", label: "Vender" },
  { href: "/dashboard/comercio/ventas", label: "Ventas" },
  { href: "/dashboard/comercio/cartera", label: "Cartera" },
  { href: "/dashboard/comercio/clientes", label: "Clientes" },
  { href: "/dashboard/comercio/compras", label: "Compras" },
  { href: "/dashboard/comercio/gastos", label: "Ingresos y egresos" },
  { href: "/dashboard/comercio/reportes", label: "Reportes" },
  { href: "/dashboard/comercio/configuracion", label: "Configuracion" }
];

export function ComercioNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegacion de Comercio" className="mb-4">
      <TabsList label="Secciones de Comercio">
        {ITEMS.map((item) => (
          <TabLink active={pathname === item.href} href={item.href} key={item.href}>{item.label}</TabLink>
        ))}
      </TabsList>
    </nav>
  );
}
