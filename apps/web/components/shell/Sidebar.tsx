"use client";

import { isSupabaseSession, loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { UserSessionBadge } from "@/components/shell/UserSessionBadge";
import { ChevronLeft, ChevronRight, Home, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [technicianMode, setTechnicianMode] = useState(false);
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem("apex_sidebar_collapsed");
    setTechnicianMode(localStorage.getItem("role_name")?.toLowerCase() === "tecnico");
    if (saved === "1") setCollapsed(true);
    if (localStorage.getItem("token") || isSupabaseSession()) {
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
    slug: module.slug,
    label: module.name,
    icon: module.icon,
    enabled: access.loading ? true : access.bySlug[module.slug] === true
  }));
  const activeItems = items
    .filter((item) => item.enabled)
    .sort((a, b) => (access.orderBySlug?.[a.slug] ?? 999) - (access.orderBySlug?.[b.slug] ?? 999));
  const lockedItems = technicianMode ? [] : items.filter((item) => !item.enabled);

  function linkClass(active: boolean) {
    return `flex h-10 items-center gap-3 rounded-md px-3 text-sm transition ${active ? "bg-apex text-white shadow-sm" : "text-neutral-700 hover:bg-paper"}`;
  }

  function sectionLabel(label: string) {
    if (collapsed) return null;
    return <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>;
  }

  function renderItem(item: (typeof items)[number]) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return item.enabled ? (
      <Link
        className={linkClass(active)}
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
  }

  return (
    <aside className={`sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-white py-4 transition-[width,padding] duration-200 md:flex md:flex-col ${collapsed ? "w-16 px-2" : "w-72 px-4"}`}>
      <div className="mb-4 flex shrink-0 items-center justify-between">
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
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {!technicianMode ? <Link className={linkClass(pathname === "/dashboard")} href="/dashboard" title="Inicio">
          <Home size={18} />
          {!collapsed ? "Inicio" : null}
        </Link> : null}
        {sectionLabel("Activos")}
        {activeItems.map(renderItem)}
        {lockedItems.length ? (
          <>
            {!collapsed ? <div className="my-3 border-t border-line" /> : null}
            {sectionLabel("Bloqueados")}
            {lockedItems.map(renderItem)}
          </>
        ) : null}
      </nav>
      {!collapsed ? (
        <div className="mt-3 shrink-0">
          <UserSessionBadge />
        </div>
      ) : (
        <div className="mt-3 shrink-0">
          <UserSessionBadge compact />
        </div>
      )}
    </aside>
  );
}
