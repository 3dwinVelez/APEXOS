import { ApexModule } from "./modules";
import { CompanyModuleStatus, listActivePlatformAdmins, listCompanyModuleStatus, listUserCompanies } from "./supabaseQa";
import { supabaseFetch } from "./supabaseClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const HAS_CONFIGURED_API_URL = Boolean(process.env.NEXT_PUBLIC_API_URL);
const SUPABASE_PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || "";
const MODULE_ACCESS_CACHE_KEY = "apexos_module_access_cache_v2";
const MODULE_ACCESS_CACHE_MS = 60_000;
const ROLE_CONTEXT_FETCHED_AT_KEY = "apexos_role_context_fetched_at";
const ROLE_CONTEXT_TIMEOUT_MS = 2_500;
const PLATFORM_ADMIN_MODULE_SLUGS = new Set(["administracion"]);
let moduleAccessInFlight: { token: string; promise: Promise<ModuleAccessState> } | null = null;

export type ModuleAccessState = {
  loading: boolean;
  isPlatformAdmin: boolean;
  bySlug: Record<string, boolean>;
  orderBySlug?: Record<string, number>;
};

type UserCompany = {
  company_id: string;
  company_name: string;
  role: string;
};

type StoredRolePermission = {
  module?: string;
  action?: string;
  actions?: string[];
};

type StoredLegacyPermissions = Record<string, Record<string, boolean>>;
type AnyRow = Record<string, unknown>;

const moduleCodeBySlug: Record<string, string> = {
  activos: "activos",
  administracion: "administracion_apex",
  "apex-ai": "apex_ai",
  calidad: "calidad",
  cartera: "cxc",
  cxc: "cxc",
  "facturacion-ventas": "facturacion",
  "comercio-exterior": "comercio_exterior",
  compras: "compras",
  contabilidad: "contabilidad",
  costos: "costos",
  crm: "crm",
  devoluciones: "devoluciones",
  facturacion: "facturacion",
  "facturacion-electronica": "facturacion_electronica",
  "configuracion-inicial": "configuracion_inicial",
  inventario: "inventario",
  "planeacion-demanda": "planeacion_demanda",
  "punto-de-venta": "punto_de_venta",
  presupuestos: "presupuestos",
  produccion: "produccion",
  proyectos: "proyectos",
  recetas: "recetas",
  servicios: "servicios",
  suscripciones: "suscripciones",
  "talento-humano": "talento_humano",
  tesoreria: "tesoreria",
  transporte: "transporte",
  ventas: "ventas",
};

const permissionModulesBySlug: Record<string, string[]> = {
  administracion: ["admin", "users", "roles", "tenants", "settings", "audit"],
  "apex-ai": ["brain", "ai"],
  compras: ["purchases"],
  contabilidad: ["accounting"],
  facturacion: ["invoicing"],
  inventario: ["inventory", "wms"],
  proyectos: ["projects"],
  servicios: ["services"],
  "talento-humano": ["hr", "time_tracking", "payroll"],
  transporte: ["transport", "logistics", "last_mile"],
  ventas: ["sales"],
  cxc: ["accounts-receivable", "accounting"],
  crm: ["customers", "sales"],
  "comercio-exterior": ["imports", "exports"],
  tesoreria: ["treasury", "accounting"]
};

const legacyPermissionKeysBySlug: Record<string, string[]> = {
  administracion: ["usuarios", "roles", "configuracion", "auditoria", "notificaciones"],
  "apex-ai": ["ia"],
  compras: ["compras", "proveedores", "importaciones"],
  contabilidad: ["contabilidad"],
  facturacion: ["facturacion"],
  inventario: ["inventarios", "wms"],
  proyectos: ["proyectos"],
  servicios: ["servicios"],
  "talento-humano": ["talento_humano", "marcaciones", "nomina"],
  transporte: ["transporte", "logistica", "ultima_milla"],
  ventas: ["ventas", "clientes"],
  cxc: ["cxc", "contabilidad", "facturacion"],
  crm: ["clientes", "ventas"],
  "comercio-exterior": ["importaciones"],
  tesoreria: ["tesoreria", "contabilidad"]
};

