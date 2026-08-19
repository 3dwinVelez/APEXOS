const bankSchema = {
  body: {
    type: "object",
    required: ["code", "name", "account_id"],
    properties: {
      code: { type: "string", minLength: 1, maxLength: 30 },
      name: { type: "string", minLength: 1, maxLength: 120 },
      account_id: { type: "integer" },
      active: { type: "boolean" }
    }
  }
};

const paymentSchema = {
  body: {
    type: "object",
    required: ["direction", "posting_date", "party_id", "bank_id", "applications"],
    properties: {
      direction: { type: "string", enum: ["receipt", "disbursement"] },
      posting_date: { type: "string", minLength: 10 },
      party_id: { type: "integer" },
      bank_id: { type: "integer" },
      reference: { type: "string", maxLength: 120 },
      notes: { type: "string", maxLength: 500 },
      applications: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["source_id", "amount"],
          properties: {
            source_id: { type: "integer" },
            amount: { type: "number", exclusiveMinimum: 0 }
          }
        }
      }
    }
  }
};

const advanceSchema = {
  body: {
    type: "object",
    required: ["direction", "posting_date", "party_id", "bank_id", "society_code", "account_id", "amount"],
    properties: {
      direction: { type: "string", enum: ["customer", "supplier"] },
      posting_date: { type: "string", minLength: 10 }, party_id: { type: "integer" },
      bank_id: { type: "integer" }, society_code: { type: "string", minLength: 1 },
      account_id: { type: "integer" }, amount: { type: "number", exclusiveMinimum: 0 },
      reference: { type: "string", maxLength: 120 }, notes: { type: "string", maxLength: 500 }
    }
  }
};

const advanceApplicationSchema = {
  body: {
    type: "object", required: ["posting_date", "source_id", "amount"],
    properties: { posting_date: { type: "string", minLength: 10 }, source_id: { type: "integer" }, amount: { type: "number", exclusiveMinimum: 0 } }
  }
};

module.exports = { bankSchema, paymentSchema, advanceSchema, advanceApplicationSchema };
