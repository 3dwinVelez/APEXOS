const vehicleSchema = {
  body: {
    type: "object",
    required: ["plate"],
    properties: {
      plate: { type: "string" },
      model: { type: "string" },
      type: { type: "string" },
      brand: { type: "string" },
      year: { type: "integer" },
      color: { type: "string" },
      engine_displacement: { type: "string" },
      load_capacity: { type: "string" },
      fuel: { type: "string" },
      mileage: { type: "integer" },
      serial_number: { type: "string" },
      engine_number: { type: "string" },
      soat_expires: { type: "string" },
      technical_review_expires: { type: "string" },
      insurance_expires: { type: "string" },
      owner: { type: "string" },
      notes: { type: "string" },
      status: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

module.exports = { vehicleSchema };
