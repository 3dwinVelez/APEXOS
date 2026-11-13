// Esquemas Fastify de Gastos Menores / Cajas Menores (T2: maestros; T3: anticipos y comprobantes).
// additionalProperties: false -> el cliente debe enviar unicamente el subconjunto escribible.
// Campos de solo lectura (id, tenant_id, account_id, created_by, created_at, updated_at,
// ready_for_advances, warnings) se rechazan en el body. En T3 tambien se rechazan status,
// balance, applied_total, full_number, accounting_document_id y period: los calcula el servidor.

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
  additionalProperties: false
};

const conceptBody = {
  type: "object",
  required: ["code", "name", "account_code"],
  additionalProperties: false,
  properties: {
    code: { type: "string", minLength: 1, maxLength: 30 },
    name: { type: "string", minLength: 1, maxLength: 120 },
    // Cuenta de gasto (type "expense") del plan de cuentas del tenant.
    account_code: { type: "string", minLength: 1, maxLength: 30 },
    // Cuenta de anticipo especifica del concepto (opcional); si va, debe ser activo 13xx.
    advance_account_code: { type: ["string", "null"], maxLength: 30 },
    // null = "sin IVA sugerido" (no "IVA 0%"): debe existir y estar activo en el maestro de compras.
    default_vat_code: { type: ["string", "null"], maxLength: 30 },
    requires_supplier: { type: "boolean" },
    requires_invoice_reference: { type: "boolean" },
    active: { type: "boolean" },
    notes: { type: ["string", "null"], maxLength: 500 }
  }
};

const boxBody = {
  type: "object",
  required: ["code", "name", "account_code", "advance_account_code"],
  additionalProperties: false,
  properties: {
    code: { type: "string", minLength: 1, maxLength: 30 },
    name: { type: "string", minLength: 1, maxLength: 120 },
    // Caja: activo que inicia por "11" (PUC 1105 Caja).
    account_code: { type: "string", minLength: 1, maxLength: 30 },
    // Cuenta deudora del anticipo al custodio: activo que inicia por "13" (PUC de referencia 1330).
    // Obligatoria y explicita: no se siembra ni se asume por defecto.
    advance_account_code: { type: "string", minLength: 1, maxLength: 30 },
    // Tercero activo con rol proveedor o empleado. Sin custodio la caja no puede girar anticipos.
    custodian_party_id: { type: ["integer", "null"], minimum: 1 },
    branch_code: { type: ["string", "null"], maxLength: 30 },
    cost_center_code: { type: ["string", "null"], maxLength: 30 },
    // minimum: 0 para que el 0 llegue al servicio y produzca BOX_LIMIT_INVALID (no un 400 generico).
    monthly_limit: { type: ["number", "null"], minimum: 0 },
    require_advance: { type: "boolean" },
    block_unliquidated_advance: { type: "boolean" },
    active: { type: "boolean" },
    notes: { type: ["string", "null"], maxLength: 500 }
  }
};

const conceptCreateSchema = { body: conceptBody };
const conceptUpdateSchema = { body: conceptBody, params: idParams };
const boxCreateSchema = { body: boxBody };
const boxUpdateSchema = { body: boxBody, params: idParams };
// activate/deactivate no declaran body: evita FST_ERR_CTP_EMPTY_JSON_BODY en el cliente.
const idParamSchema = { params: idParams };

// === T3: anticipos y comprobantes de gasto ===

// Fecha de documento: solo AAAA-MM-DD. El servicio la parsea a medianoche UTC para que
// accounting.periodFromDate (toISOString) no corra el periodo en servidores con zona positiva.
const documentDate = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", minLength: 10, maxLength: 10 };

const advanceBody = {
  type: "object",
  required: ["box_id", "date", "amount"],
  additionalProperties: false,
  properties: {
    box_id: { type: "integer", minimum: 1 },
    date: documentDate,
    // minimum: 0 para que el 0 llegue al servicio y produzca ADVANCE_AMOUNT_INVALID (400),
    // igual que el precedente monthly_limit de boxBody.
    amount: { type: "number", minimum: 0 },
    // Opcional: si no va, se usa el custodio de la caja.
    custodian_party_id: { type: ["integer", "null"], minimum: 1 },
    description: { type: ["string", "null"], maxLength: 500 }
  }
};

// Todas las propiedades son opcionales: reintegro por defecto = saldo del anticipo.
// El cliente debe enviar al menos "{}" (ruta con body declarado).
const liquidateBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    date: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$", minLength: 10, maxLength: 10 },
    refund_amount: { type: ["number", "null"], minimum: 0 },
    shortfall_amount: { type: ["number", "null"], minimum: 0 },
    shortfall_concept_code: { type: ["string", "null"], maxLength: 30 }
  }
};

const voucherLineBody = {
  type: "object",
  required: ["description", "base_amount"],
  additionalProperties: false,
  properties: {
    // concept_code o concept_id (uno de los dos); si no va ninguno el servicio responde
    // 400 CONCEPT_NOT_FOUND con la posicion de la linea.
    concept_code: { type: ["string", "null"], maxLength: 30 },
    concept_id: { type: ["integer", "null"], minimum: 1 },
    description: { type: "string", minLength: 1, maxLength: 300 },
    base_amount: { type: "number", minimum: 0 },
    // IVA por linea: null/ausente = gasto SIN IVA. default_vat_code del concepto es solo una
    // sugerencia para la UI y nunca se aplica automaticamente.
    vat_code: { type: ["string", "null"], maxLength: 30 },
    // Aceptados pero IGNORADOS: el servidor recalcula vat_amount y total desde base_amount y el
    // maestro de IVA. Se declaran para que additionalProperties: false no los rechace.
    vat_amount: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    cost_center_code: { type: ["string", "null"], maxLength: 30 },
    branch_code: { type: ["string", "null"], maxLength: 30 },
    supplier_party_id: { type: ["integer", "null"], minimum: 1 },
    invoice_reference: { type: ["string", "null"], maxLength: 100 }
  }
};

const voucherBody = {
  type: "object",
  required: ["box_id", "date", "lines"],
  additionalProperties: false,
  properties: {
    box_id: { type: "integer", minimum: 1 },
    date: documentDate,
    // Opcional: si la caja tiene require_advance = true y no va, el servicio responde
    // 422 ADVANCE_REQUIRED.
    advance_id: { type: ["integer", "null"], minimum: 1 },
    description: { type: ["string", "null"], maxLength: 500 },
    lines: { type: "array", minItems: 1, maxItems: 100, items: voucherLineBody }
  }
};

const advanceCreateSchema = { body: advanceBody };
// params y body son esquemas separados: mezclarlos provoca FST_ERR_CTP_EMPTY_JSON_BODY.
const liquidateSchema = { params: idParams, body: liquidateBody };
const voucherCreateSchema = { body: voucherBody };

module.exports = {
  idParams,
  conceptBody,
  boxBody,
  conceptCreateSchema,
  conceptUpdateSchema,
  boxCreateSchema,
  boxUpdateSchema,
  idParamSchema,
  documentDate,
  advanceBody,
  liquidateBody,
  voucherLineBody,
  voucherBody,
  advanceCreateSchema,
  liquidateSchema,
  voucherCreateSchema
};
