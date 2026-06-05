const bcrypt = require("bcrypt");
const prisma = require("../../core/prisma");
const { assertPasswordPolicy } = require("../../security/policy");

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeTenantId(tenantId) {
  const value = String(tenantId ?? "").trim();
  if (!value) throw badRequest("Tenant requerido para operar administracion.");
  return value;
}

const ROLE_ACTIONS = ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import", "attach", "download", "configure", "administer", "execute", "reports", "sensitive", "manage_users", "manage_roles"];
const READ_ACTIONS = new Set(["access", "view", "download", "reports"]);
const WRITE_ACTIONS = new Set(["create", "edit", "delete", "reject", "void", "import", "attach", "configure", "administer", "execute", "sensitive", "manage_users", "manage_roles"]);
const APPROVE_ACTIONS = new Set(["approve"]);
const EXPORT_ACTIONS = new Set(["export"]);

function grants(module, actions = ROLE_ACTIONS) {
  return Object.fromEntries(actions.map((action) => {
    const mapped = [];
    if (READ_ACTIONS.has(action)) mapped.push([module, "read"]);
    if (WRITE_ACTIONS.has(action)) mapped.push([module, "write"]);
    if (APPROVE_ACTIONS.has(action)) mapped.push([module, "approve"]);
    if (EXPORT_ACTIONS.has(action)) mapped.push([module, "export"]);
    return [action, mapped.length ? mapped : [[module, action]]];
  }));
}

