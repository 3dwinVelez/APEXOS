const registerSchema = {
  body: {
    type: "object",
    required: ["company_name", "industry", "email", "password", "name"],
    properties: {
      company_name: { type: "string", minLength: 2 },
      industry: { type: "string", minLength: 2 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
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

const fingerprintChallengeSchema = {
  body: {
    type: "object",
    required: ["tenant_id", "user_id"],
    properties: {
      tenant_id: { type: "string", minLength: 1, maxLength: 100 },
      user_id: { type: "integer", minimum: 1 }
    }
  }
};

const b64url = { type: "string", minLength: 1, maxLength: 8192, pattern: "^[A-Za-z0-9_-]+$" };

const fingerprintLoginSchema = {
  body: {
    type: "object",
    required: ["challenge", "credential_id", "authenticator_data", "client_data_json", "signature"],
    properties: {
      challenge: b64url,
      credential_id: { ...b64url, maxLength: 1024 },
      authenticator_data: b64url,
      client_data_json: b64url,
      signature: b64url
    }
  }
};

module.exports = { registerSchema, loginSchema, refreshSchema, fingerprintChallengeSchema, fingerprintLoginSchema };

