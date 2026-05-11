const { Queue } = require("bullmq");
const IORedis = require("ioredis");

if (process.env.DISABLE_REDIS === "1") {
  const noopQueue = { add: async () => undefined };

  module.exports = {
    connection: null,
    auditQueue: noopQueue,
    brainQueue: noopQueue,
    stockQueue: noopQueue
  };
  return;
}

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

const auditQueue = new Queue("apex-audit", { connection });
const brainQueue = new Queue("apex-brain", { connection });
const stockQueue = new Queue("apex-stock-sync", { connection });

module.exports = { connection, auditQueue, brainQueue, stockQueue };

