const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

process.env.REDIS_DISABLED = "true";
const prismaPath = require.resolve("../src/core/prisma");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {}
};

const { normalizeRolePermissions, roleBlueprint, selectMembership, tenantWithAuthorizationContext } = require("../src/security/supabaseAuth");

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

test("el permiso de catalogo para corregir servicios se traduce al permiso RBAC", () => {
  assert.deepEqual(
    normalizeRolePermissions({ servicios_correcciones: { edit_any_state: true } }),
    [{ module: "services.orders", action: "edit_any_state" }]
  );
});

test("un rol especial recibe solo el permiso explicito y no un comodin administrativo", () => {
  const blueprint = roleBlueprint("member", {
    metadata: {
      role_id: 42,
      role_name: "Coordinador de servicios",
      permissions: { servicios_correcciones: { edit_any_state: true } }
    }
  });

  assert.equal(blueprint.name, "Supabase Role 42");
  assert.equal(blueprint.managed, true);
  assert.ok(blueprint.permissions.some((permission) => permission.module === "services.orders" && permission.action === "edit_any_state"));
  assert.ok(!blueprint.permissions.some((permission) => permission.module === "*" && permission.action === "*"));
});

test("un rol viewer sincronizado no recibe lectura administrativa comodin", () => {
  const blueprint = roleBlueprint("viewer", {});
  const modules = new Set(blueprint.permissions.map((permission) => permission.module));
  assert.ok(!modules.has("*"));
  assert.ok(!modules.has("admin"));
  assert.ok(modules.has("dashboard"));
  assert.ok(modules.has("services"));
});

test("un rol member sincronizado no recibe lectura administrativa comodin", () => {
  const blueprint = roleBlueprint("member", {});
  const modules = new Set(blueprint.permissions.map((permission) => permission.module));
  assert.ok(!modules.has("*"));
  assert.ok(!modules.has("admin"));
  assert.ok(modules.has("hr"));
  assert.ok(modules.has("transport"));
});

test("la vista de modulos se consulta con el JWT del usuario para conservar auth.uid()", () => {
  const source = fs.readFileSync(require.resolve("../src/security/supabaseAuth"), "utf8");
  assert.match(
    source,
    /v_company_module_status[\s\S]*?token,\s*[\s\S]*?service:\s*false/
  );
});
