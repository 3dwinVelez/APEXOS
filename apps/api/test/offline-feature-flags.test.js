const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OFFLINE_FEATURE_FLAGS,
  evaluateOfflineCapabilities,
  isOfflineFeatureEnabled,
  parseStrictBoolean
} = require("../src/offline/featureFlags");

const authorizedContext = {
  tenantId: "tenant-qa",
  userId: "technician-1",
  role: "Tecnico"
};

function enabledEnv(overrides = {}) {
  return {
    APP_ENV: "qa",
    OFFLINE_ALLOWED_ENVIRONMENTS: "qa",
    OFFLINE_ALLOWED_TENANT_IDS: "tenant-qa",
    OFFLINE_ALLOWED_USER_IDS: "technician-1",
    OFFLINE_ALLOWED_ROLES: "",
    OFFLINE_TECHNICIAN_ENABLED: "true",
    OFFLINE_SYNC_ENABLED: "true",
    OFFLINE_EVIDENCE_UPLOAD_ENABLED: "true",
    OFFLINE_AUTO_SYNC_ENABLED: "true",
    ...overrides
  };
}

test("todas las banderas estan desactivadas por defecto", () => {
  for (const flag of OFFLINE_FEATURE_FLAGS) {
    assert.equal(isOfflineFeatureEnabled(flag, authorizedContext, {}), false);
  }
  assert.deepEqual(evaluateOfflineCapabilities(authorizedContext, {}), {
    technician: false,
    sync: false,
    evidenceUpload: false,
    autoSync: false
  });
});

test("solo acepta booleanos estrictos true y false", () => {
  assert.equal(parseStrictBoolean("true"), true);
  assert.equal(parseStrictBoolean(true), true);
  assert.equal(parseStrictBoolean("false"), false);
  assert.equal(parseStrictBoolean(false), false);
  for (const invalid of ["TRUE", "1", "yes", "", undefined, null, 1]) {
    assert.equal(parseStrictBoolean(invalid), false);
  }
});

test("requiere bandera, ambiente, tenant e identidad permitidos", () => {
  assert.equal(
    isOfflineFeatureEnabled("OFFLINE_TECHNICIAN_ENABLED", authorizedContext, enabledEnv()),
    true
  );
  assert.equal(
    isOfflineFeatureEnabled(
      "OFFLINE_TECHNICIAN_ENABLED",
      { ...authorizedContext, tenantId: "other-tenant" },
      enabledEnv()
    ),
    false
  );
  assert.equal(
    isOfflineFeatureEnabled(
      "OFFLINE_TECHNICIAN_ENABLED",
      { ...authorizedContext, userId: "other-user", role: "Supervisor" },
      enabledEnv()
    ),
    false
  );
  assert.equal(
    isOfflineFeatureEnabled(
      "OFFLINE_TECHNICIAN_ENABLED",
      authorizedContext,
      enabledEnv({ APP_ENV: "production" })
    ),
    false
  );
});

test("un rol permitido puede habilitar identidad sin lista de usuario", () => {
  const env = enabledEnv({
    OFFLINE_ALLOWED_USER_IDS: "",
    OFFLINE_ALLOWED_ROLES: "tecnico"
  });
  assert.equal(isOfflineFeatureEnabled("OFFLINE_TECHNICIAN_ENABLED", authorizedContext, env), true);
});

test("una manipulacion declarada por cliente no participa en la decision", () => {
  const context = {
    tenantId: "other-tenant",
    userId: "attacker",
    role: "Tecnico",
    clientEnabled: true
  };
  assert.equal(isOfflineFeatureEnabled("OFFLINE_TECHNICIAN_ENABLED", context, enabledEnv()), false);
});

test("capacidades dependientes no superan a la capacidad principal", () => {
  const capabilities = evaluateOfflineCapabilities(
    authorizedContext,
    enabledEnv({ OFFLINE_TECHNICIAN_ENABLED: "false" })
  );
  assert.deepEqual(capabilities, {
    technician: false,
    sync: false,
    evidenceUpload: false,
    autoSync: false
  });
});

