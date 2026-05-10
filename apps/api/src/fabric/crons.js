const cron = require("node-cron");
let started = false;

function start() {
  if (started) return;
  started = true;

  cron.schedule("0 6 * * *", async () => {
    await require("../modules/brain/brain").scheduleDailyAnalysis();
  });

  cron.schedule("0 2 * * *", async () => {
    const admin = require("../modules/admin/service");
    if (admin.processBilling) await admin.processBilling();
  });
}

module.exports = { start };

