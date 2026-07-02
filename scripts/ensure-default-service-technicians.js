const fs = require("fs");
const path = require("path");

const DEFAULT_TECHNICIAN_COUNT = 10;
const SERVICES_TECHNICIAN_ROLE_CODE = "tecnico_servicios";
const SERVICES_TECHNICIAN_ROLE_NAME = "Tecnico";

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function loadEnvFile(filePath) {
  if (!filePath) return {};
  const absolute = path.resolve(filePath);
  const content = fs.readFileSync(absolute, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function cleanUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function clean(value) {
  const next = String(value || "").trim();
  return next || "";
}

function asciiSlug(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => !["sas", "sa", "s", "a", "ltda", "internal"].includes(part))[0] || "empresa";
}

function technicianCode(index) {
  return `tecnico${String(index).padStart(2, "0")}`;
}

function technicianPermissions() {
  return [
    { module: "servicios", actions: ["access", "view", "edit", "attach", "download"] }
  ];
}

function companyFilter(name) {
  const value = encodeURIComponent(clean(name));
  return `or=(name.eq.${value},legal_name.eq.${value},tax_id.eq.${value})`;
}

async function request(config, pathname, options = {}) {
  const useService = options.service !== false;
  const key = useService ? config.serviceRoleKey : config.anonKey;
  const bearer = useService ? config.serviceRoleKey : options.token || config.anonKey;
  const response = await fetch(`${config.url}${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || text;
    throw new Error(`Supabase ${response.status} ${pathname}: ${detail}`);
  }
  return body;
}

async function resolveCompanies(config, args) {
  if (args["company-id"]) {
    const id = encodeURIComponent(args["company-id"]);
    const rows = await request(config, `/rest/v1/companies?select=id,name,legal_name,status&id=eq.${id}&limit=1`);
    if (!rows?.[0]) throw new Error(`No existe company-id ${args["company-id"]}.`);
    return rows;
  }
  if (args["company-name"]) {
    const rows = await request(config, `/rest/v1/companies?select=id,name,legal_name,status&${companyFilter(args["company-name"])}&limit=20`);
    if (!rows?.length) throw new Error(`No existe company-name ${args["company-name"]}.`);
    if (rows.length > 1) throw new Error(`company-name ${args["company-name"]} coincide con ${rows.length} empresas; usa --company-id.`);
    return rows;
  }
  if (args["all-active-companies"]) {
    return await request(config, "/rest/v1/companies?select=id,name,legal_name,status&status=eq.active&order=name.asc&limit=500");
  }
  throw new Error("Indica --company-id, --company-name o --all-active-companies.");
}

async function ensureServicesTechnicianRole(config) {
  const catalogs = await request(config, "/rest/v1/master_catalogs?select=id&company_id=is.null&code=eq.roles&limit=1");
  let catalogId = catalogs[0]?.id;
  if (!catalogId) {
    const created = await request(config, "/rest/v1/master_catalogs?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        code: "roles",
        name: "Roles",
        description: "Catalogo global de roles funcionales reutilizables.",
        scope: "global",
        sort_order: 90,
        metadata: { source: "ensure_default_service_technicians" },
      }),
    });
    catalogId = created[0]?.id;
  }
  if (!catalogId) throw new Error("No fue posible asegurar el catalogo global de roles.");

  await request(config, "/rest/v1/master_catalog_items?on_conflict=catalog_id,code", {
    method: "POST",
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
        denied_modules: ["administracion", "talento-humano", "transporte", "inventario", "contabilidad"],
      },
    }),
  });
}

async function authUsersByEmail(config) {
  const authUsers = await request(config, "/auth/v1/admin/users?per_page=1000&page=1");
  return new Map((authUsers.users || []).map((user) => [String(user.email || "").toLowerCase(), user.id]));
}

async function createAuthUser(config, email, password, company, index, usersByEmail, dryRun) {
  const existing = usersByEmail.get(email);
  if (existing) return { userId: existing, created: false };
  if (dryRun) return { userId: null, created: true };

  const created = await request(config, "/auth/v1/admin/users", {
    method: "POST",
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
        default_services_technician: true,
      },
    }),
  });

  usersByEmail.set(email, created.id);
  return { userId: created.id, created: true };
}

function technicianMetadata(company, input) {
  const fullName = `Tecnico ${String(input.index).padStart(2, "0")}`;
  return {
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
      password_pattern: "company-identifier-1234",
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
      require_password_change: true,
    },
    permissions: technicianPermissions(),
    employment: {
      cost_center: "SERV",
      contract_type: "service",
      engagement_type: "contratista",
    },
    operational: {
      classification: "tecnico",
      base_site: "SEDE-PRINCIPAL",
      zone: "",
      can_punch_time: false,
      can_receive_services: true,
      can_be_assigned_routes: false,
    },
    user_audit_trail: [{ at: new Date().toISOString(), action: "services_default_technician_created", source: "ensure_default_service_technicians" }],
  };
}

async function ensureTechnicianProfile(config, company, input, dryRun) {
  const fullName = `Tecnico ${String(input.index).padStart(2, "0")}`;
  const existingEmployees = input.userId
    ? await request(config, `/rest/v1/employees?select=id,metadata,status,user_type,email,employee_code&company_id=eq.${encodeURIComponent(company.id)}&or=(user_id.eq.${encodeURIComponent(input.userId)},email.eq.${encodeURIComponent(input.email)},employee_code.eq.${encodeURIComponent(input.code)})&limit=1`)
    : [];
  if (dryRun) return { employeeCreated: !existingEmployees[0]?.id, employeeId: existingEmployees[0]?.id || null };

  await request(config, "/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: input.userId,
      full_name: fullName,
      email: input.email,
      status: "active",
    }),
  });

  await request(config, "/rest/v1/company_users?on_conflict=company_id,user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      company_id: company.id,
      user_id: input.userId,
      role: "member",
      status: "active",
    }),
  });

  if (existingEmployees[0]?.id) return { employeeCreated: false, employeeId: existingEmployees[0].id };

  await request(config, "/rest/v1/employees", {
    method: "POST",
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
      metadata: technicianMetadata(company, input),
    }),
  });
  return { employeeCreated: true, employeeId: null };
}

async function validateLogin(config, email, password) {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  await response.text();
  return response.ok;
}

async function auditCompany(config, company, usersByEmail, validatePasswords) {
  const identifier = asciiSlug(company.name || company.legal_name || "empresa");
  const password = `${identifier}1234`;
  const expected = [];
  for (let index = 1; index <= DEFAULT_TECHNICIAN_COUNT; index += 1) {
    const code = technicianCode(index);
    expected.push({ index, code, email: `${code}@${identifier}.local` });
  }
  const emails = expected.map((item) => encodeURIComponent(item.email)).join(",");
  const employees = await request(config, `/rest/v1/employees?select=id,user_id,email,employee_code,status,user_type,position_code,metadata&company_id=eq.${encodeURIComponent(company.id)}&email=in.(${emails})&limit=50`);
  const memberships = await request(config, `/rest/v1/company_users?select=user_id,role,status&company_id=eq.${encodeURIComponent(company.id)}&limit=1000`);
  const employeeByEmail = new Map((employees || []).map((employee) => [String(employee.email || "").toLowerCase(), employee]));
  const membershipByUserId = new Map((memberships || []).map((membership) => [String(membership.user_id), membership]));
  const rows = [];
  for (const item of expected) {
    const authUserId = usersByEmail.get(item.email);
    const employee = employeeByEmail.get(item.email);
    const membership = employee?.user_id ? membershipByUserId.get(String(employee.user_id)) : null;
    const permissions = Array.isArray(employee?.metadata?.permissions) ? employee.metadata.permissions : [];
    const servicesOnly = permissions.length === 1 && String(permissions[0]?.module || "").toLowerCase() === "servicios";
    const loginOk = validatePasswords ? await validateLogin(config, item.email, password).catch(() => false) : null;
    rows.push({
      code: item.code,
      email: item.email,
      auth_user: Boolean(authUserId),
      employee: Boolean(employee?.id),
      employee_active: employee?.status === "active",
      user_type: employee?.user_type || "",
      role_code: employee?.metadata?.role_code || employee?.position_code || "",
      profile_kind: employee?.metadata?.profile_kind || "",
      company_user_active: membership?.status === "active",
      services_only: servicesOnly,
      login_ok: loginOk,
    });
  }
  return { identifier, password, rows };
}

async function ensureCompany(config, company, usersByEmail, dryRun) {
  await ensureServicesTechnicianRole(config);
  const identifier = asciiSlug(company.name || company.legal_name || "empresa");
  const password = `${identifier}1234`;
  let authCreated = 0;
  let employeesCreated = 0;
  for (let index = 1; index <= DEFAULT_TECHNICIAN_COUNT; index += 1) {
    const code = technicianCode(index);
    const email = `${code}@${identifier}.local`;
    const auth = await createAuthUser(config, email, password, company, index, usersByEmail, dryRun);
    if (auth.created) authCreated += 1;
    if (!auth.userId && dryRun) {
      employeesCreated += 1;
      continue;
    }
    const employee = await ensureTechnicianProfile(config, company, { userId: auth.userId, email, code, index }, dryRun);
    if (employee.employeeCreated) employeesCreated += 1;
  }
  return { identifier, auth_created: authCreated, employees_created: employeesCreated };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = { ...process.env, ...loadEnvFile(args["env-file"]) };
  const config = {
    url: cleanUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY,
  };
  if (!config.url) throw new Error("Falta SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL.");
  if (!config.anonKey) throw new Error("Falta SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  if (!config.serviceRoleKey) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");

  const companies = await resolveCompanies(config, args);
  const usersByEmail = await authUsersByEmail(config);
  const results = [];
  for (const company of companies) {
    const before = await auditCompany(config, company, usersByEmail, false);
    const missingBefore = before.rows.filter((row) => !row.auth_user || !row.employee || !row.company_user_active);
    let ensure = null;
    if (!args["audit-only"] && missingBefore.length) {
      ensure = await ensureCompany(config, company, usersByEmail, Boolean(args["dry-run"]));
    }
    const afterUsers = await authUsersByEmail(config);
    const after = await auditCompany(config, company, afterUsers, Boolean(args["validate-login"]) && !args["dry-run"]);
    results.push({
      company_id: company.id,
      company_name: company.name || company.legal_name || "",
      identifier: after.identifier,
      missing_before: missingBefore.length,
      ensure,
      totals: {
        expected: DEFAULT_TECHNICIAN_COUNT,
        auth_users: after.rows.filter((row) => row.auth_user).length,
        employees: after.rows.filter((row) => row.employee).length,
        active_employees: after.rows.filter((row) => row.employee_active).length,
        active_memberships: after.rows.filter((row) => row.company_user_active).length,
        services_only: after.rows.filter((row) => row.services_only).length,
        login_ok: after.rows.filter((row) => row.login_ok === true).length,
      },
      incomplete: after.rows.filter((row) => !row.auth_user || !row.employee || !row.employee_active || row.user_type !== "tecnico" || row.role_code !== SERVICES_TECHNICIAN_ROLE_CODE || row.profile_kind !== "tecnico" || !row.company_user_active || !row.services_only).map((row) => row.code),
      login_failed: after.rows.filter((row) => row.login_ok === false).map((row) => row.code),
    });
  }
  console.log(JSON.stringify({ target: new URL(config.url).hostname, dry_run: Boolean(args["dry-run"]), results }, null, 2));
  if (results.some((result) => result.incomplete.length || result.login_failed.length)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
