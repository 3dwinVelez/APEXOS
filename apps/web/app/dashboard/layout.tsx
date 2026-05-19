import { AiExperienceLayer } from "@/components/brain/AiExperienceLayer";
import { AiAssistanceToggle } from "@/components/brain/AiAssistanceToggle";
import { Sidebar } from "@/components/shell/Sidebar";
import { Brain, Sparkles } from "lucide-react";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">
        <div className="mb-4 hidden flex-wrap items-center justify-between gap-3 rounded-md border border-apex/15 bg-white px-4 py-3 md:flex">
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
            <AiAssistanceToggle />
            <Link className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper" href="/dashboard/apex-ai">
              <Sparkles size={15} />
              Ver inteligencia
            </Link>
          </div>
        </div>
        {children}
      </main>
      <AiExperienceLayer />
    </div>
  );
}
