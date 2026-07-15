"use client";

import { getSupabaseAccessToken, supabaseFetch } from "@/lib/supabaseClient";
import { clearSession } from "@/lib/sessionSecurity";
import { CircleUserRound, LogOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SessionCompany = {
  company_id?: string;
  company_name?: string;
  role?: string;
};

type CurrentSession = {
  email: string;
  role: string;
  provider: string;
  company: string;
};

let sessionCompaniesInFlight: { token: string; promise: Promise<SessionCompany[]> } | null = null;
let lastPresenceAt = 0;
let lastPresenceToken = "";

function loadSessionCompanies() {
  const token = getSupabaseAccessToken() || "";
  if (!sessionCompaniesInFlight || sessionCompaniesInFlight.token !== token) {
    const promise = supabaseFetch<SessionCompany[]>("/rest/v1/v_user_companies?select=company_id,company_name,role&limit=5")
      .finally(() => {
        if (sessionCompaniesInFlight?.token === token) sessionCompaniesInFlight = null;
      });
    sessionCompaniesInFlight = { token, promise };
  }
  return sessionCompaniesInFlight.promise;
}

function readLocalSession(): CurrentSession {
  if (typeof window === "undefined") return { email: "", role: "", provider: "", company: "" };
  return {
    email: localStorage.getItem("user_email") || "",
    role: localStorage.getItem("role_name") || "",
    provider: localStorage.getItem("auth_provider") || "",
    company: localStorage.getItem("apexos_company_name") || ""
  };
}

function initials(email: string) {
  const text = email.trim();
  if (!text) return "AP";
  const name = text.split("@")[0] || text;
  return name.slice(0, 2).toUpperCase();
}

export function UserSessionBadge({ compact = false }: { compact?: boolean }) {
  const [session, setSession] = useState<CurrentSession>({ email: "", role: "", provider: "", company: "" });

  function logout() {
    clearSession("manual_logout");
    window.location.assign("/login");
  }

  useEffect(() => {
    let cancelled = false;
    let heartbeatId = 0;
    const current = readLocalSession();
    setSession(current);
    const syncFromStorage = () => setSession(readLocalSession());
    window.addEventListener("storage", syncFromStorage);
    if (current.provider === "supabase") {
      loadSessionCompanies()
        .then((rows) => {
          if (cancelled) return;
          const preferredCompanyId = localStorage.getItem("apexos_company_id");
          const company = rows.find((row) => row.company_id === preferredCompanyId)
            || rows.find((row) => ["owner", "admin", "superadmin"].includes(String(row.role || "").toLowerCase()))
            || rows[0];
          if (company?.company_id) localStorage.setItem("apexos_company_id", company.company_id);
          if (company?.company_name) localStorage.setItem("apexos_company_name", company.company_name);
          setSession((value) => ({
            ...value,
            role: value.role || company?.role || "",
            company: company?.company_name || value.company
          }));
          const token = getSupabaseAccessToken();
          const registerPresence = () => {
            if (!token) return;
            if (lastPresenceToken === token && Date.now() - lastPresenceAt <= 60_000) return;
            lastPresenceAt = Date.now();
            lastPresenceToken = token;
            fetch("/api/platform/company-sessions", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ company_id: company?.company_id || null })
            }).catch(() => undefined);
          };
          registerPresence();
          heartbeatId = window.setInterval(registerPresence, 120000);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      window.removeEventListener("storage", syncFromStorage);
      if (heartbeatId) window.clearInterval(heartbeatId);
    };
  }, []);

  const label = useMemo(() => session.email || "Sesion no identificada", [session.email]);
  const detail = [session.company, session.role || session.provider].filter(Boolean).join(" · ");

  if (compact) {
    return (
      <button className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-paper text-xs font-semibold text-apex transition hover:border-red-300 hover:text-red-700" onClick={logout} title={`Cerrar sesion - ${label}${detail ? ` - ${detail}` : ""}`} type="button">
        {session.email ? initials(session.email) : <CircleUserRound size={17} />}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-apex text-xs font-semibold text-white">
          {initials(session.email)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{label}</p>
          <p className="truncate text-xs text-neutral-600">{detail || "Usuario conectado"}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Sesion activa
      </div>
      <button className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-white text-xs font-semibold text-neutral-600 transition hover:border-red-300 hover:text-red-700" onClick={logout} type="button">
        <LogOut size={14} />
        Cerrar sesion
      </button>
    </div>
  );
}
