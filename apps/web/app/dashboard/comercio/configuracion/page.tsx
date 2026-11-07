"use client";

import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Building2, Copy, Globe, ImagePlus, Layers, Megaphone, Monitor, Palette, RefreshCw, Save, Shapes, Smartphone, Sparkles, Trash2 } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { api } from "@/lib/api";
import { ComercioMessages, Field, ModuleHeader, comercioGate, describeError, useComercioAccess } from "@/components/comercio/shared";
import { Skeleton } from "@/components/ui/feedback";
import { buildStorefrontVars, contrastRatioHex, DEFAULT_STOREFRONT_THEME, tripletToHex, type BackgroundPattern, type BannerScrim, type CornerRadius, type StorefrontTheme, type SurfaceDepth, type SurfaceTint } from "@/components/comercio/storefront-theme";
// El previsualizador del panel usa las mismas clases sf-* de la vitrina: lo que se ve
// aqui es literalmente lo que vera el cliente.
import "@/app/tienda/storefront.css";

// Configuracion del comercio. Se organiza en tres pestanas porque son tres asuntos que se
// guardan por separado (negocio, vitrina, apariencia) y mezclarlos en una sola hoja de 900
// campos hacia imposible encontrar algo.
//   · Negocio     -> GET/PUT /api/v1/comercio/settings (identidad y pie del comprobante).
//   · Vitrina     -> el link corto /tienda/<code>, su frase, contacto y redes.
//   · Apariencia  -> PUT /comercio/settings/storefront/theme + banner (subir/borrar/generar).
// La vitrina publica se pinta SOLO con lo que se edita aqui: el comercio elige tres colores
// y cinco modos, y storefront-theme.ts deriva el resto midiendo contraste.
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

type TabId = "negocio" | "vitrina" | "apariencia";

// Paletas listas: el comercio escoge una y luego la ajusta. Incluyen fondos claros para
// que se vea que la vitrina invierte la escala de tintas, no solo pega un color nuevo.
const APPEARANCE_PRESETS: Array<{ label: string; accent: string; promo: string; base: string }> = [
  { label: "Bosque", accent: "#10b981", promo: "#e11d48", base: "#0a0a0a" },
  { label: "Océano", accent: "#0ea5e9", promo: "#f97316", base: "#0b1220" },
  { label: "Ámbar", accent: "#f59e0b", promo: "#b91c1c", base: "#171310" },
  { label: "Ciruela", accent: "#a855f7", promo: "#22c55e", base: "#140b1c" },
  { label: "Papel", accent: "#0f766e", promo: "#be123c", base: "#f8fafc" },
  { label: "Arena", accent: "#c2410c", promo: "#4d7c0f", base: "#faf5ef" }
];

// Los tres colores que edita el comercio. La vitrina deriva de ellos toda la escala
// (fondos, lineas, tintas y contrastes), por eso no se piden nueve campos.
const APPEARANCE_COLORS: Array<{ key: "accent" | "promo" | "base"; label: string; help: string }> = [
  { key: "accent", label: "Acento", help: "Botones, precios y el sello de la marca" },
  { key: "promo", label: "Promoción", help: "Descuentos y campañas activas" },
  { key: "base", label: "Fondo", help: "Claro u oscuro: la letra se invierte sola" }
];

type ModeOption<T extends string> = { value: T; label: string; hint: string };

