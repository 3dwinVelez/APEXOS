const bcrypt = require("bcrypt");
const { syncSupabaseCredentials } = require("../../security/supabaseAdminCredentials");
const prisma = require("../../core/prisma");
const platformLogs = require("../../fabric/platformLogs");
const { assertPasswordPolicy } = require("../../security/policy");
const authorizationState = require("../../security/authorizationState");

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

function normalizeRoleNameKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

const PHYSICAL_DELETE_PERMISSION = "delete_physical_records";
const SERVICE_ORDER_OVERRIDE_PERMISSION = "edit_any_state";
const ROLE_ACTIONS = ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "attach", "download", "configure", "administer", "execute", "reports", "sensitive", "manage_users", "manage_roles"];
const READ_ACTIONS = new Set(["access", "view", "download", "reports"]);
const WRITE_ACTIONS = new Set(["create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "reject", "void", "import", "attach", "configure", "administer", "execute", "sensitive", "manage_users", "manage_roles"]);
const APPROVE_ACTIONS = new Set(["approve"]);
const EXPORT_ACTIONS = new Set(["export"]);
const TENANT_MODULE_CODES = {
  accounting: ["M-07", "contabilidad", "finance", "accounting"],
  admin: ["M-22", "administracion", "administracion_apex", "admin"],
  brain: ["AI-CORE", "apex-ai", "apex_ai", "brain"],
  hr: ["M-17", "talento-humano", "talento_humano", "hr"],
  time_tracking: ["M-17", "talento-humano", "talento_humano", "hr", "time_tracking", "marcaciones"],
  inventory: ["M-01", "inventario", "inventory"],
  invoicing: ["M-04", "facturacion", "invoicing"],
  payroll: ["M-17", "nomina", "payroll"],
  purchases: ["M-02", "compras", "purchases"],
  projects: ["M-19", "proyectos", "projects"],
  sales: ["M-03", "ventas", "sales"],
  services: ["M-26", "servicios", "services"],
  "commercial-management": ["M-27", "gestion-comercial", "gestion_comercial", "commercial-management"],
  transport: ["M-14", "transporte", "transport"]
};

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

function withPhysicalDeletePermission(item) {
  if (item.allowPhysicalDelete === false) return item;
  const actions = item.actions.includes(PHYSICAL_DELETE_PERMISSION) ? item.actions : [...item.actions, PHYSICAL_DELETE_PERMISSION];
  return { ...item, actions, grants: grants(item.module, actions) };
}

function normalizeActiveModules(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim().toLowerCase()).filter(Boolean) : [];
}

function tenantHasModule(activeModules, module) {
  if (!module) return true;
  const active = normalizeActiveModules(activeModules);
  if (!active.length) return true;
  const allowedCodes = (TENANT_MODULE_CODES[module] || [module]).map((item) => String(item).trim().toLowerCase());
  return allowedCodes.some((code) => active.includes(code));
}

const PERMISSION_CATALOG = [
  { key: "dashboard", label: "Inicio / Dashboard", group: "core", module: "brain", submodule: "home", actions: ["access", "view", "reports"], grants: grants("brain", ["access", "view", "reports"]) },
  { key: "usuarios", label: "Usuarios", group: "administracion", module: "admin", submodule: "users", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "attach", "download", "sensitive", "manage_users"], grants: grants("admin", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "attach", "download", "sensitive", "manage_users"]) },
  { key: "roles", label: "Roles y permisos", group: "administracion", module: "admin", submodule: "roles", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "configure", "administer", "manage_roles"], grants: grants("admin", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "configure", "administer", "manage_roles"]) },
  { key: "empresas", label: "Empresas / Tenants", group: "administracion", module: "admin", submodule: "tenants", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "configure", "administer", "sensitive"], grants: grants("admin", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "configure", "administer", "sensitive"]) },
  { key: "clientes", label: "Clientes", group: "comercial", module: "sales", submodule: "customers", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "sensitive"], grants: grants("sales", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "sensitive"]) },
  { key: "proveedores", label: "Proveedores", group: "compras", module: "purchases", submodule: "suppliers", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "sensitive"], grants: grants("purchases", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "sensitive"]) },
  { key: "inventarios", label: "Inventarios", group: "operacion", module: "inventory", submodule: "stock", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "configure"], grants: grants("inventory", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "configure"]) },
  { key: "wms", label: "WMS", group: "operacion", module: "inventory", submodule: "wms", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"], grants: grants("inventory", ["access", "view", "create", "edit", "approve", "execute", "reports"]) },
  { key: "compras", label: "Compras", group: "compras", module: "purchases", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "attach", "download"], grants: grants("purchases", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "attach", "download"]) },
  { key: "ventas", label: "Ventas", group: "comercial", module: "sales", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import"], grants: grants("sales", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import"]) },
  { key: "gestion_comercial", label: "Gestion comercial M-27", group: "comercial", module: "commercial-management", submodule: "commercial-management", actions: ["access", "view", "create", "edit", "export", "reports"], grants: grants("commercial-management", ["access", "view", "create", "edit", "export", "reports"]), allowPhysicalDelete: false },
  { key: "facturacion_ventas", label: "Facturacion ventas", group: "comercial", module: "sales-invoice", submodule: "invoices", actions: ["access", "view", "create", "edit", "approve", "void", "export"], grants: grants("sales-invoice", ["access", "view", "create", "edit", "approve", "void", "export"]) },
  { key: "cxc", label: "Cuentas por cobrar", group: "finanzas", module: "accounts-receivable", submodule: "receivables", actions: ["access", "view", "create", "edit", "approve", "reject", "void", "export", "reports"], grants: grants("accounts-receivable", ["access", "view", "create", "edit", "approve", "reject", "void", "export", "reports"]) },
  { key: "logistica", label: "Logistica", group: "operacion", module: "transport", submodule: "logistics", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"], grants: grants("transport", ["access", "view", "create", "edit", "approve", "execute", "reports"]) },
  { key: "transporte", label: "Transporte", group: "operacion", module: "transport", submodule: "vehicles", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "attach", "download", "configure"], grants: grants("transport", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "attach", "download", "configure"]) },
  { key: "ultima_milla", label: "Ultima milla", group: "operacion", module: "transport", submodule: "last_mile", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"], grants: grants("transport", ["access", "view", "create", "edit", "approve", "execute", "reports"]) },
  { key: "importaciones", label: "Importaciones", group: "operacion", module: "purchases", submodule: "imports", actions: ["access", "view", "create", "edit", "approve", "reject", "void", "export", "import", "attach", "download"], grants: grants("purchases", ["access", "view", "create", "edit", "approve", "reject", "void", "export", "import", "attach", "download"]) },
  { key: "servicios", label: "Servicios", group: "operacion", module: "services", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "attach", "download", "execute", "reports"], grants: grants("services", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "attach", "download", "execute", "reports"]) },
  { key: "servicios_correcciones", label: "Edicion especial de ordenes", group: "operacion", module: "services", submodule: "order-corrections", actions: [SERVICE_ORDER_OVERRIDE_PERMISSION], grants: { [SERVICE_ORDER_OVERRIDE_PERMISSION]: [["services.orders", SERVICE_ORDER_OVERRIDE_PERMISSION]] }, allowPhysicalDelete: false },
  { key: "talento_humano", label: "Talento humano", group: "administracion", module: "hr", submodule: "hr", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "sensitive", "reports"], grants: grants("hr", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "sensitive", "reports"]) },
  { key: "marcaciones", label: "Marcaciones y jornadas", group: "operacion", module: "time_tracking", submodule: "time", actions: ["access", "view", "create", "edit", "approve", "reject", "export", "reports"], grants: grants("time_tracking", ["access", "view", "create", "edit", "approve", "reject", "export", "reports"]) },
  { key: "proyectos", label: "Proyectos", group: "gestion", module: "projects", submodule: "projects", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "export", "attach", "download", "reports"], grants: grants("projects", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "export", "attach", "download", "reports"]) },
  { key: "contabilidad", label: "Contabilidad", group: "finanzas", module: "accounting", submodule: "accounting", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "sensitive", "reports", "configure"], grants: grants("accounting", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "sensitive", "reports", "configure"]) },
  { key: "facturacion", label: "Facturacion", group: "finanzas", module: "invoicing", submodule: "billing", actions: ["access", "view", "create", "edit", "approve", "reject", "void", "export", "download", "sensitive"], grants: grants("invoicing", ["access", "view", "create", "edit", "approve", "reject", "void", "export", "download", "sensitive"]) },
  { key: "reportes", label: "Reportes", group: "analitica", module: "admin", submodule: "reports", actions: ["access", "view", "export", "download", "reports", "sensitive"], grants: grants("admin", ["access", "view", "export", "download", "reports", "sensitive"]) },
  { key: "automatizaciones", label: "Automatizaciones", group: "sistema", module: "brain", submodule: "automation", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "execute", "configure", "administer"], grants: grants("brain", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "execute", "configure", "administer"]) },
  { key: "documentos", label: "Documentos adjuntos", group: "sistema", module: "admin", submodule: "documents", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "attach", "download", "sensitive"], grants: grants("admin", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "attach", "download", "sensitive"]) },
  { key: "configuracion", label: "Configuracion general", group: "sistema", module: "admin", submodule: "settings", actions: ["access", "view", "edit", "configure", "administer", "sensitive"], grants: grants("admin", ["access", "view", "edit", "configure", "administer", "sensitive"]) },
  { key: "auditoria", label: "Auditoria", group: "sistema", module: "admin", submodule: "audit", actions: ["access", "view", "export", "download", "reports", "sensitive"], grants: grants("admin", ["access", "view", "export", "download", "reports", "sensitive"]) },
  { key: "notificaciones", label: "Notificaciones", group: "sistema", module: "admin", submodule: "notifications", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "execute", "configure"], grants: grants("admin", ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "execute", "configure"]) },
  { key: "ia", label: "IA / Asistente interno", group: "sistema", module: "brain", submodule: "assistant", actions: ["access", "view", "execute", "configure", "administer", "sensitive"], grants: grants("brain", ["access", "view", "execute", "configure", "administer", "sensitive"]) },
  { key: "nomina", label: "Nomina", group: "finanzas", module: "payroll", submodule: "payroll", actions: ["access", "view", "create", "edit", "approve", "export", "import", "sensitive", "reports"], grants: grants("payroll", ["access", "view", "create", "edit", "approve", "export", "import", "sensitive", "reports"]) }
].map(withPhysicalDeletePermission);

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
  { name: "Comercial", description: "Asesor comercial con acceso exclusivo a su cartera, visitas, documentos, compromisos, presupuesto y reportes.", is_system: false, hierarchy_level: 45, role_type: "comercial", legacy_permissions: permissionPreset(["dashboard", "gestion_comercial"], ["access", "view", "create", "edit", "export", "reports"]) },
  { name: "Usuario solo lectura", description: "Consulta informacion autorizada sin modificar datos.", is_system: false, hierarchy_level: 10, role_type: "lectura", legacy_permissions: permissionPreset(ALL_PERMISSION_KEYS, ["access", "view", "reports"]) },
  { name: "Auditor", description: "Consulta auditoria, documentos y reportes con foco de control.", is_system: false, hierarchy_level: 65, role_type: "auditor", legacy_permissions: permissionPreset(["dashboard", "auditoria", "documentos", "reportes", "usuarios", "roles", "contabilidad"], ["access", "view", "export", "download", "reports", "sensitive"]) },
  { name: "Soporte tecnico", description: "Soporta configuracion, diagnostico y administracion tecnica controlada.", is_system: false, hierarchy_level: 75, role_type: "soporte", legacy_permissions: permissionPreset(["dashboard", "usuarios", "roles", "configuracion", "auditoria", "notificaciones", "ia"], ["access", "view", "edit", "configure", "administer", "reports"]) },
  { name: "Tecnico", description: "Ejecuta servicios, consulta referencias y registra trabajo de campo.", is_system: false, hierarchy_level: 35, role_type: "operativo", legacy_permissions: permissionPreset(["dashboard", "servicios", "marcaciones", "transporte", "documentos"], ["access", "view", "create", "edit", "attach", "download"]) },
  { name: "Empleado", description: "Consulta operativa y registra jornada.", is_system: false, hierarchy_level: 20, role_type: "operativo", legacy_permissions: permissionPreset(["dashboard", "marcaciones", "documentos"], ["access", "view", "create", "download"]) },
  { name: "Empleado marcaciones", description: "Registra exclusivamente su propia jornada sin acceso a otros modulos o datos de empleados.", is_system: false, hierarchy_level: 15, role_type: "operativo", access_profile: "marking_only", legacy_permissions: permissionPreset(["marcaciones"], ["access", "view", "create"]) },
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
  activity_types: [
    { code: "ACT-01", name: "Cargue de mercancia en bodega" },
    { code: "ACT-02", name: "Inicio de ruta" },
    { code: "ACT-03", name: "Entrega en tienda" },
    { code: "ACT-04", name: "Novedad en ruta" }
  ],
  banks: [
    { code: "BANCOLOMBIA", name: "Bancolombia" },
    { code: "BOGOTA", name: "Banco de Bogota" },
    { code: "DAVIVIENDA", name: "Davivienda" }
  ]
};

function safeMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneUserMasterData(overrides = {}) {
  return Object.fromEntries(Object.entries({ ...USER_MASTER_DATA, ...overrides }).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map((item) => ({ ...item })) : value
  ]));
}

function activityTypeMasterCode(activityType) {
  const metadata = safeMetadata(activityType?.metadata);
  return String(metadata.code || activityType?.id || "").trim();
}

function activityTypeToMasterItem(activityType) {
  return {
    code: activityTypeMasterCode(activityType),
    name: activityType.name,
    description: activityType.description || "",
    active: activityType.active !== false,
    sort_order: Number(activityType.sort_order || 100)
  };
}

async function ensureAdminActivityTypes() {
  const current = await prisma.activityType.findMany({ where: { __includeInactive: true }, take: 1 });
  if (current.length) return;
  await prisma.activityType.createMany({
    data: USER_MASTER_DATA.activity_types.map((item, index) => ({
      name: item.name,
      description: item.description || "Catalogo operativo inicial APEXOS",
      active: item.active !== false,
      sort_order: Number(item.sort_order || ((index + 1) * 10)),
      metadata: { code: item.code, source: "admin_user_master_data" }
    })),
    skipDuplicates: true
  });
}

async function listActivityTypeMasterItems() {
  await ensureAdminActivityTypes();
  const rows = await prisma.activityType.findMany({
    where: { __includeInactive: true },
    orderBy: [{ sort_order: "asc" }, { name: "asc" }]
  });
  return rows.map(activityTypeToMasterItem);
}

