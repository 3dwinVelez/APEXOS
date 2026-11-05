"use client";

import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Copy, Globe, ImagePlus, Megaphone, Palette, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ComercioMessages, Field, ModuleHeader, comercioGate, describeError, useComercioAccess } from "@/components/comercio/shared";
import { buildStorefrontVars, DEFAULT_STOREFRONT_THEME, type StorefrontTheme } from "@/components/comercio/storefront-theme";
// El previsualizador del panel usa las mismas clases sf-* de la vitrina: lo que se ve
// aqui es literalmente lo que vera el cliente.
import "@/app/tienda/storefront.css";

// Configuracion del comercio (GET/PUT /api/v1/comercio/settings). Identidad del negocio y
// nota pie del comprobante. Las preferencias visuales del HUD quedan en preferences_json,
// separadas de los datos de negocio.
// Vitrina publica: el toggle genera/revoca el link corto /tienda/<code>; el boton de
// regenerar QUEMA el link anterior (los clientes deberan usar el nuevo).
// La apariencia (colores, textos del cartel y banner) se guarda en preferences_json.theme
// y la vitrina publica la pinta; aqui solo se edita y se previsualiza.
// Las campanas viven en la aplicacion Promociones: aqui solo se enlaza.
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
  theme: StorefrontTheme;
  preferences: Record<string, unknown>;
  updated_at: string | null;
};

// Paletas listas: el comercio escoge una y luego la ajusta. Incluyen fondos claros para
// que se vea que la vitrina invierte la escala de tintas, no solo pega un color nuevo.
const APPEARANCE_PRESETS: Array<{ label: string; accent: string; promo: string; base: string }> = [
  { label: "Bosque", accent: "#10b981", promo: "#e11d48", base: "#0a0a0a" },
  { label: "Oceano", accent: "#0ea5e9", promo: "#f97316", base: "#0b1220" },
  { label: "Ambar", accent: "#f59e0b", promo: "#b91c1c", base: "#171310" },
  { label: "Ciruela", accent: "#a855f7", promo: "#22c55e", base: "#140b1c" },
  { label: "Papel", accent: "#0f766e", promo: "#be123c", base: "#f8fafc" },
  { label: "Arena", accent: "#c2410c", promo: "#4d7c0f", base: "#faf5ef" }
];

// Los tres colores que edita el comercio. La vitrina deriva de ellos toda la escala
// (fondos, lineas, tintas y contrastes), por eso no se piden nueve campos.
const APPEARANCE_COLORS: Array<{ key: "accent" | "promo" | "base"; label: string; help: string }> = [
  { key: "accent", label: "Acento", help: "Botones, precios y el sello de la marca" },
  { key: "promo", label: "Promocion", help: "Descuentos y campanas activas" },
  { key: "base", label: "Fondo", help: "Claro u oscuro: la letra se invierte sola" }
];

