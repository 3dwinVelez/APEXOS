const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const prisma = require("../../../src/core/prisma");

const FIXTURE_TAG = "nyvora_service_correction_certification_v1";

function password() {
  return `Nyvora-${crypto.randomBytes(12).toString("base64url")}#26`;
}

async function ensureTenant(name, domain) {
  const current = await prisma.tenant.findFirst({ where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { domain }] } });
  const modules = ["dashboard", "services", "servicios", "hr", "inventory", "accounting", "admin", "usuarios", "roles"];
  if (current) {
    return prisma.tenant.update({
      where: { id: current.id },
      data: { active: true, active_modules: Array.from(new Set([...(Array.isArray(current.active_modules) ? current.active_modules : []), ...modules])) }
    });
  }
  return prisma.tenant.create({ data: { name, domain, industry: "certification", plan: "internal-qa", active_modules: modules, config: { source: FIXTURE_TAG } } });
}

async function ensureRole(tenantId, name, permissions) {
  const role = await prisma.role.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name } },
    update: { description: `Rol controlado ${FIXTURE_TAG}`, metadata: { source: FIXTURE_TAG } },
    create: { tenant_id: tenantId, name, description: `Rol controlado ${FIXTURE_TAG}`, metadata: { source: FIXTURE_TAG } }
  });
  await prisma.permission.deleteMany({ where: { role_id: role.id } });
  await prisma.permission.createMany({ data: permissions.map(([module, action]) => ({ role_id: role.id, module, action })), skipDuplicates: true });
  return prisma.role.findUnique({ where: { id: role.id }, include: { permissions: true } });
}

async function ensureUser(tenantId, role, key, name) {
  const temporaryPassword = password();
  const email = `nyvora.qa.${key}@internal.apexos.local`;
  const user = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenantId, email } },
    update: { name, active: true, role_id: role.id, password: await bcrypt.hash(temporaryPassword, 12), preferences: { source: FIXTURE_TAG } },
    create: { tenant_id: tenantId, name, email, active: true, role_id: role.id, password: await bcrypt.hash(temporaryPassword, 12), preferences: { source: FIXTURE_TAG } }
  });
  return { user, email, password: temporaryPassword };
}

async function bootstrapNyvoraFixture() {
  if (String(process.env.CONFIRM_NYVORA_FIXTURE || "").toLowerCase() !== "true") {
    throw new Error("CONFIRM_NYVORA_FIXTURE=true es obligatorio para poblar datos controlados");
  }
  const nyvora = await ensureTenant("NYVORA", "nyvora.certification.internal");
  const isolation = await ensureTenant("NYVORA QA ISOLATION CONTROL", "nyvora-isolation.certification.internal");
  const authorizedPermissions = [
    ["services", "read"],
    ["services", "write"],
    ["services.orders", "edit_any_state"],
    ["hr", "read"],
    ["inventory", "read"],
    ["accounting", "read"]
  ];
  const limitedPermissions = [["services", "read"], ["services", "write"]];
  const authorizedRole = await ensureRole(nyvora.id, "NYVORA QA Correcciones Autorizado", authorizedPermissions);
  const limitedRole = await ensureRole(nyvora.id, "NYVORA QA Correcciones Limitado", limitedPermissions);
  const technicianRole = await ensureRole(nyvora.id, "Tecnico", [["services", "read"], ["services", "write"]]);
  const isolationRole = await ensureRole(isolation.id, "NYVORA QA Aislamiento Autorizado", authorizedPermissions);
  const authorized = await ensureUser(nyvora.id, authorizedRole, "correction.authorized", "NYVORA Certificacion Correcciones");
  const limited = await ensureUser(nyvora.id, limitedRole, "correction.limited", "NYVORA Control Permiso Limitado");
  const technician = await ensureUser(nyvora.id, technicianRole, "correction.technician", "NYVORA Tecnico Certificacion");
  const otherTenant = await ensureUser(isolation.id, isolationRole, "correction.isolation", "NYVORA Control Aislamiento");
  await prisma.employee.upsert({
    where: { user_id: technician.user.id },
    update: { tenant_id: nyvora.id, code: "NYV-QA-CORR-TEC", user_type: "tecnico", position: "Tecnico certificacion", department: "Servicios", active: true, metadata: { source: FIXTURE_TAG } },
    create: { tenant_id: nyvora.id, user_id: technician.user.id, code: "NYV-QA-CORR-TEC", user_type: "tecnico", position: "Tecnico certificacion", department: "Servicios", salary_base: 1, hire_date: new Date(), active: true, metadata: { source: FIXTURE_TAG } }
  });
  const reference = await prisma.serviceReference.upsert({
    where: { tenant_id_code: { tenant_id: nyvora.id, code: "NYV-QA-EVIDENCE" } },
    update: { name: "NYVORA Evidencia Administrativa Certificable", category: "CERTIFICACION", description: "Referencia visible para certificar intervenciones administrativas", active: true, metadata: { source: FIXTURE_TAG } },
    create: { tenant_id: nyvora.id, code: "NYV-QA-EVIDENCE", name: "NYVORA Evidencia Administrativa Certificable", category: "CERTIFICACION", description: "Referencia visible para certificar intervenciones administrativas", active: true, metadata: { source: FIXTURE_TAG } }
  });
  return {
    tenant: { id: nyvora.id, name: nyvora.name },
    isolationTenant: { id: isolation.id, name: isolation.name },
    reference: { id: reference.id, code: reference.code, name: reference.name },
    credentials: { authorized: [authorized.email, authorized.password], limited: [limited.email, limited.password], otherTenant: [otherTenant.email, otherTenant.password] },
    visibleUsers: [authorized, limited, technician, otherTenant].map(({ user, email }) => ({ id: user.id, name: user.name, email, tenant_id: user.tenant_id }))
  };
}

module.exports = { bootstrapNyvoraFixture, FIXTURE_TAG };
