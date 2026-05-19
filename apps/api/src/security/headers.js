function registerSecurityHeaders(fastify) {
  fastify.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");
    reply.header("Cross-Origin-Resource-Policy", "same-site");
    if (request.protocol === "https") {
      reply.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    return payload;
  });
}

module.exports = { registerSecurityHeaders };
