const bcrypt = require("bcrypt");
const prisma = require("../core/prisma");

function normalizeDomain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "supabase";
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

async function getSupabaseMembershipContext(token, supabaseUser) {
  const memberships = await supabaseRest(`/rest/v1/company_users?select=company_id,role,status&user_id=eq.${encodeURIComponent(String(supabaseUser.id || ""))}&status=eq.active&limit=20`, {
    token,
    service: true
  }) || [];
  const membership = memberships.find((item) => ["owner", "admin", "superadmin"].includes(String(item.role || "").toLowerCase())) || memberships[0] || null;
  if (!membership?.company_id) return null;
  const companies = await supabaseRest(`/rest/v1/companies?select=id,name&id=eq.${encodeURIComponent(String(membership.company_id))}&limit=1`, {
    token,
    service: true
  }) || [];
  const modules = await supabaseRest(`/rest/v1/v_company_module_status?select=module_code,enabled&company_id=eq.${encodeURIComponent(String(membership.company_id))}&enabled=eq.true`, {
    token,
    service: true
  }) || [];
  return {
    membership,
    company: companies[0] || null,
    activeModules: modules.filter((item) => item.enabled !== false).map((item) => String(item.module_code || "")).filter(Boolean)
  };
}

async function ensureRoleWithPermissions(tenantId, companyRole) {
  const blueprint = roleBlueprint(companyRole);
  const role = await prisma.role.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name: blueprint.name } },
    update: { description: blueprint.description, is_system: blueprint.name === "APEX_ADMIN" },
    create: { tenant_id: tenantId, name: blueprint.name, description: blueprint.description, is_system: blueprint.name === "APEX_ADMIN" }
  });
  await prisma.permission.createMany({
    data: blueprint.permissions.map((permission) => ({ role_id: role.id, module: permission.module, action: permission.action })),
    skipDuplicates: true
  });
  return prisma.role.findUnique({ where: { id: role.id }, include: { permissions: true } });
}

async function ensureTenantMirror(context) {
  const companyName = String(context?.company?.name || "Empresa Supabase").trim() || "Empresa Supabase";
  const domain = `${normalizeDomain(companyName)}.qa`;
  const activeModules = Array.from(new Set((context?.activeModules || []).map((item) => String(item).trim()).filter(Boolean)));
  const current = await prisma.tenant.findFirst({ where: { OR: [{ domain }, { name: companyName }] } });
  if (current) {
    const mergedModules = Array.from(new Set([...(Array.isArray(current.active_modules) ? current.active_modules : []), ...activeModules]));
    if (mergedModules.length !== (Array.isArray(current.active_modules) ? current.active_modules.length : 0) || current.name !== companyName || current.domain !== domain) {
      return prisma.tenant.update({ where: { id: current.id }, data: { name: companyName, domain, active: true, active_modules: mergedModules } });
    }
    return current;
  }
  return prisma.tenant.create({
    data: {
      name: companyName,
      domain,
      industry: "supabase_sync",
      plan: "qa_sync",
      active: true,
      active_modules: activeModules,
      config: { source: "supabase_auth_sync", company_id: context?.membership?.company_id || null }
    }
  });
}

async function ensureUserMirror(supabaseUser, token) {
  const context = await getSupabaseMembershipContext(token, supabaseUser);
  if (!context?.membership?.company_id) return null;
  const tenant = await ensureTenantMirror(context);
  const role = await ensureRoleWithPermissions(tenant.id, context.membership.role);
  const email = String(supabaseUser.email || "").trim().toLowerCase();
  const fullName = String(supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || email.split("@")[0] || "Usuario Supabase").trim();
  const user = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenant.id, email } },
    update: { name: fullName, active: true, role_id: role.id, last_login: new Date() },
    create: {
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

async function authenticateSupabaseToken(token) {
  const supabaseUser = await getSupabaseUser(token);
  const email = String(supabaseUser?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Supabase token sin email");

  const users = await prisma.user.findMany({
    where: { email, active: true },
    include: { role: { include: { permissions: true } } },
    take: 2
  });
  if (users.length !== 1) {
    const mirrored = await ensureUserMirror(supabaseUser, token);
    if (!mirrored?.user) {
      throw new Error(users.length ? "Email Supabase ambiguo en usuarios Prisma" : "Usuario Supabase sin espejo Prisma");
    }
    return {
      id: mirrored.user.id,
      tenant_id: mirrored.user.tenant_id,
      role: mirrored.user.role,
      auth_provider: "supabase",
      supabase_user_id: supabaseUser.id,
      email: mirrored.user.email,
      name: mirrored.user.name
    };
  }

  const user = users[0];
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    auth_provider: "supabase",
    supabase_user_id: supabaseUser.id,
    email: user.email,
    name: user.name
  };
}

module.exports = { authenticateSupabaseToken };
