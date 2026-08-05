import assert from "node:assert/strict";
import test from "node:test";

import {
  hasRolePermission,
  hasStoredRolePermission
} from "../lib/rolePermissions.ts";

function installStorage(values = {}) {
  const store = new Map(Object.entries(values));
  globalThis.window = {};
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

test("recognizes special service correction permission from flattened permissions", () => {
  assert.equal(
    hasRolePermission([{ module: "services.orders", action: "edit_any_state" }], "services.orders", "edit_any_state"),
    true
  );
});

test("recovers special correction visibility for APEX_ADMIN when flattened permissions are missing", () => {
  installStorage({
    role_name: "APEX_ADMIN",
    role_permissions: "[]"
  });

  assert.equal(hasStoredRolePermission("services.orders", "edit_any_state"), true);
});

test("does not grant special correction visibility to ordinary roles without permission", () => {
  installStorage({
    role_name: "Tecnico",
    role_permissions: "[]"
  });

  assert.equal(hasStoredRolePermission("services.orders", "edit_any_state"), false);
});

test("reads special correction permission from stored role metadata fallback", () => {
  installStorage({
    role_name: "Supervisor operativo",
    role_permissions: "[]",
    role_metadata: JSON.stringify({
      legacy_permissions: {
        servicios_correcciones: {
          edit_any_state: true
        }
      }
    })
  });

  assert.equal(hasStoredRolePermission("services.orders", "edit_any_state"), true);
});
