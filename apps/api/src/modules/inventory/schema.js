const createItemSchema = {
  body: {
    type: "object",
    required: ["code", "name", "type", "unit", "unit_cost", "unit_price"],
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      type: { type: "string" },
      unit: { type: "string" },
      category_id: { type: "integer" },
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

module.exports = { createItemSchema, moveStockSchema, updateItemSchema, adjustStockSchema };
