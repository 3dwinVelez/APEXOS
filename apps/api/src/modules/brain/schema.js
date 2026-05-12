const feedbackSchema = {
  body: {
    type: "object",
    required: ["event_id", "accepted"],
    properties: {
      event_id: { type: "integer" },
      accepted: { type: "boolean" },
      feedback: { type: "string" }
    }
  }
};

const insightQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      module: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 25 }
    }
  }
};

const mentorQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      module: { type: "string" }
    }
  }
};

const actionPreviewSchema = {
  body: {
    type: "object",
    required: ["action"],
    properties: {
      action: { type: "string" },
      module: { type: "string" },
      payload: { type: "object" }
    }
  }
};

module.exports = { feedbackSchema, insightQuerySchema, mentorQuerySchema, actionPreviewSchema };

