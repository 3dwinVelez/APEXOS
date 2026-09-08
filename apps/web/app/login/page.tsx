"use client";

import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/apiBaseUrl";
import { flattenRolePermissions } from "@/lib/rolePermissions";
import { touchSession } from "@/lib/sessionSecurity";
import { dashboardLandingPath, isMarkingOnlyAccess, MARKING_ONLY_PROFILE } from "@/lib/accessProfile";
import { getSupabaseConfigStatus, supabaseAuth, supabaseFetch } from "@/lib/supabaseClient";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";

const API_URL = API_BASE_URL;
const LOGIN_ERROR_MESSAGE = "Credenciales no válidas o sin acceso autorizado.";

type AnyRow = Record<string, unknown>;

function friendlyLoginError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid_credentials")
    || normalized.includes("invalid login credentials")
    || normalized.includes("token invalido")
    || normalized.includes("unauthorized")
    || normalized.includes("401")
    || normalized.includes("400")
  ) {
    return LOGIN_ERROR_MESSAGE;
  }

  if (normalized.includes("failed to fetch") || normalized.includes("networkerror")) {
    return "No fue posible conectar con el servicio. Reintenta en unos segundos.";
  }

  return "No fue posible iniciar sesion. Verifica tus credenciales e intenta nuevamente.";
}

