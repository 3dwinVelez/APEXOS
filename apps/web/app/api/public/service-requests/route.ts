// Formulario publico de Servicios (BFF de apps/web).
//
// Este handler no tiene llave de servicio ni Prisma: el visitante anonimo solo puede leer
// el catalogo publico y crear una pre-orden. La empresa destino NO la elige el cliente; sale
// de una allowlist de servidor (APEXOS_PUBLIC_SERVICE_COMPANY_ID). Nada del body ni del query
// (`?empresa=`) participa en resolverla.
//
//   - Local: delega en el API operativo (`/api/v1/public/services/*`), que cierra el tenant
//     con runWithTenant y valida contra la base real.
//   - Nube: lee con la llave anon (RLS de catalogo publico) y crea por RPC
//     `create_public_service_order` (SECURITY DEFINER, solo inserta preordenes).
//   - Actualizar catalogos: exige el JWT del administrador y deja que RLS
//     (`service_references_write_admin`) decida. Sin JWT -> 401; sin permiso -> 403.
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

type PublicServiceRequest = {
  customer_name?: string;
  customer_document?: string;
  customer_phone?: string;
  customer_phone_secondary?: string;
  customer_email?: string;
  invoice_number?: string;
  service_type?: string;
  reference_id?: string;
  product_reference?: string;
  product_description?: string;
  customer_address?: string;
  customer_neighborhood?: string;
  service_store?: string;
  notes?: string;
  items?: Array<{ reference_id?: string; service_type?: string; quantity?: number; observation?: string }>;
};
type PublicReferenceRow = { id: string; company_id?: string; code: string; name: string; category?: string; brand?: string; model?: string };
type SupabaseUser = { id?: string; email?: string };

const SERVICE_TYPES_REFERENCE_CODE = "__SERVICE_TYPES__";
const DEFAULT_SERVICE_TYPES = [
  { code: "montaje", label: "Montaje", active: true },
  { code: "desmontaje", label: "Desmontaje", active: true },
  { code: "ambos", label: "Montaje y desmontaje", active: true }
];
const DEFAULT_SERVICE_STORES = [
  { code: "hogar_y_moda_1", label: "Hogar y Moda 1", active: true },
  { code: "hogar_y_moda_2", label: "Hogar y Moda 2", active: true }
];
const MAX_ITEMS = 20;
const MAX_ITEM_QUANTITY = 50;

class PublicServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let rootEnvCache: Record<string, string> | null = null;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function failure(error: unknown) {
  if (error instanceof PublicServiceError) return jsonError(error.message, error.status);
  console.error("[public-service-requests]", error instanceof Error ? error.message : String(error));
  return jsonError("No fue posible procesar la solicitud del formulario publico.", 500);
}

function clean(value: unknown) {
  const next = typeof value === "string" ? value.trim() : "";
  return next || "";
}

function rootEnv() {
  if (rootEnvCache) return rootEnvCache;
  let currentDir = process.cwd();
  let envPath = "";
  for (let index = 0; index < 6; index += 1) {
    const candidate = path.join(currentDir, ".env");
    if (fs.existsSync(candidate)) {
      envPath = candidate;
      break;
    }
    const nextDir = path.dirname(currentDir);
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }
  if (!fs.existsSync(envPath)) {
    rootEnvCache = {};
    return rootEnvCache;
  }
  rootEnvCache = Object.fromEntries(fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, "")];
    }));
  return rootEnvCache;
}

function envValue(...keys: string[]) {
  const fallback = rootEnv();
  for (const key of keys) {
    const value = process.env[key] || fallback[key];
    if (value) return value;
  }
  return "";
}

function localApiUrl() {
  return envValue("NEXT_PUBLIC_API_URL", "API_URL").replace(/\/+$/, "");
}

