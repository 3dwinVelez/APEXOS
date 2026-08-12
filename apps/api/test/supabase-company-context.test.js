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

const { normalizeRolePermissions, roleBlueprint } = require("../src/security/supabaseAuth");

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
