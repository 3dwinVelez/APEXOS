const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();
let interactionCounter = 0;

function runPerformanceContext(context, fn) {
  interactionCounter += 1;
  const interactionId = `int-${interactionCounter}-${Date.now().toString(36)}`;
  return storage.run({
    queryCount: 0,
    queryTotalMs: 0,
    queryMaxMs: 0,
    slowQueries: [],
    phases: {},
    responseSizeBytes: 0,
    dbPoolWaitMs: 0,
    serializationMs: 0,
    interactionId,
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
  if (context.dbPoolWaitMs === 0 && query.poolWaitMs) context.dbPoolWaitMs = query.poolWaitMs;
  if (query.slow) context.slowQueries.push(query);
}

function recordSerialization(durationMs) {
  const context = storage.getStore();
  if (context) context.serializationMs = Number(((context.serializationMs || 0) + durationMs).toFixed(2));
}

function setResponseSizeBytes(size) {
  const context = storage.getStore();
  if (context) context.responseSizeBytes = size;
}

function currentPerformanceContext() {
  return storage.getStore() || null;
}

module.exports = { currentPerformanceContext, measurePhase, recordPhase, recordQuery, runPerformanceContext, setResponseSizeBytes, recordSerialization };
