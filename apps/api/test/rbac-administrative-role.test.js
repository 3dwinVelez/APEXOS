const assert = require("node:assert/strict");
const test = require("node:test");
const { isAdministrativeRole } = require("../src/middleware/rbac");

// A-06: el rol administrativo se decide por nombre normalizado exacto sobre los
// cinco campos, no por subcadena. Un `includes("admin")` convertiria
// "administrador de empresas junior" o "no admin" en bypass de permisos.

test("acepta los nombres administrativos legitimos", () => {
  for (const name of ["APEX_ADMIN", "Admin", "owner", "SuperAdmin", "Administrador de Empresa", "Administrador_empresa", "company admin", "Platform Admin"]) {
    assert.equal(isAdministrativeRole({ name }), true, `${name} deberia ser administrativo`);
  }
});

test("no acepta parecidos ni subcadenas", () => {
  for (const name of [
    "Administrador de empresas",
    "Administrador de empresa junior",
    "Super administrador",
    "No admin",
    "Administrador de inventario",
    "Platform administrators",
    "APEX_ADMINISTRADOR"
  ]) {
    assert.equal(isAdministrativeRole({ name }), false, `${name} no deberia ser administrativo`);
  }
});

test("el metadata tambien exige coincidencia exacta", () => {
  assert.equal(isAdministrativeRole({ name: "Tecnico", metadata: { role_type: "superadmin" } }), true);
  assert.equal(isAdministrativeRole({ name: "Tecnico", metadata: { scope: "owner" } }), true);
  assert.equal(isAdministrativeRole({ name: "Tecnico", metadata: { role_type: "administrador de empresas" } }), false);
  assert.equal(isAdministrativeRole({ name: "Tecnico", metadata: { profile_kind: "admin general" } }), false);
});

test("un rol ausente no es administrativo", () => {
  assert.equal(isAdministrativeRole(null), false);
  assert.equal(isAdministrativeRole({}), false);
});
