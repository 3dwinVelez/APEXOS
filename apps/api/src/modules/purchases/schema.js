const supplierSchema = {
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
      metadata: { type: "object", additionalProperties: true }
    }
  }
};

const updateSupplierSchema = {
  body: {
    type: "object",
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
      active: { type: "boolean" },
      metadata: { type: "object", additionalProperties: true }
    }
  }
};

const purchaseOrderSchema = {
  body: {
    type: "object",
    required: ["supplier_id", "lines"],
    properties: {
      supplier_id: { type: "integer" },
      expected_at: { type: "string" },
      notes: { type: "string" },
      warehouse_id: { type: "integer" },
      priority: { type: "string" },
      currency: { type: "string" },
      payment_terms: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      freight: { type: "number" },
      other_costs: { type: "number" },
      lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["item_id", "qty", "unit_cost"],
          properties: {
            item_id: { type: "integer" },
            qty: { type: "number", exclusiveMinimum: 0 },
            unit_cost: { type: "number", minimum: 0 },
            unit: { type: "string" },
            discount: { type: "number" },
            tax_rate: { type: "number" },
            expected_at: { type: "string" },
            notes: { type: "string" }
          }
        }
      }
    }
  }
};

module.exports = { supplierSchema, updateSupplierSchema, purchaseOrderSchema };

