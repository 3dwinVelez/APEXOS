const test = require("node:test");
const assert = require("node:assert/strict");

process.env.REDIS_DISABLED = "true";
const prismaPath = require.resolve("../src/core/prisma");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {}
};

const { selectMembership, tenantWithAuthorizationContext } = require("../src/security/supabaseAuth");

const memberships = [
  { company_id: "company-a", role: "admin" },
  { company_id: "company-b", role: "member" }
];

test("el backend respeta la empresa seleccionada aunque otra membresia sea administradora", () => {
  assert.equal(selectMembership(memberships, "company-b").company_id, "company-b");
});

test("el backend conserva el fallback administrativo cuando no se envia empresa", () => {
  assert.equal(selectMembership(memberships).company_id, "company-a");
});

test("el backend rechaza una empresa fuera de las membresias del usuario", () => {
  assert.throws(
    () => selectMembership(memberships, "company-c"),
    /no pertenece al usuario/
  );
});

test("RBAC usa los modulos autoritativos de la autenticacion aunque el cache del tenant este obsoleto", () => {
  const cachedTenant = { id: 7, active: true, active_modules: [] };
  const authenticatedUser = { active_modules: ["M-01", "M-02", "M-07"] };

  assert.deepEqual(
    tenantWithAuthorizationContext(cachedTenant, authenticatedUser).active_modules,
    ["M-01", "M-02", "M-07"]
  );
  assert.deepEqual(cachedTenant.active_modules, []);
});

test("sesiones locales conservan los modulos del tenant cacheado", () => {
  const cachedTenant = { id: 7, active: true, active_modules: ["M-03"] };
  assert.equal(tenantWithAuthorizationContext(cachedTenant, {}), cachedTenant);
});