const PERMISSION_CATALOG = [
  { key: "dashboard", label: "Inicio / Dashboard", group: "core", module: "brain", submodule: "home", actions: ["access", "view", "reports"], grants: grants("brain", ["access", "view", "reports"]) },
  { key: "usuarios", label: "Usuarios", group: "administracion", module: "admin", submodule: "users", actions: ["access", "view", "create", "edit", "delete", "export", "import", "attach", "download", "sensitive", "manage_users"], grants: grants("admin", ["access", "view", "create", "edit", "delete", "export", "import", "attach", "download", "sensitive", "manage_users"]) },
  { key: "roles", label: "Roles y permisos", group: "administracion", module: "admin", submodule: "roles", actions: ["access", "view", "create", "edit", "delete", "export", "configure", "administer", "manage_roles"], grants: grants("admin", ["access", "view", "create", "edit", "delete", "export", "configure", "administer", "manage_roles"]) },
  { key: "empresas", label: "Empresas / Tenants", group: "administracion", module: "admin", submodule: "tenants", actions: ["access", "view", "create", "edit", "delete", "configure", "administer", "sensitive"], grants: grants("admin", ["access", "view", "create", "edit", "delete", "configure", "administer", "sensitive"]) },
  { key: "clientes", label: "Clientes", group: "comercial", module: "sales", submodule: "customers", actions: ["access", "view", "create", "edit", "delete", "export", "import", "sensitive"], grants: grants("sales", ["access", "view", "create", "edit", "delete", "export", "import", "sensitive"]) },
  { key: "proveedores", label: "Proveedores", group: "compras", module: "purchases", submodule: "suppliers", actions: ["access", "view", "create", "edit", "delete", "export", "import", "sensitive"], grants: grants("purchases", ["access", "view", "create", "edit", "delete", "export", "import", "sensitive"]) },
  { key: "inventarios", label: "Inventarios", group: "operacion", module: "inventory", submodule: "stock", actions: ["access", "view", "create", "edit", "delete", "approve", "export", "import", "configure"], grants: grants("inventory", ["access", "view", "create", "edit", "delete", "approve", "export", "import", "configure"]) },
  { key: "wms", label: "WMS", group: "operacion", module: "inventory", submodule: "wms", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"], grants: grants("inventory", ["access", "view", "create", "edit", "approve", "execute", "reports"]) },
  { key: "compras", label: "Compras", group: "compras", module: "purchases", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import", "attach", "download"], grants: grants("purchases", ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import", "attach", "download"]) },
  { key: "ventas", label: "Ventas", group: "comercial", module: "sales", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import"], grants: grants("sales", ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import"]) },
  { key: "logistica", label: "Logistica", group: "operacion", module: "transport", submodule: "logistics", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"], grants: grants("transport", ["access", "view", "create", "edit", "approve", "execute", "reports"]) },
  { key: "transporte", label: "Transporte", group: "operacion", module: "transport", submodule: "vehicles", actions: ["access", "view", "create", "edit", "delete", "approve", "export", "import", "attach", "download", "configure"], grants: grants("transport", ["access", "view", "create", "edit", "delete", "approve", "export", "import", "attach", "download", "configure"]) },
  { key: "ultima_milla", label: "Ultima milla", group: "operacion", module: "transport", submodule: "last_mile", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"], grants: grants("transport", ["access", "view", "create", "edit", "approve", "execute", "reports"]) },
  { key: "importaciones", label: "Importaciones", group: "operacion", module: "purchases", submodule: "imports", actions: ["access", "view", "create", "edit", "approve", "reject", "void", "export", "import", "attach", "download"], grants: grants("purchases", ["access", "view", "create", "edit", "approve", "reject", "void", "export", "import", "attach", "download"]) },
  { key: "servicios", label: "Servicios", group: "operacion", module: "services", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import", "attach", "download", "execute", "reports"], grants: grants("services", ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import", "attach", "download", "execute", "reports"]) },
  { key: "talento_humano", label: "Talento humano", group: "administracion", module: "hr", submodule: "hr", actions: ["access", "view", "create", "edit", "delete", "approve", "export", "import", "sensitive", "reports"], grants: grants("hr", ["access", "view", "create", "edit", "delete", "approve", "export", "import", "sensitive", "reports"]) },
  { key: "marcaciones", label: "Marcaciones y jornadas", group: "operacion", module: "hr", submodule: "time", actions: ["access", "view", "create", "edit", "approve", "reject", "export", "reports"], grants: grants("hr", ["access", "view", "create", "edit", "approve", "reject", "export", "reports"]) },
  { key: "proyectos", label: "Proyectos", group: "gestion", module: "projects", submodule: "projects", actions: ["access", "view", "create", "edit", "delete", "approve", "reject", "export", "attach", "download", "reports"], grants: grants("projects", ["access", "view", "create", "edit", "delete", "approve", "reject", "export", "attach", "download", "reports"]) },
  { key: "contabilidad", label: "Contabilidad", group: "finanzas", module: "accounting", submodule: "accounting", actions: ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import", "sensitive", "reports", "configure"], grants: grants("accounting", ["access", "view", "create", "edit", "delete", "approve", "reject", "void", "export", "import", "sensitive", "reports", "configure"]) },
  { key: "facturacion", label: "Facturacion", group: "finanzas", module: "invoicing", submodule: "billing", actions: ["access", "view", "create", "edit", "approve", "reject", "void", "export", "download", "sensitive"], grants: grants("invoicing", ["access", "view", "create", "edit", "approve", "reject", "void", "export", "download", "sensitive"]) },
  { key: "reportes", label: "Reportes", group: "analitica", module: "admin", submodule: "reports", actions: ["access", "view", "export", "download", "reports", "sensitive"], grants: grants("admin", ["access", "view", "export", "download", "reports", "sensitive"]) },
  { key: "automatizaciones", label: "Automatizaciones", group: "sistema", module: "brain", submodule: "automation", actions: ["access", "view", "create", "edit", "delete", "execute", "configure", "administer"], grants: grants("brain", ["access", "view", "create", "edit", "delete", "execute", "configure", "administer"]) },
  { key: "documentos", label: "Documentos adjuntos", group: "sistema", module: "admin", submodule: "documents", actions: ["access", "view", "create", "edit", "delete", "approve", "reject", "attach", "download", "sensitive"], grants: grants("admin", ["access", "view", "create", "edit", "delete", "approve", "reject", "attach", "download", "sensitive"]) },
  { key: "configuracion", label: "Configuracion general", group: "sistema", module: "admin", submodule: "settings", actions: ["access", "view", "edit", "configure", "administer", "sensitive"], grants: grants("admin", ["access", "view", "edit", "configure", "administer", "sensitive"]) },
  { key: "auditoria", label: "Auditoria", group: "sistema", module: "admin", submodule: "audit", actions: ["access", "view", "export", "download", "reports", "sensitive"], grants: grants("admin", ["access", "view", "export", "download", "reports", "sensitive"]) },
  { key: "notificaciones", label: "Notificaciones", group: "sistema", module: "admin", submodule: "notifications", actions: ["access", "view", "create", "edit", "delete", "execute", "configure"], grants: grants("admin", ["access", "view", "create", "edit", "delete", "execute", "configure"]) },
  { key: "ia", label: "IA / Asistente interno", group: "sistema", module: "brain", submodule: "assistant", actions: ["access", "view", "execute", "configure", "administer", "sensitive"], grants: grants("brain", ["access", "view", "execute", "configure", "administer", "sensitive"]) },
  { key: "nomina", label: "Nomina", group: "finanzas", module: "payroll", submodule: "payroll", actions: ["access", "view", "create", "edit", "approve", "export", "import", "sensitive", "reports"], grants: grants("payroll", ["access", "view", "create", "edit", "approve", "export", "import", "sensitive", "reports"]) }
];

