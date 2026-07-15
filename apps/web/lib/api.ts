import { assertActiveSession, clearSession, emitAppAlert, keepSessionAlive, setPasswordChangeRequired, touchSession } from "./sessionSecurity";
import { getSupabaseAccessToken, supabaseAuth, supabaseFetch } from "./supabaseClient";
import { getServiceImageUrl, uploadServiceImageData } from "./supabaseStorage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const SUPABASE_PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || "";
const API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 20000);
const HAS_CONFIGURED_API_URL = Boolean(process.env.NEXT_PUBLIC_API_URL);
const ADMIN_ROLES_STORAGE_KEY = "apexos_admin_roles";
const LEGACY_ADMIN_ROLES_STORAGE_KEY = "apexos_admin_roles_qa";
const USER_MASTER_STORAGE_KEY = "apexos_user_master_data";
const LEGACY_USER_MASTER_STORAGE_KEY = "apexos_user_master_data_qa";
let refreshSessionInFlight: Promise<boolean> | null = null;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

function isSupabaseSession() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("auth_provider") === "supabase") return true;
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.iss || "").includes("supabase") || (!!SUPABASE_PROJECT_REF && String(payload.ref || "") === SUPABASE_PROJECT_REF);
  } catch {
    return false;
  }
}

type AnyRow = Record<string, unknown>;

const fallbackActivityTypes = [
  "Cargue de mercancia en bodega",
  "Inicio de ruta",
  "Entrega en tienda",
  "Entrega en cliente",
  "Recogida de mercancia",
  "Devolucion de mercancia",
  "Novedad en ruta",
  "Vehiculo varado",
  "Espera en punto",
  "Reintento de entrega",
  "Finalizacion de ruta",
  "Apoyo operativo"
].map((name, index) => ({ id: index + 1, name, active: true, sort_order: (index + 1) * 10 }));

const tenantModuleCodesByPermissionModule: Record<string, string[]> = {
  accounting: ["M-07", "contabilidad", "finance", "accounting"],
  admin: ["M-22", "administracion", "administracion_apex", "admin"],
  brain: ["AI-CORE", "apex-ai", "apex_ai", "brain"],
  hr: ["M-17", "talento-humano", "talento_humano", "hr"],
  inventory: ["M-01", "inventario", "inventory"],
  invoicing: ["M-04", "facturacion", "invoicing"],
  payroll: ["M-17", "nomina", "payroll"],
  purchases: ["M-02", "compras", "purchases"],
  projects: ["M-19", "proyectos", "projects"],
  sales: ["M-03", "ventas", "sales"],
  services: ["M-26", "servicios", "services"],
  transport: ["M-14", "transporte", "transport"]
};

function fullName(row: { first_name?: string; last_name?: string; email?: string; id?: string; metadata?: AnyRow }) {
  const metadataName = typeof row.metadata?.name === "string" ? row.metadata.name : "";
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || metadataName || row.email || `Empleado ${String(row.id || "").slice(0, 8)}`;
}

function isActiveEmployeeStatus(value: unknown) {
  const status = String(value ?? "active").trim().toLowerCase();
  return !["inactive", "inactivo", "suspendido", "suspended", "bloqueado", "retirado", "deleted", "false", "0"].includes(status);
}

function requestErrorMessage(path: string, status: number, detail: string) {
  if (status >= 500) return `Error ${status} en ${path}. Backend no disponible${detail ? `: ${detail}` : ""}`;
  if (status === 401) return `Sesion no autorizada en ${path}. Inicia sesion de nuevo.`;
  return `Error ${status} en ${path}: ${detail || "La solicitud no pudo completarse."}`;
}

function isPlatformLogsPath(path: string) {
  return path.includes("/admin/platform-logs");
}

function alertRequestFailure(path: string, status: number | null, detail: string) {
  if (isPlatformLogsPath(path)) return;
  emitAppAlert({
    title: status === 401 ? "Sesion invalida" : "Fallo tecnico detectado",
    message: status === 401 ? "La sesion actual ya no es valida. Debes autenticarte otra vez." : `No fue posible completar la solicitud solicitada por el modulo actual.`,
    technical: `Ruta: ${path}${status ? ` | Estado: ${status}` : ""}${detail ? ` | Detalle: ${detail}` : ""}`,
    level: status === 401 || (status !== null && status >= 500) ? "error" : "warning"
  });
}

function platformModuleFromPath(path: string) {
  const parts = path.split("?")[0].split("/").filter(Boolean);
  const apiIndex = parts.findIndex((part) => part === "v1");
  return parts[apiIndex + 1] || parts[0] || "frontend";
}

function reportClientFailure(path: string, status: number | null, detail: string, method = "GET") {
  if (typeof window === "undefined" || isPlatformLogsPath(path)) return;
  if (!HAS_CONFIGURED_API_URL) return;
  const token = localStorage.getItem("token");
  if (!token) return;
  const payload = {
    source: "frontend",
    module: platformModuleFromPath(path),
    route: path,
    method,
    status_code: status,
    message: status === null ? "Backend no disponible desde frontend" : "Solicitud frontend fallida",
    detail: String(detail || "").slice(0, 1600),
    metadata: {
      href: window.location.href,
      user_email: localStorage.getItem("user_email") || "",
      provider: localStorage.getItem("auth_provider") || "local"
    }
  };
  fetch(`${API_URL}/api/v1/admin/platform-logs/client`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  }).catch(() => undefined);
}

function shouldPreferOperationalApi(path: string) {
  if (path === "/api/v1/hr/employees" || path.startsWith("/api/v1/hr/employees?")) return false;
  return path.startsWith("/api/v1/transport") || path.startsWith("/api/v1/hr");
}

function shouldBlockHrWriteFallback(path: string, method: string) {
  const pathname = path.split("?")[0];
  const criticalWritePaths = new Set([
    "/api/v1/hr/gps/ping",
    "/api/v1/hr/time-punches",
    "/api/v1/hr/work-activities"
  ]);
  return method !== "GET" && criticalWritePaths.has(pathname);
}

async function refreshSessionToken() {
  if (typeof window === "undefined") return false;
  if (refreshSessionInFlight) return refreshSessionInFlight;

  refreshSessionInFlight = (async () => {
    const provider = localStorage.getItem("auth_provider") || "local";
    const refresh = localStorage.getItem("refresh") || "";
    if (!refresh) return false;

    try {
      if (provider === "supabase") {
        const data = await supabaseAuth.refreshSession(refresh);
        if (!data.access_token) return false;
        localStorage.setItem("token", data.access_token);
        if (data.refresh_token) localStorage.setItem("refresh", data.refresh_token);
        if (data.user?.email) localStorage.setItem("user_email", data.user.email);
        touchSession();
        return true;
      }

      if (!HAS_CONFIGURED_API_URL) return false;
      const response = await fetchWithTimeout(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh })
      });
      if (!response.ok) return false;
      const data = await response.json() as { token?: string; refresh?: string; user?: { role?: string; role_permissions?: unknown[]; role_metadata?: Record<string, unknown>; require_password_change?: boolean; session_status?: string } };
      if (!data.token) return false;
      localStorage.setItem("token", data.token);
      if (data.refresh) localStorage.setItem("refresh", data.refresh);
      if (data.user?.role) localStorage.setItem("role_name", data.user.role);
      if (Array.isArray(data.user?.role_permissions)) localStorage.setItem("role_permissions", JSON.stringify(data.user.role_permissions));
      if (data.user?.role_metadata) localStorage.setItem("role_metadata", JSON.stringify(data.user.role_metadata));
      if (Array.isArray(data.user?.role_permissions) || data.user?.role_metadata) localStorage.setItem("apexos_role_context_fetched_at", String(Date.now()));
      setPasswordChangeRequired(Boolean(data.user?.require_password_change));
      touchSession();
      return true;
    } catch {
      return false;
    } finally {
      refreshSessionInFlight = null;
    }
  })();

  return refreshSessionInFlight;
}

export async function authorizedFetch(input: string, options: RequestInit = {}, retried = false): Promise<Response> {
  assertActiveSession();
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  let response: Response;

  try {
    response = await fetchWithTimeout(input, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Servicio no disponible.";
    alertRequestFailure(input, null, detail);
    reportClientFailure(input, null, detail, String(options.method || "GET"));
    if (error instanceof Error) throw error;
    throw new Error("No fue posible completar la solicitud autenticada.");
  }

  if (response.status === 401 && typeof window !== "undefined") {
    if (!retried && await refreshSessionToken()) {
      return authorizedFetch(input, options, true);
    }
    alertRequestFailure(input, 401, "Sesion expirada, revocada o no autorizada.");
    clearSession(isSupabaseSession() ? "supabase_unauthorized" : "unauthorized");
    window.location.href = "/login";
    throw new Error("Tu sesion expiro. Inicia sesion de nuevo.");
  }

  touchSession();
  return response;
}

export async function authorizedJson<T>(input: string, options: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(input, options);
  if (!response.ok) {
    if (response.status >= 500) {
      const detail = await response.text().catch(() => "");
      const message = requestErrorMessage(input, response.status, detail);
      alertRequestFailure(input, response.status, detail);
      reportClientFailure(input, response.status, detail, String(options.method || "GET"));
      throw new Error(message);
    }
    const body = await response.json().catch(() => ({ error: response.statusText }));
    const detail = body.error || body.message || response.statusText;
    const message = requestErrorMessage(input, response.status, detail);
    alertRequestFailure(input, response.status, detail);
    reportClientFailure(input, response.status, detail, String(options.method || "GET"));
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function toNumberId(id: unknown) {
  const text = String(id || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  return Math.abs(hash) || 1;
}

function kpisForOrders(orders: Array<{ status?: string }>) {
  return {
    scheduled: orders.filter((order) => order.status === "agendado").length,
    pending: orders.filter((order) => order.status === "pendiente").length,
    in_progress: orders.filter((order) => ["en_curso", "inspeccion", "ejecucion"].includes(String(order.status))).length,
    closed: orders.filter((order) => order.status === "cerrada").length,
    not_executed: orders.filter((order) => order.status === "no_ejecutada").length,
    total: orders.length
  };
}

async function nextSupabaseServiceOrderNumber(companyId: string) {
  const rows = await supabaseFetch<Array<{ number?: string }>>(
    `/rest/v1/service_orders?select=number&company_id=eq.${encodeURIComponent(companyId)}&number=like.OS-*&order=created_at.desc&limit=200`
  ).catch(() => []);
  let max = 0;
  for (const row of rows) {
    const match = String(row.number || "").match(/^OS-(\d{1,5})$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `OS-${String(max + 1).padStart(5, "0")}`;
}

function effectiveServiceOrderStatus(order: { status?: string; technician_employee_id?: string; metadata?: AnyRow }) {
  if (
    order.status === "pendiente"
    && !order.technician_employee_id
    && (order.metadata?.preorder_status === "agendado" || order.metadata?.requires_admin_completion === true)
  ) {
    return "agendado";
  }
  return order.status || "pendiente";
}

const PHYSICAL_DELETE_PERMISSION = "delete_physical_records";

function protectPhysicalDeleteDefaults(actions: string[]) {
  return Object.fromEntries(actions.map((action) => [action, action === PHYSICAL_DELETE_PERMISSION ? false : true]));
}

const adminPermissionCatalog = [
  { key: "dashboard", label: "Inicio / Dashboard", group: "core", module: "brain", submodule: "home", actions: ["access", "view", "reports"] },
  { key: "usuarios", label: "Usuarios", group: "administracion", module: "admin", submodule: "users", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "attach", "download", "sensitive", "manage_users"] },
  { key: "roles", label: "Roles y permisos", group: "administracion", module: "admin", submodule: "roles", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "configure", "administer", "manage_roles"] },
  { key: "empresas", label: "Empresas / Tenants", group: "administracion", module: "admin", submodule: "tenants", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "configure", "administer", "sensitive"] },
  { key: "clientes", label: "Clientes", group: "comercial", module: "sales", submodule: "customers", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "sensitive"] },
  { key: "proveedores", label: "Proveedores", group: "compras", module: "purchases", submodule: "suppliers", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "export", "import", "sensitive"] },
  { key: "inventarios", label: "Inventarios", group: "operacion", module: "inventory", submodule: "stock", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "configure"] },
  { key: "wms", label: "WMS", group: "operacion", module: "inventory", submodule: "wms", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"] },
  { key: "compras", label: "Compras", group: "compras", module: "purchases", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "attach", "download"] },
  { key: "ventas", label: "Ventas", group: "comercial", module: "sales", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import"] },
  { key: "logistica", label: "Logistica", group: "operacion", module: "transport", submodule: "logistics", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"] },
  { key: "transporte", label: "Transporte", group: "operacion", module: "transport", submodule: "vehicles", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "attach", "download", "configure"] },
  { key: "ultima_milla", label: "Ultima milla", group: "operacion", module: "transport", submodule: "last_mile", actions: ["access", "view", "create", "edit", "approve", "execute", "reports"] },
  { key: "importaciones", label: "Importaciones", group: "operacion", module: "purchases", submodule: "imports", actions: ["access", "view", "create", "edit", "approve", "reject", "void", "export", "import", "attach", "download"] },
  { key: "servicios", label: "Servicios", group: "operacion", module: "services", submodule: "orders", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "attach", "download", "execute", "reports"] },
  { key: "talento_humano", label: "Talento humano", group: "administracion", module: "hr", submodule: "hr", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "export", "import", "sensitive", "reports"] },
  { key: "marcaciones", label: "Marcaciones y jornadas", group: "operacion", module: "hr", submodule: "time", actions: ["access", "view", "create", "edit", "approve", "reject", "export", "reports"] },
  { key: "proyectos", label: "Proyectos", group: "gestion", module: "projects", submodule: "projects", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "export", "attach", "download", "reports"] },
  { key: "contabilidad", label: "Contabilidad", group: "finanzas", module: "accounting", submodule: "accounting", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "void", "export", "import", "sensitive", "reports", "configure"] },
  { key: "facturacion", label: "Facturacion", group: "finanzas", module: "invoicing", submodule: "billing", actions: ["access", "view", "create", "edit", "approve", "reject", "void", "export", "download", "sensitive"] },
  { key: "reportes", label: "Reportes", group: "analitica", module: "admin", submodule: "reports", actions: ["access", "view", "export", "download", "reports", "sensitive"] },
  { key: "automatizaciones", label: "Automatizaciones", group: "sistema", module: "brain", submodule: "automation", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "execute", "configure", "administer"] },
  { key: "documentos", label: "Documentos adjuntos", group: "sistema", module: "admin", submodule: "documents", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "approve", "reject", "attach", "download", "sensitive"] },
  { key: "configuracion", label: "Configuracion general", group: "sistema", module: "admin", submodule: "settings", actions: ["access", "view", "edit", "configure", "administer", "sensitive"] },
  { key: "auditoria", label: "Auditoria", group: "sistema", module: "admin", submodule: "audit", actions: ["access", "view", "export", "download", "reports", "sensitive"] },
  { key: "notificaciones", label: "Notificaciones", group: "sistema", module: "admin", submodule: "notifications", actions: ["access", "view", "create", "edit", "delete", PHYSICAL_DELETE_PERMISSION, "execute", "configure"] },
  { key: "ia", label: "IA / Asistente interno", group: "sistema", module: "brain", submodule: "assistant", actions: ["access", "view", "execute", "configure", "administer", "sensitive"] },
  { key: "nomina", label: "Nomina", group: "finanzas", module: "payroll", submodule: "payroll", actions: ["access", "view", "create", "edit", "approve", "export", "import", "sensitive", "reports"] }
];

function normalizeTenantActiveModules(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim().toLowerCase()).filter(Boolean) : [];
}

function getStoredTenantActiveModules() {
  if (typeof window === "undefined") return [] as string[];
  const raw = localStorage.getItem("tenant_active_modules");
  if (!raw) return [] as string[];
  try {
    return normalizeTenantActiveModules(JSON.parse(raw));
  } catch {
    return [] as string[];
  }
}

function tenantAllowsPermissionModule(activeModules: string[], module?: string) {
  if (!module) return true;
  if (!activeModules.length) return true;
  const allowedCodes = (tenantModuleCodesByPermissionModule[module] || [module]).map((item) => String(item).trim().toLowerCase());
  return allowedCodes.some((code) => activeModules.includes(code));
}

function filteredAdminPermissionCatalog(activeModules = getStoredTenantActiveModules()) {
  return adminPermissionCatalog.filter((item) => item.key !== "empresas" && tenantAllowsPermissionModule(activeModules, item.module));
}

export function fallbackAdminPermissionCatalog() {
  return filteredAdminPermissionCatalog();
}

function filterAdminPermissions(permissions: Record<string, Record<string, boolean>> | undefined, activeModules = getStoredTenantActiveModules()) {
  const catalog = filteredAdminPermissionCatalog(activeModules);
  return Object.fromEntries(catalog.map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, Boolean(permissions?.[item.key]?.[action])]))
  ]));
}

function emptyAdminPermissions(activeModules = getStoredTenantActiveModules()) {
  return Object.fromEntries(filteredAdminPermissionCatalog(activeModules).map((item) => [
    item.key,
    Object.fromEntries(item.actions.map((action) => [action, false]))
  ]));
}

function mergeAdminPermissions(overrides: Record<string, Record<string, boolean>>, activeModules = getStoredTenantActiveModules()) {
  const base = emptyAdminPermissions(activeModules);
  for (const [moduleKey, actions] of Object.entries(overrides || {})) {
    base[moduleKey] = { ...(base[moduleKey] || {}), ...actions };
  }
  return filterAdminPermissions(base, activeModules);
}