async function getActivityTypeByMasterCode(code) {
  const target = String(code || "").trim();
  const rows = await prisma.activityType.findMany({
    where: { __includeInactive: true },
    orderBy: [{ sort_order: "asc" }, { name: "asc" }]
  });
  return rows.find((row) => String(row.id) === target || activityTypeMasterCode(row) === target || row.name === target) || null;
}

function activityTypeDataFromMasterItem(item, previousMetadata = {}) {
  return {
    name: item.name,
    description: item.description || "",
    active: item.active !== false,
    sort_order: Number(item.sort_order || 100),
    metadata: {
      ...safeMetadata(previousMetadata),
      code: item.code,
      source: "admin_user_master_data"
    }
  };
}

function emptyLegacyPermissions() {
  return Object.fromEntries(PERMISSION_CATALOG.map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, false]))
  ]));
}

function filterPermissionCatalog(activeModules) {
  return PERMISSION_CATALOG.filter((item) => item.key !== "empresas" && tenantHasModule(activeModules, item.module));
}

function normalizeLegacyPermissions(raw, activeModules = null) {
  const catalog = activeModules ? filterPermissionCatalog(activeModules) : PERMISSION_CATALOG;
  const base = Object.fromEntries(catalog.map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, false]))
  ]));
  if (!raw || typeof raw !== "object") return base;
  for (const item of catalog) {
    for (const action of item.actions) {
      base[item.key][action] = Boolean(raw[item.key]?.[action]);
    }
  }
  return base;
}

function legacyToRbacPermissions(raw, activeModules = null) {
  const catalog = activeModules ? filterPermissionCatalog(activeModules) : PERMISSION_CATALOG;
  const legacy = normalizeLegacyPermissions(raw, activeModules);
  const grants = new Map();
  for (const item of catalog) {
    for (const action of item.actions) {
      if (!legacy[item.key][action]) continue;
      for (const [module, mappedAction] of item.grants[action] || []) {
        grants.set(`${module}:${mappedAction}`, { module, action: mappedAction });
      }
    }
  }
  return Array.from(grants.values());
}

function permissionsToLegacy(role, activeModules = null) {
  const catalog = activeModules ? filterPermissionCatalog(activeModules) : PERMISSION_CATALOG;
  if (role.name === "APEX_ADMIN" || role.permissions?.some((p) => p.module === "*" && p.action === "*")) {
    return Object.fromEntries(catalog.map((item) => [
      item.key,
      Object.fromEntries(item.actions.map((action) => [action, true]))
    ]));
  }
  return normalizeLegacyPermissions(role.metadata?.legacy_permissions || {}, activeModules);
}

function roleDto(role, activeModules = null) {
  const metadata = role.metadata || {};
  const permissions = role.permissions || [];
  const legacy = permissionsToLegacy(role, activeModules);
  const activeModuleCount = Object.entries(legacy).filter(([, actions]) => Object.values(actions || {}).some(Boolean)).length;
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
    access_profile: metadata.access_profile || "standard",
    scope: metadata.scope || "company",
    scopes: metadata.scopes || { locations: [], areas: [], cost_centers: [], processes: [] },
    restrictions: metadata.restrictions || { locations: [], areas: [], cost_centers: [], processes: [] },
    can_delegate: Boolean(metadata.can_delegate),
    sensitive: Boolean(metadata.sensitive),
    impact_summary: { modules: activeModuleCount, actions: activeActions, raw_permissions: permissions.length },
    permissions: legacy,
    raw_permissions: permissions
  };
}

