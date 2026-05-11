const { Worker } = require("bullmq");
const { connection } = require("../queues");

if (!connection) {
  return;
}

new Worker("apex-stock-sync", async (job) => {
  return { synced: true, payload: job.data };
}, { connection });

