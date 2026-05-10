const prisma = require("../../core/prisma");
const { brainQueue } = require("../../fabric/queues");

async function scheduleDailyAnalysis() {
  const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true, industry: true } });
  await Promise.all(tenants.map((tenant) => brainQueue.add("daily-analysis", {
    tenant_id: tenant.id,
    type: "daily",
    industry: tenant.industry
  })));
}

module.exports = { scheduleDailyAnalysis };