function defaultAdminRoles(activeModules = getStoredTenantActiveModules()) {
  const catalog = filteredAdminPermissionCatalog(activeModules);
  const all = Object.fromEntries(catalog.map((item) => [item.key, protectPhysicalDeleteDefaults(item.actions)]));
  const shared = { scopes: { locations: [], areas: [], cost_centers: [], processes: [] }, restrictions: { locations: [], areas: [], cost_centers: [], processes: [] }, can_delegate: false, sensitive: false };
  return [
    { id: 1, name: "Administrador de empresa", description: "Administra usuarios, roles y operacion de la empresa.", active: true, is_system: true, hierarchy_level: 90, role_type: "admin_empresa", scope: "company", permissions: all, ...shared },
    { id: 2, name: "Supervisor operativo", description: "Supervisa ejecucion diaria y evidencias operativas.", active: true, is_system: false, hierarchy_level: 60, role_type: "supervisor", scope: "area", permissions: mergeAdminPermissions({ dashboard: { access: true, view: true, reports: true }, marcaciones: { access: true, view: true, create: true, edit: true, approve: true, reject: true, export: true, reports: true }, servicios: { access: true, view: true, create: true, edit: true, approve: true, attach: true, download: true, reports: true }, transporte: { access: true, view: true, edit: true, reports: true } }, activeModules), ...shared },
    { id: 3, name: "Auxiliar operativo", description: "Registra jornada, actividades y consulta servicios asignados.", active: true, is_system: false, hierarchy_level: 30, role_type: "operativo", scope: "location", permissions: mergeAdminPermissions({ dashboard: { access: true, view: true }, marcaciones: { access: true, view: true, create: true }, servicios: { access: true, view: true, create: true, edit: true, attach: true, download: true }, documentos: { access: true, view: true, attach: true, download: true } }, activeModules), ...shared },
    { id: 4, name: "Auditor", description: "Consulta auditoria, reportes y documentos sensibles.", active: true, is_system: false, hierarchy_level: 65, role_type: "auditor", scope: "company", permissions: mergeAdminPermissions({ dashboard: { access: true, view: true, reports: true }, auditoria: { access: true, view: true, export: true, download: true, reports: true, sensitive: true }, reportes: { access: true, view: true, export: true, download: true, reports: true, sensitive: true }, documentos: { access: true, view: true, download: true, sensitive: true } }, activeModules), ...shared, sensitive: true },
    { id: 5, name: "Soporte tecnico", description: "Soporte de configuracion y diagnostico.", active: true, is_system: false, hierarchy_level: 75, role_type: "soporte", scope: "company", permissions: mergeAdminPermissions({ dashboard: { access: true, view: true, reports: true }, usuarios: { access: true, view: true, edit: true }, roles: { access: true, view: true }, configuracion: { access: true, view: true, edit: true, configure: true }, auditoria: { access: true, view: true, reports: true }, notificaciones: { access: true, view: true, create: true, edit: true }, ia: { access: true, view: true, execute: true } }, activeModules), ...shared },
    { id: 6, name: "Tecnico", description: "Ejecuta exclusivamente servicios activos asignados.", active: true, is_system: true, hierarchy_level: 35, role_type: "operativo", scope: "assigned", permissions: mergeAdminPermissions({ servicios: { access: true, view: true, edit: true, attach: true, download: true } }, activeModules), ...shared },
    { id: 7, name: "Empleado", description: "Consulta operativa y registra jornada.", active: true, is_system: false, hierarchy_level: 20, role_type: "operativo", scope: "location", permissions: mergeAdminPermissions({ dashboard: { access: true, view: true }, marcaciones: { access: true, view: true, create: true }, documentos: { access: true, view: true, download: true } }, activeModules), ...shared }
  ];
}

function normalizeStoredAdminRoles(roles: ReturnType<typeof defaultAdminRoles>, activeModules = getStoredTenantActiveModules()) {
  const defaults = defaultAdminRoles(activeModules);
  const input = Array.isArray(roles) ? roles : [];
  const byName = new Map(input.map((role) => [String(role.name || ""), role]));
  const normalizedDefaults = defaults.map((role) => {
    const current = byName.get(role.name);
    return current ? { ...role, ...current, permissions: filterAdminPermissions(current.permissions || role.permissions, activeModules) } : role;
  });
  const existingDefaultNames = new Set(normalizedDefaults.map((role) => role.name));
  const customRoles = input.filter((role) => !existingDefaultNames.has(String(role.name || ""))).map((role) => ({ ...role, permissions: filterAdminPermissions(role.permissions, activeModules) }));
  return [...normalizedDefaults, ...customRoles];
}

function storedAdminRoles() {
  const activeModules = getStoredTenantActiveModules();
  if (typeof window === "undefined") return defaultAdminRoles(activeModules);
  const raw = localStorage.getItem(ADMIN_ROLES_STORAGE_KEY) || localStorage.getItem(LEGACY_ADMIN_ROLES_STORAGE_KEY);
  if (!raw) return defaultAdminRoles(activeModules);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? normalizeStoredAdminRoles(parsed, activeModules) : defaultAdminRoles(activeModules);
  } catch {
    return defaultAdminRoles(activeModules);
  }
}

function saveStoredAdminRoles(roles: ReturnType<typeof defaultAdminRoles>) {
  if (typeof window !== "undefined") localStorage.setItem(ADMIN_ROLES_STORAGE_KEY, JSON.stringify(roles));
}

function normalizeAdminRoleNameKey(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getStoredUserMasterData() {
  if (typeof window === "undefined") return defaultUserMasterData();
  const raw = localStorage.getItem(USER_MASTER_STORAGE_KEY) || localStorage.getItem(LEGACY_USER_MASTER_STORAGE_KEY);
  if (!raw) return defaultUserMasterData();
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultUserMasterData(), ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return defaultUserMasterData();
  }
}

function saveStoredUserMasterData(data: ReturnType<typeof defaultUserMasterData>) {
  if (typeof window !== "undefined") localStorage.setItem(USER_MASTER_STORAGE_KEY, JSON.stringify(data));
}

function defaultUserMasterData() {
  return {
    document_types: [["CC", "Cedula"], ["CE", "Extranjeria"], ["NIT", "NIT"], ["PAS", "Pasaporte"]].map(([code, name]) => ({ code, name })),
    user_statuses: [["activo", "Activo"], ["inactivo", "Inactivo"], ["suspendido", "Suspendido"], ["bloqueado", "Bloqueado"], ["pendiente_activacion", "Pendiente activacion"]].map(([code, name]) => ({ code, name })),
    user_types: [["administrativo", "Administrativo"], ["conductor", "Conductor"], ["supervisor", "Supervisor"], ["operario", "Operario"], ["tecnico", "Tecnico"], ["bodega", "Bodega"]].map(([code, name]) => ({ code, name })),
    contract_types: [["indefinite", "Indefinido"], ["fixed", "Termino fijo"], ["service", "Prestacion de servicios"], ["temporary", "Temporal"]].map(([code, name]) => ({ code, name })),
    engagement_types: [["empleado", "Empleado"], ["contratista", "Contratista"], ["tercero", "Tercero"], ["temporal", "Temporal"], ["aprendiz", "Aprendiz"]].map(([code, name]) => ({ code, name })),
    session_statuses: [["sin_sesion", "Sin sesion"], ["activa", "Activa"], ["bloqueada", "Bloqueada"]].map(([code, name]) => ({ code, name })),
    user_document_types: [["identity", "Documento de identidad"], ["contract", "Contrato"], ["license", "Licencia de conduccion"], ["social_security", "Seguridad social"], ["bank_certificate", "Certificado bancario"], ["occupational_exam", "Examen medico ocupacional"], ["internal", "Documento interno"]].map(([code, name]) => ({ code, name })),
    areas: [["OPER", "Operacion"], ["SERV", "Servicios"], ["TRANSP", "Transporte"], ["ADMIN", "Administracion"], ["BODEGA", "Bodega"]].map(([code, name]) => ({ code, name })),
    positions: [["ADMIN", "Administrador"], ["SUP_RUTA", "Supervisor de ruta"], ["CONDUCTOR", "Conductor"], ["TECNICO", "Tecnico de servicios"], ["AUX_OPER", "Auxiliar operativo"]].map(([code, name]) => ({ code, name })),
    locations: [["SEDE-PRINCIPAL", "Sede principal"], ["BOG-NORTE", "Bogota Norte"], ["BOG-SUR", "Bogota Sur"]].map(([code, name]) => ({ code, name })),
    cost_centers: [["CC-OPER", "Operacion"], ["CC-TRAN", "Transporte"], ["CC-ADMIN", "Administracion"]].map(([code, name]) => ({ code, name })),
    work_shifts: [["DIURNO", "Diurno"], ["NOCTURNO", "Nocturno"], ["MIXTO", "Mixto"]].map(([code, name]) => ({ code, name })),
    banks: [["BANCOLOMBIA", "Bancolombia"], ["BOGOTA", "Banco de Bogota"], ["DAVIVIENDA", "Davivienda"]].map(([code, name]) => ({ code, name }))
  };
}

function nextPunchFrom(types: string[]) {
  if (!types.includes("entrada")) return "entrada";
  if (!types.includes("inicio_almuerzo")) return "inicio_almuerzo";
  if (!types.includes("fin_almuerzo")) return "fin_almuerzo";
  if (!types.includes("salida")) return "salida";
  return null;
}

function localDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function safeDevLog(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[apexos] ${message}`, error instanceof Error ? error.message : String(error));
  }
}

type ServiceEvidenceRow = {
  id: string;
  order_id?: string;
  evidence_type?: string;
  file_url?: string;
  storage_bucket?: string;
  storage_path?: string;
  mime_type?: string;
  size_bytes?: number;
  metadata?: AnyRow;
  created_at?: string;
};

async function resolveServiceEvidencePhoto(photo: ServiceEvidenceRow) {
  const legacyBase64 = photo.file_url?.startsWith("data:") ? photo.file_url : "";
  let fileUrl = legacyBase64 ? "" : photo.file_url || "";
  if (photo.storage_path) {
    const storageValue = photo.storage_path.startsWith("service-images/")
      ? photo.storage_path
      : `${photo.storage_bucket || "service-images"}/${photo.storage_path}`;
    try {
      fileUrl = await getServiceImageUrl(storageValue);
    } catch (error) {
      safeDevLog("No fue posible firmar una evidencia de servicio.", error);
    }
  }
  return {
    ...photo,
    type: String(photo.metadata?.original_type || photo.evidence_type || ""),
    file_url: fileUrl,
    base64_data: legacyBase64
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("La plataforma no respondio a tiempo. Reintenta en unos segundos.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function currentSupabaseUserId() {
  if (typeof window === "undefined") return "";
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.sub || "");
  } catch {
    return "";
  }
}

function currentSupabaseUserEmail() {
  if (typeof window === "undefined") return "";
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.email || payload.user_metadata?.email || "");
  } catch {
    return "";
  }
}

function currentSupabaseUserName() {
  if (typeof window === "undefined") return "";
  const token = localStorage.getItem("token");
  if (!token?.includes(".")) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.name || payload.user_metadata?.name || payload.user_metadata?.full_name || payload.email || "");
  } catch {
    return "";
  }
}

function identityAliasValues(row: {
  id?: unknown;
  employee_id?: unknown;
  user_id?: unknown;
  user_name?: unknown;
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  document_number?: unknown;
  metadata?: AnyRow;
}) {
  const metadataAliases = Array.isArray(row.metadata?.identity_aliases) ? row.metadata.identity_aliases : [];
  return Array.from(new Set([
    row.id,
    row.employee_id,
    row.user_id,
    row.user_name,
    row.email,
    row.document_number,
    row.metadata?.code,
    row.metadata?.name,
    row.metadata?.employee_code,
    row.metadata?.employee_name,
    row.metadata?.supplied_user_name,
    ...metadataAliases,
    fullName({
      first_name: String(row.first_name || ""),
      last_name: String(row.last_name || ""),
      email: String(row.email || ""),
      id: String(row.id || row.employee_id || row.user_id || ""),
      metadata: row.metadata
    })
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function hasStoredPermission(module: string, action: string) {
  if (typeof window === "undefined") return false;
  try {
    const permissions = JSON.parse(localStorage.getItem("role_permissions") || "[]");
    return Array.isArray(permissions) && permissions.some((permission) => {
      const permissionModule = String(permission.module || "").toLowerCase();
      const permissionAction = String(permission.action || "").toLowerCase();
      return (permissionModule === "*" || permissionModule === module) && (permissionAction === "*" || permissionAction === action);
    });
  } catch {
    return false;
  }
}

function isGenericIdentityAlias(value: unknown) {
  return /^(usuario[-\s]\d+|usr-\d+)$/i.test(String(value || "").trim());
}

function displayNameForIdentity(row: { user_name?: unknown; first_name?: string; last_name?: string; email?: string; id?: string; employee_id?: unknown; user_id?: unknown; metadata?: AnyRow }) {
  const metadataName = String(row.metadata?.employee_name || row.metadata?.name || "").trim();
  const supplied = String(row.metadata?.supplied_user_name || "").trim();
  const rawUserName = String(row.user_name || "").trim();
  const name = fullName({
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    id: String(row.id || row.employee_id || row.user_id || ""),
    metadata: row.metadata
  });
  return (!isGenericIdentityAlias(metadataName) && metadataName)
    || (!isGenericIdentityAlias(supplied) && supplied)
    || (!isGenericIdentityAlias(rawUserName) && rawUserName)
    || name;
}

function identityAliasSet(row: Parameters<typeof identityAliasValues>[0]) {
  return new Set(identityAliasValues(row).map((value) => value.toLowerCase()));
}

function identityOverlaps(left: string[], right: string[]) {
  const rightSet = new Set(right.map((value) => value.toLowerCase()));
  return left.some((value) => rightSet.has(value.toLowerCase()));
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function operationalRouteKey(row: { route_id?: unknown; metadata?: AnyRow }) {
  return String(row.route_id || row.metadata?.display_route_id || row.metadata?.legacy_route_id || "sin_horario");
}

async function currentSupabaseEmployee() {
  const userId = currentSupabaseUserId();
  const userFilter = userId ? `&user_id=eq.${userId}` : "";
  const rows = await supabaseFetch<Array<{
    id: string;
    company_id?: string;
    user_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    document_number?: string;
    position?: string;
    user_type?: string;
    metadata?: AnyRow;
  }>>(`/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,email,document_number,position,user_type,metadata&status=eq.active${userFilter}&order=created_at.desc&limit=1`);
  if (rows[0]) return rows[0];

  const membership = await currentSupabaseCompanyUser();
  if (!membership?.company_id || !userId) return null;
  const email = currentSupabaseUserEmail();
  const userName = currentSupabaseUserName();
  const candidates = await supabaseFetch<Array<{
    id: string;
    company_id?: string;
    user_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    document_number?: string;
    position?: string;
    user_type?: string;
    metadata?: AnyRow;
  }>>(`/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,email,document_number,position,user_type,metadata&company_id=eq.${encodeURIComponent(membership.company_id)}&status=eq.active&order=created_at.desc&limit=300`).catch(() => []);
  const wanted = [userId, email, userName].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  const matched = candidates.find((employee) => {
    const aliases = identityAliasSet(employee);
    return wanted.some((value) => aliases.has(value));
  });
  if (matched) return matched;
  return {
    id: userId,
    company_id: membership.company_id,
    user_id: userId,
    first_name: userName || "Usuario",
    last_name: userName ? "" : "Supabase",
    email,
    position: membership.role || "operario",
    user_type: membership.role === "admin" || membership.role === "owner" ? "administrador" : "operario",
    metadata: {
      name: userName || email || `Usuario ${userId.slice(0, 8)}`,
      virtual_employee: true,
      source: "company_users_fallback"
    }
  };
}

function technicianSession() {
  return typeof window !== "undefined" && localStorage.getItem("role_name")?.toLowerCase() === "tecnico";
}

function isVirtualEmployee(employee: { metadata?: AnyRow } | null | undefined) {
  return employee?.metadata?.virtual_employee === true;
}

function supabaseEmployeeIdentity(employee: {
  id?: string;
  user_id?: string;
  email?: string;
  metadata?: AnyRow;
  first_name?: string;
  last_name?: string;
  document_number?: string;
}, preferredUserName?: unknown) {
  const virtual = isVirtualEmployee(employee);
  const aliases = identityAliasValues({
    id: employee.id,
    user_id: employee.user_id,
    email: employee.email,
    first_name: employee.first_name,
    last_name: employee.last_name,
    document_number: employee.document_number,
    metadata: employee.metadata
  });
  const userName = String(
    preferredUserName ||
    employee.metadata?.code ||
    employee.metadata?.name ||
    fullName(employee) ||
    employee.email ||
    employee.id ||
    ""
  ).trim();
  return {
    employee_id: virtual ? null : employee.id || null,
    user_id: employee.user_id || (virtual ? employee.id || null : null),
    user_name: userName || "usuario_supabase",
    aliases: Array.from(new Set([userName, ...aliases].filter(Boolean).map((value) => String(value)))),
    virtual
  };
}

async function currentSupabaseRouteIdForEmployee(employee: {
  id?: string;
  company_id?: string;
  user_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  document_number?: string;
  metadata?: AnyRow;
}, preferredRouteId?: unknown) {
  const preferred = String(preferredRouteId || "").trim();
  if (preferred && isUuid(preferred)) return preferred;
  if (!employee.company_id) return null;
  const day = localDate();
  const routes = await supabaseFetch<Array<{ id: string; code?: string; route_date: string; status?: string; metadata?: AnyRow }>>(
    `/rest/v1/operational_routes?select=id,code,route_date,status,metadata&company_id=eq.${encodeURIComponent(employee.company_id)}&route_date=eq.${encodeURIComponent(day)}&status=neq.cancelled&order=start_time.asc&limit=120`
  ).catch(() => []);
  if (preferred) {
    const matchedRoute = routes.find((route) => (
      route.id === preferred
      || String(route.code || "") === preferred
      || String(route.metadata?.legacy_id || "") === preferred
      || String(route.metadata?.display_id || "") === preferred
    ));
    if (matchedRoute?.id && isUuid(matchedRoute.id)) return matchedRoute.id;
  }
  const routeIds = new Set(routes.map((route) => route.id));
  if (!routeIds.size) return null;
  const assignments = await supabaseFetch<Array<{
    route_id: string;
    employee_id: string;
    employees?: { id?: string; user_id?: string; first_name?: string; last_name?: string; email?: string; document_number?: string; metadata?: AnyRow };
  }>>(`/rest/v1/route_assignments?select=route_id,employee_id,employees(id,user_id,first_name,last_name,email,document_number,metadata)&company_id=eq.${encodeURIComponent(employee.company_id)}&limit=500`).catch(() => []);
  const currentAliases = identityKeys(employee);
  const matched = assignments.find((assignment) => {
    if (!routeIds.has(assignment.route_id)) return false;
    if (assignment.employee_id === employee.id) return true;
    const assignedAliases = identityKeys({ ...(assignment.employees || {}), employee_id: assignment.employee_id });
    return identityOverlaps(currentAliases, assignedAliases);
  });
  return matched?.route_id || null;
}

function identityKeys(row: {
  employee_id?: unknown;
  user_id?: unknown;
  user_name?: unknown;
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  document_number?: unknown;
  metadata?: AnyRow;
}) {
  return identityAliasValues(row);
}

async function accessibleSupabaseServiceOrder(orderId: string, options: { includeFinished?: boolean } = {}) {
  const employee = technicianSession() ? await currentSupabaseEmployee() : null;
  if (technicianSession() && (!employee || isVirtualEmployee(employee))) {
    throw new Error("No se encontro una ficha tecnica activa para operar servicios.");
  }
  const companyId = employee?.company_id || await currentSupabaseCompanyId();
  const technicianFilter = employee ? `&technician_employee_id=eq.${encodeURIComponent(employee.id)}` : "";
  const activeFilter = technicianSession() && !options.includeFinished ? "&status=in.(pendiente,en_curso,inspeccion,ejecucion)" : "";
  const rows = await supabaseFetch<Array<{ id: string; company_id: string; technician_employee_id?: string; status?: string; started_at?: string; metadata?: AnyRow }>>(
    `/rest/v1/service_orders?select=id,company_id,technician_employee_id,status,started_at,metadata&id=eq.${encodeURIComponent(orderId)}&company_id=eq.${encodeURIComponent(companyId)}${technicianFilter}${activeFilter}&limit=1`
  );
  if (!rows[0]) throw new Error("No se encontro el servicio o no tienes permisos para operarlo.");
  return rows[0];
}

async function currentSupabaseCompanyUser() {
  const userId = currentSupabaseUserId();
  if (!userId) return null;
  const rows: Array<{ company_id: string; company_name?: string; role?: string }> = await supabaseFetch<Array<{ company_id: string; company_name?: string; role?: string }>>(
    `/rest/v1/v_user_companies?select=company_id,company_name,role&user_id=eq.${userId}&limit=20`
  ).catch(() => supabaseFetch<Array<{ company_id: string; role?: string }>>(`/rest/v1/company_users?select=company_id,role&user_id=eq.${userId}&status=eq.active&limit=20`));
  const preferredCompanyId = typeof window !== "undefined" ? localStorage.getItem("apexos_company_id") : "";
  const selected = rows.find((row) => row.company_id === preferredCompanyId)
    || rows.find((row) => ["owner", "admin", "superadmin"].includes(String(row.role || "").toLowerCase()))
    || rows[0]
    || null;
  if (selected && typeof window !== "undefined") {
    localStorage.setItem("apexos_company_id", selected.company_id);
    if (selected.company_name) localStorage.setItem("apexos_company_name", selected.company_name);
  }
  return selected;
}

async function nextAdminUsersRequest<T>(init: RequestInit = {}, query = "") {
  const token = getSupabaseAccessToken();
  if (!token) throw new Error("Sesion requerida para gestionar usuarios.");
  const response = await fetch(`/api/admin/users${query}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || "No fue posible gestionar usuarios.");
  }
  return response.json() as Promise<T>;
}

