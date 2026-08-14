const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
require("./load-env")(args["env-file"] || "config/production.env");

const prisma = require("../apps/api/src/core/prisma");
const admin = require("../apps/api/src/modules/admin/service");
const auth = require("../apps/api/src/modules/auth/service");
const { requirePermission, tenantHasModule } = require("../apps/api/src/middleware/rbac");

const PROD_REF = "jzbwzmkidfthknsohhnr";
const RUN_AT = new Date();
const RUN_ID = String(args["run-id"] || RUN_AT.toISOString().replace(/[-:.TZ]/g, "").slice(0, 12));
const TAG = `nyvora_users_roles_qa_${RUN_ID}`;
const PASSWORD = `NyvoraQA-${RUN_ID}#26`;
const EVIDENCE_PATH = path.resolve("docs/audits/NYVORA_USERS_ROLES_QA_TEST.md");

function assertProductionRuntime() {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const databaseUrl = String(process.env.DATABASE_URL || "");
  if (process.env.TARGET_ENV !== "production") throw new Error("TARGET_ENV debe ser production para validar Nyvora real.");
  if (!supabaseUrl.includes(PROD_REF)) throw new Error("SUPABASE_URL no apunta al proyecto productivo esperado.");
  if (!databaseUrl.includes(PROD_REF)) throw new Error("DATABASE_URL no apunta al proyecto productivo esperado.");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function record(result, name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) result.errors.push({ name, detail });
}

async function expectError(result, name, fn, expectedStatus) {
  try {
    await fn();
    record(result, name, false, { expected_status: expectedStatus, obtained: "no_error" });
  } catch (error) {
    record(result, name, Number(error.statusCode || error.status || 0) === expectedStatus, {
      expected_status: expectedStatus,
      obtained_status: error.statusCode || error.status || null,
      message: error.message
    });
  }
}

function permissionPreset(keys, actions) {
  return Object.fromEntries(keys.map((key) => [
    key,
    Object.fromEntries(actions.map((action) => [action, true]))
  ]));
}

function mergePermissions(...items) {
  const merged = {};
  for (const item of items) {
    for (const [key, actions] of Object.entries(item)) {
      merged[key] = { ...(merged[key] || {}), ...actions };
    }
  }
  return merged;
}

async function findNyvoraContext() {
  const companies = await prisma.$queryRawUnsafe("select id,name,legal_name,tax_id,status from public.companies order by name");
  const company = companies.find((item) => normalize(item.name).includes("nyvora") || normalize(item.legal_name).includes("nyvora"));
  if (!company) throw new Error("No existe empresa Nyvora en public.companies.");
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { name: { contains: "NYVORA", mode: "insensitive" } },
        { config: { path: ["company_id"], equals: String(company.id) } }
      ]
    }
  });
  if (!tenant) throw new Error("No existe tenant operativo para Nyvora.");
  return { company, tenant };
}

async function createRole(tenantId, name, permissions, roleType, actorId) {
  return admin.createRole(tenantId, {
    name,
    description: `Rol QA controlado Nyvora ${TAG}`,
    active: true,
    hierarchy_level: roleType === "admin_empresa" ? 90 : roleType === "supervisor" ? 60 : 30,
    role_type: roleType,
    scope: "company",
    scopes: { locations: [], areas: [], cost_centers: [], processes: [] },
    restrictions: { locations: [], areas: [], cost_centers: [], processes: [] },
    permissions
  }, actorId);
}

async function createQuickUser(tenantId, role, kind, actorId) {
  const email = `nyvora.qa.${kind}.${RUN_ID}@internal.apexos.local`;
  return admin.createUser(tenantId, {
    name: `Nyvora QA ${kind} ${RUN_ID}`,
    email,
    access_email: email,
    password: PASSWORD,
    role_id: role.id,
    role_name: role.name,
    document: `NYV-QA-${RUN_ID}-${kind.toUpperCase()}`,
    company: "Nyvora",
    site: "NYVORA Centro",
    base_site: "NYVORA Centro",
    user_status: "activo",
    can_punch_time: kind.includes("hr"),
    can_receive_services: false,
    can_be_assigned_routes: kind.includes("transport") || kind.includes("supervisor"),
    operational_classification: kind.includes("transport") ? "conductor" : kind.includes("supervisor") ? "supervisor" : "administrativo",
    profile_kind: "empleado",
    code: `NYV-QA-${RUN_ID}-${kind.toUpperCase()}`,
    documents: []
  }, actorId);
}

async function can(role, tenant, module, action, body = {}) {
  const reply = {
    statusCode: null,
    payload: null,
    code(status) {
      this.statusCode = status;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return payload;
    }
  };
  await requirePermission(module, action)({ user: { role }, tenant, params: {}, query: {}, body }, reply);
  return { ok: !reply.statusCode, status: reply.statusCode || 200, payload: reply.payload || null };
}

