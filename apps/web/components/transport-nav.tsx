"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/transporte", label: "Flota" },
  { href: "/dashboard/transporte/operacion", label: "Torre y viajes" },
  { href: "/dashboard/transporte/monitoreo", label: "Monitoreo en vivo" },
  { href: "/dashboard/transporte/notificaciones", label: "Notificaciones" },
  { href: "/dashboard/transporte/pod", label: "Pruebas de entrega" },
  { href: "/dashboard/transporte/ordenes", label: "Ordenes" },
  { href: "/dashboard/transporte/planeacion", label: "Planeador" },
  { href: "/dashboard/transporte/tarifas", label: "Tarifarios" },
  { href: "/dashboard/transporte/maestros", label: "Maestros TMS" }
  ,{ href: "/dashboard/transporte/configuracion", label: "Configuracion" }
];

export function TransportNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegacion de transporte" className="mb-4 flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return <Link className={`rounded-md border px-3 py-2 text-sm ${active ? "border-apex bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-700"}`} href={item.href} key={item.href}>{item.label}</Link>;
      })}
    </nav>
  );
}
