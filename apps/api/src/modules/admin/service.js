const bcrypt = require("bcrypt");
const prisma = require("../../core/prisma");
const { assertPasswordPolicy } = require("../../security/policy");

const PERMISSION_CATALOG = [
  { key: "dashboard", label: "Dashboard", actions: ["access", "view"], grants: { access: [["brain", "read"]], view: [["brain", "read"]] } },
  { key: "personal", label: "Personal / Usuarios", actions: ["access", "view", "create", "edit"], grants: { access: [["hr", "read"], ["admin", "read"]], view: [["hr", "read"], ["admin", "read"]], create: [["hr", "write"], ["admin", "write"]], edit: [["hr", "write"], ["admin", "write"]] } },
  { key: "roles", label: "Roles y perfiles", actions: ["access", "view", "create", "edit"], grants: { access: [["admin", "read"]], view: [["admin", "read"]], create: [["admin", "write"]], edit: [["admin", "write"]] } },
  { key: "servicios", label: "Servicios", actions: ["access", "view", "create", "edit", "export"], grants: { access: [["services", "read"]], view: [["services", "read"]], create: [["services", "write"]], edit: [["services", "write"]], export: [["services", "export"]] } },
  { key: "horarios", label: "Horarios y marcaciones", actions: ["access", "view", "create", "edit", "approve"], grants: { access: [["hr", "read"]], view: [["hr", "read"]], create: [["hr", "write"]], edit: [["hr", "write"]], approve: [["hr", "approve"]] } },
  { key: "vehiculos", label: "Vehiculos", actions: ["access", "view", "create", "edit"], grants: { access: [["transport", "read"]], view: [["transport", "read"]], create: [["transport", "write"]], edit: [["transport", "write"]] } },
  { key: "referencias", label: "Referencias", actions: ["access", "view", "create", "edit"], grants: { access: [["services", "read"]], view: [["services", "read"]], create: [["services", "write"]], edit: [["services", "write"]] } },
  { key: "reportes", label: "Reportes", actions: ["access", "view", "export"], grants: { access: [["admin", "read"]], view: [["admin", "read"]], export: [["admin", "export"]] } },
  { key: "configuracion", label: "Configuracion", actions: ["access", "view", "create", "edit"], grants: { access: [["admin", "read"]], view: [["admin", "read"]], create: [["admin", "write"]], edit: [["admin", "write"]] } },
  { key: "nomina", label: "Nomina", actions: ["access", "view", "create", "edit", "export"], grants: { access: [["payroll", "read"], ["hr", "read"]], view: [["payroll", "read"], ["hr", "read"]], create: [["payroll", "write"], ["hr", "write"]], edit: [["payroll", "write"], ["hr", "write"]], export: [["payroll", "export"]] } }
];

const SYSTEM_ROLE_TEMPLATES = [
  { name: "Tecnico", description: "Ejecuta servicios, consulta referencias y registra trabajo de campo.", is_system: true, legacy_permissions: { dashboard: { access: true, view: true }, servicios: { access: true, view: true, edit: true, export: true }, horarios: { access: true, view: true, create: true, edit: true }, vehiculos: { access: true, view: true }, referencias: { access: true, view: true } } },
  { name: "Empleado", description: "Consulta operativa y registro de jornada.", is_system: true, legacy_permissions: { dashboard: { access: true, view: true }, horarios: { access: true, view: true, create: true }, vehiculos: { access: true, view: true } } },
  { name: "Coordinador", description: "Gestiona operacion, catalogos, reportes, configuracion y nomina sin ser superadmin.", is_system: true, legacy_permissions: { dashboard: { access: true, view: true }, personal: { access: true, view: true, create: true, edit: true }, servicios: { access: true, view: true, create: true, edit: true, export: true }, horarios: { access: true, view: true, create: true, edit: true, approve: true }, vehiculos: { access: true, view: true, create: true, edit: true }, referencias: { access: true, view: true, create: true, edit: true }, reportes: { access: true, view: true, export: true }, configuracion: { access: true, view: true, create: true, edit: true }, nomina: { access: true, view: true, create: true, edit: true, export: true } } }
];

function emptyLegacyPermissions() {
  return Object.fromEntries(PERMISSION_CATALOG.map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, false]))
  ]));
}

function normalizeLegacyPermissions(raw) {
  const base = emptyLegacyPermissions();
  if (!raw || typeof raw !== "object") return base;
  for (const item of PERMISSION_CATALOG) {
    for (const action of item.actions) {
      base[item.key][action] = Boolean(raw[item.key]?.[action]);
    }
  }
  return base;
}

function legacyToRbacPermissions(raw) {
  const legacy = normalizeLegacyPermissions(raw);
  const grants = new Map();
  for (const item of PERMISSION_CATALOG) {
    for (const action of item.actions) {
      if (!legacy[item.key][action]) continue;
      for (const [module, mappedAction] of item.grants[action] || []) {
        grants.set(`${module}:${mappedAction}`, { module, action: mappedAction });
      }
    }
  }
  return Array.from(grants.values());
}

