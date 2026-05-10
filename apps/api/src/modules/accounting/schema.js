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

module.exports = { journalEntrySchema, paymentSchema };

