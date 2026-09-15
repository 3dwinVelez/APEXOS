"use client";

import { AiExperienceLayer } from "@/components/brain/AiExperienceLayer";
import { ContextBreadcrumbs } from "@/components/shell/ContextBreadcrumbs";
import { MobileNav } from "@/components/shell/MobileNav";
import { PageTransition } from "@/components/shell/PageTransition";
import { RouteAccessGuard } from "@/components/shell/RouteAccessGuard";
import { Sidebar } from "@/components/shell/Sidebar";
import { TechnicianWorkspaceHeader } from "@/components/shell/TechnicianWorkspaceHeader";
import { UserSessionBadge } from "@/components/shell/UserSessionBadge";
import { CommandPalette } from "@/components/system/CommandPalette";
import { CollaborationPresence } from "@/components/system/CollaborationPresence";
import { ExperiencePreferences } from "@/components/system/ExperiencePreferences";
import { LocaleSwitcher } from "@/components/system/LocaleSwitcher";
import { NotificationCenter } from "@/components/system/NotificationCenter";
import { OfflineFirstStatus } from "@/components/system/OfflineFirstStatus";
import { StandardTableExperience } from "@/components/system/StandardTableExperience";
import { TraceabilityCenter } from "@/components/system/TraceabilityCenter";
import { WorldClassToolkit } from "@/components/system/WorldClassToolkit";
import { FieldProductivity } from "@/components/system/FieldProductivity";
import { isMarkingOnlyAccess, MARKING_ONLY_PROFILE } from "@/lib/accessProfile";
import { ChevronDown, Clock3, SlidersHorizontal } from "lucide-react";
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
      <main className="min-w-0 flex-1 overflow-x-hidden p-3 pb-24 sm:p-4 md:p-6 md:pb-6" id="apex-main-content" tabIndex={-1}>
        <FieldProductivity />
        <StandardTableExperience />
        <div className="mb-3 flex flex-wrap justify-end gap-2"><OfflineFirstStatus /><LocaleSwitcher /><SecondaryWorkspaceTools /><CommandPalette /><NotificationCenter /></div>
        <ContextBreadcrumbs />
        <TechnicianWorkspaceHeader />
        <RouteAccessGuard><PageTransition>{children}</PageTransition></RouteAccessGuard>
      </main>
      <MobileNav />
      <div className="technician-hide"><AiExperienceLayer /></div>
    </div>
  );
}

function SecondaryWorkspaceTools() {
  return (
    <details className="group relative">
      <summary className="apex-interactive inline-flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:text-content-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex">
        <SlidersHorizontal size={15} />
        <span className="hidden lg:inline">Herramientas</span>
        <ChevronDown className="transition group-open:rotate-180" size={14} />
      </summary>
      <div className="absolute right-0 z-50 mt-2 grid w-[min(92vw,520px)] gap-2 rounded-card border border-line bg-surface p-3 shadow-overlay sm:grid-cols-2">
        <TraceabilityCenter />
        <CollaborationPresence />
        <ExperiencePreferences />
        <WorldClassToolkit />
      </div>
    </details>
  );
}
