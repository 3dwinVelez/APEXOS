const periodProp = { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" };

const budgetsUpdateSchema = {
  body: {
    type: "object",
    required: ["period", "rows"],
    additionalProperties: false,
    properties: {
      period: periodProp,
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 2000,
        items: {
          type: "object",
          required: ["vehicle_id", "concept_code", "amount"],
          additionalProperties: false,
          properties: {
            vehicle_id: { type: "integer", minimum: 1 },
            concept_code: { type: "string", minLength: 1, maxLength: 80 },
            amount: { type: "number", minimum: 0 }
          }
        }
      }
    }
  }
};

const mappingUpdateSchema = {
  body: {
    type: "object",
    required: ["rows"],
    additionalProperties: false,
    properties: {
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        items: {
          type: "object",
          required: ["source_code", "pyg_concept_code"],
          additionalProperties: false,
          properties: {
            source_type: { type: "string", enum: ["petty_cash_concept"] },
            source_code: { type: "string", minLength: 1, maxLength: 80 },
            pyg_concept_code: { type: "string", maxLength: 80 },
            active: { type: "boolean" }
          }
        }
      }
    }
  }
};

const configUpdateSchema = {
  body: {
    type: "object",
    required: ["tax_percent"],
    additionalProperties: false,
    properties: {
      tax_percent: { type: "number", minimum: 0, maximum: 100 }
    }
  }
};

const accountRangeSchema = {
  type: "object",
  required: ["start", "end"],
  additionalProperties: false,
  properties: {
    start: { type: "string", pattern: "^\\d+$", minLength: 1, maxLength: 20 },
    end: { type: "string", pattern: "^\\d+$", minLength: 1, maxLength: 20 }
  }
};

const accountConceptSchema = {
  type: "object",
  required: ["code", "name", "section", "kind", "order"],
  additionalProperties: false,
  properties: {
    code: { type: "string", pattern: "^[A-Za-z0-9_]{1,60}$" },
    name: { type: "string", minLength: 1, maxLength: 120 },
    section: { type: "string", enum: ["ingresos", "gastos_operativos", "no_operativos", "impuestos", "resultados", "informativa"] },
    kind: { type: "string", enum: ["income", "expense", "subtotal_ingresos", "subtotal_gastos_operativos", "subtotal_utilidad_operacional", "subtotal_antes_de_impuestos", "subtotal_utilidad_neta", "tax", "informational"] },
    order: { type: "integer", minimum: 1 },
    ranges: { type: "array", maxItems: 100, items: accountRangeSchema },
    exclusions: { type: "array", maxItems: 100, items: accountRangeSchema }
  }
};

// La validacion exhaustiva (rangos coherentes, exclusiones dentro de rangos,
// solapes efectivos, subtotales protegidos) la hace el servicio; este esquema
// solo fija la forma del cuerpo.
const accountConfigurationUpdateSchema = {
  body: {
    type: "object",
    required: ["source"],
    additionalProperties: false,
    properties: {
      source: { type: "string", enum: ["accounting"] },
      concepts: { type: "array", maxItems: 100, items: accountConceptSchema }
    }
  }
};

module.exports = { budgetsUpdateSchema, mappingUpdateSchema, configUpdateSchema, accountConfigurationUpdateSchema };
