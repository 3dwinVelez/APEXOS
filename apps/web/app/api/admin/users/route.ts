import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

type AnyRow = Record<string, unknown>;

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

function normalizeRoleName(profileKind: "tecnico" | "empleado", roleName: unknown) {
  const value = String(roleName || "").trim().toLowerCase();
  if (profileKind === "tecnico") {
    if (!value || value === "soporte tecnico") return "Tecnico";
    return value.includes("tecnico") ? "Tecnico" : "Tecnico";
  }
  if (!value) return "Empleado";
  return value.includes("empleado") ? "Empleado" : "Empleado";
}

function activeStatus(value: unknown) {
  return userStatusToEmployeeStatus(value) === "active" ? "active" : "inactive";
}

async function syncSupabaseUserState(input: {
  userId?: unknown;
  companyId?: unknown;
  email?: unknown;
  fullName?: unknown;
  roleName?: unknown;
  employeeStatus?: unknown;
}) {
  const userId = clean(input.userId);
  const companyId = clean(input.companyId);
  if (!userId || !companyId) return;

  const email = normalizeUsernameEmail(input.email);
  const fullName = clean(input.fullName);
  const normalizedRoleName = clean(input.roleName);
  const status = activeStatus(input.employeeStatus);
  const memberships = await supabaseRequest(`/rest/v1/company_users?select=role&company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
    method: "GET",
    service: true
  }) as Array<{ role?: string }>;
  const membershipRole = clean(memberships[0]?.role) || companyRole(normalizedRoleName);

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
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible consultar usuarios." }, { status: 500 });
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

    const rows = await supabaseRequest(`/rest/v1/employees?select=*&id=eq.${employeeId}&limit=1`, { method: "GET", service: true }) as AnyRow[];
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
      nextMetadata = {
        ...metadata,
        access: {
          ...((metadata.access && typeof metadata.access === "object" ? metadata.access : {}) as AnyRow),
          session_status: clean(body.session_status) || "bloqueada",
          require_password_change: body.require_password_change ?? ((metadata.access as AnyRow | undefined)?.require_password_change || false)
        },
        user_audit_trail: [...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9), { at: new Date().toISOString(), action: "access_updated", source: "next-api" }]
      };
      patch = { metadata: nextMetadata, ...(body.active === false ? { status: "inactive" } : {}) };
      await syncSupabaseUserState({
        userId: current.user_id,
        companyId: current.company_id,
        email: ((nextMetadata.access as AnyRow | undefined)?.email as string | undefined) || current.email,
        fullName: metadata.name || `${current.first_name || ""} ${current.last_name || ""}`.trim(),
        roleName: ((nextMetadata.access as AnyRow | undefined)?.role_name as string | undefined) || metadata.role_name,
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
      const documentId = clean(body.document_id);
      nextMetadata = { ...metadata, documents: documents.filter((document) => String((document as AnyRow).id) !== String(documentId)) };
      patch = { metadata: nextMetadata };
    } else {
      const fullName = clean(body.name) || `${clean(body.first_names) || current.first_name || ""} ${clean(body.last_names) || current.last_name || ""}`.trim();
      const previousProfileKind = String((metadata.profile_kind || (metadata.operational as AnyRow | undefined)?.classification || current.user_type || "") || "").toLowerCase() === "tecnico" ? "tecnico" : "empleado";
      const profileKind = String(clean(body.profile_kind) || clean(body.user_kind) || clean(body.tipo_usuario) || previousProfileKind).toLowerCase() === "tecnico" ? "tecnico" : "empleado";
      const normalizedRoleName = normalizeRoleName(profileKind, body.role_name || (metadata.access as AnyRow | undefined)?.role_name || metadata.role_name);
      nextMetadata = {
        ...metadata,
        name: fullName || metadata.name,
        role_id: body.role_id || metadata.role_id,
        role_name: normalizedRoleName,
        profile_kind: profileKind,
        document: clean(body.document) || metadata.document,
        document_type: clean(body.document_type) || metadata.document_type,
        user_status: clean(body.user_status) || metadata.user_status,
        access: { ...((metadata.access && typeof metadata.access === "object" ? metadata.access : {}) as AnyRow), email: normalizeUsernameEmail(body.access_email || body.email) || current.email, site: clean(body.site || body.base_site) || (profileKind === "tecnico" ? "SEDE-PRINCIPAL" : ""), area: clean(body.area || body.department) || (profileKind === "tecnico" ? "SERV" : ""), role_name: normalizedRoleName, profile_kind: profileKind, session_status: clean(body.session_status) || ((metadata.access as AnyRow | undefined)?.session_status as string | undefined) || "sin_sesion" },
        employment: { ...((metadata.employment && typeof metadata.employment === "object" ? metadata.employment : {}) as AnyRow), cost_center: clean(body.cost_center) || "", contract_type: clean(body.contract_type) || (profileKind === "tecnico" ? "service" : "indefinite"), engagement_type: clean(body.engagement_type) || (profileKind === "tecnico" ? "contratista" : "empleado") },
        operational: { ...((metadata.operational && typeof metadata.operational === "object" ? metadata.operational : {}) as AnyRow), classification: clean(body.operational_classification) || (profileKind === "tecnico" ? "tecnico" : "administrativo"), base_site: clean(body.base_site) || (profileKind === "tecnico" ? "SEDE-PRINCIPAL" : ""), zone: clean(body.operation_zone) || "", can_receive_services: profileKind === "tecnico" ? true : Boolean(body.can_receive_services ?? (metadata.operational as AnyRow | undefined)?.can_receive_services) },
        user_audit_trail: [...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9), { at: new Date().toISOString(), action: "updated", source: "next-api" }]
      };
      patch = {
        first_name: clean(body.first_names) || current.first_name,
        last_name: clean(body.last_names) || current.last_name,
        email: clean(body.email) || current.email,
        phone: clean(body.phone) || current.phone,
        position: clean(body.position || body.operational_classification) || current.position,
        department: clean(body.department || body.area) || current.department,
        status: userStatusToEmployeeStatus(body.user_status || current.status),
        user_type: clean(body.operational_classification) || current.user_type,
        metadata: nextMetadata
      };
      await syncSupabaseUserState({
        userId: current.user_id,
        companyId: current.company_id,
        email: normalizeUsernameEmail(body.access_email || body.email) || current.email,
        fullName,
        roleName: normalizedRoleName,
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
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible actualizar usuario." }, { status: 500 });
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
    const email = normalizeUsernameEmail(body.email || body.access_email);
    const password = String(body.password || "");
    const fullName = clean(body.name) || `${clean(body.first_names) || ""} ${clean(body.last_names) || ""}`.trim();
    if (!email) return NextResponse.json({ message: "Correo requerido." }, { status: 400 });
    if (!fullName) return NextResponse.json({ message: "Nombre requerido." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ message: "La clave temporal debe tener minimo 8 caracteres." }, { status: 400 });

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
        role: companyRole(normalizedRoleName),
        status: userStatusToEmployeeStatus(body.user_status) === "active" ? "active" : "inactive"
      })
    });

    const metadata = {
      name: fullName,
      code: clean(body.code) || `USR-${Date.now()}`,
      profile_kind: profileKind,
      role_id: body.role_id || null,
      role_name: normalizedRoleName,
      document: clean(body.document) || "",
      document_type: clean(body.document_type) || "CC",
      company: clean(body.company) || "",
      access: {
        email,
        role_id: body.role_id || null,
        role_name: normalizedRoleName,
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
        document_number: clean(body.document) || `QA-${Date.now()}`,
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
      employeeStatus: userStatusToEmployeeStatus(body.user_status)
    });

    return NextResponse.json({ user_id: authUser.id, employee: employees[0] });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible crear el usuario." }, { status: 500 });
  }
}