async function getTenantActiveModules(tenantId) {
  tenantId = normalizeTenantId(tenantId);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { active_modules: true } });
  return normalizeActiveModules(tenant?.active_modules);
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
    profile_kind: metadata.profile_kind || metadata.user_kind || operational.classification || "administrativo",
    user_kind: metadata.user_kind || metadata.profile_kind || operational.classification || "administrativo",
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

function normalizeUsernameEmail(value, fallbackDomain = "apex.local") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text.includes("@") ? text : `${text}@${fallbackDomain}`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeProfileKind(value) {
  const profileKind = cleanText(value).toLowerCase();
  return profileKind === "technician" ? "tecnico" : profileKind;
}

function validateRequiredUserInput(input, { requirePassword = false } = {}) {
  const fullName = cleanText(input.name || `${cleanText(input.first_names)} ${cleanText(input.last_names)}`);
  const email = normalizeUsernameEmail(input.email || input.username || input.user || input.access_email);
  if (!fullName) throw badRequest("El nombre del usuario es obligatorio.");
  if (!email) throw badRequest("El correo del usuario es obligatorio.");
  if (!cleanText(input.role_id)) throw badRequest("El rol principal es obligatorio.");
  if (!cleanText(input.company || input.empresa || input.company_id)) throw badRequest("La empresa del usuario es obligatoria.");
  if (!cleanText(input.document)) throw badRequest("El numero de documento es obligatorio.");
  if (requirePassword && !cleanText(input.password || input.pas)) throw badRequest("La clave inicial es obligatoria.");
  return { fullName, email };
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

async function upsertRoleFromLegacy(tenantId, data, activeModules = null) {
  tenantId = normalizeTenantId(tenantId);
  const tenantModules = activeModules || await getTenantActiveModules(tenantId);
  const legacyPermissions = normalizeLegacyPermissions(data.permissions || data.legacy_permissions || {}, tenantModules);
  const rbacPermissions = data.name === "APEX_ADMIN"
    ? [{ module: "*", action: "*" }]
    : legacyToRbacPermissions(legacyPermissions, tenantModules);
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
      access_profile: data.access_profile || "standard",
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

const systemRolesReady = new Set();
const systemRolesInFlight = new Map();

async function ensureSystemRoles(tenantId) {
  tenantId = normalizeTenantId(tenantId);
  if (systemRolesReady.has(tenantId)) return;
  if (systemRolesInFlight.has(tenantId)) return systemRolesInFlight.get(tenantId);

  const bootstrap = prisma.runWithTenant(tenantId, async () => {
    const activeModules = await getTenantActiveModules(tenantId);
    const templatesByName = new Map(SYSTEM_ROLE_TEMPLATES.map((template) => [template.name, template]));
    const currentRoles = await prisma.role.findMany({
      where: { name: { in: [...templatesByName.keys()] } },
      select: { name: true }
    });
    const existing = new Set(currentRoles.map((role) => role.name));
    for (const template of SYSTEM_ROLE_TEMPLATES) {
      if (!existing.has(template.name)) await upsertRoleFromLegacy(tenantId, { ...template, active: true }, activeModules);
    }
    if (tenantHasModule(activeModules, "commercial-management")) {
      const commercialRole = await prisma.role.findFirst({ where: { tenant_id: tenantId, name: "Comercial" }, include: { permissions: true } });
      if (commercialRole) {
        const commercialLegacy = permissionPreset(["gestion_comercial"], ["access", "view", "create", "edit", "export", "reports"]);
        const mergedLegacy = normalizeLegacyPermissions({ ...(commercialRole.metadata?.legacy_permissions || {}), gestion_comercial: commercialLegacy.gestion_comercial }, activeModules);
        await prisma.role.update({ where: { id: commercialRole.id }, data: { description: "Asesor comercial con acceso exclusivo a su cartera, visitas, documentos, compromisos, presupuesto y reportes.", metadata: { ...(commercialRole.metadata || {}), legacy_permissions: mergedLegacy } } });
        await prisma.permission.createMany({ data: legacyToRbacPermissions(mergedLegacy, activeModules).map((permission) => ({ role_id: commercialRole.id, ...permission })), skipDuplicates: true });
      }
    }
  });
  systemRolesInFlight.set(tenantId, bootstrap);
  try {
    await bootstrap;
    systemRolesReady.add(tenantId);
  } finally {
    systemRolesInFlight.delete(tenantId);
  }
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

async function getPermissionCatalog(tenantId) {
  const activeModules = await getTenantActiveModules(tenantId);
  return filterPermissionCatalog(activeModules).map(({ key, label, group, module, submodule, actions }) => ({ key, label, group, module, submodule, actions }));
}

async function getUserMasterData(tenantId) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => cloneUserMasterData({
    activity_types: await listActivityTypeMasterItems()
  }));
}

function assertUserMasterCatalog(catalog) {
  const allowed = new Set(Object.keys(USER_MASTER_DATA));
  if (!allowed.has(catalog)) {
    const err = new Error("Catalogo de usuario no soportado.");
    err.statusCode = 400;
    throw err;
  }
}

function normalizeUserMasterItem(input, fallback = {}) {
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  if (!code || !name) {
    const err = new Error("Codigo y nombre son obligatorios.");
    err.statusCode = 400;
    throw err;
  }
  return {
    ...fallback,
    code,
    name,
    description: String(input.description || "").trim(),
    active: input.active !== false,
    sort_order: Number(input.sort_order || 100)
  };
}

async function auditUserMasterDataItem(tenantId, actorId, action, catalog, code, oldValue, newValue) {
  await prisma.auditLog.create({
    data: {
      tenant_id: tenantId,
      user_id: actorId,
      action,
      module: "admin",
      entity: `/api/v1/admin/user-master-data/${catalog}/items`,
      entity_id: code,
      old_value: oldValue,
      new_value: newValue
    }
  }).catch(() => null);
}

async function addUserMasterDataItem(tenantId, catalog, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  assertUserMasterCatalog(catalog);
  const item = normalizeUserMasterItem(input);
  if (catalog === "activity_types") {
    return prisma.runWithTenant(tenantId, async () => {
      await ensureAdminActivityTypes();
      const byCode = await getActivityTypeByMasterCode(item.code);
      const byName = await prisma.activityType.findFirst({
        where: { __includeInactive: true, name: item.name }
      });
      const previous = byCode || byName || null;
      const target = byCode || byName;
      if (byCode && byName && byCode.id !== byName.id) {
        const err = new Error("Ya existe otro tipo de actividad con ese nombre.");
        err.statusCode = 409;
        throw err;
      }
      if (target) {
        await prisma.activityType.update({
          where: { id: target.id },
          data: activityTypeDataFromMasterItem(item, target.metadata)
        });
      } else {
        await prisma.activityType.create({
          data: activityTypeDataFromMasterItem(item)
        });
      }
      await auditUserMasterDataItem(tenantId, actorId, "catalog_item_upserted", catalog, item.code, previous && activityTypeToMasterItem(previous), item);
      return cloneUserMasterData({ activity_types: await listActivityTypeMasterItems() });
    });
  }
  const current = Array.isArray(USER_MASTER_DATA[catalog]) ? USER_MASTER_DATA[catalog] : [];
  const previous = current.find((entry) => entry.code === item.code) || null;
  USER_MASTER_DATA[catalog] = current.some((entry) => entry.code === item.code)
    ? current.map((entry) => entry.code === item.code ? { ...entry, ...item } : entry)
    : [...current, item];
  return prisma.runWithTenant(tenantId, async () => {
    await auditUserMasterDataItem(tenantId, actorId, "catalog_item_upserted", catalog, item.code, previous, item);
    return cloneUserMasterData({ activity_types: await listActivityTypeMasterItems() });
  });
}

async function updateUserMasterDataItem(tenantId, catalog, code, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  assertUserMasterCatalog(catalog);
  if (catalog === "activity_types") {
    return prisma.runWithTenant(tenantId, async () => {
      await ensureAdminActivityTypes();
      const previousRow = await getActivityTypeByMasterCode(code);
      if (!previousRow) {
        const err = new Error("Item de catalogo no encontrado.");
        err.statusCode = 404;
        throw err;
      }
      const previous = activityTypeToMasterItem(previousRow);
      const nextItem = normalizeUserMasterItem({ ...previous, ...input, code: input.code || previous.code }, previous);
      if (nextItem.code !== code) {
        const conflictingCode = await getActivityTypeByMasterCode(nextItem.code);
        if (conflictingCode && conflictingCode.id !== previousRow.id) {
          const err = new Error("Ya existe otro item con ese codigo.");
          err.statusCode = 409;
          throw err;
        }
      }
      const conflictingName = await prisma.activityType.findFirst({
        where: { __includeInactive: true, name: nextItem.name }
      });
      if (conflictingName && conflictingName.id !== previousRow.id) {
        const err = new Error("Ya existe otro tipo de actividad con ese nombre.");
        err.statusCode = 409;
        throw err;
      }
      await prisma.activityType.update({
        where: { id: previousRow.id },
        data: activityTypeDataFromMasterItem(nextItem, previousRow.metadata)
      });
      await auditUserMasterDataItem(tenantId, actorId, "catalog_item_updated", catalog, nextItem.code, previous, nextItem);
      return cloneUserMasterData({ activity_types: await listActivityTypeMasterItems() });
    });
  }
  const current = Array.isArray(USER_MASTER_DATA[catalog]) ? USER_MASTER_DATA[catalog] : [];
  const previous = current.find((entry) => entry.code === code);
  if (!previous) {
    const err = new Error("Item de catalogo no encontrado.");
    err.statusCode = 404;
    throw err;
  }
  const nextItem = normalizeUserMasterItem({ ...previous, ...input, code: input.code || previous.code }, previous);
  if (nextItem.code !== code && current.some((entry) => entry.code === nextItem.code)) {
    const err = new Error("Ya existe otro item con ese codigo.");
    err.statusCode = 409;
    throw err;
  }
  USER_MASTER_DATA[catalog] = current.map((entry) => entry.code === code ? nextItem : entry);
  return prisma.runWithTenant(tenantId, async () => {
    await auditUserMasterDataItem(tenantId, actorId, "catalog_item_updated", catalog, nextItem.code, previous, nextItem);
    return cloneUserMasterData({ activity_types: await listActivityTypeMasterItems() });
  });
}

async function deleteUserMasterDataItem(tenantId, catalog, code, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  assertUserMasterCatalog(catalog);
  if (catalog === "activity_types") {
    return prisma.runWithTenant(tenantId, async () => {
      await ensureAdminActivityTypes();
      const previousRow = await getActivityTypeByMasterCode(code);
      if (!previousRow) {
        const err = new Error("Item de catalogo no encontrado.");
        err.statusCode = 404;
        throw err;
      }
      const previous = activityTypeToMasterItem(previousRow);
      await prisma.activityType.delete({ where: { id: previousRow.id } });
      await auditUserMasterDataItem(tenantId, actorId, "catalog_item_deleted", catalog, code, previous, null);
      return cloneUserMasterData({ activity_types: await listActivityTypeMasterItems() });
    });
  }
  const current = Array.isArray(USER_MASTER_DATA[catalog]) ? USER_MASTER_DATA[catalog] : [];
  const previous = current.find((entry) => entry.code === code);
  if (!previous) {
    const err = new Error("Item de catalogo no encontrado.");
    err.statusCode = 404;
    throw err;
  }
  USER_MASTER_DATA[catalog] = current.filter((entry) => entry.code !== code);
  return prisma.runWithTenant(tenantId, async () => {
    await auditUserMasterDataItem(tenantId, actorId, "catalog_item_deleted", catalog, code, previous, null);
    return cloneUserMasterData({ activity_types: await listActivityTypeMasterItems() });
  });
}

async function listRoles(tenantId, query = {}, actorRoleName = "") {
  tenantId = normalizeTenantId(tenantId);
  await ensureSystemRoles(tenantId);
  const activeModules = await getTenantActiveModules(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const roles = await prisma.role.findMany({
      include: { permissions: true },
      orderBy: [{ is_system: "desc" }, { name: "asc" }],
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 100), 200)
    });
    return roles
      .filter((role) => role.name !== "APEX_ADMIN" || actorRoleName === "APEX_ADMIN")
      .map((role) => roleDto(role, activeModules));
  });
}