function serviceTechnicianEmployee(employee: { user_type?: string; metadata?: AnyRow } | null | undefined) {
  const metadata = employee?.metadata || {};
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  const operational = metadata.operational && typeof metadata.operational === "object" ? metadata.operational as AnyRow : {};
  const values = [
    employee?.user_type,
    metadata.profile_kind,
    metadata.role_name,
    access.profile_kind,
    access.role_name,
    operational.classification
  ].map((value) => String(value || "").trim().toLowerCase());
  return values.includes("tecnico")
    || values.includes("técnico")
    || metadata.services_assigned_only === true
    || operational.can_receive_services === true;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function resolveSupabaseProfile(email: string) {
    const rows = await supabaseFetch<Array<{ user_type?: string; metadata?: { role_name?: string; profile_kind?: string; access_profile?: string; permissions?: unknown; role_type?: string; role_scope?: string } }>>(
      `/rest/v1/employees?select=user_type,metadata&email=eq.${encodeURIComponent(email)}&status=eq.active&limit=20`
    ).catch(() => []);
    const employee = rows.find(serviceTechnicianEmployee) || rows[0];
    const profileKind = employee?.metadata?.profile_kind?.toLowerCase() || employee?.user_type?.toLowerCase() || "";
    const roleName = employee?.metadata?.role_name || (profileKind === "tecnico" ? "Tecnico" : "");
    const technician = serviceTechnicianEmployee(employee);
    if (roleName) localStorage.setItem("role_name", roleName);
    if (profileKind) localStorage.setItem("profile_kind", profileKind);
    const flattened = flattenRolePermissions(employee?.metadata?.permissions);
    if (flattened.length) {
      localStorage.setItem("role_permissions", JSON.stringify(flattened));
      if (employee?.metadata?.permissions && typeof employee.metadata.permissions === "object" && !Array.isArray(employee.metadata.permissions)) {
        localStorage.setItem("role_metadata", JSON.stringify({
          role_type: employee.metadata.role_type,
          role_scope: employee.metadata.role_scope,
          access_profile: employee.metadata.access_profile,
          legacy_permissions: employee.metadata.permissions
        }));
      }
      localStorage.setItem("apexos_role_context_fetched_at", String(Date.now()));
    }
    if (technician && !roleName) localStorage.setItem("role_name", "Tecnico");
  }

  async function loginWithLocalApi(loginEmail: string, loginPassword: string) {
    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error || body.message || "No fue posible iniciar sesion con esas credenciales.");
    }
    return response.json() as Promise<{
      token: string;
      refresh: string;
      tenant?: { id?: string; company_id?: string | null; name?: string; active_modules?: string[] };
      user?: { role?: string; role_permissions?: unknown[]; role_metadata?: Record<string, unknown> };
    }>;
  }

  async function loginWithCredentials(loginEmail: string, loginPassword: string) {
    setError(null);
    if (!loginEmail || !loginPassword) {
      setError("Ingresa correo electrónico y contraseña.");
      return;
    }
    setLoading(true);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh");
      localStorage.removeItem("auth_provider");
      localStorage.removeItem("user_email");
      localStorage.removeItem("tenant_active_modules");
      localStorage.removeItem("role_permissions");
      localStorage.removeItem("role_metadata");
      localStorage.removeItem("role_name");
      localStorage.removeItem("profile_kind");
      localStorage.removeItem("apexos_company_role");
      localStorage.removeItem("apexos_company_id");
      localStorage.removeItem("apexos_company_name");
      localStorage.removeItem("apexos_role_context_fetched_at");
      sessionStorage.removeItem("apexos_module_access_cache_v2");
      let authenticatedWithSupabase = false;
      let supabaseLoginError: unknown = null;
      if (getSupabaseConfigStatus().ready) {
        try {
          const data = await supabaseAuth.signInWithPassword(loginEmail, loginPassword);
          localStorage.setItem("token", data.access_token);
          localStorage.setItem("refresh", data.refresh_token);
          localStorage.setItem("auth_provider", "supabase");
          localStorage.setItem("user_email", data.user.email || loginEmail);
          await resolveSupabaseProfile(data.user.email || loginEmail);
          authenticatedWithSupabase = true;
        } catch (error) {
          supabaseLoginError = error;
          authenticatedWithSupabase = false;
        }
      }
      if (!authenticatedWithSupabase) {
        let data;
        try {
          data = await loginWithLocalApi(loginEmail, loginPassword);
        } catch (localError) {
          throw supabaseLoginError || localError;
        }
        localStorage.setItem("token", data.token);
        if (data.refresh) localStorage.setItem("refresh", data.refresh);
        localStorage.setItem("auth_provider", "local");
        localStorage.setItem("user_email", loginEmail);
        if (data.tenant?.active_modules) localStorage.setItem("tenant_active_modules", JSON.stringify(data.tenant.active_modules));
        const companyId = data.tenant?.company_id || data.tenant?.id;
        if (companyId) localStorage.setItem("apexos_company_id", companyId);
        if (data.tenant?.name) localStorage.setItem("apexos_company_name", data.tenant.name);
        if (data.user?.role) localStorage.setItem("role_name", data.user.role);
        if (data.user?.role) localStorage.setItem("apexos_company_role", data.user.role);
        if (Array.isArray(data.user?.role_permissions)) localStorage.setItem("role_permissions", JSON.stringify(data.user.role_permissions));
        if (data.user?.role_metadata) localStorage.setItem("role_metadata", JSON.stringify(data.user.role_metadata));
        if (Array.isArray(data.user?.role_permissions) || data.user?.role_metadata) localStorage.setItem("apexos_role_context_fetched_at", String(Date.now()));
      }
      touchSession();
      const roleName = localStorage.getItem("role_name")?.toLowerCase();
      document.documentElement.dataset.role = roleName || "";
      document.documentElement.dataset.accessProfile = isMarkingOnlyAccess() ? MARKING_ONLY_PROFILE : "standard";
      window.location.assign(dashboardLandingPath());
    } catch (err) {
      setError(friendlyLoginError(err));
    } finally {
      setLoading(false);
    }
  }

  async function login(form: HTMLFormElement) {
    const formData = new FormData(form);
    const loginEmail = String(formData.get("email") || email).trim();
    const loginPassword = String(formData.get("password") || password);
    await loginWithCredentials(loginEmail, loginPassword);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login(event.currentTarget);
  }

  return (
    <main className="apex-login-split min-h-screen bg-[#05080f] text-white">
      <ThemeToggle />
      <section className="grid min-h-screen lg:grid-cols-[minmax(0,1.8fr)_minmax(26rem,1fr)]">
        <div className="apex-login-visual relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col lg:justify-center">
          <div className="relative z-10 max-w-3xl px-16 pb-44 xl:px-24">
            <div className="apex-login-brand mb-14 inline-flex items-center gap-3 text-[#31d7c5]">
              <span className="h-0 w-0 border-b-[2rem] border-l-[0.8rem] border-r-[0.8rem] border-b-[#31d7c5] border-l-transparent border-r-transparent" />
              <span className="text-xl font-black tracking-[0.18em]">APEX OS</span>
            </div>
            <p className="apex-login-eyebrow mb-5 text-xs font-bold uppercase tracking-[0.28em] text-[#31d7c5]">Plataforma empresarial inteligente</p>
            <h1 className="apex-login-hero-title max-w-2xl text-5xl font-black leading-[1.02] tracking-[-0.04em] text-[#dce8f5] xl:text-6xl">
              Convierte tu operación en decisiones.
            </h1>
            <p className="apex-login-hero-copy mt-7 max-w-xl text-lg leading-8 text-[#8fa5c1]">
              Inventario, compras, ventas y ejecución conectados en una sola experiencia segura, trazable y lista para crecer contigo.
            </p>
          </div>

          <svg aria-hidden="true" className="apex-flow-wave absolute inset-x-0 bottom-[7%] h-[46%] w-full" preserveAspectRatio="none" viewBox="0 0 1200 430">
            <defs>
              <linearGradient id="apexWave" x1="0" x2="1">
                <stop offset="0" stopColor="#263d57" stopOpacity="0.1" />
                <stop offset="0.48" stopColor="#78c9db" stopOpacity="0.78" />
                <stop className="apex-wave-accent" offset="1" stopColor="#31d7c5" stopOpacity="0.3" />
              </linearGradient>
              <filter id="apexGlow"><feGaussianBlur stdDeviation="3" /></filter>
            </defs>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((line) => (
              <path d={`M -40 ${220 + line * 4} C 170 ${205 - line * 3}, 260 ${125 + line * 8}, 430 ${198 + line * 2} S 680 ${350 - line * 10}, 830 ${188 + line * 5} S 1040 ${78 + line * 9}, 1250 ${230 - line * 3}`} fill="none" key={line} opacity={0.34 + line * 0.035} stroke="url(#apexWave)" strokeWidth="1.2" />
            ))}
            <path d="M-40 245 C210 240 300 80 500 215 S760 365 910 160 S1090 110 1250 245" fill="none" filter="url(#apexGlow)" opacity=".35" stroke="#7ee8e0" strokeWidth="5" />
          </svg>
          <div className="apex-login-security absolute bottom-10 left-16 z-10 flex items-center gap-2 text-sm text-[#7287a2] xl:left-24">
            <ShieldCheck size={17} className="text-[#31d7c5]" /> Seguridad, control y trazabilidad empresarial
          </div>
        </div>

        <div className="apex-login-panel flex min-h-screen items-center bg-[#263347] px-6 py-10 sm:px-12 lg:px-14 xl:px-20">
          <form
          aria-describedby={error ? "login-error" : undefined}
          className="mx-auto w-full max-w-md"
          method="post"
          onSubmit={submit}
        >
          <div className="mb-16 text-center lg:text-left">
            <div className="apex-login-brand mb-5 inline-flex items-center gap-3 text-[#31d7c5] lg:hidden">
              <span className="h-0 w-0 border-b-[1.7rem] border-l-[0.7rem] border-r-[0.7rem] border-b-[#31d7c5] border-l-transparent border-r-transparent" />
              <span className="font-black tracking-[0.16em]">APEX OS</span>
            </div>
            <p className="apex-login-eyebrow text-xs font-black uppercase tracking-[0.3em] text-[#31d7c5]">APEX OS</p>
            <h2 className="apex-login-form-title mt-3 text-4xl font-light tracking-[-0.03em] text-[#aebfda]"><strong className="font-black text-[#dce8f5]">Acceso</strong> empresarial</h2>
            <span className="apex-login-environment mt-4 inline-flex rounded bg-[#9eb1cd] px-2 py-0.5 text-xs font-semibold tracking-[0.12em] text-[#162033]">ENTORNO SEGURO</span>
          </div>

          <div className="space-y-5">
            <label className="apex-login-label block text-sm font-semibold text-[#aebdd2]">
              Correo electrónico
              <span className="apex-login-control mt-2 flex h-12 items-center gap-3 rounded border border-[#8191aa] bg-[#172131] px-3 transition focus-within:border-[#31d7c5] focus-within:shadow-[0_0_0_3px_rgba(49,215,197,.14)]">
                <Mail className="text-[#93a5bf]" size={18} />
                <input
                  aria-invalid={Boolean(error)}
                  autoComplete="email"
                  autoFocus
                  className="apex-login-input h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-base text-white outline-none placeholder:text-[#718198]"
                  name="email"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
            </label>

            <label className="apex-login-label block text-sm font-semibold text-[#aebdd2]">
              Contraseña
              <span className="apex-login-control mt-2 flex h-12 items-center gap-3 rounded border border-[#8191aa] bg-[#172131] px-3 transition focus-within:border-[#31d7c5] focus-within:shadow-[0_0_0_3px_rgba(49,215,197,.14)]">
                <LockKeyhole className="text-[#93a5bf]" size={18} />
                <input
                  aria-invalid={Boolean(error)}
                  autoComplete="current-password"
                  className="apex-login-input h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-base text-white outline-none placeholder:text-[#718198]"
                  name="password"
                  placeholder="Ingresa tu contraseña"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#9eacc2] text-[#263347] transition hover:bg-[#31d7c5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#31d7c5]"
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
          </div>

          {error ? <p className="mt-5 rounded border border-rose-400/40 bg-rose-950/30 px-3 py-2 text-sm font-semibold text-rose-200" id="login-error" role="alert">{error}</p> : null}

          <Button className="mt-8 h-13 w-full rounded bg-[#31d7c5] text-base font-bold text-[#10202b] shadow-[0_14px_35px_rgba(49,215,197,.16)] hover:bg-[#5ce4d6]" disabled={loading} type="submit">
            <LockKeyhole size={19} />
            {loading ? "Validando acceso..." : "Entrar de forma segura"}
            <ArrowRight size={20} />
          </Button>

          <div className="apex-login-footer mt-20 border-t border-[#526078] pt-8">
            <p className="apex-login-footer-copy flex items-center justify-center gap-2 text-center text-sm text-[#91a2bb]">
            <ShieldCheck className="text-[#31d7c5]" size={18} />
            Tus credenciales están protegidas y cifradas.
          </p>
          </div>
        </form>
        </div>
      </section>
    </main>
  );
}
