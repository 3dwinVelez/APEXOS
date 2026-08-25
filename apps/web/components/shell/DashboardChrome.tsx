"use client";

import { ApexAiHeader } from "@/components/brain/ApexAiHeader";
import { AiExperienceLayer } from "@/components/brain/AiExperienceLayer";
import { MobileNav } from "@/components/shell/MobileNav";
import { RouteAccessGuard } from "@/components/shell/RouteAccessGuard";
import { Sidebar } from "@/components/shell/Sidebar";
import { TechnicianWorkspaceHeader } from "@/components/shell/TechnicianWorkspaceHeader";
import { UserSessionBadge } from "@/components/shell/UserSessionBadge";
import { isMarkingOnlyAccess, MARKING_ONLY_PROFILE } from "@/lib/accessProfile";
import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

type ChromeMode = "checking" | "standard" | "marking_only";

export function DashboardChrome({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ChromeMode>("checking");

  useEffect(() => {
    const markingOnly = isMarkingOnlyAccess();
    document.documentElement.dataset.accessProfile = markingOnly ? MARKING_ONLY_PROFILE : "standard";
    setMode(markingOnly ? "marking_only" : "standard");
  }, []);

  if (mode === "checking") {
    return <main className="min-h-screen bg-paper p-6 text-sm text-neutral-600">Validando perfil de acceso...</main>;
  }

  if (mode === "marking_only") {
    return (
      <div className="min-h-screen bg-paper">
        <header className="sticky top-0 z-40 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-apex text-white"><Clock3 size={20} /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">Marcaciones</p>
                <p className="truncate text-xs text-neutral-500">Acceso exclusivo a mi jornada</p>
              </div>
            </div>
            <UserSessionBadge compact />
          </div>
        </header>
        <main className="mx-auto min-w-0 max-w-lg overflow-x-hidden p-3 pb-8 sm:p-4">
          <RouteAccessGuard>{children}</RouteAccessGuard>
        </main>
      </div>
    );
  }

  return (
    <div className="apex-app-gradient min-h-screen md:flex">
      <div className="technician-hide"><Sidebar /></div>
      <main className="min-w-0 flex-1 overflow-x-hidden p-3 pb-24 sm:p-4 md:p-6 md:pb-6">
        <TechnicianWorkspaceHeader />
        <ApexAiHeader />
        <RouteAccessGuard>{children}</RouteAccessGuard>
      </main>
      <MobileNav />
      <div className="technician-hide"><AiExperienceLayer /></div>
    </div>
  );
}
