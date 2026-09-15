"use client";

import { isSupabaseSession, loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { groupModules } from "@/lib/operationalWorkspace";
import { UserSessionBadge } from "@/components/shell/UserSessionBadge";
import { ChevronLeft, ChevronRight, Home, LockKeyhole, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [technicianMode, setTechnicianMode] = useState(false);
  const [moduleQuery, setModuleQuery] = useState("");
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

  const normalizedQuery = normalizeSearch(moduleQuery);
  const items = MODULES.map((module) => ({
    href: `/dashboard/${module.slug}`,
    slug: module.slug,
    label: module.name,
    icon: module.icon,
    enabled: access.loading ? true : access.bySlug[module.slug] === true,
    searchText: normalizeSearch([module.name, module.slug, module.area, module.summary, ...module.capabilities, ...module.nextActions].join(" "))
  }));
  const orderedItems = items
    .filter((item) => item.enabled && (!normalizedQuery || queryMatches(item.searchText, normalizedQuery)))
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return (access.orderBySlug?.[a.slug] ?? 999) - (access.orderBySlug?.[b.slug] ?? 999);
    });
  const groupedItems = groupModules(orderedItems.map((item) => MODULES.find((module) => module.slug === item.slug)!).filter(Boolean))
    .map((group) => ({ ...group, items: group.items.map((module) => orderedItems.find((item) => item.slug === module.slug)!).filter(Boolean) }));

  function linkClass(active: boolean, enabled = true) {
    if (!enabled) return "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-neutral-400 opacity-75";
    return `flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex ${active ? "bg-apex text-white" : "text-neutral-700 hover:bg-paper"}`;
  }

  function renderItem(item: (typeof items)[number]) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!item.enabled) {
      return (
        <SidebarTooltip collapsed={collapsed} key={item.href} label={`${item.label} bloqueado por suscripción o permisos`}>
        <button
          aria-label={collapsed ? `${item.label} bloqueado por suscripción o permisos` : undefined}
          aria-disabled="true"
          className={linkClass(false, false)}
          disabled
          type="button"
        >
          <Icon size={18} />
          {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
          {!collapsed ? <LockKeyhole className="shrink-0" size={14} /> : null}
        </button>
        </SidebarTooltip>
      );
    }
    return (
      <SidebarTooltip collapsed={collapsed} key={item.href} label={item.label}>
      <Link
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={linkClass(active, item.enabled)}
        href={item.href}
        prefetch={false}
      >
        <Icon size={18} />
        {!collapsed ? item.label : null}
      </Link>
      </SidebarTooltip>
    );
  }

  return (
    <aside className={`sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-white py-2 transition-[width,padding] duration-150 md:flex md:flex-col ${collapsed ? "w-14 px-2" : "w-56 px-2"}`}>
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <div className={collapsed ? "hidden" : "block"}>
          <p className="text-sm font-semibold tracking-normal">APEX OS</p>
        </div>
        <button
          aria-label={collapsed ? "Expandir menú" : "Ocultar menú"}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex"
          onClick={toggle}
          type="button"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {!collapsed ? (
          <label className="relative mb-2 block">
            <span className="sr-only">Buscar módulos y funciones</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input
                className="h-9 w-full rounded-md border border-line bg-paper pl-9 pr-9 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-apex focus:bg-white focus-visible:ring-2 focus-visible:ring-apex/40"
              onChange={(event) => setModuleQuery(event.target.value)}
              placeholder="Buscar módulos y funciones"
              type="search"
              value={moduleQuery}
            />
            {moduleQuery ? <button aria-label="Limpiar busqueda" className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 hover:bg-white hover:text-neutral-700" onClick={() => setModuleQuery("")} type="button"><X size={15} /></button> : null}
          </label>
        ) : null}
        {!technicianMode ? <SidebarTooltip collapsed={collapsed} label="Inicio"><Link aria-current={pathname === "/dashboard" ? "page" : undefined} aria-label={collapsed ? "Inicio" : undefined} className={linkClass(pathname === "/dashboard")} href="/dashboard" prefetch={false}>
          <Home size={18} />
          {!collapsed ? "Inicio" : null}
        </Link></SidebarTooltip> : null}
        {collapsed ? orderedItems.map(renderItem) : groupedItems.map((group) => <details className="group/sidebar" key={group.id}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600 transition-colors hover:text-neutral-900"><span>{group.label}</span><ChevronRight className="transition group-open/sidebar:rotate-90" size={13} /></summary>
          <div className="space-y-0.5">{group.items.map(renderItem)}</div>
        </details>)}
        {!collapsed && normalizedQuery && orderedItems.length === 0 ? <p className="px-3 py-4 text-sm text-neutral-500">No hay modulos disponibles para esta busqueda.</p> : null}
      </nav>
      {!collapsed ? (
        <div className="mt-2 shrink-0">
          <UserSessionBadge />
        </div>
      ) : (
        <div className="mt-2 shrink-0">
          <UserSessionBadge compact />
        </div>
      )}
    </aside>
  );
}

function SidebarTooltip({ children, collapsed, label }: { children: ReactNode; collapsed: boolean; label: string }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  function show() {
    if (!collapsed || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    setPosition({ left: rect.right + 12, top: rect.top + rect.height / 2 });
  }

  return (
    <div className="w-full" onBlur={() => setPosition(null)} onFocus={show} onMouseEnter={show} onMouseLeave={() => setPosition(null)} ref={anchor}>
      {children}
      {position ? createPortal(<span className="pointer-events-none fixed z-[130] w-max max-w-64 -translate-y-1/2 rounded-md bg-neutral-950 px-3 py-2 text-xs font-medium text-white shadow-lg" role="tooltip" style={{ left: position.left, top: position.top }}>{label}</span>, document.body) : null}
    </div>
  );
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function queryMatches(searchText: string, query: string) {
  return query.split(" ").filter(Boolean).every((term) => searchText.includes(term));
}
