const { PROCESSING, ASSIGNMENT, SEGMENTS } = require("./constants");

const listQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1 },
    page_size: { type: "integer", minimum: 1, maximum: 100 },
    q: { type: "string", maxLength: 120 },
    from: { type: "string" },
    to: { type: "string" },
    issue_from: { type: "string" },
    issue_to: { type: "string" },
    processing_status: { type: "string", enum: Object.values(PROCESSING) },
    assignment_status: { type: "string", enum: Object.values(ASSIGNMENT) },
    supplier: { type: "string", maxLength: 160 },
    nit: { type: "string", maxLength: 40 },
    number: { type: "string", maxLength: 80 },
    supplier_id: { type: "integer", minimum: 1 },
    responsible_user_id: { type: "integer", minimum: 1 },
    segment: { type: "string", enum: SEGMENTS },
    needs_review: { type: "string", enum: ["true", "false"] },
    sort: { type: "string", enum: ["created_at", "issue_date", "total", "supplier"] }
  }
};

const idParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "integer", minimum: 1 } }
};

const documentParams = {
  type: "object",
  required: ["id", "documentId"],
  additionalProperties: false,
  properties: {
    id: { type: "integer", minimum: 1 },
    documentId: { type: "integer", minimum: 1 }
  }
};

const assignBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    responsible_user_id: { type: ["integer", "null"], minimum: 1 },
    responsible_name: { type: "string", maxLength: 160 },
    segment: { type: "string", enum: SEGMENTS },
    group_name: { type: "string", maxLength: 160 },
    cost_center: { type: ["string", "null"], maxLength: 120 },
    assignment_detail: { type: "string", maxLength: 600 },
    observations: { type: "string", maxLength: 1000 },
    notification_emails: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 320 }
    }
  }
};

const updateBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    group_name: { type: ["string", "null"], maxLength: 160 },
    cost_center: { type: ["string", "null"], maxLength: 120 },
    segment: { type: ["string", "null"], enum: [...SEGMENTS, null] },
    assignment_detail: { type: ["string", "null"], maxLength: 600 },
    observations: { type: ["string", "null"], maxLength: 1000 },
    notification_emails: {
      type: ["array", "null"],
      maxItems: 20,
      items: { type: "string", maxLength: 320 }
    }
  }
};

const approveBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    observations: { type: "string", maxLength: 1000 }
  }
};

const returnBody = {
  type: "object",
  required: ["reason"],
  additionalProperties: false,
  properties: {
    reason: { type: "string", minLength: 3, maxLength: 600 }
  }
};

const reviewBody = {
  type: "object",
  required: ["decision"],
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["accept", "reject"] },
    observations: { type: "string", maxLength: 1000 }
  }
};

const mailConfigBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    provider: { type: "string", enum: ["imap"] },
    host: { type: "string", maxLength: 253 },
    port: { type: "integer", minimum: 1, maximum: 65535 },
    secure: { type: "boolean" },
    username: { type: "string", maxLength: 320 },
    password_env_key: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,60}$" },
    folder: { type: "string", maxLength: 120 },
    polling_seconds: { type: "integer", minimum: 10, maximum: 3600 },
    enabled: { type: "boolean" }
  }
};

const mailSyncBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 50 }
  }
};

const errorResolveBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    note: { type: "string", maxLength: 500 }
  }
};

const emailsQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1 },
    page_size: { type: "integer", minimum: 1, maximum: 100 },
    status: { type: "string", maxLength: 40 },
    source: { type: "string", maxLength: 40 },
    q: { type: "string", maxLength: 120 }
  }
};

const errorsQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1 },
    page_size: { type: "integer", minimum: 1, maximum: 100 },
    resolved: { type: "string", enum: ["true", "false"] }
  }
};

const responsiblesQuery = {
  type: "object",
  additionalProperties: false,
  properties: { q: { type: "string", maxLength: 120 } }
};

const historyQuery = {
  type: "object",
  additionalProperties: false,
  properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }
};

module.exports = {
  listQuery,
  idParams,
  documentParams,
  assignBody,
  updateBody,
  approveBody,
  returnBody,
  reviewBody,
  mailConfigBody,
  mailSyncBody,
  errorResolveBody,
  emailsQuery,
  errorsQuery,
  responsiblesQuery,
  historyQuery
};
