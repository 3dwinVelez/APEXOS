import { NextRequest, NextResponse } from "next/server";
import { hasAdministrativeCapability } from "@/lib/moduleAccessPolicy";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

type AnyRow = Record<string, unknown>;
type HttpError = Error & { status?: number };

async function supabaseRequest(path: string, init: RequestInit & { token?: string; service?: boolean } = {}) {
  const { token, service, headers, ...rest } = init;
  const key = service ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest,
    headers: {
      apikey: key,
      Authorization: `Bearer ${service ? SUPABASE_SERVICE_ROLE_KEY : token}`,
      "Content-Type": "application/json",
      ...headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || response.statusText;
    throw httpError(`Supabase ${response.status}: ${detail}`, response.status);
  }
  return body;
}

function httpError(message: string, status: number) {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
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

function clean(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function toNumberId(value: unknown) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash) + text.charCodeAt(index);
  return Math.abs(hash % 1000000) || Date.now();
}

function roleCatalogCode(role: AnyRow) {
  const existing = String(role.code || role.role_code || "").trim();
  if (existing) return existing;
  return `role_${Number(role.id) || toNumberId(role.name)}`;
}

async function requireCompanyRoleAdmin(token: string, companyId?: string | null, action: "read" | "create" | "edit" | "delete" = "read") {
  const userId = jwtSubject(token);
  if (!userId) throw httpError("Sesion invalida para gestionar roles.", 401);
  const filter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest(`/rest/v1/company_users?select=company_id,role,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active${filter}&limit=20`, {
    method: "GET",
    service: true
  }) as Array<{ company_id: string; role?: string }>;
  const owner = rows.find((row) => ["owner", "superadmin"].includes(String(row.role || "").toLowerCase()));
  if (owner?.company_id) return owner.company_id;
  const admin = rows.find((row) => String(row.role || "").toLowerCase() === "admin");
  const employeeFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const employees = await supabaseRequest(`/rest/v1/employees?select=company_id,metadata&user_id=eq.${encodeURIComponent(userId)}&status=eq.active${employeeFilter}&limit=20`, {
    method: "GET",
    service: true
  }) as Array<{ company_id?: string; metadata?: AnyRow }>;
  const capable = employees.find((employee) => {
    const metadata = employee.metadata || {};
    const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
    return employee.company_id && hasAdministrativeCapability({
      roleName: access.role_name || metadata.role_name,
      roleType: access.role_type || metadata.role_type,
      permissions: access.permissions || metadata.permissions
    }, "roles", action);
  });
  if (capable?.company_id) return capable.company_id;
  const metadata = employees[0]?.metadata || {};
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  const hasCapabilityContext = Boolean(metadata.role_name || metadata.role_type || access.role_name || access.role_type || metadata.permissions || access.permissions);
  if (admin?.company_id && !hasCapabilityContext) return admin.company_id;
  throw httpError("No tienes permisos para gestionar roles en esta empresa.", 403);
}

async function ensureCompanyRoleCatalog(companyId: string) {
  const catalogs = await supabaseRequest(`/rest/v1/master_catalogs?select=id&company_id=eq.${encodeURIComponent(companyId)}&code=eq.roles&limit=1`, {
    method: "GET",
    service: true
  }) as Array<{ id: string }>;
  if (catalogs[0]?.id) return catalogs[0].id;
  const created = await supabaseRequest("/rest/v1/master_catalogs?select=id", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId,
      code: "roles",
      name: "Roles",
      description: "Roles y permisos administrativos de la empresa.",
      scope: "company",
      active: true,
      sort_order: 90,
      metadata: { source: "apexos_admin_roles" }
    })
  }) as Array<{ id: string }>;
  if (!created[0]?.id) throw httpError("No fue posible preparar el catalogo de roles.", 500);
  return created[0].id;
}

