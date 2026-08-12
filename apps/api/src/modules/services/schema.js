const orderSchema = {
  body: {
    type: "object",
    required: ["reference_id", "technician_id", "service_type", "customer_name", "customer_document", "customer_address", "customer_phone", "scheduled_date", "notes"],
    properties: {
      reference_item_id: { type: "integer" },
      number: { type: "string" },
      reference_id: { type: "integer" },
      technician_id: { type: "integer" },
      service_type: { type: "string" },
      status: { type: "string" },
      customer_name: { type: "string" },
      customer_document: { type: "string" },
      customer_address: { type: "string" },
      customer_phone: { type: "string" },
      invoice_number: { type: "string" },
      scheduled_date: { type: "string" },
      cedi_delivery_date: { type: "string" },
      notes: { type: "string" },
      metadata: { type: "object" },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          required: ["reference_id", "service_type", "quantity"],
          properties: {
            reference_id: { type: "integer" },
            service_type: { type: "string" },
            quantity: { type: "number", exclusiveMinimum: 0 },
            description: { type: "string" },
            observation: { type: "string" },
            idempotency_key: { type: "string" }
          }
        }
      }
    }
  }
};

const orderUpdateSchema = {
  body: {
    type: "object",
    properties: orderSchema.body.properties
  }
};

const referenceSchema = {
  body: {
    type: "object",
    required: ["code", "name"],
    properties: {
      code: { type: "string" },
      name: { type: "string" },
      category: { type: "string" },
      description: { type: "string" },
      item_id: { type: "integer" },
      estimated_minutes: { type: "integer" },
      brand: { type: "string" },
      model: { type: "string" },
      active: { type: "boolean" },
      manuals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            file_name: { type: "string" },
            mime_type: { type: "string" },
            size_bytes: { type: "integer" },
            file_url: { type: "string" },
            base64_data: { type: "string" },
            notes: { type: "string" }
          }
        }
      },
      parts: {
        type: "array",
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            description: { type: "string" },
            display_order: { type: "integer" }
          }
        }
      },
      metadata: { type: "object" }
    }
  }
};

const serviceTypesSchema = {
  body: {
    type: "object",
    required: ["types"],
    properties: {
      types: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["code", "label"],
          properties: {
            code: { type: "string" },
            label: { type: "string" },
            active: { type: "boolean" }
          }
        }
      }
    }
  }
};

const serviceStoresSchema = {
  body: {
    type: "object",
    required: ["stores"],
    properties: {
      stores: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["code", "label"],
          properties: {
            code: { type: "string" },
            label: { type: "string" },
            active: { type: "boolean" }
          }
        }
      }
    }
  }
};

const satisfactionQuestionsSchema = {
  body: {
    type: "object",
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["id", "label"],
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            active: { type: "boolean" }
          }
        }
      }
    }
  }
};

const referenceBulkImportSchema = {
  body: {
    type: "object",
    required: ["rows"],
    properties: {
      rows: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["code", "name"],
          properties: {
            code: { type: "string" },
            name: { type: "string" },
            category: { type: "string" },
            description: { type: "string" },
            estimated_minutes: { type: "integer" },
            brand: { type: "string" },
            model: { type: "string" },
            active: { type: "boolean" },
            part_name: { type: "string" },
            part_quantity: { type: "number" },
            part_unit: { type: "string" },
            part_description: { type: "string" },
            manual_title: { type: "string" },
            manual_url: { type: "string" },
            manual_notes: { type: "string" }
          }
        }
      }
    }
  }
};

const startSchema = {
  body: {
    type: "object",
    properties: {
      latitude: { type: "number" },
      longitude: { type: "number" },
      accuracy_meters: { type: "number" },
      metadata: { type: "object" }
    }
  }
};

const inspectionSchema = {
    body: {
      type: "object",
      properties: {
        item_id: { type: "integer" },
      decision: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["part_id", "name", "status"],
          properties: {
            part_id: { type: "integer" },
            name: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            status: { type: "string" },
            comment: { type: "string" },
            action: { type: "string" },
            supplier_name: { type: "string" }
          }
        }
      },
      metadata: { type: "object" }
    }
  }
};