function supabaseVehicleStatus(status: unknown) {
  const value = String(status || "").toLowerCase();
  if (value === "inactivo") return "inactive";
  if (value === "retirado") return "retired";
  if (value === "bloqueado" || value === "mantenimiento") return "maintenance";
  return ["active", "inactive", "maintenance", "retired"].includes(value) ? value : "active";
}

function dateOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function uuidOrNull(value: unknown) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function supabaseVehiclePayload(input: AnyRow, companyId?: string) {
  return {
    ...(companyId ? { company_id: companyId } : {}),
    plate: String(input.plate || "").toUpperCase().replace(/\s+/g, ""),
    type: input.type || input.category || "vehiculo",
    category: input.category || input.type || "vehiculo",
    brand: input.brand || null,
    line: input.line || null,
    model: input.model || null,
    year: input.year ? Number(input.year) : null,
    color: input.color || null,
    vin_chassis: input.vin_chassis || null,
    engine_number: input.engine_number || null,
    cylinder_capacity: input.cylinder_capacity || null,
    fuel: input.fuel || null,
    body_type: input.body_type || null,
    axle_count: input.axle_count ? Number(input.axle_count) : null,
    capacity_value: input.capacity_value ? Number(input.capacity_value) : null,
    capacity_unit: input.capacity_unit || null,
    volume_available: input.volume_available ? Number(input.volume_available) : null,
    mileage: input.mileage ? Number(input.mileage) : 0,
    ownership_type: input.ownership_type || null,
    legal_owner: input.legal_owner || null,
    owner: input.owner || input.legal_owner || null,
    owner_document: input.owner_document || null,
    linked_company: input.linked_company || null,
    cost_center: input.cost_center || null,
    base_site: input.base_site || null,
    authorized_driver_id: uuidOrNull(input.authorized_driver_id),
    authorized_driver_name: input.authorized_driver_name || null,
    authorized_driver_document: input.authorized_driver_document || null,
    authorized_driver_code: input.authorized_driver_code || null,
    linked_at: dateOrNull(input.linked_at),
    unlinked_at: dateOrNull(input.unlinked_at),
    status: supabaseVehicleStatus(input.status),
    active: !["inactive", "retired"].includes(supabaseVehicleStatus(input.status)),
    soat_issued_at: dateOrNull(input.soat_issued_at),
    soat_expires: dateOrNull(input.soat_expires),
    technical_review_issued_at: dateOrNull(input.technical_review_issued_at),
    technical_review_expires: dateOrNull(input.technical_review_expires),
    property_card: input.property_card || null,
    contractual_policy_expires: dateOrNull(input.contractual_policy_expires),
    extra_contractual_policy_expires: dateOrNull(input.extra_contractual_policy_expires),
    cargo_registry: input.cargo_registry || null,
    special_permits: input.special_permits || null,
    normative_restrictions: input.normative_restrictions || null,
    legal_notes: input.legal_notes || null,
    metadata: { ...(typeof input.metadata === "object" && input.metadata ? input.metadata : {}), notes: input.notes || "" }
  };
}

type SupabaseServiceReference = {
  id: string;
  company_id?: string;
  code: string;
  name: string;
  category?: string;
  description?: string;
  estimated_minutes?: number;
  brand?: string;
  model?: string;
  active?: boolean;
  metadata?: AnyRow;
};

type SupabaseServiceReferencePart = {
  id?: string;
  reference_id: string;
  name: string;
  quantity: number;
  unit: string;
  description?: string;
  display_order?: number;
};

const DEFAULT_SERVICE_TYPES = [
  { code: "montaje", label: "Montaje", active: true },
  { code: "desmontaje", label: "Desmontaje", active: true },
  { code: "ambos", label: "Montaje y desmontaje", active: true }
];
const DEFAULT_SERVICE_STORES = [
  { code: "hogar_y_moda_1", label: "Hogar y Moda 1", active: true },
  { code: "hogar_y_moda_2", label: "Hogar y Moda 2", active: true }
];
const DEFAULT_SATISFACTION_QUESTIONS = [
  { id: "service_quality", label: "Como calificas la calidad del servicio realizado?", active: true },
  { id: "technician_attention", label: "Como calificas la atencion y claridad del tecnico?", active: true },
  { id: "final_result", label: "Que tan satisfecho quedaste con el resultado final?", active: true }
];
const SERVICE_TYPES_REFERENCE_CODE = "__SERVICE_TYPES__";

function serviceTypeCode(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeServiceTypes(rows: unknown) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_SERVICE_TYPES;
  const seen = new Set<string>();
  return source
    .map((item) => {
      const row = item && typeof item === "object" ? item as AnyRow : {};
      const code = serviceTypeCode(row.code || row.label);
      const label = String(row.label || row.code || "").trim();
      return { code, label, active: row.active !== false };
    })
    .filter((item) => item.code && item.label && !seen.has(item.code) && seen.add(item.code));
}

function normalizeServiceStores(rows: unknown) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_SERVICE_STORES;
  const seen = new Set<string>();
  return source
    .map((item) => {
      const row = item && typeof item === "object" ? item as AnyRow : {};
      const code = serviceTypeCode(row.code || row.label);
      const label = String(row.label || row.code || "").trim();
      return { code, label, active: row.active !== false };
    })
    .filter((item) => item.code && item.label && !seen.has(item.code) && seen.add(item.code));
}

function satisfactionQuestionId(value: unknown) {
  return serviceTypeCode(value);
}

function normalizeSatisfactionQuestions(rows: unknown) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_SATISFACTION_QUESTIONS;
  const seen = new Set<string>();
  return source
    .map((item) => {
      const row = item && typeof item === "object" ? item as AnyRow : {};
      const id = satisfactionQuestionId(row.id || row.label);
      const label = String(row.label || row.id || "").trim();
      return { id, label, active: row.active !== false };
    })
    .filter((item) => item.id && item.label && !seen.has(item.id) && seen.add(item.id));
}

async function currentSupabaseCompanyId() {
  const employee = await currentSupabaseEmployee().catch(() => null);
  const membership = employee?.company_id ? null : await currentSupabaseCompanyUser();
  const companyId = employee?.company_id || membership?.company_id;
  if (!companyId) throw new Error("No se encontro una empresa activa para servicios.");
  return companyId;
}

async function activeSupabaseServiceTechnician(companyId: string, technicianId: unknown) {
  const id = uuidOrNull(technicianId);
  if (!id) throw new Error("Selecciona un tecnico operativo activo de esta empresa.");
  const technicians = await supabaseFetch<Array<{ id: string; user_id?: string }>>(
    `/rest/v1/employees?select=id,user_id&id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&user_type=eq.tecnico&limit=1`
  );
  if (!technicians[0]?.id) throw new Error("Selecciona un tecnico operativo activo de esta empresa.");
  return technicians[0];
}

async function supabaseServiceTypes() {
  const companyId = await currentSupabaseCompanyId();
  const rows = await supabaseFetch<Array<{ metadata?: AnyRow }>>(
    `/rest/v1/service_references?select=metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=1`
  ).catch(() => []);
  return normalizeServiceTypes(rows[0]?.metadata?.service_types);
}

async function savePublicServiceCatalog<T>(payload: Record<string, unknown>, responseKey: string, fallback: T) {
  const companyId = await currentSupabaseCompanyId();
  const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
  const companyName = typeof window !== "undefined" ? localStorage.getItem("apexos_company_name") || localStorage.getItem("company_name") || "" : "";
  const requestPath = companyName ? `/api/public/service-requests?empresa=${encodeURIComponent(companyName)}` : "/api/public/service-requests";
  const response = await fetch(requestPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ company_id: companyId, company_name: companyName, ...payload })
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.message || response.statusText || "No fue posible actualizar el catalogo publico."));
  return (body[responseKey] || fallback) as T;
}

async function saveSupabaseServiceTypes(typesInput: unknown) {
  if (technicianSession()) throw new Error("El tecnico no puede modificar tipos de servicio.");
  const types = normalizeServiceTypes(typesInput);
  if (!types.some((item) => item.active)) throw new Error("Debe existir al menos un tipo de servicio activo.");
  return savePublicServiceCatalog({ service_types: types }, "service_types", types);
}

async function supabaseServiceStores() {
  const companyId = await currentSupabaseCompanyId();
  const rows = await supabaseFetch<Array<{ metadata?: AnyRow }>>(
    `/rest/v1/service_references?select=metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=1`
  ).catch(() => []);
  return normalizeServiceStores(rows[0]?.metadata?.service_stores);
}

async function saveSupabaseServiceStores(storesInput: unknown) {
  if (technicianSession()) throw new Error("El tecnico no puede modificar almacenes de servicio.");
  const stores = normalizeServiceStores(storesInput);
  if (!stores.some((item) => item.active)) throw new Error("Debe existir al menos un almacen activo.");
  return savePublicServiceCatalog({ service_stores: stores }, "service_stores", stores);
}

async function supabaseSatisfactionQuestions() {
  const companyId = await currentSupabaseCompanyId();
  const rows = await supabaseFetch<Array<{ metadata?: AnyRow }>>(
    `/rest/v1/service_references?select=metadata&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=1`
  ).catch(() => []);
  return normalizeSatisfactionQuestions(rows[0]?.metadata?.satisfaction_questions);
}

async function saveSupabaseSatisfactionQuestions(questionsInput: unknown) {
  if (technicianSession()) throw new Error("El tecnico no puede modificar preguntas de satisfaccion.");
  const questions = normalizeSatisfactionQuestions(questionsInput);
  if (!questions.some((item) => item.active)) throw new Error("Debe existir al menos una pregunta de satisfaccion activa.");
  return savePublicServiceCatalog({ satisfaction_questions: questions }, "satisfaction_questions", questions);
}

async function ensureSupabaseServiceType(value: unknown) {
  const code = serviceTypeCode(value);
  const active = (await supabaseServiceTypes()).filter((item) => item.active);
  if (!active.some((item) => item.code === code)) throw new Error("Selecciona un tipo de servicio activo.");
  return code;
}

function serviceReferencePayload(input: AnyRow, companyId: string) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata as AnyRow : {};
  return {
    company_id: companyId,
    code: String(input.code || "").trim().toUpperCase(),
    name: String(input.name || "").trim(),
    category: String(input.category || "muebles"),
    description: String(input.description || ""),
    estimated_minutes: Math.max(1, Number(input.estimated_minutes || 60)),
    brand: String(input.brand || ""),
    model: String(input.model || ""),
    active: !(input.active === false || String(input.active).toLowerCase() === "false"),
    metadata: {
      ...metadata,
      manuals: Array.isArray(input.manuals) ? input.manuals : Array.isArray(metadata.manuals) ? metadata.manuals : []
    }
  };
}

function serviceReferenceParts(input: AnyRow, companyId: string, referenceId: string) {
  const parts = Array.isArray(input.parts) ? input.parts as AnyRow[] : [];
  const names = new Set<string>();
  return parts.map((part, index) => {
    const name = String(part.name || "").trim();
    const normalizedName = name.toLocaleLowerCase();
    if (!name) throw new Error("Cada pieza de la referencia debe tener un nombre.");
    if (names.has(normalizedName)) throw new Error(`La pieza "${name}" esta repetida en la referencia.`);
    names.add(normalizedName);
    return {
      company_id: companyId,
      reference_id: referenceId,
      name,
      quantity: Math.max(0.01, Number(part.quantity || 1)),
      unit: String(part.unit || "und"),
      description: String(part.description || ""),
      display_order: Number(part.display_order ?? index)
    };
  });
}

async function hydrateSupabaseServiceReferences(refs: SupabaseServiceReference[]) {
  if (!refs.length) return [];
  const referenceIds = refs.map((ref) => ref.id).join(",");
  const companyIds = Array.from(new Set(refs.map((ref) => ref.company_id).filter(Boolean) as string[]));
  const companyFilter = companyIds.length === 1 ? `&company_id=eq.${encodeURIComponent(companyIds[0])}` : "";
  const parts = await supabaseFetch<SupabaseServiceReferencePart[]>(
    `/rest/v1/service_reference_parts?select=id,reference_id,name,quantity,unit,description,display_order&reference_id=in.(${referenceIds})${companyFilter}&order=display_order.asc&limit=2000`
  );
  return refs.map((ref) => {
    const referenceParts = parts.filter((part) => part.reference_id === ref.id);
    return {
      ...ref,
      estimated_minutes: ref.estimated_minutes || 60,
      brand: ref.brand || "",
      model: ref.model || "",
      parts: referenceParts,
      manuals: Array.isArray(ref.metadata?.manuals) ? ref.metadata.manuals : [],
      total_parts: referenceParts.length,
      total_pieces: referenceParts.reduce((sum, part) => sum + Number(part.quantity || 0), 0)
    };
  });
}

async function saveSupabaseServiceReference(input: AnyRow, referenceId?: string) {
  const membership = await currentSupabaseCompanyUser();
  if (!membership?.company_id) throw new Error("No se encontro una empresa activa para guardar la referencia.");
  const payload = serviceReferencePayload(input, membership.company_id);
  if (!payload.code || !payload.name) throw new Error("Codigo y nombre son obligatorios.");
  const validatedParts = serviceReferenceParts(input, membership.company_id, referenceId || "pending");

  let saved: SupabaseServiceReference[];
  if (referenceId) {
    saved = await supabaseFetch<SupabaseServiceReference[]>(
      `/rest/v1/service_references?id=eq.${encodeURIComponent(referenceId)}&company_id=eq.${encodeURIComponent(membership.company_id)}&select=id,company_id,code,name,category,description,estimated_minutes,brand,model,active,metadata`,
      { method: "PATCH", body: JSON.stringify(payload), headers: { Prefer: "return=representation" } }
    );
    if (!saved[0]) throw new Error("La referencia no existe o no tienes permisos para editarla.");
    await supabaseFetch(`/rest/v1/service_reference_parts?reference_id=eq.${encodeURIComponent(referenceId)}&company_id=eq.${encodeURIComponent(membership.company_id)}`, { method: "DELETE" });
  } else {
    saved = await supabaseFetch<SupabaseServiceReference[]>(
      "/rest/v1/service_references?select=id,company_id,code,name,category,description,estimated_minutes,brand,model,active,metadata",
      { method: "POST", body: JSON.stringify(payload), headers: { Prefer: "return=representation" } }
    );
  }

  const savedReference = saved[0];
  if (!savedReference) throw new Error("Supabase no retorno la referencia guardada.");
  const parts = validatedParts.map((part) => ({ ...part, reference_id: savedReference.id }));
  try {
    if (parts.length) {
      await supabaseFetch("/rest/v1/service_reference_parts", {
        method: "POST",
        body: JSON.stringify(parts),
        headers: { Prefer: "return=minimal" }
      });
    }
  } catch (error) {
    if (!referenceId) {
      await supabaseFetch(`/rest/v1/service_references?id=eq.${encodeURIComponent(savedReference.id)}`, { method: "DELETE" }).catch(() => undefined);
    }
    throw error;
  }
  return (await hydrateSupabaseServiceReferences([savedReference]))[0];
}

