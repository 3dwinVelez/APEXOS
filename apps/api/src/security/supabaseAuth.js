const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const prisma = require("../core/prisma");
const { invalidateTenantCache } = require("../core/tenantCache");

const AUTH_CACHE_TTL_MS = Math.max(Number(process.env.SUPABASE_AUTH_CACHE_TTL_MS || 30000), 1000);
const AUTH_CACHE_MAX_ENTRIES = Math.max(Number(process.env.SUPABASE_AUTH_CACHE_MAX_ENTRIES || 500), 10);
const authCache = new Map();
const authInFlight = new Map();

function authCacheKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function pruneAuthCache() {
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (entry.expiresAt <= now) authCache.delete(key);
  }
  while (authCache.size > AUTH_CACHE_MAX_ENTRIES) authCache.delete(authCache.keys().next().value);
}

function normalizeDomain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "supabase";
}

function isProductionEnv() {
  return [process.env.APP_ENV, process.env.TARGET_ENV, process.env.NODE_ENV]
    .some((value) => String(value || "").toLowerCase() === "production");
}

function tenantDomainSuffix() {
  const configured = String(process.env.TENANT_DOMAIN_SUFFIX || "").trim().replace(/^\.+|\.+$/g, "");
  if (configured) return configured;
  return isProductionEnv() ? "prod" : "qa";
}

function tenantSyncPlan() {
  return isProductionEnv() ? "production_sync" : "qa_sync";
}

function roleBlueprint(companyRole) {
  const normalized = String(companyRole || "member").toLowerCase();
  if (["owner", "admin", "superadmin"].includes(normalized)) {
    return {
      name: "APEX_ADMIN",
      description: "Administrador sincronizado desde Supabase.",
      permissions: [{ module: "*", action: "*" }]
    };
  }
  if (["viewer", "consulta", "read_only"].includes(normalized)) {
    return {
      name: "Supabase Viewer",
      description: "Consulta sincronizada desde Supabase.",
      permissions: [{ module: "*", action: "read" }]
    };
  }
  return {
    name: "Supabase Member",
    description: "Usuario operativo sincronizado desde Supabase.",
    permissions: [
      { module: "*", action: "read" },
      { module: "hr", action: "write" },
      { module: "services", action: "write" },
      { module: "transport", action: "write" },
      { module: "projects", action: "write" },
      { module: "inventory", action: "write" },
      { module: "purchases", action: "write" }
    ]
  };
}

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  return { url, anonKey, serviceKey };
}