function permissionPreset(keys, allowedActions) {
  const legacy = emptyLegacyPermissions();
  for (const key of keys) {
    if (!legacy[key]) continue;
    for (const action of allowedActions) {
      if (action === "*") for (const available of Object.keys(legacy[key])) legacy[key][available] = true;
      else if (legacy[key][action] !== undefined) legacy[key][action] = true;
    }
  }
  return legacy;
}

const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((item) => item.key);
const SYSTEM_ROLE_TEMPLATES = [
  { name: "APEX_ADMIN", description: "Superadministrador con control total del tenant.", is_system: true, hierarchy_level: 100, role_type: "superadmin", legacy_permissions: permissionPreset(ALL_PERMISSION_KEYS, ["*"]) },
  { name: "Administrador de empresa", description: "Administra usuarios, roles, configuracion y operacion de la empresa.", is_system: false, hierarchy_level: 90, role_type: "admin_empresa", legacy_permissions: permissionPreset(ALL_PERMISSION_KEYS.filter((key) => key !== "empresas"), ["access", "view", "create", "edit", "approve", "export", "configure", "manage_users", "manage_roles"]) },
  { name: "Gerente general", description: "Consulta transversal, aprueba procesos y revisa reportes sensibles.", is_system: false, hierarchy_level: 80, role_type: "gerencia", legacy_permissions: permissionPreset(ALL_PERMISSION_KEYS, ["access", "view", "approve", "export", "reports", "sensitive"]) },
  { name: "Coordinador logistico", description: "Coordina transporte, servicios, rutas, WMS e inventario operativo.", is_system: false, hierarchy_level: 70, role_type: "coordinador", legacy_permissions: permissionPreset(["dashboard", "logistica", "transporte", "ultima_milla", "servicios", "inventarios", "wms", "documentos", "reportes"], ["access", "view", "create", "edit", "approve", "export", "attach", "download", "reports"]) },
  { name: "Supervisor operativo", description: "Supervisa ejecucion diaria, equipo operativo, evidencias y marcaciones.", is_system: false, hierarchy_level: 60, role_type: "supervisor", legacy_permissions: permissionPreset(["dashboard", "servicios", "talento_humano", "marcaciones", "logistica", "transporte", "ultima_milla", "documentos"], ["access", "view", "create", "edit", "approve", "attach", "download", "reports"]) },
  { name: "Auxiliar operativo", description: "Ejecuta actividades asignadas y registra evidencias operativas.", is_system: false, hierarchy_level: 30, role_type: "operativo", legacy_permissions: permissionPreset(["dashboard", "servicios", "marcaciones", "logistica", "documentos"], ["access", "view", "create", "edit", "attach", "download"]) },
  { name: "Analista contable", description: "Gestiona contabilidad, facturacion y reportes financieros.", is_system: false, hierarchy_level: 50, role_type: "analista", legacy_permissions: permissionPreset(["dashboard", "contabilidad", "facturacion", "reportes", "documentos"], ["access", "view", "create", "edit", "approve", "export", "import", "download", "reports", "sensitive"]) },
  { name: "Analista de compras", description: "Gestiona proveedores, compras, importaciones y documentos asociados.", is_system: false, hierarchy_level: 50, role_type: "analista", legacy_permissions: permissionPreset(["dashboard", "proveedores", "compras", "importaciones", "inventarios", "documentos"], ["access", "view", "create", "edit", "approve", "reject", "export", "import", "attach", "download"]) },
  { name: "Analista de inventario", description: "Administra productos, stock, WMS y reportes de inventario.", is_system: false, hierarchy_level: 50, role_type: "analista", legacy_permissions: permissionPreset(["dashboard", "inventarios", "wms", "compras", "reportes"], ["access", "view", "create", "edit", "approve", "export", "import", "reports"]) },
  { name: "Comercial", description: "Gestiona clientes, ventas y seguimiento comercial.", is_system: false, hierarchy_level: 45, role_type: "comercial", legacy_permissions: permissionPreset(["dashboard", "clientes", "ventas", "servicios", "reportes"], ["access", "view", "create", "edit", "export", "reports"]) },
  { name: "Usuario solo lectura", description: "Consulta informacion autorizada sin modificar datos.", is_system: false, hierarchy_level: 10, role_type: "lectura", legacy_permissions: permissionPreset(ALL_PERMISSION_KEYS, ["access", "view", "reports"]) },
  { name: "Auditor", description: "Consulta auditoria, documentos y reportes con foco de control.", is_system: false, hierarchy_level: 65, role_type: "auditor", legacy_permissions: permissionPreset(["dashboard", "auditoria", "documentos", "reportes", "usuarios", "roles", "contabilidad"], ["access", "view", "export", "download", "reports", "sensitive"]) },
  { name: "Soporte tecnico", description: "Soporta configuracion, diagnostico y administracion tecnica controlada.", is_system: false, hierarchy_level: 75, role_type: "soporte", legacy_permissions: permissionPreset(["dashboard", "usuarios", "roles", "configuracion", "auditoria", "notificaciones", "ia"], ["access", "view", "edit", "configure", "administer", "reports"]) },
  { name: "Tecnico", description: "Ejecuta servicios, consulta referencias y registra trabajo de campo.", is_system: false, hierarchy_level: 35, role_type: "operativo", legacy_permissions: permissionPreset(["dashboard", "servicios", "marcaciones", "transporte", "documentos"], ["access", "view", "create", "edit", "attach", "download"]) },
  { name: "Empleado", description: "Consulta operativa y registra jornada.", is_system: false, hierarchy_level: 20, role_type: "operativo", legacy_permissions: permissionPreset(["dashboard", "marcaciones", "documentos"], ["access", "view", "create", "download"]) },
  { name: "Coordinador", description: "Rol legacy de coordinacion operativa y administrativa.", is_system: false, hierarchy_level: 70, role_type: "coordinador", legacy_permissions: permissionPreset(["dashboard", "usuarios", "roles", "servicios", "marcaciones", "transporte", "reportes", "configuracion", "nomina"], ["access", "view", "create", "edit", "approve", "export", "configure"]) }
];