// Los cinco modos de pintura, descritos en palabras del dueno del negocio y no del CSS:
// cada opcion dice QUE se ve distinto, porque el usuario la prueba mirando la previa.
const TINT_OPTIONS: Array<ModeOption<SurfaceTint>> = [
  { value: "neutro", label: "Neutro", hint: "Grises puros: el color de la marca solo aparece en botones y precios" },
  { value: "suave", label: "Suave", hint: "Fondo y tarjetas llevan un poco del color de la marca" },
  { value: "marcado", label: "Marcado", hint: "Toda la página tintada: la vitrina se ve de marca, no de plantilla" }
];
const DEPTH_OPTIONS: Array<ModeOption<SurfaceDepth>> = [
  { value: "plana", label: "Plana", hint: "Tarjetas casi del mismo tono que el fondo" },
  { value: "media", label: "Media", hint: "Diferencia de tono normal entre fondo y tarjetas" },
  { value: "alta", label: "Alta", hint: "Tarjetas muy separadas del fondo, con sombra marcada" }
];
const PATTERN_OPTIONS: Array<ModeOption<BackgroundPattern>> = [
  { value: "ninguno", label: "Liso", hint: "Fondo de color plano" },
  { value: "puntos", label: "Puntos", hint: "Retícula fina de puntos" },
  { value: "cuadricula", label: "Cuadrícula", hint: "Cruce de líneas tipo plano" },
  { value: "diagonal", label: "Diagonal", hint: "Rayas finas en diagonal" }
];
const RADIUS_OPTIONS: Array<ModeOption<CornerRadius>> = [
  { value: "recto", label: "Recto", hint: "Esquinas duras, estilo técnico" },
  { value: "suave", label: "Suave", hint: "Esquinas moderadas: el aspecto de siempre" },
  { value: "redondo", label: "Redondo", hint: "Tarjetas y botones muy curvados, estilo amable" }
];
const SCRIM_OPTIONS: Array<ModeOption<BannerScrim>> = [
  { value: "ligero", label: "Ligero", hint: "Casi sin velo: la foto se ve completa" },
  { value: "medio", label: "Medio", hint: "Equilibrio entre la foto y el titular" },
  { value: "fuerte", label: "Fuerte", hint: "Velo oscuro: el titular manda sobre fotos claras" }
];

// Rampa de colores que el motor deriva de los tres elegidos, con el contraste REAL medido
// sobre la superficie donde se pinta. No es adorno: si un fondo no deja cuarto para la
// letra, esta lista es el unico sitio donde el comercio lo ve antes de publicar.
const RAMP_SPECS: Array<{ label: string; fgVar: string; bgVar: string; min: number }> = [
  { label: "Títulos", fgVar: "--sf-ink-strong-t", bgVar: "--sf-surface-t", min: 4.5 },
  { label: "Texto de producto", fgVar: "--sf-ink-body-t", bgVar: "--sf-surface-t", min: 4.5 },
  { label: "Texto secundario", fgVar: "--sf-ink-secondary-t", bgVar: "--sf-surface-t", min: 3 },
  { label: "Tenue (Referencia y contadores)", fgVar: "--sf-ink-muted-t", bgVar: "--sf-surface-t", min: 4.5 },
  { label: "Microcopy (pie y avisos)", fgVar: "--sf-ink-faint-t", bgVar: "--sf-surface-t", min: 4.5 },
  { label: "Precio en acento", fgVar: "--sf-accent-text-t", bgVar: "--sf-surface-t", min: 4.5 },
  { label: "Etiqueta de promoción", fgVar: "--sf-promo-text-t", bgVar: "--sf-surface-t", min: 4.5 },
  { label: "Botón primario", fgVar: "--sf-on-accent", bgVar: "--sf-accent-t", min: 4.5 },
  { label: "Botón de promoción", fgVar: "--sf-on-promo", bgVar: "--sf-promo-t", min: 4.5 }
];

