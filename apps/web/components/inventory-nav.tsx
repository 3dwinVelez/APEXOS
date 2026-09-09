"use client";

import { usePathname } from "next/navigation";
import { TabLink, TabsList } from "@/components/ui/tabs";

const ITEMS = [
  { href: "/dashboard/inventario", label: "Resumen" },
  { href: "/dashboard/inventario/productos/nuevo", label: "Nuevo producto" },
  { href: "/dashboard/inventario/productos", label: "Lista de productos" },
  { href: "/dashboard/inventario/familias", label: "Familias" },
  { href: "/dashboard/inventario/clasificaciones", label: "Clasificacion" },
  { href: "/dashboard/inventario/bodegas", label: "Bodegas" },
  { href: "/dashboard/inventario/wms", label: "WMS" },
  { href: "/dashboard/inventario/stock", label: "Stock" },
  { href: "/dashboard/inventario/cargue-inicial", label: "Cargue inicial" },
  { href: "/dashboard/inventario/traslados", label: "Traslados" },
  { href: "/dashboard/inventario/ajustes", label: "Ajustes" },
  { href: "/dashboard/inventario/reportes/kardex", label: "Kardex" },
  { href: "/dashboard/inventario/reportes/costos", label: "Costos" }
];

export function InventoryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación de inventario" className="mb-4">
      <TabsList label="Secciones de inventario">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <TabLink active={active} href={item.href} key={item.href}>{item.label}</TabLink>
        );
      })}</TabsList>
    </nav>
  );
}

