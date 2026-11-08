import assert from "node:assert/strict";
import test from "node:test";
import { isAdministrativeRole } from "../lib/moduleAccessPolicy.ts";

// El cliente decide visibilidad de Administración con el mismo criterio que el
// API: nombre normalizado exacto, nunca subcadena.

test("acepta los nombres administrativos legitimos en el cliente", () => {
  for (const role of ["APEX_ADMIN", "Administrador de Empresa", "owner", "superadmin"]) {
    assert.equal(isAdministrativeRole([role]), true, `${role} deberia abrir Administracion`);
  }
});

test("no abre Administracion por parecidos ni subcadenas", () => {
  for (const role of ["Administrador de empresas", "Super administrador", "No admin", "Administrador de inventario", "platform administrators"]) {
    assert.equal(isAdministrativeRole([role]), false, `${role} no deberia abrir Administracion`);
  }
});

test("ignora valores vacios y acepta la lista completa", () => {
  assert.equal(isAdministrativeRole([null, undefined, ""]), false);
  assert.equal(isAdministrativeRole(["Tecnico", "Administrador de Empresa"]), true);
});
