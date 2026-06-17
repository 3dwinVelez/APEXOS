import { ApexAiHeader } from "@/components/brain/ApexAiHeader";
import { AiExperienceLayer } from "@/components/brain/AiExperienceLayer";
import { MobileNav } from "@/components/shell/MobileNav";
import { RouteAccessGuard } from "@/components/shell/RouteAccessGuard";
import { Sidebar } from "@/components/shell/Sidebar";
import { TechnicianWorkspaceHeader } from "@/components/shell/TechnicianWorkspaceHeader";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
