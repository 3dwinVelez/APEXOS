import assert from "node:assert/strict";
import test from "node:test";

import {
  isAdministrativeRole,
  mergePlatformAdminModuleAccess
} from "../lib/moduleAccessPolicy.ts";

test("recognizes platform and company administrator role variants", () => {
  for (const role of [
    "admin",
    "owner",
    "superadmin",
    "APEX_ADMIN",
    "Administrador",
    "Administrador de empresa"
  ]) {
    assert.equal(isAdministrativeRole([role]), true, role);
  }

  assert.equal(isAdministrativeRole(["coordinador"]), false);
});

test("platform administrator keeps company modules and platform administration", () => {
  const access = mergePlatformAdminModuleAccess(
    ["administracion", "servicios", "transporte", "inventario"],
    {
      administracion: false,
      servicios: true,
      transporte: true,
      inventario: false
    },
    new Set(["administracion"])
  );

  assert.deepEqual(access, {
    administracion: true,
    servicios: true,
    transporte: true,
    inventario: false
  });
});
