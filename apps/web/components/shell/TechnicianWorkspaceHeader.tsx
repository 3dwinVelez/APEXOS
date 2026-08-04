"use client";

import { UserSessionBadge } from "@/components/shell/UserSessionBadge";
import { clearSession } from "@/lib/sessionSecurity";
import { LogOut, Wrench } from "lucide-react";

export function TechnicianWorkspaceHeader() {
  function logout() {
    clearSession("manual_logout");
    window.location.assign("/login");
  }

  return (
    <header className="technician-only sticky top-0 z-40 mb-4 items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-apex text-white">
          <Wrench size={19} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">Mi jornada de servicios</p>
          <p className="truncate text-xs text-neutral-500">Selecciona una orden activa para comenzar o continuar.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <UserSessionBadge compact />
        <button aria-label="Cerrar sesion" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-600 hover:border-red-300 hover:text-red-700" onClick={logout} type="button">
          <LogOut size={16} />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