const USER_MASTER_DATA = {
  document_types: [
    { code: "CC", name: "Cedula de ciudadania" },
    { code: "CE", name: "Cedula de extranjeria" },
    { code: "NIT", name: "NIT" },
    { code: "PAS", name: "Pasaporte" }
  ],
  user_statuses: [
    { code: "activo", name: "Activo" },
    { code: "inactivo", name: "Inactivo" },
    { code: "suspendido", name: "Suspendido" },
    { code: "bloqueado", name: "Bloqueado" },
    { code: "pendiente_activacion", name: "Pendiente activacion" }
  ],
  user_types: [
    { code: "administrativo", name: "Administrativo" },
    { code: "conductor", name: "Conductor" },
    { code: "supervisor", name: "Supervisor" },
    { code: "operario", name: "Operario" },
    { code: "tecnico", name: "Tecnico" },
    { code: "bodega", name: "Bodega" }
  ],
  contract_types: [
    { code: "indefinite", name: "Indefinido" },
    { code: "fixed", name: "Termino fijo" },
    { code: "service", name: "Prestacion de servicios" },
    { code: "temporary", name: "Temporal" }
  ],
  engagement_types: [
    { code: "empleado", name: "Empleado" },
    { code: "contratista", name: "Contratista" },
    { code: "tercero", name: "Tercero" },
    { code: "temporal", name: "Temporal" },
    { code: "aprendiz", name: "Aprendiz" }
  ],
  session_statuses: [
    { code: "sin_sesion", name: "Sin sesion" },
    { code: "activa", name: "Activa" },
    { code: "bloqueada", name: "Bloqueada" }
  ],
  document_statuses: [
    { code: "pending", name: "Pendiente" },
    { code: "approved", name: "Aprobado" },
    { code: "rejected", name: "Rechazado" },
    { code: "expired", name: "Vencido" }
  ],
  user_document_types: [
    { code: "identity", name: "Documento de identidad" },
    { code: "contract", name: "Contrato" },
    { code: "license", name: "Licencia de conduccion" },
    { code: "social_security", name: "Seguridad social" },
    { code: "bank_certificate", name: "Certificado bancario" },
    { code: "occupational_exam", name: "Examen medico ocupacional" },
    { code: "internal", name: "Documento interno" }
  ],
  areas: [
    { code: "OPER", name: "Operacion" },
    { code: "TRANSP", name: "Transporte" },
    { code: "ADMIN", name: "Administracion" },
    { code: "BODEGA", name: "Bodega" }
  ],
  positions: [
    { code: "ADMIN", name: "Administrador" },
    { code: "SUP_RUTA", name: "Supervisor de ruta" },
    { code: "CONDUCTOR", name: "Conductor" },
    { code: "AUX_OPER", name: "Auxiliar operativo" }
  ],
  locations: [
    { code: "SEDE-PRINCIPAL", name: "Sede principal" },
    { code: "BOG-NORTE", name: "Bogota Norte" },
    { code: "BOG-SUR", name: "Bogota Sur" }
  ],
  cost_centers: [
    { code: "CC-OPER", name: "Operacion" },
    { code: "CC-TRAN", name: "Transporte" },
    { code: "CC-ADMIN", name: "Administracion" }
  ],
  work_shifts: [
    { code: "DIURNO", name: "Diurno" },
    { code: "NOCTURNO", name: "Nocturno" },
    { code: "MIXTO", name: "Mixto" }
  ],
  banks: [
    { code: "BANCOLOMBIA", name: "Bancolombia" },
    { code: "BOGOTA", name: "Banco de Bogota" },
    { code: "DAVIVIENDA", name: "Davivienda" }
  ]
};

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
  const metadata = role.metadata || {};
  const permissions = role.permissions || [];
  const legacy = permissionsToLegacy(role);
  const activeModules = Object.entries(legacy).filter(([, actions]) => Object.values(actions || {}).some(Boolean)).length;
  const activeActions = Object.values(legacy).reduce((sum, actions) => sum + Object.values(actions || {}).filter(Boolean).length, 0);
  return {
    id: role.id,
    name: role.name,
    nombre: role.name,
    description: role.description || "",
    descripcion: role.description || "",
    active: metadata.active !== false,
    activo: metadata.active !== false,
    is_system: role.is_system,
    es_sistema: role.is_system,
    hierarchy_level: Number(metadata.hierarchy_level || 10),
    role_type: metadata.role_type || "custom",
    scope: metadata.scope || "company",
    scopes: metadata.scopes || { locations: [], areas: [], cost_centers: [], processes: [] },
    restrictions: metadata.restrictions || { locations: [], areas: [], cost_centers: [], processes: [] },
    can_delegate: Boolean(metadata.can_delegate),
    sensitive: Boolean(metadata.sensitive),
    impact_summary: { modules: activeModules, actions: activeActions, raw_permissions: permissions.length },
    permissions: legacy,
    raw_permissions: permissions
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
    base_shift: employment.base_shift || "",
    transport_allowance: employment.transport_allowance || "",
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
  tenantId = normalizeTenantId(tenantId);
  const legacyPermissions = normalizeLegacyPermissions(data.permissions || data.legacy_permissions || {});
  const rbacPermissions = legacyToRbacPermissions(legacyPermissions);
  const roleData = {
    tenant_id: tenantId,
    name: data.name || data.nombre,
    description: data.description || data.descripcion || "",
    is_system: Boolean(data.is_system),
    metadata: {
      active: data.active !== false && data.activo !== false,
      legacy_permissions: legacyPermissions,
      hierarchy_level: Number(data.hierarchy_level || data.level || 10),
      role_type: data.role_type || data.type || "custom",
      scope: data.scope || "company",
      scopes: data.scopes || { locations: [], areas: [], cost_centers: [], processes: [] },
      restrictions: data.restrictions || { locations: [], areas: [], cost_centers: [], processes: [] },
      can_delegate: toBoolean(data.can_delegate),
      sensitive: toBoolean(data.sensitive)
    },
    permissions: { create: rbacPermissions }
  };

  return prisma.role.create({ data: roleData, include: { permissions: true } });
}

