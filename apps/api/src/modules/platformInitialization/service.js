const bcrypt = require("bcrypt");
const prisma = require("../../core/prisma");
const { assertPasswordPolicy, redactSensitive } = require("../../security/policy");

const PLATFORM_TENANT_DOMAIN = "platform.apexos.prod";
const PLATFORM_ROLE_NAME = "APEX_PLATFORM_SUPERADMIN";
const PLATFORM_MODULES = [
  "inicio",
  "administracion_apex",
  "platform_admin",
  "auditoria",
  "configuracion",
  "logs",
  "soporte",
  "infraestructura"
];

function clean(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "";
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function requireConfig() {
  const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
  const anonKey = clean(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl) throw new Error("SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL es obligatorio.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY es obligatorio.");
  return { supabaseUrl, serviceRoleKey, anonKey };
}

function validateInput(input = {}) {
  const firstName = clean(input.first_name || input.firstName || input.name);
  const lastName = clean(input.last_name || input.lastName || input.apellidos);
  const document = clean(input.document || input.documento);
  const email = normalizeEmail(input.email || input.correo);
  const username = clean(input.username || input.usuario || email);
  const password = String(input.password || input.temporary_password || input.contrasena || "");

  if (!firstName) throw new Error("Nombre requerido.");
  if (!lastName) throw new Error("Apellidos requeridos.");
  if (!document) throw new Error("Documento requerido.");
  if (!email || !email.includes("@")) throw new Error("Correo valido requerido.");
  if (!username) throw new Error("Usuario requerido.");
  assertPasswordPolicy(password);

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    document,
    email,
    username,
    password
  };
}

async function supabaseRequest(pathname, options = {}) {
  const { supabaseUrl, serviceRoleKey } = requireConfig();
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail = body?.message || body?.error_description || body?.error || text || response.statusText;
    throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${detail}`);
  }
  return body;
}

async function getInitializationState() {
  const [platformAdmins, companies, authUsers, tenants, users] = await Promise.all([
    prisma.$queryRaw`select count(*)::int as count from public.platform_admins`,
    prisma.$queryRaw`select count(*)::int as count from public.companies`,
    prisma.$queryRaw`select count(*)::int as count from auth.users where email is not null`,
    prisma.tenant.count(),
    prisma.user.count()
  ]);
  return {
    platform_admins: platformAdmins[0]?.count || 0,
    companies: companies[0]?.count || 0,
    auth_users: authUsers[0]?.count || 0,
    tenants,
    users
  };
}

function assertCanInitialize(state) {
  const blockers = [];
  if (state.platform_admins !== 0) blockers.push(`platform_admins=${state.platform_admins}`);
  if (state.companies !== 0) blockers.push(`companies=${state.companies}`);
  if (state.auth_users !== 0) blockers.push(`auth.users=${state.auth_users}`);
  if (state.tenants !== 0) blockers.push(`Tenant=${state.tenants}`);
  if (state.users !== 0) blockers.push(`User=${state.users}`);
  if (blockers.length) {
    const error = new Error(`La plataforma ya fue inicializada o no esta vacia: ${blockers.join(", ")}.`);
    error.code = "PLATFORM_ALREADY_INITIALIZED";
    throw error;
  }
}

async function createAuthUser(input) {
  return supabaseRequest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        first_name: input.firstName,
        last_name: input.lastName,
        document: input.document,
        username: input.username,
        role: PLATFORM_ROLE_NAME
      },
      app_metadata: {
        role: PLATFORM_ROLE_NAME,
        platform_admin: true,
        initialized_by: "platform-initialization"
      }
    })
  });
}

async function deleteAuthUser(userId) {
  if (!userId) return;
  await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE"
  }).catch(() => null);
}

async function createSupabaseMirror(authUserId, input) {
  await supabaseRequest("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: authUserId,
      full_name: input.fullName,
      email: input.email,
      status: "active"
    })
  });

  await supabaseRequest("/rest/v1/platform_admins?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: authUserId,
      status: "active"
    })
  });
}

async function createPrismaMirror(authUserId, input) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: "APEXOS Platform",
        domain: PLATFORM_TENANT_DOMAIN,
        industry: "platform",
        plan: "platform",
        active_modules: PLATFORM_MODULES,
        config: {
          source: "platform_initialization",
          supabase_user_id: authUserId,
          username: input.username,
          document: input.document
        },
        active: true
      }
    });

    const role = await tx.role.create({
      data: {
        tenant_id: tenant.id,
        name: PLATFORM_ROLE_NAME,
        description: "Superadministrador global inicial de plataforma.",
        is_system: true,
        metadata: {
          scope: "platform",
          platform_admin: true,
          global_access: true,
          initialized_by: "platform-initialization"
        },
        permissions: {
          create: [
            { module: "*", action: "*" },
            { module: "platform", action: "administer" },
            { module: "companies", action: "administer" },
            { module: "users", action: "administer" },
            { module: "roles", action: "administer" },
            { module: "audit", action: "read" },
            { module: "logs", action: "read" },
            { module: "support", action: "administer" },
            { module: "infrastructure", action: "administer" }
          ]
        }
      },
      include: { permissions: true }
    });

    const user = await tx.user.create({
      data: {
        tenant_id: tenant.id,
        name: input.fullName,
        email: input.email,
        password: passwordHash,
        role_id: role.id,
        preferences: {
          username: input.username,
          document: input.document,
          supabase_user_id: authUserId,
          platform_admin: true,
          require_password_change: true
        },
        active: true
      }
    });

    await tx.auditLog.create({
      data: {
        tenant_id: tenant.id,
        user_id: user.id,
        action: "platform.initialized",
        module: "platform_initialization",
        entity: "platform_admin",
        entity_id: authUserId,
        new_value: redactSensitive({
          email: input.email,
          username: input.username,
          document: input.document,
          role: PLATFORM_ROLE_NAME
        })
      }
    });

    return { tenant, role, user };
  });
}

async function validateSupabaseLogin(input) {
  const { supabaseUrl, anonKey } = requireConfig();
  if (!anonKey) return { skipped: true, reason: "SUPABASE_ANON_KEY no configurada." };
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: input.email, password: input.password })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Login Supabase fallo: ${body?.error_description || body?.error || response.statusText}`);
  }
  return { ok: true, user_id: body?.user?.id || null };
}

