const projectSchema = {
  body: {
    type: "object",
    required: ["name", "objective"],
    properties: {
      code: { type: "string" },
      name: { type: "string" },
      objective: { type: "string" },
      status: { type: "string" },
      priority: { type: "string" },
      owner_id: { type: "integer" },
      owner_name: { type: "string" },
      start_date: { type: "string" },
      target_date: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const commitmentSchema = {
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      responsible_id: { type: "integer" },
      responsible_name: { type: "string" },
      priority: { type: "string" },
      target_date: { type: "string" },
      status: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const deliverableSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      commitment_id: { type: "integer" },
      name: { type: "string" },
      description: { type: "string" },
      responsible_id: { type: "integer" },
      responsible_name: { type: "string" },
      target_date: { type: "string" },
      status: { type: "string" },
      validation: { type: "string" },
      evidence_status: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const riskSchema = {
  body: {
    type: "object",
    required: ["description"],
    properties: {
      commitment_id: { type: "integer" },
      kind: { type: "string" },
      description: { type: "string" },
      impact: { type: "string" },
      priority: { type: "string" },
      responsible_id: { type: "integer" },
      responsible_name: { type: "string" },
      action_recommended: { type: "string" },
      status: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const resourceSchema = {
  body: {
    type: "object",
    required: ["person_name", "role"],
    properties: {
      person_id: { type: "integer" },
      person_name: { type: "string" },
      role: { type: "string" },
      load_level: { type: "integer" },
      availability: { type: "string" },
      responsibilities: { type: "string" },
      contact_email: { type: "string" },
      phone: { type: "string" },
      organization: { type: "string" },
      active: { type: "boolean" },
      metadata: { type: "object" }
    }
  }
};

const followUpSchema = {
  body: {
    type: "object",
    required: ["comment"],
    properties: {
      entity_type: { type: "string" },
      entity_id: { type: "integer" },
      comment: { type: "string" },
      status: { type: "string" },
      progress: { type: "integer" },
      next_action: { type: "string" },
      next_date: { type: "string" },
      evidence_url: { type: "string" },
      metadata: { type: "object" }
    }
  }
};

const statusSchema = {
  body: {
    type: "object",
    required: ["status"],
    properties: {
      status: { type: "string" },
      comment: { type: "string" }
    }
  }
};

module.exports = { projectSchema, commitmentSchema, deliverableSchema, riskSchema, resourceSchema, followUpSchema, statusSchema };
