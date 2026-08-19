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
      retentions: { type: "array", items: { type: "object", required: ["code"], properties: { code: { type: "string", minLength: 1 }, base: { type: "number", minimum: 0 }, amount: { type: "number", minimum: 0 } } } },
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

const purchaseReceiptSchema = {
  body: {
    type: "object",
    required: ["received_lines"],
    properties: {
      notes: { type: "string" },
      received_lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["line_id", "qty_received"],
          properties: {
            line_id: { type: "integer" },
            qty_received: { type: "number", exclusiveMinimum: 0 },
            location_id: { type: "integer" },
            lot: { type: "string" },
            expiry: { type: "string" }
          }
        }
      }
    }
  }
};

const purchaseReturnSchema = {
  body: {
    type: "object",
    required: ["returned_lines"],
    properties: {
      reason: { type: "string" },
      returned_lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["line_id", "qty_returned", "location_id"],
          properties: {
            line_id: { type: "integer" },
            qty_returned: { type: "number", exclusiveMinimum: 0 },
            location_id: { type: "integer" }
          }
        }
      }
    }
  }
};
const annulInvoiceSchema = { body: { type: "object", properties: { reason: { type: "string" } } } };
const closePurchaseOrderSchema = {
  body: {
    type: "object",
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 3, maxLength: 500 } }
  }
};

const purchaseImportSchema = { body: { type: "object", required: ["purchase_order_id"], properties: { purchase_order_id: { type: "integer" } } } };
const importCostSchema = { body: { type: "object", required: ["concept", "supplier_id", "classification", "estimated_amount", "account_code", "clearing_account_code"], properties: { concept: { type: "string", minLength: 1 }, supplier_id: { type: "integer" }, classification: { type: "string", enum: ["capitalizable", "recoverable_tax", "expense"] }, estimated_amount: { type: "number", minimum: 0 }, actual_amount: { type: "number", minimum: 0 }, account_code: { type: "string", minLength: 1 }, clearing_account_code: { type: "string", minLength: 1 } } } };
const linkImportCostInvoiceSchema = { body: { type: "object", required: ["cxp_cabdoc_id", "actual_amount"], properties: { cxp_cabdoc_id: { type: "integer" }, actual_amount: { type: "number", minimum: 0 } } } };
const adjustImportCostSchema = { body: { type: "object", required: ["posting_date"], properties: { posting_date: { type: "string", minLength: 10 } } } };

module.exports = { supplierSchema, updateSupplierSchema, purchaseOrderSchema, purchaseInvoiceSchema, purchaseReceiptSchema, purchaseReturnSchema, annulInvoiceSchema, closePurchaseOrderSchema, purchaseImportSchema, importCostSchema, linkImportCostInvoiceSchema, adjustImportCostSchema };

