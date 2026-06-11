import "./globals.css";
import type { Metadata } from "next";
import { PlatformAlerts } from "@/components/system/PlatformAlerts";
import { SessionLifecycle } from "@/components/system/SessionLifecycle";
import { ThemeToggle } from "@/components/system/ThemeToggle";

export const metadata: Metadata = {
  title: "APEX OS",
  description: "El Sistema Operativo para Empresas"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("apex_theme");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.role=(localStorage.getItem("role_name")||"").toLowerCase()}catch(e){}` }} />
      </head>
      <body>
        <SessionLifecycle />
        <PlatformAlerts />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
