import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "APEX OS",
  description: "El Sistema Operativo para Empresas"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

