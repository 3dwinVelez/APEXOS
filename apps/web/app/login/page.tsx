"use client";

import { Button } from "@/components/ui/button";
import { touchSession } from "@/lib/sessionSecurity";
import { getSupabaseConfigStatus, supabaseAuth, supabaseFetch } from "@/lib/supabaseClient";
import { ArrowRight, Check, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
const LOGIN_ERROR_MESSAGE = "Credenciales no validas o sin acceso autorizado.";

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

function flattenRolePermissions(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((permission) => {
      const row = permission && typeof permission === "object" ? permission as AnyRow : {};
      const permissionModule = String(row.module || row.key || "").trim();
      const actions = Array.isArray(row.actions)
        ? row.actions
        : [row.action, ...Object.entries(row).filter(([, allowed]) => allowed === true).map(([action]) => action)];
      return actions.map((action) => ({ module: permissionModule, action: String(action || "").trim() })).filter((item) => item.module && item.action);
    });
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, Record<string, boolean>>).flatMap(([key, actions]) => (
      Object.entries(actions || {}).filter(([, allowed]) => allowed === true).map(([action]) => ({ module: key, action }))
    ));
  }
  return [];
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

  async function resolveSupabaseProfile(email: string) {
    const rows = await supabaseFetch<Array<{ user_type?: string; metadata?: { role_name?: string; profile_kind?: string; permissions?: unknown; role_type?: string; role_scope?: string } }>>(
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
          legacy_permissions: employee.metadata.permissions
        }));
      }
      localStorage.setItem("apexos_role_context_fetched_at", String(Date.now()));
    }
    if (technician && !roleName) localStorage.setItem("role_name", "Tecnico");
  }

  async function loginWithLocalApi(loginEmail: string, loginPassword: string) {
    if (!API_URL) throw new Error("API no configurada para este ambiente.");
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
      tenant?: { active_modules?: string[] };
      user?: { role?: string; role_permissions?: unknown[]; role_metadata?: Record<string, unknown> };
    }>;
  }

  async function loginWithCredentials(loginEmail: string, loginPassword: string) {
    setError(null);
    if (!loginEmail || !loginPassword) {
      setError("Ingresa correo electronico y contrasena.");
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
        if (data.user?.role) localStorage.setItem("role_name", data.user.role);
        if (Array.isArray(data.user?.role_permissions)) localStorage.setItem("role_permissions", JSON.stringify(data.user.role_permissions));
        if (data.user?.role_metadata) localStorage.setItem("role_metadata", JSON.stringify(data.user.role_metadata));
        if (Array.isArray(data.user?.role_permissions) || data.user?.role_metadata) localStorage.setItem("apexos_role_context_fetched_at", String(Date.now()));
      }
      touchSession();
      const roleName = localStorage.getItem("role_name")?.toLowerCase();
      document.documentElement.dataset.role = roleName || "";
      window.location.assign(roleName === "tecnico" ? "/dashboard/servicios" : "/dashboard");
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

  const accessNotes = [
    {
      icon: UserRound,
      title: "Accede con tus credenciales",
      copy: "asignadas por el administrador."
    },
    {
      icon: ShieldCheck,
      title: "Revisiones y producciones",
      copy: "se entregan fuera del repositorio."
    }
  ];

  const capabilities = ["Organiza", "Controla", "Automatiza", "Impulsa"];

  return (
    <main className="apex-public-shell relative min-h-screen overflow-hidden px-5 py-8 text-ink sm:px-8 lg:px-12">
      <div className="apex-public-glow pointer-events-none absolute inset-0" />
      <div className="apex-public-wave pointer-events-none absolute bottom-0 left-0 h-48 w-[42rem] max-w-full rounded-tr-full border-t opacity-80" />

      <section className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(25rem,31rem)]">
        <div className="max-w-3xl">
          <div className="mb-12 inline-flex items-center gap-3 text-apex">
            <span className="flex h-9 w-9 items-end justify-center">
              <span className="h-0 w-0 border-b-[1.9rem] border-l-[0.75rem] border-r-[0.75rem] border-b-apex border-l-transparent border-r-transparent" />
            </span>
            <span className="text-xl font-bold tracking-wide">APEX OS</span>
          </div>

          <h1 className="apex-public-title max-w-3xl text-5xl font-black leading-[0.98] tracking-normal sm:text-6xl lg:text-7xl">
            Enfocate en <span className="block text-apex">hacer crecer</span> tu empresa.
          </h1>

          <div className="apex-public-title mt-8 flex items-center gap-3 text-xl font-extrabold sm:text-2xl">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-apex text-white shadow-lg shadow-apex/20">
              <Check size={22} strokeWidth={3} />
            </span>
            <p><span className="text-apex">Apex OS</span> se encarga del resto.</p>
          </div>

          <div className="apex-public-strong mt-9 flex flex-wrap items-center gap-x-8 gap-y-4 text-sm font-bold sm:text-base">
            {capabilities.map((item, index) => (
              <div className="flex items-center gap-3" key={item}>
                {index > 0 ? <span className="hidden h-8 w-px bg-line sm:block" /> : null}
                <Sparkles className="text-apex" size={22} />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <p className="apex-public-muted mt-12 inline-flex items-center gap-2 text-sm font-medium sm:text-base">
            <ShieldCheck className="text-apex" size={20} />
            Seguro, <span className="text-apex">confiable</span> y siempre disponible.
          </p>
        </div>

        <form
          className="apex-public-card w-full rounded-[1.35rem] border p-6 backdrop-blur-xl sm:p-8"
          onSubmit={submit}
        >
          <div className="flex items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-apex/10 text-apex dark:bg-apex/15">
              <LockKeyhole size={31} strokeWidth={2.4} />
            </div>
            <div>
              <h2 className="apex-public-title text-2xl font-black">Acceso seguro</h2>
              <p className="mt-2 text-base font-bold text-apex">Tu informacion, siempre protegida.</p>
            </div>
          </div>

          <div className="my-7 h-px bg-line" />

          <div className="space-y-6">
            <label className="apex-public-title block text-sm font-bold">
              Correo electronico
              <span className="apex-login-field mt-2 flex h-12 items-center gap-3 rounded-md border px-3 shadow-sm transition focus-within:border-apex focus-within:shadow-[0_0_0_4px_rgb(var(--color-apex)/0.12)]">
                <Mail className="text-apex" size={18} />
                <input
                  className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-base outline-none placeholder:text-slate-400"
                  name="email"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
            </label>

            <label className="apex-public-title block text-sm font-bold">
              Contrasena
              <span className="apex-login-field mt-2 flex h-12 items-center gap-3 rounded-md border px-3 shadow-sm transition focus-within:border-apex focus-within:shadow-[0_0_0_4px_rgb(var(--color-apex)/0.12)]">
                <LockKeyhole className="text-apex" size={18} />
                <input
                  className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-base outline-none placeholder:text-slate-400"
                  name="password"
                  placeholder="Ingresa tu contrasena"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </span>
            </label>
          </div>

          {error ? <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}

          <Button className="mt-6 h-14 w-full rounded-md text-base" disabled={loading} type="submit">
            <LockKeyhole size={19} />
            {loading ? "Validando..." : "Entrar"}
            <ArrowRight size={20} />
          </Button>

          <div className="my-7 h-px bg-line" />

          <div className="space-y-5">
            {accessNotes.map(({ icon: Icon, title, copy }) => (
              <div className="flex gap-4" key={title}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-apex/10 text-apex dark:bg-apex/15">
                  <Icon size={23} strokeWidth={2.25} />
                </div>
                <p className="apex-public-copy text-sm leading-6">
                  <span className="apex-public-title block font-extrabold">{title}</span>
                  {copy}
                </p>
              </div>
            ))}
          </div>

          <p className="apex-public-muted mt-8 flex items-center justify-center gap-2 text-center text-sm font-medium">
            <ShieldCheck className="text-apex" size={18} />
            Seguridad empresarial de <span className="text-apex">nivel profesional.</span>
          </p>
        </form>
      </section>
    </main>
  );
}
