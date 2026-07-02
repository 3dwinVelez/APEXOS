import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

type ModuleAccessBody = {
  company_id?: string;
  module_id?: string;
  enabled?: boolean;
};

type CompanyRow = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
};

type ModuleRow = {
  id: string;
  code?: string | null;
  route?: string | null;
};

const DEFAULT_TECHNICIAN_COUNT = 10;
const SERVICES_TECHNICIAN_ROLE_CODE = "tecnico_servicios";
const SERVICES_TECHNICIAN_ROLE_NAME = "Tecnico";

class PlatformAccessError extends Error {
  statusCode = 403;
}

function errorStatus(error: unknown) {
  return error instanceof PlatformAccessError ? error.statusCode : 500;
}

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

function clean(value?: string | null) {
  const next = value?.trim();
  return next ? next : null;
}

function asciiSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => !["sas", "sa", "s", "a", "ltda", "internal"].includes(part))[0] || "empresa";
}

function technicianCode(index: number) {
  return `tecnico${String(index).padStart(2, "0")}`;
}

function technicianPermissions() {
  return [
    { module: "servicios", actions: ["access", "view", "edit", "attach", "download"] }
  ];
}

async function requirePlatformAdmin(token: string) {
  const currentUser = await supabaseRequest("/auth/v1/user", {
    method: "GET",
    token
  }) as { id?: string };

  if (!currentUser?.id) {
    throw new PlatformAccessError("Sesion invalida.");
  }

  const platformAdmins = await supabaseRequest(`/rest/v1/platform_admins?select=user_id,status&user_id=eq.${encodeURIComponent(currentUser.id)}&status=eq.active&limit=1`, {
    method: "GET",
    service: true
  }) as Array<{ user_id?: string; status?: string }>;

  if (!platformAdmins.length) {
    throw new PlatformAccessError("Acceso exclusivo para superadministradores de plataforma.");
  }
}

async function serviceModule(moduleId: string) {
  const rows = await supabaseRequest(`/rest/v1/modules?select=id,code,route&id=eq.${encodeURIComponent(moduleId)}&limit=1`, {
    method: "GET",
    service: true
  }) as ModuleRow[];
  const moduleRow = rows[0];
  if (!moduleRow) return null;
  const code = String(moduleRow.code || "").toLowerCase();
  const route = String(moduleRow.route || "").toLowerCase();
  return code === "servicios" || route === "/dashboard/servicios" ? moduleRow : null;
}

async function ensureServicesTechnicianRole() {
  const catalogs = await supabaseRequest("/rest/v1/master_catalogs?select=id&company_id=is.null&code=eq.roles&limit=1", {
    method: "GET",
    service: true
  }) as Array<{ id: string }>;

  let catalogId = catalogs[0]?.id;
  if (!catalogId) {
    const created = await supabaseRequest("/rest/v1/master_catalogs?select=id", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        code: "roles",
        name: "Roles",
        description: "Catalogo global de roles funcionales reutilizables.",
        scope: "global",
        sort_order: 90,
        metadata: { source: "platform_company_modules" }
      })
    }) as Array<{ id: string }>;
    catalogId = created[0]?.id;
  }

  if (!catalogId) throw new Error("No fue posible asegurar el catalogo global de roles.");

  await supabaseRequest(`/rest/v1/master_catalog_items?on_conflict=catalog_id,code`, {
    method: "POST",
    service: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      catalog_id: catalogId,
      code: SERVICES_TECHNICIAN_ROLE_CODE,
      name: "Tecnico de servicios",
      description: "Ejecuta servicios asignados, actualiza estados, carga evidencias y registra novedades.",
      active: true,
      sort_order: 35,
      metadata: {
        role_name: SERVICES_TECHNICIAN_ROLE_NAME,
        role_type: "tecnico",
        scope: "assigned_services",
        permissions: technicianPermissions(),
        denied_modules: ["administracion", "talento-humano", "transporte", "inventario", "contabilidad"]
      }
    })
  });
}

async function createAuthUser(email: string, password: string, company: CompanyRow, index: number, authUsersByEmail: Map<string, string>) {
  const existing = authUsersByEmail.get(email);
  if (existing) return existing;

  const created = await supabaseRequest("/auth/v1/admin/users", {
    method: "POST",
    service: true,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `Tecnico ${String(index).padStart(2, "0")}`,
        company_id: company.id,
        profile_kind: "tecnico",
        role_code: SERVICES_TECHNICIAN_ROLE_CODE,
        role_name: SERVICES_TECHNICIAN_ROLE_NAME,
        default_services_technician: true
      }
    })
  }) as { id: string };

  authUsersByEmail.set(email, created.id);
  return created.id;
}

