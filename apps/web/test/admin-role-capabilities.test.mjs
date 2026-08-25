import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { hasAdministrativeCapability } from "../lib/moduleAccessPolicy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("admin empresa personalizado conserva gestion de usuarios y roles", () => {
  const input = { roleName: "Administrador corporativo NYVORA", roleType: "admin_empresa", permissions: {} };
  assert.equal(hasAdministrativeCapability(input, "users", "create"), true);
  assert.equal(hasAdministrativeCapability(input, "users", "edit"), true);
  assert.equal(hasAdministrativeCapability(input, "roles", "create"), true);
  assert.equal(hasAdministrativeCapability(input, "roles", "delete"), true);
});

test("soporte no hereda creacion de usuarios por permisos administrativos ajenos", () => {
  const support = {
    roleName: "Soporte tecnico",
    roleType: "soporte",
    permissions: {
      usuarios: { access: true, view: true, create: false, edit: true, manage_users: false },
      roles: { access: true, view: true, create: false, edit: false, manage_roles: false },
      configuracion: { configure: true }
    }
  };
  assert.equal(hasAdministrativeCapability(support, "users", "read"), true);
  assert.equal(hasAdministrativeCapability(support, "users", "edit"), true);
  assert.equal(hasAdministrativeCapability(support, "users", "create"), false);
  assert.equal(hasAdministrativeCapability(support, "roles", "create"), false);
});

test("las rutas Supabase verifican matriz y operacion solicitada", () => {
  const usersRoute = read("app/api/admin/users/route.ts");
  const rolesRoute = read("app/api/admin/roles/route.ts");
  const api = read("lib/api.ts");
  assert.match(usersRoute, /hasAdministrativeCapability/);
  assert.match(usersRoute, /requireCompanyAdmin\(token, requestedCompanyId, "create"\)/);
  assert.doesNotMatch(usersRoute, /roleName\.includes\("coordinador"\)/);
  assert.match(rolesRoute, /requireCompanyRoleAdmin\(token, clean\(body\.company_id\), operation\)/);
  assert.match(rolesRoute, /requireCompanyRoleAdmin\(token, clean\(body\.company_id\), "delete"\)/);
  assert.match(api, /saveSupabaseAdminRole\(role, "create"\)/);
});
