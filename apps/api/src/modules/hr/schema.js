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
      employee_id: { type: "integer" },
      user_name: { type: "string" },
      type: { type: "string" },
      punched_at: { type: "string" },
      latitude: { type: "number" },
      longitude: { type: "number" },
      accuracy_meters: { type: "number" },
      vehicle_plate: { type: "string" },
      route_id: { type: "integer" },
      extra_reason: { type: "string" },
      extra_detail: { type: "string" },
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
      per_diem: { type: "number" },
      notes: { type: "string" },
      status: { type: "string" }
    }
  }
};

const gpsPingSchema = {
  body: {
    type: "object",
    required: ["user_name", "latitude", "longitude"],
    properties: {
      employee_id: { type: "integer" },
      user_name: { type: "string" },
      vehicle_plate: { type: "string" },
      route_id: { type: "integer" },
      latitude: { type: "number" },
      longitude: { type: "number" },
      accuracy_meters: { type: "number" },
      source: { type: "string" },
      captured_at: { type: "string" },
      metadata: { type: "object" }
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

module.exports = { scheduleSchema, punchSchema, routeSchema, gpsPingSchema, employeeSchema };
