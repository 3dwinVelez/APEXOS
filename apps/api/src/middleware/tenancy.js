const prisma = require("../core/prisma");
const { getTenantFromCache } = require("../core/tenantCache");
const { measurePhase } = require("../core/performanceContext");
const { tenantWithAuthorizationContext } = require("../security/supabaseAuth");

async function tenancyMiddleware(request, reply) {
  return measurePhase("tenant", async () => {
  const tenantId = request.user?.tenant_id;
  if (!tenantId) {
    return reply.code(401).send({ error: "Empresa no identificada", code: "EMPRESA_REQUERIDA" });
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
