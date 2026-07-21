import { NextRequest, NextResponse } from "next/server";

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
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  return body;
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
}

async function requireCompanyAdmin(token: string, companyId?: string | null) {
  const filter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest(`/rest/v1/company_users?select=company_id,role,status&status=eq.active${filter}&limit=20`, {
    method: "GET",
    token
  }) as Array<{ company_id: string; role?: string }>;
  const admin = rows.find((row) => ["owner", "admin", "superadmin"].includes(String(row.role || "").toLowerCase()));
  if (!admin) throw new Error("No tienes permisos para crear usuarios en esta empresa.");
  return admin;
}

async function adminCompanies(token: string) {
  const rows = await supabaseRequest("/rest/v1/company_users?select=company_id,role,status&status=eq.active&limit=50", {
    method: "GET",
    token
  }) as Array<{ company_id: string; role?: string }>;
  return rows.filter((row) => ["owner", "admin", "superadmin"].includes(String(row.role || "").toLowerCase())).map((row) => row.company_id);
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
    const employees = await supabaseRequest(`/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,email,document_number,position,department,status,user_type,metadata&or=(${companyFilter})&order=created_at.desc&limit=500`, {
      method: "GET",
      service: true
    }) as AnyRow[];

    return NextResponse.json({ employees });
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

    const rows = await supabaseRequest(`/rest/v1/employees?select=id,company_id,user_id,email,first_name,last_name,document_number,position,department,status,user_type,metadata&id=eq.${employeeId}&limit=1`, { method: "GET", service: true }) as AnyRow[];
    const current = rows[0];
    if (!current?.company_id) return NextResponse.json({ message: "Usuario no encontrado." }, { status: 404 });
    await requireCompanyAdmin(token, String(current.company_id));

    const metadata = (current.metadata && typeof current.metadata === "object" ? current.metadata : {}) as AnyRow;
    const documents = Array.isArray(metadata.documents) ? metadata.documents : [];
    const action = String(body.action || "update");
    let nextMetadata = metadata;
    let patch: AnyRow = {};

    if (action === "access") {
      const nextStatus = body.active === false ? "inactive" : activeStatus(current.status);
      const nextPassword = clean(body.password);
      if (nextPassword) {
        assertPasswordPolicy(nextPassword);
        if (!current.user_id) throw httpError("El usuario no esta vinculado a Supabase Auth para cambiar la clave.", 409);
        await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(String(current.user_id))}`, {
          method: "PATCH",
          service: true,
          body: JSON.stringify({
            password: nextPassword,
            user_metadata: {
              password_reset_by_admin: true,
              password_reset_at: new Date().toISOString()
            }
          })
        });
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
      patch = { metadata: nextMetadata, ...(body.active === false ? { status: "inactive" } : {}) };
      await syncSupabaseUserState({
        userId: current.user_id,
        companyId: current.company_id,
        email: ((nextMetadata.access as AnyRow | undefined)?.email as string | undefined) || current.email,
        fullName: metadata.name || `${current.first_name || ""} ${current.last_name || ""}`.trim(),
        roleName: ((nextMetadata.access as AnyRow | undefined)?.role_name as string | undefined) || metadata.role_name,
        roleType: ((nextMetadata.access as AnyRow | undefined)?.role_type as string | undefined) || metadata.role_type,
        permissions: metadata.permissions,
        employeeStatus: nextStatus
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
        employeeStatus: body.active ? "active" : "inactive"
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
      if (nextPassword) {
        assertPasswordPolicy(nextPassword);
        if (!current.user_id) throw httpError("El usuario no esta vinculado a Supabase Auth para cambiar la clave.", 409);
        await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(String(current.user_id))}`, {
          method: "PATCH",
          service: true,
          body: JSON.stringify({
            password: nextPassword,
            user_metadata: {
              password_reset_by_admin: true,
              password_reset_at: new Date().toISOString()
            }
          })
        });
      }
      const nextStatus = userStatusToEmployeeStatus(body.user_status || metadata.user_status || current.status);
      const rolePermissions = rolePermissionsFromBody(body, metadata.permissions);
      nextMetadata = {
        ...metadata,
        name: fullName || metadata.name,
        role_id: roleId || metadata.role_id,
        role_name: roleName || metadata.role_name,
        role_type: clean(body.role_type) || metadata.role_type,
        role_scope: clean(body.role_scope) || metadata.role_scope,
        permissions: rolePermissions,
        document: documentNumber,
        document_type: clean(body.document_type) || metadata.document_type,
        user_status: clean(body.user_status) || metadata.user_status,
        company: clean(body.company) || metadata.company,
        access: {
          ...previousAccess,
          email,
          site: clean(body.site || body.base_site) || clean(previousAccess.site) || "",
          role_id: roleId || previousAccess.role_id || null,
          role_name: roleName || previousAccess.role_name || "",
          role_type: clean(body.role_type) || previousAccess.role_type || "",
          role_scope: clean(body.role_scope) || previousAccess.role_scope || "",
          permissions: rolePermissions,
          require_password_change: nextPassword ? true : body.require_password_change === undefined ? Boolean(previousAccess.require_password_change) : Boolean(body.require_password_change),
          ...(nextPassword ? { password_reset_at: new Date().toISOString(), password_reset_mode: "admin_manual" } : {})
        },
        user_audit_trail: [...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9), { at: new Date().toISOString(), action: nextPassword ? "updated_with_password_reset" : "updated", source: "next-api" }]
      };
      patch = {
        first_name: clean(body.first_names) || splitName.firstName || current.first_name,
        last_name: clean(body.last_names) || splitName.lastName || current.last_name,
        email,
        document_type: clean(body.document_type) || current.document_type,
        document_number: documentNumber,
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
        employeeStatus: patch.status
      });
    }

    await supabaseRequest(`/rest/v1/employees?id=eq.${employeeId}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch)
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as HttpError)?.status || 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible actualizar usuario." }, { status });
  }
}

export async function POST(request: NextRequest) {
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
      company: clean(body.company) || "",
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
        engagement_type: clean(body.engagement_type) || (profileKind === "tecnico" ? "contratista" : "empleado")
      },
      operational: {
        classification: clean(body.operational_classification) || (profileKind === "tecnico" ? "tecnico" : "operario"),
        base_site: clean(body.base_site) || (profileKind === "tecnico" ? "SEDE-PRINCIPAL" : ""),
        zone: clean(body.operation_zone) || "",
        can_punch_time: Boolean(body.can_punch_time),
        can_receive_services: profileKind === "tecnico" ? true : Boolean(body.can_receive_services),
        can_be_assigned_routes: Boolean(body.can_be_assigned_routes)
      },
      documents: [],
      user_audit_trail: [{ at: new Date().toISOString(), action: "created", source: "supabase-auth" }]
    };

    const employees = await supabaseRequest("/rest/v1/employees?select=id,company_id,user_id,email,first_name,last_name,document_number,position,department,status,user_type,metadata", {
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

    await syncSupabaseUserState({
      userId: authUser.id,
      companyId,
      email,
      fullName,
      roleName: normalizedRoleName,
      roleType: clean(body.role_type),
      permissions: rolePermissions,
      employeeStatus: userStatusToEmployeeStatus(body.user_status)
    });

    return NextResponse.json({ user_id: authUser.id, employee: employees[0] });
  } catch (error) {
    const status = (error as HttpError)?.status || 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible crear el usuario." }, { status });
  }
}
