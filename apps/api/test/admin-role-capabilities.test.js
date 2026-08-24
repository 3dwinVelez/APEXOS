const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  hasAdminCapability,
  isAdministrativeRole,
  requireAdminCapability
} = require("../src/middleware/rbac");

function legacyRole(name, roleType, legacyPermissions, permissions = []) {
  return {
    id: 10,
    name,
    metadata: { role_type: roleType, legacy_permissions: legacyPermissions },
    permissions
  };
}

async function authorize(role, resource, action, tenant = { active_modules: ["M-22"] }) {
  const reply = {
    statusCode: 0,
    payload: null,
    code(status) {
      this.statusCode = status;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return payload;
    }
  };
  const request = { user: { role }, tenant, params: {}, query: {}, body: {} };
  await requireAdminCapability(resource, action)(request, reply);
  return { status: reply.statusCode || 200, payload: reply.payload, scope: request.rbacScope };
}

test("reconoce administradores confiables por role_type aunque el nombre sea personalizado", async () => {
  const role = legacyRole("Administrador corporativo NYVORA", "admin_empresa", {});
  assert.equal(isAdministrativeRole(role), true);
  assert.equal((await authorize(role, "users", "create")).status, 200);
  assert.equal((await authorize(role, "roles", "edit")).status, 200);
});

test("un gestor de usuarios cumple solo las capacidades concedidas en su matriz", async () => {
  const role = legacyRole("Gestor de usuarios", "custom", {
    usuarios: { access: true, view: true, create: true, edit: false, manage_users: false },
    roles: { access: false, view: false, create: false, edit: false, manage_roles: false }
  }, [{ module: "admin", action: "write" }]);

  assert.equal(hasAdminCapability(role, "users", "read"), true);
  assert.equal(hasAdminCapability(role, "users", "create"), true);
  assert.equal(hasAdminCapability(role, "users", "edit"), false);
  assert.equal(hasAdminCapability(role, "roles", "create"), false);
  assert.equal((await authorize(role, "users", "edit")).payload.code, "CAPACIDAD_ROL_DENEGADA");
});

test("admin write agregado no permite crear usuarios cuando la matriz solo concede editar", async () => {
  const support = legacyRole("Soporte tecnico", "soporte", {
    usuarios: { access: true, view: true, create: false, edit: true, manage_users: false },
    roles: { access: true, view: true, create: false, edit: false, manage_roles: false },
    configuracion: { access: true, view: true, edit: true, configure: true, administer: false }
  }, [{ module: "admin", action: "write" }]);

  assert.equal((await authorize(support, "users", "edit")).status, 200);
  const create = await authorize(support, "users", "create");
  assert.equal(create.status, 403);
  assert.equal(create.payload.code, "CAPACIDAD_ROL_DENEGADA");
});

test("mantiene compatibilidad con roles antiguos que solo tienen permisos RBAC agregados", async () => {
  const legacyRawRole = { name: "Administrador legado", metadata: {}, permissions: [{ module: "admin", action: "write" }] };
  assert.equal((await authorize(legacyRawRole, "users", "create")).status, 200);
});

test("la capacidad no omite suscripcion ni alcance del tenant", async () => {
  const admin = legacyRole("Administrador corporativo", "admin_empresa", {});
  const disabled = await authorize(admin, "users", "create", { active_modules: ["M-17"] });
  assert.equal(disabled.status, 403);
  assert.equal(disabled.payload.code, "MODULO_NO_HABILITADO");

  admin.metadata.scopes = { locations: ["BOG"] };
  const reply = {
    statusCode: 0,
    code(status) { this.statusCode = status; return this; },
    send(payload) { this.payload = payload; return payload; }
  };
  await requireAdminCapability("users", "create")({
    user: { role: admin },
    tenant: { active_modules: ["M-22"] },
    params: {},
    query: {},
    body: { site: "MED" }
  }, reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(reply.payload.code, "ALCANCE_ROL_DENEGADO");
});

test("las rutas de usuarios y roles exigen capacidades granulares", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/modules/admin/routes.js"), "utf8");
  assert.match(source, /post\("\/admin\/users"[\s\S]*requireAdminCapability\("users", "create"\)/);
  assert.match(source, /put\("\/admin\/users\/:id"[\s\S]*requireAdminCapability\("users", "edit"\)/);
  assert.match(source, /post\("\/admin\/roles"[\s\S]*requireAdminCapability\("roles", "create"\)/);
  assert.match(source, /delete\("\/admin\/roles\/:id"[\s\S]*requireAdminCapability\("roles", "delete"\)/);
});
