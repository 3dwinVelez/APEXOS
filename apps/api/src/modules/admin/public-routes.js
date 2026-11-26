// Admin - ingesta PUBLICA de fallos vistos por el navegador.
// Scope aparte en server.js para no heredar authenticate/tenancy: lo que se quiere capturar es
// justamente el fallo de quien no tiene sesion valida (token caducado, API inalcanzable, CORS).
// El tenant nunca sale del body: cae en el buzon del despliegue (APEXOS_TELEMETRY_TENANT_ID), y si
// no esta configurado se responde grabado=false en vez de fingir un ok que no ocurrio.
const service = require("./service");
const platformConfig = require("./platform-config-service");

const reportSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: {
      module: { type: "string", maxLength: 60 },
      route: { type: "string", maxLength: 240 },
      method: { type: "string", maxLength: 10 },
      status_code: { type: ["integer", "null"] },
      code: { type: "string", maxLength: 60 },
      message: { type: "string", minLength: 3, maxLength: 1000 },
      detail: { type: "string", maxLength: 2000 },
      request_id: { type: "string", maxLength: 64 },
      metadata: {
        type: "object",
        additionalProperties: false,
        properties: {
          href: { type: "string", maxLength: 200 },
          provider: { type: "string", maxLength: 20 },
          // El navegador clasifica la causa (request_rejected | timeout | offline | unknown) antes
          // de reportar. Sin esta clave, el payload anonimo -el unico que queda cuando no hay
          // sesion, justo cuando la plataforma esta caida- rebotaba con 400 de esquema.
          failure_cause: { type: "string", maxLength: 40 }
        }
      }
    }
  }
};

function inboxTenantId() {
  return String(process.env.APEXOS_TELEMETRY_TENANT_ID || "").trim();
}

async function adminPublicRoutes(fastify) {
  fastify.post("/public/telemetry/client-logs", {
    schema: reportSchema,
    bodyLimit: 8 * 1024,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const tenantId = inboxTenantId();
    if (!tenantId) {
      return reply.code(202).send({ recorded: false, reason: "BUZON_TELEMETRIA_NO_CONFIGURADO" });
    }
    await service.createClientPlatformLog(tenantId, null, request.body || {}, {
      ip: request.ip,
      user_agent: request.headers["user-agent"]
    });
    return reply.code(202).send({ recorded: true });
  });

  // Enlace de la app que muestra la pantalla de acceso. Sin sesion porque el acceso es previo: se
  // expone solo la URL, sin ambiente ni autor, y con limite de peticiones para que una lectura
  // publica no se vuelva puerta de entrada a la base.
  fastify.get("/public/platform/mobile-app", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return platformConfig.getPublicMobileApp();
  });
}

module.exports = adminPublicRoutes;