export function getModuleCode(module: ApexModule) {
  return moduleCodeBySlug[module.slug] || module.slug.replace(/-/g, "_");
}

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function currentSupabaseUserId() {
  const token = getToken();
  if (!token?.includes(".")) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.sub || "");
  } catch {
    return "";
  }
}

export function isSupabaseSession() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("auth_provider") === "supabase") return true;
  const token = getToken();
  if (!token?.includes(".")) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.iss || "").includes("supabase") || (!!SUPABASE_PROJECT_REF && String(payload.ref || "") === SUPABASE_PROJECT_REF);
  } catch {
    return false;
  }
}

function moduleKeys(module: ApexModule) {
  return [module.id, module.slug, getModuleCode(module)];
}

function getStoredRolePermissions(): StoredRolePermission[] | null {
  if (typeof window === "undefined") return null;
  if (!hasFreshRoleContext()) return null;
  const raw = localStorage.getItem("role_permissions");
  if (!raw) return null;
  try {
    const permissions = JSON.parse(raw);
    return Array.isArray(permissions) ? permissions : null;
  } catch {
    localStorage.removeItem("role_permissions");
    return null;
  }
}

function flattenRolePermissions(value: unknown): StoredRolePermission[] {
  if (Array.isArray(value)) {
    return value.flatMap((permission) => {
      const row = permission && typeof permission === "object" ? permission as Record<string, unknown> : {};
      const permissionModule = String(row.module || row.key || "").trim();
      const actions = Array.isArray(row.actions)
        ? row.actions
        : [row.action, ...Object.entries(row).filter(([, allowed]) => allowed === true).map(([action]) => action)];
      return actions.map((action) => ({ module: permissionModule, action: String(action || "").trim() })).filter((item) => item.module && item.action);
    });
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, Record<string, boolean>>).flatMap(([key, actions]) => (
      Object.entries(actions || {}).filter(([, allowed]) => allowed === true).map(([action]) => ({ module: key, action }))
    ));
  }
  return [];
}

function serviceTechnicianEmployee(employee: { user_type?: string; metadata?: Record<string, unknown> } | null | undefined) {
  const metadata = employee?.metadata || {};
  const access = metadata.access && typeof metadata.access === "object" ? metadata.access as AnyRow : {};
  const operational = metadata.operational && typeof metadata.operational === "object" ? metadata.operational as AnyRow : {};
  const values = [
    employee?.user_type,
    metadata.profile_kind,
    metadata.role_name,
    access.profile_kind,
    access.role_name,
    operational.classification
  ].map((value) => String(value || "").trim().toLowerCase());
  return values.includes("tecnico")
    || values.includes("técnico")
    || metadata.services_assigned_only === true
    || operational.can_receive_services === true;
}

async function refreshSupabaseEmployeeRoleContext(companyId?: string) {
  if (typeof window === "undefined" || !isSupabaseSession()) return null;
  const userId = currentSupabaseUserId();
  const email = localStorage.getItem("user_email") || "";
  const filters = [
    userId ? `user_id=eq.${encodeURIComponent(userId)}` : "",
    !userId && email ? `email=eq.${encodeURIComponent(email)}` : "",
    companyId ? `company_id=eq.${encodeURIComponent(companyId)}` : "",
    "status=eq.active"
  ].filter(Boolean).join("&");
  if (!filters) return null;
  const rows = await supabaseFetch<Array<{ user_type?: string; metadata?: Record<string, unknown> }>>(
    `/rest/v1/employees?select=user_type,metadata&${filters}&limit=20`
  ).catch(() => []);
  const employee = rows.find(serviceTechnicianEmployee) || rows[0];
  const metadata = employee?.metadata || {};
  const permissions = flattenRolePermissions(metadata.permissions);
  if (permissions.length) {
    localStorage.setItem("role_permissions", JSON.stringify(permissions));
    if (metadata.permissions && typeof metadata.permissions === "object" && !Array.isArray(metadata.permissions)) {
      localStorage.setItem("role_metadata", JSON.stringify({
        role_type: metadata.role_type,
        role_scope: metadata.role_scope,
        legacy_permissions: metadata.permissions
      }));
    }
  }
  const roleName = String(metadata.role_name || "").trim();
  const profileKind = String(metadata.profile_kind || employee?.user_type || "").trim().toLowerCase();
  if (roleName) localStorage.setItem("role_name", roleName);
  if (profileKind) localStorage.setItem("profile_kind", profileKind);
  if (permissions.length || roleName || profileKind) localStorage.setItem(ROLE_CONTEXT_FETCHED_AT_KEY, String(Date.now()));
  return employee || null;
}

