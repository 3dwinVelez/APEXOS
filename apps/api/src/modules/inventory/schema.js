const createItemSchema = {
  body: {
    type: "object",
    required: ["name", "type", "unit", "family_code", "society_code", "branch_code"],
    properties: {
      code: { type: "string", minLength: 1 },
      legacy_code: { type: "string" },
      name: { type: "string", minLength: 1 },
      type: { type: "string" },
      unit: { type: "string" },
      category_id: { type: "integer" },
      family_code: { type: "string", minLength: 1 },
      society_code: { type: "string", minLength: 1 },
      branch_code: { type: "string", minLength: 1 },
      costing_method: { type: "string", enum: ["weighted_average"] },
      unit_cost: { type: "number" },
      unit_price: { type: "number" },
      tax_rate: { type: "number" },
      stock_min: { type: "number" },
      stock_max: { type: "number" },
      weight_kg: { type: "number" },
      volume_m3: { type: "number" },
      metadata: { type: "object", additionalProperties: true }
    }
  }
};

const familySchema = {
  body: {
    type: "object",
    required: ["code", "name", "society_code", "branch_code", "code_start", "code_end", "accounting"],
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      society_code: { type: "string", minLength: 1 },
      branch_code: { type: "string", minLength: 1 },
      code_start: { type: "string", minLength: 1 },
      code_end: { type: "string", minLength: 1 },
      active: { type: "boolean" },
      accounting: {
        type: "object",
        required: ["goods_receipt_account_code", "gr_ir_account_code", "sales_cost_account_code", "sales_revenue_account_code", "return_revenue_account_code", "manual_in_account_code", "manual_out_account_code"],
        properties: {
          goods_receipt_account_code: { type: "string", minLength: 1 },
          gr_ir_account_code: { type: "string", minLength: 1 },
          sales_cost_account_code: { type: "string", minLength: 1 },
          sales_revenue_account_code: { type: "string", minLength: 1 },
          return_revenue_account_code: { type: "string", minLength: 1 },
          manual_in_account_code: { type: "string", minLength: 1 },
          manual_out_account_code: { type: "string", minLength: 1 },
          active: { type: "boolean" }
        }
      }
    }
  }
};

const warehouseSchema = {
  body: {
    type: "object",
    required: ["code", "name", "society_code", "branch_code", "cost_center_code", "warehouse_type"],
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      address: { type: "string" },
      city: { type: "string" },
      country: { type: "string" },
      society_code: { type: "string", minLength: 1 },
      branch_code: { type: "string", minLength: 1 },
      cost_center_code: { type: "string", minLength: 1 },
      warehouse_type: { type: "string", enum: ["owned", "consignment"] },
      consignment_customer_id: { type: "integer" },
      active: { type: "boolean" },
      metadata: { type: "object", additionalProperties: true }
    }
  }
};

const moveStockSchema = {
  body: {
    type: "object",
    required: ["item_id", "type", "qty"],
    properties: {
      item_id: { type: "integer" },
      type: { type: "string", enum: ["in", "out", "adjustment", "transfer"] },
      qty: { type: "number", exclusiveMinimum: 0 },
      from_location: { type: "integer" },
      to_location: { type: "integer" },
      cost: { type: "number" },
      lot: { type: "string" },
      reason: { type: "string" }
    }
  }
};

const updateItemSchema = {
  params: { type: "object", required: ["id"], properties: { id: { type: "integer" } } },
  body: { type: "object", additionalProperties: true }
};

const adjustStockSchema = {
  body: {
    type: "object",
    required: ["item_id", "new_stock"],
    properties: {
      item_id: { type: "integer" },
      new_stock: { type: "number", minimum: 0 },
      location_id: { type: "integer" },
      reason: { type: "string" }
    }
  }
};

const inventoryAdjustmentSchema = {
  body: {
    type: "object", additionalProperties: false,
    required: ["document_type", "warehouse_id", "posting_date", "reason", "lines"],
    properties: {
      document_type: { type: "string", enum: ["AE", "AS"] }, warehouse_id: { type: "integer" }, posting_date: { type: "string", minLength: 10 }, reason: { type: "string", minLength: 1 }, idempotency_key: { type: "string", minLength: 1 },
      lines: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["item_id", "qty"], properties: { item_id: { type: "integer" }, qty: { type: "number", exclusiveMinimum: 0 }, unit_cost: { type: "number", exclusiveMinimum: 0 } } } }
    }
  }
};

const warehouseTransferSchema = {
  body: {
    type: "object",
    required: ["origin_place_id", "destination_place_id", "lines"],
    properties: {
      origin_place_id: { type: "integer" },
      destination_place_id: { type: "integer" },
      reason: { type: "string" },
      correlation_id: { type: "string" },
      idempotency_key: { type: "string" },
      lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["item_id", "qty"],
          properties: {
            item_id: { type: "integer" },
            qty: { type: "number", exclusiveMinimum: 0 },
            lot: { type: "string" }
          }
        }
      }
    }
  }
};

const classificationMasterSchema = { body: { type: "object", required: ["type", "name"], properties: { type: { type: "string", enum: ["category", "subcategory", "line", "subline", "brand", "reference"] }, name: { type: "string", minLength: 1 }, parent_id: { type: ["integer", "null"] } } } };
const salesPriceBulkSchema = { body: { type: "object", additionalProperties: false, required: ["prices"], properties: { prices: { type: "array", minItems: 1, maxItems: 5000, items: { type: "object", additionalProperties: false, required: ["sku", "price"], properties: { sku: { type: "string", minLength: 1 }, price: { type: "number", minimum: 0 } } } } } } };

module.exports = { createItemSchema, moveStockSchema, updateItemSchema, adjustStockSchema, inventoryAdjustmentSchema, familySchema, warehouseSchema, warehouseTransferSchema, classificationMasterSchema, salesPriceBulkSchema };