async function ensureTechnicianProfile(company: CompanyRow, input: { userId: string; email: string; code: string; index: number }) {
  const fullName = `Tecnico ${String(input.index).padStart(2, "0")}`;
  const metadata = {
    name: fullName,
    code: input.code,
    profile_kind: "tecnico",
    role_id: SERVICES_TECHNICIAN_ROLE_CODE,
    role_code: SERVICES_TECHNICIAN_ROLE_CODE,
    role_name: SERVICES_TECHNICIAN_ROLE_NAME,
    document: input.code,
    document_type: "NIT",
    company: company.name || company.legal_name || "",
    default_services_technician: true,
    default_services_technician_index: input.index,
    initial_password_policy: {
      shared_by_company: true,
      password_pattern: "company-identifier-1234"
    },
    access: {
      email: input.email,
      role_id: SERVICES_TECHNICIAN_ROLE_CODE,
      role_code: SERVICES_TECHNICIAN_ROLE_CODE,
      role_name: SERVICES_TECHNICIAN_ROLE_NAME,
      profile_kind: "tecnico",
      site: "SEDE-PRINCIPAL",
      area: "SERV",
      session_status: "activa",
      require_password_change: true
    },
    permissions: technicianPermissions(),
    employment: {
      cost_center: "SERV",
      contract_type: "service",
      engagement_type: "contratista"
    },
    operational: {
      classification: "tecnico",
      base_site: "SEDE-PRINCIPAL",
      zone: "",
      can_punch_time: false,
      can_receive_services: true,
      can_be_assigned_routes: false
    },
    user_audit_trail: [{ at: new Date().toISOString(), action: "services_default_technician_created", source: "platform_company_modules" }]
  };

  await supabaseRequest("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    service: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: input.userId,
      full_name: fullName,
      email: input.email,
      status: "active"
    })
  });

  await supabaseRequest("/rest/v1/company_users?on_conflict=company_id,user_id", {
    method: "POST",
    service: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      company_id: company.id,
      user_id: input.userId,
      role: "member",
      status: "active"
    })
  });

  const existingEmployees = await supabaseRequest(`/rest/v1/employees?select=id&company_id=eq.${encodeURIComponent(company.id)}&or=(user_id.eq.${encodeURIComponent(input.userId)},email.eq.${encodeURIComponent(input.email)},employee_code.eq.${encodeURIComponent(input.code)})&limit=1`, {
    method: "GET",
    service: true
  }) as Array<{ id: string }>;

  if (existingEmployees[0]?.id) return false;

  await supabaseRequest("/rest/v1/employees", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      company_id: company.id,
      user_id: input.userId,
      employee_code: input.code,
      first_name: "Tecnico",
      last_name: String(input.index).padStart(2, "0"),
      document_type: "NIT",
      document_number: input.code,
      email: input.email,
      phone: "",
      position: "Tecnico de servicios",
      department: "Servicios",
      hire_date: new Date().toISOString().slice(0, 10),
      status: "active",
      user_type: "tecnico",
      position_code: SERVICES_TECHNICIAN_ROLE_CODE,
      area_code: "SERV",
      cost_center_code: "SERV",
      contract_type_code: "service",
      metadata
    })
  });

  return true;
}

async function ensureDefaultServiceTechnicians(companyId: string) {
  const companies = await supabaseRequest(`/rest/v1/companies?select=id,name,legal_name&id=eq.${encodeURIComponent(companyId)}&limit=1`, {
    method: "GET",
    service: true
  }) as CompanyRow[];
  const company = companies[0];
  if (!company?.id) throw new Error("Empresa no encontrada para inicializar tecnicos de servicios.");

  await ensureServicesTechnicianRole();

  const identifier = asciiSlug(company.name || company.legal_name || "empresa");
  const password = `${identifier}1234`;
  const authUsers = await supabaseRequest("/auth/v1/admin/users?per_page=1000&page=1", {
    method: "GET",
    service: true
  }) as { users?: Array<{ id: string; email?: string }> };
  const authUsersByEmail = new Map((authUsers.users || []).map((user) => [String(user.email || "").toLowerCase(), user.id]));
  let created = 0;
  let existing = 0;

  for (let index = 1; index <= DEFAULT_TECHNICIAN_COUNT; index += 1) {
    const code = technicianCode(index);
    const email = `${code}@${identifier}.local`;
    const userId = await createAuthUser(email, password, company, index, authUsersByEmail);
    const inserted = await ensureTechnicianProfile(company, { userId, email, code, index });
    if (inserted) created += 1;
    else existing += 1;
  }

  return {
    role_code: SERVICES_TECHNICIAN_ROLE_CODE,
    identifier,
    created,
    existing,
    expected_total: DEFAULT_TECHNICIAN_COUNT
  };
}

export async function PATCH(request: NextRequest) {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para administrar modulos." }, { status: 500 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sesion requerida." }, { status: 401 });

    await requirePlatformAdmin(token);

    const body = (await request.json()) as ModuleAccessBody;
    const companyId = clean(body.company_id);
    const moduleId = clean(body.module_id);

    if (!companyId) return NextResponse.json({ message: "Empresa requerida." }, { status: 400 });
    if (!moduleId) return NextResponse.json({ message: "Modulo requerido." }, { status: 400 });
    if (typeof body.enabled !== "boolean") return NextResponse.json({ message: "Estado de modulo requerido." }, { status: 400 });

    const rows = await supabaseRequest("/rest/v1/company_modules?on_conflict=company_id,module_id&select=*", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        company_id: companyId,
        module_id: moduleId,
        enabled: body.enabled,
        source: "manual"
      })
    }) as unknown[];

    let default_service_technicians = null;
    if (body.enabled) {
      const moduleRow = await serviceModule(moduleId);
      if (moduleRow) {
        default_service_technicians = await ensureDefaultServiceTechnicians(companyId);
      }
    }

    return NextResponse.json({ module_access: rows[0] || null, default_service_technicians });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "No fue posible cambiar el modulo." }, { status: errorStatus(error) });
  }
}
