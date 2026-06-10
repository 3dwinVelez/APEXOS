"use client";

import { Button } from "@/components/ui/button";
import { touchSession } from "@/lib/sessionSecurity";
import { getSupabaseConfigStatus, supabaseAuth } from "@/lib/supabaseClient";
import { LogIn } from "lucide-react";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      let authenticatedWithSupabase = false;
      let supabaseLoginError: unknown = null;
      if (getSupabaseConfigStatus().ready) {
        try {
          const data = await supabaseAuth.signInWithPassword(loginEmail, loginPassword);
          localStorage.setItem("token", data.access_token);
          localStorage.setItem("refresh", data.refresh_token);
          localStorage.setItem("auth_provider", "supabase");
          localStorage.setItem("user_email", data.user.email || loginEmail);
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
      }
      touchSession();
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion");
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

  function fillDemoEmail() {
    setEmail("scj@apexos.qa");
    setPassword("");
    setError("Usuario SCJ seleccionado. Ingresa la clave QA asignada.");
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
        {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
        <Button className="w-full" disabled={loading} type="submit">
          <LogIn size={16} />
          {loading ? "Validando..." : "Entrar"}
        </Button>
        <button className="mt-3 h-10 w-full rounded-md border border-line bg-paper text-sm font-semibold text-neutral-700 hover:bg-white" type="button" onClick={fillDemoEmail}>
          Usar administrador SCJ QA
        </button>
      </form>
    </main>
  );
}
