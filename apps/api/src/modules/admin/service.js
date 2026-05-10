const prisma = require("../../core/prisma");

async function exportTenantData(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const [parties, items, transactions, employees, movements] = await Promise.all([
      prisma.party.findMany(),
      prisma.item.findMany(),
      prisma.transaction.findMany({ include: { lines: true } }),
      prisma.employee.findMany(),
      prisma.movement.findMany()
    ]);

    return {
      exported_at: new Date().toISOString(),
      tenant_id: tenantId,
      parties,
      items,
      transactions,
      employees,
      movements
    };
  });
}

async function processBilling() {
  return { processed: true };
}

module.exports = { exportTenantData, processBilling };

