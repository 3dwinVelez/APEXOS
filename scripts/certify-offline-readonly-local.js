const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const mode = process.argv[2] || "inspect";
const TAG = "offline_phase_3_1_local";
const TENANT_NAME = "Nyvora";
const TENANT_DOMAIN = "nyvora.offline.local";
const STATE_PATH = path.resolve("config/offline-phase3-certification.env");
const EXPECTED_PORT = "54320";
const EXPECTED_DATABASE = "apexos_offline_cert_local";

function assertLocalRuntime() {
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1"].includes(databaseUrl.hostname)) {
    throw new Error("La certificacion solo admite PostgreSQL local.");
  }
  if (databaseUrl.port !== EXPECTED_PORT || databaseUrl.pathname.slice(1) !== EXPECTED_DATABASE) {
    throw new Error("La certificacion requiere la base local dedicada apexos_offline_cert_local:54320.");
  }
  if (!["development", "local"].includes(process.env.APP_ENV || "development")) {
    throw new Error("APP_ENV debe ser development o local.");
  }
  process.env.DISABLE_REDIS = "true";
  process.env.REDIS_DISABLED = "true";
}

assertLocalRuntime();

const prisma = require("../apps/api/src/core/prisma");
const auth = require("../apps/api/src/modules/auth/service");
const admin = require("../apps/api/src/modules/admin/service");
const services = require("../apps/api/src/modules/services/service");

function password() {
  return `Offline-${crypto.randomBytes(12).toString("base64url")}#3`;
}

