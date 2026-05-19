const vehicleSchema = {
  body: {
    type: "object",
    required: ["plate", "type", "brand", "ownership_type", "base_site"],
    properties: {
      plate: { type: "string" },
      type: { type: "string" },
      category: { type: "string" },
      brand: { type: "string" },
      line: { type: "string" },
      model: { type: "string" },
      year: { type: "integer" },
      color: { type: "string" },
      vin_chassis: { type: "string" },
      serial_number: { type: "string" },
      engine_number: { type: "string" },
      engine_displacement: { type: "string" },
      cylinder_capacity: { type: "string" },
      fuel: { type: "string" },
      body_type: { type: "string" },
      axle_count: { type: "integer" },
      load_capacity: { type: "string" },
      capacity_value: { type: "number" },
      capacity_unit: { type: "string" },
      volume_available: { type: "number" },
      mileage: { type: "integer" },
      ownership_type: { type: "string" },
      owner: { type: "string" },
      legal_owner: { type: "string" },
      owner_document: { type: "string" },
      linked_company: { type: "string" },
      cost_center: { type: "string" },
      base_site: { type: "string" },
      authorized_driver_id: { type: "integer" },
      authorized_driver_name: { type: "string" },
      authorized_driver_document: { type: "string" },
      authorized_driver_code: { type: "string" },
      linked_at: { type: "string" },
      unlinked_at: { type: "string" },
      status: { type: "string" },
      soat_issued_at: { type: "string" },
      soat_expires: { type: "string" },
      technical_review_issued_at: { type: "string" },
      technical_review_expires: { type: "string" },
      property_card: { type: "string" },
      contractual_policy_expires: { type: "string" },
      extra_contractual_policy_expires: { type: "string" },
      cargo_registry: { type: "string" },
      special_permits: { type: "string" },
      normative_restrictions: { type: "string" },
      insurance_expires: { type: "string" },
      legal_notes: { type: "string" },
      notes: { type: "string" },
      reason: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const vehicleDocumentSchema = {
  body: {
    type: "object",
    required: ["document_type", "file_name"],
    properties: {
      document_type: { type: "string" },
      file_name: { type: "string" },
      file_url: { type: "string" },
      storage_path: { type: "string" },
      base64_data: { type: "string" },
      mime_type: { type: "string" },
      file_size: { type: "integer" },
      issued_at: { type: "string" },
      expires_at: { type: "string" },
      document_status: { type: "string" },
      observations: { type: "string" },
      active: { type: "boolean" },
      reason: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const vehicleDocumentUpdateSchema = {
  body: {
    type: "object",
    properties: vehicleDocumentSchema.body.properties
  }
};

module.exports = { vehicleSchema, vehicleDocumentSchema, vehicleDocumentUpdateSchema };
