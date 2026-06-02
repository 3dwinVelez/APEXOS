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
  { key: "proyectos", label: "Proyectos", actions: ["access", "view", "create", "edit"], grants: { access: [["projects", "read"]], view: [["projects", "read"]], create: [["projects", "write"]], edit: [["projects", "write"]] } },
  { key: "contabilidad", label: "Contabilidad", actions: ["access", "view", "create", "edit", "export", "approve"], grants: { access: [["accounting", "read"]], view: [["accounting", "read"]], create: [["accounting", "write"]], edit: [["accounting", "write"]], export: [["accounting", "read"]], approve: [["accounting", "write"]] } },
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
  const metadata = employee?.metadata || {};
  const access = metadata.access || {};
  const employment = metadata.employment || {};
  const operational = metadata.operational || {};
  const documents = Array.isArray(metadata.documents) ? metadata.documents : [];
  const auditTrail = Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : [];
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
    estado_laboral: employee?.metadata?.labor_status || "activo",
    first_names: metadata.first_names || user.name?.split(" ").slice(0, -1).join(" ") || user.name || "",
    last_names: metadata.last_names || user.name?.split(" ").slice(-1).join(" ") || "",
    document_type: metadata.document_type || "CC",
    document_issue_date: metadata.document_issue_date || "",
    document_issue_place: metadata.document_issue_place || "",
    birth_date: metadata.birth_date || "",
    gender: metadata.gender || "",
    phone: metadata.phone || "",
    address: metadata.address || "",
    city: metadata.city || "",
    state_region: metadata.state_region || "",
    country: metadata.country || "Colombia",
    user_status: metadata.user_status || (user.active ? "activo" : "inactivo"),
    access_email: access.email || user.email,
    additional_roles: access.additional_roles || "",
    operational_profile: access.operational_profile || "",
    site: access.site || "",
    area: access.area || employee?.department || "",
    manager: access.manager || "",
    special_permissions: access.special_permissions || "",
    require_password_change: Boolean(access.require_password_change),
    mfa_status: access.mfa_status || "futuro",
    last_access: user.last_login ? user.last_login.toISOString() : "",
    session_status: access.session_status || "sin_sesion",
    engagement_type: employment.engagement_type || "empleado",
    hire_date: employee?.hire_date ? employee.hire_date.toISOString().slice(0, 10) : "",
    end_date: employee?.end_date ? employee.end_date.toISOString().slice(0, 10) : "",
    contract_type: employee?.contract_type || employment.contract_type || "indefinite",
    cost_center: employment.cost_center || "",
    workday: employment.workday || "",
    daily_hours: employment.daily_hours || 8,
    base_shift: employment.base_shift || "",
    transport_allowance: employment.transport_allowance || "",
    eps_party_id: employment.eps_party_id || "",
    pension_party_id: employment.pension_party_id || "",
    arl_party_id: employment.arl_party_id || "",
    arl_risk_percent: employment.arl_risk_percent || "",
    arl_risk: employment.arl_risk || "",
    eps: employment.eps || "",
    pension_fund: employment.pension_fund || "",
    compensation_fund: employment.compensation_fund || "",
    bank: employment.bank || "",
    bank_account_type: employment.bank_account_type || "",
    bank_account_number: employment.bank_account_number || "",
    labor_notes: employment.labor_notes || "",
    operational_classification: operational.classification || "administrativo",
    can_punch_time: Boolean(operational.can_punch_time),
    can_receive_services: Boolean(operational.can_receive_services),
    can_be_assigned_routes: Boolean(operational.can_be_assigned_routes),
    can_manage_inventory: Boolean(operational.can_manage_inventory),
    can_approve_documents: Boolean(operational.can_approve_documents),
    can_authorize_exceptions: Boolean(operational.can_authorize_exceptions),
    driver_license: operational.driver_license || "",
    license_category: operational.license_category || "",
    license_expires_at: operational.license_expires_at || "",
    operational_restrictions: operational.restrictions || "",
    base_site: operational.base_site || "",
    operation_zone: operational.zone || "",
    documents,
    user_audit_trail: auditTrail
  };
}

function toBoolean(value) {
  if (typeof value === "string") return value === "true" || value === "1";
  return Boolean(value);
}

