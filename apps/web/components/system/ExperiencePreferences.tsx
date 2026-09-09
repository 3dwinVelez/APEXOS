"use client";

import { Bookmark, Check, Moon, Settings2, Star, Sun, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Density = "comfortable" | "compact";
type FontScale = "small" | "medium" | "large";
type SavedPlace = { path: string; label: string };
type Preferences = { density: Density; fontScale: FontScale; favorites: SavedPlace[]; views: SavedPlace[] };

const defaults: Preferences = { density: "comfortable", fontScale: "medium", favorites: [], views: [] };
const storagePrefix = "apex_experience_v1";

function pageLabel(pathname: string) {
  const last = pathname.split("/").filter(Boolean).pop() || "dashboard";
  return last.replaceAll("-", " ").replace(/^./, (letter) => letter.toLocaleUpperCase());
}

function storageKey() {
  const user = localStorage.getItem("user_email") || "anonymous";
  return `${storagePrefix}:${user.toLocaleLowerCase()}`;
}

function applyPreferences(preferences: Preferences) {
  document.documentElement.dataset.density = preferences.density;
  document.documentElement.dataset.fontScale = preferences.fontScale;
}

export function ExperiencePreferences() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [currentViewPath, setCurrentViewPath] = useState(pathname);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = pageLabel(pathname);

  useEffect(() => {
    let stored = defaults;
    try { stored = { ...defaults, ...JSON.parse(localStorage.getItem(storageKey()) || "{}") } as Preferences; } catch { stored = defaults; }
    setPreferences(stored);
    applyPreferences(stored);
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  useEffect(() => { setCurrentViewPath(`${pathname}${window.location.search}`); }, [pathname]);

  const persist = (next: Preferences) => {
    setPreferences(next);
    applyPreferences(next);
    localStorage.setItem(storageKey(), JSON.stringify(next));
  };

  const favorite = useMemo(() => preferences.favorites.some((item) => item.path === pathname), [pathname, preferences.favorites]);
  const viewSaved = preferences.views.some((item) => item.path === currentViewPath);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.add("theme-transition");
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.dataset.theme = next;
    localStorage.setItem("apex_theme", next);
    setTheme(next);
    window.setTimeout(() => document.documentElement.classList.remove("theme-transition"), 220);
  };

  const toggleFavorite = () => persist({ ...preferences, favorites: favorite ? preferences.favorites.filter((item) => item.path !== pathname) : [{ path: pathname, label }, ...preferences.favorites].slice(0, 8) });
  const toggleView = () => persist({ ...preferences, views: viewSaved ? preferences.views.filter((item) => item.path !== currentViewPath) : [{ path: currentViewPath, label }, ...preferences.views].slice(0, 8) });

  return <div className="relative">
    <button aria-expanded={open} aria-haspopup="dialog" aria-label="Preferencias de experiencia" className="apex-interactive inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:text-content-strong" onClick={() => setOpen((value) => !value)} ref={trigger} type="button"><Settings2 size={15} /><span className="hidden xl:inline">Preferencias</span></button>
    {open ? <section aria-label="Preferencias de experiencia" className="apex-dialog-enter absolute right-0 top-12 z-[70] w-[min(390px,calc(100vw-24px))] rounded-card border border-line bg-surface p-4 shadow-overlay" role="dialog">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-content-strong">Tu espacio de trabajo</h2><p className="text-xs text-content-muted">Se guarda para tu usuario.</p></div><button aria-label="Cerrar preferencias" className="rounded-control px-2 py-1 text-xs hover:bg-surface-muted" onClick={() => { setOpen(false); window.setTimeout(() => trigger.current?.focus(), 0); }} type="button">Cerrar</button></div>

      <div className="mt-4 grid gap-4">
        <fieldset><legend className="mb-2 text-xs font-semibold text-content-strong">Apariencia</legend><button className="apex-interactive flex h-10 w-full items-center justify-between rounded-control border border-line px-3 text-xs font-semibold" onClick={toggleTheme} type="button"><span className="flex items-center gap-2">{theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}{theme === "dark" ? "Tema oscuro" : "Tema claro"}</span><span className="text-content-muted">Cambiar</span></button></fieldset>
        <fieldset><legend className="mb-2 text-xs font-semibold text-content-strong">Densidad</legend><div className="grid grid-cols-2 gap-2">{(["comfortable", "compact"] as Density[]).map((value) => <button aria-pressed={preferences.density === value} className={`h-10 rounded-control border px-2 text-xs font-semibold ${preferences.density === value ? "border-apex bg-apex/10 text-apex" : "border-line"}`} key={value} onClick={() => persist({ ...preferences, density: value })} type="button">{value === "comfortable" ? "Cómoda" : "Compacta"}</button>)}</div></fieldset>
        <fieldset><legend className="mb-2 text-xs font-semibold text-content-strong">Tamaño de texto</legend><div className="grid grid-cols-3 gap-2">{(["small", "medium", "large"] as FontScale[]).map((value) => <button aria-pressed={preferences.fontScale === value} className={`h-10 rounded-control border px-2 text-xs font-semibold ${preferences.fontScale === value ? "border-apex bg-apex/10 text-apex" : "border-line"}`} key={value} onClick={() => persist({ ...preferences, fontScale: value })} type="button">{{ small: "Pequeño", medium: "Medio", large: "Grande" }[value]}</button>)}</div></fieldset>
        <div className="grid grid-cols-2 gap-2"><button aria-pressed={favorite} className="apex-interactive flex min-h-11 items-center justify-center gap-2 rounded-control border border-line px-2 text-xs font-semibold" onClick={toggleFavorite} type="button"><Star fill={favorite ? "currentColor" : "none"} size={15} />{favorite ? "En favoritos" : "Favorito"}</button><button aria-pressed={viewSaved} className="apex-interactive flex min-h-11 items-center justify-center gap-2 rounded-control border border-line px-2 text-xs font-semibold" onClick={toggleView} type="button"><Bookmark fill={viewSaved ? "currentColor" : "none"} size={15} />{viewSaved ? "Vista guardada" : "Guardar vista"}</button></div>
      </div>

      {preferences.favorites.length || preferences.views.length ? <div className="mt-4 border-t border-line pt-3"><h3 className="text-xs font-semibold text-content-strong">Accesos personales</h3><div className="mt-2 max-h-40 space-y-1 overflow-y-auto">{[...preferences.favorites.map((item) => ({ ...item, kind: "Favorito" })), ...preferences.views.map((item) => ({ ...item, kind: "Vista" }))].map((item) => <div className="flex items-center gap-1" key={`${item.kind}:${item.path}`}><Link className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-2 text-xs hover:bg-surface-muted" href={item.path}><Check className="text-apex" size={13} /><span className="truncate">{item.label}</span><small className="ml-auto text-content-subtle">{item.kind}</small></Link><button aria-label={`Quitar ${item.kind.toLocaleLowerCase()} ${item.label}`} className="rounded-control p-2 text-content-muted hover:bg-surface-muted" onClick={() => persist({ ...preferences, favorites: item.kind === "Favorito" ? preferences.favorites.filter((saved) => saved.path !== item.path) : preferences.favorites, views: item.kind === "Vista" ? preferences.views.filter((saved) => saved.path !== item.path) : preferences.views })} type="button"><Trash2 size={13} /></button></div>)}</div></div> : null}
    </section> : null}
  </div>;
}
