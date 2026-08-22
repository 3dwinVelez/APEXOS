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
    required: ["supplier_id", "warehouse_id", "lines"],
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

const purchaseInvoiceSchema = {
  body: {
    type: "object",
    required: ["document_kind", "with_purchase_order", "posting_date", "due_term", "supplier_reference", "header_text", "supplier_id", "society_code", "branch_code", "cost_center_code", "associated_account_code", "lines"],
    properties: {
      document_kind: { type: "string", enum: ["invoice", "credit_note"] },
      with_purchase_order: { type: "boolean" },
      purchase_order_id: { type: "integer" },
      purchase_order_reference: { type: "string" },
      referenced_invoice_id: { type: "integer" },
      invoice_reference: { type: "string" },
      location_id: { type: "integer" },
      posting_date: { type: "string", minLength: 1 },
      due_term: { type: "string" },
      due_date: { type: "string" },
      supplier_reference: { type: "string", minLength: 1 },
      header_text: { type: "string", minLength: 1 },
      supplier_id: { type: "integer" },
      society_code: { type: "string", minLength: 1 },
      branch_code: { type: "string", minLength: 1 },
      cost_center_code: { type: "string", minLength: 1 },
      associated_account_code: { type: "string", minLength: 1 },
      lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["item_id", "qty", "unit_cost", "vat_code"],
          properties: {
            purchase_order_line_id: { type: "integer" },
            item_id: { type: "integer" },
            qty: { type: "number", exclusiveMinimum: 0 },
            unit_cost: { type: "number", minimum: 0 },
            vat_code: { type: "string", minLength: 1 },
            description: { type: "string" }
          }
        }
      }
    }
  }
};

module.exports = { supplierSchema, updateSupplierSchema, purchaseOrderSchema, purchaseInvoiceSchema };

