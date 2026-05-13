"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

export const AI_ASSISTANCE_KEY = "apex_ai_assistance_enabled";
export const AI_ASSISTANCE_EVENT = "apex-ai-assistance-change";

function readEnabled() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(AI_ASSISTANCE_KEY) !== "0";
}

export function AiAssistanceToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readEnabled());
  }, []);

  function toggle() {
    const next = !enabled;
    localStorage.setItem(AI_ASSISTANCE_KEY, next ? "1" : "0");
    setEnabled(next);
    window.dispatchEvent(new CustomEvent(AI_ASSISTANCE_EVENT, { detail: next }));
  }

  return (
    <button
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium ${enabled ? "border-apex/30 bg-[#146C6312] text-apex" : "border-line bg-white text-neutral-600 hover:bg-paper"}`}
      onClick={toggle}
      type="button"
      aria-pressed={enabled}
      title={enabled ? "Desactivar guias y bandeja APEX AI" : "Activar guias y bandeja APEX AI"}
    >
      <Sparkles size={15} />
      Asistencia {enabled ? "activa" : "inactiva"}
    </button>
  );
}
