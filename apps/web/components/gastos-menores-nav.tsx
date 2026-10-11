"use client";

import { usePathname } from "next/navigation";
import { TabLink, TabsList } from "@/components/ui/tabs";

const ITEMS = [
  { href: "/dashboard/gastos-menores", label: "Inicio" },
  { href: "/dashboard/gastos-menores/conceptos", label: "Conceptos" },
  { href: "/dashboard/gastos-menores/cajas", label: "Cajas" },
  { href: "/dashboard/gastos-menores/anticipos", label: "Anticipos" },
  { href: "/dashboard/gastos-menores/gastos", label: "Gastos" },
  { href: "/dashboard/gastos-menores/reportes", label: "Reportes" }
];

export function GastosMenoresNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación de gastos menores" className="mb-4">
      <TabsList label="Secciones de gastos menores">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <TabLink active={active} href={item.href} key={item.href}>{item.label}</TabLink>
          );
        })}
      </TabsList>
    </nav>
  );
}
