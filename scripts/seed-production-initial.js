const fs = require("fs");
const path = require("path");

function loadEnvFile(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1).replace(/^"|"$/g, "");
  }
}

loadEnvFile();

const TARGET_ENV = process.env.TARGET_ENV || "";
const ALLOW_EMERGENCY_EXTERNAL_SEED = process.env.ALLOW_EMERGENCY_EXTERNAL_SEED === "true";
const CONFIRM_PROD_SEED = process.env.CONFIRM_PROD_SEED || "";
const CONFIRM_QA_SEED = process.env.CONFIRM_QA_SEED || "";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PASSWORD = process.env.INITIAL_USER_PASSWORD || "";
const SEED_FILE = process.env.PROD_SEED_FILE || "";

const isProduction = TARGET_ENV === "production";
const isQa = TARGET_ENV === "qa";

if (!isProduction && !isQa) {
  throw new Error("TARGET_ENV debe ser 'qa' o 'production'.");
}

if (isProduction && !ALLOW_EMERGENCY_EXTERNAL_SEED) {
  throw new Error("DEPRECATED: no crear empresas/clientes productivos por seed externo. Usa Administracion APEX con Platform SuperAdmin. Solo emergencia documentada: ALLOW_EMERGENCY_EXTERNAL_SEED=true.");
}

if (isProduction && CONFIRM_PROD_SEED !== "true") {
  throw new Error("Para produccion define CONFIRM_PROD_SEED=true.");
}

if (isQa && CONFIRM_QA_SEED !== "true") {
  throw new Error("Para probar en QA define CONFIRM_QA_SEED=true.");
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Configura SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
}

if (!DEFAULT_PASSWORD && !SEED_FILE) {
  throw new Error("Define INITIAL_USER_PASSWORD o usa PROD_SEED_FILE con temporary_password por usuario.");
}

