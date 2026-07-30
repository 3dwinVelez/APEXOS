const test = require("node:test");
const assert = require("node:assert/strict");

const prismaPath = require.resolve("../src/core/prisma");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {}
};

const { tenantHasModule } = require("../src/middleware/rbac");

test("RBAC reconoce todos los identificadores vigentes de Inventario", () => {
  for (const moduleCode of ["M-01", "inventario", "inventory"]) {
    assert.equal(
      tenantHasModule({ active_modules: [moduleCode] }, "inventory"),
      true,
      `Debe reconocer ${moduleCode}`
    );
  }
});

test("RBAC normaliza espacios y mayusculas en los modulos del tenant", () => {
  assert.equal(tenantHasModule({ active_modules: ["  INVENTORY  "] }, "inventory"), true);
});

test("RBAC mantiene bloqueado Inventario cuando no esta habilitado", () => {
  assert.equal(tenantHasModule({ active_modules: ["compras"] }, "inventory"), false);
});