function localDatabase() {
  try {
    const url = new URL(envValue("DATABASE_URL"));
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function supabaseConfig() {
  const config = {
    url: envValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    anonKey: envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY")
  };
  const missing = [!config.url ? "SUPABASE_URL" : "", !config.anonKey ? "SUPABASE_ANON_KEY" : ""].filter(Boolean);
  if (missing.length) {
    throw new PublicServiceError(`Falta configuracion publica de Supabase: ${missing.join(", ")}.`, 503);
  }
  return config;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Allowlist de servidor: la unica fuente de la empresa destino del formulario publico.
function publicCompanyId() {
  const value = envValue("APEXOS_PUBLIC_SERVICE_COMPANY_ID", "NEXT_PUBLIC_APEXOS_PUBLIC_COMPANY_ID");
  if (!value || !isUuid(value)) {
    throw new PublicServiceError("El formulario publico no tiene empresa configurada (APEXOS_PUBLIC_SERVICE_COMPANY_ID).", 503);
  }
  return value;
}

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function serviceTypeCode(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeServiceTypes(rows: unknown) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_SERVICE_TYPES;
  const seen = new Set<string>();
  return source
    .map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const code = serviceTypeCode(row.code || row.label);
      const label = String(row.label || row.code || "").trim();
      return { code, label, active: row.active !== false };
    })
    .filter((item) => item.code && item.label && !seen.has(item.code) && seen.add(item.code));
}

function normalizeServiceStores(rows: unknown) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_SERVICE_STORES;
  const seen = new Set<string>();
  return source
    .map((item) => {
      const row = item as Record<string, unknown>;
      const code = serviceTypeCode(clean(row.code) || clean(row.label));
      const label = clean(row.label) || clean(row.code);
      return { code, label, active: row.active !== false };
    })
    .filter((item) => item.code && item.label && !seen.has(item.code) && seen.add(item.code));
}

function satisfactionQuestionId(value: unknown) {
  return serviceTypeCode(value || `pregunta_${Date.now()}`);
}

function normalizeSatisfactionQuestions(rows: unknown) {
  const source = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  return source
    .map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const label = clean(row.label);
      const id = satisfactionQuestionId(row.id || label);
      return { id, label, active: row.active !== false };
    })
    .filter((item) => item.id && item.label && !seen.has(item.id) && seen.add(item.id));
}

function supabaseFailure(status: number, detail: unknown) {
  const record = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
  const code = clean(record.code);
  if (status === 401 || status === 403 || code === "42501") {
    return new PublicServiceError("No tienes permiso de administracion sobre la empresa del formulario publico.", 403);
  }
  if (status === 409 || code === "23505") {
    return new PublicServiceError("El catalogo publico ya existe y no se pudo actualizar.", 409);
  }
  return new PublicServiceError("El servicio de datos publico no respondio la consulta.", 502);
}

async function supabasePublicRead<T>(requestPath: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  const response = await fetch(`${config.url}${requestPath}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw supabaseFailure(response.status, body);
  return body as T;
}

async function supabaseUserRequest<T>(requestPath: string, token: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  const response = await fetch(`${config.url}${requestPath}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw supabaseFailure(response.status, body);
  return body as T;
}

async function currentSupabaseUser(token: string) {
  const config = supabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/user`, {
    cache: "no-store",
    headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` }
  }).catch(() => null);
  if (!response?.ok) return null;
  return await response.json().catch(() => null) as SupabaseUser | null;
}

