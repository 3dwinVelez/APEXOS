import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

let rootEnvCache: Record<string, string> | null = null;

type AnyRow = Record<string, unknown>;
type PermissionRow = { module?: string; actions?: unknown };
type SupabaseUser = { id?: string; email?: string };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
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

function supabaseConfig() {
  return {
    url: envValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    anonKey: envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"),
    serviceRoleKey: envValue("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
  };
}

function localApiUrl() {
  return envValue("NEXT_PUBLIC_API_URL", "API_URL");
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
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

async function supabaseRequest<T>(requestPath: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.anonKey || !config.serviceRoleKey) {
    const missing = [
      !config.url ? "SUPABASE_URL" : "",
      !config.anonKey ? "SUPABASE_ANON_KEY" : "",
      !config.serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : ""
    ].filter(Boolean).join(", ");
    throw new Error(`Falta configuracion de Supabase para editar ordenes: ${missing}.`);
  }
  const response = await fetch(`${config.url}${requestPath}`, {
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

function hasServiceWritePermission(value: unknown) {
  const modules = new Set(["*", "services", "servicios", "admin", "administracion", "administracion_apex"]);
  const actions = new Set(["*", "edit", "write", "configure", "administer", "manage"]);
  return permissionRows(value).some((permission) => {
    const moduleName = String(permission.module || "").trim().toLowerCase();
    return modules.has(moduleName) && actionList(permission.actions).some((action) => actions.has(action));
  });
}

function metadataAllowsServiceAdmin(metadata: AnyRow) {
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  return isAdministrativeRole(metadata.role_name)
    || isAdministrativeRole(metadata.role_type)
    || isAdministrativeRole(access.role_name)
    || isAdministrativeRole(access.role_type)
    || hasServiceWritePermission(metadata.permissions)
    || hasServiceWritePermission(access.permissions)
    || hasServiceWritePermission(metadata.role_permissions)
    || hasServiceWritePermission(access.role_permissions);
}

function employeeAllowsServiceAdmin(employee: { position?: string; metadata?: AnyRow }, localApiAllows = false) {
  if (localApiAllows) return true;
  return isAdministrativeRole(employee.position) || metadataAllowsServiceAdmin(employee.metadata || {});
}

async function currentSupabaseUser(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const config = supabaseConfig();
  if (!token || !config.url || !config.anonKey) return null;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return await response.json().catch(() => null) as SupabaseUser | null;
}

async function supabaseAuthUserIdByEmail(email: string) {
  const target = String(email || "").trim().toLowerCase();
  const config = supabaseConfig();
  if (!target || !config.url || !config.serviceRoleKey) return "";
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(`${config.url}/auth/v1/admin/users?per_page=200&page=${page}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      }
    }).catch(() => null);
    if (!response?.ok) return "";
    const body = await response.json().catch(() => ({})) as { users?: Array<{ id?: string; email?: string }> } | Array<{ id?: string; email?: string }>;
    const users = Array.isArray(body) ? body : Array.isArray(body.users) ? body.users : [];
    const match = users.find((item) => String(item.email || "").trim().toLowerCase() === target);
    if (match?.id && isUuid(match.id)) return match.id;
    if (users.length < 200) return "";
  }
  return "";
}

async function isPlatformAdmin(userId: string) {
  if (!userId) return false;
  const rows = await supabaseRequest<Array<{ user_id?: string; status?: string }>>(
    `/rest/v1/platform_admins?select=user_id,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=1`
  ).catch(() => []);
  return Boolean(rows[0]?.user_id);
}

async function hasServiceAdminSession(authorization: string, companyId: string) {
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;
  let localApiAllows = false;
  let localApiEmail = "";
  const apiUrl = localApiUrl();
  if (apiUrl) {
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/me`, { headers: { Authorization: authorization } });
      if (response.ok) {
        const data = await response.json().catch(() => ({})) as { user?: { email?: string; role?: string; role_metadata?: AnyRow; role_permissions?: unknown } };
        localApiEmail = String(data.user?.email || "").trim().toLowerCase();
        if (isAdministrativeRole(data.user?.role)
          || isAdministrativeRole(data.user?.role_metadata?.role_type)
          || hasServiceWritePermission(data.user?.role_permissions)
          || metadataAllowsServiceAdmin(data.user?.role_metadata || {})) {
          localApiAllows = true;
        }
      }
    } catch {
      // Supabase-auth sessions do not always exist in the local API.
    }
  }

  const token = authorization.replace(/^Bearer\s+/i, "");
  const user = await currentSupabaseUser(authorization);
  const userId = user?.id || jwtSubject(token);
  const authEmail = String(user?.email || localApiEmail || "").trim().toLowerCase();
  const linkedSupabaseUserId = isUuid(userId) ? userId : await supabaseAuthUserIdByEmail(authEmail);
  const hasSupabaseUserId = isUuid(linkedSupabaseUserId);
  if (!linkedSupabaseUserId && !authEmail) return false;
  if (hasSupabaseUserId && await isPlatformAdmin(linkedSupabaseUserId)) return true;

  const memberships = hasSupabaseUserId
    ? await supabaseRequest<Array<{ company_id: string; role?: string; status?: string }>>(
      `/rest/v1/company_users?select=company_id,role,status&user_id=eq.${encodeURIComponent(linkedSupabaseUserId)}&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&limit=5`
    ).catch(() => [])
    : [];
  if (localApiAllows && memberships.length) return true;
  if (memberships.some((membership) => isAdministrativeRole(membership.role))) return true;

  const employeeIdentityFilter = hasSupabaseUserId && authEmail
    ? `or=(user_id.eq.${encodeURIComponent(linkedSupabaseUserId)},email.eq.${encodeURIComponent(authEmail)})`
    : hasSupabaseUserId
      ? `user_id=eq.${encodeURIComponent(linkedSupabaseUserId)}`
      : authEmail
        ? `email=eq.${encodeURIComponent(authEmail)}`
        : "";
  if (!employeeIdentityFilter) return false;
  const employees = await supabaseRequest<Array<{ position?: string; metadata?: AnyRow }>>(
    `/rest/v1/employees?select=position,metadata&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&${employeeIdentityFilter}&limit=20`
  ).catch(() => []);
  return employees.some((employee) => employeeAllowsServiceAdmin(employee, localApiAllows));
}

function serviceTechnicianEmployee(employee: { user_type?: string; position?: string; metadata?: AnyRow } | null | undefined) {
  const metadata = employee?.metadata || {};
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  const operational = metadata.operational && typeof metadata.operational === "object" ? metadata.operational as AnyRow : {};
  const values = [
    employee?.user_type,
    employee?.position,
    metadata.profile_kind,
    metadata.role_name,
    access.profile_kind,
    access.role_name,
    operational.classification
  ].map((value) => String(value || "").trim().toLowerCase());
  return values.includes("tecnico")
    || values.includes("técnico")
    || metadata.services_assigned_only === true
    || operational.can_receive_services === true;
}

async function activeServiceTechnician(companyId: string, technicianId: unknown) {
  if (!isUuid(technicianId)) throw new Error("Selecciona un tecnico operativo activo de esta empresa.");
  const technicians = await supabaseRequest<Array<{ id: string; user_id?: string; user_type?: string; position?: string; metadata?: AnyRow }>>(
    `/rest/v1/employees?select=id,user_id,user_type,position,metadata&id=eq.${encodeURIComponent(String(technicianId))}&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&limit=1`
  );
  const technician = technicians[0];
  if (!technician?.id || !serviceTechnicianEmployee(technician)) {
    throw new Error("Selecciona un tecnico operativo activo de esta empresa.");
  }
  return technician;
}

async function assertActiveReference(companyId: string, referenceId: unknown) {
  if (!isUuid(referenceId)) throw new Error("Selecciona una referencia valida.");
  const references = await supabaseRequest<Array<{ id: string }>>(
    `/rest/v1/service_references?select=id&id=eq.${encodeURIComponent(String(referenceId))}&company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&limit=1`
  );
  if (!references[0]?.id) throw new Error("Selecciona una referencia activa.");
  return references[0].id;
}

async function assertServiceType(companyId: string, value: unknown) {
  const code = serviceTypeCode(value || "montaje");
  if (!code) throw new Error("Selecciona un tipo de servicio valido.");
  const rows = await supabaseRequest<Array<{ metadata?: AnyRow }>>(
    `/rest/v1/service_references?select=metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent("__SERVICE_TYPES__")}&limit=1`
  ).catch(() => []);
  const types = Array.isArray(rows[0]?.metadata?.service_types) ? rows[0]?.metadata?.service_types as AnyRow[] : [];
  if (types.length && !types.some((item) => serviceTypeCode(item.code || item.label) === code && item.active !== false)) {
    throw new Error("Selecciona un tipo de servicio activo.");
  }
  return code;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const orderId = params.id;
    if (!isUuid(orderId)) return jsonError("Orden de servicio invalida.", 400);

    const authorization = request.headers.get("authorization") || "";
    const body = await request.json().catch(() => ({})) as AnyRow;
    const rows = await supabaseRequest<Array<{
      id: string;
      company_id: string;
      number?: string;
      reference_id?: string | null;
      technician_employee_id?: string | null;
      status?: string;
      metadata?: AnyRow;
    }>>(
      `/rest/v1/service_orders?select=id,company_id,number,reference_id,technician_employee_id,status,metadata&id=eq.${encodeURIComponent(orderId)}&limit=1`
    );
    const current = rows[0];
    if (!current?.id) return jsonError("No se encontro la orden de servicio.", 404);
    if (!await hasServiceAdminSession(authorization, current.company_id)) {
      return jsonError("Sesion administrativa requerida para editar ordenes de servicio.", 403);
    }
    if (["cerrada", "no_ejecutada"].includes(String(current.status || ""))) {
      return jsonError("Las ordenes finalizadas no se pueden editar para proteger la trazabilidad.", 409);
    }

    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const bodyMetadata = body.metadata && typeof body.metadata === "object" ? body.metadata as AnyRow : {};
    const nextMetadata: AnyRow = { ...metadata, ...bodyMetadata };
    const patch: AnyRow = {};

    if (body.reference_id != null && String(body.reference_id).trim()) {
      patch.reference_id = await assertActiveReference(current.company_id, body.reference_id);
    }
    if (body.technician_id != null && String(body.technician_id).trim()) {
      const technician = await activeServiceTechnician(current.company_id, body.technician_id);
      patch.technician_employee_id = technician.id;
      patch.technician_user_id = technician.user_id || null;
      nextMetadata.reassigned_at = new Date().toISOString();
    }
    if (body.status != null) {
      const nextStatus = String(body.status || "").trim() || String(current.status || "agendado");
      const allowedStatuses = new Set(["agendado", "pendiente", "cancelada"]);
      if (!allowedStatuses.has(nextStatus)) throw new Error("Selecciona un estado valido para la orden.");
      const technicianReady = Boolean(patch.technician_employee_id || current.technician_employee_id);
      const referenceReady = Boolean(patch.reference_id || current.reference_id);
      if (nextStatus === "pendiente" && !technicianReady) throw new Error("Asigna un tecnico responsable antes de pasar la preorden a pendiente.");
      if (nextStatus === "pendiente" && !referenceReady) throw new Error("Selecciona una referencia activa antes de pasar la preorden a pendiente.");
      patch.status = nextStatus;
      nextMetadata.requires_admin_completion = nextStatus === "agendado";
      nextMetadata.preorder_status = nextStatus === "agendado" ? "agendado" : "";
      if (nextStatus === "pendiente") nextMetadata.scheduled_from_public_request_at = new Date().toISOString();
    }
    if (body.service_type != null) patch.service_type = await assertServiceType(current.company_id, body.service_type);
    if (body.customer_name != null) patch.customer_name = String(body.customer_name || "").trim();
    if (body.customer_address != null) patch.customer_address = String(body.customer_address || "").trim();
    if (body.customer_phone != null) patch.customer_phone = String(body.customer_phone || "").trim();
    if (body.invoice_number != null) patch.invoice_number = String(body.invoice_number || "").trim();
    if (body.notes != null) patch.notes = String(body.notes || "").trim();
    if (body.scheduled_date != null && String(body.scheduled_date).trim()) {
      const scheduled = new Date(String(body.scheduled_date));
      if (Number.isNaN(scheduled.getTime())) throw new Error("La fecha programada debe ser valida.");
      patch.scheduled_date = String(body.scheduled_date).slice(0, 10);
    }
    if (body.customer_document != null) {
      if (!/^\d+$/.test(String(body.customer_document))) throw new Error("La cedula del cliente debe contener solo numeros.");
      nextMetadata.customer_document = String(body.customer_document);
    }
    if (body.cedi_delivery_date != null && String(body.cedi_delivery_date).trim()) {
      const cediDate = new Date(String(body.cedi_delivery_date));
      if (Number.isNaN(cediDate.getTime())) throw new Error("La fecha de entrega CEDI debe ser valida.");
      nextMetadata.cedi_delivery_date = String(body.cedi_delivery_date).slice(0, 10);
    }
    patch.metadata = {
      ...nextMetadata,
      last_admin_edit_at: new Date().toISOString()
    };

    const updated = await supabaseRequest<Array<AnyRow>>(
      `/rest/v1/service_orders?select=id,number,reference_id,technician_employee_id,service_type,status,customer_name,customer_address,customer_phone,invoice_number,scheduled_date,started_at,closed_at,created_at,notes,metadata&id=eq.${encodeURIComponent(orderId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch)
      }
    );
    return NextResponse.json(updated[0] || { id: orderId, ...patch });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "No fue posible actualizar la orden de servicio.", 500);
  }
}
