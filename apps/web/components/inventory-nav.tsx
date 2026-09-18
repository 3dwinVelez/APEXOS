"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { twMerge } from "tailwind-merge";

const GROUPS = [
  { id: "resumen", label: "Resumen", href: "/dashboard/inventario", items: [{ href: "/dashboard/inventario", label: "Resumen" }] },
  {
    id: "maestros",
    label: "Maestros",
    href: "/dashboard/inventario/productos",
    items: [
      { href: "/dashboard/inventario/productos", label: "Productos" },
      { href: "/dashboard/inventario/productos/nuevo", label: "Nuevo producto" },
      { href: "/dashboard/inventario/familias", label: "Familias" },
      { href: "/dashboard/inventario/clasificaciones", label: "Clasificación" },
      { href: "/dashboard/inventario/bodegas", label: "Bodegas" }
    ]
  },
  {
    id: "existencias",
    label: "Existencias",
    href: "/dashboard/inventario/stock",
    items: [
      { href: "/dashboard/inventario/stock", label: "Stock" },
      { href: "/dashboard/inventario/reportes/kardex", label: "Kardex" },
      { href: "/dashboard/inventario/reportes/costos", label: "Costos" }
    ]
  },
  {
    id: "movimientos",
    label: "Movimientos",
    href: "/dashboard/inventario/traslados",
    items: [
      { href: "/dashboard/inventario/traslados", label: "Traslados" },
      { href: "/dashboard/inventario/ajustes", label: "Ajustes" },
      { href: "/dashboard/inventario/cargue-inicial", label: "Cargue inicial" }
    ]
  }
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard/inventario") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function InventoryNav() {
  const pathname = usePathname();
  const activeGroup = GROUPS.find((group) => group.items.some((item) => isActive(pathname, item.href))) || GROUPS[0];

  return (
    <nav aria-label="Navegación de inventario" className="mb-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-4" role="tablist" aria-label="Dominios de inventario">
        {GROUPS.map((group) => {
          const active = group.id === activeGroup.id;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              aria-selected={active}
              className={twMerge(
                "inline-flex h-10 items-center justify-center rounded-control border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex",
                active ? "border-apex bg-apex/10 text-apex" : "border-line bg-surface text-content-body hover:border-apex hover:text-content-strong"
              )}
              href={group.href}
              key={group.id}
              role="tab"
            >
              {group.label}
            </Link>
          );
        })}
      </div>

      <details className="group rounded-card border border-line bg-surface p-2 sm:hidden" open>
        <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1 text-sm font-semibold text-content-strong">
          {activeGroup.label}
          <ChevronDown className="transition group-open:rotate-180" size={16} />
        </summary>
        <InventorySubnav pathname={pathname} items={activeGroup.items} />
      </details>

      <div className="hidden rounded-card border border-line bg-surface p-2 sm:block">
        <InventorySubnav pathname={pathname} items={activeGroup.items} />
      </div>
    </nav>
  );
}

function InventorySubnav({ pathname, items }: { pathname: string; items: ReadonlyArray<{ href: string; label: string }> }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Funciones del dominio activo">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={twMerge(
              "rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex",
              active ? "bg-apex text-white" : "text-content-muted hover:bg-paper hover:text-content-strong"
            )}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
