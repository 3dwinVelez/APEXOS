"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ApexLocale = "es" | "en" | "pt";

const messages = {
  es: { search: "Buscar comandos, módulos y acciones", commands: "Centro de comandos", recent: "Recientes", navigation: "Navegación", actions: "Acciones rápidas", noResults: "No encontramos resultados", offline: "Sin conexión", online: "En línea", traceability: "Trazabilidad", dashboard: "Panel contextual", language: "Idioma" },
  en: { search: "Search commands, modules and actions", commands: "Command center", recent: "Recent", navigation: "Navigation", actions: "Quick actions", noResults: "No results found", offline: "Offline", online: "Online", traceability: "Traceability", dashboard: "Context dashboard", language: "Language" },
  pt: { search: "Buscar comandos, módulos e ações", commands: "Central de comandos", recent: "Recentes", navigation: "Navegação", actions: "Ações rápidas", noResults: "Nenhum resultado", offline: "Sem conexão", online: "Online", traceability: "Rastreabilidade", dashboard: "Painel contextual", language: "Idioma" }
} as const;

type MessageKey = keyof typeof messages.es;
type I18nValue = { locale: ApexLocale; setLocale: (locale: ApexLocale) => void; t: (key: MessageKey) => string };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<ApexLocale>("es");

  useEffect(() => {
    const stored = localStorage.getItem("apex_locale");
    if (stored === "es" || stored === "en" || stored === "pt") setLocaleState(stored);
  }, []);

  const setLocale = (next: ApexLocale) => {
    localStorage.setItem("apex_locale", next);
    document.documentElement.lang = next;
    setLocaleState(next);
  };

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (key: MessageKey) => messages[locale][key] }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n requiere I18nProvider");
  return value;
}
