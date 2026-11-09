const prisma = require("../core/prisma");
const { getTenantFromCache } = require("../core/tenantCache");
const { measurePhase } = require("../core/performanceContext");
const { tenantWithAuthorizationContext } = require("../security/supabaseAuth");

async function tenancyMiddleware(request, reply) {
  return measurePhase("tenant", async () => {
  const tenantId = request.user?.tenant_id;
  if (!tenantId) {
    // El token ya fundo; lo que falta es el contexto de empresa. Como 401 el cliente
    // descarta una sesion valida y reenvia a /login en cuanto se abre Administracion.
    return reply.code(403).send({ error: "Empresa no identificada", code: "EMPRESA_REQUERIDA" });
  }

  const tenant = await getTenantFromCache(tenantId);
  if (!tenant || !tenant.active) {
    return reply.code(403).send({ error: "Cuenta suspendida o no encontrada", code: "EMPRESA_INACTIVA" });
  }

  request.tenant = tenantWithAuthorizationContext(tenant, request.user);
  request.runWithTenant = (fn) => prisma.runWithTenant(tenantId, fn);
  });
}

module.exports = tenancyMiddleware;