async function createRole(tenantId, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  const activeModules = await getTenantActiveModules(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const name = String(input.name || input.nombre || "").trim().replace(/\s+/g, " ");
    if (!name) {
      const err = new Error("El nombre del rol es obligatorio.");
      err.statusCode = 400;
      throw err;
    }
    if (name.toUpperCase() === "APEX_ADMIN" || String(input.role_type || "").toLowerCase() === "superadmin") {
      const err = new Error("El rol superadministrador es reservado y no puede crearse desde la administracion empresarial.");
      err.statusCode = 403;
      throw err;
    }
    const roleNameKey = normalizeRoleNameKey(name);
    const visualDuplicate = (await prisma.role.findMany({ where: { tenant_id: tenantId }, select: { id: true, name: true } })).find((role) => normalizeRoleNameKey(role.name) === roleNameKey);
    if (visualDuplicate) {
      const err = new Error(`Ya existe un rol visualmente igual: "${visualDuplicate.name}". Usa otro nombre o edita el rol existente.`);
      err.statusCode = 409;
      throw err;
    }
    const role = await upsertRoleFromLegacy(tenantId, { ...input, name, is_system: false }, activeModules);
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "role_created",
        module: "admin",
        entity: "/api/v1/admin/roles",
        entity_id: String(role.id),
        old_value: null,
        new_value: roleDto(role, activeModules)
      }
    });
    return roleDto(role, activeModules);
  });
}