// type="color" solo acepta #rrggbb completo: mientras se escribe el hex se muestra el
// color base para que el selector de tono no se quede vacio.
function pickerColor(value: string | null | undefined, fallback: string) {
  const text = String(value || "");
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

export default function ComercioConfiguracionPage() {
  const access = useComercioAccess();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ store_name: "", currency: "COP", receipt_note: "" });
  const [whatsapp, setWhatsapp] = useState("");
  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tagline, setTagline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [appearance, setAppearance] = useState<StorefrontTheme>(DEFAULT_STOREFRONT_THEME);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPrompt, setBannerPrompt] = useState("");
  const [confirmRemoveBanner, setConfirmRemoveBanner] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // El servidor devuelve el tema ya saneado (colores hex validos y URL del banner
  // resuelta por el API); aqui se copia al borrador que edita el usuario.
  const syncTheme = useCallback((result: Settings) => {
    setAppearance({ ...DEFAULT_STOREFRONT_THEME, ...(result.theme || {}) });
    setBannerPreview(result.theme?.banner_url || null);
  }, []);

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
      syncTheme(result);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar la configuracion."));
    } finally {
      setLoading(false);
    }
  }, [syncTheme]);

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
      syncTheme(result);
      setMessage(doneMessage);
    } catch (caught) {
      setError(describeError(caught, "No fue posible actualizar la vitrina publica."));
    } finally {
      setCatalogBusy(false);
    }
  }

  // Frase, contacto y redes se guardan juntos: un solo PUT deja la vitrina completa
  // y evita una tanda de botones de guardar por campo suelto.
  async function saveVitrine(event: FormEvent) {
    event.preventDefault();
    await saveCatalog(
      {
        catalog_tagline: tagline.trim() || null,
        catalog_whatsapp: whatsapp.trim() || null,
        catalog_facebook: facebook.trim() || null,
        catalog_instagram: instagram.trim() || null
      },
      "Vitrina guardada."
    );
  }

  // --- Apariencia de la vitrina ---
  function setColor(key: "accent" | "promo" | "base", value: string) {
    setAppearance((current): StorefrontTheme => ({ ...current, [key]: value }));
  }

  // Colores y textos del cartel viajan como parche parcial: lo que no se envio no cambia.
  async function saveAppearance() {
    setAppearanceBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<Settings>("/api/v1/comercio/settings/storefront/theme", {
        method: "PUT",
        body: JSON.stringify({
          accent: appearance.accent,
          promo: appearance.promo,
          base: appearance.base,
          headline: appearance.headline?.trim() || null,
          subhead: appearance.subhead?.trim() || null
        })
      });
      setSettings(result);
      syncTheme(result);
      setMessage("Apariencia guardada. Refresca la vitrina para verla como la ve tu cliente.");
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar la apariencia de la vitrina."));
    } finally {
      setAppearanceBusy(false);
    }
  }

  // El banner se sube al bucket del comercio; el API responde con una URL firmada para el
  // previsualizador inmediato y con la URL publica que usara la vitrina.
  async function sendBanner(request: { method: "POST" | "DELETE"; body?: FormData | string }) {
    setAppearanceBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<Settings & { banner_url?: string }>("/api/v1/comercio/settings/storefront/banner", {
        method: request.method,
        ...(request.body ? { body: request.body } : {})
      });
      setSettings(result);
      syncTheme(result);
      if (request.method === "POST") setBannerPreview(result.banner_url || result.theme?.banner_url || null);
      else setBannerPreview(null);
      setMessage(request.method === "POST" ? "Banner actualizado en la vitrina." : "Banner eliminado: la vitrina vuelve al fondo degradado.");
    } catch (caught) {
      setError(describeError(caught, "No fue posible actualizar el banner."));
    } finally {
      setAppearanceBusy(false);
      setConfirmRemoveBanner(false);
    }
  }

  async function uploadBanner() {
    if (!bannerFile) {
      setError("Escoge primero una imagen PNG, JPEG o WEBP.");
      return;
    }
    const body = new FormData();
    body.append("file", bannerFile);
    await sendBanner({ method: "POST", body });
    setBannerFile(null);
  }

  // Generacion con modelo gratuito: el proveedor trabaja sin cuenta ni clave, por eso el
  // boton avisa que puede tardar y que la imagen se puede reemplazar cuando no convenza.
  async function generateBanner() {
    const prompt = bannerPrompt.trim();
    if (prompt.length < 4) {
      setError("Escribe una descripcion de al menos 4 caracteres para generar el banner.");
      return;
    }
    setAppearanceBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<Settings & { banner_url?: string }>("/api/v1/comercio/settings/storefront/generate-image", {
        method: "POST",
        body: JSON.stringify({ prompt })
      });
      setSettings(result);
      syncTheme(result);
      setBannerPreview(result.banner_url || result.theme?.banner_url || null);
      setMessage("Banner generado. Si no te convence, vuelve a generarlo o sube tu propia imagen.");
    } catch (caught) {
      setError(describeError(caught, "El generador de imagenes no esta disponible ahora. Intenta con una imagen propia."));
    } finally {
      setAppearanceBusy(false);
    }
  }

  async function regenerateCode() {    if (!confirmRegen) {
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

  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader eyebrow="M-30 · Configuracion" subtitle="Datos del negocio para el comprobante y la operacion diaria. Afecta solo a este tenant." title="Configuracion del comercio" />
      <ComercioMessages error={error} message={message} />

      <section className="apex-section-card p-4">
        {loading || !settings ? (
          <p className="text-sm text-content-body">Cargando configuracion...</p>
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
            <p className="text-xs text-content-muted">
              Las preferencias de tema, letra y disposicion del HUD se guardan en el dispositivo (preferences_json), separadas de los datos de negocio.
              {settings.updated_at ? ` Ultima actualizacion: ${settings.updated_at.slice(0, 10)}.` : ""}
            </p>
            {access.canWrite ? (
              <div className="flex justify-end border-t border-line pt-4">
                <button className="apex-primary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={saving} type="submit"><Save size={14} /> {saving ? "Guardando..." : "Guardar configuracion"}</button>
              </div>
            ) : (
              <p className="text-xs text-content-muted">Tu perfil solo puede consultar esta configuracion.</p>
            )}
          </form>
        )}
      </section>

      <section aria-label="Vitrina publica" className="apex-section-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Globe size={15} /> Vitrina publica</p>
            <p className="mt-1 text-xs text-content-muted">Link corto para que tus clientes vean productos, precios y disponibilidad, y te pidan por WhatsApp. Solo se muestran los productos activos; nunca el costo ni el stock.</p>
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
                <button className="h-7 min-h-0 apex-secondary-action flex items-center gap-2 whitespace-nowrap px-3 text-xs font-semibold" disabled={!access.canWrite || catalogBusy} onClick={() => void copyLink()} type="button"><Copy size={13} /> Copiar</button>
                <button
                  className={`flex items-center gap-2 whitespace-nowrap rounded-control border px-3 text-xs ${confirmRegen ? "border-error/40 bg-error/10 text-error" : "border-line text-content-body hover:bg-surface-muted"}`}
                  disabled={!access.canWrite || catalogBusy}
                  onBlur={() => setConfirmRegen(false)}
                  onClick={() => void regenerateCode()}
                  type="button"
                >
                  <RefreshCw size={13} /> {confirmRegen ? "Confirmar: quema el link actual" : "Regenerar"}
                </button>
              </div>
            </Field>
            {copied ? <p className="text-xs font-medium text-success">{copied.startsWith("http") ? copied : "Link copiado al portapapeles."}</p> : null}
            {/* Un solo formulario para todo lo de la vitrina (frase, contacto, redes y
                campana): evita un boton de guardar por campo. */}
            <form className="space-y-3" onSubmit={saveVitrine}>
              <Field label="Frase de la vitrina (opcional)">
                <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={160} onChange={(event) => setTagline(event.target.value)} placeholder="Todo el sabor de la casa" value={tagline} />
              </Field>
              <Field label="WhatsApp para pedidos (con codigo de pais, ej. +573001112233)">
                <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={32} onChange={(event) => setWhatsapp(event.target.value)} placeholder="+57..." value={whatsapp} />
              </Field>
              {!whatsapp.trim() ? <p className="text-xs text-warning">Sin numero de WhatsApp, la vitrina muestra los productos pero el boton de pedido queda deshabilitado.</p> : null}

              <div className="apex-section-card-muted/40 p-3">
                <p className="text-xs font-semibold text-content-body">Redes sociales de contacto</p>
                <p className="mt-0.5 text-xs text-content-muted">Aparecen como iconos en la vitrina (arriba y al pie). Puedes escribir solo el usuario o la URL completa; se guarda como enlace https.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Instagram (usuario o URL)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={200} onChange={(event) => setInstagram(event.target.value)} placeholder="instagram.com/mitienda" value={instagram} />
                  </Field>
                  <Field label="Facebook (URL de la pagina)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={200} onChange={(event) => setFacebook(event.target.value)} placeholder="facebook.com/mitienda" value={facebook} />
                  </Field>
                </div>
              </div>

              <div className="apex-section-card-muted/40 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-content-body"><Megaphone size={14} /> Campanas y descuentos</p>
                <p className="mt-0.5 text-xs text-content-muted">
                  Las promociones tienen su propia aplicacion: varias campanas a la vez, segmentos por categoria o producto, envio por WhatsApp a tus clientes y registro de a quien ya le escribiste.
                </p>
                <Link className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-apex" href="/dashboard/comercio/promociones">
                  Abrir Promociones
                </Link>
              </div>

              {access.canWrite ? (
                <div className="flex justify-end">
                  <button className="apex-primary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={catalogBusy} type="submit"><Save size={13} /> {catalogBusy ? "Guardando..." : "Guardar vitrina"}</button>
                </div>
              ) : (
                <p className="text-xs text-content-muted">Tu perfil solo puede consultar la vitrina.</p>
              )}
            </form>
          </div>
        ) : (
          <p className="mt-3 text-xs text-content-muted">Activa la vitrina para generar el primer link publico.</p>
        )}
      </section>

      {settings?.catalog_code ? (
        <section aria-label="Apariencia de la vitrina" className="apex-section-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold"><Palette size={15} /> Apariencia de la vitrina</p>
              <p className="mt-1 max-w-2xl text-xs text-content-muted">
                Los tres colores definen toda la pagina: la vitrina deriva los fondos, las lineas y el contraste del texto, e invierte la paleta si eliges un fondo claro.
                El cartel es la franja grande arriba: puedes subir tu foto, generarla con el modelo gratuito o dejar solo el fondo degradado con tu titular.
              </p>
            </div>
            <Link className="apex-secondary-action flex items-center gap-2 whitespace-nowrap px-3 text-xs font-semibold" href={`/tienda/${settings.catalog_code}`} target="_blank">Ver vitrina <Globe size={13} /></Link>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="space-y-4">
              <Field label="Paletas listas">
                <div className="flex flex-wrap gap-2">
                  {APPEARANCE_PRESETS.map((preset) => (
                    <button
                      className="flex items-center gap-2 rounded-control border border-line px-2.5 py-1.5 text-xs font-medium text-content-body transition hover:bg-surface-muted"
                      disabled={!access.canWrite || appearanceBusy}
                      key={preset.label}
                      onClick={() => setAppearance({ ...appearance, accent: preset.accent, promo: preset.promo, base: preset.base })}
                      title={`${preset.accent} · ${preset.promo} · ${preset.base}`}
                      type="button"
                    >
                      <span className="flex overflow-hidden rounded-full">
                        {[preset.accent, preset.promo, preset.base].map((hex) => <span className="h-4 w-2.5" key={hex} style={{ backgroundColor: hex }} />)}
                      </span>
                      {preset.label}
                    </button>
                  ))}
                  <button
                    className="rounded-control border border-line px-2.5 py-1.5 text-xs font-medium text-content-muted transition hover:bg-surface-muted"
                    disabled={!access.canWrite || appearanceBusy}
                    onClick={() => setAppearance({ ...DEFAULT_STOREFRONT_THEME, headline: appearance.headline, subhead: appearance.subhead })}
                    type="button"
                  >
                    Restaurar colores
                  </button>
                </div>
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                {APPEARANCE_COLORS.map((color) => (
                  <Field key={color.key} label={color.label}>
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={`${color.label} (selector de tono)`}
                        className="h-9 w-11 shrink-0 cursor-pointer rounded-control border border-line bg-transparent p-1 disabled:cursor-not-allowed"
                        disabled={!access.canWrite || appearanceBusy}
                        onChange={(event) => setColor(color.key, event.target.value)}
                        type="color"
                        value={pickerColor(appearance[color.key], DEFAULT_STOREFRONT_THEME[color.key])}
                      />
                      <input
                        aria-label={color.label}
                        className="control font-mono text-xs uppercase"
                        disabled={!access.canWrite || appearanceBusy}
                        maxLength={7}
                        onChange={(event) => setColor(color.key, event.target.value)}
                        value={appearance[color.key]}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-content-muted">{color.help}</p>
                  </Field>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Titular del cartel (opcional, 80 caracteres)">
                  <input className="control" disabled={!access.canWrite || appearanceBusy} maxLength={80} onChange={(event) => setAppearance({ ...appearance, headline: event.target.value })} placeholder="El sabor de la casa, en tu puerta" value={appearance.headline || ""} />
                </Field>
                <Field label="Subtitulo del cartel (opcional, 140 caracteres)">
                  <input className="control" disabled={!access.canWrite || appearanceBusy} maxLength={140} onChange={(event) => setAppearance({ ...appearance, subhead: event.target.value })} placeholder="Pide por WhatsApp y recibe hoy mismo" value={appearance.subhead || ""} />
                </Field>
              </div>
              <p className="text-[11px] text-content-muted">Sin titular, la vitrina usa la frase de la seccion anterior; sin subtitulo, escribe la ayuda de pedido.</p>

              <div className="apex-section-card-muted/40 space-y-3 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-content-body"><ImagePlus size={14} /> Banner de la vitrina</p>
                <p className="text-xs text-content-muted">PNG, JPEG o WEBP de hasta 5 MB. Se recomienda una imagen ancha (por ejemplo 1600x600): cubre la parte superior y la letra se mantiene legible sobre ella.</p>
                <Field label="Subir imagen propia">
                  <input accept="image/png,image/jpeg,image/webp" className="control" disabled={!access.canWrite || appearanceBusy} onChange={(event) => setBannerFile(event.target.files?.[0] || null)} type="file" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button className="apex-primary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={!access.canWrite || appearanceBusy || !bannerFile} onClick={() => void uploadBanner()} type="button">
                    <ImagePlus size={14} /> {appearanceBusy ? "Trabajando..." : "Subir banner"}
                  </button>
                  {bannerPreview ? (
                    <button
                      className={`flex items-center gap-2 rounded-control border px-3 text-xs ${confirmRemoveBanner ? "border-error/40 bg-error/10 text-error" : "border-line text-content-body hover:bg-surface-muted"}`}
                      disabled={!access.canWrite || appearanceBusy}
                      onBlur={() => setConfirmRemoveBanner(false)}
                      onClick={() => {
                        if (!confirmRemoveBanner) { setConfirmRemoveBanner(true); return; }
                        void sendBanner({ method: "DELETE" });
                      }}
                      type="button"
                    >
                      <Trash2 size={13} /> {confirmRemoveBanner ? "Confirmar: quita el banner" : "Quitar banner"}
                    </button>
                  ) : null}
                </div>

                <div className="border-t border-line pt-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-content-body"><Sparkles size={14} /> Generar con modelo gratuito</p>
                  <p className="mt-0.5 text-xs text-content-muted">Describe la imagen y el generador la sube como banner. Puede tardar unos segundos; si el resultado no convence, gener otra o sube tu foto.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="control min-w-[14rem] flex-1"
                      disabled={!access.canWrite || appearanceBusy}
                      maxLength={300}
                      onChange={(event) => setBannerPrompt(event.target.value)}
                      placeholder="Banner ancho de cafeteria con taza humeante, tonos calidos"
                      value={bannerPrompt}
                    />
                    <button className="apex-primary-action flex items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold" disabled={!access.canWrite || appearanceBusy || bannerPrompt.trim().length < 4} onClick={() => void generateBanner()} type="button">
                      <Sparkles size={14} /> {appearanceBusy ? "Generando..." : "Generar banner"}
                    </button>
                  </div>
                </div>
              </div>

              {access.canWrite ? (
                <div className="flex justify-end border-t border-line pt-4">
                  <button className="apex-primary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={appearanceBusy} onClick={() => void saveAppearance()} type="button">
                    <Save size={13} /> {appearanceBusy ? "Guardando..." : "Guardar apariencia"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-content-muted">Tu perfil solo puede consultar la apariencia.</p>
              )}
            </div>

            {/* Previsualizacion: el mismo motor de variables CSS de la vitrina, aplicado al
                borrador sin guardar, para ver el resultado antes de publicarlo. */}
            <div aria-label="Previsualizacion de la vitrina" className="overflow-hidden rounded-control border border-line">
              <div className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-muted">Previa · como se vera</div>
              <div className="sf-bg-base sf-text-strong" style={buildStorefrontVars({ ...appearance, banner_url: bannerPreview }) as CSSProperties}>
                <div className="relative min-h-[9rem] overflow-hidden p-4">
                  {bannerPreview ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="" aria-hidden="true" className="sf-banner-img" src={bannerPreview} />
                      <div className="sf-banner-scrim absolute inset-0" />
                    </>
                  ) : (
                    <div className="sf-grad-hero absolute inset-0" />
                  )}
                  <div className={`relative z-10${bannerPreview ? " sf-on-photo" : ""}`}>
                    <p className="text-[10px] font-black uppercase tracking-wide sf-text-accent">{settings?.store_name || "Mi comercio"}</p>
                    <p className="mt-1 text-base font-black leading-snug sf-text-strong">{appearance.headline?.trim() || settings?.catalog_tagline?.trim() || "Todo el catalogo, al momento"}</p>
                    <p className="mt-1 text-xs sf-text-body">{appearance.subhead?.trim() || "Escoge por rubro, arma el pedido y envialo por WhatsApp."}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="sf-btn-promo rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">-20%</span>
                      <span className="sf-text-faint line-through">$12.000</span>
                      <span className="text-sm font-black sf-text-accent">$9.600</span>
                      <span className="sf-btn-accent sf-text-on-accent rounded-full px-3 py-1 text-[11px] font-bold">Pedir por WhatsApp</span>
                    </div>
                  </div>
                </div>
                <div className="border-t sf-border-line p-4">
                  <div className="sf-bg-surface rounded-xl p-3">
                    <p className="text-xs font-bold sf-text-body">Producto de ejemplo</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-black sf-text-accent">$9.600</span>
                      <span className="sf-btn-accent-solid rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Disponible</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
