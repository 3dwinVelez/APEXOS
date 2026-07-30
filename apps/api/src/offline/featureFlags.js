const OFFLINE_FEATURE_FLAGS = Object.freeze([
  "OFFLINE_TECHNICIAN_ENABLED",
  "OFFLINE_SYNC_ENABLED",
  "OFFLINE_EVIDENCE_UPLOAD_ENABLED",
  "OFFLINE_AUTO_SYNC_ENABLED"
]);

function parseStrictBoolean(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return false;
}

function parseAllowList(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function currentEnvironment(env) {
  return String(env.APP_ENV || env.TARGET_ENV || env.NODE_ENV || "").trim().toLowerCase();
}

function isOfflineFeatureEnabled(flag, context = {}, env = process.env) {
  if (!OFFLINE_FEATURE_FLAGS.includes(flag)) return false;
  if (!parseStrictBoolean(env[flag])) return false;

  const environments = parseAllowList(env.OFFLINE_ALLOWED_ENVIRONMENTS);
  const tenants = parseAllowList(env.OFFLINE_ALLOWED_TENANT_IDS);
  const users = parseAllowList(env.OFFLINE_ALLOWED_USER_IDS);
  const roles = parseAllowList(env.OFFLINE_ALLOWED_ROLES);
  const identityAllowed =
    users.has(String(context.userId || "").toLowerCase()) ||
    roles.has(String(context.role || "").toLowerCase());

  return (
    environments.has(currentEnvironment(env)) &&
    tenants.has(String(context.tenantId || "").toLowerCase()) &&
    identityAllowed
  );
}

function evaluateOfflineCapabilities(context = {}, env = process.env) {
  const technician = isOfflineFeatureEnabled("OFFLINE_TECHNICIAN_ENABLED", context, env);
  const sync = technician && isOfflineFeatureEnabled("OFFLINE_SYNC_ENABLED", context, env);
  const evidenceUpload =
    sync && isOfflineFeatureEnabled("OFFLINE_EVIDENCE_UPLOAD_ENABLED", context, env);
  const autoSync = sync && isOfflineFeatureEnabled("OFFLINE_AUTO_SYNC_ENABLED", context, env);

  return Object.freeze({
    technician,
    sync,
    evidenceUpload,
    autoSync
  });
}

module.exports = {
  OFFLINE_FEATURE_FLAGS,
  evaluateOfflineCapabilities,
  isOfflineFeatureEnabled,
  parseAllowList,
  parseStrictBoolean
};

