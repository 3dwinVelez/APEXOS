const periodProp = { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" };

const budgetsUpdateSchema = {
  body: {
    type: "object",
    required: ["period", "rows"],
    additionalProperties: false,
    properties: {
      period: periodProp,
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 2000,
        items: {
          type: "object",
          required: ["vehicle_id", "concept_code", "amount"],
          additionalProperties: false,
          properties: {
            vehicle_id: { type: "integer", minimum: 1 },
            concept_code: { type: "string", minLength: 1, maxLength: 80 },
            amount: { type: "number", minimum: 0 }
          }
        }
      }
    }
  }
};

const mappingUpdateSchema = {
  body: {
    type: "object",
    required: ["rows"],
    additionalProperties: false,
    properties: {
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        items: {
          type: "object",
          required: ["source_code", "pyg_concept_code"],
          additionalProperties: false,
          properties: {
            source_type: { type: "string", enum: ["petty_cash_concept"] },
            source_code: { type: "string", minLength: 1, maxLength: 80 },
            pyg_concept_code: { type: "string", maxLength: 80 },
            active: { type: "boolean" }
          }
        }
      }
    }
  }
};

const configUpdateSchema = {
  body: {
    type: "object",
    required: ["tax_percent"],
    additionalProperties: false,
    properties: {
      tax_percent: { type: "number", minimum: 0, maximum: 100 }
    }
  }
};

module.exports = { budgetsUpdateSchema, mappingUpdateSchema, configUpdateSchema };
