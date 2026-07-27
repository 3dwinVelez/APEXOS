const SYNC_STATUSES = Object.freeze([
  "LOCAL_ONLY",
  "PENDING",
  "SYNCING",
  "SYNCED",
  "FAILED",
  "CONFLICT",
  "BLOCKED"
]);

const OFFLINE_OPERATION_TYPES = Object.freeze([
  "SERVICE_STARTED",
  "SERVICE_COMPLETION_REQUESTED",
  "ACTIVITY_COMPLETED",
  "CHECKLIST_UPDATED",
  "OBSERVATION_ADDED",
  "EVIDENCE_CAPTURED",
  "LOCATION_EVENT_RECORDED"
]);

const SYNC_OPERATION_RESULT_STATUSES = Object.freeze([
  "APPLIED",
  "ALREADY_APPLIED",
  "RETRYABLE_ERROR",
  "REJECTED",
  "CONFLICT",
  "BLOCKED"
]);

const SYNC_ERROR_CATEGORIES = Object.freeze([
  "NETWORK",
  "AUTHENTICATION",
  "AUTHORIZATION",
  "VALIDATION",
  "CONFLICT",
  "RATE_LIMIT",
  "SERVER",
  "STORAGE",
  "UNKNOWN"
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

function validateOfflineOperation(value) {
  const issues = [];
  if (!isRecord(value)) return validationFailure(["operation must be an object"]);
  if (!isNonEmptyString(value.operationId)) issues.push("operationId is required");
  if (!OFFLINE_OPERATION_TYPES.includes(value.type)) issues.push("type is invalid");
  if (!isNonEmptyString(value.entityId)) issues.push("entityId is required");
  if (!isNonEmptyString(value.tenantId)) issues.push("tenantId is required");
  if (!isNonEmptyString(value.userId)) issues.push("userId is required");
  if (!isNonEmptyString(value.deviceId)) issues.push("deviceId is required");
  if (!Number.isInteger(value.baseVersion) || value.baseVersion < 0) {
    issues.push("baseVersion must be a non-negative integer");
  }
  if (!isIsoDate(value.occurredAt)) issues.push("occurredAt must be ISO-8601");
  if (!isRecord(value.payload)) issues.push("payload must be an object");
  return issues.length ? validationFailure(issues) : { success: true, data: value };
}

function validateSyncOperationResult(value) {
  const issues = [];
  if (!isRecord(value)) return validationFailure(["result must be an object"]);
  if (!isNonEmptyString(value.operationId)) issues.push("operationId is required");
  if (!SYNC_OPERATION_RESULT_STATUSES.includes(value.status)) issues.push("status is invalid");
  if (!isIsoDate(value.processedAt)) issues.push("processedAt must be ISO-8601");
  if (value.serverVersion !== undefined && value.serverVersion !== null) {
    if (!Number.isInteger(value.serverVersion) || value.serverVersion < 0) {
      issues.push("serverVersion must be a non-negative integer");
    }
  }
  return issues.length ? validationFailure(issues) : { success: true, data: value };
}

module.exports = {
  OFFLINE_OPERATION_TYPES,
  SYNC_ERROR_CATEGORIES,
  SYNC_OPERATION_RESULT_STATUSES,
  SYNC_STATUSES,
  validateOfflineOperation,
  validateSyncOperationResult
};

