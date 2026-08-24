const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    parsed[item.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const prisma = require("../../apps/api/src/core/prisma");
const admin = require("../../apps/api/src/modules/admin/service");

const API_URL = String(args["api-url"] || "http://127.0.0.1:3100").replace(/\/$/, "");
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/admin-role-capabilities-20260824/certification.json"));
const FIXTURE_OUTPUT = args["fixture-output"] ? path.resolve(String(args["fixture-output"])) : "";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Roles-${crypto.randomBytes(6).toString("hex")}#26`;
const PHOTOLESS_MODULES = ["M-22", "M-17", "M-26"];

function assertSafeRuntime() {
  const databaseUrl = String(process.env.DATABASE_URL || "");
  if (String(process.env.TARGET_ENV || "").toLowerCase() !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  if (process.env.ALLOW_SYNTHETIC_QA !== "1") throw new Error("ALLOW_SYNTHETIC_QA=1 es obligatorio.");
  if (!/127\.0\.0\.1|localhost/i.test(databaseUrl)) throw new Error("La certificacion solo admite PostgreSQL local aislado.");
}

function record(result, name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo el control ${name}: ${JSON.stringify(detail)}`);
}

async function request(route, options = {}) {
  const expected = Array.isArray(options.expected) ? options.expected : [options.expected || 200];
  const response = await fetch(`${API_URL}${route}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!expected.includes(response.status)) {
    const error = new Error(`${options.method || "GET"} ${route}: esperado ${expected.join("/")}, obtenido ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return { status: response.status, payload };
}

function permissions(overrides = {}) {
  return overrides;
}

async function createRole(tenantId, actorId, suffix, roleType, matrix) {
  return admin.createRole(tenantId, {
    name: `QA ${suffix} ${RUN_ID}`,
    description: `Certificacion controlada de capacidades ${suffix}`,
    active: true,
    hierarchy_level: roleType === "admin_empresa" ? 90 : 40,
    role_type: roleType,
    scope: "company",
    permissions: matrix
  }, actorId);
}

async function createUser(tenantId, actorId, role, suffix) {
  const email = `qa.roles.${suffix}.${RUN_ID}@nyvora.test`;
  return admin.createUser(tenantId, {
    name: `QA Roles ${suffix} ${RUN_ID}`,
    email,
    access_email: email,
    password: PASSWORD,
    role_id: role.id,
    role_name: role.name,
    document: `QA-${RUN_ID}-${suffix}`,
    company: "NYVORA",
    position: "Certificacion QA",
    department: "Calidad",
    profile_kind: "empleado",
    operational_classification: "administrativo",
    user_status: "activo",
    code: `QA-${RUN_ID}-${suffix}`
  }, actorId);
}

async function login(email) {
  return (await request("/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } })).payload.token;
}

async function main() {
  assertSafeRuntime();
  const result = {
    change_id: "admin-role-capabilities-20260824",
    environment: "QA_LOCAL_ISOLATED",
    company: "NYVORA",
    generated_at: new Date().toISOString(),
    checks: [],
    status: "running"
  };
  const createdUserIds = [];
  try {
    let tenant = await prisma.tenant.findFirst({ where: { name: { equals: "NYVORA", mode: "insensitive" } } });
    tenant = tenant
      ? await prisma.tenant.update({ where: { id: tenant.id }, data: { active: true, active_modules: PHOTOLESS_MODULES } })
      : await prisma.tenant.create({ data: { name: "NYVORA", industry: "services", active_modules: PHOTOLESS_MODULES } });
    const foreignTenant = await prisma.tenant.create({ data: { name: `QA OTRO TENANT ${RUN_ID}`, active_modules: PHOTOLESS_MODULES } });
    const apexRole = await prisma.role.create({
      data: { tenant_id: tenant.id, name: `APEX_ADMIN_QA_${RUN_ID}`, description: "Bootstrap QA", is_system: true, metadata: { role_type: "superadmin" }, permissions: { create: [{ module: "*", action: "*" }] } },
      include: { permissions: true }
    });
    const apexUser = await prisma.user.create({
      data: { tenant_id: tenant.id, name: "QA Bootstrap", email: `qa.bootstrap.${RUN_ID}@nyvora.test`, password: await bcrypt.hash(PASSWORD, 12), role_id: apexRole.id }
    });
    createdUserIds.push(apexUser.id);

    const roles = {
      administrator: await createRole(tenant.id, apexUser.id, "Administrador corporativo", "admin_empresa", permissions({})),
      userManager: await createRole(tenant.id, apexUser.id, "Gestor usuarios", "custom", permissions({ usuarios: { access: true, view: true, create: true, edit: true, manage_users: false } })),
      support: await createRole(tenant.id, apexUser.id, "Soporte limitado", "soporte", permissions({ usuarios: { access: true, view: true, create: false, edit: true, manage_users: false }, roles: { access: true, view: true, create: false, edit: false, manage_roles: false }, configuracion: { configure: true } })),
      roleManager: await createRole(tenant.id, apexUser.id, "Gestor roles", "custom", permissions({ roles: { access: true, view: true, create: true, edit: true, manage_roles: true } })),
      readonly: await createRole(tenant.id, apexUser.id, "Consulta usuarios", "lectura", permissions({ usuarios: { access: true, view: true, create: false, edit: false, manage_users: false } })),
      marking: await createRole(tenant.id, apexUser.id, "Marcaciones", "operativo", permissions({ marcaciones: { access: true, view: true, create: true } }))
    };
    const users = {};
    for (const [key, role] of Object.entries(roles)) {
      users[key] = await createUser(tenant.id, apexUser.id, role, key);
      createdUserIds.push(users[key].id);
    }
    const tokens = {};
    for (const [key, user] of Object.entries(users)) tokens[key] = await login(user.email);

    const adminList = await request("/api/v1/admin/users", { token: tokens.administrator });
    record(result, "administrator_lists_users", adminList.status === 200, { status: adminList.status, count: adminList.payload.length });
    const adminCreated = await request("/api/v1/admin/users", {
      token: tokens.administrator,
      method: "POST",
      expected: 201,
      body: {
        name: `Creado por administrador ${RUN_ID}`,
        email: `qa.roles.admin-created.${RUN_ID}@nyvora.test`,
        password: PASSWORD,
        role_id: roles.marking.id,
        role_name: roles.marking.name,
        company: "NYVORA",
        document: `QA-${RUN_ID}-ADMIN-CREATED`,
        position: "Empleado",
        department: "Operacion",
        profile_kind: "empleado",
        operational_classification: "operativo",
        user_status: "activo"
      }
    });
    createdUserIds.push(adminCreated.payload.id);
    record(result, "administrator_creates_user", adminCreated.status === 201 && adminCreated.payload.role_id === roles.marking.id, { status: adminCreated.status, user_id: adminCreated.payload.id });
    const adminRoleCreated = await request("/api/v1/admin/roles", {
      token: tokens.administrator,
      method: "POST",
      expected: 201,
      body: { name: `QA Rol creado por admin ${RUN_ID}`, role_type: "custom", permissions: { usuarios: { access: true, view: true } } }
    });
    record(result, "administrator_creates_role", adminRoleCreated.status === 201, { status: adminRoleCreated.status, role_id: adminRoleCreated.payload.id });

    const managerCreated = await request("/api/v1/admin/users", {
      token: tokens.userManager,
      method: "POST",
      expected: 201,
      body: {
        name: `Creado por gestor ${RUN_ID}`,
        email: `qa.roles.manager-created.${RUN_ID}@nyvora.test`,
        password: PASSWORD,
        role_id: roles.marking.id,
        role_name: roles.marking.name,
        company: "NYVORA",
        document: `QA-${RUN_ID}-MANAGER-CREATED`,
        position: "Empleado",
        department: "Operacion",
        profile_kind: "empleado",
        operational_classification: "operativo",
        user_status: "activo"
      }
    });
    createdUserIds.push(managerCreated.payload.id);
    record(result, "user_manager_creates_user", managerCreated.status === 201, { status: managerCreated.status, user_id: managerCreated.payload.id });
    const managerRoleDenied = await request("/api/v1/admin/roles", { token: tokens.userManager, method: "POST", expected: 403, body: { name: `No permitido ${RUN_ID}` } });
    record(result, "user_manager_cannot_create_roles", managerRoleDenied.payload.code === "CAPACIDAD_ROL_DENEGADA", { status: managerRoleDenied.status, code: managerRoleDenied.payload.code });

    const supportList = await request("/api/v1/admin/users", { token: tokens.support });
    record(result, "support_reads_users", supportList.status === 200, { status: supportList.status });
    const supportEdit = await request(`/api/v1/admin/users/${managerCreated.payload.id}`, {
      token: tokens.support,
      method: "PUT",
      body: { name: managerCreated.payload.name, email: managerCreated.payload.email, role_id: roles.marking.id, company: "NYVORA", document: `QA-${RUN_ID}-MANAGER-CREATED`, position: "Actualizado por soporte" }
    });
    record(result, "support_edits_user", supportEdit.status === 200 && supportEdit.payload.position === "Actualizado por soporte", { status: supportEdit.status });
    const supportCreateDenied = await request("/api/v1/admin/users", { token: tokens.support, method: "POST", expected: 403, body: {} });
    record(result, "support_cannot_create_users", supportCreateDenied.payload.code === "CAPACIDAD_ROL_DENEGADA", { status: supportCreateDenied.status, code: supportCreateDenied.payload.code });

    const roleManagerList = await request("/api/v1/admin/roles", { token: tokens.roleManager });
    record(result, "role_manager_reads_roles", roleManagerList.status === 200, { status: roleManagerList.status, count: roleManagerList.payload.length });
    const managedRole = await request("/api/v1/admin/roles", { token: tokens.roleManager, method: "POST", expected: 201, body: { name: `QA Rol gestor ${RUN_ID}`, role_type: "custom", permissions: {} } });
    record(result, "role_manager_creates_role", managedRole.status === 201, { status: managedRole.status, role_id: managedRole.payload.id });
    const roleManagerUserDenied = await request("/api/v1/admin/users", { token: tokens.roleManager, method: "POST", expected: 403, body: {} });
    record(result, "role_manager_cannot_create_users", roleManagerUserDenied.payload.code === "CAPACIDAD_ROL_DENEGADA", { status: roleManagerUserDenied.status, code: roleManagerUserDenied.payload.code });

    record(result, "readonly_lists_users", (await request("/api/v1/admin/users", { token: tokens.readonly })).status === 200, {});
    const readonlyDenied = await request("/api/v1/admin/users", { token: tokens.readonly, method: "POST", expected: 403, body: {} });
    record(result, "readonly_cannot_create_users", readonlyDenied.payload.code === "CAPACIDAD_ROL_DENEGADA", { code: readonlyDenied.payload.code });
    const markingDenied = await request("/api/v1/admin/users", { token: tokens.marking, expected: 403 });
    record(result, "marking_role_cannot_list_users", markingDenied.payload.code === "CAPACIDAD_ROL_DENEGADA", { code: markingDenied.payload.code });

    const foreignRole = await prisma.role.create({ data: { tenant_id: foreignTenant.id, name: `QA Foreign ${RUN_ID}`, permissions: { create: [] } } });
    const foreignUser = await prisma.user.create({ data: { tenant_id: foreignTenant.id, name: "Foreign QA", email: `qa.foreign.${RUN_ID}@other.test`, password: await bcrypt.hash(PASSWORD, 12), role_id: foreignRole.id } });
    const crossTenant = await request(`/api/v1/admin/users/${foreignUser.id}`, { token: tokens.administrator, method: "PUT", expected: 404, body: { name: "No permitido" } });
    record(result, "administrator_cannot_edit_other_tenant", crossTenant.status === 404, { status: crossTenant.status });

    await admin.setUserActive(tenant.id, users.readonly.id, false, apexUser.id);
    const inactiveLogin = await request("/api/v1/auth/login", { method: "POST", expected: 403, body: { email: users.readonly.email, password: PASSWORD } });
    record(result, "inactive_user_cannot_login", inactiveLogin.status === 403, { status: inactiveLogin.status });

    result.fixture = { tenant_id: tenant.id, admin_user_id: users.administrator.id, created_user_id: adminCreated.payload.id };
    result.status = "passed";
    if (FIXTURE_OUTPUT) {
      fs.mkdirSync(path.dirname(FIXTURE_OUTPUT), { recursive: true });
      fs.writeFileSync(FIXTURE_OUTPUT, JSON.stringify({ tenant_id: tenant.id, admin_email: users.administrator.email, password: PASSWORD, marking_role_id: roles.marking.id }));
    }
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null };
    throw error;
  } finally {
    if (!FIXTURE_OUTPUT) {
      for (const userId of createdUserIds) {
        const user = await prisma.user.findUnique({ where: { id: userId } }).catch(() => null);
        if (user) await admin.setUserActive(user.tenant_id, user.id, false).catch(() => undefined);
      }
    }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`CERTIFICACION DE ROLES Y USUARIOS APROBADA: ${result.checks.length} controles`);
}

main().catch((error) => {
  console.error(`CERTIFICACION DE ROLES Y USUARIOS FALLIDA: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
