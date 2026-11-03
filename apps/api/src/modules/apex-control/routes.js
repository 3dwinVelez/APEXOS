"use strict";

const tenancy = require("../../middleware/tenancy");
const { requirePermission, requireExplicitPermission, tenantHasModule } = require("../../middleware/rbac");
const { crossTenantEnabled, crossTenantTenants } = require("./activity");

const SOCKET_AUTH_TIMEOUT_MS = 8000;

function simulationAllowed() {
  return String(process.env.APEX_CONTROL_SIMULATION_ENABLED || "").toLowerCase() === "true"
    && String(process.env.APP_ENV || "").toLowerCase() === "local";
}

async function authenticateSocket(token, companyId) {
  let user;
  try {
    user = require("../../security/jwt").verify(token);
  } catch {
    user = await require("../../security/supabaseAuth").authenticateSupabaseToken(token, companyId);
  }
  return require("../../security/authorizationState").validateAuthorization(user);
}

function registerLiveRoute(fastify, options = {}) {
  const wsManager = options.wsManager || require("../../fabric/wsManager");
  const getTenant = options.getTenant || require("../../core/tenantCache").getTenantFromCache;

  fastify.get("/apex-control/live", { websocket: true }, (connection) => {
    const socket = connection.socket || connection;
    let user = null;
    const timeout = setTimeout(() => {
      if (!user) socket.close(4401, "Autenticacion requerida");
    }, SOCKET_AUTH_TIMEOUT_MS);
    if (typeof timeout.unref === "function") timeout.unref();

    const closeWith = (code, reason) => {
      clearTimeout(timeout);
      try {
        socket.close(code, reason);
      } catch {
        // Socket ya cerrado.
      }
    };

    socket.on("message", async (raw) => {
      if (user) return; // Canal de solo lectura.
      try {
        const value = JSON.parse(String(raw));
        if (value.type !== "authenticate" || !value.token) {
          return closeWith(4401, "Autenticacion requerida");
        }
        const authenticated = await authenticateSocket(String(value.token), String(value.company_id || ""));
        const tenantId = authenticated?.tenant_id;
        if (!tenantId) return closeWith(4401, "Empresa no identificada");
        const tenant = await getTenant(tenantId);
        if (!tenant || !tenant.active) return closeWith(4403, "Empresa inactiva");
        if (!tenantHasModule(tenant, "apex-control")) return closeWith(4403, "Modulo no habilitado");

        user = authenticated;
        clearTimeout(timeout);
        wsManager.addClient(tenantId, socket);
        socket.send(JSON.stringify({ type: "apex-control:ready", data: { company: tenantId } }));
      } catch {
        closeWith(4401, "Token invalido");
      }
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      if (user) wsManager.removeClient(user.tenant_id, socket);
    });
    socket.on("error", () => {
      clearTimeout(timeout);
      if (user) wsManager.removeClient(user.tenant_id, socket);
    });
  });
}

async function apexControlRoutes(fastify, options = {}) {
  const auth = options.authenticate || fastify.authenticate;
  const tenantMiddleware = options.tenancy || tenancy;
  const service = options.service || require("./service");
  const report = options.report || require("./report");
  const events = options.events || require("./events");
  const emit = options.emit || events.emit;

  fastify.addHook("preHandler", auth);
  fastify.addHook("preHandler", tenantMiddleware);

  const read = requirePermission("apex-control", "read");
  const operate = requirePermission("apex-control", "operate");

  fastify.get("/apex-control/status", { preHandler: read }, (request) => service.getStatus(request.user?.tenant_id));

  fastify.get("/apex-control/modules", { preHandler: read }, (request) => service.getModules(request.user?.tenant_id));

  fastify.get("/apex-control/activity", { preHandler: read }, (request) => service.getActivity(request.user?.tenant_id, request.query || {}));

  // Lectura agregada entre empresas: apagada fuera de local y sin permiso
  // explicito no se concede. La torre es su unico consumidor.
  const readAllTenants = requireExplicitPermission("apex-control", "read_all_tenants");
  const crossTenantGuard = async (request, reply) => {
    if (!crossTenantEnabled()) {
      return reply.code(403).send({
        error: "La lectura entre empresas esta deshabilitada en este ambiente.",
        code: "CROSS_TENANT_DESHABILITADO"
      });
    }
  };

  fastify.get("/apex-control/tenants", { preHandler: [crossTenantGuard, readAllTenants] }, (request) => service.getTenants(request.query || {}));

  // Detalle por empresa: misma puerta que la tabla agregada, sin listar ni
  // agregar otras empresas. La allowlist, cuando existe, tambien limita aqui.
  fastify.get("/apex-control/tenants/:tenantId/modules", { preHandler: [crossTenantGuard, readAllTenants] }, (request, reply) => {
    const tenantId = String(request.params.tenantId || "").trim();
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(tenantId)) {
      return reply.code(400).send({ error: "Identificador de empresa invalido.", code: "EMPRESA_ID_INVALIDO" });
    }
    const allowlist = crossTenantTenants();
    if (allowlist.length && !allowlist.includes(tenantId)) {
      return reply.code(403).send({ error: "La empresa solicitada esta fuera del alcance autorizado.", code: "EMPRESA_FUERA_DE_ALCANCE" });
    }
    return service.getTenantModules(tenantId);
  });

  fastify.get("/apex-control/events", { preHandler: read }, (request) => service.listEvents(request.user?.tenant_id, request.query || {}));

  fastify.get("/apex-control/incidents", { preHandler: read }, (request) => service.listIncidents(request.user?.tenant_id, request.query || {}));

  fastify.post("/apex-control/incidents/:id/acknowledge", { preHandler: operate }, (request) => service.acknowledgeIncident(
    request.user?.tenant_id,
    request.user?.id,
    request.params.id,
    { ip: request.ip, user_agent: request.headers["user-agent"] }
  ));

  fastify.get("/apex-control/notifications", { preHandler: read }, (request) => service.listNotifications(request.user?.tenant_id, request.query || {}));

  fastify.post("/apex-control/notifications/read-all", { preHandler: operate }, (request) => service.markAllNotificationsRead(request.user?.tenant_id));

  fastify.post("/apex-control/notifications/:id/read", { preHandler: operate }, (request) => service.markNotificationRead(request.user?.tenant_id, request.params.id));

  fastify.get("/apex-control/reports", { preHandler: read }, async (request) => ({
    reports: await service.listReportRuns(request.user?.tenant_id, request.query || {})
  }));

  fastify.post("/apex-control/reports/daily/preview", { preHandler: read }, (request) => report.buildDailySummary(request.query || {}));

  fastify.post("/apex-control/_simulate/failure", { preHandler: operate }, async (request, reply) => {
    if (!simulationAllowed()) {
      return reply.code(404).send({ error: "No encontrado", code: "NO_ENCONTRADO" });
    }
    await emit({
      source: "simulation",
      kind: "simulation.failure",
      severity: "error",
      component_key: "api",
      fingerprint: "simulation:failure",
      payload: { simulated: true, requested_by: request.user?.id || null }
    });
    return reply.code(500).send({ error: "Fallo simulado por APEX Control", code: "FALLO_SIMULADO" });
  });

  if (options.registerLive === true) registerLiveRoute(fastify, options);
}

module.exports = apexControlRoutes;
module.exports.registerLiveRoute = registerLiveRoute;
module.exports.simulationAllowed = simulationAllowed;
