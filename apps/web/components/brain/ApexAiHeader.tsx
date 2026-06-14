"use client";

import { AiAssistanceToggle } from "@/components/brain/AiAssistanceToggle";
import { useApexAiAccess } from "@/components/brain/useApexAiAccess";
import { UserSessionBadge } from "@/components/shell/UserSessionBadge";
import { Brain, Sparkles } from "lucide-react";
import Link from "next/link";

export function ApexAiHeader() {
  const access = useApexAiAccess();

  if (access !== "enabled") return null;

  return (
    <div className="technician-hide mb-4 hidden flex-wrap items-center justify-between gap-3 rounded-md border border-apex/15 bg-white px-4 py-3 md:flex">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-apex text-white">
          <Brain size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">APEX AI Core activo</p>
          <p className="truncate text-xs text-neutral-600">Mentor, alertas y recomendaciones conectadas a todo el ecosistema.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <UserSessionBadge compact />
        <AiAssistanceToggle />
        <Link className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper" href="/dashboard/apex-ai">
          <Sparkles size={15} />
          Ver inteligencia
        </Link>
      </div>
    </div>
  );
}
