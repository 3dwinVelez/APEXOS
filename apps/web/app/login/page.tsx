"use client";

import { Button } from "@/components/ui/button";
import { touchSession } from "@/lib/sessionSecurity";
import { getSupabaseConfigStatus, supabaseAuth, supabaseFetch } from "@/lib/supabaseClient";
import { LogIn } from "lucide-react";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resolveSupabaseProfile(email: string) {
    const rows = await supabaseFetch<Array<{ user_type?: string; metadata?: { role_name?: string; profile_kind?: string; permissions?: unknown; role_type?: string; role_scope?: string } }>>(
      `/rest/v1/employees?select=user_type,metadata&email=eq.${encodeURIComponent(email)}&status=eq.active&limit=1`
    ).catch(() => []);
    const employee = rows[0];
    const profileKind = employee?.metadata?.profile_kind?.toLowerCase() || employee?.user_type?.toLowerCase() || "";
    const roleName = employee?.metadata?.role_name || (profileKind === "tecnico" ? "Tecnico" : "");
    const technician = employee?.user_type?.toLowerCase() === "tecnico"
      || employee?.metadata?.profile_kind?.toLowerCase() === "tecnico"
      || employee?.metadata?.role_name?.toLowerCase() === "tecnico";
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <form className="w-full max-w-sm rounded-md border border-line bg-white p-6" onSubmit={submit}>
        <h1 className="mb-6 text-2xl font-semibold">Entrar a APEX</h1>
        <label className="mb-3 block text-sm">
          Correo electronico
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3" name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="mb-4 block text-sm">
          Contrasena
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</p> : null}
        <Button className="w-full" disabled={loading} type="submit">
          <LogIn size={16} />
          {loading ? "Validando..." : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
