import { getSupabaseAccessToken, supabaseFetch } from "./supabaseClient";

export type SupabaseModule = {
  id: string;
  code: string;
  name: string;
  route: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
};

export type SupabasePlan = {
  id: string;
  code: string;
  name: string;
  price: number;
  billing_period: string;
  is_active: boolean;
};

export type CompanyModuleStatus = {
  company_id: string;
  company_name: string;
  module_code: string;
  module_name: string;
  route: string | null;
  icon: string | null;
  sort_order: number;
  enabled: boolean;
  access_status: "enabled" | "blocked";
  source: string;
};

export type PlatformCompany = {
  company_id: string;
  company_name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  company_type: string | null;
  parent_company_id: string | null;
  parent_company_name: string | null;
  business_line: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  status: string;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  enabled_modules: number;
  blocked_modules: number;
};

export type PlatformAdmin = {
  user_id: string;
  status: string;
};

export type CreatePlatformCompanyInput = {
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  company_type?: string | null;
  parent_company_id?: string | null;
  business_line?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  status?: string;
  plan_id?: string | null;
  admin_full_name: string;
  admin_email: string;
  admin_password: string;
};

export type PlatformCompanyModuleAccess = {
  company_module_id: string | null;
  company_id: string;
  company_name: string;
  module_id: string;
  module_code: string;
  module_name: string;
  description: string | null;
  route: string | null;
  icon: string | null;
  sort_order: number;
  enabled: boolean;
  source: string;
  plan_code: string | null;
  plan_name: string | null;
};

export type PlatformCompanySessionUser = {
  employee_id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: string;
  position: string;
  department: string;
  status: string;
  user_type: string;
  auth_status: "linked" | "without_auth";
  connected: boolean;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  last_seen_minutes: number | null;
};

export type PlatformCompanySessions = {
  company_id: string;
  generated_at: string;
  window_minutes: number;
  totals: {
    users: number;
    connected: number;
    active: number;
    without_auth: number;
  };
  users: PlatformCompanySessionUser[];
};

export function listSupabaseModules(limit = 50) {
  return supabaseFetch<SupabaseModule[]>(`/rest/v1/modules?select=*&order=sort_order.asc&limit=${limit}`);
}

export function listSupabasePlans(limit = 20) {
  return supabaseFetch<SupabasePlan[]>(`/rest/v1/plans?select=*&order=created_at.asc&limit=${limit}`);
}

export function listCompanyModuleStatus(companyId: string, limit = 50) {
  return supabaseFetch<CompanyModuleStatus[]>(`/rest/v1/v_company_module_status?company_id=eq.${companyId}&select=*&order=sort_order.asc&limit=${limit}`);
}

export function listUserCompanies(limit = 20) {
  return supabaseFetch(`/rest/v1/v_user_companies?select=*&limit=${limit}`);
}

export function listPlatformCompanies(limit = 100) {
  return supabaseFetch<PlatformCompany[]>(`/rest/v1/v_platform_companies?select=*&order=company_name.asc&limit=${limit}`);
}

export function listActivePlatformAdmins(limit = 1, userId = "") {
  const userFilter = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : "";
  return supabaseFetch<PlatformAdmin[]>(`/rest/v1/platform_admins?select=user_id,status&status=eq.active${userFilter}&limit=${limit}`);
}

export function listPlatformCompanyModuleAccess(companyId: string, limit = 100) {
  return supabaseFetch<PlatformCompanyModuleAccess[]>(`/rest/v1/v_platform_company_module_access?company_id=eq.${companyId}&select=*&order=sort_order.asc&limit=${limit}`);
}

export function listPlatformCompanySessions(companyId: string, minutes = 30) {
  const token = getSupabaseAccessToken();
  if (!token) throw new Error("Sesion requerida para consultar usuarios conectados.");

  return fetch(`/api/platform/company-sessions?company_id=${encodeURIComponent(companyId)}&minutes=${minutes}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(body.message || "No fue posible consultar usuarios conectados.");
    }
    return response.json() as Promise<PlatformCompanySessions>;
  });
}

export function createPlatformCompany(input: { name: string; legal_name?: string | null; tax_id?: string | null; email?: string | null; phone?: string | null; company_type?: string | null; parent_company_id?: string | null; business_line?: string | null; country?: string | null; city?: string | null; address?: string | null; status?: string; plan_id?: string | null }) {
  void input;
  throw new Error("Flujo deprecated: crea empresas desde Administracion APEX usando createPlatformCompanyWithAdmin.");
}

export function updatePlatformCompany(companyId: string, input: Partial<Omit<CreatePlatformCompanyInput, "admin_full_name" | "admin_email" | "admin_password">>) {
  const token = getSupabaseAccessToken();
  if (!token) throw new Error("Sesion requerida para editar empresas.");

  return fetch("/api/platform/companies", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      company_id: companyId,
      name: input.name,
      legal_name: input.legal_name || null,
      tax_id: input.tax_id || null,
      email: input.email || null,
      phone: input.phone || null,
      company_type: input.company_type || "company",
      parent_company_id: input.parent_company_id || null,
      business_line: input.business_line || null,
      country: input.country || null,
      city: input.city || null,
      address: input.address || null,
      status: input.status || "active",
      plan_id: input.plan_id || null
    })
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(body.message || "No fue posible editar la empresa.");
    }
    return response.json() as Promise<{ company: PlatformCompany }>;
  });
}

export function deletePlatformCompany(companyId: string) {
  const token = getSupabaseAccessToken();
  if (!token) throw new Error("Sesion requerida para eliminar empresas.");

  return fetch(`/api/platform/companies?company_id=${encodeURIComponent(companyId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(body.message || "No fue posible eliminar la empresa.");
    }
  });
}

export async function createPlatformCompanyWithAdmin(input: CreatePlatformCompanyInput) {
  const token = getSupabaseAccessToken();
  if (!token) throw new Error("Sesion requerida para crear empresas.");

  const response = await fetch("/api/platform/companies", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || body.error || "No fue posible crear la empresa.");
  }

  return response.json() as Promise<{ company: PlatformCompany; admin_user_id: string }>;
}

export function setPlatformCompanyModuleAccess(input: { company_id: string; module_id: string; enabled: boolean }) {
  const token = getSupabaseAccessToken();
  if (!token) throw new Error("Sesion requerida para administrar modulos.");

  return fetch("/api/platform/company-modules", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(body.message || body.error || "No fue posible cambiar el modulo.");
    }
    return response.json();
  });
}
