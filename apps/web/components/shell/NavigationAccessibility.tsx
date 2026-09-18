"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function routeLabel(pathname: string) {
  const parts = pathname.split("/").filter(Boolean).slice(1);
  if (!parts.length) return "Dashboard";
  return parts.map((part) => decodeURIComponent(part).replaceAll("-", " ")).join(" · ");
}

export function NavigationAccessibility() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncement(`Página cargada: ${routeLabel(pathname)}`), 120);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return <>
    {pathname.startsWith("/dashboard") ? <a className="apex-skip-link" href="#apex-main-content">Saltar al contenido principal</a> : null}
    <span aria-atomic="true" aria-live="polite" className="sr-only">{announcement}</span>
  </>;
}
