/**
 * Entry point para workers aislados (proceso separado de la API HTTP)
 * Uso: node worker.js
 */
require("./src/core/loadEnv")();
const { isRedisDisabled } = require("./src/fabric/redisConfig");
if (isRedisDisabled()) { console.log("[worker] Redis disabled — workers not starting"); process.exit(0); }
console.log("[worker] Starting background workers...");
require("./src/fabric/workers/auditWorker");
require("./src/fabric/workers/brainWorker");
require("./src/fabric/workers/stockSyncWorker");
require("./src/fabric/workers/emailWorker");
require("./src/fabric/crons").start();
console.log("[worker] All workers started");
process.on("SIGTERM", async () => { console.log("[worker] SIGTERM — shutting down"); process.exit(0); });
process.on("SIGINT", async () => { console.log("[worker] SIGINT — shutting down"); process.exit(0); });
