"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { ComercioNav } from "@/components/comercio-nav";
import { AccessDenied, Field, ModuleHeader, describeError, useComercioAccess } from "@/components/comercio/shared";

// Configuracion del comercio (GET/PUT /api/v1/comercio/settings). Identidad del negocio y
// nota pie del comprobante. Las preferencias visuales del HUD quedan en preferences_json,
// separadas de los datos de negocio.
type Settings = {
  store_name: string;
  currency: string;
  receipt_note: string | null;
  preferences: Record<string, unknown>;
  updated_at: string | null;
};

export default function ComercioConfiguracionPage() {
  const access = useComercioAccess();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ store_name: "", currency: "COP", receipt_note: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<Settings>("/api/v1/comercio/settings", { cache: "no-store" });
      setSettings(result);
      setForm({ store_name: result.store_name, currency: result.currency, receipt_note: result.receipt_note || "" });
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar la configuracion."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api<Settings>("/api/v1/comercio/settings", {
        method: "PUT",
        body: JSON.stringify({
          store_name: form.store_name.trim(),
          currency: form.currency.trim().toUpperCase(),
          receipt_note: form.receipt_note.trim() || null
        })
      });
      setSettings(result);
      setMessage("Configuracion guardada.");
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar la configuracion."));
    } finally {
      setSaving(false);
    }
  }

  if (!access.ready) return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Comercio...</div>;
  if (!access.canRead) return <AccessDenied />;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader subtitle="Datos del negocio para el comprobante y la operacion diaria. Afecta solo a este tenant." title="Configuracion del comercio" />
      <ComercioNav />
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="apex-section-card p-4">
        {loading || !settings ? (
          <p className="text-sm text-neutral-600">Cargando configuracion...</p>
        ) : (
          <form className="max-w-2xl space-y-4" onSubmit={save}>
            <Field label="Nombre del negocio">
              <input className="control" disabled={!access.canWrite} maxLength={120} onChange={(event) => setForm({ ...form, store_name: event.target.value })} required value={form.store_name} />
            </Field>
            <Field label="Moneda">
              <input className="control uppercase" disabled={!access.canWrite} maxLength={8} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} required value={form.currency} />
            </Field>
            <Field label="Pie del comprobante (opcional)">
              <textarea className="control" disabled={!access.canWrite} maxLength={300} onChange={(event) => setForm({ ...form, receipt_note: event.target.value })} rows={3} value={form.receipt_note} />
            </Field>
            <p className="text-xs text-neutral-500">
              Las preferencias de tema, letra y disposicion del HUD se guardan en el dispositivo (preferences_json), separadas de los datos de negocio.
              {settings.updated_at ? ` Ultima actualizacion: ${settings.updated_at.slice(0, 10)}.` : ""}
            </p>
            {access.canWrite ? (
              <div className="flex justify-end border-t border-line pt-4">
                <button className="btn-primary flex items-center gap-2" disabled={saving} type="submit"><Save size={14} /> {saving ? "Guardando..." : "Guardar configuracion"}</button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">Tu perfil solo puede consultar esta configuracion.</p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
