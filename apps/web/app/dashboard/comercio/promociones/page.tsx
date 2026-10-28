"use client";

// Promociones del Comercio (M-30): campanas de descuento con audiencia propia, mas alla
// de Configuracion. Varias promociones conviven; la vitrina y el mostrador cobran el
// MEJOR precio para el cliente (el mayor entre el descuento del producto y la promocion
// aplicable), nunca la suma. El envio es por WhatsApp con mensaje personalizado: la
// plataforma abre wa.me y deja constancia de a quien ya se le envio.
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  Copy,
  Megaphone,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Tag,
  Trash2,
  Users,
  X
} from "lucide-react";
import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import {
  Check as CheckBox,
  ComercioMessages,
  Field,
  ModuleHeader,
  StatusPill,
  comercioGate,
  describeError,
  matchesQuery,
  todayISO,
  useComercioAccess
} from "@/components/comercio/shared";

type PromotionStatus = "draft" | "active" | "paused" | "archived";
type PromotionScope = "all" | "categories" | "products";

type Promotion = {
  id: number;
  name: string;
  scope: PromotionScope;
  percent: number;
  status: PromotionStatus;
  start_date: string | null;
  end_date: string | null;
  message: string | null;
  active: boolean;
  categories: string[];
  products: { product_id: number; product_code: string | null; product_name: string | null }[];
  sent_count: number;
  audience: number;
  created_at: string | null;
  updated_at: string | null;
};

type ProductOption = { id: number; code: string; name: string; category: string | null };

type PromoForm = {
  name: string;
  percent: string;
  scope: PromotionScope;
  status: Exclude<PromotionStatus, "archived">;
  start: string;
  end: string;
  message: string;
  categories: string[];
  productIds: number[];
};

const DEFAULT_MESSAGE = "Hola {cliente}, en {negocio} tenemos {promo} con {descuento} de descuento. Mira el catalogo aqui: {enlace}";

const emptyForm: PromoForm = {
  name: "",
  percent: "10",
  scope: "all",
  status: "draft",
  start: "",
  end: "",
  message: DEFAULT_MESSAGE,
  categories: [],
  productIds: []
};

const statusLabels: Record<PromotionStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  paused: "Pausada",
  archived: "Archivada"
};

