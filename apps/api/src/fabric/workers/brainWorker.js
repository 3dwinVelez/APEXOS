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
  const brainUrl = process.env.BRAIN_URL || "http://localhost:8000";
  const response = await fetch(`${brainUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job.data)
  });
  const result = await response.json();
  if (job.data.tenant_id) wsManager.broadcast(job.data.tenant_id, { type: "brain", data: result });
  return result;
}, { connection });
