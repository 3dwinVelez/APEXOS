const prisma = require("../core/prisma");

const MODULE_CODES = {
  accounting: ["M-07", "contabilidad", "finance"],
  admin: ["M-22", "administracion", "administracion_apex"],
  brain: ["AI-CORE", "apex-ai", "apex_ai"],
  hr: ["M-17", "talento-humano", "talento_humano"],
  inventory: ["M-01", "inventario"],
  invoicing: ["M-04", "facturacion"],
  purchases: ["M-02", "compras"],
  projects: ["M-19", "proyectos"],
  sales: ["M-03", "ventas"],
  services: ["M-26", "servicios"],
  transport: ["M-14", "transporte"]
};

function tenantHasModule(tenant, module) {
  if (!tenant || module === "auth" || module === "dashboard") return true;
  const active = Array.isArray(tenant.active_modules) ? tenant.active_modules.map((item) => String(item).toLowerCase()) : [];
  if (!active.length) return true;
  const allowedCodes = (MODULE_CODES[module] || [module]).map((item) => String(item).toLowerCase());
  return allowedCodes.some((code) => active.includes(code));
}

function requirePermission(module, action) {
  return async function rbacMiddleware(request, reply) {
    const role = request.user.role;
    if (!role) return reply.code(401).send({ error: "No autenticado", code: "NO_AUTENTICADO" });
    if (!tenantHasModule(request.tenant, module)) {
      return reply.code(403).send({
        error: "Modulo no habilitado para esta empresa",
        code: "MODULO_NO_HABILITADO",
        details: { module }
      });
    }
    if (role.name === "APEX_ADMIN") return;

    const permissions = role.permissions || [];
    const allowed = permissions.some((permission) => {
      const moduleOk = permission.module === module || permission.module === "*";
      const actionOk = permission.action === action || permission.action === "*";
      return moduleOk && actionOk;
    });

    if (!allowed) {
      return reply.code(403).send({
        error: "Sin permiso para esta acción",
        code: "PERMISO_DENEGADO",
        details: { module, action }
      });
    }
  };
}

async function checkSoD(tenantId, userId, newRoleName) {
  return prisma.runWithTenant(tenantId, async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    const currentRole = user.role.name;
    if (!currentRole) return { conflict: false };

    const rule = await prisma.soDRule.findFirst({
      where: {
        OR: [
          { role_a: currentRole, role_b: newRoleName },
          { role_a: newRoleName, role_b: currentRole }
        ]
      }
    });
    return rule ? { conflict: true, rule } : { conflict: false };
  });
}

module.exports = { requirePermission, checkSoD, tenantHasModule };
