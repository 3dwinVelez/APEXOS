"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function activeTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(activeTheme());
    const sync = () => setTheme(activeTheme());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function toggleTheme() {
    const next = activeTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.add("theme-transition");
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.dataset.theme = next;
    localStorage.setItem("apex_theme", next);
    setTheme(next);
    window.setTimeout(() => document.documentElement.classList.remove("theme-transition"), 220);
  }

  const dark = theme === "dark";
  return (
    <button
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="fixed bottom-20 right-3 z-[80] inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-neutral-700 shadow-lg transition hover:bg-paper md:bottom-4 md:right-4"
      onClick={toggleTheme}
      title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      type="button"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
      <span className="hidden sm:inline">{dark ? "Modo claro" : "Modo oscuro"}</span>
    </button>
  );
}