function hasFreshRoleContext() {
  if (typeof window === "undefined") return false;
  const fetchedAt = Number(localStorage.getItem(ROLE_CONTEXT_FETCHED_AT_KEY) || 0);
  return fetchedAt > 0 && Date.now() - fetchedAt < MODULE_ACCESS_CACHE_MS * 5;
}

function getStoredLegacyPermissions(): StoredLegacyPermissions | null {
  if (typeof window === "undefined") return null;
  if (!hasFreshRoleContext()) return null;
  const raw = localStorage.getItem("role_metadata");
  if (!raw) return null;
  try {
    const metadata = JSON.parse(raw) as { legacy_permissions?: unknown };
    const legacy = metadata?.legacy_permissions;
    return legacy && typeof legacy === "object" && !Array.isArray(legacy)
      ? legacy as StoredLegacyPermissions
      : null;
  } catch {
    localStorage.removeItem("role_metadata");
    return null;
  }
}

function permissionCandidates(module: ApexModule) {
  return [
    ...(permissionModulesBySlug[module.slug] || []),
    module.slug.replace(/-/g, "_"),
    getModuleCode(module)
  ].map((item) => item.toLowerCase());
}

function hasRoleModuleAccess(module: ApexModule, permissions: StoredRolePermission[] | null) {
  if (!permissions) return true;
  const roleName = typeof window !== "undefined" ? String(localStorage.getItem("role_name") || "").toLowerCase() : "";
  if (["admin", "owner", "superadmin", "administrador", "administrador de empresa"].includes(roleName)) return true;
  const modules = permissionCandidates(module);
  const readActions = new Set(["*", "access", "read", "view", "write", "reports", "administer", "manage_roles", "manage_users"]);
  return permissions.some((permission) => {
    const permissionModule = String(permission.module || "").toLowerCase();
    const permissionAction = String(permission.action || "").toLowerCase();
    const moduleOk = permissionModule === "*" || modules.includes(permissionModule);
    const actionOk = readActions.has(permissionAction);
    return moduleOk && actionOk;
  });
}

function hasLegacyModuleAccess(module: ApexModule, legacy: StoredLegacyPermissions) {
  const roleName = typeof window !== "undefined" ? String(localStorage.getItem("role_name") || "").toLowerCase() : "";
  if (["apex_admin", "superadmin"].includes(roleName)) return true;
  const keys = [
    ...(legacyPermissionKeysBySlug[module.slug] || []),
    module.slug.replace(/-/g, "_")
  ];
  const allowedActions = new Set(["access", "view", "read", "reports", "create", "edit", "approve", "export", "configure", "execute", "manage_users", "manage_roles"]);
  return keys.some((key) => {
    const actions = legacy[key];
    return actions && Object.entries(actions).some(([action, allowed]) => allowed === true && allowedActions.has(action));
  });
}

function normalizeModuleKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/^\/dashboard\//, "").replace(/^dashboard\//, "");
}

function statusKeys(status: CompanyModuleStatus) {
  return [
    status.module_code,
    status.module_name,
    status.route,
    String(status.route || "").split("/").filter(Boolean).pop()
  ].map(normalizeModuleKey).filter(Boolean);
}

function statusMatchesModule(status: CompanyModuleStatus, module: ApexModule) {
  const keys = new Set(statusKeys(status));
  return moduleKeys(module).map(normalizeModuleKey).some((key) => keys.has(key));
}

function applyRolePermissions(modules: ApexModule[], state: ModuleAccessState): ModuleAccessState {
  if (state.isPlatformAdmin) return state;
  const legacy = getStoredLegacyPermissions();
  if (legacy) {
    return {
      ...state,
      bySlug: Object.fromEntries(modules.map((module) => [
        module.slug,
        state.bySlug[module.slug] === true && hasLegacyModuleAccess(module, legacy)
      ]))
    };
  }
  const permissions = getStoredRolePermissions();
  if (!permissions) return state;
  return {
    ...state,
    bySlug: Object.fromEntries(modules.map((module) => [
      module.slug,
      state.bySlug[module.slug] === true && hasRoleModuleAccess(module, permissions)
    ]))
  };
}

