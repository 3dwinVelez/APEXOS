import { NextRequest, NextResponse } from "next/server";
import { authCredentialPatch } from "@/lib/adminUserCredentialSync";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const DEPLOYMENT_COMMIT = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "unknown";

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

async function updateSupabaseAuthUser(userId: string, payload: AnyRow) {
  return supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    service: true,
    body: JSON.stringify(payload)
  });
}

async function findSupabaseAuthUserIdByEmail(email: unknown) {
  const target = normalizeUsernameEmail(email);
  if (!target) return "";
  for (let page = 1; page <= 10; page += 1) {
    const body = await supabaseRequest(`/auth/v1/admin/users?per_page=200&page=${page}`, { method: "GET", service: true }) as { users?: Array<{ id?: string; email?: string }> };
    const users = Array.isArray(body?.users) ? body.users : [];
    const match = users.find((user) => normalizeUsernameEmail(user.email) === target);
    if (match?.id) return String(match.id);
    if (users.length < 200) break;
  }
  return "";
}

async function resolveSupabaseAuthUserId(current: AnyRow) {
  return String(clean(current.user_id) || await findSupabaseAuthUserIdByEmail(current.email) || "");
}

function clean(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalizeUsernameEmail(value: unknown, fallbackDomain = "apex.local") {
  const text = String(clean(value) || "").toLowerCase();
  if (!text) return null;
  return text.includes("@") ? text : `${text}@${fallbackDomain}`;
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

async function requirePhysicalDocumentDelete(token: string, companyId: string) {
  const userId = jwtSubject(token);
  if (!userId) throw httpError("Sesion invalida para validar permiso especial.", 401);
  const rows = await supabaseRequest(`/rest/v1/employees?select=id,metadata&company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
    method: "GET",
    service: true
  }) as Array<{ metadata?: AnyRow }>;
  const metadata = rows[0]?.metadata && typeof rows[0].metadata === "object" ? rows[0].metadata : {};
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  const raw = [metadata.special_permissions, access.special_permissions, metadata.permissions].filter(Boolean).join(",");
  if (!raw.split(/[,\s;]+/).map((item) => item.trim().toLowerCase()).includes("delete_physical_records")) {
    throw httpError("No tienes permiso especial para eliminar documentos de la base.", 403);
  }
}

function validateUserPayload(body: AnyRow, { requirePassword = false } = {}) {
  const email = clean(body.email || body.access_email)?.toLowerCase();
  const firstNames = clean(body.first_names);
  const lastNames = clean(body.last_names);
  const fullName = clean(body.name) || `${firstNames || ""} ${lastNames || ""}`.trim();
  if (!email) throw httpError("Correo requerido.", 400);
  if (!fullName) throw httpError("Nombre requerido.", 400);
  if (!clean(body.role_id) && !clean(body.role_name)) throw httpError("Rol principal requerido.", 400);
  if (!clean(body.company) && !clean(body.company_id)) throw httpError("Empresa requerida.", 400);
  if (!clean(body.document)) throw httpError("Documento requerido.", 400);
  if (requirePassword) {
    const pw = String(body.password || "");
    if (pw.length < 8) throw httpError("La clave temporal debe tener minimo 8 caracteres.", 400);
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw httpError("La clave temporal debe combinar letras y numeros.", 400);
  }
  return { email, fullName };
}

function assertPasswordPolicy(value: unknown) {
  const pw = String(value || "");
  if (pw.length < 8) throw httpError("La clave temporal debe tener minimo 8 caracteres.", 400);
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw httpError("La clave temporal debe combinar letras y numeros.", 400);
}

function userStatusToEmployeeStatus(value: unknown) {
  const status = String(value || "activo").toLowerCase();
  if (["inactivo", "inactive"].includes(status)) return "inactive";
  if (["suspendido", "bloqueado", "suspended", "pendiente_activacion"].includes(status)) return "inactive";
  return "active";
}

function companyRole(roleName: unknown) {
  const value = String(roleName || "").toLowerCase();
  if (value.includes("owner")) return "owner";
  if (value.includes("admin") || value.includes("coordinador")) return "admin";
  if (value.includes("viewer") || value.includes("consulta")) return "viewer";
  return "member";
}

function permissionFlag(permissions: unknown, moduleKey: string, action: string) {
  if (!permissions || typeof permissions !== "object") return false;
  const row = (permissions as Record<string, unknown>)[moduleKey];
  return Boolean(row && typeof row === "object" && (row as Record<string, unknown>)[action]);
}

function isAdministrativeAccess(metadata: AnyRow) {
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  const permissions = access.permissions || access.role_permissions || metadata.permissions || metadata.role_permissions;
  return companyRoleFromAccess({
    roleName: access.role_name || metadata.role_name,
    roleType: access.role_type || metadata.role_type,
    permissions
  }) === "admin";
}

function companyRoleFromAccess(input: { roleName?: unknown; roleType?: unknown; permissions?: unknown }) {
  const roleName = String(input.roleName || "").toLowerCase();
  const roleType = String(input.roleType || "").toLowerCase();
  if (roleName.includes("owner") || roleType.includes("owner")) return "owner";
  if (
    roleName.includes("admin")
    || roleName.includes("coordinador")
    || roleType.includes("admin")
    || roleType.includes("superadmin")
    || roleType.includes("coordinador")
    || roleType.includes("soporte")
    || permissionFlag(input.permissions, "usuarios", "manage_users")
    || permissionFlag(input.permissions, "roles", "manage_roles")
    || permissionFlag(input.permissions, "configuracion", "administer")
    || permissionFlag(input.permissions, "configuracion", "configure")
  ) {
    return "admin";
  }
  if (roleName.includes("viewer") || roleName.includes("consulta") || roleType.includes("lectura")) return "viewer";
  return companyRole(roleName);
}

function normalizeRoleName(profileKind: "tecnico" | "empleado", roleName: unknown) {
  const rawValue = String(roleName || "").trim();
  if (profileKind === "tecnico") {
    return rawValue || "Tecnico";
  }
  return rawValue || "Empleado";
}

function splitFullName(value: unknown) {
  const parts = String(clean(value) || "").split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join(" ") };
}

function activeStatus(value: unknown) {
  return userStatusToEmployeeStatus(value) === "active" ? "active" : "inactive";
}

function rolePermissionsFromBody(body: AnyRow, fallback?: unknown) {
  const value = body.role_permissions ?? body.permissions ?? fallback;
  return value && typeof value === "object" ? value : {};
}

async function syncSupabaseUserState(input: {
  userId?: unknown;
  companyId?: unknown;
  email?: unknown;
  fullName?: unknown;
  roleName?: unknown;
  roleType?: unknown;
  permissions?: unknown;
  employeeStatus?: unknown;
  syncAuthStatus?: boolean;
}) {
  const userId = clean(input.userId);
  const companyId = clean(input.companyId);
  if (!userId || !companyId) return;

  const email = normalizeUsernameEmail(input.email);
  const fullName = clean(input.fullName);
  const normalizedRoleName = clean(input.roleName);
  const normalizedRoleType = clean(input.roleType);
  const status = activeStatus(input.employeeStatus);
  const membershipRole = companyRoleFromAccess({ roleName: normalizedRoleName, roleType: normalizedRoleType, permissions: input.permissions });

  await supabaseRequest("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    service: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: userId,
      ...(fullName ? { full_name: fullName } : {}),
      ...(email ? { email } : {}),
      status
    })
  });

  await supabaseRequest("/rest/v1/company_users?on_conflict=company_id,user_id", {
    method: "POST",
    service: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      company_id: companyId,
      user_id: userId,
      role: membershipRole,
      status
    })
  });

  if (input.syncAuthStatus) {
    await updateSupabaseAuthUser(userId, {
      ban_duration: status === "active" ? "none" : "876000h"
    });
  }
}

async function requireCompanyAdmin(token: string, companyId?: string | null) {
  const userId = jwtSubject(token);
  if (!userId) throw httpError("Sesion invalida para validar permisos de administrador.", 401);
  const filter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest(`/rest/v1/company_users?select=company_id,user_id,role,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active${filter}&limit=20`, {
    method: "GET",
    token
  }) as Array<{ company_id: string; user_id?: string; role?: string }>;
  const admin = rows.find((row) => ["owner", "admin", "superadmin"].includes(String(row.role || "").toLowerCase()));
  if (admin) return admin;

  const employeeFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const employees = await supabaseRequest(`/rest/v1/employees?select=company_id,user_id,metadata&user_id=eq.${encodeURIComponent(userId)}&status=eq.active${employeeFilter}&limit=20`, {
    method: "GET",
    service: true
  }) as Array<{ company_id: string; user_id?: string; metadata?: AnyRow }>;
  const employeeAdmin = employees.find((row) => row.company_id && isAdministrativeAccess(row.metadata || {}));
  if (employeeAdmin) {
    await syncSupabaseUserState({
      userId,
      companyId: employeeAdmin.company_id,
      roleName: (employeeAdmin.metadata?.access as AnyRow | undefined)?.role_name || employeeAdmin.metadata?.role_name,
      roleType: (employeeAdmin.metadata?.access as AnyRow | undefined)?.role_type || employeeAdmin.metadata?.role_type,
      permissions: (employeeAdmin.metadata?.access as AnyRow | undefined)?.permissions || employeeAdmin.metadata?.permissions,
      employeeStatus: "active"
    });
    return { company_id: employeeAdmin.company_id, user_id: userId, role: "admin" };
  }
  throw httpError("No tienes permisos para administrar usuarios en esta empresa.", 403);
}

async function adminCompanies(token: string) {
  const userId = jwtSubject(token);
  if (!userId) return [];
  const rows = await supabaseRequest(`/rest/v1/company_users?select=company_id,user_id,role,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=50`, {
    method: "GET",
    token
  }) as Array<{ company_id: string; role?: string }>;
  const companies = rows.filter((row) => ["owner", "admin", "superadmin"].includes(String(row.role || "").toLowerCase())).map((row) => row.company_id);
  if (companies.length) return companies;
  const employees = await supabaseRequest(`/rest/v1/employees?select=company_id,user_id,metadata&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=50`, {
    method: "GET",
    service: true
  }) as Array<{ company_id: string; metadata?: AnyRow }>;
  return employees.filter((row) => row.company_id && isAdministrativeAccess(row.metadata || {})).map((row) => row.company_id);
}

export async function GET(request: NextRequest) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 500 });
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });

    const companies = await adminCompanies(token);
    if (!companies.length) return NextResponse.json({ message: "No tienes permisos para consultar usuarios." }, { status: 403 });

    const companyFilter = companies.map((companyId) => `company_id.eq.${companyId}`).join(",");
    const employees = await supabaseRequest(`/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,email,document_number,phone,position,department,hire_date,status,user_type,metadata&or=(${companyFilter})&order=created_at.desc&limit=500`, {
      method: "GET",
      service: true
    }) as AnyRow[];

    return NextResponse.json({ employees, commit: DEPLOYMENT_COMMIT });
  } catch (error) {
    const status = (error as HttpError)?.status || 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible consultar usuarios." }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 500 });
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });

    const body = (await request.json()) as AnyRow;
    const employeeId = clean(body.employee_id);
    if (!employeeId) return NextResponse.json({ message: "Empleado/usuario requerido." }, { status: 400 });

    const rows = await supabaseRequest(`/rest/v1/employees?select=id,company_id,user_id,email,first_name,last_name,document_type,document_number,phone,position,department,hire_date,status,user_type,metadata&id=eq.${employeeId}&limit=1`, { method: "GET", service: true }) as AnyRow[];
    const current = rows[0];
    if (!current?.company_id) return NextResponse.json({ message: "Usuario no encontrado." }, { status: 404 });
    await requireCompanyAdmin(token, String(current.company_id));

    const metadata = (current.metadata && typeof current.metadata === "object" ? current.metadata : {}) as AnyRow;
    const documents = Array.isArray(metadata.documents) ? metadata.documents : [];
    const action = String(body.action || "update");
    let nextMetadata = metadata;
    let patch: AnyRow = {};
    let credentialSync: { provider: "supabase"; email: string; email_changed: boolean; password_changed: boolean } | null = null;

    if (action === "access") {
      const nextStatus = body.active === false ? "inactive" : activeStatus(current.status);
      const nextPassword = clean(body.password);
      if (nextPassword) {
        assertPasswordPolicy(nextPassword);
        const authUserId = await resolveSupabaseAuthUserId(current);
        if (!authUserId) throw httpError("No existe una identidad de acceso en Supabase Auth para este usuario. Vincula o recrea su acceso antes de cambiar la clave.", 409);
        await updateSupabaseAuthUser(authUserId, { password: nextPassword });
        current.user_id = authUserId;
      }
      nextMetadata = {
        ...metadata,
        access: {
          ...((metadata.access && typeof metadata.access === "object" ? metadata.access : {}) as AnyRow),
          session_status: clean(body.session_status) || (nextPassword ? "sin_sesion" : "bloqueada"),
          require_password_change: nextPassword ? true : body.require_password_change ?? ((metadata.access as AnyRow | undefined)?.require_password_change || false),
          ...(nextPassword ? { password_reset_at: new Date().toISOString(), password_reset_mode: "admin_manual" } : {})
        },
        user_audit_trail: [...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9), { at: new Date().toISOString(), action: nextPassword ? "password_reset" : "access_updated", source: "next-api" }]
      };
      patch = { metadata: nextMetadata, ...(current.user_id ? { user_id: current.user_id } : {}), ...(body.active === false ? { status: "inactive" } : {}) };
      await syncSupabaseUserState({
        userId: current.user_id,
        companyId: current.company_id,
        email: ((nextMetadata.access as AnyRow | undefined)?.email as string | undefined) || current.email,
        fullName: metadata.name || `${current.first_name || ""} ${current.last_name || ""}`.trim(),
        roleName: ((nextMetadata.access as AnyRow | undefined)?.role_name as string | undefined) || metadata.role_name,
        roleType: ((nextMetadata.access as AnyRow | undefined)?.role_type as string | undefined) || metadata.role_type,
        permissions: metadata.permissions,
        employeeStatus: nextStatus,
        syncAuthStatus: true
      });
    } else if (action === "status") {
      patch = { status: body.active ? "active" : "inactive" };
      await syncSupabaseUserState({
        userId: current.user_id,
        companyId: current.company_id,
        email: ((metadata.access as AnyRow | undefined)?.email as string | undefined) || current.email,
        fullName: metadata.name || `${current.first_name || ""} ${current.last_name || ""}`.trim(),
        roleName: ((metadata.access as AnyRow | undefined)?.role_name as string | undefined) || metadata.role_name,
        roleType: ((metadata.access as AnyRow | undefined)?.role_type as string | undefined) || metadata.role_type,
        permissions: metadata.permissions,
        employeeStatus: body.active ? "active" : "inactive",
        syncAuthStatus: true
      });
    } else if (action === "document_add") {
      const document = {
        id: clean(body.document_id) || `doc-${Date.now()}`,
        document_type: clean(body.document_type) || "internal",
        file_name: clean(body.file_name) || "documento",
        file_url: clean(body.file_url) || "",
        storage_path: clean(body.storage_path) || "",
        mime_type: clean(body.mime_type) || "",
        file_size: Number(body.file_size || 0),
        status: clean(body.status) || "pending",
        observations: clean(body.observations) || "",
        uploaded_at: new Date().toISOString()
      };
      nextMetadata = { ...metadata, documents: [...documents, document] };
      patch = { metadata: nextMetadata };
    } else if (action === "document_remove") {
      await requirePhysicalDocumentDelete(token, String(current.company_id));
      const documentId = clean(body.document_id);
      nextMetadata = { ...metadata, documents: documents.filter((document) => String((document as AnyRow).id) !== String(documentId)) };
      patch = { metadata: nextMetadata };
    } else {
      const previousAccess = (metadata.access && typeof metadata.access === "object" ? metadata.access : {}) as AnyRow;
      const fullName = clean(body.name) || `${clean(body.first_names) || current.first_name || ""} ${clean(body.last_names) || current.last_name || ""}`.trim();
      if (!fullName) throw httpError("Nombre requerido.", 400);
      const splitName = splitFullName(fullName);
      const email = normalizeUsernameEmail(body.email || body.access_email || current.email);
      if (!email) throw httpError("Correo requerido.", 400);
      const roleId = clean(body.role_id) || clean(metadata.role_id);
      const roleName = clean(body.role_name) || clean(previousAccess.role_name) || clean(metadata.role_name);
      if (!roleId && !roleName) throw httpError("Rol principal requerido.", 400);
      const documentNumber = clean(body.document) || clean(current.document_number) || clean(metadata.document);
      if (!documentNumber) throw httpError("Documento requerido.", 400);
      const nextPassword = clean(body.password);
      if (nextPassword) assertPasswordPolicy(nextPassword);
      const credentials = authCredentialPatch({ currentEmail: current.email, nextEmail: email, nextPassword });
      if (credentials.changed) {
        const authUserId = await resolveSupabaseAuthUserId(current);
        if (!authUserId) throw httpError("El usuario no tiene una identidad vinculada en Supabase Auth. El correo y la clave no fueron modificados.", 409);
        const updatedAuth = await updateSupabaseAuthUser(authUserId, credentials.payload) as AnyRow;
        const confirmedEmail = normalizeUsernameEmail((updatedAuth.user as AnyRow | undefined)?.email || updatedAuth.email);
        if (credentials.emailChanged && confirmedEmail !== email) {
          throw httpError("Supabase Auth no confirmo el nuevo correo. No se actualizaron los datos administrativos.", 502);
        }
        current.user_id = authUserId;
      }
      credentialSync = {
        provider: "supabase",
        email,
        email_changed: credentials.emailChanged,
        password_changed: credentials.passwordChanged
      };
      const nextStatus = userStatusToEmployeeStatus(body.user_status || metadata.user_status || current.status);
      const rolePermissions = rolePermissionsFromBody(body, metadata.permissions);
      nextMetadata = {
        ...metadata,
        name: fullName || metadata.name,
        code: body.code === undefined ? metadata.code : clean(body.code),
        role_id: roleId || metadata.role_id,
        role_name: roleName || metadata.role_name,
        role_type: clean(body.role_type) || metadata.role_type,
        role_scope: clean(body.role_scope) || metadata.role_scope,
        permissions: rolePermissions,
        document: documentNumber,
        document_type: clean(body.document_type) || metadata.document_type,
        user_status: clean(body.user_status) || metadata.user_status,
        company: clean(body.company) || metadata.company,
        document_issue_date: body.document_issue_date === undefined ? metadata.document_issue_date : clean(body.document_issue_date),
        document_issue_place: body.document_issue_place === undefined ? metadata.document_issue_place : clean(body.document_issue_place),
        birth_date: body.birth_date === undefined ? metadata.birth_date : clean(body.birth_date),
        gender: body.gender === undefined ? metadata.gender : clean(body.gender),
        address: body.address === undefined ? metadata.address : clean(body.address),
        city: body.city === undefined ? metadata.city : clean(body.city),
        state_region: body.state_region === undefined ? metadata.state_region : clean(body.state_region),
        country: body.country === undefined ? metadata.country : clean(body.country),
        manager: body.manager === undefined ? metadata.manager : clean(body.manager),
        additional_roles: body.additional_roles === undefined ? metadata.additional_roles : clean(body.additional_roles),
        operational_profile: body.operational_profile === undefined ? metadata.operational_profile : clean(body.operational_profile),
        special_permissions: body.special_permissions === undefined ? metadata.special_permissions : clean(body.special_permissions),
        mfa_status: body.mfa_status === undefined ? metadata.mfa_status : clean(body.mfa_status),
        access: {
          ...previousAccess,
          email,
          site: clean(body.site || body.base_site) || clean(previousAccess.site) || "",
          area: body.area === undefined ? clean(previousAccess.area) : clean(body.area),
          role_id: roleId || previousAccess.role_id || null,
          role_name: roleName || previousAccess.role_name || "",
          role_type: clean(body.role_type) || previousAccess.role_type || "",
          role_scope: clean(body.role_scope) || previousAccess.role_scope || "",
          permissions: rolePermissions,
          require_password_change: nextPassword ? true : body.require_password_change === undefined ? Boolean(previousAccess.require_password_change) : Boolean(body.require_password_change),
          session_status: body.session_status === undefined ? previousAccess.session_status : clean(body.session_status),
          ...(nextPassword ? { password_reset_at: new Date().toISOString(), password_reset_mode: "admin_manual" } : {})
        },
        employment: {
          ...((metadata.employment && typeof metadata.employment === "object" ? metadata.employment : {}) as AnyRow),
          ...(Object.fromEntries(["engagement_type", "end_date", "contract_type", "cost_center", "workday", "base_shift", "salary_base", "transport_allowance", "arl_risk", "eps", "pension_fund", "compensation_fund", "bank", "bank_account_type", "bank_account_number", "labor_notes"]
            .filter((key) => body[key] !== undefined)
            .map((key) => [key, clean(body[key])])) as AnyRow)
        },
        operational: {
          ...((metadata.operational && typeof metadata.operational === "object" ? metadata.operational : {}) as AnyRow),
          ...(body.operational_classification === undefined ? {} : { classification: clean(body.operational_classification) }),
          ...(Object.fromEntries(["can_punch_time", "can_receive_services", "can_be_assigned_routes", "can_manage_inventory", "can_approve_documents", "can_authorize_exceptions"]
            .filter((key) => body[key] !== undefined)
            .map((key) => [key, Boolean(body[key])])) as AnyRow),
          ...(body.driver_license === undefined ? {} : { driver_license: clean(body.driver_license) }),
          ...(body.license_category === undefined ? {} : { license_category: clean(body.license_category) }),
          ...(body.license_expires_at === undefined ? {} : { license_expires_at: clean(body.license_expires_at) }),
          ...(body.operational_restrictions === undefined ? {} : { restrictions: clean(body.operational_restrictions) }),
          ...(body.base_site === undefined && body.site === undefined ? {} : { base_site: clean(body.base_site || body.site) }),
          ...(body.operation_zone === undefined ? {} : { zone: clean(body.operation_zone) })
        },
        user_audit_trail: [...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9), { at: new Date().toISOString(), action: nextPassword ? "updated_with_password_reset" : "updated", source: "next-api" }]
      };
      patch = {
        first_name: clean(body.first_names) || splitName.firstName || current.first_name,
        last_name: clean(body.last_names) || splitName.lastName || current.last_name,
        email,
        ...(current.user_id ? { user_id: current.user_id } : {}),
        document_type: clean(body.document_type) || current.document_type,
        document_number: documentNumber,
        phone: body.phone === undefined ? current.phone : clean(body.phone),
        position: body.position === undefined ? current.position : clean(body.position),
        department: body.department === undefined ? current.department : clean(body.department),
        hire_date: body.hire_date === undefined ? current.hire_date : (clean(body.hire_date) || null),
        user_type: body.operational_classification === undefined ? current.user_type : clean(body.operational_classification),
        status: nextStatus,
        metadata: nextMetadata
      };
      await syncSupabaseUserState({
        userId: current.user_id,
        companyId: current.company_id,
        email,
        fullName,
        roleName,
        roleType: clean(body.role_type) || metadata.role_type || previousAccess.role_type,
        permissions: rolePermissions,
        employeeStatus: patch.status,
        syncAuthStatus: true
      });
    }

    await supabaseRequest(`/rest/v1/employees?id=eq.${employeeId}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch)
    });

    return NextResponse.json({ ok: true, auth_user_id: current.user_id || null, credential_sync: credentialSync });
  } catch (error) {
    const status = (error as HttpError)?.status || 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible actualizar usuario." }, { status });
  }
}

