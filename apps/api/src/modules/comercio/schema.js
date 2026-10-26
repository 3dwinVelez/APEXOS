// Esquemas Fastify (JSON Schema nativo, AJV) del modulo Comercio.
// additionalProperties: false -> el cliente envia unicamente el subconjunto escribible.
// Campos calculados por el servidor (code, stock en edicion, numeros, totales, costos,
// status) se rechazan en el body.
// Leccion de caja menor: params y body son esquemas separados; mezclarlos provoca
// FST_ERR_CTP_EMPTY_JSON_BODY. Las rutas de accion sin cuerpo (activate/deactivate/void)
// declaran solo params.

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
  additionalProperties: false
};

const businessDate = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", minLength: 10, maxLength: 10 };

const productBody = {
  type: "object",
  required: ["name", "price", "cost"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    category: { type: ["string", "null"], maxLength: 80 },
    unit: { type: "string", maxLength: 20 },
    price: { type: "number", minimum: 0 },
    cost: { type: "number", minimum: 0 },
    stock: { type: "integer", minimum: 0 },
    min_stock: { type: "integer", minimum: 0 },
    notes: { type: ["string", "null"], maxLength: 500 }
  }
};

const productUpdateBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    category: { type: ["string", "null"], maxLength: 80 },
    unit: { type: "string", maxLength: 20 },
    price: { type: "number", minimum: 0 },
    cost: { type: "number", minimum: 0 },
    min_stock: { type: "integer", minimum: 0 },
    active: { type: "boolean" },
    notes: { type: ["string", "null"], maxLength: 500 }
  }
};

const stockAdjustBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    new_stock: { type: ["integer", "null"], minimum: 0 },
    change: { type: ["integer", "null"] },
    reason: { type: ["string", "null"], maxLength: 60 }
  }
};

const customerBody = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    document: { type: ["string", "null"], maxLength: 30 },
    phone: { type: ["string", "null"], maxLength: 30 },
    email: { type: ["string", "null"], maxLength: 160 },
    address: { type: ["string", "null"], maxLength: 300 },
    notes: { type: ["string", "null"], maxLength: 500 }
  }
};

const customerUpdateBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    document: { type: ["string", "null"], maxLength: 30 },
    phone: { type: ["string", "null"], maxLength: 30 },
    email: { type: ["string", "null"], maxLength: 160 },
    address: { type: ["string", "null"], maxLength: 300 },
    active: { type: "boolean" },
    notes: { type: ["string", "null"], maxLength: 500 }
  }
};

const saleItemBody = {
  type: "object",
  required: ["product_id", "quantity"],
  additionalProperties: false,
  properties: {
    product_id: { type: "integer", minimum: 1 },
    quantity: { type: "integer", minimum: 1 }
  }
};

const saleCreditBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    down_payment: { type: "number", minimum: 0 },
    installment_count: { type: "integer", minimum: 1, maximum: 60 },
    frequency: { type: "string", enum: ["weekly", "biweekly", "monthly"] },
    first_due_date: businessDate
  }
};

const saleBody = {
  type: "object",
  required: ["items", "payment_type"],
  additionalProperties: false,
  properties: {
    items: { type: "array", minItems: 1, maxItems: 200, items: saleItemBody },
    customer_id: { type: ["integer", "null"], minimum: 1 },
    discount: { type: "number", minimum: 0 },
    payment_type: { type: "string", enum: ["cash", "credit"] },
    method: { type: ["string", "null"], maxLength: 60 },
    note: { type: ["string", "null"], maxLength: 500 },
    date: businessDate,
    credit: { type: ["object", "null"], additionalProperties: false, properties: saleCreditBody.properties }
  }
};

const voidBody = {
  type: "object",
  additionalProperties: false,
  properties: { reason: { type: ["string", "null"], maxLength: 300 } }
};

const paymentBody = {
  type: "object",
  required: ["amount"],
  additionalProperties: false,
  properties: {
    amount: { type: "number", minimum: 0.01 },
    date: businessDate,
    method: { type: ["string", "null"], maxLength: 60 },
    note: { type: ["string", "null"], maxLength: 500 }
  }
};

const purchaseBody = {
  type: "object",
  required: ["product_id", "supplier", "quantity", "unit_cost"],
  additionalProperties: false,
  properties: {
    product_id: { type: "integer", minimum: 1 },
    supplier: { type: "string", minLength: 1, maxLength: 160 },
    quantity: { type: "integer", minimum: 1 },
    unit_cost: { type: "number", minimum: 0 },
    date: businessDate,
    note: { type: ["string", "null"], maxLength: 500 }
  }
};

const expenseBody = {
  type: "object",
  required: ["concept", "amount"],
  additionalProperties: false,
  properties: {
    concept: { type: "string", minLength: 1, maxLength: 160 },
    category: { type: ["string", "null"], maxLength: 80 },
    amount: { type: "number", minimum: 0 },
    method: { type: ["string", "null"], maxLength: 60 },
    note: { type: ["string", "null"], maxLength: 500 },
    date: businessDate
  }
};

const expenseUpdateBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    concept: { type: "string", minLength: 1, maxLength: 160 },
    category: { type: ["string", "null"], maxLength: 80 },
    amount: { type: "number", minimum: 0 },
    method: { type: ["string", "null"], maxLength: 60 },
    note: { type: ["string", "null"], maxLength: 500 },
    date: businessDate
  }
};

const settingsBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    store_name: { type: "string", minLength: 1, maxLength: 120 },
    currency: { type: "string", minLength: 1, maxLength: 8 },
    receipt_note: { type: ["string", "null"], maxLength: 300 },
    preferences: { type: ["object", "null"] }
  }
};

module.exports = {
  idParams,
  idParamSchema: { params: idParams },
  productCreateSchema: { body: productBody },
  productUpdateSchema: { params: idParams, body: productUpdateBody },
  stockAdjustSchema: { params: idParams, body: stockAdjustBody },
  customerCreateSchema: { body: customerBody },
  customerUpdateSchema: { params: idParams, body: customerUpdateBody },
  saleCreateSchema: { body: saleBody },
  voidSchema: { params: idParams, body: voidBody },
  paymentSchema: { params: idParams, body: paymentBody },
  purchaseCreateSchema: { body: purchaseBody },
  expenseCreateSchema: { body: expenseBody },
  expenseUpdateSchema: { params: idParams, body: expenseUpdateBody },
  settingsSchema: { body: settingsBody }
};