function stateFromActiveModuleList(modules: ApexModule[], activeModules: string[] = []): ModuleAccessState {
  const activeSet = new Set(activeModules.map((item) => String(item).toLowerCase()));
  const orderByKey = new Map(activeModules.map((item, index) => [String(item).toLowerCase(), index]));
  return applyRolePermissions(modules, {
    loading: false,
    isPlatformAdmin: false,
    bySlug: Object.fromEntries(modules.map((module) => [
      module.slug,
      moduleKeys(module).some((key) => activeSet.has(String(key).toLowerCase()))
    ])),
    orderBySlug: Object.fromEntries(modules.map((module, index) => {
      const order = moduleKeys(module)
        .map((key) => orderByKey.get(String(key).toLowerCase()))
        .find((value) => value !== undefined);
      return [module.slug, order ?? activeModules.length + index];
    }))
  });
}

function stateFromCachedTenantModules(modules: ApexModule[]) {
  if (typeof window === "undefined") return null;
  const cached = localStorage.getItem("tenant_active_modules");
  if (!cached) return null;
  try {
    const activeModules = JSON.parse(cached);
    return Array.isArray(activeModules) ? stateFromActiveModuleList(modules, activeModules) : null;
  } catch {
    localStorage.removeItem("tenant_active_modules");
    return null;
  }
}

function isLocalPlatformAdmin(user?: { role_metadata?: Record<string, unknown>; role?: string }) {
  const role = String(user?.role || "").trim().toLowerCase();
  const roleType = String(user?.role_metadata?.role_type || "").trim().toLowerCase();
  return role === "apex_admin" || role === "superadmin" || roleType === "superadmin";
}

async function refreshRoleContextFromApi() {
  const token = getToken();
  if (!token || !HAS_CONFIGURED_API_URL) return null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ROLE_CONTEXT_TIMEOUT_MS);
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal
  }).finally(() => window.clearTimeout(timeout));
  if (!response.ok) return null;
  const data = await response.json() as {
    tenant?: { active_modules?: string[] };
    user?: { role_permissions?: StoredRolePermission[]; role_metadata?: Record<string, unknown>; role?: string };
  };
  if (Array.isArray(data.tenant?.active_modules)) localStorage.setItem("tenant_active_modules", JSON.stringify(data.tenant.active_modules));
  if (Array.isArray(data.user?.role_permissions)) localStorage.setItem("role_permissions", JSON.stringify(data.user.role_permissions));
  else localStorage.removeItem("role_permissions");
  if (data.user?.role_metadata) localStorage.setItem("role_metadata", JSON.stringify(data.user.role_metadata));
  else localStorage.removeItem("role_metadata");
  if (data.user?.role) localStorage.setItem("role_name", data.user.role);
  localStorage.setItem(ROLE_CONTEXT_FETCHED_AT_KEY, String(Date.now()));
  return data;
}

async function loadLocalModuleAccess(modules: ApexModule[]): Promise<ModuleAccessState> {
  const token = getToken();
  if (token && HAS_CONFIGURED_API_URL) {
    try {
      const data = await refreshRoleContextFromApi();
      if (data) {
        const activeModules = Array.isArray(data.tenant?.active_modules) ? data.tenant.active_modules : [];
        const state = stateFromActiveModuleList(modules, activeModules);
        return { ...state, isPlatformAdmin: isLocalPlatformAdmin(data.user) };
      }
    } catch {
      // If the API is temporarily unavailable, keep the last known tenant menu.
    }
  }

  const cached = localStorage.getItem("tenant_active_modules");
  if (cached) {
    try {
      const activeModules = JSON.parse(cached);
      if (Array.isArray(activeModules)) return stateFromActiveModuleList(modules, activeModules);
    } catch {
      localStorage.removeItem("tenant_active_modules");
    }
  }
  if (!token) return { loading: false, isPlatformAdmin: false, bySlug: {} };
  if (!HAS_CONFIGURED_API_URL) return stateFromActiveModuleList(modules, []);
  throw new Error("No fue posible consultar modulos del tenant.");
}

