const cron = require("node-cron");
let started = false;
const running = {};

async function runOnce(name, fn) {
  if (running[name]) {
    console.warn(`[cron] ${name} skipped — previous execution still running`);
    return;
  }
  running[name] = true;
  const startedAt = Date.now();
  console.info(`[cron] ${name} started`);
  try {
    await fn();
    console.info(`[cron] ${name} completed in ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error(`[cron] ${name} failed after ${Date.now() - startedAt}ms:`, error.message);
  } finally {
    running[name] = false;
  }
}

function start() {
  if (started) return;
  started = true;

  cron.schedule("0 6 * * *", () => {
    runOnce("scheduleDailyAnalysis", () => require("../modules/brain/brain").scheduleDailyAnalysis());
  });

  cron.schedule("0 2 * * *", () => {
    runOnce("processBilling", async () => {
      const admin = require("../modules/admin/service");
      if (admin.processBilling) await admin.processBilling();
    });
  });
}

module.exports = { start };

