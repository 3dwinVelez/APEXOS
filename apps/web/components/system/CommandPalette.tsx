"use client";

import { isSupabaseSession, loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { OPERATIONAL_ACTIONS } from "@/lib/operationalWorkspace";
import { useI18n } from "@/lib/i18n";
import { Command, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type CommandItem = { id: string; label: string; detail: string; href: string; icon: typeof Search; keywords?: string };

export function CommandPalette() {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useMemo<CommandItem[]>(() => {
    const enabled = (slug: string) => access.bySlug[slug] === true;
    const actions = OPERATIONAL_ACTIONS.filter((action) => enabled(action.module)).map((action) => ({ id: action.id, label: action.label, detail: action.description, href: action.href, icon: action.icon, keywords: action.keywords }));
    const modules = MODULES.filter((module) => enabled(module.slug)).map((module) => ({ id: `module-${module.slug}`, label: module.name, detail: module.area, href: `/dashboard/${module.slug}`, icon: module.icon, keywords: `${module.capabilities.join(" ")} ${module.nextActions.join(" ")}` }));
    return [...actions, ...modules];
  }, [access]);
  const visible = useMemo(() => { const term = query.trim().toLocaleLowerCase(); return (term ? items.filter((item) => `${item.label} ${item.detail} ${item.keywords || ""}`.toLocaleLowerCase().includes(term)) : items).slice(0, 10); }, [items, query]);

  useEffect(() => {
    if (localStorage.getItem("token") || isSupabaseSession()) void loadModuleAccess(MODULES).then(setAccess).catch(() => setAccess({ loading: false, isPlatformAdmin: false, bySlug: {} }));
    else setAccess({ loading: false, isPlatformAdmin: false, bySlug: Object.fromEntries(MODULES.map((module) => [module.slug, true])) });
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); }
      if (event.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => trigger.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) {
      window.setTimeout(() => input.current?.focus(), 0);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setQuery("");
      setActive(0);
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const close = () => {
    setOpen(false);
    window.setTimeout(() => trigger.current?.focus(), 0);
  };

  const execute = (item: CommandItem) => {
    const recent = JSON.parse(localStorage.getItem("apex_recent_commands_v1") || "[]") as string[];
    localStorage.setItem("apex_recent_commands_v1", JSON.stringify([item.id, ...recent.filter((id) => id !== item.id)].slice(0, 6)));
    setOpen(false);
    router.push(item.href);
  };

  return <>
    <button aria-keyshortcuts="Control+K Meta+K" aria-label={t("commands")} className="apex-interactive inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:text-content-strong" onClick={() => setOpen(true)} ref={trigger} type="button"><Command size={15} /><span className="hidden lg:inline">{t("commands")}</span><kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] xl:inline">Ctrl K</kbd></button>
    {open ? <div aria-labelledby="apex-command-title" aria-modal="true" className="fixed inset-0 z-[90] flex items-start justify-center bg-neutral-950/45 px-3 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }} role="dialog">
      <section className="apex-dialog-enter w-full max-w-2xl overflow-hidden rounded-card border border-line bg-surface shadow-overlay">
        <h2 className="sr-only" id="apex-command-title">{t("commands")}</h2>
        <div className="flex items-center gap-3 border-b border-line px-4"><Search className="text-content-subtle" size={19} /><input aria-activedescendant={visible[active] ? `apex-command-${visible[active].id}` : undefined} aria-controls="apex-command-options" aria-expanded="true" aria-label={t("search")} className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, visible.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); } if (event.key === "Enter" && visible[active]) execute(visible[active]); }} placeholder={t("search")} ref={input} role="combobox" value={query} /><button aria-label="Cerrar comandos" className="rounded-control p-2 hover:bg-surface-muted" onClick={close} type="button"><X size={17} /></button></div>
        <div className="max-h-[55vh] overflow-y-auto p-2" id="apex-command-options" role="listbox">{visible.map((item, index) => { const Icon = item.icon; return <button aria-selected={active === index} className={`apex-interactive flex w-full items-center gap-3 rounded-control px-3 py-3 text-left ${active === index ? "bg-apex/10 text-content-strong" : "hover:bg-surface-muted"}`} id={`apex-command-${item.id}`} key={item.id} onClick={() => execute(item)} onMouseEnter={() => setActive(index)} role="option" type="button"><span className="flex h-9 w-9 items-center justify-center rounded-control bg-surface-muted text-apex"><Icon size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.label}</strong><small className="text-content-muted">{item.detail}</small></span></button>; })}{!visible.length ? <p className="p-8 text-center text-sm text-content-muted">{t("noResults")}</p> : null}</div>
      </section>
    </div> : null}
  </>;
}
