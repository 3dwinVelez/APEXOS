const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();

function runPerformanceContext(context, fn) {
  return storage.run({
    queryCount: 0,
    queryTotalMs: 0,
    queryMaxMs: 0,
    slowQueries: [],
    phases: {},
    responseSizeBytes: 0,
    ...context
  }, fn);
}

function recordPhase(name, durationMs) {
  const context = storage.getStore();
  if (!context) return;
  context.phases[name] = Number(((context.phases[name] || 0) + durationMs).toFixed(2));
}

async function measurePhase(name, fn) {
  const startedAt = process.hrtime.bigint();
  try {
    return await fn();
  } finally {
    recordPhase(name, Number(process.hrtime.bigint() - startedAt) / 1e6);
  }
}

function recordQuery(query) {
  const context = storage.getStore();
  if (!context) return;
  context.queryCount += 1;
  context.queryTotalMs += query.durationMs;
  context.queryMaxMs = Math.max(context.queryMaxMs, query.durationMs);
  if (query.slow) context.slowQueries.push(query);
}

function setResponseSizeBytes(size) {
  const context = storage.getStore();
  if (context) context.responseSizeBytes = size;
}

function currentPerformanceContext() {
  return storage.getStore() || null;
}

module.exports = { currentPerformanceContext, measurePhase, recordPhase, recordQuery, runPerformanceContext, setResponseSizeBytes };
