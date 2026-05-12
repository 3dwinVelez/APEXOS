"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";
import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ company_name: "", industry: "retail", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const data = await api<AuthResponse>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(form)
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("refresh", data.refresh);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la empresa");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <form className="w-full max-w-md rounded-md border border-line bg-white p-6" onSubmit={submit}>
        <h1 className="mb-6 text-2xl font-semibold">Crear empresa en APEX</h1>
        {[
          ["company_name", "Empresa"],
          ["name", "Tu nombre"],
          ["email", "Correo electronico"],
          ["password", "Contrasena"]
        ].map(([key, label]) => (
          <label className="mb-3 block text-sm" key={key}>
            {label}
            <input
              className="mt-1 h-10 w-full rounded-md border border-line px-3"
              type={key === "password" ? "password" : "text"}
              value={form[key as keyof typeof form]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
            />
          </label>
        ))}
        <label className="mb-4 block text-sm">
          Industria
          <select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })}>
            <option value="retail">Comercio</option>
            <option value="restaurant">Restaurante</option>
            <option value="manufacturing">Manufactura</option>
            <option value="construction">Construccion</option>
            <option value="health">Salud</option>
          </select>
        </label>
        {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
        <Button className="w-full" type="submit">
          <Building2 size={16} />
          Crear cuenta
        </Button>
      </form>
    </main>
  );
}