const DEFAULT_SEED = {
  company: {
    code: "CLIENTE-PROD",
    name: "Cliente Produccion",
    legal_name: "Cliente Produccion S.A.S.",
    tax_id: "NIT-PENDIENTE",
    email: "admin@cliente.example",
    phone: "+57 300 000 0000",
    country: "CO",
    city: "Bogota",
    address: "Direccion pendiente",
    business_line: "operaciones"
  },
  modules: ["configuracion", "administracion_apex", "talento_humano", "transporte", "servicios", "proyectos"],
  catalogs: {
    roles_perfiles: [
      { code: "ADMIN_EMPRESA", name: "Administrador de empresa", metadata: { role: "admin", permissions: ["*"] } },
      { code: "SUPERVISOR", name: "Supervisor operativo", metadata: { role: "admin", permissions: ["hr:read", "transport:read", "services:read", "projects:read"] } },
      { code: "CONDUCTOR", name: "Conductor", metadata: { role: "member", permissions: ["hr:self", "transport:self"] } },
      { code: "OPERADOR", name: "Operador", metadata: { role: "member", permissions: ["services:self", "hr:self"] } },
      { code: "AUDITOR", name: "Auditor", metadata: { role: "viewer", permissions: ["read"] } }
    ],
    tipos_usuario: [
      { code: "administrativo", name: "Administrativo" },
      { code: "supervisor", name: "Supervisor" },
      { code: "conductor", name: "Conductor" },
      { code: "operario", name: "Operario" },
      { code: "auditor", name: "Auditor" }
    ],
    sedes: [
      { code: "SEDE-PRINCIPAL", name: "Sede principal" }
    ],
    areas: [
      { code: "ADMIN", name: "Administracion" },
      { code: "OPER", name: "Operacion" },
      { code: "TRANSP", name: "Transporte" }
    ],
    cargos: [
      { code: "ADMIN_EMPRESA", name: "Administrador de empresa" },
      { code: "SUP_OPER", name: "Supervisor operativo" },
      { code: "CONDUCTOR", name: "Conductor" },
      { code: "OPERARIO", name: "Operario" }
    ],
    centros_costo: [
      { code: "CC-ADMIN", name: "Administracion" },
      { code: "CC-OPER", name: "Operacion" },
      { code: "CC-TRAN", name: "Transporte" }
    ],
    tipos_documento: [
      { code: "CC", name: "Cedula de ciudadania" },
      { code: "NIT", name: "NIT" }
    ],
    tipos_vehiculo: [
      { code: "camioneta", name: "Camioneta" },
      { code: "furgon", name: "Furgon" }
    ],
    marcas_vehiculo: [
      { code: "TOYOTA", name: "Toyota" },
      { code: "CHEVROLET", name: "Chevrolet" }
    ],
    parametros_base: [
      { code: "timezone", name: "America/Bogota", metadata: { value: "America/Bogota" } },
      { code: "currency", name: "COP", metadata: { value: "COP" } }
    ]
  },
  users: [
    {
      email: "admin@cliente.example",
      full_name: "Administrador Cliente",
      role: "admin",
      role_code: "ADMIN_EMPRESA",
      user_type: "administrativo",
      document_type: "CC",
      document_number: "1000000001",
      phone: "+57 300 000 0001",
      position_code: "ADMIN_EMPRESA",
      area_code: "ADMIN",
      location_code: "SEDE-PRINCIPAL",
      cost_center_code: "CC-ADMIN"
    },
    {
      email: "supervisor@cliente.example",
      full_name: "Supervisor Operativo",
      role: "admin",
      role_code: "SUPERVISOR",
      user_type: "supervisor",
      document_type: "CC",
      document_number: "1000000002",
      phone: "+57 300 000 0002",
      position_code: "SUP_OPER",
      area_code: "OPER",
      location_code: "SEDE-PRINCIPAL",
      cost_center_code: "CC-OPER"
    },
    {
      email: "conductor@cliente.example",
      full_name: "Conductor Inicial",
      role: "member",
      role_code: "CONDUCTOR",
      user_type: "conductor",
      document_type: "CC",
      document_number: "1000000003",
      phone: "+57 300 000 0003",
      position_code: "CONDUCTOR",
      area_code: "TRANSP",
      location_code: "SEDE-PRINCIPAL",
      cost_center_code: "CC-TRAN"
    }
  ],
  vehicles: [
    {
      plate: "PROD001",
      type: "camioneta",
      brand: "TOYOTA",
      model: "Hilux",
      year: 2024,
      color: "Blanco",
      ownership_type: "propio",
      legal_owner: "Cliente Produccion S.A.S.",
      owner_document: "NIT-PENDIENTE",
      base_site: "SEDE-PRINCIPAL",
      cost_center: "CC-TRAN",
      authorized_driver_document: "1000000003",
      soat_expires: "2027-12-31",
      technical_review_expires: "2027-12-31"
    }
  ],
  buckets: [
    "company-assets",
    "user-avatars",
    "service-images",
    "vehicle-documents",
    "route-evidence",
    "general-attachments",
    "accounting-documents",
    "operational-evidence",
    "user-documents"
  ]
};

function readSeed() {
  if (!SEED_FILE) return DEFAULT_SEED;
  const fullPath = path.resolve(SEED_FILE);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

const seed = readSeed();
const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json"
};

const counters = {};

function count(action) {
  counters[action] = (counters[action] || 0) + 1;
}

function eq(value) {
  return encodeURIComponent(String(value));
}

async function request(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || text || response.statusText;
    throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${detail}`);
  }
  return body;
}

async function maybeRequest(pathname, options = {}) {
  try {
    return await request(pathname, options);
  } catch {
    return null;
  }
}

async function findOne(table, filter, select = "*") {
  const rows = await request(`/rest/v1/${table}?select=${select}&${filter}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertRow(table, row) {
  const rows = await request(`/rest/v1/${table}?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row)
  });
  count(`${table}.inserted`);
  return rows[0];
}

async function updateRow(table, filter, row) {
  const rows = await request(`/rest/v1/${table}?${filter}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row)
  });
  count(`${table}.updated`);
  return rows[0] || null;
}

