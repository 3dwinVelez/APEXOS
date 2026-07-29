const { createHash } = require("node:crypto");
const { handleTestOperation } = require("./handlers/testOperation");

const HANDLERS = Object.freeze({
  TEST_OPERATION: handleTestOperation
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(operation) {
  return createHash("sha256")
    .update(canonicalJson({
      operationType: operation.operationType,
      payload: operation.payload,
      baseVersion: operation.baseVersion,
      createdAtDevice: operation.createdAtDevice
    }))
    .digest("hex");
}

function result(operationId, status, code, processedAt) {
  return { operationId, status, code, processedAt: processedAt.toISOString() };
}

function matches(receipt, context, operation, hash) {
  return receipt.installation_id === context.installationId &&
    receipt.operation_id === operation.operationId &&
    receipt.idempotency_key === operation.idempotencyKey &&
    receipt.operation_type === operation.operationType &&
    receipt.payload_hash === hash;
}

function createSyncProcessor(dependencies) {
  const database = dependencies.prisma;
  const now = dependencies.now || (() => new Date());
  const retentionMs = dependencies.retentionMs || 30 * 86400000;

  async function existingReceipt(context, operation) {
    return database.offlineSyncReceipt.findFirst({
      where: {
        environment_id: context.environmentId,
        tenant_id: context.tenantId,
        user_id: context.userId,
        OR: [
          { operation_id: operation.operationId },
          { idempotency_key: operation.idempotencyKey }
        ]
      }
    });
  }

  async function processOne(context, operation) {
    const processedAt = now();
    const hash = payloadHash(operation);
    const existing = await existingReceipt(context, operation);
    if (existing) {
      return matches(existing, context, operation, hash)
        ? result(operation.operationId, "ALREADY_APPLIED", existing.result_code, existing.processed_at)
        : result(operation.operationId, "REJECTED", "IDEMPOTENCY_MISMATCH", processedAt);
    }

    const handler = HANDLERS[operation.operationType];
    if (!handler) return result(operation.operationId, "REJECTED", "OPERATION_TYPE_NOT_ALLOWED", processedAt);
    const handled = await handler({ context, operation });
    try {
      const receipt = await database.offlineSyncReceipt.create({
        data: {
          environment_id: context.environmentId,
          tenant_id: context.tenantId,
          user_id: context.userId,
          installation_id: context.installationId,
          operation_id: operation.operationId,
          idempotency_key: operation.idempotencyKey,
          operation_type: operation.operationType,
          payload_hash: hash,
          result_status: handled.status,
          result_code: handled.code,
          processed_at: processedAt,
          expires_at: new Date(processedAt.getTime() + retentionMs)
        }
      });
      return result(operation.operationId, receipt.result_status, receipt.result_code, receipt.processed_at);
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const raced = await existingReceipt(context, operation);
      return raced && matches(raced, context, operation, hash)
        ? result(operation.operationId, "ALREADY_APPLIED", raced.result_code, raced.processed_at)
        : result(operation.operationId, "REJECTED", "IDEMPOTENCY_MISMATCH", processedAt);
    }
  }

  async function processBatch(context, operations) {
    const results = [];
    for (const operation of operations) {
      try {
        results.push(await processOne(context, operation));
      } catch {
        results.push(result(operation.operationId, "RETRYABLE_ERROR", "SYNC_STORAGE_UNAVAILABLE", now()));
      }
    }
    return results;
  }

  return { processBatch, processOne };
}

module.exports = { HANDLERS, canonicalJson, createSyncProcessor, payloadHash };
