"use client";

import { useI18n } from "@/lib/i18n";
import { Cloud, CloudOff } from "lucide-react";
import { useEffect, useState } from "react";

export function OfflineFirstStatus() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  return <span aria-live="polite" className={`inline-flex h-10 items-center gap-2 rounded-control border px-3 text-xs font-semibold ${online ? "border-line bg-surface text-content-muted" : "border-warning/40 bg-warning/10 text-content-strong"}`} title={online ? "Sincronización disponible" : "Las operaciones compatibles se conservarán en la cola local"}>{online ? <Cloud size={15} /> : <CloudOff size={15} />}{online ? t("online") : t("offline")}</span>;
}
