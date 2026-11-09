const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DISABLE_REDIS = "true";

const prismaPath = require.resolve("../src/core/prisma");
const authPath = require.resolve("../src/security/supabaseAuth");
const previousEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

// A-01/A-13: desactivar un usuario o suspender una empresa en el API cerraba el
// acceso solo por la via del login propio. La sincronizacion con Supabase lo
// reactivaba en el espejo y la sesion seguia abierta. Aqui se prueba que el
// espejo respeta la desactivacion y que la autenticacion por Supabase la rechaza.

function mockSupabase({ userActive = true, tenantActive = true } = {}) {
  const previousFetch = global.fetch;
  const previousPrisma = require.cache[prismaPath];
  const previousAuth = require.cache[authPath];
  const writes = { user: [], tenant: [] };

  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

  global.fetch = async (url) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      return { ok: true, json: async () => ({ id: "user-1", email: "admin@example.test" }) };
    }
    if (target.includes("/company_users?")) {
      return { ok: true, json: async () => [{ company_id: "company-1", role: "admin", status: "active" }] };
    }
    if (target.includes("/companies?")) {
      return { ok: true, json: async () => [{ id: "company-1", name: "Empresa Uno" }] };
    }
    if (target.includes("/v_company_module_status?")) {
      return { ok: true, json: async () => [{ module_code: "compras", enabled: true }] };
    }
    if (target.includes("/employees?")) {
      return { ok: true, json: async () => [] };
    }
    throw new Error(`Unexpected request: ${target}`);
  };

  const role = { id: 1, name: "APEX_ADMIN", permissions: [] };
  const tenant = { id: "tenant-1", name: "Empresa Uno", domain: currentDomain(), active: tenantActive, active_modules: ["compras"], config: { source: "supabase_auth_sync", company_id: "company-1" } };
  const user = { id: 9, tenant_id: "tenant-1", email: "admin@example.test", name: "Admin", active: userActive, role_id: 1, role };

  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      user: {
        findUnique: async () => ({ ...user }),
        update: async ({ data }) => {
          writes.user.push({ ...data });
          return { ...user, ...data };
        }
      },
      role: {
        findUnique: async () => role,
        create: async ({ data }) => ({ id: 1, ...data, permissions: [] })
      },
      permission: {
        createMany: async () => ({ count: 0 }),
        deleteMany: async () => ({ count: 0 })
      },
      tenant: {
        findFirst: async () => ({ ...tenant }),
        update: async ({ data }) => {
          writes.tenant.push({ ...data });
          return { ...tenant, ...data };
        }
      }
    }
  };
  delete require.cache[authPath];

  return {
    async restore() {
      global.fetch = previousFetch;
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[authPath];
      if (previousAuth) require.cache[authPath] = previousAuth;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
    },
    writes,
    authorize(token) {
      const { authenticateSupabaseToken } = require(authPath);
      return authenticateSupabaseToken(token);
    }
  };
}

function currentDomain() {
  const suffix = String(process.env.TENANT_DOMAIN_SUFFIX || "apexos.local").trim();
  return `empresa-uno.${suffix}`;
}

test("un usuario desactivado no se reactiva al sincronizar y la sesion se rechaza", async () => {
  const mock = mockSupabase({ userActive: false });
  try {
    await assert.rejects(
      () => mock.authorize("token-usuario-inactivo"),
      (error) => error.statusCode === 403 && error.code === "USUARIO_DESACTIVADO"
    );
    assert.equal(mock.writes.user.some((data) => "active" in data), false, "el espejo intento reactivar al usuario");
  } finally {
    await mock.restore();
  }
});

test("una empresa suspendida no se reactiva y la sesion se rechaza", async () => {
  const mock = mockSupabase({ tenantActive: false });
  try {
    await assert.rejects(
      () => mock.authorize("token-empresa-suspendida"),
      (error) => error.statusCode === 403 && error.code === "EMPRESA_SUSPENDIDA"
    );
    assert.equal(mock.writes.tenant.some((data) => "active" in data), false, "el espejo intento reactivar la empresa");
  } finally {
    await mock.restore();
  }
});

test("usuario y empresa activos siguen autenticando", async () => {
  const mock = mockSupabase();
  try {
    const user = await mock.authorize("token-activo");
    assert.equal(user.id, 9);
    assert.equal(user.tenant_id, "tenant-1");
  } finally {
    await mock.restore();
  }
});