async function ensureSystemRoles(tenantId) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const templatesByName = new Map(SYSTEM_ROLE_TEMPLATES.map((template) => [template.name, template]));
    const currentRoles = await prisma.role.findMany({
      where: { name: { in: [...templatesByName.keys()] } },
      select: { name: true }
    });
    const existing = new Set(currentRoles.map((role) => role.name));
    for (const template of SYSTEM_ROLE_TEMPLATES) {
      if (!existing.has(template.name)) await upsertRoleFromLegacy(tenantId, { ...template, active: true });
    }
  });
}

async function exportTenantData(tenantId) {
  tenantId = normalizeTenantId(tenantId);
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
  return PERMISSION_CATALOG.map(({ key, label, group, module, submodule, actions }) => ({ key, label, group, module, submodule, actions }));
}

async function getUserMasterData(tenantId) {
  tenantId = normalizeTenantId(tenantId);
  await ensureSystemRoles(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const roles = await prisma.role.findMany({ include: { permissions: true }, orderBy: [{ is_system: "desc" }, { name: "asc" }] });
    return {
      ...USER_MASTER_DATA,
      roles: roles.map(roleDto)
    };
  });
}

async function addUserMasterDataItem(tenantId, catalog, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  await ensureSystemRoles(tenantId);
  const allowed = new Set(Object.keys(USER_MASTER_DATA));
  if (!allowed.has(catalog)) {
    const err = new Error("Catalogo de usuario no soportado.");
    err.statusCode = 400;
    throw err;
  }
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  if (!code || !name) {
    const err = new Error("Codigo y nombre son obligatorios.");
    err.statusCode = 400;
    throw err;
  }
  const item = {
    code,
    name,
    description: String(input.description || "").trim(),
    active: input.active !== false,
    sort_order: Number(input.sort_order || 100)
  };
  const current = Array.isArray(USER_MASTER_DATA[catalog]) ? USER_MASTER_DATA[catalog] : [];
  USER_MASTER_DATA[catalog] = current.some((entry) => entry.code === code)
    ? current.map((entry) => entry.code === code ? { ...entry, ...item } : entry)
    : [...current, item];
  return prisma.runWithTenant(tenantId, async () => {
    const roles = await prisma.role.findMany({ include: { permissions: true }, orderBy: [{ is_system: "desc" }, { name: "asc" }] });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "catalog_item_upserted",
        module: "admin",
        entity: `/api/v1/admin/user-master-data/${catalog}/items`,
        entity_id: code,
        old_value: null,
        new_value: item
      }
    }).catch(() => null);
    return { ...USER_MASTER_DATA, roles: roles.map(roleDto) };
  });
}

