const { Worker } = require("bullmq");
const { connection } = require("../queues");

if (!connection) {
  console.info("Redis disabled - stock sync worker disabled in QA");
  return;
}

new Worker("apex-stock-sync", async (job) => {
  return { synced: true, payload: job.data };
}, { connection });