async function getSupabaseUser(token) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function supabaseRest(path, { token, service = false } = {}) {
  const { url, anonKey, serviceKey } = supabaseConfig();
  const key = service && serviceKey ? serviceKey : anonKey;
  const bearer = service && serviceKey ? serviceKey : token;
  if (!url || !key || !bearer) return null;
  const response = await fetch(`${url}${path}`, {
    method: "GET",
    headers: {
      apikey: key,
      authorization: `Bearer ${bearer}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

function selectMembership(memberships, requestedCompanyId = "") {
  const requested = String(requestedCompanyId || "").trim();
  if (requested) {
    const selected = memberships.find((item) => String(item.company_id || "") === requested);
    if (!selected) throw new Error("La empresa solicitada no pertenece al usuario");
    return selected;
  }
  return memberships.find((item) => ["owner", "admin", "superadmin"].includes(String(item.role || "").toLowerCase()))
    || memberships[0]
    || null;
}

async function getSupabaseMembershipContext(token, supabaseUser, requestedCompanyId = "") {
  const memberships = await supabaseRest(`/rest/v1/company_users?select=company_id,role,status&user_id=eq.${encodeURIComponent(String(supabaseUser.id || ""))}&status=eq.active&limit=20`, {
    token,
    service: true
  }) || [];
  const membership = selectMembership(memberships, requestedCompanyId);
  if (!membership?.company_id) return null;
  const companyId = encodeURIComponent(String(membership.company_id));
  const [companies, modules] = await Promise.all([
    supabaseRest(`/rest/v1/companies?select=id,name&id=eq.${companyId}&limit=1`, {
      token,
      service: true
    }).then((rows) => rows || []),
    supabaseRest(`/rest/v1/v_company_module_status?select=module_code,enabled&company_id=eq.${companyId}&enabled=eq.true`, {
      token,
      service: true
    })
  ]);
  return {
    membership,
    company: companies[0] || null,
    activeModules: Array.isArray(modules)
      ? modules.filter((item) => item.enabled !== false).map((item) => String(item.module_code || "")).filter(Boolean)
      : null
  };
}

async function ensureRoleWithPermissions(tenantId, companyRole) {
  const blueprint = roleBlueprint(companyRole);
  let role = await prisma.role.findUnique({
    where: { tenant_id_name: { tenant_id: tenantId, name: blueprint.name } },
    include: { permissions: true }
  });
  if (!role) {
    role = await prisma.role.create({
      data: { tenant_id: tenantId, name: blueprint.name, description: blueprint.description, is_system: blueprint.name === "APEX_ADMIN" },
      include: { permissions: true }
    });
  }
  const granted = new Set(role.permissions.map((permission) => `${permission.module}:${permission.action}`));
  const missing = blueprint.permissions.filter((permission) => !granted.has(`${permission.module}:${permission.action}`));
  if (!missing.length) return role;
  await prisma.permission.createMany({
    data: missing.map((permission) => ({ role_id: role.id, module: permission.module, action: permission.action })),
    skipDuplicates: true
  });
  return prisma.role.findUnique({ where: { id: role.id }, include: { permissions: true } });
}

async function ensureTenantMirror(context) {
  const companyName = String(context?.company?.name || "Empresa Supabase").trim() || "Empresa Supabase";
  const domain = `${normalizeDomain(companyName)}.${tenantDomainSuffix()}`;
  const activeModules = Array.isArray(context?.activeModules)
    ? Array.from(new Set(context.activeModules.map((item) => String(item).trim()).filter(Boolean)))
    : null;
  const current = await prisma.tenant.findFirst({ where: { OR: [{ domain }, { name: companyName }] } });
  if (current) {
    const data = { name: companyName, domain, active: true };
    if (Array.isArray(activeModules) && !sameStringSet(current.active_modules, activeModules)) data.active_modules = activeModules;
    if (Object.keys(data).some((key) => key !== "active" && current[key] !== data[key]) || data.active_modules) {
      const updated = await prisma.tenant.update({ where: { id: current.id }, data });
      await invalidateTenantCache(current.id);
      return updated;
    }
    return current;
  }
  return prisma.tenant.create({
    data: {
      name: companyName,
      domain,
      industry: "supabase_sync",
      plan: tenantSyncPlan(),
      active: true,
      active_modules: activeModules || [],
      config: { source: "supabase_auth_sync", company_id: context?.membership?.company_id || null }
    }
  });
}

function sameStringSet(left, right) {
  const normalize = (value) => Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean))).sort();
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function tenantWithAuthorizationContext(tenant, user) {
  if (!tenant || !Array.isArray(user?.active_modules)) return tenant;
  return { ...tenant, active_modules: user.active_modules };
}

async function ensureUserMirror(supabaseUser, token, requestedCompanyId = "", providedContext = null) {
  const context = providedContext || await getSupabaseMembershipContext(token, supabaseUser, requestedCompanyId);
  if (!context?.membership?.company_id) return null;
  const tenant = await ensureTenantMirror(context);
  const role = await ensureRoleWithPermissions(tenant.id, context.membership.role);
  const email = String(supabaseUser.email || "").trim().toLowerCase();
  const fullName = String(supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || email.split("@")[0] || "Usuario Supabase").trim();
  const existing = await prisma.user.findUnique({
    where: { tenant_id_email: { tenant_id: tenant.id, email } },
    include: { role: { include: { permissions: true } } }
  });
  if (existing) {
    const patch = {};
    if (existing.name !== fullName) patch.name = fullName;
    if (!existing.active) patch.active = true;
    if (existing.role_id !== role.id) patch.role_id = role.id;
    const user = Object.keys(patch).length
      ? await prisma.user.update({ where: { id: existing.id }, data: patch, include: { role: { include: { permissions: true } } } })
      : existing;
    return { user, tenant };
  }
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: fullName,
      email,
      password: await bcrypt.hash(`supabase-managed-${supabaseUser.id}`, 12),
      role_id: role.id,
      active: true,
      preferences: { auth_provider: "supabase", supabase_user_id: supabaseUser.id, company_id: context.membership.company_id }
    },
    include: { role: { include: { permissions: true } } }
  });
  return { user, tenant };
}

async function authenticateSupabaseToken(token, requestedCompanyId = "") {
  if (!token) throw new Error("Token Supabase requerido");
  pruneAuthCache();
  const normalizedCompanyId = String(requestedCompanyId || "").trim();
  const cacheKey = authCacheKey(`${token}:${normalizedCompanyId}`);
  const cached = authCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (authInFlight.has(cacheKey)) return authInFlight.get(cacheKey);
  const request = authenticateSupabaseTokenUncached(token, normalizedCompanyId);
  authInFlight.set(cacheKey, request);
  try {
    const value = await request;
    authCache.set(cacheKey, { expiresAt: Date.now() + AUTH_CACHE_TTL_MS, value });
    return value;
  } finally {
    authInFlight.delete(cacheKey);
  }
}

async function authenticateSupabaseTokenUncached(token, requestedCompanyId = "") {
  const supabaseUser = await getSupabaseUser(token);
  const email = String(supabaseUser?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Supabase token sin email");
  const context = await getSupabaseMembershipContext(token, supabaseUser, requestedCompanyId);
  const mirrored = await ensureUserMirror(supabaseUser, token, requestedCompanyId, context);
  if (!mirrored?.user) throw new Error("Usuario Supabase sin espejo Prisma para la empresa seleccionada");
  const user = mirrored.user;
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    auth_provider: "supabase",
    supabase_user_id: supabaseUser.id,
    email: user.email,
    name: user.name,
    active_modules: Array.isArray(context?.activeModules) ? context.activeModules : undefined
  };
}

module.exports = { authenticateSupabaseToken, selectMembership, tenantWithAuthorizationContext };
