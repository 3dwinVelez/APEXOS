const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

const carrierSchema = {
  body: {
    type: "object",
    required: ["code", "legal_name"],
    properties: {
      code: { type: "string", minLength: 1 }, legal_name: { type: "string", minLength: 1 }, trade_name: { type: "string" },
      tax_id: { type: "string" }, supplier_id: { type: "integer" }, phone: { type: "string" }, email: { type: "string" },
      status: { type: "string" }, service_levels: { type: "array" }, operating_zones: { type: "array" },
      vehicle_types: { type: "array" }, score: { type: "number" }, metadata: { type: "object" }
    }
  }
};

const driverSchema = {
  body: {
    type: "object",
    required: ["code", "document", "name"],
    properties: {
      code: { type: "string", minLength: 1 }, document: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 },
      phone: { type: "string" }, employee_id: { type: "integer" }, carrier_id: { type: "integer" },
      license_number: { type: "string" }, license_category: { type: "string" }, license_expires_at: { type: "string" },
      certifications: { type: "array" }, status: { type: "string" }, metadata: { type: "object" }
    }
  }
};

const deliveryPointSchema = {
  body: {
    type: "object",
    required: ["code", "name", "address", "city"],
    properties: {
      code: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, customer_party_id: { type: "integer" },
      commercial_customer_id: { type: "integer" }, address: { type: "string", minLength: 1 }, city: { type: "string", minLength: 1 },
      department: { type: "string" }, country: { type: "string" }, latitude: nullableNumber, longitude: nullableNumber,
      timezone: { type: "string" }, window_start: { type: "string" }, window_end: { type: "string" }, receiving_days: { type: "array" },
      service_minutes: { type: "integer", minimum: 0 }, access_restrictions: { type: "string" }, appointment_required: { type: "boolean" },
      geofence_radius_m: { type: "integer", minimum: 1 }, instructions: { type: "string" }, metadata: { type: "object" },
      active: { type: "boolean" }
    }
  }
};

const originSchema = {
  body: {
    type: "object",
    required: ["code", "name", "address", "city", "latitude", "longitude"],
    properties: {
      code: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, address: { type: "string", minLength: 1 },
      city: { type: "string", minLength: 1 }, department: { type: "string" }, country: { type: "string" },
      latitude: { type: "number", minimum: -90, maximum: 90 }, longitude: { type: "number", minimum: -180, maximum: 180 },
      timezone: { type: "string" }, operation_start: { type: "string" }, operation_end: { type: "string" },
      service_minutes: { type: "integer", minimum: 0 }, metadata: { type: "object" }, active: { type: "boolean" }
    }
  }
};

const rateCardSchema = {
  body: {
    type: "object",
    required: ["code", "name", "valid_from", "valid_to"],
    properties: {
      code: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, carrier_id: { type: "integer" },
      origin_id: { type: "integer" }, destination_city: { type: "string" }, destination_department: { type: "string" },
      service_level: { type: "string" }, vehicle_type: { type: "string" }, valid_from: { type: "string" }, valid_to: { type: "string" },
      currency: { type: "string" }, base_rate: { type: "number", minimum: 0 }, minimum_charge: { type: "number", minimum: 0 },
      price_per_km: { type: "number", minimum: 0 }, price_per_kg: { type: "number", minimum: 0 }, price_per_m3: { type: "number", minimum: 0 },
      price_per_stop: { type: "number", minimum: 0 }, fuel_surcharge_pct: { type: "number", minimum: 0 }, tolls_flat: { type: "number", minimum: 0 },
      priority: { type: "integer", minimum: 0 }, status: { type: "string" }, metadata: { type: "object" }, active: { type: "boolean" }
    }
  }
};

const planningSchema = {
  body: {
    type: "object",
    required: ["origin_id", "need_ids"],
    properties: {
      origin_id: { type: "integer" }, need_ids: { type: "array", minItems: 1, uniqueItems: true, items: { type: "integer" } },
      vehicle_id: { type: "integer" }, vehicle_type: { type: "string" }, service_level: { type: "string" },
      strategy: { type: "string" }, return_to_origin: { type: "boolean" }, road_factor: { type: "number", minimum: 1, maximum: 2 },
      average_speed_kmh: { type: "number", minimum: 5, maximum: 120 }
    }
  }
};

