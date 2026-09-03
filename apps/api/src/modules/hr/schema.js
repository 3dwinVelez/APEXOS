const scheduleSchema = {
  body: {
    type: "object",
    required: ["name", "start_time", "end_time"],
    properties: {
      name: { type: "string" },
      start_time: { type: "string" },
      end_time: { type: "string" },
      lunch_start_time: { type: "string" },
      lunch_end_time: { type: "string" },
      workable_days: { type: "array", items: { type: "integer" } },
      active: { type: "boolean" }
    }
  }
};

const punchSchema = {
  body: {
    type: "object",
    required: ["user_name", "type"],
    properties: {
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      user_name: { type: "string" },
      type: { type: "string" },
      punched_at: { type: "string" },
      latitude: { type: "number" },
      longitude: { type: "number" },
      accuracy_meters: { type: "number" },
      vehicle_plate: { type: "string" },
      route_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      idempotency_key: { type: "string", minLength: 8, maxLength: 120 },
      extra_reason: { type: "string" },
      extra_detail: { type: "string" },
      extra_evidence: {
        anyOf: [
          { type: "null" },
          { type: "string" },
          {
            type: "object",
            properties: {
              base64: { type: "string" },
              name: { type: "string" },
              type: { type: "string" },
              size: { type: "integer" }
            }
          }
        ]
      },
      metadata: { type: "object" }
    }
  }
};

const routeSchema = {
  body: {
    type: "object",
    required: ["date"],
    properties: {
      date: { type: "string" },
      vehicle_plate: { type: "string" },
      employees: { type: "array", items: { type: "string" } },
      start_time: { type: "string" },
      end_time: { type: "string" },
      tolerance_minutes: { type: "integer" },
      notes: { type: "string" },
      gps_required: { type: "boolean" },
      tracking_mode: { type: "string" },
      status: { type: "string" }
    }
  }
};

const routeBulkSchema = {
  body: {
    type: "object",
    required: ["start_date", "end_date"],
    properties: {
      start_date: { type: "string" },
      end_date: { type: "string" },
      weekdays: { type: "array", items: { type: "integer" } },
      vehicle_plate: { type: "string" },
      employees: { type: "array", items: { type: "string" } },
      start_time: { type: "string" },
      end_time: { type: "string" },
      tolerance_minutes: { type: "integer" },
      notes: { type: "string" },
      gps_required: { type: "boolean" },
      tracking_mode: { type: "string" },
      status: { type: "string" }
    }
  }
};

const gpsPingSchema = {
  body: {
    type: "object",
    required: ["user_name", "latitude", "longitude"],
    properties: {
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      user_name: { type: "string" },
      vehicle_plate: { type: "string" },
      route_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      latitude: { type: "number" },
      longitude: { type: "number" },
      accuracy_meters: { type: "number" },
      source: { type: "string" },
      captured_at: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const activityTypeSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      active: { type: "boolean" },
      sort_order: { type: "integer" },
      metadata: { type: "object" }
    }
  }
};

const workActivitySchema = {
  body: {
    type: "object",
    required: ["activity_type_id", "photo"],
    properties: {
      activity_type_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      occurred_at: { type: "string" },
      latitude: { type: "number" },
      longitude: { type: "number" },
      accuracy_meters: { type: "number" },
      approximate_address: { type: "string" },
      observation: { type: "string" },
      gps_required: { type: "boolean" },
      gps_skipped: { type: "boolean" },
      route_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      vehicle_plate: { type: "string" },
      metadata: { type: "object" },
      photo: {
        type: "object",
        required: ["base64", "name", "type", "size"],
        properties: {
          base64: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          size: { type: "integer" }
        }
      }
    }
  }
};

const employeeSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
      code: { type: "string" },
      document: { type: "string" },
      user_type: { type: "string" },
      position: { type: "string" },
      department: { type: "string" },
      salary_base: { type: "number" },
      salary_type: { type: "string" },
      hire_date: { type: "string" },
      contract_type: { type: "string" },
      company: { type: "string" },
      labor_status: { type: "string" },
      legacy: { type: "object" }
    }
  }
};

const preopSubmitSchema = {
  body: {
    type: "object",
    required: ["answers"],
    properties: {
      mileage_initial: { type: "integer" },
      fuel_level: { type: "string" },
      location_lat: { type: "number" },
      location_lng: { type: "number" },
      observations: { type: "string" },
      digital_signature: { type: "string" },
      allow_non_critical: { type: "boolean" },
      answers: {
        type: "array",
        items: {
          type: "object",
          required: ["item_key", "answer"],
          properties: {
            item_key: { type: "string" },
            answer: { type: "string" },
            observations: { type: "string" },
            evidence: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  evidence_type: { type: "string" },
                  file_name: { type: "string" },
                  base64_data: { type: "string" },
                  file_url: { type: "string" },
                  mime_type: { type: "string" },
                  file_size: { type: "integer" }
                }
              }
            }
          }
        }
      }
    }
  }
};

module.exports = { scheduleSchema, punchSchema, routeSchema, routeBulkSchema, gpsPingSchema, activityTypeSchema, workActivitySchema, employeeSchema, preopSubmitSchema };
