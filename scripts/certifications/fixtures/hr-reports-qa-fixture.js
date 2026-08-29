const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const prisma = require("../../../apps/api/src/core/prisma");

const FIXTURE_TAG = "hr_reports_certification_v1";

function password() {
  return `HrReports-${crypto.randomBytes(12).toString("base64url")}#26`;
}

async function ensureTenant(name, domain) {
  const current = await prisma.tenant.findFirst({ where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { domain }] } });
  const modules = ["dashboard", "hr"];
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
  return role;
}

async function ensureUser(tenantId, roleId, key, name) {
  const temporaryPassword = password();
  const email = `qa.hr.reports.${key}@internal.apexos.local`;
  const user = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenantId, email } },
    update: { name, active: true, role_id: roleId, password: await bcrypt.hash(temporaryPassword, 12), preferences: { source: FIXTURE_TAG } },
    create: { tenant_id: tenantId, name, email, active: true, role_id: roleId, password: await bcrypt.hash(temporaryPassword, 12), preferences: { source: FIXTURE_TAG } }
  });
  return { email, password: temporaryPassword, userId: user.id };
}

async function bootstrapHrReportsFixture() {
  if (String(process.env.CONFIRM_HR_REPORTS_FIXTURE || "").toLowerCase() !== "true") {
    throw new Error("CONFIRM_HR_REPORTS_FIXTURE=true es obligatorio para poblar datos controlados");
  }
  const primary = await ensureTenant("NYVORA", "nyvora.certification.internal");
  const isolation = await ensureTenant("HR REPORTS QA ISOLATION", "hr-reports-isolation.certification.internal");
  const exporterRole = await ensureRole(primary.id, "QA HR Reportes Exportador", [["hr", "read"], ["hr", "export"]]);
  const readonlyRole = await ensureRole(primary.id, "QA HR Reportes Solo Lectura", [["hr", "read"]]);
  const isolationRole = await ensureRole(isolation.id, "QA HR Reportes Aislamiento", [["hr", "read"]]);
  const exporter = await ensureUser(primary.id, exporterRole.id, "exporter", "QA HR Reportes Exportador");
  const readonly = await ensureUser(primary.id, readonlyRole.id, "readonly", "QA HR Reportes Solo Lectura");
  const otherTenant = await ensureUser(isolation.id, isolationRole.id, "isolation", "QA HR Reportes Aislamiento");
  return {
    primaryTenantId: primary.id,
    isolationTenantId: isolation.id,
    credentials: { exporter, readonly, otherTenant }
  };
}

module.exports = { bootstrapHrReportsFixture, FIXTURE_TAG };
