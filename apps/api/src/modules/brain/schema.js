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

module.exports = { feedbackSchema };