export async function loadModuleAccess(modules: ApexModule[]): Promise<ModuleAccessState> {
  if (!isSupabaseSession()) return loadLocalModuleAccess(modules);

  const cached = sessionStorage.getItem(MODULE_ACCESS_CACHE_KEY);
  const sessionToken = localStorage.getItem("token") || "";
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { at: number; token?: string; state: ModuleAccessState };
      if (parsed.token === sessionToken && Date.now() - parsed.at < MODULE_ACCESS_CACHE_MS) return applyRolePermissions(modules, parsed.state);
    } catch {
      sessionStorage.removeItem(MODULE_ACCESS_CACHE_KEY);
    }
  }

  if (!moduleAccessInFlight || moduleAccessInFlight.token !== sessionToken) {
    const promise = (async () => {
      const roleContextPromise = refreshRoleContextFromApi().catch(() => null);
      const userId = currentSupabaseUserId();
      const [platformAdmins, companies] = await Promise.all([
        listActivePlatformAdmins(1, userId).catch(() => []),
        listUserCompanies(5).catch(() => []) as Promise<UserCompany[]>
      ]);
      if (platformAdmins.length > 0) {
        const state = {
          loading: false,
          isPlatformAdmin: true,
          bySlug: Object.fromEntries(modules.map((module) => [module.slug, PLATFORM_ADMIN_MODULE_SLUGS.has(module.slug)])),
          orderBySlug: Object.fromEntries(modules.map((module, index) => [module.slug, PLATFORM_ADMIN_MODULE_SLUGS.has(module.slug) ? index : modules.length + index]))
        };
        sessionStorage.setItem(MODULE_ACCESS_CACHE_KEY, JSON.stringify({ at: Date.now(), token: sessionToken, state }));
        return state;
      }

      const preferredCompanyId = typeof window !== "undefined" ? localStorage.getItem("apexos_company_id") || "" : "";
      const selectedCompany = companies.find((company) => company.company_id === preferredCompanyId)
        || companies.find((company) => ["owner", "admin", "superadmin"].includes(String(company.role || "").toLowerCase()))
        || companies[0];
      await roleContextPromise;
      const companyId = selectedCompany?.company_id;
      if (!companyId) return stateFromCachedTenantModules(modules) || { loading: false, isPlatformAdmin: false, bySlug: {} };
      if (typeof window !== "undefined") {
        localStorage.setItem("apexos_company_id", companyId);
        if (selectedCompany?.company_name) localStorage.setItem("apexos_company_name", selectedCompany.company_name);
        if (selectedCompany?.role) localStorage.setItem("apexos_company_role", selectedCompany.role);
        if (selectedCompany?.role && !localStorage.getItem("role_name")) localStorage.setItem("role_name", selectedCompany.role);
      }
      await refreshSupabaseEmployeeRoleContext(companyId);

      const statuses = await listCompanyModuleStatus(companyId, 100).catch(() => []) as CompanyModuleStatus[];
      if (!statuses.length) return stateFromCachedTenantModules(modules) || { loading: false, isPlatformAdmin: false, bySlug: {} };
      const state = {
        loading: false,
        isPlatformAdmin: false,
        bySlug: Object.fromEntries(modules.map((module) => {
          const status = statuses.find((item) => statusMatchesModule(item, module));
          return [module.slug, status?.enabled === true];
        })),
        orderBySlug: Object.fromEntries(modules.map((module, index) => {
          const status = statuses.find((item) => statusMatchesModule(item, module));
          return [module.slug, status?.sort_order ?? index];
        }))
      };
      sessionStorage.setItem(MODULE_ACCESS_CACHE_KEY, JSON.stringify({ at: Date.now(), token: sessionToken, state }));
      return state;
    })();
    moduleAccessInFlight = { token: sessionToken, promise };
  }

  try {
    return applyRolePermissions(modules, await moduleAccessInFlight.promise);
  } finally {
    if (moduleAccessInFlight?.token === sessionToken) moduleAccessInFlight = null;
  }
}
