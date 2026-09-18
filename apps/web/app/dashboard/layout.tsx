import { DashboardChrome } from "@/components/shell/DashboardChrome";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardChrome>{children}</DashboardChrome>
  );
}
