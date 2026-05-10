const customerSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      tax_id: { type: "string" },
      tax_type: { type: "string", enum: ["person", "company"] },
      email: { type: "string" },
      phone: { type: "string" },
      address: { type: "string" },
      city: { type: "string" },
      country: { type: "string" },
      credit_limit: { type: "number" },
      credit_days: { type: "integer" },
      segment: { type: "string" },
      metadata: { type: "object", additionalProperties: true }
    }
  }
};

const saleOrderSchema = {
  body: {
    type: "object",
    required: ["customer_id", "lines"],
    properties: {
      customer_id: { type: "integer" },
      notes: { type: "string" },
      lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["item_id", "qty"],
          properties: {
            item_id: { type: "integer" },
            qty: { type: "number", exclusiveMinimum: 0 },
            unit_price: { type: "number", minimum: 0 },
            discount: { type: "number", minimum: 0, maximum: 100 },
            notes: { type: "string" }
          }
        }
      }
    }
  }
};

module.exports = { customerSchema, saleOrderSchema };

