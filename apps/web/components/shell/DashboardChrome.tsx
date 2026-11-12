"use client";

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
import { ModalFrame } from "@/components/ui/ModalFrame";
import { isMarkingOnlyAccess, MARKING_ONLY_PROFILE } from "@/lib/accessProfile";
import { openWorkspaceTool, type WorkspaceToolId } from "@/lib/workspaceTools";
import { ChevronRight, Clock3, Route, Settings2, SlidersHorizontal, Sparkles, Users } from "lucide-react";
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
    return <main className="min-h-screen p-6 text-sm text-neutral-600">Validando perfil de acceso...</main>;
  }

  if (mode === "marking_only") {
    return (
      <div className="min-h-screen">
        <header className="apex-chrome-topbar sticky top-0 z-40 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
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
        <div className="apex-chrome-topbar mb-3 flex flex-wrap justify-end gap-2"><OfflineFirstStatus /><LocaleSwitcher /><SecondaryWorkspaceTools /><CommandPalette /><NotificationCenter /></div>
        <TraceabilityCenter />
        <CollaborationPresence />
        <ExperiencePreferences />
        <WorldClassToolkit />
        <ContextBreadcrumbs />
        <TechnicianWorkspaceHeader />
        <RouteAccessGuard><PageTransition>{children}</PageTransition></RouteAccessGuard>
      </main>
      <MobileNav />
    </div>
  );
}

const workspaceTools: Array<{ id: WorkspaceToolId; label: string; description: string; action: string; icon: typeof Route }> = [
  { id: "traceability", label: "Trazabilidad", description: "Recorrido reciente entre los módulos de esta sesión.", action: "Abrir trazabilidad", icon: Route },
  { id: "team", label: "Equipo", description: "Presencia y edición concurrente en esta empresa.", action: "Abrir equipo", icon: Users },
  { id: "preferences", label: "Preferencias", description: "Tema, densidad, foco y accesos guardados.", action: "Abrir preferencias de experiencia", icon: Settings2 },
  { id: "productivity", label: "Productividad", description: "Progreso, confianza de la sesión y acciones rápidas.", action: "Abrir centro de productividad", icon: Sparkles }
];

function SecondaryWorkspaceTools() {
  const [open, setOpen] = useState(false);
  const launch = (id: WorkspaceToolId) => { setOpen(false); openWorkspaceTool(id); };

  return <>
    <button aria-haspopup="dialog" aria-label="Herramientas" className="apex-interactive inline-flex h-10 items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:text-content-strong" onClick={() => setOpen(true)} type="button">
      <SlidersHorizontal size={15} />
      <span className="hidden lg:inline">Herramientas</span>
    </button>
    {open ? <ModalFrame tone="brand" title="Herramientas" description="Ventanas de trabajo del escritorio APEX." icon={<SlidersHorizontal size={18} />} maxWidth="md:!max-w-2xl" onClose={() => setOpen(false)}>
      <div className="grid gap-2 sm:grid-cols-2">
        {workspaceTools.map((tool) => {
          const Icon = tool.icon;
          return <button aria-label={tool.action} className="apex-window-card" key={tool.id} onClick={() => launch(tool.id)} type="button">
            <span aria-hidden="true" className="apex-window-icon"><Icon size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-content-strong">{tool.label}</span>
              <span className="mt-0.5 block text-xs text-content-muted">{tool.description}</span>
            </span>
            <ChevronRight aria-hidden="true" className="mt-1 shrink-0 text-content-subtle" size={16} />
          </button>;
        })}
      </div>
    </ModalFrame> : null}
  </>;
}