async function listRoles(tenantId, query = {}) {
  tenantId = normalizeTenantId(tenantId);
  await ensureSystemRoles(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const roles = await prisma.role.findMany({
      include: { permissions: true },
      orderBy: [{ is_system: "desc" }, { name: "asc" }],
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 100), 200)
    });
    return roles.map(roleDto);
  });
}

async function createRole(tenantId, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const name = String(input.name || input.nombre || "").trim();
    if (!name) {
      const err = new Error("El nombre del rol es obligatorio.");
      err.statusCode = 400;
      throw err;
    }
    const duplicate = await prisma.role.findUnique({ where: { tenant_id_name: { tenant_id: tenantId, name } } });
    if (duplicate) {
      const err = new Error("Ya existe un rol con ese nombre en esta empresa.");
      err.statusCode = 409;
      throw err;
    }
    const role = await upsertRoleFromLegacy(tenantId, { ...input, is_system: false });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "role_created",
        module: "admin",
        entity: "/api/v1/admin/roles",
        entity_id: String(role.id),
        old_value: null,
        new_value: roleDto(role)
      }
    });
    return roleDto(role);
  });
}

async function updateRole(tenantId, id, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.role.findFirstOrThrow({ where: { id: Number(id) }, include: { permissions: true } });
    const previous = roleDto(current);
    if (current.name === "APEX_ADMIN") {
      const role = await prisma.role.update({
        where: { id: current.id },
        data: {
          description: input.description || input.descripcion || current.description,
          metadata: { ...(current.metadata || {}), active: true, hierarchy_level: 100, role_type: "superadmin" }
        },
        include: { permissions: true }
      });
      await prisma.auditLog.create({
        data: { tenant_id: tenantId, user_id: actorId, action: "role_updated", module: "admin", entity: "/api/v1/admin/roles", entity_id: String(role.id), old_value: previous, new_value: roleDto(role) }
      });
      return roleDto(role);
    }
    const legacyPermissions = normalizeLegacyPermissions(input.permissions || {});
    const rbacPermissions = legacyToRbacPermissions(legacyPermissions);
    const nextName = current.is_system ? current.name : String(input.name || input.nombre || current.name).trim();
    if (nextName !== current.name) {
      const duplicate = await prisma.role.findUnique({ where: { tenant_id_name: { tenant_id: tenantId, name: nextName } } });
      if (duplicate) {
        const err = new Error("Ya existe un rol con ese nombre en esta empresa.");
        err.statusCode = 409;
        throw err;
      }
    }
    await prisma.permission.deleteMany({ where: { role_id: current.id } });
    const role = await prisma.role.update({
      where: { id: current.id },
      data: {
        name: nextName,
        description: input.description || input.descripcion || "",
        metadata: {
          ...(current.metadata || {}),
          active: input.active !== false && input.activo !== false,
          legacy_permissions: legacyPermissions,
          hierarchy_level: Number(input.hierarchy_level || current.metadata?.hierarchy_level || 10),
          role_type: input.role_type || current.metadata?.role_type || "custom",
          scope: input.scope || current.metadata?.scope || "company",
          scopes: input.scopes || current.metadata?.scopes || { locations: [], areas: [], cost_centers: [], processes: [] },
          restrictions: input.restrictions || current.metadata?.restrictions || { locations: [], areas: [], cost_centers: [], processes: [] },
          can_delegate: input.can_delegate === undefined ? Boolean(current.metadata?.can_delegate) : toBoolean(input.can_delegate),
          sensitive: input.sensitive === undefined ? Boolean(current.metadata?.sensitive) : toBoolean(input.sensitive)
        },
        permissions: { create: rbacPermissions }
      },
      include: { permissions: true }
    });
    await prisma.auditLog.create({
      data: { tenant_id: tenantId, user_id: actorId, action: "role_updated", module: "admin", entity: "/api/v1/admin/roles", entity_id: String(role.id), old_value: previous, new_value: roleDto(role) }
    });
    return roleDto(role);
  });
}