function parseState() {
  if (!fs.existsSync(STATE_PATH)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(STATE_PATH, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function saveState(values) {
  fs.writeFileSync(
    STATE_PATH,
    [
      "# Local-only credentials and identifiers. Never commit.",
      ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
      ""
    ].join("\n"),
    { mode: 0o600 }
  );
}

async function exactTenant() {
  const matches = await prisma.$queryRaw`
    SELECT id, name, domain, active, active_modules, config
    FROM public."Tenant"
    WHERE lower(name) = lower(${TENANT_NAME})
       OR lower(coalesce(domain, '')) = lower(${TENANT_DOMAIN})
  `;
  if (matches.length > 1) throw new Error("Existe mas de un tenant Nyvora compatible.");
  return matches[0] || null;
}

async function assertCompatibleSchema() {
  const rows = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Tenant'
      AND column_name = 'authorization_version'
  `;
  if (rows.length !== 1) {
    throw new Error(
      "La base local no contiene Tenant.authorization_version; no se puede certificar sesion/revocacion sin una base development compatible."
    );
  }
}

function technicianInput({ name, email, roleId, code }) {
  return {
    profile_kind: "tecnico",
    user_kind: "tecnico",
    name,
    first_names: name,
    last_names: "Offline",
    email,
    password: password(),
    role_id: roleId,
    document: code,
    code,
    company: TENANT_NAME,
    position: "Tecnico de servicios",
    department: "Servicios",
    user_status: "activo",
    operational_classification: "tecnico",
    engagement_type: "contratista",
    contract_type: "service",
    can_receive_services: true,
    metadata: { certification_tag: TAG }
  };
}

async function prepare() {
  await assertCompatibleSchema();
  const existingTenant = await exactTenant();
  if (existingTenant) {
    if (existingTenant.config?.source !== TAG) {
      throw new Error("Nyvora ya existe y no pertenece al fixture controlado.");
    }
    const adminUser = await prisma.user.findFirst({
      where: { tenant_id: existingTenant.id, role: { name: "APEX_ADMIN" } },
      include: { role: true }
    });
    const technicianRole = await prisma.role.findFirst({
      where: { tenant_id: existingTenant.id, name: "Tecnico" },
      include: { permissions: true }
    });
    const unauthorizedRole = await prisma.role.findFirst({
      where: { tenant_id: existingTenant.id, name: "Consulta QA sin offline" },
      include: { permissions: true }
    });
    if (!adminUser || !technicianRole || !unauthorizedRole) {
      throw new Error("El seed controlado existe de forma parcial.");
    }
    const technicianPermissions = technicianRole.permissions.map(
      (permission) => `${permission.module}:${permission.action}`
    );
    if (
      technicianPermissions.length !== 1 ||
      technicianPermissions[0] !== "services:read"
    ) {
      await admin.updateRole(
        existingTenant.id,
        technicianRole.id,
        {
          name: "Tecnico",
          description: "Tecnico QA restringido a consulta de Servicios.",
          role_type: "operativo",
          permissions: { servicios: { access: true, view: true } }
        },
        adminUser.id,
        "APEX_ADMIN"
      );
    }
    if (unauthorizedRole.permissions.length) {
      await admin.updateRole(
        existingTenant.id,
        unauthorizedRole.id,
        {
          name: "Consulta QA sin offline",
          description: "Usuario QA sin capacidad de Servicios ni offline.",
          role_type: "consulta",
          permissions: { dashboard: { access: true, view: true } }
        },
        adminUser.id,
        "APEX_ADMIN"
      );
    }
    return inspect();
  }

  const adminPassword = password();
  const registered = await auth.registerTenant({
    company_name: TENANT_NAME,
    industry: "internal_qa",
    country: "CO",
    timezone: "America/Bogota",
    currency: "COP",
    plan: "crown",
    name: "Nyvora Offline QA Admin",
    email: "nyvora.offline.admin@internal.apexos.local",
    password: adminPassword
  });
  const tenantId = registered.tenant.id;
  const adminUser = {
    id: registered.user.id,
    tenant_id: tenantId,
    role: { name: "APEX_ADMIN" },
    role_id: registered.user.role_id,
    name: registered.user.name,
    email: registered.user.email
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      domain: TENANT_DOMAIN,
      active_modules: ["M-22", "M-26"],
      config: { source: TAG, purpose: "read_only_offline_certification" }
    }
  });

  const role = await admin.createRole(
    tenantId,
    {
      name: "Tecnico",
      description: "Tecnico QA restringido a consulta de Servicios.",
      role_type: "operativo",
      permissions: { servicios: { access: true, view: true } }
    },
    adminUser.id
  );
  const unauthorizedRole = await admin.createRole(
    tenantId,
    {
      name: "Consulta QA sin offline",
      description: "Usuario QA sin capacidad de Servicios ni offline.",
      role_type: "consulta",
      permissions: { dashboard: { access: true, view: true } }
    },
    adminUser.id
  );

  const primaryInput = technicianInput({
    name: "Tecnico QA Offline",
    email: "nyvora.offline.technician@internal.apexos.local",
    roleId: role.id,
    code: "NYV-OFFLINE-QA-01"
  });
  const exclusionInput = technicianInput({
    name: "Tecnico QA Aislamiento",
    email: "nyvora.offline.exclusion@internal.apexos.local",
    roleId: role.id,
    code: "NYV-OFFLINE-QA-02"
  });
  const primary = await admin.createUser(tenantId, primaryInput, adminUser.id);
  const exclusion = await admin.createUser(tenantId, exclusionInput, adminUser.id);
  const unauthorizedInput = {
    ...technicianInput({
      name: "Usuario QA No Autorizado",
      email: "nyvora.offline.unauthorized@internal.apexos.local",
      roleId: unauthorizedRole.id,
      code: "NYV-OFFLINE-QA-03"
    }),
    profile_kind: "empleado",
    user_kind: "empleado",
    operational_classification: "administrativo",
    can_receive_services: false,
    position: "Consulta QA"
  };
  const unauthorized = await admin.createUser(
    tenantId,
    unauthorizedInput,
    adminUser.id
  );
  const primaryUser = await prisma.user.findUnique({
    where: { id: primary.id },
    include: { role: { include: { permissions: true } }, employee: true }
  });
  const exclusionUser = await prisma.user.findUnique({
    where: { id: exclusion.id },
    include: { role: { include: { permissions: true } }, employee: true }
  });

  const reference = await services.createReference(tenantId, adminUser, {
    code: "OFFLINE-QA-REF",
    name: "Referencia certificacion offline",
    category: "qa",
    description: "Fixture local no productivo",
    estimated_minutes: 30,
    active: true,
    parts: [
      { name: "Componente A", quantity: 1, unit: "und", description: "Checklist QA" },
      { name: "Componente B", quantity: 2, unit: "und", description: "Checklist QA" }
    ],
    metadata: { certification_tag: TAG }
  });

  const base = {
    reference_id: reference.id,
    service_type: "montaje",
    customer_name: "Cliente sintetico offline",
    customer_document: "900000001",
    customer_address: "Direccion sintetica QA",
    customer_phone: "3000000000",
    notes: "Fixture de certificacion offline de solo lectura",
    metadata: { certification_tag: TAG }
  };
  const create = (number, technicianId, days) =>
    services.createOrder(tenantId, adminUser, {
      ...base,
      number,
      technician_id: technicianId,
      scheduled_date: new Date(Date.now() + days * 86400000).toISOString()
    });

  const active = await create("OFF-QA-ACTIVE", primaryUser.employee.id, 0);
  await services.startOrder(tenantId, primaryUser, active.id, {
    latitude: 4.711,
    longitude: -74.0721,
    accuracy_meters: 10
  });
  await create("OFF-QA-FUTURE", primaryUser.employee.id, 3);
  await create("OFF-QA-OTHER-TECH", exclusionUser.employee.id, 2);
  await create("OFF-QA-OUTSIDE", primaryUser.employee.id, 10);

  saveState({
    CERTIFICATION_TAG: TAG,
    TENANT_ID: tenantId,
    ADMIN_EMAIL: registered.user.email,
    ADMIN_PASSWORD: adminPassword,
    TECHNICIAN_USER_ID: primaryUser.id,
    TECHNICIAN_EMPLOYEE_ID: primaryUser.employee.id,
    TECHNICIAN_EMAIL: primaryInput.email,
    TECHNICIAN_PASSWORD: primaryInput.password,
    EXCLUSION_USER_ID: exclusionUser.id,
    EXCLUSION_EMPLOYEE_ID: exclusionUser.employee.id,
    EXCLUSION_EMAIL: exclusionInput.email,
    EXCLUSION_PASSWORD: exclusionInput.password,
    UNAUTHORIZED_USER_ID: unauthorized.id,
    UNAUTHORIZED_EMAIL: unauthorizedInput.email,
    UNAUTHORIZED_PASSWORD: unauthorizedInput.password
  });
  return inspect();
}

async function dryRun() {
  await assertCompatibleSchema();
  const tenant = await exactTenant();
  return {
    mode: "dry-run",
    database: {
      host: "127.0.0.1",
      port: 54320,
      name: EXPECTED_DATABASE
    },
    existingControlledTenant: Boolean(tenant?.config?.source === TAG),
    tenant: {
      name: TENANT_NAME,
      domain: TENANT_DOMAIN,
      purpose: "read_only_offline_certification",
      modules: ["M-22", "M-26"]
    },
    roles: [
      { name: "APEX_ADMIN", reason: "required by authoritative tenant registration", temporary: true },
      { name: "Tecnico", permissions: ["services:read"] },
      { name: "Consulta QA sin offline", permissions: [] }
    ],
    users: [
      { name: "Nyvora Offline QA Admin", role: "APEX_ADMIN", purpose: "authoritative fixture maintenance" },
      { name: "Tecnico QA Offline", role: "Tecnico", allowlisted: true },
      { name: "Tecnico QA Aislamiento", role: "Tecnico", allowlisted: false },
      { name: "Usuario QA No Autorizado", role: "Consulta QA sin offline", allowlisted: false }
    ],
    reference: {
      code: "OFFLINE-QA-REF",
      parts: ["Componente A", "Componente B"]
    },
    orders: [
      { number: "OFF-QA-ACTIVE", technician: "Tecnico QA Offline", status: "en_curso", scheduledDays: 0 },
      { number: "OFF-QA-FUTURE", technician: "Tecnico QA Offline", status: "pendiente", scheduledDays: 3 },
      { number: "OFF-QA-OTHER-TECH", technician: "Tecnico QA Aislamiento", status: "pendiente", scheduledDays: 2 },
      { number: "OFF-QA-OUTSIDE", technician: "Tecnico QA Offline", status: "pendiente", scheduledDays: 10 }
    ],
    activities: "three read-only derived stages per included order",
    checklist: "two reference parts, read-only",
    credentials: "random local values written only to ignored config/offline-phase3-certification.env",
    allowlist: {
      environment: "development",
      tenant: "exact generated tenant id",
      user: "Tecnico QA Offline only",
      roleAllowlist: []
    },
    excluded: ["real PII", "photos", "evidence", "financial data", "client companies", "remote auth"],
    cleanup: "transactional removal after exact tag and tenant-id verification"
  };
}

async function inspect() {
  const tenant = await exactTenant();
  if (!tenant) {
    const schemaCompatible = await prisma.$queryRaw`
      SELECT count(*)::int AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Tenant'
        AND column_name = 'authorization_version'
    `;
    return {
      prepared: false,
      exactTenantMatches: 0,
      schemaCompatible: schemaCompatible[0]?.count === 1
    };
  }
  await assertCompatibleSchema();
  const users = await prisma.user.findMany({
    where: { tenant_id: tenant.id },
    include: { role: { include: { permissions: true } }, employee: true }
  });
  const orders = await prisma.serviceOrder.findMany({
    where: { tenant_id: tenant.id, metadata: { path: ["certification_tag"], equals: TAG } },
    select: {
      number: true,
      status: true,
      scheduled_date: true,
      technician_id: true,
      metadata: true
    },
    orderBy: { number: "asc" }
  });
  const roles = await prisma.role.findMany({
    where: { tenant_id: tenant.id },
    include: { permissions: true }
  });
  const reference = await prisma.serviceReference.findFirst({
    where: { tenant_id: tenant.id, code: "OFFLINE-QA-REF" },
    include: { parts: true }
  });
  const [tenantCount, photoCount, incidentCount, sessions] = await Promise.all([
    prisma.tenant.count(),
    prisma.servicePhoto.count({ where: { tenant_id: tenant.id } }),
    prisma.serviceIncident.count({ where: { tenant_id: tenant.id } }),
    prisma.authorizationSession.findMany({
      where: { user: { tenant_id: tenant.id } },
      select: { user_id: true, revoked_at: true }
    })
  ]);
  const technicians = users.filter(
    (user) =>
      user.active &&
      user.role?.name === "Tecnico" &&
      user.employee?.active &&
      user.employee?.user_type === "tecnico"
  );
  const primary = technicians.find(
    (user) => user.employee.code === "NYV-OFFLINE-QA-01"
  );
  const exclusion = technicians.find(
    (user) => user.employee.code === "NYV-OFFLINE-QA-02"
  );
  const unauthorized = users.find(
    (user) => user.email === "nyvora.offline.unauthorized@internal.apexos.local"
  );
  const adminUser = users.find(
    (user) => user.email === "nyvora.offline.admin@internal.apexos.local"
  );
  const technicianRole = roles.find((role) => role.name === "Tecnico");
  const unauthorizedRole = roles.find(
    (role) => role.name === "Consulta QA sin offline"
  );
  const expectedOrders = new Map([
    ["OFF-QA-ACTIVE", { status: "en_curso", employeeId: primary?.employee?.id }],
    ["OFF-QA-FUTURE", { status: "pendiente", employeeId: primary?.employee?.id }],
    ["OFF-QA-OTHER-TECH", { status: "pendiente", employeeId: exclusion?.employee?.id }],
    ["OFF-QA-OUTSIDE", { status: "pendiente", employeeId: primary?.employee?.id }]
  ]);
  const ordersCompatible =
    orders.length === expectedOrders.size &&
    orders.every((order) => {
      const expected = expectedOrders.get(order.number);
      return (
        expected &&
        order.status === expected.status &&
        order.technician_id === expected.employeeId
      );
    });
  const technicianPermissions =
    technicianRole?.permissions.map(
      (permission) => `${permission.module}:${permission.action}`
    ) || [];
  const tenantMatched =
    tenantCount === 1 &&
    tenant.name === TENANT_NAME &&
    tenant.domain === TENANT_DOMAIN &&
    tenant.active === true &&
    tenant.config?.source === TAG &&
    tenant.config?.purpose === "read_only_offline_certification" &&
    JSON.stringify([...(tenant.active_modules || [])].sort()) ===
      JSON.stringify(["M-22", "M-26"]);
  const state = parseState();
  const stateCompatible =
    state.CERTIFICATION_TAG === TAG &&
    state.TENANT_ID === tenant.id &&
    state.TECHNICIAN_USER_ID === String(primary?.id) &&
    state.EXCLUSION_USER_ID === String(exclusion?.id) &&
    state.UNAUTHORIZED_USER_ID === String(unauthorized?.id);
  const seedCompatible =
    users.length === 4 &&
    Boolean(primary && exclusion && unauthorized && adminUser) &&
    technicianPermissions.length === 1 &&
    technicianPermissions[0] === "services:read" &&
    unauthorizedRole?.permissions.length === 0 &&
    reference?.parts.length === 2 &&
    ordersCompatible &&
    photoCount === 0 &&
    incidentCount === 0 &&
    sessions.filter((session) => !session.revoked_at).length === 1 &&
    sessions.find((session) => !session.revoked_at)?.user_id === adminUser?.id &&
    stateCompatible;
  const schemaCompatible = true;
  return {
    prepared: true,
    schemaCompatible,
    tenantMatched,
    seedCompatible,
    readyForFunctionalCertification:
      schemaCompatible && tenantMatched && seedCompatible,
    environmentId: process.env.APP_ENV || "development",
    tenant: {
      name: tenant.name,
      domain: tenant.domain,
      active: tenant.active,
      modules: tenant.active_modules,
      source: tenant.config?.source
    },
    technicians: technicians.map((user) => ({
      name: user.name,
      email: user.email,
      role: user.role.name,
      servicesPermissions: user.role.permissions.filter((permission) => permission.module === "services"),
      employeeActive: user.employee.active,
      userType: user.employee.user_type,
      code: user.employee.code
    })),
    orders: orders.map((order) => ({
      number: order.number,
      status: order.status,
      scheduledAt: order.scheduled_date,
      technicianCode:
        technicians.find((user) => user.employee.id === order.technician_id)?.employee.code || "unknown"
    })),
    controls: {
      tenants: tenantCount,
      users: users.length,
      roles: roles.length,
      references: reference ? 1 : 0,
      referenceParts: reference?.parts.length || 0,
      photos: photoCount,
      incidents: incidentCount,
      authorizationSessions: sessions.length,
      revokedAuthorizationSessions: sessions.filter((session) => session.revoked_at).length,
      initialSessionOwnedByLocalAdmin:
        sessions.filter((session) => !session.revoked_at).length === 1 &&
        sessions.find((session) => !session.revoked_at)?.user_id === adminUser?.id,
      localStateCompatible: stateCompatible
    }
  };
}

async function cleanup() {
  const state = parseState();
  const tenant = await exactTenant();
  if (!tenant) return { cleaned: false, reason: "NOT_FOUND" };
  if (tenant.config?.source !== TAG || (state.TENANT_ID && state.TENANT_ID !== tenant.id)) {
    throw new Error("El tenant no coincide con el fixture controlado.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "ServiceIncident" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "ServicePhoto" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "ServiceOrder" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`
      DELETE FROM "ServiceReferencePart"
      WHERE reference_id IN (SELECT id FROM "ServiceReference" WHERE tenant_id = ${tenant.id})
    `;
    await tx.$executeRaw`DELETE FROM "ServiceReference" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "AuditLog" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "AuthorizationSession" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "Employee" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "User" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`
      DELETE FROM "Permission"
      WHERE role_id IN (SELECT id FROM "Role" WHERE tenant_id = ${tenant.id})
    `;
    await tx.$executeRaw`DELETE FROM "Role" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "Subscription" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "Account" WHERE tenant_id = ${tenant.id}`;
    await tx.$executeRaw`DELETE FROM "Tenant" WHERE id = ${tenant.id}`;
  });
  fs.rmSync(STATE_PATH, { force: true });
  return { cleaned: true };
}

async function cleanupDryRun() {
  const tenant = await exactTenant();
  if (!tenant) return { mode: "cleanup-dry-run", controlledTenant: false, records: {} };
  if (tenant.config?.source !== TAG) throw new Error("Nyvora no pertenece al fixture controlado.");
  const counts = {};
  for (const table of ["User", "Role", "Employee", "ServiceOrder", "ServiceReference", "AuthorizationSession"]) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int count FROM "${table}" WHERE tenant_id = $1`,
      tenant.id
    );
    counts[table] = rows[0].count;
  }
  return {
    mode: "cleanup-dry-run",
    controlledTenant: true,
    tenant: { name: tenant.name, domain: tenant.domain },
    records: counts,
    localIndexedDb: "cleared by explicit logout/browser cleanup, not by database seed cleanup",
    action: "delete controlled tenant relations transactionally; preserve schema and migrations"
  };
}

const actions = { "dry-run": dryRun, prepare, inspect, "cleanup-dry-run": cleanupDryRun, cleanup };
if (!actions[mode]) throw new Error(`Modo no soportado: ${mode}`);

actions[mode]()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(`[offline-certification] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
