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

const { selectMembership } = require("../src/security/supabaseAuth");

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
