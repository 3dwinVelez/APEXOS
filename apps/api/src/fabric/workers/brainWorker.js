const { isRedisDisabled } = require("../redisConfig");

if (isRedisDisabled()) {
  console.info("Redis disabled - worker disabled");
  module.exports = null;
  return;
}

const { Worker } = require("bullmq");
const { connection } = require("../queues");
const wsManager = require("../wsManager");

if (!connection) {
  console.info("Redis disabled - worker disabled");
  module.exports = null;
  return;
}

module.exports = new Worker("apex-brain", async (job) => {
  try {
    const brainUrl = process.env.BRAIN_URL || "http://localhost:8000";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${brainUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job.data),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`BRAIN service responded with ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (job.data.tenant_id) {
      wsManager.broadcast(job.data.tenant_id, { type: "brain", data: result }).catch(() => {
        console.warn(`[brainWorker] broadcast failed for tenant ${job.data.tenant_id}`);
      });
    }
    return result;
  } catch (error) {
    console.error(`[brainWorker] job ${job.id} failed:`, error.message);
    throw error;
  }
}, { connection });
