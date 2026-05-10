async function trigger(params) {
  const { stockQueue } = require("../fabric/queues");
  await stockQueue.add("sync-stock", {
    model: params.model,
    action: params.action,
    where: params.args?.where || null
  });
}

module.exports = { trigger };

