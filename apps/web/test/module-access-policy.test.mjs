import assert from "node:assert/strict";
import test from "node:test";

import {
  hasAdministrativeCapability,
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
    "Administrador de empresa",
    "admin_empresa",
    "company-admin",
    "Administrador   empresa"
  ]) {
    assert.equal(isAdministrativeRole([role]), true, role);
  }

  assert.equal(isAdministrativeRole(["coordinador"]), false);
});

test("evaluates user and role administration from the configured permission matrix", () => {
  const manager = {
    roleName: "Gestor personalizado",
    roleType: "custom",
    permissions: {
      usuarios: { access: true, view: true, create: true, edit: false, manage_users: false },
      roles: { access: true, view: true, create: false, edit: false, manage_roles: false }
    }
  };
  assert.equal(hasAdministrativeCapability(manager, "users", "create"), true);
  assert.equal(hasAdministrativeCapability(manager, "users", "edit"), false);
  assert.equal(hasAdministrativeCapability(manager, "roles", "read"), true);
  assert.equal(hasAdministrativeCapability(manager, "roles", "create"), false);
  assert.equal(hasAdministrativeCapability({ roleType: "admin_empresa" }, "users", "create"), true);
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
