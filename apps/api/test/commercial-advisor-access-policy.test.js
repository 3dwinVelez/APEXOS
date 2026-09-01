const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const commercialService = fs.readFileSync(path.join(root, "src/modules/commercial-management/service.js"), "utf8");
const commercialRoutes = fs.readFileSync(path.join(root, "src/modules/commercial-management/routes.js"), "utf8");
const adminService = fs.readFileSync(path.join(root, "src/modules/admin/service.js"), "utf8");

test("advisor scope is derived from the authenticated APEX user", () => {
  assert.match(commercialService, /user_id:\s*actor\?\.id/);
  assert.match(commercialService, /advisor_id:\s*\{\s*in:\s*scope\.advisorIds\s*\}/);
  assert.match(commercialService, /El usuario no esta vinculado a un asesor comercial activo/);
});

test("commercial context exposes administrative capabilities without trusting the frontend", () => {
  assert.match(commercialRoutes, /commercial-management\/access-context/);
  assert.match(commercialService, /can_manage_masters:\s*scope\.kind === "admin"/);
  assert.match(commercialService, /can_manage_budgets:\s*scope\.kind === "admin"/);
  assert.match(commercialService, /Solo un administrador puede asignar presupuestos/);
});

test("M-27 is available in the permission catalog and Comercial role", () => {
  assert.match(adminService, /"commercial-management": \["M-27"/);
  assert.match(adminService, /key: "gestion_comercial"/);
  assert.match(adminService, /permissionPreset\(\["dashboard", "gestion_comercial"\]/);
});