async function upsertBy(table, filter, row) {
  const existing = await findOne(table, filter);
  if (existing?.id) return updateRow(table, `id=eq.${existing.id}`, row);
  return insertRow(table, row);
}

async function ensureBucket(id) {
  const existing = await maybeRequest(`/storage/v1/bucket/${id}`);
  if (existing) {
    count("buckets.omitted");
    return existing;
  }
  const created = await request("/storage/v1/bucket", {
    method: "POST",
    body: JSON.stringify({
      id,
      name: id,
      public: false,
      file_size_limit: 20 * 1024 * 1024
    })
  });
  count("buckets.inserted");
  return created;
}

async function getAuthUsers() {
  const users = [];
  for (let page = 1; page <= 10; page += 1) {
    const body = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const batch = Array.isArray(body?.users) ? body.users : [];
    users.push(...batch);
    if (batch.length < 100) break;
  }
  return users;
}

async function ensureAuthUser(input, existingUsers) {
  const email = String(input.email || "").toLowerCase();
  const found = existingUsers.find((user) => String(user.email || "").toLowerCase() === email);
  if (found) {
    count("auth_users.omitted");
    return found;
  }
  const password = input.temporary_password || DEFAULT_PASSWORD;
  if (!password) throw new Error(`Usuario ${email} no tiene temporary_password y INITIAL_USER_PASSWORD no fue definido.`);
  const user = await request("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: input.full_name,
        role_code: input.role_code,
        user_type: input.user_type,
        seeded_by: "seed-production-initial"
      }
    })
  });
  count("auth_users.inserted");
  return user;
}

async function ensureCompany() {
  const company = seed.company;
  return upsertBy("companies", `tax_id=eq.${eq(company.tax_id)}`, {
    name: company.name,
    legal_name: company.legal_name || company.name,
    tax_id: company.tax_id,
    email: company.email || null,
    phone: company.phone || null,
    status: "active",
    company_type: "company",
    business_line: company.business_line || null,
    country: company.country || "CO",
    city: company.city || null,
    address: company.address || null
  });
}

async function ensureCatalog(company, code, items, sortBase) {
  const catalog = await upsertBy("master_catalogs", `company_id=eq.${company.id}&code=eq.${eq(code)}`, {
    company_id: company.id,
    code,
    name: code.replace(/_/g, " "),
    description: `Catalogo productivo inicial ${code}`,
    scope: "company",
    active: true,
    sort_order: sortBase,
    metadata: { seeded_by: "seed-production-initial", target_env: TARGET_ENV }
  });
  let index = 0;
  for (const item of items || []) {
    index += 1;
    await upsertBy("master_catalog_items", `catalog_id=eq.${catalog.id}&code=eq.${eq(item.code)}`, {
      catalog_id: catalog.id,
      company_id: company.id,
      code: item.code,
      name: item.name,
      description: item.description || null,
      active: item.active !== false,
      sort_order: item.sort_order || sortBase + index,
      parent_code: item.parent_code || null,
      metadata: { ...(item.metadata || {}), seeded_by: "seed-production-initial", target_env: TARGET_ENV }
    });
  }
  return catalog;
}

async function ensureModules(company) {
  for (const code of seed.modules || []) {
    const module = await findOne("modules", `code=eq.${eq(code)}`, "id,code,name");
    if (!module) {
      count("company_modules.omitted_missing_module");
      continue;
    }
    await upsertBy("company_modules", `company_id=eq.${company.id}&module_id=eq.${module.id}`, {
      company_id: company.id,
      module_id: module.id,
      enabled: true,
      source: "manual"
    });
  }
}

