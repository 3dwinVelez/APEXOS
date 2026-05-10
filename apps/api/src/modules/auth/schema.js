const registerSchema = {
  body: {
    type: "object",
    required: ["company_name", "industry", "email", "password", "name"],
    properties: {
      company_name: { type: "string", minLength: 2 },
      industry: { type: "string", minLength: 2 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 6 },
      name: { type: "string", minLength: 2 },
      country: { type: "string", minLength: 2, maxLength: 2 },
      timezone: { type: "string" },
      currency: { type: "string" }
    }
  }
};

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string" }
    }
  }
};

const refreshSchema = {
  body: {
    type: "object",
    required: ["refresh"],
    properties: { refresh: { type: "string" } }
  }
};

module.exports = { registerSchema, loginSchema, refreshSchema };