function permissionsToLegacy(role) {
  if (role.name === "APEX_ADMIN" || role.permissions?.some((p) => p.module === "*" && p.action === "*")) {
    return Object.fromEntries(PERMISSION_CATALOG.map((item) => [
      item.key,
      Object.fromEntries(item.actions.map((action) => [action, true]))
    ]));
  }
  return normalizeLegacyPermissions(role.metadata?.legacy_permissions || {});
}

function roleDto(role) {
  return {
    id: role.id,
    name: role.name,
    nombre: role.name,
    description: role.description || "",
    descripcion: role.description || "",
    active: role.metadata?.active !== false,
    activo: role.metadata?.active !== false,
    is_system: role.is_system,
    es_sistema: role.is_system,
    permissions: permissionsToLegacy(role),
    raw_permissions: role.permissions || []
  };
}

function userDto(user) {
  const employee = user.employee;
  return {
    id: user.id,
    name: user.name,
    nombre: user.name,
    email: user.email,
    username: user.email,
    role_id: user.role_id,
    role_name: user.role?.name || "",
    role_nombre: user.role?.name || "",
    active: user.active,
    activo: user.active,
    employee_id: employee?.id || null,
    code: employee?.code || "",
    id_interno: employee?.code || "",
    document: employee?.metadata?.document || "",
    documento: employee?.metadata?.document || "",
    company: employee?.metadata?.company || "",
    empresa: employee?.metadata?.company || "",
    position: employee?.position || "",
    department: employee?.department || "",
    salary_base: employee?.salary_base || 0,
    salario_base: employee?.salary_base || 0,
    labor_status: employee?.metadata?.labor_status || "activo",
    estado_laboral: employee?.metadata?.labor_status || "activo"
  };
}

function toBoolean(value) {
  if (typeof value === "string") return value === "true" || value === "1";
  return Boolean(value);
}

async function upsertRoleFromLegacy(tenantId, data) {
  const legacyPermissions = normalizeLegacyPermissions(data.permissions || data.legacy_permissions || {});
  const rbacPermissions = legacyToRbacPermissions(legacyPermissions);
  const roleData = {
    tenant_id: tenantId,
    name: data.name || data.nombre,
    description: data.description || data.descripcion || "",
    is_system: Boolean(data.is_system),
    metadata: { active: data.active !== false && data.activo !== false, legacy_permissions: legacyPermissions },
    permissions: { create: rbacPermissions }
  };

  return prisma.role.create({ data: roleData, include: { permissions: true } });
}

async function ensureSystemRoles(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    for (const template of SYSTEM_ROLE_TEMPLATES) {
      const current = await prisma.role.findUnique({ where: { tenant_id_name: { tenant_id: tenantId, name: template.name } } });
      if (current) continue;
      await upsertRoleFromLegacy(tenantId, template);
    }
  });
}

async function exportTenantData(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const [parties, items, transactions, employees, movements] = await Promise.all([
      prisma.party.findMany(),
      prisma.item.findMany(),
      prisma.transaction.findMany({ include: { lines: true } }),
      prisma.employee.findMany(),
      prisma.movement.findMany()
    ]);

    return {
      exported_at: new Date().toISOString(),
      tenant_id: tenantId,
      parties,
      items,
      transactions,
      employees,
      movements
    };
  });
}

async function processBilling() {
  return { processed: true };
}

async function getPermissionCatalog() {
  return PERMISSION_CATALOG.map(({ key, label, actions }) => ({ key, label, actions }));
}

async function listRoles(tenantId) {
  await ensureSystemRoles(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const roles = await prisma.role.findMany({ include: { permissions: true }, orderBy: [{ is_system: "desc" }, { name: "asc" }] });
    return roles.map(roleDto);
  });
}

async function createRole(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const role = await upsertRoleFromLegacy(tenantId, { ...input, is_system: false });
    return roleDto(role);
  });
}

async function updateRole(tenantId, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.role.findFirstOrThrow({ where: { id: Number(id) } });
    if (current.name === "APEX_ADMIN") {
      const role = await prisma.role.update({
        where: { id: current.id },
        data: {
          description: input.description || input.descripcion || current.description,
          metadata: { ...(current.metadata || {}), active: true }
        },
        include: { permissions: true }
      });
      return roleDto(role);
    }
    const legacyPermissions = normalizeLegacyPermissions(input.permissions || {});
    const rbacPermissions = legacyToRbacPermissions(legacyPermissions);
    await prisma.permission.deleteMany({ where: { role_id: current.id } });
    const role = await prisma.role.update({
      where: { id: current.id },
      data: {
        name: current.is_system ? current.name : (input.name || input.nombre || current.name),
        description: input.description || input.descripcion || "",
        metadata: { active: input.active !== false && input.activo !== false, legacy_permissions: legacyPermissions },
        permissions: { create: rbacPermissions }
      },
      include: { permissions: true }
    });
    return roleDto(role);
  });
}

