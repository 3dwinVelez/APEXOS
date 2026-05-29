"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { touchSession } from "@/lib/sessionSecurity";
import { getSupabaseConfigStatus, supabaseAuth } from "@/lib/supabaseClient";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loginWithCredentials(loginEmail: string, loginPassword: string) {
    setError(null);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh");
      localStorage.removeItem("auth_provider");
      localStorage.removeItem("user_email");
      localStorage.removeItem("tenant_active_modules");
      localStorage.removeItem("role_permissions");
      localStorage.removeItem("role_metadata");
      localStorage.removeItem("role_name");
      try {
        const data = await supabaseAuth.signInWithPassword(loginEmail, loginPassword);
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("refresh", data.refresh_token);
        localStorage.setItem("auth_provider", "supabase");
        localStorage.setItem("user_email", data.user.email || loginEmail);
      } catch (supabaseError) {
        if (!getSupabaseConfigStatus().ready) throw supabaseError;
        const data = await api<{
          token: string;
          refresh: string;
          tenant?: { active_modules?: string[] };
          user?: { role?: string; role_permissions?: unknown[]; role_metadata?: Record<string, unknown> };
        }>("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: loginEmail, password: loginPassword })
        });
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
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion");
    }
  }

  async function login(form: HTMLFormElement | null) {
    const formData = form ? new FormData(form) : new FormData();
    const loginEmail = String(formData.get("email") || email).trim();
    const loginPassword = String(formData.get("password") || password);
    await loginWithCredentials(loginEmail, loginPassword);
  }

  async function loginDemo() {
    setEmail("admin.demo@demo.apexos.local");
    setPassword("ApexOS-Demo-2026!");
    await loginWithCredentials("admin.demo@demo.apexos.local", "ApexOS-Demo-2026!");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login(event.currentTarget);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <form className="w-full max-w-sm rounded-md border border-line bg-white p-6" ref={formRef} onSubmit={submit}>
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
        <Button className="w-full" type="button" onClick={() => login(formRef.current)}>
          <LogIn size={16} />
          Entrar
        </Button>
        <button className="mt-3 h-10 w-full rounded-md border border-line bg-paper text-sm font-semibold text-neutral-700 hover:bg-white" type="button" onClick={loginDemo}>
          Entrar a muestra SCJ
        </button>
      </form>
    </main>
  );
}