export async function POST(request: NextRequest) {
  let createdAuthUserId = "";
  let createdEmployeeId = "";
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ message: "Faltan variables publicas de Supabase." }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para crear usuarios Auth." }, { status: 500 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });

    const body = (await request.json()) as AnyRow;
    const profileKind = String(clean(body.profile_kind) || clean(body.user_kind) || clean(body.tipo_usuario) || (String(body.operational_classification || "").toLowerCase() === "tecnico" ? "tecnico" : "empleado")).toLowerCase() === "tecnico" ? "tecnico" : "empleado";
    const normalizedRoleName = normalizeRoleName(profileKind, body.role_name || body.role_id);
    const { email, fullName } = validateUserPayload(body, { requirePassword: true });
    const password = String(body.password || "");
    const rolePermissions = rolePermissionsFromBody(body);

    const requestedCompanyId = clean(body.company_id);
    const membership = await requireCompanyAdmin(token, requestedCompanyId);
    const companyId = requestedCompanyId || membership.company_id;

    const authUser = await supabaseRequest("/auth/v1/admin/users", {
      method: "POST",
      service: true,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          company_id: companyId,
          profile_kind: profileKind,
          role_name: normalizedRoleName
        }
      })
    }) as { id: string; email?: string };
    createdAuthUserId = authUser.id;

    await supabaseRequest("/rest/v1/profiles?on_conflict=id", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        id: authUser.id,
        full_name: fullName,
        email,
        status: userStatusToEmployeeStatus(body.user_status) === "active" ? "active" : "inactive"
      })
    });

    await supabaseRequest("/rest/v1/company_users?on_conflict=company_id,user_id", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        company_id: companyId,
        user_id: authUser.id,
        role: companyRoleFromAccess({ roleName: normalizedRoleName, roleType: body.role_type, permissions: rolePermissions }),
        status: userStatusToEmployeeStatus(body.user_status) === "active" ? "active" : "inactive"
      })
    });

    const metadata = {
      name: fullName,
      code: clean(body.code) || `USR-${Date.now()}`,
      profile_kind: profileKind,
      role_id: body.role_id || null,
      role_name: normalizedRoleName,
      role_type: clean(body.role_type) || "",
      role_scope: clean(body.role_scope) || "",
      permissions: rolePermissions,
      document: clean(body.document) || "",
      document_type: clean(body.document_type) || "CC",
      document_issue_date: clean(body.document_issue_date),
      document_issue_place: clean(body.document_issue_place),
      birth_date: clean(body.birth_date),
      gender: clean(body.gender),
      address: clean(body.address),
      city: clean(body.city),
      state_region: clean(body.state_region),
      country: clean(body.country),
      company: clean(body.company) || "",
      manager: clean(body.manager),
      additional_roles: clean(body.additional_roles),
      operational_profile: clean(body.operational_profile),
      special_permissions: clean(body.special_permissions),
      mfa_status: clean(body.mfa_status),
      access: {
        email,
        role_id: body.role_id || null,
        role_name: normalizedRoleName,
        role_type: clean(body.role_type) || "",
        role_scope: clean(body.role_scope) || "",
        permissions: rolePermissions,
        profile_kind: profileKind,
        site: clean(body.site || body.base_site) || (profileKind === "tecnico" ? "SEDE-PRINCIPAL" : ""),
        area: clean(body.area || body.department) || (profileKind === "tecnico" ? "SERV" : ""),
        session_status: clean(body.session_status) || "sin_sesion",
        require_password_change: Boolean(body.require_password_change)
      },
      employment: {
        cost_center: clean(body.cost_center) || "",
        contract_type: clean(body.contract_type) || (profileKind === "tecnico" ? "service" : "indefinite"),
        engagement_type: clean(body.engagement_type) || (profileKind === "tecnico" ? "contratista" : "empleado"),
        end_date: clean(body.end_date),
        workday: clean(body.workday),
        base_shift: clean(body.base_shift),
        salary_base: clean(body.salary_base),
        transport_allowance: clean(body.transport_allowance),
        arl_risk: clean(body.arl_risk),
        eps: clean(body.eps),
        pension_fund: clean(body.pension_fund),
        compensation_fund: clean(body.compensation_fund),
        bank: clean(body.bank),
        bank_account_type: clean(body.bank_account_type),
        bank_account_number: clean(body.bank_account_number),
        labor_notes: clean(body.labor_notes)
      },
      operational: {
        classification: clean(body.operational_classification) || (profileKind === "tecnico" ? "tecnico" : "operario"),
        base_site: clean(body.base_site) || (profileKind === "tecnico" ? "SEDE-PRINCIPAL" : ""),
        zone: clean(body.operation_zone) || "",
        can_punch_time: Boolean(body.can_punch_time),
        can_receive_services: profileKind === "tecnico" ? true : Boolean(body.can_receive_services),
        can_be_assigned_routes: Boolean(body.can_be_assigned_routes),
        can_manage_inventory: Boolean(body.can_manage_inventory),
        can_approve_documents: Boolean(body.can_approve_documents),
        can_authorize_exceptions: Boolean(body.can_authorize_exceptions),
        driver_license: clean(body.driver_license),
        license_category: clean(body.license_category),
        license_expires_at: clean(body.license_expires_at),
        restrictions: clean(body.operational_restrictions)
      },
      documents: [],
      user_audit_trail: [{ at: new Date().toISOString(), action: "created", source: "supabase-auth" }]
    };

    const employees = await supabaseRequest("/rest/v1/employees?select=id,company_id,user_id,email,first_name,last_name,document_number,phone,position,department,hire_date,status,user_type,metadata", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        company_id: companyId,
        user_id: authUser.id,
        first_name: clean(body.first_names) || fullName.split(" ")[0] || fullName,
        last_name: clean(body.last_names) || fullName.split(" ").slice(1).join(" "),
        document_type: clean(body.document_type) || "CC",
        document_number: clean(body.document) || `USR-${Date.now()}`,
        email,
        phone: clean(body.phone) || "",
        position: clean(body.position) || (profileKind === "tecnico" ? "TECNICO" : clean(body.operational_classification) || "operario"),
        department: clean(body.department) || clean(body.area) || (profileKind === "tecnico" ? "Servicios" : "Operacion"),
        hire_date: clean(body.hire_date) || new Date().toISOString().slice(0, 10),
        status: userStatusToEmployeeStatus(body.user_status),
        user_type: clean(body.operational_classification) || (profileKind === "tecnico" ? "tecnico" : "operario"),
        metadata
      })
    }) as AnyRow[];
    createdEmployeeId = clean(employees[0]?.id);

    await syncSupabaseUserState({
      userId: authUser.id,
      companyId,
      email,
      fullName,
      roleName: normalizedRoleName,
      roleType: clean(body.role_type),
      permissions: rolePermissions,
      employeeStatus: userStatusToEmployeeStatus(body.user_status),
      syncAuthStatus: true
    });

    return NextResponse.json({ user_id: authUser.id, employee: employees[0] });
  } catch (error) {
    const cleanupErrors: string[] = [];
    if (createdEmployeeId) {
      await supabaseRequest(`/rest/v1/employees?id=eq.${encodeURIComponent(createdEmployeeId)}`, {
        method: "DELETE",
        service: true,
        headers: { Prefer: "return=minimal" }
      }).catch((cleanupError) => cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : "No se pudo retirar el empleado parcial."));
    }
    if (createdAuthUserId) {
      await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(createdAuthUserId)}`, {
        method: "DELETE",
        service: true
      }).catch((cleanupError) => cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : "No se pudo retirar la identidad parcial."));
    }
    const status = (error as HttpError)?.status || 500;
    const message = error instanceof Error ? error.message : "No fue posible crear el usuario.";
    return NextResponse.json({ message: cleanupErrors.length ? `${message} La compensacion automatica tambien fallo; requiere revision administrativa.` : message }, { status });
  }
}