async function validateLocalLogin(input) {
  if (!process.env.JWT_SECRET) return { skipped: true, reason: "JWT_SECRET no configurado." };
  const authService = require("../auth/service");
  const result = await authService.login({ email: input.email, password: input.password }, null, { ip: "platform-initialization" });
  return {
    ok: Boolean(result?.token),
    tenant_id: result?.tenant?.id || null,
    role: result?.user?.role || null
  };
}

async function validatePlatformAccess(authUserId) {
  const rows = await supabaseRequest(`/rest/v1/platform_admins?select=user_id,status&user_id=eq.${encodeURIComponent(authUserId)}&limit=1`, {
    method: "GET"
  });
  const current = Array.isArray(rows) ? rows[0] : null;
  if (!current || current.status !== "active") throw new Error("Platform admin no quedo activo.");
  return { ok: true, status: current.status };
}

async function captureValidation(fn) {
  try {
    return await fn();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function initializePlatform(input = {}, options = {}) {
  const normalized = validateInput(input);
  const before = await getInitializationState();
  assertCanInitialize(before);

  if (options.dryRun) {
    return {
      ok: true,
      dry_run: true,
      state: before,
      would_create: {
        supabase_auth_user: normalized.email,
        profile: normalized.email,
        platform_admin: normalized.email,
        tenant: "APEXOS Platform",
        role: PLATFORM_ROLE_NAME,
        prisma_user: normalized.email
      }
    };
  }

  let authUserId = null;
  try {
    const authUser = await createAuthUser(normalized);
    authUserId = authUser?.id;
    if (!authUserId) throw new Error("Supabase Auth no devolvio id de usuario.");

    await createSupabaseMirror(authUserId, normalized);
    const prismaMirror = await createPrismaMirror(authUserId, normalized);

    const validations = {
      supabase_login: await captureValidation(() => validateSupabaseLogin(normalized)),
      local_login: await captureValidation(() => validateLocalLogin(normalized)),
      platform_access: await captureValidation(() => validatePlatformAccess(authUserId)),
      state_after: await getInitializationState()
    };
    const validationOk = Object.entries(validations)
      .filter(([key]) => key !== "state_after")
      .every(([, value]) => value?.ok === true || value?.skipped === true);

    return {
      ok: validationOk,
      dry_run: false,
      auth_user_id: authUserId,
      tenant_id: prismaMirror.tenant.id,
      prisma_user_id: prismaMirror.user.id,
      role_id: prismaMirror.role.id,
      validations
    };
  } catch (error) {
    await deleteAuthUser(authUserId);
    throw error;
  }
}

module.exports = {
  PLATFORM_ROLE_NAME,
  PLATFORM_TENANT_DOMAIN,
  getInitializationState,
  initializePlatform
};
