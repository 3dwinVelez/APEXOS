const paymentSchema = {
  body: {
    type: "object",
    required: ["customer_id", "amount", "method"],
    properties: {
      customer_id: { type: "integer" },
      cabdoc_ids: { type: "array", items: { type: "integer" } },
      amount: { type: "number", exclusiveMinimum: 0 },
      method: { type: "string", enum: ["cash", "bank_transfer", "check", "credit_card", "other"] },
      date: { type: "string" },
      reference: { type: "string" },
      notes: { type: "string" },
      account_id: { type: "integer" }
    }
  }
};

const retentionSchema = {
  body: {
    type: "object",
    required: ["code", "description", "account_code", "percent"],
    properties: {
      code: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      account_code: { type: "string", minLength: 1 },
      percent: { type: "number", exclusiveMinimum: 0 },
      concept: { type: "string" },
      scope: { type: "string", enum: ["sales"] },
      retention_type: { type: "string", enum: ["retefuente", "reteiva", "reteica"] },
      minimum_base: { type: "number", minimum: 0 },
      base_type: { type: "string", enum: ["subtotal", "iva"] },
      active: { type: "boolean" }
    }
  }
};

module.exports = { paymentSchema, retentionSchema };
