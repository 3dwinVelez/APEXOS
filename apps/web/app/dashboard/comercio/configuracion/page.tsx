"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, Globe, RefreshCw, Save } from "lucide-react";
import { api } from "@/lib/api";
import { AccessDenied, Field, ModuleHeader, StatusPill, describeError, useComercioAccess } from "@/components/comercio/shared";

// Configuracion del comercio (GET/PUT /api/v1/comercio/settings). Identidad del negocio y
// nota pie del comprobante. Las preferencias visuales del HUD quedan en preferences_json,
// separadas de los datos de negocio.
// Vitrina publica: el toggle genera/revoca el link corto /tienda/<code>; el boton de
// regenerar QUEMA el link anterior (los clientes deberan usar el nuevo).
// La campana (catalog_promo_*) es el descuento de toda la vitrina: rige solo con
// porcentaje > 0 y dentro de la ventana, que es inclusiva por ambos extremos.
type Settings = {
  store_name: string;
  currency: string;
  receipt_note: string | null;
  catalog_enabled: boolean;
  catalog_code: string | null;
  catalog_whatsapp: string | null;
  catalog_facebook: string | null;
  catalog_instagram: string | null;
  catalog_tagline: string | null;
  catalog_promo_label: string | null;
  catalog_promo_percent: number;
  catalog_promo_start: string | null;
  catalog_promo_end: string | null;
  preferences: Record<string, unknown>;
  updated_at: string | null;
};

// El API publica las fechas como fecha de negocio (AAAA-MM-DD), el formato exacto que
// espera un input type=date, asi que se devuelven tal cual al guardar.
type PromoForm = { label: string; percent: string; start: string; end: string };

const emptyPromo: PromoForm = { label: "", percent: "0", start: "", end: "" };

function promoFromSettings(settings: Settings): PromoForm {
  return {
    label: settings.catalog_promo_label || "",
    percent: String(settings.catalog_promo_percent ?? 0),
    start: settings.catalog_promo_start || "",
    end: settings.catalog_promo_end || ""
  };
}

