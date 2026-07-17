import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

let rootEnvCache: Record<string, string> | null = null;

type PublicServiceRequest = {
  company_id?: string;
  company_name?: string;
  customer_name?: string;
  customer_document?: string;
  customer_phone?: string;
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
};
type PublicReferenceRow = { id: string; company_id?: string; code: string; name: string; category?: string; brand?: string; model?: string };
type SupabaseUser = { id?: string; email?: string };
type PermissionRow = { module?: string; actions?: unknown };

const DEFAULT_SERVICE_TYPES = [
  { code: "montaje", label: "Montaje", active: true },
  { code: "desmontaje", label: "Desmontaje", active: true },
  { code: "ambos", label: "Montaje y desmontaje", active: true }
];
const DEFAULT_SERVICE_STORES = [
  { code: "hogar_y_moda_1", label: "Hogar y Moda 1", active: true },
  { code: "hogar_y_moda_2", label: "Hogar y Moda 2", active: true }
];
const SERVICE_TYPES_REFERENCE_CODE = "__SERVICE_TYPES__";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
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
  const value = envValue("NEXT_PUBLIC_API_URL", "API_URL");
  if (!value) throw new Error("API_URL no configurada para service-requests.");
  return value;
}

function supabaseConfig() {
  return {
    url: envValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    anonKey: envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"),
    serviceRoleKey: envValue("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
    publicCompanyId: envValue("APEXOS_PUBLIC_SERVICE_COMPANY_ID", "NEXT_PUBLIC_APEXOS_PUBLIC_COMPANY_ID")
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

async function supabaseRequest<T>(path: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.anonKey || !config.serviceRoleKey) {
    const missing = [
      !config.url ? "SUPABASE_URL" : "",
      !config.anonKey ? "SUPABASE_ANON_KEY" : "",
      !config.serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : ""
    ].filter(Boolean).join(", ");
    throw new Error(`Falta configuracion de Supabase para recibir solicitudes publicas: ${missing}.`);
  }
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || response.statusText;
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  return body as T;
}

function jwtSubject(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(Buffer.from(normalized, "base64").toString("utf8")).sub || "");
  } catch {
    return "";
  }
}

function isAdministrativeRole(value: unknown) {
  const role = String(value || "").trim().toLowerCase();
  return ["owner", "admin", "superadmin", "administrador", "administrador de empresa", "apex_admin"].includes(role)
    || role.includes("admin")
    || role.includes("coordinador");
}

function actionList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase());
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true)
      .map(([action]) => action.trim().toLowerCase());
  }
  return [];
}

function permissionRows(value: unknown): PermissionRow[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as PermissionRow[];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).map(([module, actions]) => ({ module, actions }));
}

function hasCatalogAdminPermission(value: unknown) {
  const modules = new Set(["*", "admin", "administracion", "administracion_apex", "services", "servicios", "configuracion"]);
  const actions = new Set(["*", "edit", "write", "configure", "administer", "manage", "manage_catalogs"]);
  return permissionRows(value).some((permission) => {
    const moduleName = String(permission.module || "").trim().toLowerCase();
    return modules.has(moduleName) && actionList(permission.actions).some((action) => actions.has(action));
  });
}

function metadataAllowsCatalogAdmin(metadata: Record<string, unknown>) {
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as Record<string, unknown> : {};
  return isAdministrativeRole(metadata.role_name)
    || isAdministrativeRole(metadata.role_type)
    || isAdministrativeRole(access.role_name)
    || isAdministrativeRole(access.role_type)
    || hasCatalogAdminPermission(metadata.permissions)
    || hasCatalogAdminPermission(access.permissions)
    || hasCatalogAdminPermission(metadata.role_permissions)
    || hasCatalogAdminPermission(access.role_permissions);
}