async function ensureUsers(company) {
  const existingUsers = await getAuthUsers();
  const byDocument = new Map();
  const created = [];
  for (const input of seed.users || []) {
    const authUser = await ensureAuthUser(input, existingUsers);
    const email = String(input.email || "").toLowerCase();
    await upsertBy("profiles", `id=eq.${authUser.id}`, {
      id: authUser.id,
      full_name: input.full_name,
      email,
      phone: input.phone || null,
      status: "active"
    });
    await upsertBy("company_users", `company_id=eq.${company.id}&user_id=eq.${authUser.id}`, {
      company_id: company.id,
      user_id: authUser.id,
      role: input.role || "member",
      status: "active"
    });
    const [firstName, ...lastParts] = String(input.full_name || "").trim().split(/\s+/);
    const employee = await upsertBy("employees", `company_id=eq.${company.id}&document_number=eq.${eq(input.document_number)}`, {
      company_id: company.id,
      user_id: authUser.id,
      first_name: firstName || input.full_name,
      last_name: lastParts.join(" ") || "-",
      document_type: input.document_type || "CC",
      document_number: input.document_number,
      email,
      phone: input.phone || null,
      position: input.position || input.position_code || null,
      department: input.department || input.area_code || null,
      hire_date: input.hire_date || null,
      status: "active",
      user_type: input.user_type || "operario",
      employee_code: input.employee_code || input.document_number,
      position_code: input.position_code || null,
      area_code: input.area_code || null,
      location_code: input.location_code || null,
      cost_center_code: input.cost_center_code || null,
      contract_type_code: input.contract_type_code || null,
      metadata: {
        seeded_by: "seed-production-initial",
        target_env: TARGET_ENV,
        role_code: input.role_code,
        access: {
          role: input.role || "member",
          role_code: input.role_code,
          location_code: input.location_code,
          area_code: input.area_code,
          cost_center_code: input.cost_center_code
        }
      }
    });
    byDocument.set(input.document_number, employee);
    created.push({ authUser, employee, input });
  }
  return { byDocument, created };
}

async function ensureVehicles(company, users) {
  for (const input of seed.vehicles || []) {
    const driver = input.authorized_driver_document ? users.byDocument.get(input.authorized_driver_document) : null;
    await upsertBy("vehicles", `company_id=eq.${company.id}&plate=eq.${eq(input.plate)}`, {
      company_id: company.id,
      plate: String(input.plate || "").replace(/\s+/g, "").toUpperCase(),
      brand: input.brand || "",
      model: input.model || "",
      type: input.type || "",
      year: input.year || null,
      color: input.color || "",
      owner: input.owner || input.legal_owner || seed.company.legal_name || seed.company.name,
      status: input.status || "active",
      metadata: { ...(input.metadata || {}), seeded_by: "seed-production-initial", target_env: TARGET_ENV },
      category: input.category || "",
      line: input.line || input.model || "",
      ownership_type: input.ownership_type || "propio",
      legal_owner: input.legal_owner || input.owner || seed.company.legal_name || seed.company.name,
      owner_document: input.owner_document || seed.company.tax_id,
      cost_center: input.cost_center || "",
      base_site: input.base_site || "",
      authorized_driver_id: driver?.id || null,
      authorized_driver_name: driver ? `${driver.first_name} ${driver.last_name}`.trim() : "",
      authorized_driver_document: input.authorized_driver_document || "",
      authorized_driver_code: driver?.employee_code || input.authorized_driver_document || "",
      soat_expires: input.soat_expires || null,
      technical_review_expires: input.technical_review_expires || null,
      active: input.active !== false
    });
  }
}

async function main() {
  console.log(`[seed] target=${TARGET_ENV} url=${SUPABASE_URL.replace(/(https?:\/\/[^.]+).*/, "$1...")}`);
  for (const bucket of seed.buckets || []) await ensureBucket(bucket);
  const company = await ensureCompany();
  let sortBase = 10;
  for (const [code, items] of Object.entries(seed.catalogs || {})) {
    await ensureCatalog(company, code, items, sortBase);
    sortBase += 100;
  }
  await ensureModules(company);
  const users = await ensureUsers(company);
  await ensureVehicles(company, users);
  console.log(JSON.stringify({
    ok: true,
    target_env: TARGET_ENV,
    company: { id: company.id, name: company.name, tax_id: company.tax_id },
    counters
  }, null, 2));
}

main().catch((error) => {
  console.error(`[seed] failed: ${error.message}`);
  process.exit(1);
});