const closeSchema = {
  body: {
    type: "object",
    properties: {
      latitude: { type: "number" },
      longitude: { type: "number" },
      accuracy_meters: { type: "number" },
      no_execution_reason: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const incidentSchema = {
  body: {
    type: "object",
    required: ["description"],
    properties: {
      description: { type: "string" },
      type: { type: "string" },
      item_id: { type: "integer" },
      action: { type: "string" },
      photo_url: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const photoSchema = {
  body: {
    type: "object",
    required: ["type"],
    properties: {
      type: { type: "string" },
      item_id: { type: "integer" },
      file_url: { type: "string" },
      base64_data: { type: "string" },
      size_bytes: { type: "integer" },
      mime_type: { type: "string" },
      file_name: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const evidenceAuthorizationSchema = {
  body: {
    type: "object",
    required: ["mime_type", "size_bytes", "purpose", "client_upload_id"],
    additionalProperties: false,
    properties: {
      mime_type: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
      size_bytes: { type: "integer", minimum: 1, maximum: 2097152 },
      purpose: { type: "string", minLength: 1, maxLength: 64, pattern: "^[a-z0-9_-]+$" },
      client_upload_id: { type: "string", minLength: 1, maxLength: 128 }
    }
  }
};

const orderItemUpdateSchema = {
  body: {
    type: "object",
    properties: orderSchema.body.properties.items.items.properties
  }
};

const orderItemStatusSchema = {
  body: {
    type: "object",
    required: ["status", "expected_version"],
    properties: {
      status: { type: "string", enum: ["pendiente", "en_curso", "inspeccion", "ejecucion", "completada", "no_ejecutada", "bloqueada"] },
      expected_version: { type: "integer" }
    }
  }
};

const correctionChangeProperties = {
  type: { type: "string", enum: ["FIELD_UPDATED", "EVIDENCE_ADDED", "EVIDENCE_REMOVED", "STATUS_CHANGED", "ORDER_REOPENED", "ORDER_FORCE_CLOSED", "OBSERVATION_ADDED", "PIECE_ISSUE_ADDED"] },
  field: { type: "string", maxLength: 64 },
  value: {},
  evidence_id: { type: "integer" },
  observation: { type: "string", maxLength: 4000 },
  pending_requirements: { type: "array", maxItems: 100, items: { type: "string", maxLength: 240 } }
};

const correctionReasonProperties = {
  reason_code: { type: "string", enum: ["INCOMPLETE_INFORMATION", "DATA_ENTRY_ERROR", "MISSING_EVIDENCE", "INCORRECT_EVIDENCE", "INCORRECT_STATUS", "INCOMPLETE_CLOSURE", "CUSTOMER_REQUEST", "BILLING_CORRECTION", "OTHER"] },
  description: { type: "string", minLength: 12, maxLength: 4000 },
  confirmed: { type: "boolean", const: true },
  expected_version: { type: "integer", minimum: 1 },
  idempotency_key: { type: "string", minLength: 8, maxLength: 128 }
};

const correctionSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["reason_code", "description", "confirmed", "expected_version", "changes"],
    properties: {
      ...correctionReasonProperties,
      changes: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", additionalProperties: false, required: ["type"], properties: correctionChangeProperties } }
    }
  }
};

const correctionActionSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["reason_code", "description", "confirmed", "expected_version"],
    properties: correctionReasonProperties
  }
};

const forceCloseSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["reason_code", "description", "confirmed", "expected_version", "observation", "pending_requirements", "evidence_reviewed"],
    properties: {
      ...correctionReasonProperties,
      observation: { type: "string", minLength: 8, maxLength: 4000 },
      pending_requirements: { type: "array", maxItems: 100, items: { type: "string", maxLength: 240 } },
      evidence_reviewed: { type: "boolean", const: true }
    }
  }
};

const correctionRejectSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["rejection_reason"],
    properties: { rejection_reason: { type: "string", minLength: 8, maxLength: 2000 } }
  }
};

const correctionEvidenceSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["authorization_id", "type"],
    properties: {
      authorization_id: { type: "string", minLength: 8, maxLength: 128 },
      type: { type: "string", minLength: 1, maxLength: 64, pattern: "^[a-z0-9_-]+$" },
      metadata: {
        type: "object",
        additionalProperties: false,
        properties: {
          part_id: { type: "integer" },
          part_name: { type: "string", minLength: 2, maxLength: 240 }
        }
      }
    }
  }
};

const executionSchema = {
  schema: {
    body: {
      type: "object",
      properties: { item_id: { type: "integer" } }
    }
  }
};

module.exports = { orderSchema, orderUpdateSchema, orderItemUpdateSchema, orderItemStatusSchema, referenceSchema, referenceBulkImportSchema, serviceTypesSchema, serviceStoresSchema, satisfactionQuestionsSchema, startSchema, inspectionSchema, executionSchema, closeSchema, incidentSchema, photoSchema, evidenceAuthorizationSchema, correctionSchema, correctionActionSchema, forceCloseSchema, correctionRejectSchema, correctionEvidenceSchema };
