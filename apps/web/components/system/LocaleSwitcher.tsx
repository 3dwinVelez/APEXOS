"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";
import { useI18n, type ApexLocale } from "@/lib/i18n";
import { Check, Languages } from "lucide-react";
import { useState } from "react";

const locales: Array<{ value: ApexLocale; label: string; short: string; note: string }> = [
  { value: "es", label: "Español", short: "ES", note: "Interfaz, fechas y documentos en español de Colombia." },
  { value: "en", label: "English", short: "EN", note: "Interface, dates and documents in English." },
  { value: "pt", label: "Português", short: "PT", note: "Interface, datas e documentos em português." }
];

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = locales.find((item) => item.value === locale) || locales[0];
  const select = (value: ApexLocale) => { setLocale(value); setOpen(false); };

  return <>
    <button aria-haspopup="dialog" aria-label={t("language")} className="apex-interactive inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:text-content-strong" onClick={() => setOpen(true)} type="button">
      <Languages size={15} />
      {current.short}
    </button>
    {open ? <ModalFrame tone="brand" title={t("language")} description="El idioma se aplica al instante y se guarda en este navegador." icon={<Languages size={18} />} maxWidth="md:!max-w-md" onClose={() => setOpen(false)}>
      <div className="grid gap-2" role="group" aria-label={t("language")}>
        {locales.map((item) => <button aria-label={item.label} aria-pressed={locale === item.value} className="apex-window-option" key={item.value} onClick={() => select(item.value)} type="button">
          <span aria-hidden="true" className="apex-window-icon h-9 w-9 rounded-control text-xs font-bold tracking-wide">{item.short}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-content-strong">{item.label}</span>
            <span className="mt-0.5 block text-xs text-content-muted">{item.note}</span>
          </span>
          {locale === item.value ? <Check aria-hidden="true" className="shrink-0 text-apex" size={18} /> : null}
        </button>)}
      </div>
    </ModalFrame> : null}
  </>;
}