async function runPermissionMatrix(context, users, result) {
  const matrix = [
    [users.admin, "admin_write", "admin", "write", true],
    [users.admin, "hr_write", "hr", "write", true],
    [users.admin, "transport_write", "transport", "write", true],
    [users.hr, "hr_write", "hr", "write", true],
    [users.hr, "transport_write_denied", "transport", "write", false],
    [users.transport, "transport_write", "transport", "write", true],
    [users.transport, "hr_write_denied", "hr", "write", false],
    [users.supervisor, "hr_read", "hr", "read", true],
    [users.supervisor, "transport_write", "transport", "write", true],
    [users.readonly, "hr_read", "hr", "read", true],
    [users.readonly, "transport_read", "transport", "read", true],
    [users.readonly, "hr_write_denied", "hr", "write", false],
    [users.readonly, "transport_write_denied", "transport", "write", false],
    [users.readonly, "admin_write_denied", "admin", "write", false]
  ];
  for (const [user, label, module, action, expected] of matrix) {
    const response = await can(user.role, context.tenant, module, action, { base_site: "NYVORA Centro", area: "NYVORA" });
    record(result, `permission_${user.email}_${label}`, expected ? response.ok : (!response.ok && response.status === 403), response);
  }
}

async function runFrontendStaticChecks(result) {
  const page = fs.readFileSync(path.resolve("apps/web/app/dashboard/administracion/page.tsx"), "utf8");
  record(result, "frontend_quick_creation_visible", page.includes("Crear usuario rapido") && page.includes("Nombre completo") && page.includes("Clave temporal"), {
    quick_title: page.includes("Crear usuario rapido"),
    minimal_fields: ["Nombre completo", "Correo", "Documento", "Empresa", "Rol", "Estado"].every((text) => page.includes(text))
  });
  record(result, "frontend_complete_creation_blocked", page.includes("Creacion completa - proximamente") && /disabled type="button"/.test(page), {
    upcoming_text: page.includes("Creacion completa - proximamente"),
    disabled_button: /disabled type="button"/.test(page)
  });
  record(result, "frontend_responsive_classes_present", /md:grid-cols|lg:grid-cols|xl:grid-cols/.test(page), {
    responsive_classes: (page.match(/(?:sm|md|lg|xl):grid-cols/g) || []).length
  });
}

async function runDatabaseChecks(context, result) {
  const counts = await prisma.$transaction([
    prisma.role.count({ where: { tenant_id: context.tenant.id, description: { contains: TAG } } }),
    prisma.user.count({
      where: {
        tenant_id: context.tenant.id,
        email: { contains: `nyvora.qa.`, mode: "insensitive" },
        AND: [{ email: { contains: RUN_ID, mode: "insensitive" } }]
      }
    }),
    prisma.employee.count({ where: { tenant_id: context.tenant.id, metadata: { path: ["company"], equals: "Nyvora" } } })
  ]);
  const crossTenant = await prisma.$queryRawUnsafe(`
    select 'Role' as table_name, count(*)::int as count from public."Role" where tenant_id <> $1 and description like $2
    union all
    select 'User', count(*)::int from public."User" where tenant_id <> $1 and email like $3
    union all
    select 'Employee', count(*)::int from public."Employee" where tenant_id <> $1 and metadata::text like $2
  `, context.tenant.id, `%${TAG}%`, `%nyvora.qa.%${RUN_ID}%`);
  record(result, "database_records_are_nyvora_scoped", counts[0] >= 5 && counts[1] >= 5 && crossTenant.every((row) => row.count === 0), {
    tenant_id: context.tenant.id,
    counts: { roles: counts[0], users: counts[1], nyvora_employees_total: counts[2] },
    cross_tenant: crossTenant
  });
}