async function updateRole(tenantId, id, input, actorId = null, actorRoleName = "") {
  tenantId = normalizeTenantId(tenantId);
  const activeModules = await getTenantActiveModules(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.role.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { permissions: true } });
    const previous = roleDto(current, activeModules);
    if (current.name === "APEX_ADMIN") {
      if (actorRoleName !== "APEX_ADMIN") {
        const err = new Error("Solo un superadministrador puede modificar el rol APEX_ADMIN.");
        err.statusCode = 403;
        throw err;
      }
      const role = await prisma.role.update({
        where: { id: current.id },
        data: {
          description: input.description || input.descripcion || current.description,
          metadata: { ...(current.metadata || {}), active: true, hierarchy_level: 100, role_type: "superadmin" }
        },
        include: { permissions: true }
      });
      await prisma.auditLog.create({
        data: { tenant_id: tenantId, user_id: actorId, action: "role_updated", module: "admin", entity: "/api/v1/admin/roles", entity_id: String(role.id), old_value: previous, new_value: roleDto(role, activeModules) }
      });
      return roleDto(role, activeModules);
    }
    if (String(input.role_type || "").toLowerCase() === "superadmin") {
      const err = new Error("El tipo superadministrador es reservado para APEX_ADMIN.");
      err.statusCode = 403;
      throw err;
    }
    const legacyPermissions = normalizeLegacyPermissions(input.permissions || {}, activeModules);
    const rbacPermissions = legacyToRbacPermissions(legacyPermissions, activeModules);
    const nextName = current.is_system ? current.name : String(input.name || input.nombre || current.name).trim().replace(/\s+/g, " ");
    if (nextName !== current.name) {
      const roleNameKey = normalizeRoleNameKey(nextName);
      const duplicates = await prisma.role.findMany({ where: { tenant_id: tenantId, NOT: { id: current.id } }, select: { id: true, name: true } });
      const duplicate = duplicates.find((role) => normalizeRoleNameKey(role.name) === roleNameKey);
      if (duplicate) {
        const err = new Error(`Ya existe un rol visualmente igual: "${duplicate.name}". Usa otro nombre o edita el rol existente.`);
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
          access_profile: input.access_profile || current.metadata?.access_profile || "standard",
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
    await authorizationState.revokeRoleUsers(current.id);
    await prisma.auditLog.create({
      data: { tenant_id: tenantId, user_id: actorId, action: "role_updated", module: "admin", entity: "/api/v1/admin/roles", entity_id: String(role.id), old_value: previous, new_value: roleDto(role, activeModules) }
    });
    return roleDto(role, activeModules);
  });
}

async function setRoleActive(tenantId, id, active, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  const activeModules = await getTenantActiveModules(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.role.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { permissions: true } });
    if (current.name === "APEX_ADMIN") return roleDto(current, activeModules);
    const previous = roleDto(current, activeModules);
    const role = await prisma.role.update({
      where: { id: current.id },
      data: { metadata: { ...(current.metadata || {}), active: toBoolean(active) } },
      include: { permissions: true }
    });
    await authorizationState.revokeRoleUsers(current.id, "role_status_changed");
    await prisma.auditLog.create({
      data: { tenant_id: tenantId, user_id: actorId, action: toBoolean(active) ? "role_activated" : "role_deactivated", module: "admin", entity: "/api/v1/admin/roles/status", entity_id: String(role.id), old_value: previous, new_value: roleDto(role, activeModules) }
    });
    return roleDto(role, activeModules);
  });
}

