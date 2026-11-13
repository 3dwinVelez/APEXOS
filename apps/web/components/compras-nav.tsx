"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { twMerge } from "tailwind-merge";

const GROUPS = [
 {id:"resumen",label:"Resumen",href:"/dashboard/compras",items:[{href:"/dashboard/compras",label:"Resumen"}]},
 {id:"proveedores",label:"Proveedores",href:"/dashboard/compras/proveedores",items:[{href:"/dashboard/compras/proveedores",label:"Proveedores"}]},
 {id:"operacion",label:"Operación",href:"/dashboard/compras/ordenes",items:[{href:"/dashboard/compras/ordenes",label:"Órdenes"},{href:"/dashboard/compras/ordenes/recibir",label:"Recepciones"},{href:"/dashboard/compras/facturas",label:"Facturas"},{href:"/dashboard/compras/importaciones",label:"Importaciones"}]},
 {id:"reportes",label:"Reportes",href:"/dashboard/compras/reportes/ordenes",items:[{href:"/dashboard/compras/reportes/ordenes",label:"Órdenes"},{href:"/dashboard/compras/reportes/facturas",label:"Facturas"}]}
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard/compras") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ComprasNav() {
  const pathname = usePathname();
  const activeGroup = GROUPS.find((group) => group.items.some((item) => isActive(pathname, item.href))) || GROUPS[0];

  return (
    <nav aria-label="Navegación de compras" className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Dominios de compras">
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

      {activeGroup.items.length > 1 ? <><details className="group rounded-card border border-line bg-surface p-2 sm:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1 text-sm font-semibold text-content-strong">
          {activeGroup.label}
          <ChevronDown className="transition group-open:rotate-180" size={16} />
        </summary>
        <PurchaseSubnav pathname={pathname} items={activeGroup.items} />
      </details>

      <div className="hidden rounded-card border border-line bg-surface p-2 sm:block">
        <PurchaseSubnav pathname={pathname} items={activeGroup.items} />
      </div></> : null}
    </nav>
  );
}

function PurchaseSubnav({ pathname, items }: { pathname: string; items: ReadonlyArray<{ href: string; label: string }> }) {
  const activeHref = items.filter(item => isActive(pathname, item.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Funciones del dominio activo">
      {items.map((item) => {
        const active = item.href === activeHref;
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
