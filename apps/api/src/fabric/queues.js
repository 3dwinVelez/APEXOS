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
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  retryStrategy: (times) => Math.min(times * 200, 5000)
});

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800, count: 500 }
};

const auditQueue = new Queue("apex-audit", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
const brainQueue = new Queue("apex-brain", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
const stockQueue = new Queue("apex-stock-sync", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
const emailQueue = new Queue("apex-email", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });

module.exports = { connection, auditQueue, brainQueue, stockQueue, emailQueue };
