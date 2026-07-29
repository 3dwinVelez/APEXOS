const MAX_OPERATIONS = 20;
const MAX_REQUEST_BYTES = 256 * 1024;
const SYNC_TIMEOUT_MS = 15_000;
const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";

const operationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "operationId",
    "idempotencyKey",
    "operationType",
    "payload",
    "baseVersion",
    "createdAtDevice"
  ],
  properties: {
    operationId: { type: "string", pattern: UUID_PATTERN },
    idempotencyKey: { type: "string", minLength: 1, maxLength: 200 },
    operationType: { type: "string", enum: ["TEST_OPERATION"] },
    payload: {
      type: "object",
      additionalProperties: false,
      properties: {
        marker: { type: "string", minLength: 1, maxLength: 100 }
      },
      required: ["marker"]
    },
    baseVersion: { type: "integer", minimum: 0 },
    createdAtDevice: { type: "string", format: "date-time" }
  }
};

const pushSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["installationId", "operations"],
    properties: {
      installationId: { type: "string", pattern: UUID_PATTERN },
      operations: {
        type: "array",
        minItems: 1,
        maxItems: MAX_OPERATIONS,
        items: operationSchema
      }
    }
  }
};

module.exports = {
  MAX_OPERATIONS,
  MAX_REQUEST_BYTES,
  SYNC_TIMEOUT_MS,
  pushSchema
};