async function deleteRole(tenantId, id, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  const activeModules = await getTenantActiveModules(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.role.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { permissions: true } });
    if (current.name === "APEX_ADMIN" || current.is_system) {
      const err = new Error("Los roles de sistema no se pueden eliminar.");
      err.statusCode = 403;
      throw err;
    }
    const assignedUsers = await prisma.user.count({ where: { role_id: current.id } });
    if (assignedUsers > 0) {
      const err = new Error(`No se puede eliminar este rol porque tiene ${assignedUsers} usuario(s) asignado(s). Reasigna o inactiva esos usuarios primero.`);
      err.statusCode = 409;
      throw err;
    }
    const previous = roleDto(current, activeModules);
    await prisma.role.delete({ where: { id: current.id } });
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: actorId,
        action: "role_deleted",
        module: "admin",
        entity: "/api/v1/admin/roles",
        entity_id: String(current.id),
        old_value: previous,
        new_value: null
      }
    });
    return { ok: true, id: current.id };
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
  const { fullName, email } = validateRequiredUserInput(input, { requirePassword: true });
  const rawPassword = input.password || input.pas || "";
  assertPasswordPolicy(rawPassword);
  const password = await bcrypt.hash(rawPassword, 12);
  return prisma.runWithTenant(tenantId, async () => {
    const existing = await prisma.user.findFirst({ where: { tenant_id: tenantId, email } });
    if (existing) {
      const err = new Error("Ya existe un usuario con este correo en la empresa.");
      err.statusCode = 409;
      throw err;
    }
    const role = input.role_id
      ? await prisma.role.findFirst({ where: { id: Number(input.role_id), tenant_id: tenantId } })
      : await prisma.role.findFirst({ where: { name: "Empleado", tenant_id: tenantId } });
    if (!role) throw badRequest("Debe seleccionar un rol valido para el usuario.");
    if (role?.metadata?.active === false) {
      throw badRequest("El rol seleccionado esta inactivo");
    }
    const profileKind = normalizeProfileKind(input.profile_kind || input.user_kind || input.tipo_usuario || input.operational_classification || role.name);
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
      profile_kind: profileKind || "administrativo",
      user_kind: profileKind || "administrativo",
      access: {
        email: normalizeUsernameEmail(input.access_email || input.email || input.username || input.user || email),
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
            user_type: profileKind === "tecnico" ? "tecnico" : "empleado",
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
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { employee: true } });
    const previousSnapshot = userAuditSnapshot(current, current.employee);
    const previousMetadata = current.employee?.metadata || {};
    const previousAccess = previousMetadata.access || {};
    const previousEmployment = previousMetadata.employment || {};
    const previousOperational = previousMetadata.operational || {};
    const submittedName = cleanText(input.name || input.nombre);
    const submittedPartsName = `${cleanText(input.first_names)} ${cleanText(input.last_names)}`.trim();
    const fullName = cleanText(submittedName || submittedPartsName || current.name);
    const email = normalizeUsernameEmail(input.email || input.username || input.access_email || current.email);
    const roleId = input.role_id ? Number(input.role_id) : current.role_id;
    const company = cleanText(input.company || input.empresa || previousMetadata.company);
    const document = cleanText(input.document || input.documento || previousMetadata.document);
    if (!fullName) throw badRequest("El nombre del usuario es obligatorio.");
    if (!email) throw badRequest("El correo del usuario es obligatorio.");
    if (!roleId) throw badRequest("El rol principal es obligatorio.");
    if (!company) throw badRequest("La empresa del usuario es obligatoria.");
    if (!document) throw badRequest("El numero de documento es obligatorio.");
    const role = await prisma.role.findFirst({ where: { id: roleId, tenant_id: tenantId } });
    if (!role) throw badRequest("Debe seleccionar un rol valido para el usuario.");
    if (role?.metadata?.active === false) throw badRequest("El rol seleccionado esta inactivo");
    const credentialSync = await syncSupabaseCredentials({
      userId: current.preferences?.supabase_user_id,
      currentEmail: current.email,
      nextEmail: email,
      password: input.password || input.pas
    });
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstNames = cleanText(input.first_names) || (nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : nameParts[0] || "");
    const lastNames = cleanText(input.last_names) || (nameParts.length > 1 ? nameParts.slice(-1).join(" ") : "");
    const userStatus = input.user_status || input.labor_status || input.estado_laboral || previousMetadata.user_status || previousMetadata.labor_status || "activo";
    const active = !["inactivo", "suspendido", "retirado"].includes(userStatus) && input.active !== false && input.activo !== false;
    const profileKind = normalizeProfileKind(input.profile_kind || input.user_kind || input.tipo_usuario || previousMetadata.profile_kind || current.employee?.user_type);
    const data = {
      name: fullName,
      email,
      role_id: roleId,
      active
    };
    if (input.password || input.pas) {
      assertPasswordPolicy(input.password || input.pas);
      data.password = await bcrypt.hash(input.password || input.pas, 12);
    }
    await prisma.user.update({ where: { id: current.id }, data });
    await authorizationState.revokeAllUserSessions(current.id, "user_authorization_changed");
    const employeeData = {
      code: cleanText(input.code || input.id_interno) || current.employee?.code || `EMP-${current.id}`,
      user_type: cleanText(input.user_type) || (profileKind === "tecnico" ? "tecnico" : current.employee?.user_type || "empleado"),
      position: cleanText(input.position || input.rol) || current.employee?.position || "empleado",
      department: cleanText(input.department || input.area) || current.employee?.department || "Operacion",
      salary_base: input.salary_base !== undefined || input.salario_base !== undefined || input.salario !== undefined
        ? Number(input.salary_base || input.salario_base || input.salario || 0)
        : Number(current.employee?.salary_base || 0),
      salary_type: cleanText(input.salary_type) || current.employee?.salary_type || "monthly",
      contract_type: cleanText(input.contract_type) || current.employee?.contract_type || previousEmployment.contract_type || "indefinite",
      hire_date: input.hire_date ? new Date(input.hire_date) : current.employee?.hire_date || new Date(),
      end_date: input.end_date ? new Date(input.end_date) : input.end_date === null ? null : current.employee?.end_date || null,
      active,
      metadata: {
        ...previousMetadata,
        name: data.name,
        first_names: firstNames,
        last_names: lastNames,
        document_type: input.document_type || previousMetadata.document_type || "CC",
        document,
        company,
        labor_status: userStatus,
        user_status: userStatus,
        profile_kind: profileKind || previousMetadata.profile_kind || "administrativo",
        user_kind: profileKind || previousMetadata.user_kind || "administrativo",
        phone: input.phone === undefined ? previousMetadata.phone || "" : input.phone,
        address: input.address === undefined ? previousMetadata.address || "" : input.address,
        city: input.city === undefined ? previousMetadata.city || "" : input.city,
        state_region: input.state_region === undefined ? previousMetadata.state_region || "" : input.state_region,
        country: input.country === undefined ? previousMetadata.country || "Colombia" : input.country,
        access: {
          ...previousAccess,
          email,
          site: input.site || input.base_site || previousAccess.site || "",
          role_id: roleId,
          role_name: input.role_name || role.name || previousAccess.role_name || "",
          additional_roles: input.additional_roles === undefined ? previousAccess.additional_roles || "" : input.additional_roles,
          operational_profile: input.operational_profile === undefined ? previousAccess.operational_profile || "" : input.operational_profile,
          area: input.area || input.department || previousAccess.area || "",
          manager: input.manager === undefined ? previousAccess.manager || "" : input.manager,
          special_permissions: input.special_permissions === undefined ? previousAccess.special_permissions || "" : input.special_permissions,
          require_password_change: input.require_password_change === undefined ? Boolean(previousAccess.require_password_change) : toBoolean(input.require_password_change)
        },
        employment: {
          ...previousEmployment,
          engagement_type: input.engagement_type === undefined ? previousEmployment.engagement_type || "empleado" : input.engagement_type,
          contract_type: input.contract_type === undefined ? previousEmployment.contract_type || current.employee?.contract_type || "indefinite" : input.contract_type,
          cost_center: input.cost_center === undefined ? previousEmployment.cost_center || "" : input.cost_center,
          workday: input.workday === undefined ? previousEmployment.workday || "" : input.workday,
          base_shift: input.base_shift === undefined ? previousEmployment.base_shift || "" : input.base_shift,
          labor_notes: input.labor_notes === undefined ? previousEmployment.labor_notes || "" : input.labor_notes
        },
        operational: {
          ...previousOperational,
          classification: input.operational_classification === undefined ? previousOperational.classification || "administrativo" : input.operational_classification,
          can_punch_time: input.can_punch_time === undefined ? Boolean(previousOperational.can_punch_time) : toBoolean(input.can_punch_time),
          can_receive_services: input.can_receive_services === undefined ? Boolean(previousOperational.can_receive_services) : toBoolean(input.can_receive_services),
          can_be_assigned_routes: input.can_be_assigned_routes === undefined ? Boolean(previousOperational.can_be_assigned_routes) : toBoolean(input.can_be_assigned_routes),
          can_manage_inventory: input.can_manage_inventory === undefined ? Boolean(previousOperational.can_manage_inventory) : toBoolean(input.can_manage_inventory),
          can_approve_documents: input.can_approve_documents === undefined ? Boolean(previousOperational.can_approve_documents) : toBoolean(input.can_approve_documents),
          can_authorize_exceptions: input.can_authorize_exceptions === undefined ? Boolean(previousOperational.can_authorize_exceptions) : toBoolean(input.can_authorize_exceptions),
          base_site: input.base_site === undefined ? previousOperational.base_site || "" : input.base_site,
          zone: input.operation_zone === undefined ? previousOperational.zone || "" : input.operation_zone
        },
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
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id, tenant_id: tenantId }, include: { role: true, employee: true } });
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
    return { ...userDto(user), credential_sync: credentialSync };
  });
}