function userAuditSnapshot(user, employee) {
  return {
    user_id: user?.id,
    name: user?.name,
    email: user?.email,
    role_id: user?.role_id,
    active: user?.active,
    employee_id: employee?.id || null,
    code: employee?.code || "",
    position: employee?.position || "",
    department: employee?.department || "",
    metadata: employee?.metadata || {}
  };
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

async function createUser(tenantId, input, actorId = null) {
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
    const fullName = input.name || input.nombre || `${input.first_names || ""} ${input.last_names || ""}`.trim();
    const userStatus = input.user_status || input.labor_status || input.estado_laboral || "activo";
    const active = !["inactivo", "suspendido", "retirado"].includes(userStatus) && input.active !== false && input.activo !== false;
    const metadata = {
      name: fullName,
      first_names: input.first_names || "",
      last_names: input.last_names || "",
      document_type: input.document_type || "CC",
      document: input.document || input.documento || input.doc || "",
      document_issue_date: input.document_issue_date || "",
      document_issue_place: input.document_issue_place || "",
      birth_date: input.birth_date || "",
      gender: input.gender || "",
      phone: input.phone || "",
      address: input.address || "",
      city: input.city || "",
      state_region: input.state_region || "",
      country: input.country || "Colombia",
      company: input.company || input.empresa || "APEX",
      labor_status: userStatus,
      user_status: userStatus,
      access: {
        email: input.access_email || input.email || input.username || input.user,
        additional_roles: input.additional_roles || "",
        operational_profile: input.operational_profile || "",
        site: input.site || "",
        area: input.area || input.department || "",
        manager: input.manager || "",
        special_permissions: input.special_permissions || "",
        require_password_change: toBoolean(input.require_password_change),
        mfa_status: input.mfa_status || "futuro",
        session_status: input.session_status || "sin_sesion"
      },
      employment: {
        engagement_type: input.engagement_type || "empleado",
        contract_type: input.contract_type || "indefinite",
        cost_center: input.cost_center || "",
        workday: input.workday || "",
        daily_hours: Number(input.daily_hours || 8),
        base_shift: input.base_shift || "",
        transport_allowance: Number(input.transport_allowance || 0),
        eps_party_id: input.eps_party_id ? Number(input.eps_party_id) : null,
        pension_party_id: input.pension_party_id ? Number(input.pension_party_id) : null,
        arl_party_id: input.arl_party_id ? Number(input.arl_party_id) : null,
        arl_risk_percent: Number(input.arl_risk_percent || 0),
        arl_risk: input.arl_risk || "",
        eps: input.eps || "",
        pension_fund: input.pension_fund || "",
        compensation_fund: input.compensation_fund || "",
        bank: input.bank || "",
        bank_account_type: input.bank_account_type || "",
        bank_account_number: input.bank_account_number || "",
        labor_notes: input.labor_notes || ""
      },
      operational: {
        classification: input.operational_classification || "administrativo",
        can_punch_time: toBoolean(input.can_punch_time),
        can_receive_services: toBoolean(input.can_receive_services),
        can_be_assigned_routes: toBoolean(input.can_be_assigned_routes),
        can_manage_inventory: toBoolean(input.can_manage_inventory),
        can_approve_documents: toBoolean(input.can_approve_documents),
        can_authorize_exceptions: toBoolean(input.can_authorize_exceptions),
        driver_license: input.driver_license || "",
        license_category: input.license_category || "",
        license_expires_at: input.license_expires_at || "",
        restrictions: input.operational_restrictions || "",
        base_site: input.base_site || "",
        zone: input.operation_zone || ""
      },
      documents: Array.isArray(input.documents) ? input.documents : [],
      user_audit_trail: [{ at: new Date().toISOString(), action: "created", module: "administracion" }],
      legacy: { migrated_from: "APEX", module: "personal" }
    };
    const user = await prisma.user.create({
      data: {
        tenant_id: tenantId,
        name: fullName,
        email: (input.email || input.username || input.user).toLowerCase(),
        password,
        role_id: role?.id || null,
        active,
        employee: {
          create: {
            tenant_id: tenantId,
            code: input.code || input.id_interno || `EMP-${Date.now()}`,
            position: input.position || input.rol || "empleado",
            department: input.department || "Operacion",
            salary_base: Number(input.salary_base || input.salario_base || input.salario || 0),
            salary_type: input.salary_type || "monthly",
            hire_date: input.hire_date ? new Date(input.hire_date) : new Date(),
            end_date: input.end_date ? new Date(input.end_date) : null,
            contract_type: input.contract_type || "indefinite",
            active,
            metadata
          }
        }
      },
      include: { role: true, employee: true }
    });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "created",
        module: "admin",
        entity: "/api/v1/admin/users",
        entity_id: String(user.id),
        old_value: null,
        new_value: userAuditSnapshot(user, user.employee)
      }
    });
    return userDto(user);
  });
}

