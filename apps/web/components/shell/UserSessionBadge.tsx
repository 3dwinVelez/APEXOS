"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";
import { api } from "@/lib/api";
import { getSupabaseAccessToken, supabaseAuth, supabaseFetch } from "@/lib/supabaseClient";
import { clearSession, setPasswordChangeRequired } from "@/lib/sessionSecurity";
import { CircleUserRound, KeyRound, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import type { FormEvent } from "react";
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
type ThemePreference = "light" | "dark" | "system";

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

export function UserSessionBadge({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const [session, setSession] = useState<CurrentSession>({ email: "", role: "", provider: "", company: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [passwordStatus, setPasswordStatus] = useState({ saving: false, message: "", error: "" });

  function logout() {
    clearSession("manual_logout");
    window.location.assign("/login");
  }

  function applyTheme(next: ThemePreference) {
    const dark = next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.add("theme-transition");
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("apex_theme", next);
    setTheme(next);
    window.setTimeout(() => document.documentElement.classList.remove("theme-transition"), 220);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = passwordForm.next.trim();
    setPasswordStatus({ saving: true, message: "", error: "" });
    try {
      if (!passwordForm.current) throw new Error("Ingresa tu clave actual.");
      if (next.length < 8 || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
        throw new Error("La nueva clave debe tener minimo 8 caracteres y combinar letras y numeros.");
      }
      if (next !== passwordForm.confirm.trim()) throw new Error("La confirmacion no coincide.");
      if (session.provider === "supabase") {
        await supabaseAuth.signInWithPassword(session.email, passwordForm.current);
        await supabaseAuth.updatePassword(next);
      } else {
        await api("/api/v1/auth/password", {
          method: "POST",
          body: JSON.stringify({ current_password: passwordForm.current, new_password: next })
        });
      }
      setPasswordChangeRequired(false);
      setPasswordForm({ current: "", next: "", confirm: "" });
      setPasswordStatus({ saving: false, message: "Clave actualizada correctamente.", error: "" });
      window.setTimeout(() => setPasswordOpen(false), 900);
    } catch (error) {
      setPasswordStatus({ saving: false, message: "", error: error instanceof Error ? error.message : "No fue posible cambiar la clave." });
    }
  }

  useEffect(() => {
    let cancelled = false;
    let heartbeatId = 0;
    const current = readLocalSession();
    setSession(current);
    setTheme((localStorage.getItem("apex_theme") as ThemePreference | null) || "system");
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
  const detail = [session.company, session.role || session.provider].filter(Boolean).join(" - ");
  const closeSettings = () => {
    setSettingsOpen(false);
    setPasswordOpen(false);
  };

  const preferences = settingsOpen ? (
    <ModalFrame title="Mi cuenta y preferencias" onClose={closeSettings} maxWidth="md:max-w-lg">
      <div className="space-y-5">
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cuenta</p>
          <div className="mt-2 rounded-md border border-line bg-paper p-3">
            <p className="text-sm font-semibold text-neutral-900">{label}</p>
            <p className="mt-1 text-sm text-neutral-600">{detail || "Usuario conectado"}</p>
          </div>
        </section>
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Apariencia</p>
          <div aria-label="Tema de la plataforma" className="mt-2 grid grid-cols-3 gap-2" role="group">
            {([["light", "Claro", Sun], ["dark", "Oscuro", Moon], ["system", "Sistema", Monitor]] as const).map(([value, text, Icon]) => (
              <button aria-pressed={theme === value} className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition ${theme === value ? "border-apex bg-apex text-white" : "border-line bg-white text-neutral-600 hover:bg-paper"}`} key={value} onClick={() => applyTheme(value)} type="button"><Icon size={15} />{text}</button>
            ))}
          </div>
        </section>
        <section>
          <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-semibold text-neutral-700 hover:border-apex hover:text-apex" onClick={() => setPasswordOpen((value) => !value)} type="button"><KeyRound size={15} />Cambiar clave</button>
          {passwordOpen ? (
            <form className="mt-3 space-y-2 rounded-md border border-line bg-paper p-3" onSubmit={changePassword}>
              <input autoComplete="current-password" className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))} placeholder="Clave actual" type="password" value={passwordForm.current} />
              <input autoComplete="new-password" className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" onChange={(event) => setPasswordForm((current) => ({ ...current, next: event.target.value }))} placeholder="Nueva clave" type="password" value={passwordForm.next} />
              <input autoComplete="new-password" className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm" onChange={(event) => setPasswordForm((current) => ({ ...current, confirm: event.target.value }))} placeholder="Confirmar clave" type="password" value={passwordForm.confirm} />
              {passwordStatus.error ? <p className="text-xs font-semibold text-red-600">{passwordStatus.error}</p> : null}
              {passwordStatus.message ? <p className="text-xs font-semibold text-emerald-700">{passwordStatus.message}</p> : null}
              <button className="h-10 w-full rounded-md bg-apex text-sm font-semibold text-white disabled:opacity-50" disabled={passwordStatus.saving} type="submit">{passwordStatus.saving ? "Actualizando..." : "Guardar clave"}</button>
            </form>
          ) : null}
        </section>
        <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-semibold text-neutral-600 hover:border-red-300 hover:text-red-700" onClick={logout} type="button"><LogOut size={15} />Cerrar sesion</button>
      </div>
    </ModalFrame>
  ) : null;

  if (compact) {
    return <><button aria-label="Mi cuenta" className={mobile ? "flex h-14 w-full flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-semibold text-neutral-600 active:bg-paper" : "flex h-10 w-10 items-center justify-center rounded-md border border-line bg-paper text-xs font-semibold text-apex transition hover:border-apex"} onClick={() => setSettingsOpen(true)} title={`Mi cuenta - ${label}${detail ? ` - ${detail}` : ""}`} type="button">{mobile ? <><CircleUserRound size={18} /><span>Cuenta</span></> : session.email ? initials(session.email) : <CircleUserRound size={17} />}</button>{preferences}</>;
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
      <button className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-white text-xs font-semibold text-neutral-600 transition hover:border-apex hover:text-apex" onClick={() => setSettingsOpen(true)} type="button"><Settings size={14} />Mi cuenta</button>
      {preferences}
    </div>
  );
}
