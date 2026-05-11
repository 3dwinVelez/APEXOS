const { Worker } = require("bullmq");
const prisma = require("../../core/prisma");
const { connection } = require("../queues");

if (!connection) {
  return;
}

new Worker("apex-audit", async (job) => {
  const payload = job.data;
  await prisma.auditLog.create({
    data: {
      tenant_id: payload.tenant_id,
      user_id: payload.user_id,
      action: payload.action,
      module: payload.module,
      entity: payload.entity,
      entity_id: payload.entity_id,
      new_value: payload.new_value,
      ip: payload.ip,
      user_agent: payload.user_agent
    }
  });
}, { connection });

