import { ApexModule } from "./modules";
import { CompanyModuleStatus, listCompanyModuleStatus, listPlatformCompanies, listUserCompanies } from "./supabaseQa";

export type ModuleAccessState = {
  loading: boolean;
  isPlatformAdmin: boolean;
  bySlug: Record<string, boolean>;
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

export async function loadModuleAccess(modules: ApexModule[]): Promise<ModuleAccessState> {
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

  return {
    loading: false,
    isPlatformAdmin: false,
    bySlug: Object.fromEntries(modules.map((module) => [module.slug, enabledByCode.get(getModuleCode(module)) === true]))
  };
}
