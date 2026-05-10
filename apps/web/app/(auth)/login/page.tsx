"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh");
      const data = await api<{ token: string; refresh: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem("token", data.token);
      if (data.refresh) localStorage.setItem("refresh", data.refresh);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <form className="w-full max-w-sm rounded-md border border-line bg-white p-6" onSubmit={submit}>
        <h1 className="mb-6 text-2xl font-semibold">Entrar a APEX</h1>
        <label className="mb-3 block text-sm">
          Correo electrónico
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mb-4 block text-sm">
          Contraseña
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
        <Button className="w-full" type="submit">
          <LogIn size={16} />
          Entrar
        </Button>
      </form>
    </main>
  );
}