async function setRoleActive(tenantId, id, active, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.role.findFirstOrThrow({ where: { id: Number(id) }, include: { permissions: true } });
    if (current.name === "APEX_ADMIN") return roleDto(current);
    const previous = roleDto(current);
    const role = await prisma.role.update({
      where: { id: current.id },
      data: { metadata: { ...(current.metadata || {}), active: toBoolean(active) } },
      include: { permissions: true }
    });
    await prisma.auditLog.create({
      data: { tenant_id: tenantId, user_id: actorId, action: toBoolean(active) ? "role_activated" : "role_deactivated", module: "admin", entity: "/api/v1/admin/roles/status", entity_id: String(role.id), old_value: previous, new_value: roleDto(role) }
    });
    return roleDto(role);
  });
}

async function listUsers(tenantId, query = {}) {
  tenantId = normalizeTenantId(tenantId);
  await ensureSystemRoles(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const users = await prisma.user.findMany({
      include: { role: true, employee: true },
      orderBy: { name: "asc" },
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 100), 200)
    });
    return users.map(userDto);
  });
}

async function createUser(tenantId, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  await ensureSystemRoles(tenantId);
  const email = String(input.email || input.username || input.user || input.access_email || "").trim().toLowerCase();
  if (!email) throw badRequest("El correo del usuario es obligatorio.");
  const rawPassword = input.password || input.pas || "";
  assertPasswordPolicy(rawPassword);
  const password = await bcrypt.hash(rawPassword, 12);
  return prisma.runWithTenant(tenantId, async () => {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      const err = new Error("Ya existe un usuario con este correo en la empresa.");
      err.statusCode = 409;
      throw err;
    }
    const role = input.role_id
      ? await prisma.role.findFirstOrThrow({ where: { id: Number(input.role_id) } })
      : await prisma.role.findFirst({ where: { name: "Empleado" } });
    if (!role) throw badRequest("Debe seleccionar un rol valido para el usuario.");
    if (role?.metadata?.active === false) {
      throw badRequest("El rol seleccionado esta inactivo");
    }
    const fullName = input.name || input.nombre || `${input.first_names || ""} ${input.last_names || ""}`.trim();
    if (!fullName) throw badRequest("El nombre del usuario es obligatorio.");
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
        base_shift: input.base_shift || "",
        transport_allowance: input.transport_allowance || "",
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
        email,
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
  tenantId = normalizeTenantId(tenantId);
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
          base_shift: input.base_shift || previousEmployment.base_shift || "",
          transport_allowance: input.transport_allowance || previousEmployment.transport_allowance || "",
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
  tenantId = normalizeTenantId(tenantId);
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

async function updateUserAccess(tenantId, id, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { employee: true } });
    const previousSnapshot = userAuditSnapshot(current, current.employee);
    const metadata = current.employee?.metadata || {};
    const access = metadata.access || {};
    const nextSessionStatus = input.session_status || (input.blocked ? "bloqueada" : access.session_status || "sin_sesion");
    if (input.password) assertPasswordPolicy(input.password);
    await prisma.user.update({
      where: { id: current.id },
      data: {
        ...(input.password ? { password: await bcrypt.hash(input.password, 12) } : {}),
        active: input.active === undefined ? current.active : toBoolean(input.active)
      }
    });
    if (current.employee) {
      await prisma.employee.update({
        where: { id: current.employee.id },
        data: {
          metadata: {
            ...metadata,
            access: {
              ...access,
              session_status: nextSessionStatus,
              require_password_change: input.require_password_change === undefined ? Boolean(access.require_password_change) : toBoolean(input.require_password_change)
            },
            user_audit_trail: [
              ...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9),
              { at: new Date().toISOString(), action: "access_updated", module: "administracion", actor_id: actorId }
            ]
          }
        }
      });
    }
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id }, include: { role: true, employee: true } });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "access_updated",
        module: "admin",
        entity: "/api/v1/admin/users/access",
        entity_id: String(user.id),
        old_value: previousSnapshot,
        new_value: userAuditSnapshot(user, user.employee)
      }
    });
    return userDto(user);
  });
}

