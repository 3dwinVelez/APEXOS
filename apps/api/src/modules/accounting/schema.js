const journalEntrySchema = {
  body: {
    type: "object",
    required: ["description", "entries"],
    properties: {
      description: { type: "string", minLength: 1 },
      date: { type: "string" },
      transaction_id: { type: "integer" },
      entries: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          required: ["account"],
          properties: {
            account: { type: "string" },
            debit: { type: "number" },
            credit: { type: "number" }
          }
        }
      }
    }
  }
};

const accountSchema = {
  body: {
    type: "object",
    required: ["code", "name", "type"],
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      type: { type: "string", enum: ["asset", "liability", "equity", "income", "expense", "cost", "order"] },
      parent_id: { type: ["integer", "null"] },
      level: { type: "integer", minimum: 1 },
      allows_tx: { type: "boolean" },
      active: { type: "boolean" }
    }
  }
};

const thirdPartySchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      type: { type: "string" },
      name: { type: "string", minLength: 1 },
      legal_name: { type: "string" },
      person_type: { type: "string", enum: ["natural", "juridica"] },
      document_type: { type: "string" },
      tax_id: { type: "string" },
      tax_type: { type: "string" },
      verification_digit: { type: ["integer", "null"] },
      tax_responsibilities: { type: "array", items: { type: "string" } },
      email: { type: "string" },
      phone: { type: "string" },
      address: { type: "string" },
      city: { type: "string" },
      department: { type: "string" },
      dane_code: { type: "string" },
      country: { type: "string" },
      segment: { type: "string" },
      credit_limit: { type: "number" },
      credit_days: { type: "integer" },
      active: { type: "boolean" },
      role_flags: { type: "object", additionalProperties: true },
      metadata: { type: "object", additionalProperties: true }
    }
  }
};

const periodSchema = {
  body: {
    type: "object",
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["open", "review", "closed"] },
      notes: { type: "string" }
    }
  }
};

const paymentSchema = {
  body: {
    type: "object",
    required: ["type", "method", "amount"],
    properties: {
      transaction_id: { type: "integer" },
      party_id: { type: "integer" },
      type: { type: "string", enum: ["income", "expense"] },
      method: { type: "string", enum: ["cash", "transfer", "card", "check", "other"] },
      amount: { type: "number", exclusiveMinimum: 0 },
      date: { type: "string" },
      reference: { type: "string" },
      notes: { type: "string" }
    }
  }
};

module.exports = { journalEntrySchema, accountSchema, thirdPartySchema, periodSchema, paymentSchema };
