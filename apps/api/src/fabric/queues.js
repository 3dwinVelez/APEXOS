const { Queue } = require("bullmq");
const IORedis = require("ioredis");

function isRedisDisabled() {
  return ["1", "true"].includes(String(process.env.REDIS_DISABLED || process.env.DISABLE_REDIS || "").toLowerCase());
}

if (isRedisDisabled()) {
  console.info("Redis disabled — using noop queues");
  const noopQueue = { add: async () => undefined };

  module.exports = {
    connection: null,
    auditQueue: noopQueue,
    brainQueue: noopQueue,
    stockQueue: noopQueue
  };
  return;
}

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is required when REDIS_DISABLED is not enabled");
}

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const auditQueue = new Queue("apex-audit", { connection });
const brainQueue = new Queue("apex-brain", { connection });
const stockQueue = new Queue("apex-stock-sync", { connection });

module.exports = { connection, auditQueue, brainQueue, stockQueue };