// type="color" solo acepta #rrggbb completo: mientras se escribe el hex se muestra el
// color base para que el selector de tono no se quede vacio.
function pickerColor(value: string | null | undefined, fallback: string) {
  const text = String(value || "");
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

// Huella del tema editable: sirve para avisar que hay cambios sin guardar. Se compara una
// firma y no el objeto porque banner_url cambia solo al subir o borrar el cartel.
function themeFingerprint(theme: StorefrontTheme) {
  return [theme.accent, theme.promo, theme.base, theme.surface_tint, theme.surface_depth,
    theme.background_pattern, theme.corner_radius, theme.banner_scrim, theme.headline || "",
    theme.subhead || "", theme.banner_url || ""].join("|");
}

// Un color de la rampa puede venir como tripleta "r g b" o como hex (la tinta de los
// botones solidos): el panel pinta ambos igual.
function rampHex(value: string | undefined) {
  const text = String(value || "");
  return text.startsWith("#") ? text : tripletToHex(text);
}

// Subtitulo de grupo dentro de una pestana: titulo + icono + que hace, para que el panel
// se lea por bloques y no como un formulario corrido.
function Subsection({ children, help, icon: Icon, label }: { children: React.ReactNode; help?: string; icon: typeof Palette; label: string }) {
  return (
    <section className="space-y-3 rounded-control border border-line bg-surface-soft/40 p-3">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold text-content-strong"><Icon size={14} /> {label}</p>
        {help ? <p className="mt-0.5 text-[11px] text-content-muted">{help}</p> : null}
      </div>
      {children}
    </section>
  );
}

// Control de modo: botones de opcion unica. Los modos son enums cerrados que valida el API,
// asi que no hay campo libre donde el usuario pueda escribir un valor sin efecto.
function ModePicker<T extends string>({ disabled, help, label, onChange, options, value }: { disabled: boolean; help?: string; label: string; onChange: (value: T) => void; options: Array<ModeOption<T>>; value: T }) {
  const selected = options.find((option) => option.value === value);
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5" role="group">
        {options.map((option) => (
          <button
            aria-pressed={option.value === value}
            className={twMerge(
              "rounded-control border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex",
              option.value === value ? "border-apex bg-apex/10 text-apex-ink" : "border-line bg-surface text-content-body hover:border-apex hover:text-content-strong"
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.hint}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-content-muted">{help || selected?.hint}</p>
    </Field>
  );
}

// Muestra cada color derivado sobre su propia superficie con la razon de contraste WCAG
// medida. `min` es el umbral AA del uso de ese texto; por debajo se marca en alerta.
function ContrastRamp({ vars }: { vars: Record<string, string> }) {
  return (
    <ul className="space-y-1.5">
      {RAMP_SPECS.map((spec) => {
        const fg = rampHex(vars[spec.fgVar]);
        const bg = rampHex(vars[spec.bgVar]);
        const ratio = contrastRatioHex(fg, bg);
        const ok = ratio >= spec.min;
        return (
          <li className="flex items-center gap-2 text-xs" key={spec.label}>
            <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-control border border-line text-[11px] font-bold" style={{ backgroundColor: bg, color: fg }}>Aa</span>
            <span className="flex-1 truncate text-content-body">{spec.label}</span>
            <span className="font-mono text-[10px] uppercase text-content-muted">{fg}</span>
            <span className={twMerge("w-12 text-right font-mono text-[11px] font-semibold", ok ? "text-success-ink" : "text-warning-ink")}>{ratio.toFixed(1)}:1</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function ComercioConfiguracionPage() {
  const access = useComercioAccess();
  const [tab, setTab] = useState<TabId>("negocio");
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
  const [savedTheme, setSavedTheme] = useState(themeFingerprint(DEFAULT_STOREFRONT_THEME));
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [viewport, setViewport] = useState<"escritorio" | "movil">("escritorio");
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPrompt, setBannerPrompt] = useState("");
  const [confirmRemoveBanner, setConfirmRemoveBanner] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // El servidor devuelve el tema ya saneado (colores hex validos, modos dentro del enum y
  // URL del banner resuelta por el API); aqui se copia al borrador que edita el usuario.
  const syncTheme = useCallback((result: Settings) => {
    const next = { ...DEFAULT_STOREFRONT_THEME, ...(result.theme || {}) };
    setAppearance(next);
    setSavedTheme(themeFingerprint(next));
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
      setError(describeError(caught, "No fue posible cargar la configuración."));
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
      setError(describeError(caught, "No fue posible actualizar la vitrina pública."));
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

  function setColor(key: "accent" | "promo" | "base", value: string) {
    setAppearance((current): StorefrontTheme => ({ ...current, [key]: value }));
  }

  // Colores, modos y textos del cartel viajan como un solo parche: el API valida los enums y
  // la vitrina reconstruye la paleta. Lo que no se envia no cambia.
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
          surface_tint: appearance.surface_tint,
          surface_depth: appearance.surface_depth,
          background_pattern: appearance.background_pattern,
          corner_radius: appearance.corner_radius,
          banner_scrim: appearance.banner_scrim,
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
      setError("Escribe una descripción de al menos 4 caracteres para generar el banner.");
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
      setError(describeError(caught, "El generador de imágenes no está disponible ahora. Intenta con una imagen propia."));
    } finally {
      setAppearanceBusy(false);
    }
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
      setMessage("Link regenerado. Comparte la nueva dirección: la anterior dejó de funcionar.");
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
      setMessage("Configuración guardada.");
    } catch (caught) {
      setError(describeError(caught, "No fue posible guardar la configuración."));
    } finally {
      setSaving(false);
    }
  }

  const blocked = comercioGate(access);
  if (blocked) return blocked;

  const previewVars = buildStorefrontVars({ ...appearance, banner_url: bannerPreview });
  const themeDirty = themeFingerprint(appearance) !== savedTheme;
  // El umbral AA se mide sobre la rampa real, no sobre los colores que escribio el
  // comercio: si el fondo elegido no deja cuarto, se dice aqui y en voz alta.
  const contrastFallos = RAMP_SPECS.filter((spec) => contrastRatioHex(rampHex(previewVars[spec.fgVar]), rampHex(previewVars[spec.bgVar])) < spec.min);

  const tabs: Array<{ id: TabId; icon: typeof Palette; label: string }> = [
    { id: "negocio", icon: Building2, label: "Negocio" },
    { id: "vitrina", icon: Globe, label: "Vitrina pública" },
    { id: "apariencia", icon: Palette, label: "Apariencia" }
  ];

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader subtitle="Datos del negocio que salen en el comprobante y apariencia de tu página pública. Los cambios aplican solo a este comercio y se reflejan al instante en la vitrina." title="Configuración del comercio" />

      <div aria-label="Secciones de la configuración" className="grid grid-cols-2 gap-2 sm:max-w-2xl sm:grid-cols-3" role="tablist">
        {tabs.map((entry) => (
          <button
            aria-current={tab === entry.id ? "page" : undefined}
            aria-selected={tab === entry.id}
            className={twMerge(
              "inline-flex h-10 items-center justify-center gap-2 rounded-control border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex",
              tab === entry.id ? "border-apex bg-apex/10 text-apex-ink" : "border-line bg-surface text-content-body hover:border-apex hover:text-content-strong"
            )}
            key={entry.id}
            onClick={() => {
              setTab(entry.id);
              setError("");
              setMessage("");
            }}
            role="tab"
            type="button"
          >
            <entry.icon size={15} /> {entry.label}
            {entry.id === "apariencia" && themeDirty ? <span className="h-1.5 w-1.5 rounded-full bg-warning" title="Cambios sin guardar" /> : null}
          </button>
        ))}
      </div>

      <ComercioMessages error={error} message={message} />

      {loading || !settings ? (
        <section aria-busy="true" className="apex-section-card space-y-3 p-4">
          <Skeleton className="h-6 w-56 rounded-control" />
          <Skeleton className="h-10 rounded-control" />
          <Skeleton className="h-10 rounded-control" />
          <Skeleton className="h-10 rounded-control" />
        </section>
      ) : null}

      {settings && tab === "negocio" && !loading ? (
        <section aria-label="Datos del negocio" className="apex-section-card p-4">
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
              Las preferencias de tema, letra y disposición del HUD se guardan en el dispositivo (preferences_json), separadas de los datos de negocio.
              {settings.updated_at ? ` Última actualización: ${settings.updated_at.slice(0, 10)}.` : ""}
            </p>
            {access.canWrite ? (
              <div className="flex justify-end border-t border-line pt-4">
                <button className="apex-primary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={saving} type="submit"><Save size={14} /> {saving ? "Guardando..." : "Guardar configuración"}</button>
              </div>
            ) : (
              <p className="text-xs text-content-muted">Tu perfil solo puede consultar esta configuración.</p>
            )}
          </form>
        </section>
      ) : null}

      {settings && tab === "vitrina" && !loading ? (
        <section aria-label="Vitrina pública" className="apex-section-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold"><Globe size={15} /> Vitrina pública</p>
              <p className="mt-1 max-w-2xl text-xs text-content-muted">Link corto para que tus clientes vean productos, precios y disponibilidad, y te pidan por WhatsApp. Solo se muestran los productos activos; nunca el costo ni el stock.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={Boolean(settings.catalog_enabled)}
                disabled={!access.canWrite || catalogBusy}
                onChange={(event) => void saveCatalog({ catalog_enabled: event.target.checked }, event.target.checked ? "Vitrina activada: el link ya está funcionando." : "Vitrina desactivada: el link público no muestra nada.")}
                type="checkbox"
              />
              <span className="font-medium">{settings.catalog_enabled ? "Publicada" : "Privada"}</span>
            </label>
          </div>

          {settings.catalog_code ? (
            <div className="mt-4 space-y-3">
              <Field label="Link público">
                <div className="flex gap-2">
                  <input className="control flex-1 font-mono text-xs" readOnly value={`${typeof window === "undefined" ? "" : window.location.origin}/tienda/${settings.catalog_code}`} />
                  <button className="h-7 min-h-0 apex-secondary-action flex items-center gap-2 whitespace-nowrap px-3 text-xs font-semibold" disabled={!access.canWrite || catalogBusy} onClick={() => void copyLink()} type="button"><Copy size={13} /> Copiar</button>
                  <button
                    className={twMerge("flex items-center gap-2 whitespace-nowrap rounded-control border px-3 text-xs", confirmRegen ? "border-error/40 bg-error/10 text-error-ink" : "border-line text-content-body hover:bg-surface-muted")}
                    disabled={!access.canWrite || catalogBusy}
                    onBlur={() => setConfirmRegen(false)}
                    onClick={() => void regenerateCode()}
                    type="button"
                  >
                    <RefreshCw size={13} /> {confirmRegen ? "Confirmar: quema el link actual" : "Regenerar"}
                  </button>
                </div>
              </Field>
              {copied ? <p className="text-xs font-medium text-success-ink">{copied.startsWith("http") ? copied : "Link copiado al portapapeles."}</p> : null}
              {/* Un solo formulario para todo lo de la vitrina (frase, contacto y redes):
                  evita un boton de guardar por campo. */}
              <form className="space-y-3" onSubmit={saveVitrine}>
                <Subsection help="Lo que lee tu cliente arriba de los productos. Si además escribes un titular en Apariencia, ese manda sobre esta frase." icon={Megaphone} label="Texto de entrada">
                  <Field label="Frase de la vitrina (opcional, 160 caracteres)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={160} onChange={(event) => setTagline(event.target.value)} placeholder="Todo el sabor de la casa" value={tagline} />
                  </Field>
                </Subsection>

                <Subsection help="Por aquí llegan los pedidos que arma el cliente en la vitrina." icon={Globe} label="Contacto y redes">
                  <Field label="WhatsApp para pedidos (con código de país, ej. +573001112233)">
                    <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={32} onChange={(event) => setWhatsapp(event.target.value)} placeholder="+57..." value={whatsapp} />
                  </Field>
                  {!whatsapp.trim() ? <p className="text-xs text-warning-ink">Sin número de WhatsApp, la vitrina muestra los productos pero el botón de pedido queda deshabilitado.</p> : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Instagram (usuario o URL)">
                      <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={200} onChange={(event) => setInstagram(event.target.value)} placeholder="instagram.com/mitienda" value={instagram} />
                    </Field>
                    <Field label="Facebook (URL de la página)">
                      <input className="control" disabled={!access.canWrite || catalogBusy} maxLength={200} onChange={(event) => setFacebook(event.target.value)} placeholder="facebook.com/mitienda" value={facebook} />
                    </Field>
                  </div>
                  <p className="text-[11px] text-content-muted">Las redes aparecen como iconos arriba y al pie de la vitrina. Puedes escribir solo el usuario o la URL completa; se guarda como enlace https.</p>
                </Subsection>

                <Subsection help="Las campañas tienen su propia aplicación: varias a la vez, segmentos por categoría o producto y envío por WhatsApp a tus clientes." icon={Megaphone} label="Campañas y descuentos">
                  <Link className="inline-flex items-center gap-1 text-xs font-semibold text-apex-ink" href="/dashboard/comercio/promociones">Abrir Promociones</Link>
                </Subsection>

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
            <p className="mt-3 text-xs text-content-muted">Activa la vitrina para generar el primer link público. Luego podrás personalizar su apariencia.</p>
          )}
        </section>
      ) : null}

      {settings && tab === "apariencia" && !loading ? (
        settings.catalog_code ? (
          <section aria-label="Apariencia de la vitrina" className="apex-section-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold"><Palette size={15} /> Apariencia de la vitrina</p>
                <p className="mt-1 max-w-2xl text-xs text-content-muted">
                  Todo lo que cambies se ve al instante en la previa. La vitrina deriva sola los fondos, las líneas y el contraste de la letra a partir de tus colores, e invierte la
                  paleta si eliges un fondo claro: nunca vas a quedar con letra ilegible por escoger un tono.
                </p>
              </div>
              <Link className="apex-secondary-action flex items-center gap-2 whitespace-nowrap px-3 text-xs font-semibold" href={`/tienda/${settings.catalog_code}`} target="_blank">Ver vitrina real <Globe size={13} /></Link>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
              <div className="space-y-4">
                <Subsection help="Escoge una base y ajústala: estos tres colores mandan sobre toda la página." icon={Palette} label="Paleta">
                  <Field label="Paletas listas">
                    <div className="flex flex-wrap gap-2">
                      {APPEARANCE_PRESETS.map((preset) => (
                        <button
                          className="flex items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-content-body transition-colors hover:border-apex hover:text-content-strong"
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
                        Restaurar todo
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
                </Subsection>

                <Subsection help="Cuán tintadas al color de la marca se ven las superficies, cuánto se separan las tarjetas del fondo y qué textura tiene la página detrás de ellas." icon={Layers} label="Tonos y fondo">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ModePicker disabled={!access.canWrite || appearanceBusy} label="Tono de las superficies" onChange={(value) => setAppearance({ ...appearance, surface_tint: value })} options={TINT_OPTIONS} value={appearance.surface_tint} />
                    <ModePicker disabled={!access.canWrite || appearanceBusy} label="Profundidad de las tarjetas" onChange={(value) => setAppearance({ ...appearance, surface_depth: value })} options={DEPTH_OPTIONS} value={appearance.surface_depth} />
                  </div>
                  <ModePicker disabled={!access.canWrite || appearanceBusy} label="Fondo de la página" onChange={(value) => setAppearance({ ...appearance, background_pattern: value })} options={PATTERN_OPTIONS} value={appearance.background_pattern} />
                </Subsection>

                <Subsection help="Forma de tarjetas, campos y botones en toda la vitrina." icon={Shapes} label="Formas">
                  <ModePicker disabled={!access.canWrite || appearanceBusy} label="Esquinas" onChange={(value) => setAppearance({ ...appearance, corner_radius: value })} options={RADIUS_OPTIONS} value={appearance.corner_radius} />
                </Subsection>

                <Subsection help="El cartel es la franja grande de arriba: tu foto o el fondo degradado, con tu titular encima. La letra se aclara sola sobre la foto." icon={ImagePlus} label="Cartel y banner">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Titular del cartel (opcional, 80 caracteres)">
                      <input className="control" disabled={!access.canWrite || appearanceBusy} maxLength={80} onChange={(event) => setAppearance({ ...appearance, headline: event.target.value })} placeholder="El sabor de la casa, en tu puerta" value={appearance.headline || ""} />
                    </Field>
                    <Field label="Subtítulo del cartel (opcional, 140 caracteres)">
                      <input className="control" disabled={!access.canWrite || appearanceBusy} maxLength={140} onChange={(event) => setAppearance({ ...appearance, subhead: event.target.value })} placeholder="Pide por WhatsApp y recibe hoy mismo" value={appearance.subhead || ""} />
                    </Field>
                  </div>
                  <p className="text-[11px] text-content-muted">Sin titular, la vitrina usa la frase de la pestaña Vitrina; sin subtítulo, escribe la ayuda de pedido.</p>
                  <ModePicker
                    disabled={!access.canWrite || appearanceBusy}
                    help={bannerPreview ? "Qué tan oscuro queda el velo sobre tu foto. Con una foto clara y un titular largo, sube a Fuerte." : "Solo se nota cuando hay una foto en el cartel: sin foto no hay velo."}
                    label="Velo sobre la foto"
                    onChange={(value) => setAppearance({ ...appearance, banner_scrim: value })}
                    options={SCRIM_OPTIONS}
                    value={appearance.banner_scrim}
                  />

                  <div className="border-t border-line pt-3">
                    <p className="text-xs text-content-muted">PNG, JPEG o WEBP de hasta 5 MB. Recomendado ancho (por ejemplo 1600x600): cubre la parte superior de la vitrina.</p>
                    <Field label="Subir imagen propia">
                      <input accept="image/png,image/jpeg,image/webp" className="control" disabled={!access.canWrite || appearanceBusy} onChange={(event) => setBannerFile(event.target.files?.[0] || null)} type="file" />
                    </Field>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="apex-primary-action flex items-center gap-2 px-4 text-sm font-semibold" disabled={!access.canWrite || appearanceBusy || !bannerFile} onClick={() => void uploadBanner()} type="button">
                        <ImagePlus size={14} /> {appearanceBusy ? "Trabajando..." : "Subir banner"}
                      </button>
                      {bannerPreview ? (
                        <button
                          className={twMerge("flex items-center gap-2 rounded-control border px-3 text-xs", confirmRemoveBanner ? "border-error/40 bg-error/10 text-error-ink" : "border-line text-content-body hover:bg-surface-muted")}
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
                  </div>

                  <div className="border-t border-line pt-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-content-strong"><Sparkles size={14} /> Generar con modelo gratuito</p>
                    <p className="mt-0.5 text-xs text-content-muted">Describe la imagen y el generador la sube como banner. Puede tardar unos segundos; si el resultado no convence, genera otra o sube tu foto.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        className="control min-w-[14rem] flex-1"
                        disabled={!access.canWrite || appearanceBusy}
                        maxLength={300}
                        onChange={(event) => setBannerPrompt(event.target.value)}
                        placeholder="Banner ancho de cafetería con taza humeante, tonos cálidos"
                        value={bannerPrompt}
                      />
                      <button className="apex-primary-action flex items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold" disabled={!access.canWrite || appearanceBusy || bannerPrompt.trim().length < 4} onClick={() => void generateBanner()} type="button">
                        <Sparkles size={14} /> {appearanceBusy ? "Generando..." : "Generar banner"}
                      </button>
                    </div>
                  </div>
                </Subsection>

                {access.canWrite ? (
                  <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
                    {themeDirty ? <span className="text-[11px] font-medium text-warning-ink">Cambios sin guardar</span> : <span className="text-[11px] text-content-muted">Apariencia al día</span>}
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
              <div aria-label="Previsualización de la vitrina" className="space-y-2 lg:sticky lg:top-4 lg:self-start">
                <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">Previa · cómo se verá</p>
                  <div aria-label="Ancho de la previa" className="flex gap-1" role="group">
                    {([["escritorio", Monitor], ["movil", Smartphone]] as const).map(([kind, Icon]) => (
                      <button
                        aria-pressed={viewport === kind}
                        className={twMerge("rounded-control border p-1.5 transition-colors", viewport === kind ? "border-apex bg-apex/10 text-apex-ink" : "border-line text-content-muted hover:text-content-strong")}
                        key={kind}
                        onClick={() => setViewport(kind)}
                        title={kind === "movil" ? "Ver en celular" : "Ver en escritorio"}
                        type="button"
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-control border border-line bg-paper p-2">
                  <div className={twMerge("mx-auto overflow-hidden transition-all", viewport === "movil" ? "max-w-[21rem]" : "w-full")}>
                    <div className="sf-root sf-bg-base sf-pattern sf-text-strong" style={buildStorefrontVars({ ...appearance, banner_url: bannerPreview }) as CSSProperties}>
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
                          <p className="text-[10px] font-black uppercase tracking-wide sf-text-accent">{settings.store_name || "Mi comercio"}</p>
                          <p className="mt-1 text-base font-black leading-snug sf-text-strong">{appearance.headline?.trim() || settings.catalog_tagline?.trim() || "Todo el catálogo, al momento"}</p>
                          <p className="mt-1 text-xs sf-text-body">{appearance.subhead?.trim() || "Escoge por rubro, arma el pedido y envíalo por WhatsApp."}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="sf-btn-promo rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">-20%</span>
                            <span className="sf-text-faint line-through">$12.000</span>
                            <span className="text-sm font-black sf-text-accent">$9.600</span>
                            <span className="sf-btn-accent sf-text-on-accent rounded-full px-3 py-1 text-[11px] font-bold">Pedir por WhatsApp</span>
                          </div>
                        </div>
                      </div>
                      <div className="border-t sf-border-line p-4">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="sf-chip-accent rounded-full px-2.5 py-1 text-[10px] font-bold">Todo</span>
                          <span className="sf-bg-surface rounded-full border sf-border-line-2 px-2.5 py-1 text-[10px] font-bold sf-text-body">Bebidas</span>
                          <span className="sf-bg-surface rounded-full border sf-border-line-2 px-2.5 py-1 text-[10px] font-bold sf-text-body">Panadería</span>
                        </div>
                        <div className="sf-bg-surface mt-3 rounded-xl p-3">
                          <p className="text-xs font-bold sf-text-body">Producto de ejemplo</p>
                          <p className="mt-0.5 text-[11px] sf-text-muted">Café de origen, molido al momento.</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-sm font-black sf-text-accent">$9.600</span>
                            <span className="sf-btn-accent-solid rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Disponible</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* La rampa no es decorativa: muestra los colores que la vitrina va a pintar y
                    el contraste real medido sobre su propia superficie. */}
                <div className="rounded-control border border-line bg-paper p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">Letra y botones · contraste medido</p>
                  <div className="mt-2">
                    <ContrastRamp vars={previewVars} />
                  </div>
                  {contrastFallos.length ? (
                    <p className="mt-2 text-[11px] text-warning-ink">
                      Con este fondo no se lee bien: {contrastFallos.map((fallo) => fallo.label.toLowerCase()).join(", ")}. Prueba un fondo más claro o más oscuro, o baja la
                      profundidad de las tarjetas.
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-content-muted">Todos los textos y botones alcanzan la legibilidad mínima sobre tus colores.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section aria-label="Apariencia de la vitrina" className="apex-section-card p-4">
            <p className="text-sm text-content-body">Activa la vitrina en la pestaña Vitrina pública para poder personalizar colores, fondos y el cartel.</p>
          </section>
        )
      ) : null}
    </div>
  );
}
