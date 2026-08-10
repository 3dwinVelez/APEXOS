"use client";

import { UserSessionBadge } from "@/components/shell/UserSessionBadge";
import { Clock3, Home, MapPinned, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/dashboard/servicios", label: "Servicios", icon: Wrench },
  { href: "/dashboard/talento-humano/marcacion", label: "Marcar", icon: Clock3 },
  { href: "/dashboard/talento-humano/mapa", label: "Mapa", icon: MapPinned }
];

export function MobileNav() {
  const pathname = usePathname();
  const operationalFlow = pathname.startsWith("/dashboard/servicios") ||
    pathname === "/dashboard/talento-humano/marcacion" ||
    pathname.startsWith("/dashboard/talento-humano/mapa") ||
    pathname.startsWith("/dashboard/talento-humano/rutas");
  if (operationalFlow) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 md:hidden" aria-label="Navegacion movil">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          return (
            <Link className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-semibold ${active ? "bg-apex text-white" : "text-neutral-600 active:bg-paper"}`} href={item.href} key={item.href} prefetch={false}>
              <Icon size={18} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
        <UserSessionBadge compact mobile />
      </div>
    </nav>
  );
}
