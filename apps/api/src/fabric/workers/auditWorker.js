const { isRedisDisabled } = require("../redisConfig");

if (isRedisDisabled()) {
  console.info("Redis disabled - worker disabled");
  module.exports = null;
  return;
}

const { Worker } = require("bullmq");
const prisma = require("../../core/prisma");
const { connection } = require("../queues");
const { redactSensitive } = require("../../security/policy");

if (!connection) {
  console.info("Redis disabled - worker disabled");
  module.exports = null;
  return;
}

module.exports = new Worker("apex-audit", async (job) => {
  try {
    const payload = job.data;
    await prisma.auditLog.create({
      data: {
        tenant_id: payload.tenant_id,
        user_id: payload.user_id,
        action: payload.action,
        module: payload.module,
        entity: payload.entity,
        entity_id: payload.entity_id,
        new_value: redactSensitive(payload.new_value),
        ip: payload.ip,
        user_agent: payload.user_agent
      }
    });
  } catch (error) {
    console.error(`[auditWorker] job ${job.id} failed:`, error.message);
    throw error;
  }
}, { connection });
