"use client";

import { loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { ChevronLeft, ChevronRight, Home, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });

  useEffect(() => {
    const saved = localStorage.getItem("apex_sidebar_collapsed");
    if (saved === "1") setCollapsed(true);
    if (localStorage.getItem("auth_provider") === "supabase") {
      loadModuleAccess(MODULES).then(setAccess).catch(() => setAccess({ loading: false, isPlatformAdmin: false, bySlug: {} }));
    } else {
      setAccess({ loading: false, isPlatformAdmin: false, bySlug: Object.fromEntries(MODULES.map((module) => [module.slug, true])) });
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("apex_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  const items = MODULES.map((module) => ({
    href: `/dashboard/${module.slug}`,
    label: module.name,
    icon: module.icon,
    enabled: access.loading ? true : access.bySlug[module.slug] === true
  }));

  return (
    <aside className={`hidden h-screen overflow-y-auto border-r border-line bg-white py-5 transition-all md:block ${collapsed ? "w-16 px-2" : "w-72 px-4"}`}>
      <div className="mb-6 flex items-center justify-between">
        <div className={collapsed ? "hidden" : "block"}>
          <p className="text-lg font-semibold tracking-normal">APEX OS</p>
          <p className="text-sm text-neutral-500">Sistema Operativo Empresarial</p>
        </div>
        <button
          aria-label={collapsed ? "Expandir menú" : "Ocultar menú"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-paper"
          onClick={toggle}
          type="button"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <nav className="space-y-1">
        <Link className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-neutral-700 hover:bg-paper" href="/dashboard" title="Inicio">
          <Home size={18} />
          {!collapsed ? "Inicio" : null}
        </Link>
        {items.map((item) => {
          const Icon = item.icon;
          return item.enabled ? (
            <Link
              className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-neutral-700 hover:bg-paper"
              href={item.href}
              key={item.href}
              title={item.label}
            >
              <Icon size={18} />
              {!collapsed ? item.label : null}
            </Link>
          ) : (
            <div
              className="flex h-10 cursor-not-allowed items-center gap-3 rounded-md px-3 text-sm text-amber-700/80"
              key={item.href}
              title={`${item.label} bloqueado`}
            >
              <Icon size={18} />
              {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
              <LockKeyhole size={15} />
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