function rolePayload(role: AnyRow, catalogId: string, companyId: string, { deleted = false } = {}) {
  const code = roleCatalogCode(role);
  return {
    catalog_id: catalogId,
    company_id: companyId,
    code,
    name: clean(role.name) || clean(role.nombre) || "Rol",
    description: clean(role.description) || clean(role.descripcion) || null,
    active: deleted ? false : role.active !== false && role.activo !== false,
    sort_order: Number(role.hierarchy_level || 100),
    metadata: {
      role_numeric_id: Number(role.id) || toNumberId(role.name),
      role_name: clean(role.name) || clean(role.nombre) || "Rol",
      role_type: clean(role.role_type) || "custom",
      access_profile: clean(role.access_profile) || "standard",
      scope: clean(role.scope) || "company",
      scopes: role.scopes || { locations: [], areas: [], cost_centers: [], processes: [] },
      restrictions: role.restrictions || { locations: [], areas: [], cost_centers: [], processes: [] },
      can_delegate: Boolean(role.can_delegate),
      sensitive: Boolean(role.sensitive),
      is_system: Boolean(role.is_system),
      permissions: role.permissions || {},
      ...(deleted ? { deleted: true, deleted_at: new Date().toISOString() } : {}),
      source: "apexos_admin_roles"
    }
  };
}

function sameRole(metadata: AnyRow, role: AnyRow) {
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  const expectedId = String(role.id || "").trim();
  const assignedIds = [metadata.role_id, metadata.role_numeric_id, access.role_id].map((value) => String(value || "").trim());
  if (expectedId && assignedIds.includes(expectedId)) return true;
  const expectedName = String(role.name || role.nombre || "").trim().toLowerCase();
  return Boolean(expectedName && [metadata.role_name, access.role_name].some((value) => String(value || "").trim().toLowerCase() === expectedName));
}

async function propagateRolePermissions(companyId: string, role: AnyRow) {
  const employees = await supabaseRequest(`/rest/v1/employees?select=id,metadata&company_id=eq.${encodeURIComponent(companyId)}&limit=1000`, {
    method: "GET",
    service: true
  }) as Array<{ id?: string; metadata?: AnyRow }>;
  const assigned = employees.filter((employee) => employee.id && sameRole(employee.metadata || {}, role));
  await Promise.all(assigned.map((employee) => {
    const metadata = employee.metadata || {};
    const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
    const permissions = role.permissions || {};
    return supabaseRequest(`/rest/v1/employees?id=eq.${encodeURIComponent(String(employee.id))}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        metadata: {
          ...metadata,
          role_name: clean(role.name) || metadata.role_name,
          role_type: clean(role.role_type) || metadata.role_type,
          access_profile: clean(role.access_profile) || metadata.access_profile,
          role_scope: clean(role.scope) || metadata.role_scope,
          permissions,
          access: {
            ...access,
            role_name: clean(role.name) || access.role_name,
            role_type: clean(role.role_type) || access.role_type,
            access_profile: clean(role.access_profile) || access.access_profile,
            role_scope: clean(role.scope) || access.role_scope,
            permissions
          }
        }
      })
    });
  }));
  return assigned.length;
}

export async function POST(request: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Faltan variables de Supabase para gestionar roles." }, { status: 500 });
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as AnyRow;
    const role = body.role && typeof body.role === "object" ? body.role as AnyRow : body;
    const operation = String(body.operation || "edit") === "create" ? "create" : "edit";
    const companyId = await requireCompanyRoleAdmin(token, clean(body.company_id), operation);
    const catalogId = await ensureCompanyRoleCatalog(companyId);
    await supabaseRequest("/rest/v1/master_catalog_items?on_conflict=catalog_id,code", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rolePayload(role, catalogId, companyId))
    });
    const synchronizedUsers = await propagateRolePermissions(companyId, role);
    return NextResponse.json({ ok: true, synchronized_users: synchronizedUsers, role: { ...role, code: roleCatalogCode(role) } });
  } catch (error) {
    const status = (error as HttpError)?.status || 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible guardar el rol." }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Faltan variables de Supabase para gestionar roles." }, { status: 500 });
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as AnyRow;
    const role = body.role && typeof body.role === "object" ? body.role as AnyRow : body;
    const companyId = await requireCompanyRoleAdmin(token, clean(body.company_id), "delete");
    const catalogId = await ensureCompanyRoleCatalog(companyId);
    await supabaseRequest("/rest/v1/master_catalog_items?on_conflict=catalog_id,code", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rolePayload(role, catalogId, companyId, { deleted: true }))
    });
    return NextResponse.json({ ok: true, id: role.id || null });
  } catch (error) {
    const status = (error as HttpError)?.status || 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible eliminar el rol." }, { status });
  }
}
