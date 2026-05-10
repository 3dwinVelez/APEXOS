import { MODULES } from "@/lib/modules";
import { Home } from "lucide-react";
import Link from "next/link";

export function Sidebar() {
  const items = MODULES.map((module) => ({
    href: `/dashboard/${module.slug}`,
    label: module.name,
    icon: module.icon
  }));

  return (
    <aside className="hidden h-screen w-72 overflow-y-auto border-r border-line bg-white px-4 py-5 md:block">
      <div className="mb-8">
        <p className="text-lg font-semibold tracking-normal">APEX OS</p>
        <p className="text-sm text-neutral-500">Sistema Operativo Empresarial</p>
      </div>
      <nav className="space-y-1">
        <Link className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-neutral-700 hover:bg-paper" href="/dashboard">
          <Home size={18} />
          Inicio
        </Link>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-neutral-700 hover:bg-paper"
              href={item.href}
              key={item.href}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
