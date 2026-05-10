const schemas = require("./schema");
const service = require("./service");

async function onboardingRoutes(fastify) {
  fastify.post("/onboarding/suggest", { schema: schemas.suggestSchema }, async (request) => {
    return service.suggestModules(request.body);
  });
}

module.exports = onboardingRoutes;