async function supabaseApiFallback<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const [pathname, queryString = ""] = path.split("?");
  const search = new URLSearchParams(queryString);
  const active = search.get("active");
  const method = String(options.method || "GET").toUpperCase();

  if (pathname === "/api/v1/hr/activity-types") {
    return fallbackActivityTypes as T;
  }

  if (pathname === "/api/v1/hr/work-sessions/current") {
    const employee = await currentSupabaseEmployee();
    if (!employee) return { session: null, active: false, activities: [], alerts: [] } as T;
    const companyId = employee.company_id;
    const name = fullName(employee);
    const code = String(employee.metadata?.code || employee.document_number || employee.id.slice(0, 8));
    const aliases = identityAliasSet(employee);
    const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
    const selectedRouteId = search.get("route_id") || "";
    const selectedRouteIsUuid = isUuid(selectedRouteId);
    const routeFilter = selectedRouteIsUuid ? `&route_id=eq.${encodeURIComponent(selectedRouteId)}` : "";
    const matchesCurrentEmployee = (row: { employee_id?: unknown; user_id?: unknown; user_name?: unknown; metadata?: AnyRow }) => (
      aliases.has(String(row.employee_id || "").toLowerCase())
      || aliases.has(String(row.user_id || "").toLowerCase())
      || aliases.has(String(row.user_name || "").toLowerCase())
      || (Array.isArray(row.metadata?.identity_aliases) && row.metadata.identity_aliases.some((alias: unknown) => aliases.has(String(alias || "").toLowerCase())))
    );
    const punches = (await supabaseFetch<Array<{ id: string; employee_id?: string; user_id?: string; user_name: string; punch_type: string; punched_at: string; punch_time?: string; vehicle_plate?: string; route_id?: string; latitude?: number; longitude?: number; accuracy_meters?: number; metadata?: AnyRow }>>(
      `/rest/v1/time_punches?select=id,employee_id,user_id,user_name,punch_type,punched_at,punch_time,vehicle_plate,route_id,latitude,longitude,accuracy_meters,metadata&punch_date=eq.${localDate()}${companyFilter}&order=punched_at.asc&limit=80`
    ).catch((error) => {
      safeDevLog("No fue posible consultar marcaciones Supabase.", error);
      return [];
    })).filter((punch) => (!selectedRouteId || (selectedRouteIsUuid ? String(punch.route_id || "") === selectedRouteId : operationalRouteKey(punch) === selectedRouteId)) && matchesCurrentEmployee(punch));
    const types = punches.map((punch) => punch.punch_type);
    const activeSession = types.includes("entrada") && !types.includes("salida");
    const activityRows = (await supabaseFetch<Array<{ id: string; employee_id?: string; user_id?: string; user_name: string; route_id?: string; latitude: number; longitude: number; accuracy_meters?: number; captured_at: string; metadata?: AnyRow }>>(
      `/rest/v1/gps_pings?select=id,employee_id,user_id,user_name,route_id,latitude,longitude,accuracy_meters,captured_at,metadata&source=eq.work_activity${companyFilter}${routeFilter}&order=captured_at.desc&limit=120`
    ).catch((error) => {
      safeDevLog("No fue posible consultar actividades Supabase.", error);
      return [];
    })).filter((row) => (!selectedRouteId || (selectedRouteIsUuid ? String(row.route_id || "") === selectedRouteId : operationalRouteKey(row) === selectedRouteId)) && matchesCurrentEmployee(row));
    const activities = activityRows.map((row) => ({
      id: toNumberId(row.id),
      activity_type_name: String(row.metadata?.activity_type_name || "Actividad operativa"),
      observation: String(row.metadata?.observation || ""),
      occurred_at: row.captured_at,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy_meters: Number(row.accuracy_meters || 0),
      evidence: row.metadata?.photo ? [{ base64_data: row.metadata.photo, file_name: String(row.metadata?.photo_name || "evidencia.jpg") }] : []
    }));
    const entry = punches.find((punch) => punch.punch_type === "entrada");
    return {
      session: activeSession ? {
        id: toNumberId(entry?.id || employee.id),
        status: "activa",
        started_at: entry?.punched_at || new Date().toISOString(),
        route_id: entry?.route_id || selectedRouteId || null,
        user_name: code || name
      } : null,
      active: activeSession,
      activities,
      alerts: activeSession && !activities.length ? [{ type: "sin_actividades", severity: "warning", message: "Jornada activa sin actividades registradas." }] : []
    } as T;
  }

  if (pathname === "/api/v1/hr/time-punches" && method === "POST") {
    const employee = await currentSupabaseEmployee();
    if (!employee?.company_id) return null;
    const body = JSON.parse(String(options.body || "{}"));
    const now = body.punched_at ? new Date(body.punched_at) : new Date();
    const name = fullName(employee);
    const identity = supabaseEmployeeIdentity(employee, body.user_name || name);
    const routeId = await currentSupabaseRouteIdForEmployee(employee, body.route_id);
    let extraMinutes = 0;
    if ((body.type || body.tipo_marca) === "salida" && routeId) {
      const routeRows = await supabaseFetch<Array<{ route_date?: string; end_time?: string }>>(`/rest/v1/operational_routes?select=route_date,end_time&id=eq.${routeId}&company_id=eq.${encodeURIComponent(employee.company_id)}&limit=1`).catch((error) => {
        safeDevLog("No fue posible consultar el horario de la ruta para hora extra.", error);
        return [];
      });
      const route = routeRows[0];
      if (route?.route_date && route?.end_time) {
        const plannedEnd = new Date(`${route.route_date}T${route.end_time}:00-05:00`);
        extraMinutes = Math.max(0, Math.round((now.getTime() - plannedEnd.getTime()) / 60000));
      }
    }
    const extraEvidence = body.extra_evidence ? {
      name: body.extra_evidence.name,
      type: body.extra_evidence.type,
      size: body.extra_evidence.size,
      base64_data: body.extra_evidence.base64
    } : {};
    const row = {
      company_id: employee.company_id,
      employee_id: identity.employee_id,
      user_id: identity.user_id,
      route_id: routeId || null,
      user_name: identity.user_name,
      punch_type: body.type || body.tipo_marca,
      punched_at: now.toISOString(),
      punch_date: localDate(now),
      punch_time: now.toISOString().slice(11, 19),
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      accuracy_meters: body.accuracy_meters ?? null,
      extra_minutes: extraMinutes,
      extra_reason: body.extra_reason || null,
      extra_detail: body.extra_detail || null,
      extra_evidence: extraEvidence,
      metadata: {
        ...(body.metadata || {}),
        extra_evidence: extraEvidence,
        display_route_id: body.route_id || "",
        supplied_user_name: body.user_name || "",
        employee_code: employee.metadata?.code || employee.document_number || "",
        employee_name: fullName(employee),
        user_email: employee.email || "",
        identity_aliases: identity.aliases
      }
    };
    let inserted: Array<Record<string, unknown>>;
    try {
      inserted = await supabaseFetch<Array<Record<string, unknown>>>("/rest/v1/time_punches?select=*", {
        method: "POST",
        body: JSON.stringify(row),
        headers: { Prefer: "return=representation" }
      });
    } catch (error) {
      if (!String(error).includes("extra_evidence")) throw error;
      const fallbackRow = { ...row };
      delete fallbackRow.extra_evidence;
      inserted = await supabaseFetch<Array<Record<string, unknown>>>("/rest/v1/time_punches?select=*", {
        method: "POST",
        body: JSON.stringify(fallbackRow),
        headers: { Prefer: "return=representation" }
      });
    }
    const punchIdentityFilter = identity.employee_id
      ? `employee_id=eq.${identity.employee_id}`
      : identity.user_id
        ? `user_id=eq.${identity.user_id}`
        : `user_name=eq.${encodeURIComponent(identity.user_name)}`;
    const routeIdentityFilter = routeId && isUuid(routeId) ? `&route_id=eq.${encodeURIComponent(String(routeId))}` : "";
    const routeDisplayKey = String(body.route_id || routeId || "");
    const punches = (await supabaseFetch<Array<{ punch_type: string; route_id?: string; metadata?: AnyRow }>>(`/rest/v1/time_punches?select=punch_type,route_id,metadata&company_id=eq.${encodeURIComponent(employee.company_id)}&${punchIdentityFilter}${routeIdentityFilter}&punch_date=eq.${localDate(now)}&order=punched_at.asc&limit=40`).catch((error) => {
      safeDevLog("No fue posible recalcular siguiente marcacion.", error);
      return [];
    })).filter((punch) => !routeDisplayKey || operationalRouteKey(punch) === routeDisplayKey || (routeId && String(punch.route_id || "") === String(routeId)));
    return {
      ok: true,
      hora: row.punch_time,
      punch: inserted[0],
      next: nextPunchFrom(punches.map((punch) => punch.punch_type)),
      route_authorized: true,
      preoperational_required: false,
      preoperational_checklist: null
    } as T;
  }

  if (pathname === "/api/v1/hr/work-activities" && method === "GET") {
    const companyId = await currentSupabaseCompanyId();
    const limit = Math.min(Number(search.get("limit") || 500), 1000);
    const userName = search.get("user_name") || search.get("usuario") || "";
    const date = search.get("date") || search.get("fecha") || "";
    const userFilter = userName ? `&user_name=eq.${encodeURIComponent(userName)}` : "";
    const dateFilter = date
      ? `&captured_at=gte.${encodeURIComponent(`${date}T00:00:00-05:00`)}&captured_at=lt.${encodeURIComponent(`${date}T23:59:59-05:00`)}`
      : "";
    const rows = await supabaseFetch<Array<{
      id: string;
      employee_id?: string;
      user_id?: string;
      user_name: string;
      route_id?: string;
      latitude: number;
      longitude: number;
      accuracy_meters?: number;
      captured_at: string;
      metadata?: AnyRow;
    }>>(`/rest/v1/gps_pings?select=id,employee_id,user_id,user_name,route_id,latitude,longitude,accuracy_meters,captured_at,metadata&company_id=eq.${encodeURIComponent(companyId)}&source=eq.work_activity${userFilter}${dateFilter}&order=captured_at.desc&limit=${limit}`);
    return rows.map((row) => ({
      id: toNumberId(row.id),
      employee_id: row.employee_id,
      user_id: row.user_id,
      user_name: row.user_name,
      route_id: row.route_id,
      activity_type_name: String(row.metadata?.activity_type_name || "Actividad operativa"),
      observation: String(row.metadata?.observation || ""),
      occurred_at: row.captured_at,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy_meters: Number(row.accuracy_meters || 0),
      evidence: row.metadata?.photo ? [{ base64_data: String(row.metadata.photo), file_name: String(row.metadata?.photo_name || "evidencia.jpg") }] : [],
      metadata: row.metadata || {}
    })) as T;
  }

  if (pathname === "/api/v1/hr/work-activities" && method === "POST") {
    const employee = await currentSupabaseEmployee();
    if (!employee?.company_id) return null;
    const body = JSON.parse(String(options.body || "{}"));
    const type = fallbackActivityTypes.find((item) => item.id === Number(body.activity_type_id)) || fallbackActivityTypes[0];
    const now = body.occurred_at ? new Date(body.occurred_at) : new Date();
    const identity = supabaseEmployeeIdentity(employee, body.user_name);
    const routeId = await currentSupabaseRouteIdForEmployee(employee, body.route_id);
    const row = {
      company_id: employee.company_id,
      employee_id: identity.employee_id,
      user_id: identity.user_id,
      route_id: routeId || null,
      user_name: identity.user_name,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy_meters: body.accuracy_meters ?? null,
      source: "work_activity",
      captured_at: now.toISOString(),
      metadata: {
        ...(body.metadata || {}),
        activity_type_id: type.id,
        activity_type_name: type.name,
        observation: body.observation,
        display_route_id: body.route_id || "",
        photo: body.photo?.base64,
        photo_name: body.photo?.name,
        supplied_user_name: body.user_name || "",
        employee_code: employee.metadata?.code || employee.document_number || "",
        employee_name: fullName(employee),
        user_email: employee.email || "",
        identity_aliases: identity.aliases
      }
    };
    const inserted = await supabaseFetch<Array<{ id: string }>>("/rest/v1/gps_pings?select=*", {
      method: "POST",
      body: JSON.stringify(row),
      headers: { Prefer: "return=representation" }
    });
    return {
      id: toNumberId(inserted[0]?.id || now.toISOString()),
      activity_type_name: type.name,
      observation: body.observation,
      occurred_at: now.toISOString(),
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      accuracy_meters: Number(body.accuracy_meters || 0),
      evidence: body.photo ? [{ base64_data: body.photo.base64, file_name: body.photo.name }] : []
    } as T;
  }

  if (pathname === "/api/v1/hr/gps/ping" && method === "POST") {
    const employee = await currentSupabaseEmployee();
    if (!employee?.company_id) return null;
    const body = JSON.parse(String(options.body || "{}"));
    const capturedAt = body.captured_at ? new Date(body.captured_at) : new Date();
    const identity = supabaseEmployeeIdentity(employee, body.user_name);
    const routeId = await currentSupabaseRouteIdForEmployee(employee, body.route_id);
    const fix = {
      company_id: employee.company_id,
      employee_id: identity.employee_id,
      user_id: identity.user_id,
      user_name: identity.user_name,
      route_id: routeId || null,
      vehicle_id: null,
      latitude: Number(body.latitude || 0),
      longitude: Number(body.longitude || 0),
      accuracy_meters: Number(body.accuracy_meters || 0),
      source: body.source || "mobile",
      captured_at: capturedAt.toISOString(),
      metadata: {
        ...(body.metadata || {}),
        user_email: employee.email || "",
        source: body.source,
        vehicle_plate: body.vehicle_plate || "",
        supplied_user_name: body.user_name || "",
        display_route_id: body.route_id || "",
        employee_code: employee.metadata?.code || employee.document_number || "",
        employee_name: fullName(employee),
        identity_aliases: identity.aliases,
        virtual_employee: identity.virtual
      }
    };
    const inserted = await supabaseFetch<Array<Record<string, unknown>>>("/rest/v1/gps_pings?select=*", {
      method: "POST",
      body: JSON.stringify(fix),
      headers: { Prefer: "return=representation" }
    });
    return { ok: true, ping: inserted[0] || fix } as T;
  }

  if (pathname === "/api/v1/hr/schedules") {
    return [] as T;
  }

  if (pathname === "/api/v1/hr/workdays") {
    return [] as T;
  }

  if (pathname === "/api/v1/hr/attendance") {
    const companyId = await currentSupabaseCompanyId();
    const day = search.get("date") || search.get("fecha") || localDate();
    const punches = await supabaseFetch<Array<{
      id: string;
      employee_id?: string;
      user_id?: string;
      user_name: string;
      punch_type: string;
      punch_date?: string;
      punch_time?: string;
      punched_at: string;
      route_id?: string;
      vehicle_id?: string;
      vehicle_plate?: string;
      latitude?: number;
      longitude?: number;
      accuracy_meters?: number;
      extra_minutes?: number;
      extra_reason?: string;
      extra_detail?: string;
      extra_evidence?: AnyRow;
      metadata?: AnyRow;
    }>>(`/rest/v1/time_punches?select=id,employee_id,user_id,user_name,punch_type,punch_date,punch_time,punched_at,route_id,vehicle_id,vehicle_plate,latitude,longitude,accuracy_meters,extra_minutes,extra_reason,extra_detail,extra_evidence,metadata&company_id=eq.${encodeURIComponent(companyId)}&punch_date=eq.${encodeURIComponent(day)}&order=punched_at.asc&limit=500`);
    const grouped = new Map<string, Array<{
      id: string;
      employee_id?: string;
      user_id?: string;
      user_name: string;
      type: string;
      date: string;
      punched_at: string;
      time: string;
      route_id?: string;
      vehicle_id?: string;
      vehicle_plate: string;
      latitude?: number;
      longitude?: number;
      accuracy_meters?: number;
      extra_minutes?: number;
      extra_reason?: string;
      extra_detail?: string;
      extra_evidence?: AnyRow;
      metadata?: AnyRow;
    }>>();
    for (const punch of punches) {
      const routeKey = operationalRouteKey(punch);
      const groupKey = `${String(punch.employee_id || punch.user_id || displayNameForIdentity(punch) || punch.user_name)}::${routeKey}`;
      const displayUserName = displayNameForIdentity(punch) || punch.user_name;
      const list = grouped.get(groupKey) || [];
      list.push({
        id: punch.id,
        employee_id: punch.employee_id,
        user_id: punch.user_id,
        user_name: displayUserName,
        type: punch.punch_type,
        date: punch.punch_date || punch.punched_at,
        punched_at: punch.punched_at,
        time: punch.punch_time || "",
        route_id: punch.route_id || routeKey,
        vehicle_id: punch.vehicle_id,
        vehicle_plate: punch.vehicle_plate || "",
        latitude: punch.latitude,
        longitude: punch.longitude,
        accuracy_meters: punch.accuracy_meters,
        extra_minutes: punch.extra_minutes || 0,
        extra_reason: punch.extra_reason || "",
        extra_detail: punch.extra_detail || "",
        extra_evidence: punch.extra_evidence || (punch.metadata?.extra_evidence as AnyRow | undefined) || {},
        metadata: punch.metadata || {}
      });
      grouped.set(groupKey, list);
    }
    return Array.from(grouped.values()).map((punches) => ({
      user_name: punches[0]?.user_name || "",
      route_id: punches[0]?.route_id || null,
      next_type: nextPunchFrom(punches.map((punch) => punch.type)),
      punches
    })) as T;
  }

  if (pathname === "/api/v1/hr/operations-map") {
    const companyId = await currentSupabaseCompanyId();
    const day = search.get("date") || localDate();
    const [routes, employees, assignments, pings, punches] = await Promise.all([
      supabaseFetch<Array<{ id: string; code?: string; route_date: string; vehicle_plate?: string; start_time?: string; end_time?: string; status?: string; metadata?: AnyRow }>>(`/rest/v1/operational_routes?select=id,code,route_date,vehicle_plate,start_time,end_time,status,metadata&company_id=eq.${encodeURIComponent(companyId)}&route_date=eq.${encodeURIComponent(day)}&order=start_time.asc&limit=120`),
      supabaseFetch<Array<{ id: string; user_id?: string; first_name?: string; last_name?: string; email?: string; document_number?: string; user_type?: string; position?: string; metadata?: AnyRow }>>(`/rest/v1/employees?select=id,user_id,first_name,last_name,email,document_number,user_type,position,metadata&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&limit=250`),
      supabaseFetch<Array<{ route_id: string; employee_id: string; role?: string }>>(`/rest/v1/route_assignments?select=route_id,employee_id,role&company_id=eq.${encodeURIComponent(companyId)}&limit=500`),
      supabaseFetch<Array<{ id: string; employee_id?: string; user_id?: string; user_name: string; route_id?: string; vehicle_id?: string; latitude: number; longitude: number; accuracy_meters?: number; source?: string; captured_at: string; metadata?: AnyRow }>>(`/rest/v1/gps_pings?select=id,employee_id,user_id,user_name,route_id,vehicle_id,latitude,longitude,accuracy_meters,source,captured_at,metadata&company_id=eq.${encodeURIComponent(companyId)}&captured_at=gte.${encodeURIComponent(`${day}T00:00:00-05:00`)}&captured_at=lt.${encodeURIComponent(`${day}T23:59:59-05:00`)}&order=captured_at.desc&limit=500`),
      supabaseFetch<Array<{ id: string; employee_id?: string; user_id?: string; user_name: string; punch_type: string; punch_time?: string; punched_at: string; route_id?: string; vehicle_id?: string; vehicle_plate?: string; latitude?: number; longitude?: number; accuracy_meters?: number; extra_minutes?: number; extra_reason?: string; extra_detail?: string; extra_evidence?: AnyRow; metadata?: AnyRow }>>(`/rest/v1/time_punches?select=id,employee_id,user_id,user_name,punch_type,punch_time,punched_at,route_id,vehicle_id,vehicle_plate,latitude,longitude,accuracy_meters,extra_minutes,extra_reason,extra_detail,extra_evidence,metadata&company_id=eq.${encodeURIComponent(companyId)}&punch_date=eq.${encodeURIComponent(day)}&order=punched_at.desc&limit=500`)
    ]);

    const routeIds = new Set(routes.map((route) => route.id));
    const dayAssignments = assignments.filter((assignment) => routeIds.has(assignment.route_id));
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const latestPingByEmployee = new Map<string, (typeof pings)[number]>();
    for (const ping of pings) {
      for (const key of identityKeys(ping)) {
        if (!latestPingByEmployee.has(key)) latestPingByEmployee.set(key, ping);
      }
    }
    const latestPunchByEmployee = new Map<string, (typeof punches)[number]>();
    for (const punch of punches) {
      for (const key of identityKeys(punch)) {
        if (!latestPunchByEmployee.has(key)) latestPunchByEmployee.set(key, punch);
      }
    }

    const people = dayAssignments.map((assignment) => {
      const employee = employeeById.get(assignment.employee_id);
      const route = routes.find((item) => item.id === assignment.route_id);
      const name = fullName(employee || {});
      const aliases = identityKeys({ ...(employee || {}), employee_id: assignment.employee_id, user_name: name });
      const routeAssignments = dayAssignments.filter((item) => item.route_id === assignment.route_id);
      const singlePersonRoute = routeAssignments.length === 1;
      const routeKeys = new Set([route?.id, route?.code, route?.metadata?.display_id, route?.metadata?.legacy_id].filter(Boolean).map(String));
      const rowBelongsToRoute = (row: { route_id?: unknown; metadata?: AnyRow }) => routeKeys.has(operationalRouteKey(row));
      const ping = aliases.map((alias) => latestPingByEmployee.get(alias)).find(Boolean)
        || (singlePersonRoute ? pings.find(rowBelongsToRoute) : undefined);
      const punch = aliases.map((alias) => latestPunchByEmployee.get(alias)).find(Boolean)
        || (singlePersonRoute ? punches.find(rowBelongsToRoute) : undefined);
      const capturedAt = ping?.captured_at || punch?.punched_at || null;
      const ageSeconds = capturedAt ? Math.max(0, Math.round((Date.now() - new Date(capturedAt).getTime()) / 1000)) : null;
      const online = ageSeconds != null && ageSeconds <= Number(search.get("minutes") || 30) * 60;
      const latitude = ping?.latitude ?? punch?.latitude ?? null;
      const longitude = ping?.longitude ?? punch?.longitude ?? null;
      const displayName = displayNameForIdentity({ ...(employee || {}), employee_id: assignment.employee_id, metadata: employee?.metadata || punch?.metadata || ping?.metadata, user_name: name })
        || displayNameForIdentity(punch || {})
        || displayNameForIdentity(ping || {})
        || assignment.employee_id;
      const displayUserName = displayNameForIdentity(punch || {})
        || displayNameForIdentity(ping || {})
        || displayName;
      return {
        key: `${assignment.route_id}-${assignment.employee_id}`,
        employee_id: assignment.employee_id,
        user_name: displayUserName,
        name: displayName,
        route_id: assignment.route_id,
        route_label: route?.code || `Ruta ${String(assignment.route_id).slice(0, 8)}`,
        vehicle_plate: route?.vehicle_plate || "",
        latitude,
        longitude,
        accuracy_meters: ping?.accuracy_meters ?? punch?.accuracy_meters ?? null,
        captured_at: capturedAt,
        age_seconds: ageSeconds,
        online,
        footprint_source: ping ? "live" : punch ? "punch" : "none",
        last_punch_type: punch?.punch_type || "Sin iniciar",
        last_punch_time: punch?.punch_time || (punch?.punched_at ? new Date(punch.punched_at).toLocaleTimeString() : ""),
        status: online ? "En ruta" : latitude != null && longitude != null ? "Ultima marca" : "Sin GPS",
        time_in_route_minutes: null,
        route_start_time: route?.start_time || "",
        route_end_time: route?.end_time || ""
      };
    });

    const routeSummaries = routes.map((route) => {
      const routeAssignments = dayAssignments.filter((assignment) => assignment.route_id === route.id);
      const routePeople = people.filter((person) => person.route_id === route.id);
      const routeKeys = new Set([route.id, route.code, route.metadata?.display_id, route.metadata?.legacy_id].filter(Boolean).map(String));
      const assignmentAliases = routeAssignments.map((assignment) => {
        const employee = employeeById.get(assignment.employee_id);
        return identityKeys({ ...(employee || {}), employee_id: assignment.employee_id, user_name: fullName(employee || {}) });
      });
      const matchesRouteAssignment = (row: { route_id?: string; employee_id?: string; user_id?: string; user_name?: string; metadata?: AnyRow }) => {
        if (routeKeys.has(operationalRouteKey(row))) return true;
        const rowAliases = identityKeys(row);
        return assignmentAliases.some((aliases) => identityOverlaps(rowAliases, aliases));
      };
      const routePings = pings.filter((ping) => matchesRouteAssignment(ping));
      const routeActivities = pings
        .filter((ping) => ping.source === "work_activity" && matchesRouteAssignment(ping))
        .map((activity) => ({
          id: activity.id,
          user_name: displayNameForIdentity(activity) || activity.user_name,
          type: String(activity.metadata?.activity_type_name || "Actividad operativa"),
          time: activity.captured_at ? new Date(activity.captured_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "",
          occurred_at: activity.captured_at,
          latitude: Number(activity.latitude),
          longitude: Number(activity.longitude),
          accuracy_meters: activity.accuracy_meters ?? null,
          vehicle_plate: route.vehicle_plate || "",
          route_id: route.id,
          observation: String(activity.metadata?.observation || ""),
          evidence: activity.metadata?.photo ? [{ base64_data: String(activity.metadata.photo), file_name: String(activity.metadata?.photo_name || "evidencia.jpg") }] : [],
          metadata: activity.metadata || {}
        }));
      const routePunches = punches
        .filter((punch) => matchesRouteAssignment(punch) && punch.latitude != null && punch.longitude != null)
        .map((punch) => ({
          id: punch.id,
          user_name: displayNameForIdentity(punch) || punch.user_name,
          type: punch.punch_type,
          time: punch.punch_time || "",
          punched_at: punch.punched_at,
          latitude: Number(punch.latitude),
          longitude: Number(punch.longitude),
          accuracy_meters: punch.accuracy_meters ?? null,
          vehicle_plate: route.vehicle_plate || "",
          route_id: route.id,
          extra_minutes: punch.extra_minutes || 0,
          extra_reason: punch.extra_reason || "",
          extra_detail: punch.extra_detail || "",
          extra_evidence: punch.extra_evidence || punch.metadata?.extra_evidence || {},
          metadata: punch.metadata || {}
        }));
      const userNames = Array.from(new Set([...routePunches.map((punch) => punch.user_name), ...routeActivities.map((activity) => activity.user_name)]));
      return {
        id: route.id,
        code: route.code || "",
        display_id: route.code || route.metadata?.display_id || route.id,
        vehicle_plate: route.vehicle_plate || "",
        employees: routeAssignments.map((assignment) => String(assignment.employee_id)),
        employee_ids: routeAssignments.map((assignment) => String(assignment.employee_id)),
        employee_names: routeAssignments.map((assignment) => fullName(employeeById.get(assignment.employee_id) || {})),
        start_time: route.start_time || "",
        end_time: route.end_time || "",
        status: route.status || "planned",
        assigned_count: routeAssignments.length,
        online_count: routePeople.filter((person) => person.online).length,
        with_gps_count: routePeople.filter((person) => person.latitude != null && person.longitude != null).length,
        pings: routePings.map((ping) => ({ ...ping, vehicle_plate: route.vehicle_plate || "", route_id: route.id })),
        punch_points: routePunches,
        activity_points: routeActivities,
        marks_by_user: userNames.map((user_name) => ({ user_name, marks: routePunches.filter((punch) => punch.user_name === user_name) }))
      };
    });

    return {
      date: search.get("date") || new Date().toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      active_window_minutes: Number(search.get("minutes") || 30),
      people,
      routes: routeSummaries,
      totals: {
        routes: routeSummaries.length,
        planned_people: people.length,
        online: people.filter((person) => person.online).length,
        without_gps: people.filter((person) => person.latitude == null || person.longitude == null).length,
        offline: people.filter((person) => !person.online).length
      },
      kpis: {
        online: people.filter((person) => person.online).length,
        offline: people.filter((person) => !person.online).length,
        routes: routeSummaries.length,
        people: people.length,
        without_gps: people.filter((person) => person.latitude == null || person.longitude == null).length
      },
      pings
    } as T;
  }

  if (pathname === "/api/v1/hr/routes/preop/metrics") {
    const companyId = await currentSupabaseCompanyId();
    const [checklists, blocks] = await Promise.all([
      supabaseFetch<Array<{ id: string; checklist_status?: string }>>(`/rest/v1/route_preoperational_checklists?select=id,checklist_status&company_id=eq.${encodeURIComponent(companyId)}&created_at=gte.${localDate()}T00:00:00-05:00&limit=200`),
      supabaseFetch<Array<{ id: string }>>(`/rest/v1/route_block_events?select=id&company_id=eq.${encodeURIComponent(companyId)}&created_at=gte.${localDate()}T00:00:00-05:00&limit=200`)
    ]);
    return {
      checklists_today: checklists.length,
      checklists_pending: checklists.filter((item) => item.checklist_status === "pendiente").length,
      routes_blocked: blocks.length,
      compliance_rate: checklists.length ? Math.round(((checklists.length - blocks.length) / checklists.length) * 100) : 100,
      approved_with_findings: 0
    } as T;
  }

  if (pathname === "/api/v1/hr/me") {
    const row = await currentSupabaseEmployee();
    if (!row) return null;
    const name = fullName(row);
    const code = String(row.metadata?.code || row.document_number || row.metadata?.name || row.email || `user-${row.id.slice(0, 6)}`);
    return {
      id: row.id,
      user_id: row.user_id,
      code,
      user_type: row.user_type || row.position || "operario",
      position: row.position || row.user_type || "operario",
      document_number: row.document_number || "",
      metadata: { ...(row.metadata || {}), name, code, identity_aliases: identityAliasValues(row) },
      user: { name, email: row.email || "" }
    } as T;
  }

  if (pathname === "/api/v1/hr/routes/preop/template") {
    return {
      sections: ["Documental", "Exterior", "Seguridad", "Conductor"],
      items: [
        { section: "Documental", item_key: "soat_vigente", label: "SOAT vigente", severity: "critica", blocks_route: true, evidence_required: false },
        { section: "Documental", item_key: "licencia_conductor_vigente", label: "Licencia del conductor vigente", severity: "critica", blocks_route: true, evidence_required: true },
        { section: "Exterior", item_key: "llantas_estado", label: "Llantas en buen estado", severity: "critica", blocks_route: true, evidence_required: true },
        { section: "Seguridad", item_key: "frenos", label: "Frenos funcionando correctamente", severity: "critica", blocks_route: true, evidence_required: true },
        { section: "Conductor", item_key: "conductor_apto", label: "Conductor apto", severity: "critica", blocks_route: true, evidence_required: false }
      ]
    } as T;
  }

  if (pathname === "/api/v1/hr/routes/preop/active") {
    return { checklist: null, template: await supabaseApiFallback("/api/v1/hr/routes/preop/template") } as T;
  }

  if (pathname === "/api/v1/hr/employees") {
    const companyId = await currentSupabaseCompanyId();
    const rows = await supabaseFetch<Array<{
      id: string;
      company_id?: string;
      user_id?: string;
      first_name?: string;
      last_name?: string;
      document_number?: string;
      email?: string;
      position?: string;
      department?: string;
      status?: string;
      user_type?: string;
      metadata?: Record<string, unknown>;
    }>>(`/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,document_number,email,position,department,status,user_type,metadata&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=250`).catch((error) => {
      safeDevLog("No fue posible consultar empleados HR Supabase.", error);
      return [];
    });
    const adminRows = await nextAdminUsersRequest<{ employees: Array<{
      id: string;
      company_id?: string;
      user_id?: string;
      first_name?: string;
      last_name?: string;
      document_number?: string;
      email?: string;
      position?: string;
      department?: string;
      status?: string;
      user_type?: string;
      metadata?: AnyRow;
    }> }>({ method: "GET" }).then((result) => result.employees).catch((error) => {
      safeDevLog("No fue posible reconciliar usuarios administrativos para HR.", error);
      return [];
    });
    const rowMap = new Map<string, (typeof rows)[number]>();
    [...rows, ...adminRows].forEach((row) => {
      if (!row?.id) return;
      if (row.company_id && companyId && row.company_id !== companyId) return;
      rowMap.set(String(row.id), row as (typeof rows)[number]);
    });
    const normalizedRows = Array.from(rowMap.values()).filter((row) => active === "true" ? isActiveEmployeeStatus(row.status) : true);

    return normalizedRows.map((row) => {
      const name = fullName(row);
      const document = row.document_number || String(row.metadata?.document || "");
      return {
        id: row.id,
        code: String(row.metadata?.code || row.document_number || row.id.slice(0, 8)),
        user_type: row.user_type || row.position || String(row.metadata?.user_type || "operario"),
        position: row.position || row.user_type || "operario",
        department: row.department || "Operacion",
        metadata: {
          ...(row.metadata || {}),
          name,
          document,
          user_type: row.user_type || row.position || row.metadata?.user_type
        },
        user: { name, email: row.email || "" },
        active: isActiveEmployeeStatus(row.status)
      };
    }) as T;
  }

  const vehicleDetailMatch = pathname.match(/^\/api\/v1\/transport\/vehicles\/([^/]+)$/);
  if (pathname === "/api/v1/transport/vehicles" || vehicleDetailMatch) {
    const vehicleSelect = "id,plate,type,category,brand,line,model,year,color,mileage,owner,ownership_type,legal_owner,owner_document,linked_company,cost_center,base_site,authorized_driver_id,authorized_driver_name,authorized_driver_document,authorized_driver_code,linked_at,unlinked_at,status,master_status,document_status,master_score,vin_chassis,engine_number,cylinder_capacity,fuel,body_type,axle_count,capacity_value,capacity_unit,volume_available,soat_issued_at,soat_expires,technical_review_issued_at,technical_review_expires,property_card,contractual_policy_expires,extra_contractual_policy_expires,cargo_registry,special_permits,normative_restrictions,legal_notes,metadata";

    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const body = JSON.parse(String(options.body || "{}")) as AnyRow;
      const employee = await currentSupabaseEmployee();
      const membership = employee?.company_id ? null : await currentSupabaseCompanyUser();
      const companyId = String(employee?.company_id || membership?.company_id || "");
      if (!companyId) throw new Error("No se encontro una empresa activa para guardar el vehiculo.");
      if (!body.plate) throw new Error("La placa del vehiculo es obligatoria.");
      const payload = supabaseVehiclePayload(body, method === "POST" ? companyId : undefined);
      const endpoint = method === "POST"
        ? `/rest/v1/vehicles?select=${vehicleSelect}`
        : `/rest/v1/vehicles?id=eq.${encodeURIComponent(vehicleDetailMatch?.[1] || String(body.id || ""))}&company_id=eq.${encodeURIComponent(companyId)}&select=${vehicleSelect}`;
      const savedRows = await supabaseFetch<Array<AnyRow>>(endpoint, {
        method: method === "POST" ? "POST" : "PATCH",
        body: JSON.stringify(payload),
        headers: { Prefer: "return=representation" }
      });
      return (savedRows[0] || null) as T;
    }

    const companyId = await currentSupabaseCompanyId();
    const idFilter = vehicleDetailMatch ? `&id=eq.${encodeURIComponent(vehicleDetailMatch[1])}` : "";
    const rows = await supabaseFetch<Array<{
      id: string;
      plate: string;
      type?: string;
      category?: string;
      brand?: string;
      model?: string;
      year?: number;
      color?: string;
      mileage?: number;
      owner?: string;
      ownership_type?: string;
      base_site?: string;
      authorized_driver_id?: string;
      authorized_driver_name?: string;
      authorized_driver_document?: string;
      authorized_driver_code?: string;
      status?: string;
      master_status?: string;
      document_status?: string;
      master_score?: number;
      metadata?: Record<string, unknown>;
    }>>(`/rest/v1/vehicles?select=${vehicleSelect}&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc${idFilter}&limit=${vehicleDetailMatch ? 1 : 100}`);

    const mapped = rows.map((row) => ({
      ...row,
      type: row.type || row.category || "vehiculo",
      brand: row.brand || "",
      model: row.model || "",
      ownership_type: row.ownership_type || "propio",
      base_site: row.base_site || String(row.metadata?.base_site || "Sede Demo SCJ"),
      status: row.status || "activo",
      master_status: row.master_status || row.document_status || "pendiente_documentacion",
      document_status: row.document_status || "pendiente_documentacion",
      master_score: row.master_score || 0,
      dashboard_metrics: {
        soat_days_remaining: null,
        technical_review_days_remaining: null,
        expired_documents: row.document_status === "vencido" ? 1 : 0,
        expiring_documents: row.document_status === "proximo_vencer" ? 1 : 0,
        score_label: row.master_status || "Demo"
      }
    }));
    return (vehicleDetailMatch ? mapped[0] || null : mapped) as T;
  }

  if (pathname === "/api/v1/hr/routes") {
    if (method !== "GET") return null;
    const companyId = await currentSupabaseCompanyId();
    const routes = await supabaseFetch<Array<{
      id: string;
      code?: string;
      route_date: string;
      vehicle_plate?: string;
      start_time?: string;
      end_time?: string;
      status?: string;
      notes?: string;
    }>>(`/rest/v1/operational_routes?select=id,code,route_date,vehicle_plate,start_time,end_time,status,notes&company_id=eq.${encodeURIComponent(companyId)}&order=route_date.desc&limit=120`);
    const assignments = await supabaseFetch<Array<{
      route_id: string;
      employee_id?: string;
      role?: string;
      employees?: { id?: string; first_name?: string; last_name?: string; document_number?: string; metadata?: Record<string, unknown> };
    }>>(`/rest/v1/route_assignments?select=route_id,employee_id,role,employees(id,first_name,last_name,document_number,metadata)&company_id=eq.${encodeURIComponent(companyId)}&limit=500`);

    return routes.map((route) => ({
      id: route.code || route.id,
      code: route.code || "",
      display_id: route.code || route.id,
      source_route_id: route.id,
      date: route.route_date,
      vehicle_plate: route.vehicle_plate || "",
      employees: assignments
        .filter((assignment) => assignment.route_id === route.id)
        .map((assignment) => String(assignment.employee_id || assignment.employees?.id || "")),
      employee_ids: assignments
        .filter((assignment) => assignment.route_id === route.id)
        .map((assignment) => String(assignment.employee_id || assignment.employees?.id || "")),
      employee_names: assignments
        .filter((assignment) => assignment.route_id === route.id)
        .map((assignment) => {
          const emp = assignment.employees || {};
          const routeName = fullName(emp);
          const routeCode = String(emp.metadata?.code || "");
          return isGenericIdentityAlias(routeCode) ? routeName : routeName || routeCode;
        }),
      start_time: route.start_time || "",
      end_time: route.end_time || "",
      status: route.status || "planned",
      notes: route.notes || ""
    })) as T;
  }

  if (pathname === "/api/v1/transport/vehicles/metrics/dashboard") {
    const vehicles = await supabaseApiFallback<Array<{ master_status?: string; document_status?: string; master_score?: number }>>("/api/v1/transport/vehicles");
    const rows = vehicles || [];
    return {
      total: rows.length,
      active: rows.filter((vehicle) => !["bloqueado_documental", "bloqueado"].includes(String(vehicle.master_status))).length,
      blocked: rows.filter((vehicle) => ["bloqueado_documental", "bloqueado", "vencido"].includes(String(vehicle.master_status)) || vehicle.document_status === "vencido").length,
      pending_validation: rows.filter((vehicle) => String(vehicle.master_status).includes("pendiente")).length,
      expiring: rows.filter((vehicle) => ["proximo_vencer", "documento_proximo_a_vencer"].includes(String(vehicle.document_status)) || String(vehicle.master_status).includes("vencer")).length,
      reliable_records: rows.filter((vehicle) => Number(vehicle.master_score || 0) >= 80 || vehicle.document_status === "vigente").length,
      average_score: rows.length ? Math.round(rows.reduce((sum, vehicle) => sum + Number(vehicle.master_score || (vehicle.document_status === "vigente" ? 90 : 60)), 0) / rows.length) : 0
    } as T;
  }

  const serviceReferenceMatch = pathname.match(/^\/api\/v1\/services\/references\/([^/]+)$/);
  if (serviceReferenceMatch && method === "PUT") {
    if (technicianSession()) throw new Error("El tecnico no puede modificar referencias.");
    const body = JSON.parse(String(options.body || "{}")) as AnyRow;
    return await saveSupabaseServiceReference(body, serviceReferenceMatch[1]) as T;
  }

  if (pathname === "/api/v1/services/references/import" && method === "POST") {
    if (technicianSession()) throw new Error("El tecnico no puede importar referencias.");
    const body = JSON.parse(String(options.body || "{}")) as { rows?: AnyRow[] };
    const grouped = new Map<string, AnyRow>();
    for (const row of body.rows || []) {
      const code = String(row.code || "").trim().toUpperCase();
      if (!code || !String(row.name || "").trim()) continue;
      const current = grouped.get(code) || { ...row, code, parts: [], manuals: [] };
      if (row.part_name) {
        (current.parts as AnyRow[]).push({
          name: row.part_name,
          quantity: Number(row.part_quantity || 1),
          unit: row.part_unit || "und",
          description: row.part_description || ""
        });
      }
      if (row.manual_url || row.manual_title) {
        (current.manuals as AnyRow[]).push({
          title: row.manual_title || "Manual",
          file_name: row.manual_title || "manual",
          file_url: row.manual_url || "",
          notes: row.manual_notes || ""
        });
      }
      grouped.set(code, current);
    }
    const result = { created: 0, updated: 0, skipped: 0, references: [] as AnyRow[] };
    const companyId = await currentSupabaseCompanyId();
    for (const row of grouped.values()) {
      try {
        const existing = await supabaseFetch<Array<{ id: string }>>(
          `/rest/v1/service_references?select=id&company_id=eq.${encodeURIComponent(companyId)}&code=eq.${encodeURIComponent(String(row.code))}&limit=1`
        );
        const saved = await saveSupabaseServiceReference(row, existing[0]?.id);
        result[existing[0] ? "updated" : "created"] += 1;
        result.references.push(saved);
      } catch (error) {
        safeDevLog(`No fue posible importar la referencia ${String(row.code)}.`, error);
        result.skipped += 1;
      }
    }
    return result as T;
  }

  if (pathname === "/api/v1/services/references" && method === "POST") {
    if (technicianSession()) throw new Error("El tecnico no puede crear referencias.");
    const body = JSON.parse(String(options.body || "{}")) as AnyRow;
    return await saveSupabaseServiceReference(body) as T;
  }

  if (pathname === "/api/v1/services/references" && method === "GET") {
    const companyId = await currentSupabaseCompanyId();
    const activeFilter = active === "true" ? "&active=eq.true" : "";
    const categoryFilter = search.get("category") ? `&category=eq.${encodeURIComponent(String(search.get("category")))}` : "";
    const textSearch = search.get("search")?.trim();
    const searchFilter = textSearch
      ? `&or=(code.ilike.*${encodeURIComponent(textSearch)}*,name.ilike.*${encodeURIComponent(textSearch)}*,brand.ilike.*${encodeURIComponent(textSearch)}*,model.ilike.*${encodeURIComponent(textSearch)}*)`
      : "";
    const refs = await supabaseFetch<SupabaseServiceReference[]>(
      `/rest/v1/service_references?select=id,company_id,code,name,category,description,estimated_minutes,brand,model,active,metadata&company_id=eq.${encodeURIComponent(companyId)}&code=neq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&order=code.asc${activeFilter}${categoryFilter}${searchFilter}&limit=500`
    );
    return await hydrateSupabaseServiceReferences(refs) as T;
  }

  if (pathname === "/api/v1/projects/operational-center") {
    const now = new Date().toISOString();
    const project = {
      id: 1,
      name: "Implementacion operacional APEXOS",
      objective: "Coordinar compromisos, entregables, bloqueos y recursos bajo MODELO APEX.",
      status: "activo",
      priority: "alta",
      owner_name: "Direccion Operativa Demo",
      target_date: "2026-06-15T05:00:00.000Z",
      apex_score: 72,
      score_status: "estable",
      progress: 58,
      validated_progress: 50,
      commitments: [
        { id: 1, title: "Validar flujo operativo de campo", description: "Servicios y marcaciones desde celular.", responsible_name: "Coordinador Demo", priority: "alta", target_date: "2026-05-24T05:00:00.000Z", status: "validacion" },
        { id: 2, title: "Resolver visibilidad de ambiente", description: "Asegurar que el despliegue muestre cambios recientes.", responsible_name: "Soporte Demo", priority: "critica", target_date: "2026-05-20T05:00:00.000Z", status: "bloqueado" }
      ],
      deliverables: [
        { id: 1, name: "Centro Operacional APEX", description: "Vista ejecutiva sin Gantt pesado.", responsible_name: "Producto Demo", target_date: "2026-05-28T05:00:00.000Z", status: "activo", validation: "Pendiente aprobacion", evidence_status: "pendiente" }
      ],
      risks: [
        { id: 1, kind: "bloqueo", description: "Ambiente no refleja cambios hasta reconstruir contenedor.", impact: "alto", priority: "critica", responsible_name: "Soporte Demo", action_recommended: "Reconstruir web y validar hash.", status: "activo" }
      ],
      resources: [
        { id: 1, person_id: 101, person_name: "Coordinador Demo", role: "Responsable de resultado", load_level: 70, availability: "disponible", responsibilities: "Cierre de compromisos", assignment_summary: { commitments: 1, deliverables: 0, risks: 0, open_items: 1 }, assignments: { commitments: [{ id: 1, title: "Validar flujo operativo de campo", status: "validacion", target_date: "2026-05-24T05:00:00.000Z" }], deliverables: [], risks: [] } },
        { id: 2, person_id: null, person_name: "Soporte Demo", role: "Desbloqueo", load_level: 90, availability: "saturado", responsibilities: "Ambiente y despliegue", metadata: { source: "participante_externo", organization: "Aliado Demo" }, assignment_summary: { commitments: 1, deliverables: 0, risks: 1, open_items: 2 }, assignments: { commitments: [{ id: 2, title: "Resolver visibilidad de ambiente", status: "bloqueado", target_date: "2026-05-20T05:00:00.000Z" }], deliverables: [], risks: [{ id: 1, kind: "bloqueo", description: "Ambiente no refleja cambios hasta reconstruir contenedor.", status: "activo" }] } }
      ],
      generated_alerts: [
        { type: "bloqueo_activo", title: "Bloqueo activo", description: "Ambiente no refleja cambios hasta reconstruir contenedor.", severity: "warning", action_suggested: "Reconstruir web y validar hash." }
      ],
      logs: [
        { id: "1", action: "demo.supabase", summary: "Datos demo MODELO APEX cargados para sesion Supabase.", created_at: now }
      ],
      indicators: { open_commitments: 2, pending_deliverables: 1, active_blocks: 1, critical_risks: 1, saturated_resources: 1, next_commitments: 2 }
    };
    return {
      active_project: project,
      projects: [project],
      portfolio: { total: 1, active: 1, blocked: 1, validation: 0, average_score: 72 },
      next_actions: [{ title: "Atender bloqueo activo", description: "Ambiente no refleja cambios.", action: "Reconstruir y validar.", severity: "warning" }]
    } as T;
  }

  const serviceOrderActionMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)\/(start|inspection|execution|close|close-not-executed)$/);
  const serviceOrderIncidentsMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)\/incidents$/);
  const serviceOrderPhotosMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)\/photos$/);
  const serviceOrderDetailMatch = pathname.match(/^\/api\/v1\/services\/orders\/([^/]+)$/);
  if (pathname === "/api/v1/services/technicians" && method === "GET") {
    if (technicianSession()) throw new Error("El tecnico no puede consultar el directorio operativo.");
    const companyId = await currentSupabaseCompanyId();
    const rows = await supabaseFetch<Array<{ id: string; first_name?: string; last_name?: string; email?: string; position?: string; metadata?: AnyRow }>>(
      `/rest/v1/employees?select=id,first_name,last_name,email,position,metadata&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&user_type=eq.tecnico&order=first_name.asc&limit=100`
    );
    return rows.map((row) => ({
      id: row.id,
      code: String(row.metadata?.employee_code || row.metadata?.code || "TEC"),
      position: row.position || "Tecnico de servicios",
      user: { name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || String(row.metadata?.name || row.email || "Tecnico"), email: row.email || "" }
    })) as T;
  }
  if (pathname === "/api/v1/services/service-types") {
    if (method === "GET") return await supabaseServiceTypes() as T;
    if (method === "PUT") {
      const body = JSON.parse(String(options.body || "{}")) as { types?: unknown };
      return await saveSupabaseServiceTypes(body.types) as T;
    }
  }
  if (pathname === "/api/v1/services/service-stores") {
    if (method === "GET") return await supabaseServiceStores() as T;
    if (method === "PUT") {
      const body = JSON.parse(String(options.body || "{}")) as { stores?: unknown };
      return await saveSupabaseServiceStores(body.stores) as T;
    }
  }
  if (pathname === "/api/v1/services/satisfaction-questions") {
    if (method === "GET") return await supabaseSatisfactionQuestions() as T;
    if (method === "PUT") {
      const body = JSON.parse(String(options.body || "{}")) as { questions?: unknown };
      return await saveSupabaseSatisfactionQuestions(body.questions) as T;
    }
  }
  if (pathname === "/api/v1/services/orders" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}"));
    if (technicianSession()) throw new Error("El tecnico no puede crear ordenes de servicio.");
    const requiredServiceFields = ["reference_id", "technician_id", "service_type", "scheduled_date", "customer_name", "customer_document", "customer_phone", "customer_address", "notes"];
    const missingServiceFields = requiredServiceFields.filter((field) => body[field] == null || String(body[field]).trim() === "");
    if (missingServiceFields.length) throw new Error("Completa todos los campos obligatorios de la orden de servicio.");
    if (!/^\d+$/.test(String(body.customer_document))) throw new Error("La cedula del cliente debe contener solo numeros.");
    const employee = await currentSupabaseEmployee();
    const membership = employee?.company_id ? null : await currentSupabaseCompanyUser();
    const companyId = employee?.company_id || membership?.company_id;
    if (!companyId) throw new Error("No se encontro una empresa activa para crear el servicio.");
    const userId = currentSupabaseUserId();
    const referenceId = uuidOrNull(body.reference_id || body.reference_item_id);
    if (!referenceId) throw new Error("Selecciona una referencia valida para crear el servicio.");
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const requestedNumber = String(body.number || "").trim();
    if (requestedNumber) {
      const existing = await supabaseFetch<Array<{ id: string; number: string }>>(
        `/rest/v1/service_orders?select=id,number&company_id=eq.${encodeURIComponent(companyId)}&number=eq.${encodeURIComponent(requestedNumber)}&limit=1`
      );
      if (existing[0]?.id) {
        throw new Error("La orden ya existe. Actualiza la orden existente en lugar de crear una nueva.");
      }
    }
    const serviceType = await ensureSupabaseServiceType(body.service_type || "montaje");
    const technician = await activeSupabaseServiceTechnician(companyId, body.technician_id);
    const orderNumber = await nextSupabaseServiceOrderNumber(companyId);
    const row = {
      company_id: companyId,
      number: orderNumber,
      reference_id: referenceId,
      technician_employee_id: technician.id,
      technician_user_id: technician.user_id || null,
      service_type: serviceType,
      status: "pendiente",
      customer_name: body.customer_name,
      customer_address: body.customer_address,
      customer_phone: body.customer_phone || "",
      invoice_number: body.invoice_number || "",
      scheduled_date: body.scheduled_date || localDate(),
      notes: body.notes || "",
      metadata: { ...metadata, created_from: "apexos_web_supabase", created_by_user_id: userId || null }
    };
    const inserted = await supabaseFetch<Array<{
      id: string;
      number: string;
      reference_id?: string;
      technician_employee_id?: string;
      service_type?: string;
      status?: string;
      customer_name: string;
      customer_address: string;
      customer_phone?: string;
      invoice_number?: string;
      scheduled_date?: string;
      created_at?: string;
      notes?: string;
      metadata?: AnyRow;
    }>>("/rest/v1/service_orders?select=id,number,reference_id,technician_employee_id,service_type,status,customer_name,customer_address,customer_phone,invoice_number,scheduled_date,created_at,notes,metadata", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
    if (!inserted[0]?.id) throw new Error("El servicio se envio, pero Supabase no retorno la orden creada.");
    return inserted[0] as T;
  }

  if (serviceOrderDetailMatch && method === "PUT") {
    const orderId = serviceOrderDetailMatch[1];
    const body = JSON.parse(String(options.body || "{}")) as AnyRow;
    if (technicianSession()) throw new Error("El tecnico no puede editar ordenes de servicio.");
    const current = await accessibleSupabaseServiceOrder(orderId);
    if (["cerrada", "no_ejecutada"].includes(String(current.status || ""))) {
      throw new Error("Las ordenes finalizadas no se pueden editar para proteger la trazabilidad.");
    }
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata as AnyRow : {};
    const bodyMetadata = body.metadata && typeof body.metadata === "object" ? body.metadata as AnyRow : {};
    const patch: AnyRow = {};
    const nextMetadata: AnyRow = { ...metadata, ...bodyMetadata };
    const referenceId = body.reference_id ? uuidOrNull(body.reference_id) : null;
    if (body.reference_id && !referenceId) throw new Error("Selecciona una referencia valida.");
    if (referenceId) {
      const references = await supabaseFetch<Array<{ id: string }>>(
        `/rest/v1/service_references?select=id&id=eq.${encodeURIComponent(referenceId)}&company_id=eq.${encodeURIComponent(String(current.company_id))}&active=eq.true&limit=1`
      );
      if (!references[0]?.id) throw new Error("Selecciona una referencia activa.");
      patch.reference_id = referenceId;
    }
    if (body.technician_id) {
      const technician = await activeSupabaseServiceTechnician(String(current.company_id), body.technician_id);
      patch.technician_employee_id = technician.id;
      patch.technician_user_id = technician.user_id || null;
      nextMetadata.reassigned_at = new Date().toISOString();
      nextMetadata.reassigned_by_user_id = currentSupabaseUserId() || null;
    }
    if (body.status != null) {
      const nextStatus = String(body.status || "").trim() || String(current.status || "agendado");
      const allowedStatuses = new Set(["agendado", "pendiente", "cancelada"]);
      if (!allowedStatuses.has(nextStatus)) throw new Error("Selecciona un estado valido para la orden.");
      const technicianReady = Boolean(patch.technician_employee_id || current.technician_employee_id);
      if (nextStatus === "pendiente" && !technicianReady) throw new Error("Asigna un tecnico responsable antes de pasar la preorden a pendiente.");
      if (nextStatus !== "agendado" || current.status === "agendado") patch.status = nextStatus;
      nextMetadata.requires_admin_completion = nextStatus === "agendado";
      nextMetadata.preorder_status = nextStatus === "agendado" ? "agendado" : "";
      if (nextStatus === "pendiente") {
        nextMetadata.scheduled_from_public_request_at = new Date().toISOString();
      }
    }
    if (body.service_type != null) patch.service_type = await ensureSupabaseServiceType(body.service_type || "montaje");
    if (body.customer_name != null) patch.customer_name = String(body.customer_name || "").trim();
    if (body.customer_address != null) patch.customer_address = String(body.customer_address || "").trim();
    if (body.customer_phone != null) patch.customer_phone = String(body.customer_phone || "").trim();
    if (body.invoice_number != null) patch.invoice_number = String(body.invoice_number || "").trim();
    if (body.notes != null) patch.notes = String(body.notes || "").trim();
    if (body.scheduled_date != null && String(body.scheduled_date).trim()) patch.scheduled_date = String(body.scheduled_date).slice(0, 10);
    if (body.customer_document != null) {
      if (!/^\d+$/.test(String(body.customer_document))) throw new Error("La cedula del cliente debe contener solo numeros.");
      nextMetadata.customer_document = String(body.customer_document);
    }
    if (body.cedi_delivery_date != null && String(body.cedi_delivery_date).trim()) {
      nextMetadata.cedi_delivery_date = String(body.cedi_delivery_date).slice(0, 10);
    }
    patch.metadata = {
      ...nextMetadata,
      last_admin_edit_at: new Date().toISOString(),
      last_admin_edit_by_user_id: currentSupabaseUserId() || null
    };
    await supabaseFetch<void>(`/rest/v1/service_orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch)
    });
    return await supabaseApiFallback<T>(`/api/v1/services/orders/${orderId}`);
  }

  if (serviceOrderActionMatch && method === "PATCH") {
    const [, orderId, action] = serviceOrderActionMatch;
    const body = JSON.parse(String(options.body || "{}"));
    const current = await accessibleSupabaseServiceOrder(orderId);
    const now = new Date().toISOString();
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const patch: AnyRow = { metadata: { ...metadata, ...(body.metadata || {}) } };

    if (action === "start") {
      patch.status = "en_curso";
      patch.started_at = now;
      patch.start_latitude = body.latitude ?? null;
      patch.start_longitude = body.longitude ?? null;
      patch.metadata = { ...metadata, ...(body.metadata || {}), start_accuracy_meters: body.accuracy_meters ?? null };
    }
    if (action === "inspection") {
      const items = Array.isArray(body.items) ? body.items.map((item: AnyRow) => ({
        part_id: item.part_id,
        name: item.name,
        quantity: Number(item.quantity || 1),
        unit: item.unit || "und",
        status: item.status || "ok",
        comment: item.comment || "",
        action: item.action || "ninguna",
        supplier_name: item.supplier_name || ""
      })) : [];
      patch.status = "inspeccion";
      patch.metadata = {
        ...metadata,
        inspection: {
          items,
          decision: body.decision || "pendiente",
          problem_count: items.filter((item: AnyRow) => item.status !== "ok").length,
          inspected_at: now,
          ...(body.metadata || {})
        }
      };
    }
    if (action === "execution") {
      patch.status = "ejecucion";
      patch.metadata = {
        ...metadata,
        inspection: {
          ...((metadata.inspection as AnyRow) || {}),
          decision: "armable",
          moved_to_execution_at: now
        }
      };
    }
    if (action === "close" || action === "close-not-executed") {
      const evidence = await supabaseFetch<Array<{ evidence_type?: string; metadata?: AnyRow }>>(
        `/rest/v1/service_evidence?select=evidence_type,metadata&order_id=eq.${encodeURIComponent(orderId)}&limit=100`
      );
      const available = new Set(evidence.map((item) => String(item.metadata?.original_type || item.evidence_type || "")));
      const required = action === "close" ? ["producto_abierto", "producto_cerrado", "firma_cliente"] : ["no_ejecutada", "firma_cliente"];
      const missing = required.filter((item) => !available.has(item));
      if (missing.length) throw new Error(`Faltan evidencias para cerrar: ${missing.join(", ")}.`);
      if (action === "close") {
        const answers = Array.isArray(body.metadata?.satisfaction_survey?.answers) ? body.metadata.satisfaction_survey.answers : [];
        const requiredQuestions = (await supabaseSatisfactionQuestions()).filter((question) => question.active);
        const requiredQuestionIds = new Set(requiredQuestions.map((question) => question.id));
        const validQuestionIds = new Set(answers
          .filter((answer: AnyRow) => {
            const rating = Number(answer?.rating);
            return requiredQuestionIds.has(String(answer?.question_id || "")) && Number.isInteger(rating) && rating >= 1 && rating <= 5;
          })
          .map((answer: AnyRow) => String(answer.question_id)));
        if (validQuestionIds.size !== requiredQuestionIds.size) throw new Error(`Completa las ${requiredQuestionIds.size} preguntas de satisfaccion antes de cerrar el servicio.`);
      }
      if (action === "close-not-executed" && !String(body.no_execution_reason || "").trim()) throw new Error("El motivo de no ejecucion es obligatorio.");
      patch.status = action === "close" ? "cerrada" : "no_ejecutada";
      patch.closed_at = now;
      patch.close_latitude = body.latitude ?? null;
      patch.close_longitude = body.longitude ?? null;
      patch.no_execution_reason = action === "close-not-executed" ? body.no_execution_reason : null;
      patch.metadata = { ...metadata, ...(body.metadata || {}), close_accuracy_meters: body.accuracy_meters ?? null };
      if (action === "close-not-executed") {
        await supabaseFetch<void>("/rest/v1/service_incidents", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            company_id: current.company_id,
            order_id: orderId,
            type: "no_ejecutada",
            description: body.no_execution_reason,
            action: "cierre_no_ejecutado",
            metadata: body.metadata || {}
          })
        });
      }
    }

    await supabaseFetch<void>(`/rest/v1/service_orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch)
    });
    return await supabaseApiFallback<T>(`/api/v1/services/orders/${orderId}`);
  }

  if (serviceOrderIncidentsMatch && method === "POST") {
    const orderId = serviceOrderIncidentsMatch[1];
    const body = JSON.parse(String(options.body || "{}"));
    const current = await accessibleSupabaseServiceOrder(orderId);
    await supabaseFetch<void>("/rest/v1/service_incidents", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        company_id: current.company_id,
        order_id: orderId,
        type: body.type || "averia",
        description: body.description,
        action: body.action || "",
        photo_url: body.photo_url || "",
        metadata: body.metadata || {}
      })
    });
    const inserted = await supabaseFetch<Array<{ id: string; order_id: string; type?: string; description?: string; action?: string; created_at?: string }>>(
      `/rest/v1/service_incidents?select=id,order_id,type,description,action,created_at&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc&limit=1`
    );
    if (!inserted[0]?.id) throw new Error("La novedad se envio, pero no fue posible leer el registro creado.");
    return inserted[0] as T;
  }

  if (serviceOrderPhotosMatch) {
    const orderId = serviceOrderPhotosMatch[1];
    if (method === "GET") {
      await accessibleSupabaseServiceOrder(orderId);
      const photos = await supabaseFetch<ServiceEvidenceRow[]>(
        `/rest/v1/service_evidence?select=id,evidence_type,file_url,storage_bucket,storage_path,mime_type,size_bytes,metadata,created_at&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc&limit=100`
      );
      return await Promise.all(photos.map(resolveServiceEvidencePhoto)) as T;
    }
    if (method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      const current = await accessibleSupabaseServiceOrder(orderId);
      const originalType = String(body.type || body.evidence_type || "novedad");
      const allowedType = ["fachada", "producto_abierto", "producto_cerrado", "cliente", "firma_cliente", "no_ejecutada"].includes(originalType) ? originalType : "novedad";
      const uploaded = body.base64_data && !body.storage_path
        ? await uploadServiceImageData(current.company_id, orderId, {
          base64: String(body.base64_data),
          name: String(body.file_name || `${allowedType}.jpg`),
          type: String(body.mime_type || "image/jpeg")
        })
        : null;
      await supabaseFetch<void>("/rest/v1/service_evidence", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          company_id: current.company_id,
          order_id: orderId,
          evidence_type: allowedType,
          file_url: body.file_url || "",
          storage_bucket: uploaded?.bucket || body.storage_bucket || "service-images",
          storage_path: uploaded?.storagePath || body.storage_path || "",
          mime_type: body.mime_type || "",
          size_bytes: Number(body.size_bytes || 0),
          metadata: { ...(body.metadata || {}), original_type: originalType, file_name: body.file_name || "" }
        })
      });
      const inserted = await supabaseFetch<ServiceEvidenceRow[]>(
        `/rest/v1/service_evidence?select=id,evidence_type,file_url,storage_bucket,storage_path,mime_type,size_bytes,metadata,created_at&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc&limit=1`
      );
      const photo = inserted[0];
      if (!photo?.id) throw new Error("La evidencia se envio, pero no fue posible leer el registro creado.");
      return await resolveServiceEvidencePhoto({ ...photo, metadata: { ...(photo.metadata || {}), original_type: originalType } }) as T;
    }
  }

  if (pathname === "/api/v1/services/orders" || serviceOrderDetailMatch) {
    const status = search.get("status");
    const orderLimit = serviceOrderDetailMatch
      ? 1
      : Math.min(Math.max(Number(search.get("limit") || 50), 1), 150);
    const employee = technicianSession() ? await currentSupabaseEmployee() : null;
    const companyId = employee?.company_id || await currentSupabaseCompanyId();
    const filters = [
      `company_id=eq.${encodeURIComponent(companyId)}`,
      status ? `status=eq.${encodeURIComponent(status)}` : "",
      serviceOrderDetailMatch ? `id=eq.${encodeURIComponent(serviceOrderDetailMatch[1])}` : "",
      employee && !isVirtualEmployee(employee) ? `technician_employee_id=eq.${encodeURIComponent(employee.id)}` : "",
      technicianSession() && !serviceOrderDetailMatch ? "status=in.(pendiente,en_curso,inspeccion,ejecucion)" : ""
    ].filter(Boolean).join("&");
    const orders = await supabaseFetch<Array<{
      id: string;
      number: string;
      reference_id?: string;
      technician_employee_id?: string;
      service_type?: string;
      status?: string;
      customer_name: string;
      customer_address: string;
      customer_phone?: string;
      invoice_number?: string;
      scheduled_date?: string;
      started_at?: string;
      closed_at?: string;
      created_at?: string;
      notes?: string;
      metadata?: AnyRow;
    }>>(`/rest/v1/service_orders?select=id,number,reference_id,technician_employee_id,service_type,status,customer_name,customer_address,customer_phone,invoice_number,scheduled_date,started_at,closed_at,created_at,notes,metadata&order=created_at.desc${filters ? `&${filters}` : ""}&limit=${orderLimit}`);
    if (serviceOrderDetailMatch && !orders[0]) return null as T;
    const orderIds = orders.map((order) => order.id);
    const orderFilter = orderIds.length ? `&order_id=in.(${orderIds.join(",")})` : "&order_id=is.null";
    const technicianIds = Array.from(new Set(orders.map((order) => order.technician_employee_id).filter(Boolean) as string[]));
    const technicianFilter = technicianIds.length ? `&id=in.(${technicianIds.join(",")})` : "&id=is.null";
    const evidenceSelect = serviceOrderDetailMatch
      ? "id,order_id,evidence_type,file_url,storage_bucket,storage_path,mime_type,size_bytes,metadata,created_at"
      : "id,order_id,evidence_type,storage_bucket,storage_path,mime_type,size_bytes,metadata,created_at";
    const [refs, parts, incidents, evidence, technicians] = await Promise.all([
      supabaseFetch<Array<{ id: string; code: string; name: string; category?: string; estimated_minutes?: number; brand?: string; model?: string; metadata?: AnyRow }>>(`/rest/v1/service_references?select=id,code,name,category,estimated_minutes,brand,model,metadata&company_id=eq.${encodeURIComponent(companyId)}&code=neq.${encodeURIComponent(SERVICE_TYPES_REFERENCE_CODE)}&limit=200`).catch((error) => {
        safeDevLog("No fue posible consultar referencias de servicios Supabase.", error);
        return [];
      }),
      supabaseFetch<Array<{ id: string; reference_id: string; name: string; quantity: number; unit: string; display_order?: number }>>("/rest/v1/service_reference_parts?select=id,reference_id,name,quantity,unit,display_order&order=display_order.asc&limit=1000").catch((error) => {
        safeDevLog("No fue posible consultar partes de referencias Supabase.", error);
        return [];
      }),
      supabaseFetch<Array<{ id: string; order_id: string; type?: string; description?: string; action?: string }>>(`/rest/v1/service_incidents?select=id,order_id,type,description,action${orderFilter}&limit=500`).catch((error) => {
        safeDevLog("No fue posible consultar novedades de servicios Supabase.", error);
        return [];
      }),
      supabaseFetch<ServiceEvidenceRow[]>(`/rest/v1/service_evidence?select=${evidenceSelect}${orderFilter}&limit=500`).catch((error) => {
        safeDevLog("No fue posible consultar evidencias de servicios Supabase.", error);
        return [];
      }),
      supabaseFetch<Array<{ id: string; first_name?: string; last_name?: string; email?: string; metadata?: AnyRow }>>(`/rest/v1/employees?select=id,first_name,last_name,email,metadata&company_id=eq.${encodeURIComponent(companyId)}&user_type=eq.tecnico${technicianFilter}&limit=500`).catch((error) => {
        safeDevLog("No fue posible consultar tecnicos de servicios Supabase.", error);
        return [];
      })
    ]);

    const resolvedEvidence = serviceOrderDetailMatch
      ? await Promise.all(evidence.map(resolveServiceEvidencePhoto))
      : evidence;
    const mapped = orders.map((order) => {
      const reference = refs.find((ref) => ref.id === order.reference_id);
      const referenceWithParts = reference ? {
        ...reference,
        parts: parts.filter((part) => part.reference_id === reference.id),
        manuals: Array.isArray(reference.metadata?.manuals) ? reference.metadata.manuals : []
      } : null;
      const technician = technicians.find((item) => item.id === order.technician_employee_id);
      const effectiveStatus = effectiveServiceOrderStatus(order);
      return {
        ...order,
        technician: technician ? {
          id: technician.id,
          user: {
            name: [technician.first_name, technician.last_name].filter(Boolean).join(" ").trim() || String(technician.metadata?.name || technician.email || "Tecnico"),
            email: technician.email || ""
          }
        } : null,
        reference: referenceWithParts,
        reference_id: order.reference_id || "",
        service_type: order.service_type || "servicio",
        status: effectiveStatus,
        customer_phone: order.customer_phone || "",
        scheduled_date: order.scheduled_date || "",
        incidents: incidents.filter((item) => item.order_id === order.id),
        photos: resolvedEvidence.filter((item) => item.order_id === order.id).map((item) => ({ ...item, type: String(item.metadata?.original_type || item.evidence_type || "") })),
        evidence: resolvedEvidence.filter((item) => item.order_id === order.id).map((item) => ({ ...item, type: String(item.metadata?.original_type || item.evidence_type || "") })),
        inspection_items: referenceWithParts?.parts?.map((part) => ({ part_id: part.id, name: part.name, status: "pendiente" })) || []
      };
    });

    return (serviceOrderDetailMatch ? mapped[0] || null : { data: mapped, kpis: kpisForOrders(mapped) }) as T;
  }

  if (pathname === "/api/v1/admin/permissions/catalog") {
    return filteredAdminPermissionCatalog() as T;
  }

  if (pathname === "/api/v1/admin/roles") {
    const roles = storedAdminRoles();
    if (method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      const name = String(body.name || body.nombre || "Nuevo rol").trim().replace(/\s+/g, " ");
      const duplicate = roles.find((role) => normalizeAdminRoleNameKey(role.name) === normalizeAdminRoleNameKey(name));
      if (duplicate) throw new Error(`Ya existe un rol visualmente igual: "${duplicate.name}". Usa otro nombre o edita el rol existente.`);
      const role = {
        id: Math.max(0, ...roles.map((item) => Number(item.id))) + 1,
        name,
        description: body.description || body.descripcion || "",
        active: body.active !== false && body.activo !== false,
        is_system: false,
        hierarchy_level: Number(body.hierarchy_level || 10),
        role_type: body.role_type || "custom",
        scope: body.scope || "company",
        scopes: body.scopes || { locations: [], areas: [], cost_centers: [], processes: [] },
        restrictions: body.restrictions || { locations: [], areas: [], cost_centers: [], processes: [] },
        can_delegate: Boolean(body.can_delegate),
        sensitive: Boolean(body.sensitive),
        permissions: filterAdminPermissions(body.permissions || emptyAdminPermissions())
      };
      const next = [...roles, role];
      saveStoredAdminRoles(next);
      return role as T;
    }
    return roles as T;
  }

  const adminRoleMatch = pathname.match(/^\/api\/v1\/admin\/roles\/(\d+)(?:\/status)?$/);
  if (adminRoleMatch) {
    const roles = storedAdminRoles();
    const roleId = Number(adminRoleMatch[1]);
    const body = JSON.parse(String(options.body || "{}"));
    const current = roles.find((role) => role.id === roleId);
    if (method === "DELETE") {
      if (!current) return { ok: true, id: roleId } as T;
      if (current.is_system || current.name === "APEX_ADMIN") throw new Error("Los roles de sistema no se pueden eliminar.");
      const next = roles.filter((role) => role.id !== roleId);
      saveStoredAdminRoles(next);
      return { ok: true, id: roleId } as T;
    }
    const nextName = current?.is_system ? current.name : String(body.name || body.nombre || current?.name || "").trim().replace(/\s+/g, " ");
    const duplicate = roles.find((role) => role.id !== roleId && normalizeAdminRoleNameKey(role.name) === normalizeAdminRoleNameKey(nextName));
    if (duplicate) throw new Error(`Ya existe un rol visualmente igual: "${duplicate.name}". Usa otro nombre o edita el rol existente.`);
    const next = roles.map((role) => role.id === roleId ? {
      ...role,
      name: role.is_system ? role.name : nextName,
      description: body.description || body.descripcion || role.description,
      active: pathname.endsWith("/status") ? Boolean(body.active ?? body.activo) : (body.active !== false && body.activo !== false),
      hierarchy_level: Number(body.hierarchy_level || role.hierarchy_level || 10),
      role_type: body.role_type || role.role_type || "custom",
      scope: body.scope || role.scope || "company",
      scopes: body.scopes || role.scopes || { locations: [], areas: [], cost_centers: [], processes: [] },
      restrictions: body.restrictions || role.restrictions || { locations: [], areas: [], cost_centers: [], processes: [] },
      can_delegate: body.can_delegate ?? role.can_delegate ?? false,
      sensitive: body.sensitive ?? role.sensitive ?? false,
        permissions: filterAdminPermissions(body.permissions || role.permissions)
    } : role);
    saveStoredAdminRoles(next);
    return (next.find((role) => role.id === roleId) || null) as T;
  }

  if (pathname === "/api/v1/admin/user-master-data") {
    return { ...getStoredUserMasterData(), roles: storedAdminRoles() } as T;
  }

  const adminCatalogItemMatch = pathname.match(/^\/api\/v1\/admin\/user-master-data\/([^/]+)\/items(?:\/([^/]+))?$/);
  if (adminCatalogItemMatch && ["POST", "PUT", "DELETE"].includes(method)) {
    const catalogCode = adminCatalogItemMatch[1];
    const itemCode = adminCatalogItemMatch[2] ? decodeURIComponent(adminCatalogItemMatch[2]) : "";
    const body = JSON.parse(String(options.body || "{}"));
    const data = getStoredUserMasterData();
    const current = Array.isArray((data as AnyRow)[catalogCode]) ? ((data as AnyRow)[catalogCode] as Array<{ code: string; name: string; description?: string; active?: boolean; sort_order?: number }>) : [];
    if (method === "DELETE") {
      const nextData = { ...data, [catalogCode]: current.filter((entry) => entry.code !== itemCode) };
      saveStoredUserMasterData(nextData);
      const membership = await currentSupabaseCompanyUser().catch(() => null);
      if (membership?.company_id) {
        const catalogs = await supabaseFetch<Array<{ id: string }>>(
          `/rest/v1/master_catalogs?select=id&or=(and(code.eq.${encodeURIComponent(catalogCode)},company_id.eq.${encodeURIComponent(membership.company_id)}),and(code.eq.${encodeURIComponent(catalogCode)},company_id.is.null))&limit=1`
        ).catch(() => []);
        const catalogId = catalogs[0]?.id;
        if (catalogId) {
          await supabaseFetch(`/rest/v1/master_catalog_items?catalog_id=eq.${encodeURIComponent(catalogId)}&company_id=eq.${encodeURIComponent(membership.company_id)}&code=eq.${encodeURIComponent(itemCode)}`, {
            method: "DELETE"
          }).catch((error) => safeDevLog("No fue posible eliminar item de catalogo en Supabase.", error));
        }
      }
      return { ...nextData, roles: storedAdminRoles() } as T;
    }
    const item = {
      code: String(body.code || itemCode || "").trim(),
      name: String(body.name || "").trim(),
      description: String(body.description || "").trim(),
      active: body.active !== false,
      sort_order: Number(body.sort_order || 100)
    };
    if (!item.code || !item.name) throw new Error("Codigo y nombre del catalogo son obligatorios.");
    const targetCode = itemCode || item.code;
    if (targetCode !== item.code && current.some((entry) => entry.code === item.code)) throw new Error("Ya existe otro item con ese codigo.");
    const next = current.some((entry) => entry.code === targetCode)
      ? current.map((entry) => entry.code === targetCode ? { ...entry, ...item } : entry)
      : [...current, item];
    const nextData = { ...data, [catalogCode]: next };
    saveStoredUserMasterData(nextData);

    const membership = await currentSupabaseCompanyUser().catch(() => null);
    if (membership?.company_id) {
      const catalogs = await supabaseFetch<Array<{ id: string }>>(
        `/rest/v1/master_catalogs?select=id&or=(and(code.eq.${encodeURIComponent(catalogCode)},company_id.eq.${encodeURIComponent(membership.company_id)}),and(code.eq.${encodeURIComponent(catalogCode)},company_id.is.null))&limit=1`
      ).catch(() => []);
      const catalogId = catalogs[0]?.id;
      if (catalogId) {
        if (targetCode !== item.code) {
          await supabaseFetch(`/rest/v1/master_catalog_items?catalog_id=eq.${encodeURIComponent(catalogId)}&company_id=eq.${encodeURIComponent(membership.company_id)}&code=eq.${encodeURIComponent(targetCode)}`, {
            method: "DELETE"
          }).catch((error) => safeDevLog("No fue posible retirar codigo anterior de catalogo en Supabase.", error));
        }
        await supabaseFetch("/rest/v1/master_catalog_items?on_conflict=catalog_id,code", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            catalog_id: catalogId,
            company_id: membership.company_id,
            code: item.code,
            name: item.name,
            description: item.description || null,
            active: item.active,
            sort_order: item.sort_order
          })
        }).catch((error) => safeDevLog("No fue posible persistir item de catalogo en Supabase.", error));
      }
    }
    return { ...nextData, roles: storedAdminRoles() } as T;
  }

  const adminUserDocumentMatch = pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)\/documents(?:\/([^/]+))?$/);
  if (adminUserDocumentMatch) {
    const [, userId, documentId] = adminUserDocumentMatch;
    const body = options.body ? JSON.parse(String(options.body)) : {};
    if (method === "DELETE" && !hasStoredPermission("admin", PHYSICAL_DELETE_PERMISSION)) {
      throw new Error("No tienes permiso especial para eliminar documentos de la base.");
    }
    const nextApiOk = await nextAdminUsersRequest({
      method: "PATCH",
      body: JSON.stringify(method === "DELETE"
        ? { employee_id: userId, action: "document_remove", document_id: documentId }
        : { employee_id: userId, action: "document_add", ...body, document_id: body.id || `doc-${Date.now()}` })
    }).then(() => true).catch((error) => {
      safeDevLog("No fue posible actualizar documentos via Next API.", error);
      return false;
    });
    if (!nextApiOk) {
      const employees = await supabaseFetch<Array<{ id: string; metadata?: AnyRow }>>(`/rest/v1/employees?select=id,metadata&id=eq.${encodeURIComponent(userId)}&limit=1`).catch(() => []);
      const current = employees[0];
      const metadata = current?.metadata || {};
      const documents = Array.isArray(metadata.documents) ? metadata.documents : [];
      const nextDocuments = method === "DELETE"
        ? documents.filter((document) => String((document as AnyRow).id) !== String(documentId))
        : [...documents, {
          id: body.id || `doc-${Date.now()}`,
          document_type: body.document_type || "internal",
          file_name: body.file_name || "documento",
          file_url: body.file_url || "",
          storage_path: body.storage_path || "",
          mime_type: body.mime_type || "",
          file_size: Number(body.file_size || 0),
          status: body.status || "pending",
          observations: body.observations || "",
          uploaded_at: new Date().toISOString()
        }];
      if (current?.id) {
        await supabaseFetch(`/rest/v1/employees?id=eq.${encodeURIComponent(current.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ metadata: { ...metadata, documents: nextDocuments } })
        });
      }
    }
    return supabaseApiFallback(`/api/v1/admin/users`) as T;
  }

  const adminUserAccessMatch = pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)\/access$/);
  if (adminUserAccessMatch) {
    const body = JSON.parse(String(options.body || "{}"));
    const nextApiOk = await nextAdminUsersRequest({
      method: "PATCH",
      body: JSON.stringify({ employee_id: adminUserAccessMatch[1], action: "access", ...body })
    }).then(() => true).catch((error) => {
      safeDevLog("No fue posible actualizar acceso via Next API.", error);
      return false;
    });
    if (!nextApiOk) {
      const employees = await supabaseFetch<Array<{ id: string; metadata?: AnyRow }>>(`/rest/v1/employees?select=id,metadata&id=eq.${encodeURIComponent(adminUserAccessMatch[1])}&limit=1`).catch(() => []);
      const current = employees[0];
      const metadata = current?.metadata || {};
      if (current?.id) {
        await supabaseFetch(`/rest/v1/employees?id=eq.${encodeURIComponent(current.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ metadata: { ...metadata, access: { ...(metadata.access as AnyRow || {}), session_status: body.session_status || "bloqueada", require_password_change: body.require_password_change ?? (metadata.access as AnyRow)?.require_password_change } } })
        });
      }
    }
    return supabaseApiFallback(`/api/v1/admin/users`) as T;
  }

  if (pathname === "/api/v1/admin/users") {
    const roles = storedAdminRoles();
    if (method === "POST") {
      const body = JSON.parse(String(options.body || "{}"));
      const fullName = body.name || `${body.first_names || ""} ${body.last_names || ""}`.trim() || body.email || "Usuario";
      const role = roles.find((item) => item.id === Number(body.role_id)) || roles[0];
      const token = getSupabaseAccessToken();
      if (token) {
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, role_name: role.name })
        });
        if (response.ok) {
          const created = await response.json() as { user_id: string; employee?: AnyRow };
          const employee = created.employee || {};
          return {
            id: toNumberId(employee.id),
            employee_uuid: employee.id,
            user_uuid: created.user_id,
            company_id: employee.company_id,
            name: fullName,
            email: String(employee.email || body.email || ""),
            role_id: role.id,
            role_name: role.name,
            active: employee.status === "active",
            code: String((employee.metadata as AnyRow)?.code || ""),
            document: String(employee.document_number || ""),
            company: String(body.company || "SCJ"),
            position: String(employee.position || ""),
            department: String(employee.department || ""),
            operational_classification: String(employee.user_type || "")
          } as T;
        }
        const errorBody = await response.json().catch(() => ({ message: response.statusText }));
        safeDevLog("No fue posible crear usuario via Next API, delegando al backend:", errorBody);
        return null;
      }
      return null;
    }
    const serverRows = await nextAdminUsersRequest<{ employees: Array<{
      id: string;
      company_id?: string;
      user_id?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      document_number?: string;
      position?: string;
      department?: string;
      status?: string;
      user_type?: string;
      metadata?: AnyRow;
    }> }>({ method: "GET" }).then((result) => result.employees).catch((error) => {
      safeDevLog("No fue posible listar usuarios via Next API.", error);
      return null;
    });
    const employees = serverRows || await supabaseFetch<Array<{
      id: string;
      company_id?: string;
      user_id?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      document_number?: string;
      position?: string;
      department?: string;
      status?: string;
      user_type?: string;
      metadata?: AnyRow;
    }>>("/rest/v1/employees?select=id,company_id,user_id,first_name,last_name,email,document_number,position,department,status,user_type,metadata&order=created_at.desc&limit=250");
    return employees.map((employee) => {
      const name = fullName(employee);
      const roleId = Number(employee.metadata?.role_id || (employee.user_type === "conductor" ? 2 : 1));
      const role = roles.find((item) => item.id === roleId) || roles[0];
      return {
        id: toNumberId(employee.id),
        employee_uuid: employee.id,
        user_uuid: employee.user_id || "",
        company_id: employee.company_id || "",
        name,
        email: employee.email || "",
        role_id: role?.id || roleId,
        role_name: String(employee.metadata?.role_name || role?.name || ""),
        active: employee.status === "active",
        code: String(employee.metadata?.code || employee.document_number || employee.id.slice(0, 8)),
        document: employee.document_number || String(employee.metadata?.document || ""),
        company: "SCJ",
        position: employee.position || employee.user_type || "",
        department: employee.department || "",
        salary_base: 0,
        labor_status: employee.status || "active",
        operational_classification: employee.user_type || employee.position || "operario",
        base_site: "Sede Demo SCJ",
        site: String(employee.metadata?.access && typeof employee.metadata.access === "object" ? (employee.metadata.access as AnyRow).site || "Sede Demo SCJ" : "Sede Demo SCJ"),
        documents: Array.isArray(employee.metadata?.documents) ? employee.metadata.documents : []
      };
    }) as T;
  }

  const adminUserMatch = pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)(?:\/status)?$/);
  if (adminUserMatch && ["PUT", "PATCH"].includes(method)) {
    const body = options.body ? JSON.parse(String(options.body)) : {};
    const employeeId = adminUserMatch[1];
    const nextApiOk = await nextAdminUsersRequest({
      method: "PATCH",
      body: JSON.stringify({ employee_id: employeeId, action: pathname.endsWith("/status") ? "status" : "update", ...body })
    }).then(() => true).catch((error) => {
      safeDevLog("No fue posible actualizar usuario via Next API.", error);
      return false;
    });
    if (!nextApiOk) {
      const rows = await supabaseFetch<Array<{ id: string; first_name?: string; last_name?: string; email?: string; document_type?: string; document_number?: string; metadata?: AnyRow; status?: string }>>(`/rest/v1/employees?select=id,first_name,last_name,email,document_type,document_number,metadata,status&id=eq.${encodeURIComponent(employeeId)}&limit=1`).catch(() => []);
      const current = rows[0];
      if (current?.id) {
        const fullName = body.name || `${body.first_names || ""} ${body.last_names || ""}`.trim();
        const status = pathname.endsWith("/status")
          ? (body.active ? "active" : "inactive")
          : (body.user_status === "inactivo" ? "inactive" : body.user_status === "suspendido" ? "inactive" : current.status || "active");
        const metadata = current.metadata || {};
        const access = (metadata.access as AnyRow) || {};
        const nameParts = String(fullName || `${current.first_name || ""} ${current.last_name || ""}`.trim()).trim().split(/\s+/).filter(Boolean);
        const firstName = body.first_names || (nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : nameParts[0]) || current.first_name || "";
        const lastName = body.last_names || (nameParts.length > 1 ? nameParts.slice(-1).join(" ") : "") || current.last_name || "";
        const nextEmail = body.email || body.access_email || current.email || "";
        const nextRoleId = body.role_id || metadata.role_id || access.role_id;
        const nextRoleName = body.role_name || metadata.role_name || access.role_name;
        await supabaseFetch(`/rest/v1/employees?id=eq.${encodeURIComponent(current.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email: nextEmail,
            document_type: body.document_type || current.document_type || "CC",
            document_number: body.document || current.document_number || metadata.document || "",
            status,
            metadata: {
              ...metadata,
              name: fullName || metadata.name,
              role_id: nextRoleId,
              role_name: nextRoleName,
              document: body.document || current.document_number || metadata.document,
              document_type: body.document_type || current.document_type || metadata.document_type || "CC",
              company: body.company || metadata.company,
              user_status: body.user_status || status,
              access: {
                ...access,
                role_id: nextRoleId,
                role_name: nextRoleName,
                email: nextEmail,
                site: body.site || body.base_site || access.site || "",
                require_password_change: body.require_password_change === undefined ? access.require_password_change : Boolean(body.require_password_change)
              },
              user_audit_trail: [
                ...(Array.isArray(metadata.user_audit_trail) ? metadata.user_audit_trail : []).slice(-9),
                { at: new Date().toISOString(), action: pathname.endsWith("/status") ? "status_updated" : "updated", source: "supabase-fallback" }
              ]
            }
          })
        });
      }
    }
    return supabaseApiFallback(`/api/v1/admin/users`) as T;
  }

  return null;
}

export async function api<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const method = String(options.method || "GET").toUpperCase();
  const cacheKey = method === "GET" && !retried ? `${isSupabaseSession() ? "supabase" : "api"}:${path}` : "";
  if (cacheKey && inFlightGetRequests.has(cacheKey)) return inFlightGetRequests.get(cacheKey) as Promise<T>;
  const request = apiInternal<T>(path, options, retried);
  if (!cacheKey) return request;
  inFlightGetRequests.set(cacheKey, request);
  void request.finally(() => inFlightGetRequests.delete(cacheKey)).catch(() => undefined);
  return request;
}

async function apiInternal<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  assertActiveSession();
  await keepSessionAlive();
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  let response: Response;
  const method = String(options.method || "GET").toUpperCase();
  const supabaseSession = isSupabaseSession();
  const preferOperationalApi = HAS_CONFIGURED_API_URL && shouldPreferOperationalApi(path);

  if (supabaseSession && !preferOperationalApi) {
    const fallback = await supabaseApiFallback<T>(path, options);
    if (fallback !== null) {
      touchSession();
      return fallback;
    }
  }

  if (typeof window !== "undefined" && !HAS_CONFIGURED_API_URL) {
    const detail = "NEXT_PUBLIC_API_URL no esta configurada para este ambiente y la ruta no tiene fallback Supabase disponible.";
    alertRequestFailure(path, null, detail);
    reportClientFailure(path, null, detail, String(options.method || "GET"));
    throw new Error("API de servicios no configurada en este ambiente. Revisa variables Railway o usa una ruta soportada por Supabase.");
  }

  try {
    response = await fetchWithTimeout(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Backend no disponible.";
    alertRequestFailure(path, null, detail);
    reportClientFailure(path, null, detail, String(options.method || "GET"));
    if (error instanceof Error) throw error;
    throw new Error("API no disponible. Revisa el servicio backend.");
  }

  if (response.status === 401 && typeof window !== "undefined") {
    if (!retried && await refreshSessionToken()) {
      return apiInternal<T>(path, options, true);
    }
    alertRequestFailure(path, 401, "Sesion expirada, revocada o no autorizada.");
    clearSession(isSupabaseSession() ? "supabase_unauthorized" : "unauthorized");
    window.location.href = "/login";
    throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  }

  if (!response.ok) {
    if (supabaseSession && !shouldBlockHrWriteFallback(path, method)) {
      const fallback = await supabaseApiFallback<T>(path, options);
      if (fallback !== null) {
        touchSession();
        return fallback;
      }
    }

    if (response.status >= 500) {
      const detail = await response.text().catch(() => "");
      const message = requestErrorMessage(path, response.status, detail);
      alertRequestFailure(path, response.status, detail);
      reportClientFailure(path, response.status, detail, String(options.method || "GET"));
      throw new Error(message);
    }

    const body = await response.json().catch(() => ({ error: response.statusText }));
    const detail = body.error || body.message || response.statusText;
    const message = requestErrorMessage(path, response.status, detail);
    alertRequestFailure(path, response.status, detail);
    reportClientFailure(path, response.status, detail, String(options.method || "GET"));
    throw new Error(message);
  }
  touchSession();
  return response.json() as Promise<T>;
}