const commitPlanningSchema = {
  body: {
    ...planningSchema.body,
    required: ["code", "origin_id", "need_ids", "rate_card_id"],
    properties: {
      ...planningSchema.body.properties,
      code: { type: "string", minLength: 1 }, rate_card_id: { type: "integer" }, planned_departure: { type: "string" },
      planned_arrival: { type: "string" }, metadata: { type: "object" }
    }
  }
};

const needSchema = {
  body: {
    type: "object",
    required: ["code", "source_type", "origin_name", "delivery_point_id", "available_at", "due_at", "weight_kg", "volume_m3"],
    properties: {
      code: { type: "string", minLength: 1 }, source_type: { type: "string", minLength: 1 }, source_id: { type: "string" },
      source_reference: { type: "string" }, sales_order_id: { type: "integer" }, origin_place_id: { type: "integer" },
      origin_id: { type: "integer" }, origin_name: { type: "string", minLength: 1 }, delivery_point_id: { type: "integer" }, available_at: { type: "string" }, due_at: { type: "string" },
      priority: { type: "string" }, service_level: { type: "string" }, weight_kg: { type: "number", minimum: 0 },
      volume_m3: { type: "number", minimum: 0 }, pallets: { type: "number", minimum: 0 }, packages: { type: "integer", minimum: 0 },
      temperature_min_c: nullableNumber, temperature_max_c: nullableNumber, required_vehicle_type: { type: "string" },
      cargo_value: { type: "number", minimum: 0 }, customer_freight: { type: "number", minimum: 0 }, currency: { type: "string" },
      metadata: { type: "object" }, lines: { type: "array", items: { type: "object" } }
    }
  }
};

const tripSchema = {
  body: {
    type: "object",
    required: ["code", "origin_name", "need_ids"],
    properties: {
      code: { type: "string", minLength: 1 }, origin_place_id: { type: "integer" }, origin_id: { type: "integer" }, origin_name: { type: "string", minLength: 1 },
      need_ids: { type: "array", minItems: 1, uniqueItems: true, items: { type: "integer" } }, planned_departure: { type: "string" },
      planned_arrival: { type: "string" }, service_level: { type: "string" }, estimated_cost: { type: "number", minimum: 0 },
      currency: { type: "string" }, planned_distance_km: { type: "number", minimum: 0 }, planned_duration_minutes: { type: "integer", minimum: 0 },
      rate_card_id: { type: "integer" }, metadata: { type: "object" }
    }
  }
};

const assignmentSchema = {
  body: {
    type: "object",
    required: ["vehicle_id", "driver_id"],
    properties: {
      carrier_id: { type: "integer" }, vehicle_id: { type: "integer" }, driver_id: { type: "integer" },
      committed_cost: { type: "number", minimum: 0 }, reason: { type: "string" }
    }
  }
};

const transitionSchema = { body: { type: "object", required: ["status"], properties: { status: { type: "string" }, reason: { type: "string" }, occurred_at: { type: "string" } } } };
const eventSchema = { body: { type: "object", required: ["event_type"], properties: { event_type: { type: "string" }, stop_id: { type: "integer" }, occurred_at: { type: "string" }, source: { type: "string" }, latitude: nullableNumber, longitude: nullableNumber, device_id: { type: "string" }, observation: { type: "string" }, data: { type: "object" } } } };
const attemptSchema = { body: { type: "object", required: ["result"], properties: { result: { type: "string" }, cause_code: { type: "string" }, responsible: { type: "string" }, evidence: { type: "array" }, delivered_lines: { type: "array" }, additional_cost: { type: "number", minimum: 0 }, recoverable: { type: "boolean" }, next_attempt_at: { type: "string" }, observations: { type: "string" }, pod: { type: "object" } } } };
const settlementSchema = { body: { type: "object", required: ["code", "lines"], properties: { code: { type: "string" }, currency: { type: "string" }, lines: { type: "array", minItems: 1, items: { type: "object" } }, metadata: { type: "object" } } } };

module.exports = { carrierSchema, driverSchema, deliveryPointSchema, originSchema, rateCardSchema, planningSchema, commitPlanningSchema, needSchema, tripSchema, assignmentSchema, transitionSchema, eventSchema, attemptSchema, settlementSchema };
