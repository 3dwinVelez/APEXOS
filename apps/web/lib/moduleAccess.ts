import { ApexModule } from "./modules";
import { CompanyModuleStatus, listCompanyModuleStatus, listPlatformCompanies, listUserCompanies } from "./supabaseQa";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";

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

const moduleCodeBySlug: Record<string, string> = {
  activos: "activos",
  administracion: "administracion_apex",
  "apex-ai": "apex_ai",
  calidad: "calidad",
  cartera: "cartera",
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
  ventas: "ventas"
};

export function getModuleCode(module: ApexModule) {
  return moduleCodeBySlug[module.slug] || module.slug.replace(/-/g, "_");
}

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

export function isSupabaseSession() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("auth_provider") === "supabase") return true;
  const token = getToken();
  if (!token?.includes(".")) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.iss || "").includes("supabase") || String(payload.ref || "") === "jbirkghkekuifgfsgquq";
  } catch {
    return false;
  }
}

function moduleKeys(module: ApexModule) {
  return [module.id, module.slug, getModuleCode(module)];
}

function stateFromActiveModuleList(modules: ApexModule[], activeModules: string[] = []): ModuleAccessState {
  const activeSet = new Set(activeModules.map((item) => String(item).toLowerCase()));
  const orderByKey = new Map(activeModules.map((item, index) => [String(item).toLowerCase(), index]));
  return {
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
  };
}

async function loadLocalModuleAccess(modules: ApexModule[]): Promise<ModuleAccessState> {
  const token = getToken();
  if (token) {
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json() as { tenant?: { active_modules?: string[] } };
        const activeModules = Array.isArray(data.tenant?.active_modules) ? data.tenant.active_modules : [];
        localStorage.setItem("tenant_active_modules", JSON.stringify(activeModules));
        return stateFromActiveModuleList(modules, activeModules);
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
  throw new Error("No fue posible consultar modulos del tenant.");
}

export async function loadModuleAccess(modules: ApexModule[]): Promise<ModuleAccessState> {
  if (!isSupabaseSession()) return loadLocalModuleAccess(modules);

  const platformCompanies = await listPlatformCompanies(1).catch(() => []);
  if (platformCompanies.length > 0) {
    return {
      loading: false,
      isPlatformAdmin: true,
      bySlug: Object.fromEntries(modules.map((module) => [module.slug, true]))
    };
  }

  const companies = await listUserCompanies(5).catch(() => []) as UserCompany[];
  const companyId = companies[0]?.company_id;
  if (!companyId) {
    return { loading: false, isPlatformAdmin: false, bySlug: {} };
  }

  const statuses = await listCompanyModuleStatus(companyId, 100).catch(() => []) as CompanyModuleStatus[];
  const enabledByCode = new Map(statuses.map((item) => [item.module_code, item.enabled]));
  const orderByCode = new Map(statuses.map((item, index) => [item.module_code, item.sort_order ?? index]));

  return {
    loading: false,
    isPlatformAdmin: false,
    bySlug: Object.fromEntries(modules.map((module) => [module.slug, enabledByCode.get(getModuleCode(module)) === true])),
    orderBySlug: Object.fromEntries(modules.map((module, index) => [module.slug, orderByCode.get(getModuleCode(module)) ?? index]))
  };
}