async function setUserActive(tenantId, id, active, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const enabled = toBoolean(active);
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { employee: true } });
    const previousSnapshot = userAuditSnapshot(current, current.employee);
    await prisma.user.update({
      where: { id: Number(id) },
      data: { active: enabled }
    });
    await authorizationState.revokeAllUserSessions(current.id, enabled ? "user_reactivated" : "user_deactivated");
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
    const user = await prisma.user.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { role: true, employee: true } });
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
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { employee: true } });
    const previousSnapshot = userAuditSnapshot(current, current.employee);
    const metadata = current.employee?.metadata || {};
    const access = metadata.access || {};
    const nextSessionStatus = input.session_status || (input.blocked ? "bloqueada" : access.session_status || "sin_sesion");
    if (input.password) assertPasswordPolicy(input.password);
    const credentialSync = await syncSupabaseCredentials({
      userId: current.preferences?.supabase_user_id,
      currentEmail: current.email,
      nextEmail: current.email,
      password: input.password
    });
    await prisma.user.update({
      where: { id: current.id },
      data: {
        ...(input.password ? { password: await bcrypt.hash(input.password, 12) } : {}),
        active: input.active === undefined ? current.active : toBoolean(input.active)
      }
    });
    await authorizationState.revokeAllUserSessions(current.id, "user_access_changed");
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
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id, tenant_id: tenantId }, include: { role: true, employee: true } });
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
    return { ...userDto(user), credential_sync: credentialSync };
  });
}

async function addUserDocument(tenantId, id, input, actorId = null) {
  tenantId = normalizeTenantId(tenantId);
  return prisma.runWithTenant(tenantId, async () => {
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { employee: true } });
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
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id, tenant_id: tenantId }, include: { role: true, employee: true } });
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
    const current = await prisma.user.findFirstOrThrow({ where: { id: Number(id), tenant_id: tenantId }, include: { employee: true } });
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
    const user = await prisma.user.findFirstOrThrow({ where: { id: current.id, tenant_id: tenantId }, include: { role: true, employee: true } });
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

async function listPlatformLogs(tenantId, query = {}) {
  return platformLogs.listPlatformLogs(normalizeTenantId(tenantId), query);
}

async function createClientPlatformLog(tenantId, user, input = {}, requestMeta = {}) {
  const message = String(input.message || "").trim();
  if (!message) throw badRequest("Mensaje requerido para registrar el log.");
  await platformLogs.recordPlatformLog({
    tenant_id: normalizeTenantId(tenantId),
    user_id: user?.id,
    source: "frontend",
    module: String(input.module || "frontend").trim(),
    route: String(input.route || input.path || "frontend").trim(),
    method: String(input.method || "").trim(),
    status_code: input.status_code == null ? null : Number(input.status_code),
    code: String(input.code || "").trim(),
    message,
    detail: String(input.detail || "").trim(),
    request_id: String(input.request_id || "").trim(),
    ip: requestMeta.ip,
    user_agent: requestMeta.user_agent,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  });
  return { ok: true };
}

module.exports = {
  exportTenantData,
  processBilling,
  getPermissionCatalog,
  getUserMasterData,
  addUserMasterDataItem,
  updateUserMasterDataItem,
  deleteUserMasterDataItem,
  listRoles,
  createRole,
  updateRole,
  setRoleActive,
  deleteRole,
  listUsers,
  createUser,
  updateUser,
  setUserActive,
  updateUserAccess,
  addUserDocument,
  removeUserDocument,
  listPlatformLogs,
  createClientPlatformLog
};