async function updateUser(tenantId, id, input, actorId = null) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { employee: true } });
    const previousSnapshot = userAuditSnapshot(current, current.employee);
    const previousMetadata = current.employee?.metadata || {};
    const previousAccess = previousMetadata.access || {};
    const previousEmployment = previousMetadata.employment || {};
    const previousOperational = previousMetadata.operational || {};
    const userStatus = input.user_status || input.labor_status || input.estado_laboral || previousMetadata.user_status || previousMetadata.labor_status || "activo";
    const active = !["inactivo", "suspendido", "retirado"].includes(userStatus) && input.active !== false && input.activo !== false;
    const fullName = input.name || input.nombre || `${input.first_names || previousMetadata.first_names || ""} ${input.last_names || previousMetadata.last_names || ""}`.trim() || current.name;
    const data = {
      name: fullName,
      email: (input.email || input.username || current.email).toLowerCase(),
      role_id: input.role_id ? Number(input.role_id) : current.role_id,
      active
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
      contract_type: input.contract_type || current.employee?.contract_type || "indefinite",
      hire_date: input.hire_date ? new Date(input.hire_date) : current.employee?.hire_date || new Date(),
      end_date: input.end_date ? new Date(input.end_date) : null,
      active,
      metadata: {
        ...previousMetadata,
        name: data.name,
        first_names: input.first_names || previousMetadata.first_names || "",
        last_names: input.last_names || previousMetadata.last_names || "",
        document_type: input.document_type || previousMetadata.document_type || "CC",
        document: input.document || input.documento || current.employee?.metadata?.document || "",
        document_issue_date: input.document_issue_date || previousMetadata.document_issue_date || "",
        document_issue_place: input.document_issue_place || previousMetadata.document_issue_place || "",
        birth_date: input.birth_date || previousMetadata.birth_date || "",
        gender: input.gender || previousMetadata.gender || "",
        phone: input.phone || previousMetadata.phone || "",
        address: input.address || previousMetadata.address || "",
        city: input.city || previousMetadata.city || "",
        state_region: input.state_region || previousMetadata.state_region || "",
        country: input.country || previousMetadata.country || "Colombia",
        company: input.company || input.empresa || current.employee?.metadata?.company || "APEX",
        labor_status: userStatus,
        user_status: userStatus,
        access: {
          ...previousAccess,
          email: input.access_email || input.email || previousAccess.email || data.email,
          additional_roles: input.additional_roles || previousAccess.additional_roles || "",
          operational_profile: input.operational_profile || previousAccess.operational_profile || "",
          site: input.site || previousAccess.site || "",
          area: input.area || input.department || previousAccess.area || "",
          manager: input.manager || previousAccess.manager || "",
          special_permissions: input.special_permissions || previousAccess.special_permissions || "",
          require_password_change: input.require_password_change === undefined ? Boolean(previousAccess.require_password_change) : toBoolean(input.require_password_change),
          mfa_status: input.mfa_status || previousAccess.mfa_status || "futuro",
          session_status: input.session_status || previousAccess.session_status || "sin_sesion"
        },
        employment: {
          ...previousEmployment,
          engagement_type: input.engagement_type || previousEmployment.engagement_type || "empleado",
          contract_type: input.contract_type || previousEmployment.contract_type || "indefinite",
          cost_center: input.cost_center || previousEmployment.cost_center || "",
          workday: input.workday || previousEmployment.workday || "",
          daily_hours: input.daily_hours === undefined ? (previousEmployment.daily_hours || 8) : Number(input.daily_hours || 8),
          base_shift: input.base_shift || previousEmployment.base_shift || "",
          transport_allowance: input.transport_allowance === undefined ? (previousEmployment.transport_allowance || 0) : Number(input.transport_allowance || 0),
          eps_party_id: input.eps_party_id === undefined ? (previousEmployment.eps_party_id || null) : (input.eps_party_id ? Number(input.eps_party_id) : null),
          pension_party_id: input.pension_party_id === undefined ? (previousEmployment.pension_party_id || null) : (input.pension_party_id ? Number(input.pension_party_id) : null),
          arl_party_id: input.arl_party_id === undefined ? (previousEmployment.arl_party_id || null) : (input.arl_party_id ? Number(input.arl_party_id) : null),
          arl_risk_percent: input.arl_risk_percent === undefined ? (previousEmployment.arl_risk_percent || 0) : Number(input.arl_risk_percent || 0),
          arl_risk: input.arl_risk || previousEmployment.arl_risk || "",
          eps: input.eps || previousEmployment.eps || "",
          pension_fund: input.pension_fund || previousEmployment.pension_fund || "",
          compensation_fund: input.compensation_fund || previousEmployment.compensation_fund || "",
          bank: input.bank || previousEmployment.bank || "",
          bank_account_type: input.bank_account_type || previousEmployment.bank_account_type || "",
          bank_account_number: input.bank_account_number || previousEmployment.bank_account_number || "",
          labor_notes: input.labor_notes || previousEmployment.labor_notes || ""
        },
        operational: {
          ...previousOperational,
          classification: input.operational_classification || previousOperational.classification || "administrativo",
          can_punch_time: input.can_punch_time === undefined ? Boolean(previousOperational.can_punch_time) : toBoolean(input.can_punch_time),
          can_receive_services: input.can_receive_services === undefined ? Boolean(previousOperational.can_receive_services) : toBoolean(input.can_receive_services),
          can_be_assigned_routes: input.can_be_assigned_routes === undefined ? Boolean(previousOperational.can_be_assigned_routes) : toBoolean(input.can_be_assigned_routes),
          can_manage_inventory: input.can_manage_inventory === undefined ? Boolean(previousOperational.can_manage_inventory) : toBoolean(input.can_manage_inventory),
          can_approve_documents: input.can_approve_documents === undefined ? Boolean(previousOperational.can_approve_documents) : toBoolean(input.can_approve_documents),
          can_authorize_exceptions: input.can_authorize_exceptions === undefined ? Boolean(previousOperational.can_authorize_exceptions) : toBoolean(input.can_authorize_exceptions),
          driver_license: input.driver_license || previousOperational.driver_license || "",
          license_category: input.license_category || previousOperational.license_category || "",
          license_expires_at: input.license_expires_at || previousOperational.license_expires_at || "",
          restrictions: input.operational_restrictions || previousOperational.restrictions || "",
          base_site: input.base_site || previousOperational.base_site || "",
          zone: input.operation_zone || previousOperational.zone || ""
        },
        documents: Array.isArray(input.documents) ? input.documents : (Array.isArray(previousMetadata.documents) ? previousMetadata.documents : []),
        user_audit_trail: [
          ...(Array.isArray(previousMetadata.user_audit_trail) ? previousMetadata.user_audit_trail : []).slice(-9),
          { at: new Date().toISOString(), action: "updated", module: "administracion", actor_id: actorId }
        ]
      }
    };
    if (current.employee) {
      await prisma.employee.update({ where: { id: current.employee.id }, data: employeeData });
    } else {
      await prisma.employee.create({ data: { ...employeeData, tenant_id: tenantId, user_id: current.id, salary_type: "monthly", hire_date: new Date(), contract_type: "indefinite" } });
    }
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id }, include: { role: true, employee: true } });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "updated",
        module: "admin",
        entity: "/api/v1/admin/users",
        entity_id: String(user.id),
        old_value: previousSnapshot,
        new_value: userAuditSnapshot(user, user.employee)
      }
    });
    return userDto(user);
  });
}

async function setUserActive(tenantId, id, active, actorId = null) {
  return prisma.runWithTenant(tenantId, async () => {
    const enabled = toBoolean(active);
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { employee: true } });
    const previousSnapshot = userAuditSnapshot(current, current.employee);
    await prisma.user.update({
      where: { id: Number(id) },
      data: { active: enabled }
    });
    if (current.employee) {
      await prisma.employee.update({
        where: { id: current.employee.id },
        data: {
          active: enabled,
          metadata: {
            ...(current.employee.metadata || {}),
            labor_status: enabled ? "activo" : "inactivo",
            user_status: enabled ? "activo" : "inactivo",
            user_audit_trail: [
              ...(Array.isArray(current.employee.metadata?.user_audit_trail) ? current.employee.metadata.user_audit_trail : []).slice(-9),
              { at: new Date().toISOString(), action: enabled ? "activated" : "deactivated", module: "administracion", actor_id: actorId }
            ]
          }
        }
      });
    }
    const user = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { role: true, employee: true } });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: enabled ? "activated" : "deactivated",
        module: "admin",
        entity: "/api/v1/admin/users/status",
        entity_id: String(user.id),
        old_value: previousSnapshot,
        new_value: userAuditSnapshot(user, user.employee)
      }
    });
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

