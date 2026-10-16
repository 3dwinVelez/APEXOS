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
      latitude: { type: ["number", "null"] },
      longitude: { type: ["number", "null"] },
      accuracy_meters: { type: ["number", "null"] },
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
      status: { type: "string" },
      kind: { type: "string", enum: ["trabajo", "descanso"] }
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
      status: { type: "string" },
      kind: { type: "string", enum: ["trabajo", "descanso"] }
    }
  }
};

// La prevalidacion recibe la misma forma que el guardado: un solo dia (date) o un rango
// (start_date/end_date). Exigir el rango aqui dejaba fuera el payload de creacion simple.
const routePrevalidateSchema = {
  body: {
    type: "object",
    required: ["employees"],
    properties: {
      ...routeBulkSchema.body.properties,
      date: { type: "string" }
    },
    anyOf: [{ required: ["date"] }, { required: ["start_date", "end_date"] }]
  }
};

// La eliminacion definitiva exige motivo explicito y confirmacion consciente del alcance real
// (registros operativos del dia conservan su route_id como historial desacoplado).
const routeDeleteSchema = {
  body: {
    type: "object",
    required: ["reason", "confirmed"],
    properties: {
      reason: { type: "string", minLength: 12, maxLength: 500 },
      confirmed: { type: "boolean", const: true },
      expected_employees: { type: "integer", minimum: 0 },
      expected_date: { type: "string" },
      acknowledge_trace: { type: "boolean" }
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
      latitude: { type: ["number", "null"] },
      longitude: { type: ["number", "null"] },
      accuracy_meters: { type: ["number", "null"] },
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
      latitude: { type: ["number", "null"] },
      longitude: { type: ["number", "null"] },
      accuracy_meters: { type: ["number", "null"] },
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
      society_code: { type: "string" },
      branch_code: { type: "string" },
      cost_center_code: { type: "string" },
      weekly_hours: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
      currency: { type: "string" },
      eps_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      pension_fund_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      arl_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      arl_risk_class: { anyOf: [{ type: "integer" }, { type: "string" }] },
      compensation_fund_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      icbf_entity_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      user_type: { type: "string" },
      position: { type: "string" },
      department: { type: "string" },
      salary_base: { anyOf: [{ type: "number" }, { type: "string" }] },
      salary_type: { type: "string" },
      hire_date: { type: "string" },
      end_date: { anyOf: [{ type: "string" }, { type: "null" }] },
      contract_type: { type: "string" },
      company: { type: "string" },
      labor_status: { type: "string" },
      regime: { type: "string" },
      regimen: { type: "string" },
      sector: { type: "string" },
      exoneration_eligible: { type: "boolean" },
      exoneration_support: { type: "string" },
      sln_pension_employer_percent: { anyOf: [{ type: "number" }, { type: "string" }] },
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

const employeeContractAddendumSchema = {
  body: {
    type: "object",
    required: ["valid_from"],
    properties: {
      valid_from: { type: "string" },
      end_date: { anyOf: [{ type: "string" }, { type: "null" }] },
      contract_type: { type: "string" },
      salary_base: { anyOf: [{ type: "number" }, { type: "string" }] },
      cost_center: { type: "string" },
      society_code: { anyOf: [{ type: "string" }, { type: "null" }] },
      branch_code: { anyOf: [{ type: "string" }, { type: "null" }] },
      cost_center_code: { anyOf: [{ type: "string" }, { type: "null" }] },
      reason: { type: "string" },
      notes: { type: "string" }
    }
  }
};

const employeeRehireSchema = {
  body: {
    type: "object",
    required: ["new_hire_date", "contract_type", "salary_base"],
    properties: {
      new_hire_date: { type: "string" },
      end_date: { anyOf: [{ type: "string" }, { type: "null" }] },
      contract_type: { type: "string" },
      salary_base: { anyOf: [{ type: "number" }, { type: "string" }] },
      cost_center: { type: "string" },
      society_code: { anyOf: [{ type: "string" }, { type: "null" }] },
      branch_code: { anyOf: [{ type: "string" }, { type: "null" }] },
      cost_center_code: { anyOf: [{ type: "string" }, { type: "null" }] },
      reason: { type: "string" },
      notes: { type: "string" }
    }
  }
};

const laborEntitySchema = {
  body: {
    type: "object",
    required: ["entity_type"],
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

const payrollLiquidationSchema = {
  body: {
    type: "object",
    required: ["fecha_inicio", "fecha_fin"],
    properties: {
      fecha_inicio: { type: "string" },
      fecha_fin: { type: "string" },
      period_type: { type: "string" },
      period_key: { type: "string" },
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
      recalculate: { type: "boolean" }
    }
  }
};

const payrollLiquidationDeleteSchema = {
  body: {
    type: "object",
    required: ["period_key"],
    properties: {
      period_key: { type: "string" }
    }
  }
};

const socialBenefitProvisionSchema = {
  body: {
    type: "object",
    required: ["fecha_inicio", "fecha_fin"],
    properties: {
      fecha_inicio: { type: "string" },
      fecha_fin: { type: "string" },
      period_type: { type: "string" },
      period_key: { type: "string" },
      recalculate: { type: "boolean" }
    }
  }
};

const socialBenefitPaymentSchema = {
  body: {
    type: "object",
    required: ["payment_type", "fecha_inicio", "fecha_fin", "payment_date"],
    properties: {
      payment_type: { type: "string" },
      fecha_inicio: { type: "string" },
      fecha_fin: { type: "string" },
      payment_date: { type: "string" },
      period_type: { type: "string" },
      period_key: { type: "string" },
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
      recalculate: { type: "boolean" }
    }
  }
};

const payrollAdjustmentSchema = {
  body: {
    type: "object",
    required: ["employee_id", "period_key", "concept_code"],
    properties: {
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      period_key: { type: "string" },
      adjustment_type: { type: "string" },
      concept_code: { type: "string" },
      description: { type: "string" },
      work_date: { type: "string" },
      start_time: { type: "string" },
      end_time: { type: "string" },
      minutes: { anyOf: [{ type: "integer" }, { type: "number" }, { type: "string" }] },
      amount: { anyOf: [{ type: "number" }, { type: "string" }] },
      days: { anyOf: [{ type: "number" }, { type: "string" }] },
      date_start: { type: "string" },
      date_end: { type: "string" },
      paid_by: { type: "string" },
      pila_ibc_amount: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
      ibc_reference_amount: { anyOf: [{ type: "number" }, { type: "string" }] },
      ibc_reference_period: { type: "string" },
      ibc_reference_captured_at: { type: "string" },
      ibc_referencia_inicio: { anyOf: [{ type: "number" }, { type: "string" }] },
      periodo_ibc_referencia: { type: "string" },
      continuidad_key: { type: "string" },
      continuity_key: { type: "string" },
      recognized_value: { anyOf: [{ type: "number" }, { type: "string" }] },
      document_support: { type: "string" },
      documento_soporte: { type: "string" },
      reference_source: { type: "string" },
      reported_pila_id: { type: "string" },
      advance_obligation_id: { type: "string" },
      advance_retention_health: { anyOf: [{ type: "number" }, { type: "string" }] },
      advance_retention_pension: { anyOf: [{ type: "number" }, { type: "string" }] },
      suspension_cause: { type: "string" },
      suspension_kind: { type: "string" },
      taxable: { type: "boolean" },
      metadata: { type: "object" }
    }
  }
};

const payrollExternalWorkdaysImportSchema = {
  body: {
    type: "object",
    required: ["period_key", "rows"],
    properties: {
      period_key: { type: "string" },
      rows: {
        type: "array",
        items: {
          type: "object",
          required: ["document", "concept_code"],
          properties: {
            document: { type: "string" },
            employee_code: { type: "string" },
            concept_code: { type: "string" },
            description: { type: "string" },
            date_start: { type: "string" },
            date_end: { type: "string" },
            work_date: { type: "string" },
            days: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
            hours: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
            minutes: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
            amount: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
            observation: { type: "string" }
          }
        }
      }
    }
  }
};

const payrollExternalWorkdaysDeleteSchema = {
  body: {
    type: "object",
    required: ["period_key"],
    properties: {
      period_key: { type: "string" }
    }
  }
};

const payrollConceptSchema = {
  body: {
    type: "object",
    required: ["code", "name", "concept_type", "valid_from"],
    properties: {
      country: { type: "string" },
      code: { type: "string" },
      name: { type: "string" },
      concept_type: { type: "string" },
      salary_constitutive: { type: "boolean" },
      affects_ibc: { type: "boolean" },
      default_operation: { type: "string" },
      debit_account_code: { type: "string" },
      credit_account_code: { type: "string" },
      valid_from: { type: "string" },
      valid_to: { anyOf: [{ type: "string" }, { type: "null" }] },
      priority: { type: "integer" },
      active: { type: "boolean" },
      source_note: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const payrollConceptPatchSchema = {
  body: {
    type: "object",
    properties: payrollConceptSchema.body.properties
  }
};

const employeeSalarySchema = {
  body: {
    type: "object",
    required: ["monthly_salary", "valid_from"],
    properties: {
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      monthly_salary: { anyOf: [{ type: "number" }, { type: "string" }] },
      currency: { type: "string" },
      valid_from: { type: "string" },
      reason: { type: "string" }
    }
  }
};

const calendarDaySchema = {
  body: {
    type: "object",
    required: ["date", "name", "day_type"],
    properties: {
      country: { type: "string" },
      territory: { type: "string" },
      company_id: { type: "string" },
      date: { type: "string" },
      name: { type: "string" },
      day_type: { type: "string" },
      source: { type: "string" },
      active: { type: "boolean" },
      metadata: { type: "object" }
    }
  }
};

const calendarDayPatchSchema = {
  body: {
    type: "object",
    properties: calendarDaySchema.body.properties
  }
};

const libranzaConceptSchema = {
  body: {
    type: "object",
    required: ["code", "name"],
    properties: {
      code: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      entity_id: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
      debit_account_code: { type: "string" },
      credit_account_code: { type: "string" },
      active: { type: "boolean" },
      metadata: { type: "object" }
    }
  }
};

const libranzaConceptPatchSchema = {
  body: {
    type: "object",
    properties: libranzaConceptSchema.body.properties
  }
};

const employeeLibranzaSchema = {
  body: {
    type: "object",
    required: ["employee_id", "concept_id", "frequency", "mode", "start_date"],
    properties: {
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      concept_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      description: { type: "string" },
      frequency: { type: "string" },
      mode: { type: "string" },
      original_amount: { anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }] },
      installment_amount: { anyOf: [{ type: "number" }, { type: "string" }] },
      installments_total: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
      start_date: { type: "string" },
      end_date: { anyOf: [{ type: "string" }, { type: "null" }] },
      inactive_at: { anyOf: [{ type: "string" }, { type: "null" }] },
      status: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const employeeLibranzaPatchSchema = {
  body: {
    type: "object",
    properties: employeeLibranzaSchema.body.properties
  }
};

const employeeTerminationLiquidationSchema = {
  body: {
    type: "object",
    required: ["employee_id", "termination_date", "termination_reason"],
    properties: {
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }] },
      termination_date: { type: "string" },
      termination_reason: { type: "string" },
      contract_type: { type: "string" },
      salary_base: { anyOf: [{ type: "number" }, { type: "string" }] },
      pending_salary_days: { anyOf: [{ type: "number" }, { type: "string" }] },
      remaining_days: { anyOf: [{ type: "number" }, { type: "string" }] },
      recalculate: { type: "boolean" },
      mark_inactive: { type: "boolean" }
    }
  }
};

const socialContributionSchema = {
  body: {
    type: "object",
    required: ["fecha_inicio", "fecha_fin"],
    properties: {
      fecha_inicio: { type: "string" },
      fecha_fin: { type: "string" },
      period_type: { type: "string" },
      period_key: { type: "string" },
      employee_id: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
      recalculate: { type: "boolean" }
    }
  }
};

const payrollPeriodClosureSchema = {
  body: {
    type: "object",
    required: ["fecha_inicio", "fecha_fin"],
    properties: {
      fecha_inicio: { type: "string" },
      fecha_fin: { type: "string" },
      period_type: { type: "string" },
      period_key: { type: "string" },
      recalculate: { type: "boolean" },
      force: { type: "boolean" }
    }
  }
};

const payrollPeriodReopenSchema = {
  body: {
    type: "object",
    required: ["period_key"],
    properties: {
      period_key: { type: "string" }
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

module.exports = {
  scheduleSchema,
  punchSchema,
  routeSchema,
  routeBulkSchema,
  routePrevalidateSchema,
  routeDeleteSchema,
  gpsPingSchema,
  activityTypeSchema,
  workActivitySchema,
  employeeSchema,
  employeePatchSchema,
  employeeContractAddendumSchema,
  employeeRehireSchema,
  laborEntitySchema,
  laborEntityPatchSchema,
  laborEntityLinkSchema,
  employeeAffiliationSchema,
  employeeAffiliationPatchSchema,
  laborParameterSchema,
  laborParameterPatchSchema,
  surchargeConceptSchema,
  surchargeConceptPatchSchema,
  payrollLiquidationSchema,
  payrollLiquidationDeleteSchema,
  socialBenefitProvisionSchema,
  socialBenefitPaymentSchema,
  payrollAdjustmentSchema,
  payrollExternalWorkdaysImportSchema,
  payrollExternalWorkdaysDeleteSchema,
  payrollConceptSchema,
  payrollConceptPatchSchema,
  employeeSalarySchema,
  calendarDaySchema,
  calendarDayPatchSchema,
  libranzaConceptSchema,
  libranzaConceptPatchSchema,
  employeeLibranzaSchema,
  employeeLibranzaPatchSchema,
  employeeTerminationLiquidationSchema,
  socialContributionSchema,
  payrollPeriodClosureSchema,
  payrollPeriodReopenSchema,
  preopSubmitSchema
};
