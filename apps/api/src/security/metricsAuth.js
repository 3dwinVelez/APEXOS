const crypto = require("node:crypto");

function bearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  return String(request.headers["x-metrics-token"] || "").trim();
}

function sameSecret(received, expected) {
  if (!received || !expected) return false;
  const receivedDigest = crypto.createHash("sha256").update(received).digest();
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(receivedDigest, expectedDigest);
}

async function requireMetricsToken(request, reply) {
  const expected = String(process.env.METRICS_AUTH_TOKEN || "").trim();
  if (!sameSecret(bearerToken(request), expected)) {
    return reply.code(401).send({ error: "No autorizado", code: "NO_AUTORIZADO" });
  }
}

module.exports = { bearerToken, requireMetricsToken, sameSecret };
