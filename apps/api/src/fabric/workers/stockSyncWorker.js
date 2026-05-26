const { isRedisDisabled } = require("../redisConfig");

if (isRedisDisabled()) {
  console.info("Redis disabled - worker disabled");
  module.exports = null;
  return;
}

const { Worker } = require("bullmq");
const { connection } = require("../queues");

if (!connection) {
  console.info("Redis disabled - worker disabled");
  module.exports = null;
  return;
}

module.exports = new Worker("apex-stock-sync", async (job) => {
  return { synced: true, payload: job.data };
}, { connection });
