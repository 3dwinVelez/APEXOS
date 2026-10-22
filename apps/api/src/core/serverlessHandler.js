// Keep one initialized Fastify instance per function process. A build factory is
// not a Node HTTP handler: the runtime needs the request forwarded explicitly.
function createServerlessHandler(build) {
  let application;
  return async function handler(request, response) {
    application ||= Promise.resolve().then(build).then(async (app) => {
      await app.ready();
      return app;
    });
    try {
      const app = await application;
      app.server.emit("request", request, response);
    } catch {
      response.statusCode = 503;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ error: "API bootstrap failed", code: "BOOTSTRAP_FAILED" }));
    }
  };
}

module.exports = { createServerlessHandler };