async function proxyToApi<T>(apiPath: string, init: RequestInit = {}) {
  const base = localApiUrl();
  if (!base) throw new PublicServiceError("El API operativo no esta configurado para el formulario publico.", 503);
  const response = await fetch(`${base}${apiPath}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers }
  }).catch(() => null);
  if (!response) throw new PublicServiceError("El API operativo no respondio la solicitud publica.", 502);
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const message = clean(record.error) || clean(record.message) || "No fue posible procesar la solicitud publica.";
    throw new PublicServiceError(message, response.status);
  }
  return payload as T;
}

async function resolveReferenceId(companyId: string, referenceId: string, productReference: string) {
  if (referenceId && isUuid(referenceId)) {
    const rows = await supabasePublicRead<Array<{ id: string }>>(
      `/rest/v1/service_references?select=id&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&id=eq.${encodeURIComponent(referenceId)}&limit=1`
    ).catch(() => []);
    if (rows[0]?.id) return rows[0].id;
  }
  if (!productReference) return null;
  const rows = await supabasePublicRead<Array<{ id: string }>>(
    `/rest/v1/service_references?select=id&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&or=(code.ilike.*${encodeURIComponent(productReference)}*,name.ilike.*${encodeURIComponent(productReference)}*)&limit=1`
  ).catch(() => []);
  return rows[0]?.id || null;
}

async function activeReferencesForCompany(companyId: string) {
  return supabasePublicRead<PublicReferenceRow[]>(
    `/rest/v1/service_references?select=id,company_id,code,name,category,brand,model&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&code=neq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&order=code.asc&limit=500`
  );
}

async function catalogMetadata(companyId: string) {
  const rows = await supabasePublicRead<Array<{ metadata?: Record<string, unknown> }>>(
    `/rest/v1/service_references?select=metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=1`
  ).catch(() => []);
  return rows[0]?.metadata || {};
}

export async function GET() {
  try {
    if (localDatabase()) {
      return NextResponse.json(await proxyToApi("/api/v1/public/services/catalog"));
    }
    const companyId = publicCompanyId();
    const [references, metadata] = await Promise.all([activeReferencesForCompany(companyId), catalogMetadata(companyId)]);
    if (!references.length) return jsonError("No se encontro una empresa con referencias activas para el formulario.", 404);
    return NextResponse.json({
      ok: true,
      company_id: companyId,
      references,
      service_types: normalizeServiceTypes(metadata.service_types).filter((item) => item.active),
      service_stores: normalizeServiceStores(metadata.service_stores).filter((item) => item.active)
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as PublicServiceRequest | null;
    if (!body || typeof body !== "object") return jsonError("No se recibio la solicitud del formulario.");
    const requestedItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : [{ reference_id: body.reference_id, service_type: body.service_type, quantity: 1, observation: body.notes }];
    if (requestedItems.length > MAX_ITEMS) return jsonError(`Una orden admite maximo ${MAX_ITEMS} solicitudes.`);
    const invalidItem = requestedItems.findIndex((item) => {
      const quantity = Number(item.quantity);
      return !clean(item.reference_id) || !clean(item.service_type) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY;
    });
    if (invalidItem >= 0) return jsonError(`Completa referencia, servicio y cantidad de la solicitud ${invalidItem + 1}.`);
    const required = [
      ["customer_name", "nombre completo"],
      ["customer_document", "cedula"],
      ["customer_phone", "telefono"],
      ["customer_phone_secondary", "telefono alterno"],
      ["customer_address", "direccion"],
      ["customer_neighborhood", "barrio"],
      ["service_store", "almacen"]
    ] as const;
    const missing = required.filter(([key]) => !clean(body[key])).map(([, label]) => label);
    if (missing.length) return jsonError(`Completa los campos obligatorios: ${missing.join(", ")}.`);
    if (!/^\d{5,12}$/.test(clean(body.customer_document))) return jsonError("La cedula debe contener entre 5 y 12 numeros.");
    if (!/^[0-9+()\-\s]{7,20}$/.test(clean(body.customer_phone))) return jsonError("Registra un telefono valido para confirmar la visita.");
    if (!/^[0-9+()\-\s]{7,20}$/.test(clean(body.customer_phone_secondary))) return jsonError("Registra un telefono alterno valido para confirmar la visita.");
    if (clean(body.customer_phone).replace(/\D/g, "") === clean(body.customer_phone_secondary).replace(/\D/g, "")) {
      return jsonError("Los dos telefonos de contacto deben ser diferentes.");
    }

    if (localDatabase()) {
      return NextResponse.json(await proxyToApi("/api/v1/public/services/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_name: clean(body.customer_name),
          customer_document: clean(body.customer_document),
          customer_phone: clean(body.customer_phone),
          customer_phone_secondary: clean(body.customer_phone_secondary),
          customer_email: clean(body.customer_email),
          customer_address: clean(body.customer_address),
          customer_neighborhood: clean(body.customer_neighborhood),
          service_store: clean(body.service_store),
          invoice_number: clean(body.invoice_number),
          notes: clean(body.notes),
          items: requestedItems.map((item) => ({
            reference_id: clean(item.reference_id),
            service_type: clean(item.service_type),
            quantity: Number(item.quantity),
            observation: clean(item.observation)
          }))
        })
      }));
    }

    const companyId = publicCompanyId();
    const referenceId = await resolveReferenceId(companyId, clean(body.reference_id), clean(body.product_reference) || clean(body.product_description));
    if (!referenceId) return jsonError("Selecciona una referencia activa para el producto que se va a instalar.");
    const metadata = await catalogMetadata(companyId);
    const serviceType = serviceTypeCode(clean(body.service_type) || "montaje");
    const serviceTypes = normalizeServiceTypes(metadata.service_types).filter((item) => item.active);
    if (!serviceTypes.some((item) => item.code === serviceType)) return jsonError("Selecciona un tipo de servicio activo para esta empresa.");
    const store = normalizeServiceStores(metadata.service_stores).filter((item) => item.active)
      .find((item) => item.code === serviceTypeCode(clean(body.service_store)));
    if (!store) return jsonError("Selecciona un almacen activo para esta empresa.");

    const inserted = await supabasePublicRead<Array<{ id: string; number: string }>>("/rest/v1/rpc/create_public_service_order", {
      method: "POST",
      body: JSON.stringify({
        p_reference_id: referenceId,
        p_service_type: serviceType,
        p_customer_name: clean(body.customer_name),
        p_customer_address: clean(body.customer_address),
        p_customer_phone: clean(body.customer_phone),
        p_invoice_number: clean(body.invoice_number) || null,
        p_notes: clean(body.notes) || "Solicitud creada por formulario publico. Requiere revision administrativa.",
        p_metadata: {
          created_from: "public_service_request",
          public_request: true,
          requires_admin_completion: true,
          preorder_status: "agendado",
          customer_document: clean(body.customer_document),
          customer_phone_secondary: clean(body.customer_phone_secondary),
          customer_email: clean(body.customer_email),
          customer_neighborhood: clean(body.customer_neighborhood),
          service_store: store.code,
          service_store_label: store.label,
          product_reference: clean(body.product_reference),
          product_description: clean(body.product_description),
          received_at: new Date().toISOString(),
          items: requestedItems.map((item) => ({
            reference_id: clean(item.reference_id),
            service_type: serviceTypeCode(item.service_type),
            quantity: Number(item.quantity),
            observation: clean(item.observation)
          }))
        }
      })
    });

    const order = inserted[0];
    if (!order?.id) throw new PublicServiceError("La solicitud fue enviada, pero no se recibio confirmacion de la orden.", 502);
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = bearerToken(request);
    if (!token) return jsonError("Sesion administrativa requerida para actualizar catalogos publicos.", 401);
    const body = await request.json().catch(() => ({})) as { service_types?: unknown; service_stores?: unknown; satisfaction_questions?: unknown };
    const hasTypes = Array.isArray(body.service_types);
    const hasStores = Array.isArray(body.service_stores);
    const hasQuestions = Array.isArray(body.satisfaction_questions);
    if (!hasTypes && !hasStores && !hasQuestions) return jsonError("No se recibio ningun catalogo publico para actualizar.");
    const types = hasTypes ? normalizeServiceTypes(body.service_types) : null;
    const stores = hasStores ? normalizeServiceStores(body.service_stores) : null;
    const questions = hasQuestions ? normalizeSatisfactionQuestions(body.satisfaction_questions) : null;
    if (types && !types.some((item) => item.active)) return jsonError("Debe existir al menos un tipo de servicio activo.");
    if (stores && !stores.some((item) => item.active)) return jsonError("Debe existir al menos un almacen activo.");
    if (questions && !questions.some((item) => item.active)) return jsonError("Debe existir al menos una pregunta de satisfaccion activa.");

    if (localDatabase()) {
      // Local: el catalogo vive en el tenant de Prisma; el API aplica tenant + RBAC.
      const authorization = { Authorization: `Bearer ${token}` };
      const result: Record<string, unknown> = { ok: true };
      if (types) {
        result.service_types = await proxyToApi("/api/v1/services/service-types", { method: "PUT", headers: authorization, body: JSON.stringify({ types }) });
      }
      if (stores) {
        result.service_stores = await proxyToApi("/api/v1/services/service-stores", { method: "PUT", headers: authorization, body: JSON.stringify({ stores }) });
      }
      if (questions) {
        result.satisfaction_questions = await proxyToApi("/api/v1/services/satisfaction-questions", { method: "PUT", headers: authorization, body: JSON.stringify({ questions }) });
      }
      return NextResponse.json(result);
    }

    const companyId = publicCompanyId();
    const user = await currentSupabaseUser(token);
    if (!user?.id) return jsonError("La sesion no es valida para actualizar catalogos publicos.", 401);

    const rows = await supabaseUserRequest<Array<{ id: string; metadata?: Record<string, unknown> }>>(
      `/rest/v1/service_references?select=id,metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=1`,
      token
    ).catch((error) => {
      if (error instanceof PublicServiceError && error.status === 403) throw error;
      return [] as Array<{ id: string; metadata?: Record<string, unknown> }>;
    });
    const target = rows[0];
    const nextMetadata = {
      ...(target?.metadata || {}),
      ...(types ? { service_types: types } : {}),
      ...(stores ? { service_stores: stores } : {}),
      ...(questions ? { satisfaction_questions: questions } : {}),
      system_catalog: true,
      updated_at: new Date().toISOString()
    };

    if (!target?.id) {
      await supabaseUserRequest("/rest/v1/service_references", token, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          company_id: companyId,
          code: SERVICE_TYPES_REFERENCE_CODE,
          name: "Catalogos publicos de servicio",
          category: "sistema",
          description: "Catalogos internos de servicios configurables.",
          estimated_minutes: 1,
          brand: "",
          model: "",
          active: false,
          metadata: nextMetadata
        })
      });
    } else {
      await supabaseUserRequest(`/rest/v1/service_references?id=eq.${encodeURIComponent(target.id)}`, token, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ metadata: nextMetadata })
      });
    }

    return NextResponse.json({
      ok: true,
      ...(types ? { service_types: types } : {}),
      ...(stores ? { service_stores: stores } : {}),
      ...(questions ? { satisfaction_questions: questions } : {})
    });
  } catch (error) {
    return failure(error);
  }
}