function percentLabel(value: number) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return `-${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

// Etiqueta de estado operativo: una promocion activa puede estar programada o vencida
// por su ventana de fechas; la tarjeta lo dice sin obligar a abrir el detalle.
function stateOf(promotion: Promotion) {
  if (promotion.status === "active") {
    if (promotion.active) return { label: "Vigente hoy", tone: "ok" as const };
    const today = todayISO();
    if (promotion.start_date && promotion.start_date > today) return { label: "Programada", tone: "warn" as const };
    if (promotion.end_date && promotion.end_date < today) return { label: "Vencida", tone: "muted" as const };
    return { label: "Activa", tone: "ok" as const };
  }
  if (promotion.status === "paused") return { label: "Pausada", tone: "warn" as const };
  if (promotion.status === "archived") return { label: "Archivada", tone: "muted" as const };
  return { label: "Borrador", tone: "muted" as const };
}

function scopeSummary(promotion: Promotion) {
  if (promotion.scope === "categories") {
    return promotion.categories.length ? `Categorias: ${promotion.categories.join(", ")}` : "Sin categorias";
  }
  if (promotion.scope === "products") {
    if (!promotion.products.length) return "Sin productos";
    const names = promotion.products
      .map((row) => row.product_name || row.product_code)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
    const extra = promotion.products.length - 3;
    return `Productos: ${names}${extra > 0 ? ` y ${extra} mas` : ""}`;
  }
  return "Toda la tienda";
}

function windowLabel(promotion: Promotion) {
  if (!promotion.start_date && !promotion.end_date) return "Sin fecha limite";
  const from = promotion.start_date ? promotion.start_date.split("-").reverse().join("/") : "desde hoy";
  const to = promotion.end_date ? promotion.end_date.split("-").reverse().join("/") : "sin fin";
  return `${from} a ${to}`;
}

export default function ComercioPromocionesPage() {
  const access = useComercioAccess();
  const [items, setItems] = useState<Promotion[]>([]);
  const [audience, setAudience] = useState(0);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PromotionStatus>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<{ id: number; kind: "archive" | "delete" } | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<PromoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");

  const [audienceTarget, setAudienceTarget] = useState<Promotion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [promotions, catalog] = await Promise.all([
        api<{ items: Promotion[]; audience: number }>("/api/v1/comercio/promotions", { cache: "no-store" }),
        api<{ items: ProductOption[]; total: number }>("/api/v1/comercio/products?limit=500", { cache: "no-store" })
      ]);
      setItems(promotions.items);
      setAudience(promotions.audience);
      setProducts(catalog.items);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar las promociones."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const filtered = useMemo(() => items.filter((promotion) => {
    if (statusFilter !== "all" && promotion.status !== statusFilter) return false;
    return matchesQuery(query, promotion.name, promotion.categories.join(" "), scopeSummary(promotion));
  }), [items, query, statusFilter]);

  const activeCount = items.filter((promotion) => promotion.active).length;
  const sentTotal = items.reduce((sum, promotion) => sum + promotion.sent_count, 0);

  function openEditor(promotion: Promotion | null) {
    setEditorError("");
    setEditing(promotion);
    setForm(promotion ? {
      name: promotion.name,
      percent: String(promotion.percent),
      scope: promotion.scope,
      status: promotion.status === "archived" ? "draft" : promotion.status,
      start: promotion.start_date || "",
      end: promotion.end_date || "",
      message: promotion.message || DEFAULT_MESSAGE,
      categories: promotion.categories,
      productIds: promotion.products.map((row) => row.product_id)
    } : { ...emptyForm, productIds: [], categories: [] });
    setEditorOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setEditorError("");
    setMessage("");
    try {
      const body = {
        name: form.name.trim(),
        percent: Number(form.percent || 0),
        scope: form.scope,
        status: form.status,
        start_date: form.start || null,
        end_date: form.end || null,
        message: form.message.trim() || null,
        categories: form.scope === "categories" ? form.categories : [],
        product_ids: form.scope === "products" ? form.productIds : []
      };
      if (editing) {
        await api(`/api/v1/comercio/promotions/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        setMessage(`Promocion "${body.name}" actualizada.`);
      } else {
        await api("/api/v1/comercio/promotions", { method: "POST", body: JSON.stringify(body) });
        setMessage(`Promocion "${body.name}" creada.`);
      }
      setEditorOpen(false);
      await load();
    } catch (caught) {
      setEditorError(describeError(caught, "No fue posible guardar la promocion."));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(promotion: Promotion, status: PromotionStatus) {
    setBusyId(promotion.id);
    setError("");
    setMessage("");
    try {
      await api(`/api/v1/comercio/promotions/${promotion.id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      setMessage(`"${promotion.name}" quedo en ${statusLabels[status].toLowerCase()}.`);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible cambiar el estado de la promocion."));
    } finally {
      setBusyId(null);
      setPendingAction(null);
    }
  }

  async function remove(promotion: Promotion) {
    setBusyId(promotion.id);
    setError("");
    setMessage("");
    try {
      await api(`/api/v1/comercio/promotions/${promotion.id}`, { method: "DELETE" });
      setMessage(`Borrador "${promotion.name}" eliminado.`);
      await load();
    } catch (caught) {
      setError(describeError(caught, "No fue posible eliminar el borrador."));
    } finally {
      setBusyId(null);
      setPendingAction(null);
    }
  }

  const blocked = comercioGate(access);
  if (blocked) return blocked;

  return (
    <div className="apex-workspace-shell space-y-4">
      <ModuleHeader
        actions={access.canWrite ? <Button onClick={() => openEditor(null)} size="compact"><Plus size={14} /> Nueva promocion</Button> : undefined}
        eyebrow="M-30 · Mercadeo"
        subtitle="Crea varias campanas, segmenta por categoria o producto y envialas por WhatsApp a tus clientes registrados. La vitrina y el mostrador cobran siempre el mejor precio."
        title="Promociones"
      />
      <ComercioMessages error={error} message={message} />

      <section aria-label="Resumen de promociones" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Vigentes hoy" value={String(activeCount)} detail={`${items.length} promociones en total`} />
        <SummaryCard label="Clientes con WhatsApp" value={String(audience)} detail="Audiencia disponible para enviar" />
        <SummaryCard label="Envios registrados" value={String(sentTotal)} detail="Mensajes marcados como enviados" />
      </section>

      <section className="apex-section-card">
        <div className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
          <Field label="Buscar">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
              <input
                aria-label="Buscar promociones por nombre, categoria o alcance"
                className="control pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre de la campana, categoria o producto"
                value={query}
              />
            </span>
          </Field>
          <div className="flex items-center gap-2 lg:justify-end">
            <Button onClick={() => void load()} size="compact" variant="secondary"><RefreshCw size={14} /> Actualizar</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          {(["all", "active", "draft", "paused", "archived"] as const).map((value) => (
            <button
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${statusFilter === value ? "border-apex bg-apex/10 text-apex" : "border-line text-content-body hover:bg-surface-muted"}`}
              key={value}
              onClick={() => setStatusFilter(value)}
              type="button"
            >
              {value === "all" ? "Todas" : statusLabels[value]}
            </button>
          ))}
          <span aria-live="polite" className="ml-auto text-xs font-semibold text-content-body">{filtered.length} de {items.length}</span>
        </div>

        {loading ? (
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((index) => <Skeleton className="h-44" key={index} />)}
          </div>
        ) : filtered.length ? (
          <ul className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((promotion) => (
              <PromotionCard
                busy={busyId === promotion.id}
                canWrite={access.canWrite}
                key={promotion.id}
                onArchive={() => void changeStatus(promotion, "archived")}
                onAudience={() => setAudienceTarget(promotion)}
                onDelete={() => void remove(promotion)}
                onEdit={() => openEditor(promotion)}
                onPause={() => void changeStatus(promotion, "paused")}
                onResume={() => void changeStatus(promotion, "active")}
                onRestore={() => void changeStatus(promotion, "draft")}
                onToggleAction={() => {
                  if (pendingAction?.id === promotion.id) {
                    if (pendingAction.kind === "archive") void changeStatus(promotion, "archived");
                    else void remove(promotion);
                    return;
                  }
                  setPendingAction({ id: promotion.id, kind: "archive" });
                }}
                onToggleDelete={() => {
                  if (pendingAction?.id === promotion.id && pendingAction.kind === "delete") {
                    void remove(promotion);
                    return;
                  }
                  setPendingAction({ id: promotion.id, kind: "delete" });
                }}
                pendingAction={pendingAction?.id === promotion.id ? pendingAction.kind : null}
                promotion={promotion}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            className="m-4"
            description={items.length ? "Ajusta el filtro o limpia la busqueda para ver tus campanas." : "Crea la primera promocion y decide si aplica a toda la tienda, a unas categorias o a productos puntuales."}
            icon={<Megaphone size={22} />}
            title={items.length ? "Ninguna promocion con este filtro" : "Aun no tienes promociones"}
          />
        )}
      </section>

      {editorOpen ? (
        <ModalFrame maxWidth="md:max-w-3xl" onClose={() => setEditorOpen(false)} title={editing ? `Editar promocion · ${editing.name}` : "Nueva promocion"}>
          <form className="space-y-4" onSubmit={save}>
            {editorError ? <Alert tone="error" title="No se pudo guardar">{editorError}</Alert> : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Nombre de la campana">
                  <input className="control" maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Fin de mes, Black weekend, Liquidacion de verano..." required value={form.name} />
                </Field>
              </div>
              <Field label="Descuento (0 a 90%)">
                <input className="control" max={90} min={0} onChange={(event) => setForm({ ...form, percent: event.target.value })} step="0.5" type="number" value={form.percent} />
              </Field>
              <Field label="Estado">
                <select className="control" onChange={(event) => setForm({ ...form, status: event.target.value as PromoForm["status"] })} value={form.status}>
                  <option value="draft">Borrador (no aplica precios)</option>
                  <option value="active">Activa</option>
                  <option value="paused">Pausada</option>
                </select>
              </Field>
              <Field label="Vigente desde (opcional)">
                <input className="control" onChange={(event) => setForm({ ...form, start: event.target.value })} type="date" value={form.start} />
              </Field>
              <Field label="Vigente hasta (opcional)">
                <input className="control" onChange={(event) => setForm({ ...form, end: event.target.value })} type="date" value={form.end} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Alcance">
                  <select className="control" onChange={(event) => setForm({ ...form, scope: event.target.value as PromotionScope })} value={form.scope}>
                    <option value="all">Toda la tienda</option>
                    <option value="categories">Categorias seleccionadas</option>
                    <option value="products">Productos seleccionados</option>
                  </select>
                </Field>
              </div>
            </div>

            {form.scope === "categories" ? (
              <div className="apex-section-card-muted/40 p-3">
                <p className="text-xs font-semibold text-content-body">Categorias alcanzadas</p>
                {categories.length ? (
                  <div className="mt-2 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                    {categories.map((category) => (
                      <CheckBox
                        checked={form.categories.includes(category)}
                        key={category}
                        label={category}
                        onChange={(checked) => setForm({
                          ...form,
                          categories: checked ? [...form.categories, category] : form.categories.filter((value) => value !== category)
                        })}
                      />
                    ))}
                  </div>
                ) : <p className="mt-1 text-xs text-content-muted">Aun no hay categorias: crea productos con categoria en el maestro.</p>}
              </div>
            ) : null}

            {form.scope === "products" ? (
              <ProductPicker
                onChange={(productIds) => setForm({ ...form, productIds })}
                products={products}
                selected={form.productIds}
              />
            ) : null}

            <Field hint="Marcadores: {cliente}, {negocio}, {promo}, {descuento} y {enlace}. Cada cliente recibe su mensaje personalizado." label="Mensaje de WhatsApp">
              <textarea className="control" maxLength={1000} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={4} value={form.message} />
            </Field>

            <p className="text-xs text-content-muted">
              El descuento nunca se suma al del producto: el cliente paga el mejor de los dos. Si dos promociones aplican al mismo producto, gana la de mayor porcentaje.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              <button className="inline-flex items-center apex-secondary-action px-4 text-sm font-semibold" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
              <button className="inline-flex items-center apex-primary-action px-4 text-sm font-semibold" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar promocion"}</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}

      {audienceTarget ? (
        <AudienceDialog
          canWrite={access.canWrite}
          onClose={() => { setAudienceTarget(null); void load(); }}
          promotion={audienceTarget}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="apex-section-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-content-strong">{value}</p>
      <p className="mt-1 text-xs text-content-muted">{detail}</p>
    </div>
  );
}

type PromotionCardProps = {
  promotion: Promotion;
  canWrite: boolean;
  busy: boolean;
  pendingAction: "archive" | "delete" | null;
  onEdit: () => void;
  onAudience: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestore: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleAction: () => void;
  onToggleDelete: () => void;
};

function PromotionCard({
  promotion, canWrite, busy, pendingAction,
  onEdit, onAudience, onPause, onResume, onRestore, onArchive, onDelete, onToggleAction, onToggleDelete
}: PromotionCardProps) {
  const state = stateOf(promotion);
  const archived = promotion.status === "archived";
  return (
    <li className="flex h-full flex-col rounded-card border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-content-strong">{promotion.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-content-muted"><Tag size={12} /> {scopeSummary(promotion)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-apex/10 px-2 py-0.5 text-sm font-bold text-apex">{percentLabel(promotion.percent)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
        <span className="inline-flex items-center gap-1 text-xs text-content-muted"><CalendarDays size={12} /> {windowLabel(promotion)}</span>
      </div>

      <p className="mt-2 line-clamp-2 min-h-8 text-xs text-content-body">{promotion.message || DEFAULT_MESSAGE}</p>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-content-muted">
        <span className="inline-flex items-center gap-1"><Send size={12} /> {promotion.sent_count} de {promotion.audience} clientes</span>
        {promotion.status === "draft" ? <span>No aplica precios</span> : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        <Button onClick={onAudience} size="compact" variant="secondary"><MessageCircle size={13} /> Audiencia</Button>
        {canWrite && !archived ? <Button onClick={onEdit} size="compact" variant="ghost"><Pencil size={13} /> Editar</Button> : null}
        {canWrite && promotion.status === "active" ? (
          <Button disabled={busy} onClick={onPause} size="compact" variant="ghost"><Pause size={13} /> Pausar</Button>
        ) : null}
        {canWrite && (promotion.status === "draft" || promotion.status === "paused") ? (
          <Button disabled={busy} onClick={onResume} size="compact" variant="ghost"><Play size={13} /> Activar</Button>
        ) : null}
        {canWrite && archived ? (
          <Button disabled={busy} onClick={onRestore} size="compact" variant="ghost"><RotateCcw size={13} /> Restaurar</Button>
        ) : null}
        {canWrite && !archived ? (
          <Button
            disabled={busy}
            onClick={pendingAction === "archive" ? onArchive : onToggleAction}
            size="compact"
            variant="ghost"
          >
            <Archive size={13} /> {pendingAction === "archive" ? "Confirmar archivo" : "Archivar"}
          </Button>
        ) : null}
        {canWrite && promotion.status === "draft" ? (
          <Button
            disabled={busy}
            onClick={pendingAction === "delete" ? onDelete : onToggleDelete}
            size="compact"
            variant="ghost"
          >
            <Trash2 size={13} /> {pendingAction === "delete" ? "Confirmar borrado" : "Eliminar"}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function ProductPicker({ products, selected, onChange }: { products: ProductOption[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  const filtered = products.filter((product) => matchesQuery(query, product.name, product.code, product.category || ""));
  return (
    <div className="apex-section-card-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-content-body">Productos alcanzados</p>
        <span className="text-xs text-content-muted">{selected.length} seleccionados</span>
      </div>
      <input
        aria-label="Buscar productos para la promocion"
        className="control mt-2"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre, codigo o categoria"
        value={query}
      />
      {filtered.length ? (
        <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
          {filtered.map((product) => (
            <CheckBox
              checked={selected.includes(product.id)}
              key={product.id}
              label={`${product.name}${product.category ? ` · ${product.category}` : ""}`}
              onChange={(checked) => onChange(checked ? [...selected, product.id] : selected.filter((id) => id !== product.id))}
            />
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-content-muted">Ningun producto coincide con la busqueda.</p>}
    </div>
  );
}

type AudienceItem = {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  phone_digits: string;
  sent: boolean;
  sent_at: string | null;
  message: string;
  wa_url: string;
};

type AudienceResponse = {
  promotion: Promotion;
  base_url: string | null;
  link: string | null;
  message_template: string;
  totals: { audience: number; sent: number; pending: number };
  total: number;
  items: AudienceItem[];
};

function AudienceDialog({ promotion, canWrite, onClose }: { promotion: Promotion; canWrite: boolean; onClose: () => void }) {
  const [data, setData] = useState<AudienceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(promotion.sent_count > 0);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const origin = window.location.origin;
      const result = await api<AudienceResponse>(
        `/api/v1/comercio/promotions/${promotion.id}/audience?limit=500&base_url=${encodeURIComponent(origin)}`,
        { cache: "no-store" }
      );
      setData(result);
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar la audiencia."));
    } finally {
      setLoading(false);
    }
  }, [promotion.id]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => (data?.items || []).filter((item) => {
    if (pendingOnly && item.sent) return false;
    return matchesQuery(query, item.name, item.code, item.phone || "");
  }), [data, pendingOnly, query]);

  async function markSent(item: AudienceItem) {
    setSendingId(item.id);
    setNotice("");
    try {
      await api(`/api/v1/comercio/promotions/${promotion.id}/sends`, {
        method: "POST",
        body: JSON.stringify({ customer_ids: [item.id], base_url: window.location.origin })
      });
      setData((current) => current ? {
        ...current,
        totals: { ...current.totals, sent: current.totals.sent + (item.sent ? 0 : 1), pending: Math.max(0, current.totals.pending - (item.sent ? 0 : 1)) },
        items: current.items.map((row) => row.id === item.id ? { ...row, sent: true, sent_at: new Date().toISOString() } : row)
      } : current);
      setNotice(`Envio registrado para ${item.name}.`);
    } catch (caught) {
      setError(describeError(caught, "No fue posible registrar el envio."));
    } finally {
      setSendingId(null);
    }
  }

  async function copyMessage(item: AudienceItem) {
    try {
      await navigator.clipboard.writeText(item.message);
      setNotice(`Mensaje de ${item.name} copiado.`);
    } catch {
      setNotice(item.message);
    }
  }

  const canSend = canWrite && promotion.active;

  return (
    <ModalFrame maxWidth="md:max-w-4xl" onClose={onClose} title={`Audiencia · ${promotion.name}`}>
      <div className="space-y-3">
        <Alert tone={canSend ? "success" : "warning"} title={canSend ? "Listo para enviar" : "La promocion no esta vigente"}>
          {canSend
            ? "Cada enlace abre WhatsApp con el mensaje de ese cliente ya escrito. Al abrirlo queda registrado para no repetir el envio."
            : "Activa la promocion y revisa su vigencia antes de enviar. Puedes preparar la audiencia y el mensaje desde ahora."}
        </Alert>
        <ComercioMessages error={error} message={notice} />
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-muted/40 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-1 font-semibold text-content-strong"><Users size={15} /> {data?.totals.audience ?? 0} con WhatsApp</span>
          <span className="text-content-body">{data?.totals.pending ?? 0} pendientes</span>
          <span className="text-content-body">{data?.totals.sent ?? 0} enviados</span>
          {data?.link ? <span className="min-w-0 truncate text-xs text-content-muted">Enlace: {data.link}</span> : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto] sm:items-end">
          <Field label="Buscar cliente">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 text-content-muted" size={16} />
              <input aria-label="Buscar clientes de la audiencia" className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, codigo o telefono" value={query} />
            </span>
          </Field>
          <div className="pb-2 sm:pb-3"><CheckBox checked={pendingOnly} label="Solo pendientes" onChange={setPendingOnly} /></div>
          <Button onClick={() => void load()} size="compact" variant="secondary"><RefreshCw size={14} /> Actualizar</Button>
        </div>

        {loading ? <div className="space-y-2">{[0, 1, 2].map((index) => <Skeleton className="h-20" key={index} />)}</div> : items.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
            {items.map((item) => (
              <li className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]" key={item.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-content-strong">{item.name}</p>
                    <span className="font-mono text-xs text-content-muted">{item.code}</span>
                    {item.sent ? <StatusPill tone="ok">Enviado</StatusPill> : <StatusPill tone="warn">Pendiente</StatusPill>}
                  </div>
                  <p className="text-xs text-content-body">{item.phone} {item.sent_at ? `· ${item.sent_at.slice(0, 10)}` : ""}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-content-muted">{item.message}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  <Button onClick={() => void copyMessage(item)} size="compact" variant="ghost" title="Copiar el mensaje personalizado"><Copy size={13} /> Mensaje</Button>
                  {canSend ? (
                    <a
                      className="inline-flex h-9 items-center gap-2 rounded-control border border-transparent bg-apex px-3 text-sm font-semibold text-white transition-colors hover:bg-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apex"
                      href={item.wa_url}
                      onClick={() => { if (!item.sent) void markSent(item); }}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {item.sent ? <Check size={13} /> : <MessageCircle size={13} />} {sendingId === item.id ? "Registrando..." : item.sent ? "Reenviar" : "Enviar WhatsApp"}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            description={data?.totals.audience ? "Ajusta la busqueda o desmarca 'solo pendientes'." : "Registra clientes con numero de WhatsApp en el maestro para poder enviar campanas."}
            icon={data?.totals.audience ? <X size={22} /> : <Users size={22} />}
            title={data?.totals.audience ? "Ningun cliente con este filtro" : "Sin clientes con WhatsApp"}
          />
        )}
      </div>
    </ModalFrame>
  );
}