async function currentSupabaseUser(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || !supabaseConfig().url || !supabaseConfig().anonKey) return null;
  const response = await fetch(`${supabaseConfig().url}/auth/v1/user`, {
    headers: {
      apikey: supabaseConfig().anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return await response.json().catch(() => null) as SupabaseUser | null;
}

async function hasAdministrativeSession(authorization: string) {
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;
  try {
    const response = await fetch(`${localApiUrl()}/api/v1/auth/me`, { headers: { Authorization: authorization } });
    if (response.ok) {
      const data = await response.json().catch(() => ({})) as {
        user?: {
          role?: string;
          role_metadata?: Record<string, unknown>;
          role_permissions?: unknown;
        };
      };
      if (isAdministrativeRole(data.user?.role)
        || isAdministrativeRole(data.user?.role_metadata?.role_type)
        || hasCatalogAdminPermission(data.user?.role_permissions)
        || metadataAllowsCatalogAdmin(data.user?.role_metadata || {})) {
        return true;
      }
    }
  } catch {
    // Production commonly uses Supabase Auth without a local API session.
  }

  const token = authorization.replace(/^Bearer\s+/i, "");
  const user = await currentSupabaseUser(authorization);
  const userId = user?.id || jwtSubject(token);
  const config = supabaseConfig();
  if (!userId || !config.url || !config.anonKey || !config.serviceRoleKey) return false;

  const memberships = await supabaseRequest<Array<{ company_id: string; role?: string; status?: string }>>(
    `/rest/v1/company_users?select=company_id,role,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=20`
  ).catch(() => []);
  if (memberships.some((membership) => isAdministrativeRole(membership.role))) return true;

  const employees = await supabaseRequest<Array<{ metadata?: Record<string, unknown> }>>(
    `/rest/v1/employees?select=metadata&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=20`
  ).catch(() => []);
  return employees.some((employee) => metadataAllowsCatalogAdmin(employee.metadata || {}));
}

async function supabaseRpc<T>(functionName: string, payload: Record<string, unknown>) {
  return supabasePublicRead<T>(`/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function supabasePublicRead<T>(path: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.anonKey) {
    const missing = [
      !config.url ? "SUPABASE_URL" : "",
      !config.anonKey ? "SUPABASE_ANON_KEY" : ""
    ].filter(Boolean).join(", ");
    throw new Error(`Falta configuracion publica de Supabase para consultar referencias: ${missing}.`);
  }
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || response.statusText;
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  return body as T;
}

async function resolveCompanyCandidates(body: PublicServiceRequest, request: NextRequest) {
  const { publicCompanyId } = supabaseConfig();
  const companyName = clean(body.company_name) || clean(request.nextUrl.searchParams.get("empresa"));
  const candidates: string[] = [];

  if (body.company_id && isUuid(clean(body.company_id))) candidates.push(clean(body.company_id));

  if (companyName) {
    const filter = `or=(name.ilike.*${encodeURIComponent(companyName)}*,legal_name.ilike.*${encodeURIComponent(companyName)}*,tax_id.eq.${encodeURIComponent(companyName)})&`;
    const activeCompanies = await supabaseRequest<Array<{ id: string }>>(
      `/rest/v1/companies?select=id&${filter}status=eq.active&order=created_at.asc&limit=5`
    ).catch(() => []);
    candidates.push(...activeCompanies.map((item) => item.id).filter(Boolean));
    if (!activeCompanies.length) {
      const namedCompanies = await supabaseRequest<Array<{ id: string }>>(
        `/rest/v1/companies?select=id&${filter}order=created_at.asc&limit=5`
      ).catch(() => []);
      candidates.push(...namedCompanies.map((item) => item.id).filter(Boolean));
    }
  }

  if (publicCompanyId && isUuid(publicCompanyId)) candidates.push(publicCompanyId);

  const fallbackCompanies = await supabaseRequest<Array<{ id: string }>>(
    "/rest/v1/companies?select=id&status=eq.active&order=created_at.asc&limit=10"
  ).catch(() => []);
  candidates.push(...fallbackCompanies.map((item) => item.id).filter(Boolean));

  if (!candidates.length) {
    const anyCompanies = await supabaseRequest<Array<{ id: string }>>(
      "/rest/v1/companies?select=id&order=created_at.asc&limit=10"
    ).catch(() => []);
    candidates.push(...anyCompanies.map((item) => item.id).filter(Boolean));
  }

  if (!candidates.length) {
    const referenceCompanies = await supabasePublicRead<Array<{ company_id?: string }>>(
      `/rest/v1/service_references?select=company_id&active=eq.true&code=neq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=50`
    ).catch(() => []);
    candidates.push(...referenceCompanies.map((item) => item.company_id || "").filter(Boolean));
  }

  return [...new Set(candidates)];
}

async function resolveCompanyId(body: PublicServiceRequest, request: NextRequest) {
  return (await resolveCompanyCandidates(body, request))[0] || "";
}

async function resolveCompanyIdFromReference(referenceId: string) {
  if (!isUuid(referenceId)) return "";
  const references = await supabasePublicRead<Array<{ company_id?: string }>>(
    `/rest/v1/service_references?select=company_id&id=eq.${encodeURIComponent(referenceId)}&active=eq.true&limit=1`
  ).catch(() => []);
  return references[0]?.company_id || "";
}

async function resolveReferenceId(companyId: string, referenceId: string, productReference: string) {
  if (referenceId && isUuid(referenceId)) {
    const references = await supabasePublicRead<Array<{ id: string }>>(
      `/rest/v1/service_references?select=id&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&id=eq.${encodeURIComponent(referenceId)}&limit=1`
    ).catch(() => []);
    if (references[0]?.id) return references[0].id;
  }
  if (!productReference) return null;
  const references = await supabasePublicRead<Array<{ id: string }>>(
    `/rest/v1/service_references?select=id&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&or=(code.ilike.*${encodeURIComponent(productReference)}*,name.ilike.*${encodeURIComponent(productReference)}*)&limit=1`
  ).catch(() => []);
  return references[0]?.id || null;
}

async function activeReferencesForCompany(companyId: string) {
  return supabasePublicRead<PublicReferenceRow[]>(
    `/rest/v1/service_references?select=id,company_id,code,name,category,brand,model&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&code=neq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&order=code.asc&limit=500`
  );
}

async function activeReferencesWithoutCompany() {
  return supabasePublicRead<PublicReferenceRow[]>(
    `/rest/v1/service_references?select=id,company_id,code,name,category,brand,model&active=eq.true&code=neq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&order=code.asc&limit=500`
  );
}

async function serviceTypesForCompany(companyId: string) {
  const rows = await supabasePublicRead<Array<{ metadata?: Record<string, unknown> }>>(
    `/rest/v1/service_references?select=metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=1`
  ).catch(() => []);
  return normalizeServiceTypes(rows[0]?.metadata?.service_types).filter((item) => item.active);
}

async function serviceStoresForCompany(companyId: string) {
  const rows = await supabasePublicRead<Array<{ metadata?: Record<string, unknown> }>>(
    `/rest/v1/service_references?select=metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=1`
  ).catch(() => []);
  return normalizeServiceStores(rows[0]?.metadata?.service_stores).filter((item) => item.active);
}

export async function GET(request: NextRequest) {
  try {
    const companyIds = await resolveCompanyCandidates({}, request);
    let companyId = companyIds[0] || "";
    let references: Awaited<ReturnType<typeof activeReferencesForCompany>> = [];
    if (companyId) {
      for (const candidateId of companyIds) {
        const rows = await activeReferencesForCompany(candidateId).catch(() => []);
        if (rows.length || candidateId === companyId) {
          companyId = candidateId;
          references = rows;
          if (rows.length) break;
        }
      }
    }
    if (!references.length) {
      const rows = await activeReferencesWithoutCompany().catch(() => []);
      companyId = rows[0]?.company_id || companyId;
      references = companyId ? rows.filter((item) => item.company_id === companyId) : rows;
    }
    if (!companyId || !references.length) return jsonError("No se encontro una empresa con referencias activas para el formulario.", 404);
    const [serviceTypes, serviceStores] = await Promise.all([serviceTypesForCompany(companyId), serviceStoresForCompany(companyId)]);
    return NextResponse.json({ ok: true, company_id: companyId, references, service_types: serviceTypes, service_stores: serviceStores });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible consultar las referencias." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PublicServiceRequest;
    const required = [
      ["customer_name", "nombre completo"],
      ["customer_document", "cedula"],
      ["customer_phone", "telefono"],
      ["service_type", "tipo de servicio"],
      ["customer_address", "direccion"],
      ["customer_neighborhood", "barrio"],
      ["service_store", "almacen"],
      ["reference_id", "referencia del producto"]
    ] as const;
    const missing = required.filter(([key]) => !clean(body[key])).map(([, label]) => label);
    if (missing.length) return jsonError(`Completa los campos obligatorios: ${missing.join(", ")}.`);
    if (!/^\d{5,12}$/.test(clean(body.customer_document))) return jsonError("La cedula debe contener entre 5 y 12 numeros.");
    if (!/^[0-9+()\-\s]{7,20}$/.test(clean(body.customer_phone))) return jsonError("Registra un telefono valido para confirmar la visita.");

    let companyId = await resolveCompanyId(body, request);
    if (!companyId) companyId = await resolveCompanyIdFromReference(clean(body.reference_id));
    if (!companyId) return jsonError("No se encontro una empresa activa para registrar la solicitud.", 404);

    const productReference = clean(body.product_reference) || clean(body.product_description);
    const referenceId = await resolveReferenceId(companyId, clean(body.reference_id), productReference);
    if (!referenceId) return jsonError("Selecciona una referencia activa para el producto que se va a instalar.");
    const serviceTypes = await serviceTypesForCompany(companyId);
    const serviceType = serviceTypeCode(clean(body.service_type) || "montaje");
    if (!serviceTypes.some((item) => item.code === serviceType)) return jsonError("Selecciona un tipo de servicio activo para esta empresa.");
    const serviceStores = await serviceStoresForCompany(companyId);
    const storeCode = serviceTypeCode(clean(body.service_store));
    const store = serviceStores.find((item) => item.code === storeCode);
    if (!store) return jsonError("Selecciona un almacen activo para esta empresa.");
    const notes = clean(body.notes) || "Solicitud creada por formulario publico. Requiere revision administrativa.";
    const metadata: Record<string, unknown> = {
      created_from: "public_service_request",
      public_request: true,
      requires_admin_completion: true,
      preorder_status: "agendado",
      customer_document: clean(body.customer_document),
      customer_email: clean(body.customer_email),
      customer_neighborhood: clean(body.customer_neighborhood),
      service_store: store.code,
      service_store_label: store.label,
      product_reference: clean(body.product_reference),
      product_description: clean(body.product_description),
      received_at: new Date().toISOString()
    };
    const inserted = await supabaseRpc<Array<{ id: string; number: string }>>("create_public_service_order", {
      p_reference_id: referenceId,
      p_service_type: serviceType,
      p_customer_name: clean(body.customer_name),
      p_customer_address: clean(body.customer_address),
      p_customer_phone: clean(body.customer_phone),
      p_invoice_number: clean(body.invoice_number) || null,
      p_notes: notes,
      p_metadata: metadata
    });

    const order = inserted[0];
    if (!order?.id) throw new Error("La solicitud fue enviada, pero no se recibio confirmacion de la orden.");
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible registrar la solicitud." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!await hasAdministrativeSession(authorization)) return jsonError("Sesion administrativa requerida para actualizar catalogos publicos.", 401);
    const body = await request.json().catch(() => ({})) as { company_name?: string; service_types?: unknown; service_stores?: unknown; satisfaction_questions?: unknown };
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
    const companyIds = await resolveCompanyCandidates(body, request);
    const companyId = companyIds[0] || "";
    if (!companyId) return jsonError("No se encontro empresa para actualizar catalogos publicos.", 404);
    const rows = await supabaseRequest<Array<{ id: string; metadata?: Record<string, unknown> }>>(
      `/rest/v1/service_references?select=id,metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=1`
    );
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
      await supabaseRequest("/rest/v1/service_references", {
        method: "POST",
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
      await supabaseRequest(`/rest/v1/service_references?id=eq.${encodeURIComponent(target.id)}`, {
        method: "PATCH",
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
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible actualizar catalogos publicos." }, { status: 500 });
  }
}
