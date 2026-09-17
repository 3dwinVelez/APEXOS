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
      kilometraje_dia: { anyOf: [{ type: "number" }, { type: "string" }] },
      day_mileage_km: { anyOf: [{ type: "number" }, { type: "string" }] },
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
      document_type: { type: "string" },
      first_name: { type: "string" },
      middle_name: { type: "string" },
      last_name: { type: "string" },
      second_last_name: { type: "string" },
      birth_date: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      company_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      site: { type: "string" },
      area: { type: "string" },
      cost_center: { type: "string" },
      weekly_hours: { type: "number" },
      currency: { type: "string" },
      eps_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      pension_fund_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      arl_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      compensation_fund_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      icbf_entity_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
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

const employeePatchSchema = {
  body: {
    type: "object",
    properties: employeeSchema.body.properties
  }
};

const laborEntitySchema = {
  body: {
    type: "object",
    required: ["entity_type", "internal_code", "nit", "legal_name"],
    properties: {
      entity_type: { type: "string" },
      internal_code: { type: "string" },
      nit: { type: "string" },
      verification_digit: { type: "string" },
      legal_name: { type: "string" },
      trade_name: { type: "string" },
      official_code: { type: "string" },
      active: { type: "boolean" },
      valid_from: { type: "string" },
      valid_to: { anyOf: [{ type: "string" }, { type: "null" }] },
      accounting_party_id: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
      notes: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const laborEntityPatchSchema = {
  body: {
    type: "object",
    properties: laborEntitySchema.body.properties
  }
};

const laborEntityLinkSchema = {
  body: {
    type: "object",
    required: ["accounting_party_id"],
    properties: {
      accounting_party_id: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
      unlink: { type: "boolean" },
      observation: { type: "string" }
    }
  }
};

const employeeAffiliationSchema = {
  body: {
    type: "object",
    required: ["entity_type", "entity_id", "valid_from"],
    properties: {
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      entity_type: { type: "string" },
      entity_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      valid_from: { type: "string" },
      valid_to: { anyOf: [{ type: "string" }, { type: "null" }] },
      status: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const employeeAffiliationPatchSchema = {
  body: {
    type: "object",
    properties: employeeAffiliationSchema.body.properties
  }
};

const laborParameterSchema = {
  body: {
    type: "object",
    required: ["code", "name", "value", "unit", "valid_from"],
    properties: {
      company_id: { anyOf: [{ type: "string" }, { type: "null" }] },
      country: { type: "string" },
      code: { type: "string" },
      name: { type: "string" },
      value: { anyOf: [{ type: "number" }, { type: "string" }] },
      unit: { type: "string" },
      valid_from: { type: "string" },
      valid_to: { anyOf: [{ type: "string" }, { type: "null" }] },
      priority: { type: "integer" },
      active: { type: "boolean" },
      source_note: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const laborParameterPatchSchema = {
  body: {
    type: "object",
    properties: laborParameterSchema.body.properties
  }
};

const surchargeConceptSchema = {
  body: {
    type: "object",
    required: ["code", "name", "value_type", "valid_from"],
    properties: {
      company_id: { anyOf: [{ type: "string" }, { type: "null" }] },
      country: { type: "string" },
      code: { type: "string" },
      name: { type: "string" },
      value_type: { type: "string" },
      percent: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
      factor: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
      unit: { type: "string" },
      valid_from: { type: "string" },
      valid_to: { anyOf: [{ type: "string" }, { type: "null" }] },
      priority: { type: "integer" },
      active: { type: "boolean" },
      source_note: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const surchargeConceptPatchSchema = {
  body: {
    type: "object",
    properties: surchargeConceptSchema.body.properties
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

module.exports = {
  scheduleSchema,
  punchSchema,
  routeSchema,
  routeBulkSchema,
  gpsPingSchema,
  activityTypeSchema,
  workActivitySchema,
  employeeSchema,
  employeePatchSchema,
  laborEntitySchema,
  laborEntityPatchSchema,
  laborEntityLinkSchema,
  employeeAffiliationSchema,
  employeeAffiliationPatchSchema,
  laborParameterSchema,
  laborParameterPatchSchema,
  surchargeConceptSchema,
  surchargeConceptPatchSchema,
  preopSubmitSchema
};
