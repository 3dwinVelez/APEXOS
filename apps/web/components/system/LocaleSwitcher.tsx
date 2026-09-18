"use client";

import { useI18n, type ApexLocale } from "@/lib/i18n";
import { Languages } from "lucide-react";

const locales: Array<{ value: ApexLocale; label: string }> = [{ value: "es", label: "ES" }, { value: "en", label: "EN" }, { value: "pt", label: "PT" }];

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted">
      <Languages size={15} aria-hidden="true" />
      <span className="sr-only">{t("language")}</span>
      <select aria-label={t("language")} className="bg-transparent text-content-strong outline-none" onChange={(event) => setLocale(event.target.value as ApexLocale)} value={locale}>
        {locales.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  );
}
