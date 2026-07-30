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
      metadata: { type: "object" }
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
      file_url: { type: "string" },
      base64_data: { type: "string" },
      size_bytes: { type: "integer" },
      mime_type: { type: "string" },
      file_name: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

module.exports = { orderSchema, orderUpdateSchema, referenceSchema, referenceBulkImportSchema, serviceTypesSchema, serviceStoresSchema, satisfactionQuestionsSchema, startSchema, inspectionSchema, closeSchema, incidentSchema, photoSchema };