function writeEvidence(result) {
  const lines = [
    "# QA real Nyvora - usuarios, roles y permisos",
    "",
    `- Fecha: ${RUN_AT.toISOString()}`,
    `- Rama: ${result.branch || ""}`,
    `- Commit base: ${result.commit || ""}`,
    "- Empresa usada: Nyvora",
    `- Company ID: ${result.company.id}`,
    `- Tenant ID: ${result.tenant.id}`,
    `- Marcador tecnico: ${TAG}`,
    "",
    "## Usuarios creados",
    "",
    ...result.users.map((user) => `- ${user.name} | ${user.email} | rol: ${user.role} | estado: ${user.active ? "activo" : "inactivo"} | empleado: ${user.employee_id}`),
    "",
    "## Roles creados",
    "",
    ...result.roles.map((role) => `- ${role.name} | id: ${role.id} | permisos: ${role.permissions.map((item) => `${item.module}:${item.action}`).join(", ")}`),
    "",
    "## Matriz usuario / rol / permisos",
    "",
    "| Usuario | Rol | Permisos esperados |",
    "| --- | --- | --- |",
    ...result.users.map((user) => `| ${user.email} | ${user.role} | ${user.expected_permissions} |`),
    "",
    "## Pruebas ejecutadas",
    "",
    "| Prueba | Resultado obtenido | Evidencia tecnica |",
    "| --- | --- | --- |",
    ...result.checks.map((check) => `| ${check.name} | ${check.ok ? "OK" : "FALLO"} | \`${JSON.stringify(check.detail).replace(/`/g, "'")}\` |`),
    "",
    "## Resultado esperado",
    "",
    "- Usuarios creados en Nyvora con datos minimos y relaciones User/Employee/Role.",
    "- Roles creados y permisos aplicados por middleware RBAC.",
    "- Login funcional para usuarios activos.",
    "- Duplicados rechazados.",
    "- Roles y usuarios aislados por tenant.",
    "- Creacion completa visible pero bloqueada.",
    "",
    "## Errores encontrados",
    "",
    ...(result.errors.length ? result.errors.map((error) => `- ${error.name}: ${JSON.stringify(error.detail)}`) : ["- No se encontraron errores bloqueantes en la corrida automatizada."]),
    "",
    "## Correcciones aplicadas",
    "",
    ...(result.corrections.length ? result.corrections.map((item) => `- ${item}`) : ["- No fue necesario corregir codigo durante esta corrida QA."]),
    "",
    "## Validacion posterior",
    "",
    ...(result.validation.map((item) => `- ${item}`)),
    "",
    "## Riesgos pendientes",
    "",
    ...(result.pending.length ? result.pending.map((item) => `- ${item}`) : ["- Sin riesgos pendientes bloqueantes identificados."]),
    "",
    `## Estado final`,
    "",
    result.errors.length ? "FALLIDO: revisar errores listados." : "APROBADO: usuarios, roles y permisos Nyvora validados con datos reales controlados."
  ];
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, lines.join("\n") + "\n");
}

