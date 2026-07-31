import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { PlatformAlerts } from "@/components/system/PlatformAlerts";
import { SessionLifecycle } from "@/components/system/SessionLifecycle";

export const metadata: Metadata = {
  title: "APEX OS",
  description: "El Sistema Operativo para Empresas"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <Script src="/scripts/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body>
        <SessionLifecycle />
        <PlatformAlerts />
        {children}
      </body>
    </html>
  );
}
