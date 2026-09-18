const createInvoiceSchema = {
  body: {
    type: "object",
    required: ["customer_id", "posting_date", "due_term", "header_text", "society_code", "branch_code", "cost_center_code", "associated_account_code", "lines"],
    properties: {
      customer_id: { type: "integer" },
      place_id: { type: "integer" },
      posting_date: { type: "string", minLength: 1 },
      due_term: { type: "string" },
      due_date: { type: "string" },
      header_text: { type: "string", minLength: 1 },
      society_code: { type: "string", minLength: 1 },
      branch_code: { type: "string", minLength: 1 },
      cost_center_code: { type: "string", minLength: 1 },
      associated_account_code: { type: "string", minLength: 1 },
      sales_order_id: { type: "integer" },
      post_immediately: { type: "boolean" },
      notes: { type: "string" },
      lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["item_id", "qty", "place_id"],
          properties: {
            item_id: { type: "integer" },
            qty: { type: "number", exclusiveMinimum: 0 },
            unit_price: { type: "number", minimum: 0 },
            discount: { type: "number" },
            tax_rate: { type: "number" },
            place_id: { type: "integer" },
            customer_invoice_number: { type: "string" },
            source_order_line_id: { type: "integer" },
            description: { type: "string" }
          }
        }
      },
      retention_codes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            base_amount: { type: "number", minimum: 0 },
            percent: { type: "number", minimum: 0 },
            amount: { type: "number", minimum: 0 }
          }
        }
      }
    }
  }
};

const simulateInvoiceSchema = {
  body: { ...createInvoiceSchema.body }
};

module.exports = { createInvoiceSchema, simulateInvoiceSchema };