async function main() {
  assertProductionRuntime();
  const result = {
    company: {},
    tenant: {},
    roles: [],
    users: [],
    checks: [],
    errors: [],
    corrections: [],
    validation: [],
    pending: [
      "La revision de consola de navegador requiere sesion interactiva con frontend productivo; esta corrida valida UI por build y codigo fuente."
    ]
  };

  result.branch = require("child_process").execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  result.commit = require("child_process").execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();

  const context = await findNyvoraContext();
  result.company = { id: context.company.id, name: context.company.name };
  result.tenant = { id: context.tenant.id, name: context.tenant.name };
  record(result, "tenant_modules_admin_hr_transport_enabled", tenantHasModule(context.tenant, "admin") && tenantHasModule(context.tenant, "hr") && tenantHasModule(context.tenant, "transport"), {
    active_modules: context.tenant.active_modules
  });

  const adminPermissions = mergePermissions(
    permissionPreset(["usuarios", "roles", "configuracion"], ["access", "view", "create", "edit", "manage_users", "manage_roles", "configure"]),
    permissionPreset(["talento_humano", "marcaciones", "transporte"], ["access", "view", "create", "edit", "approve", "export"])
  );
  const supervisorPermissions = mergePermissions(
    permissionPreset(["talento_humano", "marcaciones", "transporte"], ["access", "view", "create", "edit", "approve", "reports"])
  );
  const hrPermissions = permissionPreset(["talento_humano", "marcaciones"], ["access", "view", "create", "edit"]);
  const transportPermissions = permissionPreset(["transporte"], ["access", "view", "create", "edit"]);
  const readPermissions = mergePermissions(
    permissionPreset(["talento_humano", "marcaciones", "transporte"], ["access", "view", "reports"])
  );

  const roles = {
    admin: await createRole(context.tenant.id, `NYV QA Admin Empresa ${RUN_ID}`, adminPermissions, "admin_empresa"),
    supervisor: await createRole(context.tenant.id, `NYV QA Supervisor ${RUN_ID}`, supervisorPermissions, "supervisor"),
    hr: await createRole(context.tenant.id, `NYV QA Operativo TH ${RUN_ID}`, hrPermissions, "operativo"),
    transport: await createRole(context.tenant.id, `NYV QA Operativo Transporte ${RUN_ID}`, transportPermissions, "operativo"),
    readonly: await createRole(context.tenant.id, `NYV QA Consulta ${RUN_ID}`, readPermissions, "lectura")
  };
  result.roles = Object.values(roles).map((role) => ({ id: role.id, name: role.name, permissions: role.raw_permissions || [] }));
  record(result, "roles_created_for_nyvora", result.roles.length === 5 && result.roles.every((role) => role.permissions.length > 0), result.roles);

  await expectError(result, "duplicate_role_rejected", () => createRole(context.tenant.id, roles.readonly.name, readPermissions, "lectura"), 409);
  const inactiveRole = await createRole(context.tenant.id, `NYV QA Inactivo ${RUN_ID}`, readPermissions, "lectura");
  await admin.setRoleActive(context.tenant.id, inactiveRole.id, false);
  await expectError(result, "inactive_role_cannot_create_user", () => createQuickUser(context.tenant.id, inactiveRole, "inactive-role"), 400);

  const users = {
    admin: await createQuickUser(context.tenant.id, roles.admin, "admin"),
    hr: await createQuickUser(context.tenant.id, roles.hr, "hr"),
    transport: await createQuickUser(context.tenant.id, roles.transport, "transport"),
    supervisor: await createQuickUser(context.tenant.id, roles.supervisor, "supervisor"),
    readonly: await createQuickUser(context.tenant.id, roles.readonly, "readonly")
  };
  for (const [key, user] of Object.entries(users)) {
    const current = await prisma.user.findUnique({ where: { id: user.id }, include: { role: { include: { permissions: true } }, employee: true } });
    users[key] = current;
  }
  result.users = Object.values(users).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
    active: user.active,
    employee_id: user.employee?.id || null,
    expected_permissions: user.role.permissions.map((item) => `${item.module}:${item.action}`).join(", ")
  }));
  record(result, "quick_users_created_with_relations", result.users.length === 5 && result.users.every((user) => user.active && user.employee_id), result.users);

  await expectError(result, "duplicate_user_email_rejected", () => admin.createUser(context.tenant.id, {
    name: "Nyvora QA Duplicado",
    email: users.hr.email,
    password: PASSWORD,
    role_id: roles.hr.id,
    document: `NYV-QA-${RUN_ID}-DUP`,
    company: "Nyvora"
  }), 409);
  await expectError(result, "required_company_validated", () => admin.createUser(context.tenant.id, {
    name: "Nyvora QA Sin Empresa",
    email: `nyvora.qa.no-company.${RUN_ID}@internal.apexos.local`,
    password: PASSWORD,
    role_id: roles.hr.id,
    document: `NYV-QA-${RUN_ID}-NOCOMPANY`
  }), 400);
  await expectError(result, "required_role_validated", () => admin.createUser(context.tenant.id, {
    name: "Nyvora QA Sin Rol",
    email: `nyvora.qa.no-role.${RUN_ID}@internal.apexos.local`,
    password: PASSWORD,
    document: `NYV-QA-${RUN_ID}-NOROLE`,
    company: "Nyvora"
  }), 400);

  const inactiveUser = await createQuickUser(context.tenant.id, roles.readonly, "inactive");
  await admin.setUserActive(context.tenant.id, inactiveUser.id, false);
  await expectError(result, "inactive_user_cannot_login", () => auth.login({ email: inactiveUser.email, password: PASSWORD }, null, { ip: "127.0.0.1" }), 401);
  await admin.setUserActive(context.tenant.id, inactiveUser.id, true);
  const activeLogin = await auth.login({ email: inactiveUser.email, password: PASSWORD }, null, { ip: "127.0.0.1" });
  record(result, "active_user_can_login_after_reactivation", Boolean(activeLogin.token && activeLogin.user?.role), { email: inactiveUser.email, role: activeLogin.user?.role });

  for (const user of Object.values(users)) {
    const login = await auth.login({ email: user.email, password: PASSWORD }, null, { ip: "127.0.0.1" });
    record(result, `login_ok_${user.email}`, Boolean(login.token && login.user?.role_id === user.role_id), { role: login.user?.role, permissions: login.user?.role_permissions?.length || 0 });
  }

  await runPermissionMatrix(context, users, result);
  await runDatabaseChecks(context, result);
  await runFrontendStaticChecks(result);

  result.validation = [
    "Roles y usuarios creados mediante servicios reales de administracion.",
    "Login validado con bcrypt/JWT para usuarios activos e inactivos.",
    "Permisos validados con middleware backend `requirePermission`.",
    "Aislamiento validado por tenant con consulta de solo lectura cross-tenant para el marcador tecnico.",
    "Creacion completa validada como visible y bloqueada por inspeccion de codigo fuente."
  ];
  writeEvidence(result);
  console.log(JSON.stringify({ ok: result.errors.length === 0, evidence: EVIDENCE_PATH, checks: result.checks.length, errors: result.errors }, null, 2));
  if (result.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[nyvora-users-roles-qa] ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
