const invoiceSchema = {
  body: {
    type: "object",
    properties: {
      location_id: { type: "integer" },
      due_date: { type: "string" },
      notes: { type: "string" },
      invoice_lines: {
        type: "array",
        items: {
          type: "object",
          required: ["line_id", "qty"],
          properties: {
            line_id: { type: "integer" },
            qty: { type: "number", exclusiveMinimum: 0 }
          }
        }
      }
    }
  }
};

module.exports = { invoiceSchema };

