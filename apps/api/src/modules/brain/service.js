const prisma = require("../../core/prisma");

async function listEvents(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const page = Number(query.page || 1);
    const pageSize = Math.min(Number(query.page_size || 25), 100);
    const [data, total] = await Promise.all([
      prisma.brainEvent.findMany({
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.brainEvent.count()
    ]);
    return { data, total, page, pages: Math.ceil(total / pageSize) };
  });
}

async function feedback(tenantId, input) {
  return prisma.runWithTenant(tenantId, () => prisma.brainEvent.update({
    where: { id: BigInt(input.event_id) },
    data: { accepted: input.accepted, feedback: input.feedback }
  }));
}

module.exports = { listEvents, feedback };