async function addUserDocument(tenantId, id, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { employee: true } });
    if (!input.document_type || !input.file_name) {
      const err = new Error("Tipo documental y nombre de archivo son obligatorios");
      err.statusCode = 400;
      throw err;
    }
    const metadata = current.employee?.metadata || {};
    const documents = Array.isArray(metadata.documents) ? metadata.documents : [];
    const document = {
      id: input.id || `doc-${Date.now()}`,
      document_type: input.document_type,
      file_name: input.file_name,
      file_url: input.file_url || "",
      storage_path: input.storage_path || "",
      mime_type: input.mime_type || "",
      file_size: Number(input.file_size || 0),
      status: input.status || "pending",
      observations: input.observations || "",
      uploaded_by: actorId,
      uploaded_at: new Date().toISOString()
    };
    if (current.employee) {
      await prisma.employee.update({
        where: { id: current.employee.id },
        data: {
          metadata: {
            ...metadata,
            documents: [...documents, document],
            user_audit_trail: [
              ...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9),
              { at: new Date().toISOString(), action: "document_added", module: "administracion", actor_id: actorId, document_id: document.id }
            ]
          }
        }
      });
    }
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id }, include: { role: true, employee: true } });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "document_added",
        module: "admin",
        entity: "/api/v1/admin/users/documents",
        entity_id: String(user.id),
        old_value: null,
        new_value: document
      }
    });
    return userDto(user);
  });
}

async function removeUserDocument(tenantId, id, documentId, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id) }, include: { employee: true } });
    const metadata = current.employee?.metadata || {};
    const documents = Array.isArray(metadata.documents) ? metadata.documents : [];
    const removed = documents.find((document) => String(document.id) === String(documentId)) || null;
    const nextDocuments = documents.filter((document) => String(document.id) !== String(documentId));
    if (current.employee) {
      await prisma.employee.update({
        where: { id: current.employee.id },
        data: {
          metadata: {
            ...metadata,
            documents: nextDocuments,
            user_audit_trail: [
              ...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9),
              { at: new Date().toISOString(), action: "document_removed", module: "administracion", actor_id: actorId, document_id: documentId }
            ]
          }
        }
      });
    }
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id }, include: { role: true, employee: true } });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "document_removed",
        module: "admin",
        entity: "/api/v1/admin/users/documents",
        entity_id: String(user.id),
        old_value: removed,
        new_value: null
      }
    });
    return userDto(user);
  });
}

module.exports = {
  exportTenantData,
  processBilling,
  getPermissionCatalog,
  getUserMasterData,
  addUserMasterDataItem,
  listRoles,
  createRole,
  updateRole,
  setRoleActive,
  listUsers,
  createUser,
  updateUser,
  setUserActive,
  updateUserAccess,
  addUserDocument,
  removeUserDocument
};

