const prisma = require("../../core/prisma");

class WorkflowEngine {
  async getWorkflow(tenantId, entity) {
    return prisma.runWithTenant(tenantId, () => prisma.workflow.findFirst({ where: { entity, active: true } }));
  }

  async canTransition(tenantId, entity, currentStatus, newStatus, user) {
    const workflow = await this.getWorkflow(tenantId, entity);
    if (!workflow) return { allowed: true, hooks: [] };

    const transition = workflow.transitions.find((item) => item.from === currentStatus && item.to === newStatus);
    if (!transition) {
      return { allowed: false, error: `Transición no permitida: ${currentStatus} -> ${newStatus}` };
    }

    if (transition.requires) {
      const requiredRole = transition.requires.replace("role:", "");
      if (user?.role?.name !== requiredRole && user?.role?.name !== "APEX_ADMIN") {
        return { allowed: false, error: `Requiere rol: ${requiredRole}` };
      }
    }

    return { allowed: true, hooks: transition.hooks || [] };
  }

  async executeHooks(hooks, context) {
    const handlers = {
      reserve_stock: (ctx) => require("../../modules/inventory/service").reserve(ctx),
      send_invoice: (ctx) => require("../../modules/invoicing/service").generate(ctx)
    };

    for (const hook of hooks) {
      if (handlers[hook]) await handlers[hook](context);
    }
  }
}

module.exports = new WorkflowEngine();
