"use client";

import { isSupabaseSession, loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { UserSessionBadge } from "@/components/shell/UserSessionBadge";
import { ChevronLeft, ChevronRight, Home, LockKeyhole, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
    .filter((item) => !normalizedQuery || (item.enabled && queryMatches(item.searchText, normalizedQuery)))
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return (access.orderBySlug?.[a.slug] ?? 999) - (access.orderBySlug?.[b.slug] ?? 999);
    });

  function linkClass(active: boolean, enabled = true) {
    if (!enabled) return "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-neutral-400 opacity-75";
    return `flex h-10 items-center gap-3 rounded-md px-3 text-sm transition ${active ? "bg-apex text-white shadow-sm" : "text-neutral-700 hover:bg-paper"}`;
  }

  function sectionLabel(label: string) {
    if (collapsed) return null;
    return <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>;
  }

  function renderItem(item: (typeof items)[number]) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!item.enabled) {
      return (
        <button
          aria-disabled="true"
          className={linkClass(false, false)}
          disabled
          key={item.href}
          title={`${item.label} bloqueado por suscripcion o permisos`}
          type="button"
        >
          <Icon size={18} />
          {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
          {!collapsed ? <LockKeyhole className="shrink-0" size={14} /> : null}
        </button>
      );
    }
    return (
      <Link
        className={linkClass(active, item.enabled)}
        href={item.href}
        key={item.href}
        title={item.label}
      >
        <Icon size={18} />
        {!collapsed ? item.label : null}
      </Link>
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
        {!collapsed ? (
          <label className="relative mb-3 block">
            <span className="sr-only">Buscar modulos</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input
              className="h-10 w-full rounded-md border border-line bg-paper pl-9 pr-9 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-apex focus:bg-white"
              onChange={(event) => setModuleQuery(event.target.value)}
              placeholder="Buscar modulo"
              type="search"
              value={moduleQuery}
            />
            {moduleQuery ? <button aria-label="Limpiar busqueda" className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 hover:bg-white hover:text-neutral-700" onClick={() => setModuleQuery("")} type="button"><X size={15} /></button> : null}
          </label>
        ) : null}
        {!technicianMode ? <Link className={linkClass(pathname === "/dashboard")} href="/dashboard" title="Inicio">
          <Home size={18} />
          {!collapsed ? "Inicio" : null}
        </Link> : null}
        {sectionLabel("Activos")}
        {orderedItems.map(renderItem)}
        {!collapsed && normalizedQuery && orderedItems.length === 0 ? <p className="px-3 py-4 text-sm text-neutral-500">No hay modulos disponibles para esta busqueda.</p> : null}
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

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function queryMatches(searchText: string, query: string) {
  return query.split(" ").filter(Boolean).every((term) => searchText.includes(term));
}
