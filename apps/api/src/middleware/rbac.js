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

function normalizeList(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function pickScopeValue(request, keys) {
  const sources = [request.params || {}, request.query || {}, request.body || {}];
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
  }
  return "";
}

function roleScopeViolation(role, request) {
  const metadata = role.metadata || {};
  const scopes = metadata.scopes || {};
  const restrictions = metadata.restrictions || {};
  const checks = [
    { key: "locations", label: "sede", value: pickScopeValue(request, ["location", "location_code", "site", "base_site", "sede", "sede_code"]) },
    { key: "areas", label: "area", value: pickScopeValue(request, ["area", "area_code", "department", "department_code"]) },
    { key: "cost_centers", label: "centro de costo", value: pickScopeValue(request, ["cost_center", "cost_center_code", "centro_costo"]) },
    { key: "processes", label: "proceso", value: pickScopeValue(request, ["process", "process_code", "module", "workflow"]) }
  ];

  for (const check of checks) {
    const allowed = normalizeList(scopes[check.key]);
    const denied = normalizeList(restrictions[check.key]);
    if (!check.value) continue;
    if (denied.some((item) => item.toLowerCase() === check.value.toLowerCase())) return { field: check.label, value: check.value, reason: "restricted" };
    if (allowed.length && !allowed.some((item) => item.toLowerCase() === check.value.toLowerCase())) return { field: check.label, value: check.value, reason: "outside_scope" };
  }
  return null;
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

    const scopeViolation = roleScopeViolation(role, request);
    if (scopeViolation) {
      return reply.code(403).send({
        error: "Fuera del alcance permitido para el rol",
        code: "ALCANCE_ROL_DENEGADO",
        details: { module, action, scope: scopeViolation }
      });
    }

    request.rbacScope = {
      role_id: role.id,
      role_name: role.name,
      scope: role.metadata?.scope || "company",
      scopes: role.metadata?.scopes || {},
      restrictions: role.metadata?.restrictions || {}
    };
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