export default function ComercioConfiguracionPage() {
  const access = useComercioAccess();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ store_name: "", currency: "COP", receipt_note: "" });
  const [whatsapp, setWhatsapp] = useState("");
  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tagline, setTagline] = useState("");
  const [promo, setPromo] = useState<PromoForm>(emptyPromo);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<Settings>("/api/v1/comercio/settings", { cache: "no-store" });
      setSettings(result);
      setForm({ store_name: result.store_name, currency: result.currency, receipt_note: result.receipt_note || "" });
      setWhatsapp(result.catalog_whatsapp || "");
      setFacebook(result.catalog_facebook || "");
      setInstagram(result.catalog_instagram || "");
      setTagline(result.catalog_tagline || "");
      setPromo(promoFromSettings(result));
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

  async function saveCatalog(patch: Record<string, unknown>, doneMessage: string) {
    setCatalogBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<Settings>("/api/v1/comercio/settings", { method: "PUT", body: JSON.stringify(patch) });
      setSettings(result);
      setWhatsapp(result.catalog_whatsapp || "");
      setFacebook(result.catalog_facebook || "");
      setInstagram(result.catalog_instagram || "");
      setTagline(result.catalog_tagline || "");
      setPromo(promoFromSettings(result));
      setMessage(doneMessage);
    } catch (caught) {
      setError(describeError(caught, "No fue posible actualizar la vitrina publica."));
    } finally {
      setCatalogBusy(false);
    }
  }

  // Frase, contacto, redes y campana se guardan juntas: un solo PUT deja la vitrina
  // completa y evita una tanda de botones de guardar por campo suelto.
  async function saveVitrine(event: FormEvent) {
    event.preventDefault();
    const percent = Number(promo.percent || 0);
    await saveCatalog(
      {
        catalog_tagline: tagline.trim() || null,
        catalog_whatsapp: whatsapp.trim() || null,
        catalog_facebook: facebook.trim() || null,
        catalog_instagram: instagram.trim() || null,
        catalog_promo_label: promo.label.trim() || null,
        catalog_promo_percent: percent,
        catalog_promo_start: promo.start || null,
        catalog_promo_end: promo.end || null
      },
      percent > 0 ? `Vitrina guardada. Campana activa: -${percent}% en toda la tienda.` : "Vitrina guardada sin campana de descuento."
    );
  }

  async function regenerateCode() {
    if (!confirmRegen) {
      setConfirmRegen(true);
      return;
    }
    setConfirmRegen(false);
    setCatalogBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<Settings>("/api/v1/comercio/settings/catalog/regenerate", { method: "POST", body: JSON.stringify({}) });
      setSettings(result);
      setMessage("Link regenerado. Comparte la nueva direccion: la anterior dejo de funcionar.");
    } catch (caught) {
      setError(describeError(caught, "No fue posible regenerar el link."));
    } finally {
      setCatalogBusy(false);
    }
  }

  async function copyLink() {
    if (!settings?.catalog_code) return;
    const link = `${window.location.origin}/tienda/${settings.catalog_code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied("Link copiado.");
    } catch {
      setCopied(link);
    }
    setTimeout(() => setCopied(""), 4000);
  }

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

  // La campana solo rige con porcentaje > 0 y dentro de la ventana (extremos inclusivos),
  // igual que el servicio, para reflejar el estado guardado sin otra consulta.
  const savedPercent = Number(settings?.catalog_promo_percent || 0);
  const today = new Date().toLocaleDateString("en-CA");
  const campaignActiveNow = savedPercent > 0
    && (!settings?.catalog_promo_start || settings.catalog_promo_start <= today)
    && (!settings?.catalog_promo_end || settings.catalog_promo_end >= today);

  if (!access.ready) return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Comercio...</div>;
  if (!access.canRead) return <AccessDenied />;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader subtitle="Datos del negocio para el comprobante y la operacion diaria. Afecta solo a este tenant." title="Configuracion del comercio" />
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

      <section aria-label="Vitrina publica" className="apex-section-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Globe size={15} /> Vitrina publica</p>
            <p className="mt-1 text-xs text-neutral-500">Link corto para que tus clientes vean productos, precios y disponibilidad, y te pidan por WhatsApp. Solo se muestran los productos activos; nunca el costo ni el stock.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={Boolean(settings?.catalog_enabled)}
              disabled={!access.canWrite || catalogBusy || loading}
              onChange={(event) => void saveCatalog({ catalog_enabled: event.target.checked }, event.target.checked ? "Vitrina activada: el link ya esta funcionando." : "Vitrina desactivada: el link publico no muestra nada.")}
              type="checkbox"
            />
            <span className="font-medium">{settings?.catalog_enabled ? "Publicada" : "Privada"}</span>
          </label>
        </div>

        {settings?.catalog_code ? (
          <div className="mt-4 space-y-3">
            <Field label="Link publico">
              <div className="flex gap-2">
                <input className="control flex-1 font-mono text-xs" readOnly value={`${typeof window === "undefined" ? "" : window.location.origin}/tienda/${settings.catalog_code}`} />
                <button className="btn-secondary flex items-center gap-2 whitespace-nowrap px-3 text-xs" disabled={!access.canWrite || catalogBusy} onClick={() => void copyLink()} type="button"><Copy size={13} /> Copiar</button>
                <button
                  className={`flex items-center gap-2 whitespace-nowrap rounded-md border px-3 text-xs ${confirmRegen ? "border-red-300 bg-red-50 text-red-700" : "border-line text-neutral-600 hover:bg-neutral-50"}`}
                  disabled={!access.canWrite || catalogBusy}
                  onBlur={() => setConfirmRegen(false)}
                  onClick={() => void regenerateCode()}
                  type="button"
                >
                  <RefreshCw size={13} /> {confirmRegen ? "Confirmar: quema el link actual" : "Regenerar"}
                </button>
              </div>
            </Field>
            {copied ? <p className="text-xs font-medium text-emerald-600">{copied.startsWith("http") ? copied : "Link copiado al portapapeles."}</p> : null}
            {/* Un solo formulario para todo lo de la vitrina (frase, contacto, redes y
                campana): evita un boton de guardar por campo. */}
            <form className="space-y-3" onSubmit={saveVitrine}>
              <Field label="Frase de la vitrina (opcional)">
                <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={160} onChange={(event) => setTagline(event.target.value)} placeholder="Todo el sabor de la casa" value={tagline} />
              </Field>
              <Field label="WhatsApp para pedidos (con codigo de pais, ej. +573001112233)">
                <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={32} onChange={(event) => setWhatsapp(event.target.value)} placeholder="+57..." value={whatsapp} />
              </Field>
              {!whatsapp.trim() ? <p className="text-xs text-amber-600">Sin numero de WhatsApp, la vitrina muestra los productos pero el boton de pedido queda deshabilitado.</p> : null}

              <div className="rounded-md border border-line bg-paper/40 p-3">
                <p className="text-xs font-semibold text-neutral-600">Redes sociales de contacto</p>
                <p className="mt-0.5 text-xs text-neutral-500">Aparecen como iconos en la vitrina (arriba y al pie). Puedes escribir solo el usuario o la URL completa; se guarda como enlace https.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Instagram (usuario o URL)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={200} onChange={(event) => setInstagram(event.target.value)} placeholder="instagram.com/mitienda" value={instagram} />
                  </Field>
                  <Field label="Facebook (URL de la pagina)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={200} onChange={(event) => setFacebook(event.target.value)} placeholder="facebook.com/mitienda" value={facebook} />
                  </Field>
                </div>
              </div>

              <div className="rounded-md border border-line bg-paper/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-neutral-600">Campana de descuentos de la vitrina</p>
                  <StatusPill tone={campaignActiveNow ? "warn" : "muted"}>
                    {campaignActiveNow ? `Vigente hoy -${savedPercent}%` : "Sin campana vigente"}
                  </StatusPill>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  El porcentaje rebaja el precio de lista en toda la vitrina y en el mostrador. Si un producto tiene un descuento propio mayor, ese producto conserva el suyo: los descuentos nunca se suman.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre de la campana">
                    <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={80} onChange={(event) => setPromo({ ...promo, label: event.target.value })} placeholder="Liquidacion de temporada" value={promo.label} />
                  </Field>
                  <Field label="Descuento (0 a 90%)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} max={90} min={0} onChange={(event) => setPromo({ ...promo, percent: event.target.value })} step="0.5" type="number" value={promo.percent} />
                  </Field>
                  <Field label="Vigente desde (opcional)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} onChange={(event) => setPromo({ ...promo, start: event.target.value })} type="date" value={promo.start} />
                  </Field>
                  <Field label="Vigente hasta (opcional)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} onChange={(event) => setPromo({ ...promo, end: event.target.value })} type="date" value={promo.end} />
                  </Field>
                </div>
              </div>

              {access.canWrite ? (
                <div className="flex justify-end">
                  <button className="btn-primary flex items-center gap-2" disabled={catalogBusy} type="submit"><Save size={13} /> {catalogBusy ? "Guardando..." : "Guardar vitrina"}</button>
                </div>
              ) : (
                <p className="text-xs text-neutral-500">Tu perfil solo puede consultar la vitrina.</p>
              )}
            </form>
          </div>
        ) : (
          <p className="mt-3 text-xs text-neutral-500">Activa la vitrina para generar el primer link publico.</p>
        )}
      </section>
    </div>
  );
}
