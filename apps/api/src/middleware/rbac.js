const prisma = require("../core/prisma");

function requirePermission(module, action) {
  return async function rbacMiddleware(request, reply) {
    const role = request.user?.role;
    if (!role) return reply.code(401).send({ error: "No autenticado", code: "NO_AUTENTICADO" });
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
    const currentRole = user?.role?.name;
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

module.exports = { requirePermission, checkSoD };
