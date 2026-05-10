const suggestSchema = {
  body: {
    type: "object",
    additionalProperties: true,
    required: ["business_description"],
    properties: {
      business_description: { type: "string" },
      team_size: { type: "string" },
      places_count: { type: "string" },
      sales_channels: { type: "array", items: { type: "string" } },
      pain_points: { type: "array", items: { type: "string" } },
      goals: { type: "array", items: { type: "string" } }
    }
  }
};

module.exports = { suggestSchema };

