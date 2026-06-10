const { getRedisUrl, isRedisDisabled } = require("./redisConfig");

if (isRedisDisabled()) {
  console.info("Redis disabled - using noop queues");
  const noopQueue = { add: async () => undefined };

  module.exports = {
    connection: null,
    auditQueue: noopQueue,
    brainQueue: noopQueue,
    stockQueue: noopQueue
  };
  return;
}

const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis(getRedisUrl(), {
  maxRetriesPerRequest: null
});

const auditQueue = new Queue("apex-audit", { connection });
const brainQueue = new Queue("apex-brain", { connection });
const stockQueue = new Queue("apex-stock-sync", { connection });

module.exports = { connection, auditQueue, brainQueue, stockQueue };
