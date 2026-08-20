const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../certifications/admin-user-cycle-qa.js"), "utf8");

test("el certificado de usuarios solo acepta QA y rechaza produccion", () => {
  assert.match(source, /TARGET_ENV !== "qa"/);
  assert.match(source, /prod\|production\|jzbwzmkidfthknsohhnr/);
  assert.doesNotMatch(source, /config\/production\.env/);
});

test("el certificado cubre ciclo, negativas, persistencia y limpieza", () => {
  for (const check of ["authentication_required", "cross_tenant_rejected", "user_created", "duplicate_email_rejected", "user_updated_and_credentials_synced", "persistence_after_refresh", "old_password_rejected", "new_password_accepted", "user_inactivated", "inactive_user_login_rejected"]) {
    assert.match(source, new RegExp(`"${check}"`), `falta ${check}`);
  }
  assert.match(source, /temporary_user_inactivated_in_finally/);
  assert.match(source, /QA_EXPECTED_COMMIT/);
});

test("la evidencia no serializa credenciales", () => {
  assert.doesNotMatch(source, /evidence\.(password|token|adminPassword)/);
  assert.match(source, /email_hint/);
});
