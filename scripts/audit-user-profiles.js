require("./load-env")();

const prisma = require("../apps/api/src/core/prisma");

function normalizeUsernameEmail(value, fallbackDomain = "apex.local") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text.includes("@") ? text : `${text}@${fallbackDomain}`;
}

function roleHasPermission(role, moduleName, action) {
  const permissions = Array.isArray(role?.permissions) ? role.permissions : [];
  return permissions.some((permission) => {
    const permissionModule = String(permission.module || "").toLowerCase();
    const permissionAction = String(permission.action || "").toLowerCase();
    return (permissionModule === "*" || permissionModule === moduleName)
      && (permissionAction === "*" || permissionAction === action);
  });
}

function inferProfileKind(user) {
  const metadata = user.employee?.metadata || {};
  const access = metadata.access || {};
  const operational = metadata.operational || {};
  return String(metadata.profile_kind || access.profile_kind || operational.classification || "").toLowerCase() === "tecnico"
    ? "tecnico"
    : "empleado";
}

async function main() {
  const roles = await prisma.role.findMany({ include: { permissions: true } });
  const tecnicoRole = roles.find((role) => role.name === "Tecnico");
  const empleadoRole = roles.find((role) => role.name === "Empleado");
  if (!tecnicoRole || !empleadoRole) throw new Error("No se encontraron roles base Tecnico/Empleado.");

  const users = await prisma.user.findMany({ include: { role: { include: { permissions: true } }, employee: true }, orderBy: { id: "asc" } });
  const report = { scanned: users.length, fixed: 0, users: [] };

  for (const user of users) {
    if (!user.employee) continue;
    const profileKind = inferProfileKind(user);
    const metadata = user.employee.metadata || {};
    const access = metadata.access || {};
    const employment = metadata.employment || {};
    const operational = metadata.operational || {};
    const changes = [];
    const userData = {};
    const employeeData = { metadata: { ...metadata } };

    if (profileKind === "tecnico" && !roleHasPermission(user.role, "services", "read")) {
      userData.role_id = tecnicoRole.id;
      changes.push(`role:${user.role?.name || ""}->Tecnico`);
    }
    if (profileKind === "empleado" && !roleHasPermission(user.role, "hr", "read") && !roleHasPermission(user.role, "admin", "read")) {
      userData.role_id = empleadoRole.id;
      changes.push(`role:${user.role?.name || ""}->Empleado`);
    }

    const normalizedEmail = normalizeUsernameEmail(user.email || access.email || metadata.name || user.name);
    if (normalizedEmail && normalizedEmail !== user.email) {
      userData.email = normalizedEmail;
      changes.push(`email:${user.email}->${normalizedEmail}`);
    }

    const nextAccess = {
      ...access,
      email: normalizeUsernameEmail(access.email || userData.email || user.email),
      profile_kind: profileKind,
      session_status: access.session_status || "sin_sesion",
      operational_profile: access.operational_profile || profileKind,
      site: access.site || (profileKind === "tecnico" ? (operational.base_site || "SEDE-PRINCIPAL") : access.site || ""),
      area: access.area || (profileKind === "tecnico" ? "SERV" : (user.employee.department || "OPER"))
    };
    const nextEmployment = {
      ...employment,
      engagement_type: employment.engagement_type || (profileKind === "tecnico" ? "contratista" : "empleado"),
      contract_type: employment.contract_type || (profileKind === "tecnico" ? "service" : "indefinite")
    };
    const nextOperational = {
      ...operational,
      classification: profileKind === "tecnico" ? "tecnico" : (operational.classification || "administrativo"),
      can_receive_services: profileKind === "tecnico" ? true : Boolean(operational.can_receive_services),
      base_site: operational.base_site || (profileKind === "tecnico" ? "SEDE-PRINCIPAL" : "")
    };

    if (JSON.stringify(nextAccess) !== JSON.stringify(access)
      || JSON.stringify(nextEmployment) !== JSON.stringify(employment)
      || JSON.stringify(nextOperational) !== JSON.stringify(operational)
      || metadata.profile_kind !== profileKind) {
      employeeData.metadata = {
        ...metadata,
        profile_kind: profileKind,
        access: nextAccess,
        employment: nextEmployment,
        operational: nextOperational,
        user_audit_trail: [
          ...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9),
          { at: new Date().toISOString(), action: "audited_profile_repair", module: "administracion" }
        ]
      };
      changes.push("metadata:normalized");
    }

    if (!changes.length) continue;
    if (Object.keys(userData).length) await prisma.user.update({ where: { id: user.id }, data: userData });
    await prisma.employee.update({ where: { id: user.employee.id }, data: employeeData });
    report.fixed += 1;
    report.users.push({ id: user.id, email: user.email, profile_kind: profileKind, changes });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  try {
    await prisma.$disconnect();
  } catch {}
});
