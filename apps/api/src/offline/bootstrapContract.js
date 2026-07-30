const OFFLINE_BOOTSTRAP_SCHEMA_VERSION = 2;
const BOOTSTRAP_KEYS = new Set([
  "schemaVersion",
  "snapshotId",
  "generatedAt",
  "expiresAt",
  "environmentId",
  "companyId",
  "userId",
  "serverCheckpoint",
  "orders",
  "activities",
  "checklists",
  "catalogs",
  "metadata"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function validationFailure(issues) {
  return { success: false, error: { code: "OFFLINE_CONTRACT_INVALID", issues } };
}

function validVersionedRecord(value) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.serverId) &&
    Number.isInteger(value.serverVersion) &&
    value.serverVersion >= 0 &&
    isIsoDate(value.serverUpdatedAt)
  );
}

function validateOfflineBootstrapResponse(value) {
  const issues = [];
  if (!isRecord(value) || !Object.keys(value).every((key) => BOOTSTRAP_KEYS.has(key))) {
    return validationFailure(["bootstrap contains unknown fields"]);
  }
  if (value.schemaVersion !== OFFLINE_BOOTSTRAP_SCHEMA_VERSION) {
    issues.push("schemaVersion is incompatible");
  }
  for (const field of ["snapshotId", "environmentId", "companyId", "userId", "serverCheckpoint"]) {
    if (!isNonEmptyString(value[field])) issues.push(`${field} is required`);
  }
  if (!isIsoDate(value.generatedAt)) issues.push("generatedAt must be ISO-8601");
  if (!isIsoDate(value.expiresAt)) issues.push("expiresAt must be ISO-8601");
  if (
    isIsoDate(value.generatedAt) &&
    isIsoDate(value.expiresAt) &&
    Date.parse(value.expiresAt) <= Date.parse(value.generatedAt)
  ) {
    issues.push("expiresAt must be after generatedAt");
  }
  for (const field of ["orders", "activities", "checklists", "catalogs"]) {
    if (!Array.isArray(value[field])) {
      issues.push(`${field} must be an array`);
      continue;
    }
    if (!value[field].every(validVersionedRecord)) {
      issues.push(`${field} contains an invalid versioned record`);
    }
  }
  if (
    !isRecord(value.metadata) ||
    !Number.isInteger(value.metadata.ttlSeconds) ||
    value.metadata.ttlSeconds <= 0 ||
    typeof value.metadata.hasMore !== "boolean" ||
    !isNonEmptyString(value.metadata.versionStrategy)
  ) {
    issues.push("metadata is invalid");
  }
  return issues.length ? validationFailure(issues) : { success: true, data: value };
}

module.exports = {
  OFFLINE_BOOTSTRAP_SCHEMA_VERSION,
  validateOfflineBootstrapResponse
};