async function setRoleActive(tenantId, id, active) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.role.findFirstOrThrow({ where: { id: Number(id) }, include: { permissions: true } });
    if (current.name === "APEX_ADMIN") return roleDto(current);
    const role = await prisma.role.update({
      where: { id: current.id },
      data: { metadata: { ...(current.metadata || {}), active: toBoolean(active) } },
      include: { permissions: true }
    });
    return roleDto(role);
  });
}

async function listUsers(tenantId) {
  await ensureSystemRoles(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const users = await prisma.user.findMany({
      include: { role: true, employee: true },
      orderBy: { name: "asc" }
    });
    return users.map(userDto);
  });
}

async function createUser(tenantId, input) {
  await ensureSystemRoles(tenantId);
  const rawPassword = input.password || input.pas || "";
  assertPasswordPolicy(rawPassword);
  const password = await bcrypt.hash(rawPassword, 12);
  return prisma.runWithTenant(tenantId, async () => {
    const role = input.role_id
      ? await prisma.role.findFirstOrThrow({ where: { id: Number(input.role_id) } })
      : await prisma.role.findFirst({ where: { name: "Empleado" } });
    if (role?.metadata?.active === false) {
      const err = new Error("El rol seleccionado esta inactivo");
      err.statusCode = 400;
      throw err;
    }
    const user = await prisma.user.create({
      data: {
        tenant_id: tenantId,
        name: input.name || input.nombre,
        email: (input.email || input.username || input.user).toLowerCase(),
        password,
        role_id: role?.id || null,
        employee: {
          create: {
            tenant_id: tenantId,
            code: input.code || input.id_interno || `EMP-${Date.now()}`,
            position: input.position || input.rol || "empleado",
            department: input.department || "Operacion",
            salary_base: Number(input.salary_base || input.salario_base || input.salario || 0),
            salary_type: input.salary_type || "monthly",
            hire_date: input.hire_date ? new Date(input.hire_date) : new Date(),
            contract_type: input.contract_type || "indefinite",
            active: input.active !== false && input.activo !== false,
            metadata: {
              name: input.name || input.nombre,
              document: input.document || input.documento || input.doc || "",
              company: input.company || input.empresa || "APEX",
              labor_status: input.labor_status || input.estado_laboral || "activo",
              legacy: { migrated_from: "APEX", module: "personal" }
            }
          }
        }
      },
      include: { role: true, employee: true }
    });
    return userDto(user);
  });
}

async function updateUser(tenantId, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { employee: true } });
    const data = {
      name: input.name || input.nombre || current.name,
      email: (input.email || input.username || current.email).toLowerCase(),
      role_id: input.role_id ? Number(input.role_id) : current.role_id,
      active: input.active !== false && input.activo !== false
    };
    if (input.password || input.pas) {
      assertPasswordPolicy(input.password || input.pas);
      data.password = await bcrypt.hash(input.password || input.pas, 12);
    }
    await prisma.user.update({ where: { id: current.id }, data });
    const employeeData = {
      code: input.code || input.id_interno || current.employee?.code || `EMP-${current.id}`,
      position: input.position || current.employee?.position || "empleado",
      department: input.department || current.employee?.department || "Operacion",
      salary_base: Number(input.salary_base || input.salario_base || current.employee?.salary_base || 0),
      active: data.active,
      metadata: {
        ...(current.employee?.metadata || {}),
        name: data.name,
        document: input.document || input.documento || current.employee?.metadata?.document || "",
        company: input.company || input.empresa || current.employee?.metadata?.company || "APEX",
        labor_status: input.labor_status || input.estado_laboral || current.employee?.metadata?.labor_status || "activo"
      }
    };
    if (current.employee) {
      await prisma.employee.update({ where: { id: current.employee.id }, data: employeeData });
    } else {
      await prisma.employee.create({ data: { ...employeeData, tenant_id: tenantId, user_id: current.id, salary_type: "monthly", hire_date: new Date(), contract_type: "indefinite" } });
    }
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id }, include: { role: true, employee: true } });
    return userDto(user);
  });
}

async function setUserActive(tenantId, id, active) {
  return prisma.runWithTenant(tenantId, async () => {
    const enabled = toBoolean(active);
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { employee: true } });
    await prisma.user.update({
      where: { id: Number(id) },
      data: { active: enabled }
    });
    if (current.employee) {
      await prisma.employee.update({
        where: { id: current.employee.id },
        data: {
          active: enabled,
          metadata: { ...(current.employee.metadata || {}), labor_status: enabled ? "activo" : "inactivo" }
        }
      });
    }
    const user = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { role: true, employee: true } });
    return userDto(user);
  });
}

module.exports = {
  exportTenantData,
  processBilling,
  getPermissionCatalog,
  listRoles,
  createRole,
  updateRole,
  setRoleActive,
  listUsers,
  createUser,
  updateUser,
  setUserActive
};

