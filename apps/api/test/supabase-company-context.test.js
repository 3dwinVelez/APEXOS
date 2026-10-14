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

test("el perfil Supabase de marcaciones no hereda permisos generales de RRHH", () => {
  const blueprint = roleBlueprint("member", {
    metadata: {
      role_id: 8,
      role_name: "Empleado marcaciones",
      access_profile: "marking_only",
      permissions: { marcaciones: { access: true, view: true, create: true } }
    }
  });
  assert.equal(blueprint.name, "Supabase Marking 8");
  assert.deepEqual(blueprint.permissions, [
    { module: "time_tracking", action: "read" },
    { module: "time_tracking", action: "write" }
  ]);
  assert.ok(!blueprint.permissions.some((permission) => permission.module === "hr"));
  assert.ok(!blueprint.permissions.some((permission) => permission.module === "services"));
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
  assert.equal(blueprint.managed, true);
});

test("un rol member sincronizado no recibe lectura administrativa comodin", () => {
  const blueprint = roleBlueprint("member", {});
  const modules = new Set(blueprint.permissions.map((permission) => permission.module));
  assert.ok(!modules.has("*"));
  assert.ok(!modules.has("admin"));
  assert.ok(modules.has("hr"));
  assert.ok(modules.has("transport"));
  assert.equal(blueprint.managed, true);
});

test("la vista de modulos se consulta con el JWT del usuario para conservar auth.uid()", () => {
  const source = fs.readFileSync(require.resolve("../src/security/supabaseAuth"), "utf8");
  assert.match(
    source,
    /v_company_module_status[\s\S]*?token,\s*[\s\S]*?service:\s*false/
  );
});

// ---- Accionista ----
// El rol se crea en la web (catalogo de roles de Supabase) y llega aqui en la
// metadata del empleado. El rol de la web puede traer muchos modulos marcados;
// el API solo le concede lectura de contabilidad y transporte.
const accionista = (overrides = {}) => ({
  metadata: {
    role_id: "role_77",
    role_name: "Accionista",
    permissions: {
      contabilidad: { access: true, view: true, create: true, edit: true, approve: true },
      transporte: { view: true, export: true, edit: true },
      servicios: { view: true, create: true },
      talento_humano: { view: true, create: true }
    },
    ...overrides
  }
});

test("el accionista sincronizado solo recibe lectura de contabilidad y transporte", () => {
  const blueprint = roleBlueprint("member", accionista());
  assert.equal(blueprint.name, "Accionista");
  assert.equal(blueprint.managed, true);
  assert.deepEqual(blueprint.permissions, [
    { module: "accounting", action: "read" },
    { module: "transport", action: "read" }
  ]);
});

test("el accionista no hereda escritura de los modulos marcados en la web", () => {
  const blueprint = roleBlueprint("member", accionista());
  const granted = blueprint.permissions.map((permission) => `${permission.module}:${permission.action}`);
  for (const forbidden of ["accounting:write", "transport:write", "transport:approve", "services:read", "services:write", "hr:read", "hr:write", "*:*"]) {
    assert.ok(!granted.includes(forbidden), `no debe conceder ${forbidden}`);
  }
});

test("el accionista se reconoce sin importar mayusculas, tildes ni espacios", () => {
  for (const name of ["ACCIONISTA", "  accionista ", "Accionísta", "Accionistas", "Shareholder"]) {
    assert.equal(roleBlueprint("member", accionista({ role_name: name })).name, "Accionista", name);
  }
});

test("el accionista tambien se reconoce por access_profile o por la metadata de acceso", () => {
  assert.equal(roleBlueprint("member", accionista({ role_name: "Socio inversionista", access_profile: "accionista" })).name, "Accionista");
  assert.equal(roleBlueprint("member", { metadata: { access: { role_name: "Accionista" } } }).name, "Accionista");
});

test("un administrador de la empresa con rol accionista conserva la administracion", () => {
  // No se degrada al dueno de la empresa por asignarle el rol en la web.
  assert.equal(roleBlueprint("admin", accionista()).name, "APEX_ADMIN");
  assert.equal(roleBlueprint("owner", accionista()).name, "APEX_ADMIN");
});

test("un rol que solo contiene la palabra no se trata como accionista", () => {
  assert.equal(roleBlueprint("member", accionista({ role_name: "Asistente de accionistas" })).name, "Supabase Member");
});

test("RBAC no trata al accionista como rol administrativo", () => {
  const { isAdministrativeRole } = require("../src/middleware/rbac");
  assert.equal(isAdministrativeRole({ name: "Accionista", metadata: {} }), false);
});

test("RBAC deja leer contabilidad al accionista y le niega escribir", async () => {
  const { requirePermission } = require("../src/middleware/rbac");
  const blueprint = roleBlueprint("member", accionista());
  const role = { id: 1, name: blueprint.name, metadata: {}, permissions: blueprint.permissions };
  const run = async (module, action) => {
    let status = 200;
    const reply = { code(value) { status = value; return this; }, send() { return this; } };
    await requirePermission(module, action)({ user: { role }, tenant: { active_modules: ["M-07", "M-14"] }, params: {}, query: {}, body: {} }, reply);
    return status;
  };
  assert.equal(await run("accounting", "read"), 200);
  assert.equal(await run("transport", "read"), 200);
  assert.equal(await run("accounting", "write"), 403);
  assert.equal(await run("transport", "write"), 403);
  assert.equal(await run("transport", "approve"), 403);
  assert.equal(await run("services", "read"), 403);
});
