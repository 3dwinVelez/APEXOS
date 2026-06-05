const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();

function runPerformanceContext(context, fn) {
  return storage.run({ queryCount: 0, ...context }, fn);
}

function incrementQueryCount() {
  const context = storage.getStore();
  if (context) context.queryCount += 1;
}

function currentPerformanceContext() {
  return storage.getStore() || null;
}

module.exports = { currentPerformanceContext, incrementQueryCount, runPerformanceContext };
