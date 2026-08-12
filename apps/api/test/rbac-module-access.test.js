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

test("RBAC reconoce los identificadores tecnicos usados por permisos y sincronizacion", () => {
  const cases = {
    accounting: "accounting",
    admin: "admin",
    brain: "brain",
    hr: "hr",
    invoicing: "invoicing",
    purchases: "purchases",
    projects: "projects",
    sales: "sales",
    "sales-invoice": "sales-invoice",
    "accounts-receivable": "accounts-receivable",
    services: "services",
    transport: "transport"
  };

  for (const [module, moduleCode] of Object.entries(cases)) {
    assert.equal(
      tenantHasModule({ active_modules: [moduleCode] }, module),
      true,
      `Debe reconocer ${moduleCode} para ${module}`
    );
  }
});
