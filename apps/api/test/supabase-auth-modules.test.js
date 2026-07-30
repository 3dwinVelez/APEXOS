const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DISABLE_REDIS = "true";

test("active module view is queried with the authenticated user identity", async () => {
  const prismaPath = require.resolve("../src/core/prisma");
  const authPath = require.resolve("../src/security/supabaseAuth");
  const previousPrisma = require.cache[prismaPath];
  const previousAuth = require.cache[authPath];
  const previousFetch = global.fetch;
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const requests = [];

  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), authorization: options.headers?.authorization });
    if (String(url).includes("/auth/v1/user")) {
      return { ok: true, json: async () => ({ id: "user-1", email: "admin@example.test" }) };
    }
    if (String(url).includes("/company_users?")) {
      return { ok: true, json: async () => [{ company_id: "company-1", role: "admin", status: "active" }] };
    }
    if (String(url).includes("/companies?")) {
      return { ok: true, json: async () => [{ id: "company-1", name: "Empresa Uno" }] };
    }
    if (String(url).includes("/v_company_module_status?")) {
      return { ok: true, json: async () => [{ module_code: "compras", enabled: true }] };
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      user: {
        findMany: async () => [{
          id: 9,
          tenant_id: "tenant-1",
          email: "admin@example.test",
          role: { id: 1, name: "APEX_ADMIN", permissions: [] }
        }]
      },
      tenant: {
        findUnique: async () => ({
          id: "tenant-1",
          name: "Empresa Uno",
          active_modules: ["compras"],
          config: { source: "supabase_auth_sync", company_id: "company-1" }
        }),
        update: async ({ data }) => ({
          id: "tenant-1",
          active_modules: ["compras"],
          config: { source: "supabase_auth_sync", company_id: "company-1" },
          ...data
        })
      }
    }
  };
  delete require.cache[authPath];

  try {
    const { authenticateSupabaseToken } = require(authPath);
    const user = await authenticateSupabaseToken("authenticated-user-token");
    assert.equal(user.tenant_id, "tenant-1");
    const moduleRequest = requests.find((request) => request.url.includes("/v_company_module_status?"));
    const companyRequest = requests.find((request) => request.url.includes("/companies?"));
    assert.equal(moduleRequest.authorization, "Bearer authenticated-user-token");
    assert.equal(companyRequest.authorization, "Bearer service-key");
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[authPath];
    if (previousAuth) require.cache[authPath] = previousAuth;
    if (previousPrisma) require.cache[prismaPath] = previousPrisma;
    else delete require.cache[prismaPath];
  }
});
