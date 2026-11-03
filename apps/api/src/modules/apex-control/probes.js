"use strict";

const { performance } = require("node:perf_hooks");
const defaultPrisma = require("../../core/prisma");

const DEFAULT_TIMEOUT_MS = 2500;
const CRON_EXPECTATIONS_SECONDS = {
  apexControlPulse: 60,
  extractReceivedInvoiceXml: 180,
  sendApexHeartReports: 3900,
  refreshApexHeart: 90000,
  scheduleDailyAnalysis: 90000,
  processBilling: 90000,
  ingestMailboxAttachments: 3900,
  syncMailboxInvoiceFolder: 3900,
  apexControlDailyReport: 90000,
  apexControlCleanup: 90000
};

const PROBE_DEFINITIONS = [
  { key: "api", name: "API", kind: "process", criticality: "critical" },
  { key: "db", name: "PostgreSQL", kind: "database", criticality: "critical" },
  { key: "redis", name: "Redis", kind: "cache", criticality: "critical" },
  { key: "queues", name: "Colas BullMQ", kind: "queue", criticality: "standard" },
  { key: "crons", name: "Crons", kind: "cron", criticality: "standard" },
  { key: "brain", name: "APEX Brain", kind: "service", criticality: "standard" },
  { key: "minio", name: "Almacenamiento", kind: "storage", criticality: "standard" },
  { key: "mail", name: "Correo", kind: "integration", criticality: "standard" },
  { key: "websocket", name: "WebSocket", kind: "realtime", criticality: "standard" }
];

function scoreFor(status) {
  if (status === "ok") return 100;
  if (status === "degraded") return 60;
  if (status === "unknown") return 50;
  return 0;
}

function componentResult(definition, status, latencyMs, details = {}) {
  return {
    key: definition.key,
    name: definition.name,
    kind: definition.kind,
    criticality: definition.criticality,
    status: ["ok", "degraded", "down", "unknown"].includes(status) ? status : "unknown",
    latency_ms: latencyMs == null ? null : Math.max(0, Math.round(latencyMs)),
    error_rate: null,
    score: scoreFor(status),
    details: details && typeof details === "object" && !Array.isArray(details) ? details : {}
  };
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label || "operacion"}_TIMEOUT`)), ms);
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function timed(fn) {
  const started = performance.now();
  try {
    const value = await fn();
    return { ok: true, value, latency_ms: performance.now() - started };
  } catch (error) {
    return { ok: false, error, latency_ms: performance.now() - started };
  }
}

async function probeApi(definition = PROBE_DEFINITIONS[0]) {
  const memory = process.memoryUsage();
  const heapRatio = memory.heapTotal ? memory.heapUsed / memory.heapTotal : 0;
  const status = heapRatio >= 0.94 ? "degraded" : "ok";
  return componentResult(definition, status, 0, {
    uptime_s: Math.round(process.uptime()),
    node: process.version,
    heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
    heap_ratio: Number(heapRatio.toFixed(3)),
    pid: process.pid
  });
}

async function probeDatabase(definition = PROBE_DEFINITIONS[1], deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const timeoutMs = Number(deps.timeoutMs || DEFAULT_TIMEOUT_MS);
  const result = await timed(() => withTimeout(db.$queryRaw`SELECT 1 AS ok`, timeoutMs, "db"));
  if (!result.ok) {
    return componentResult(definition, "down", result.latency_ms, { error: result.error.message });
  }
  const status = result.latency_ms > 800 ? "degraded" : "ok";
  return componentResult(definition, status, result.latency_ms, { query: "SELECT 1" });
}

async function probeRedis(definition = PROBE_DEFINITIONS[2], deps = {}) {
  const timeoutMs = Number(deps.timeoutMs || DEFAULT_TIMEOUT_MS);
  let queues;
  try {
    queues = deps.queues || require("../../fabric/queues");
  } catch (error) {
    return componentResult(definition, "down", null, { error: error.message });
  }
  const connection = queues?.connection;
  if (!connection) {
    return componentResult(definition, "unknown", null, { reason: "REDIS_DISABLED" });
  }
  const result = await timed(() => withTimeout(connection.ping(), timeoutMs, "redis"));
  if (!result.ok) {
    return componentResult(definition, "down", result.latency_ms, { error: result.error.message });
  }
  const status = result.latency_ms > 500 ? "degraded" : "ok";
  return componentResult(definition, status, result.latency_ms, { ping: result.value });
}

async function probeQueues(definition = PROBE_DEFINITIONS[3], deps = {}) {
  const timeoutMs = Number(deps.timeoutMs || DEFAULT_TIMEOUT_MS);
  let queues;
  try {
    queues = deps.queues || require("../../fabric/queues");
  } catch (error) {
    return componentResult(definition, "down", null, { error: error.message });
  }
  const names = ["auditQueue", "brainQueue", "stockQueue", "emailQueue"];
  const available = names.filter((name) => queues?.[name] && typeof queues[name].getJobCounts === "function");
  if (!available.length) {
    return componentResult(definition, "unknown", null, { reason: "REDIS_DISABLED" });
  }
  const counts = {};
  const started = performance.now();
  try {
    const settled = await withTimeout(Promise.all(available.map(async (name) => {
      counts[name] = await queues[name].getJobCounts();
    })), timeoutMs, "queues");
    void settled;
  } catch (error) {
    return componentResult(definition, "down", performance.now() - started, { error: error.message });
  }
  const waiting = Object.values(counts).reduce((sum, value) => sum + Number(value?.waiting || 0), 0);
  const failed = Object.values(counts).reduce((sum, value) => sum + Number(value?.failed || 0), 0);
  const status = failed > 25 || waiting > 500 ? "degraded" : "ok";
  return componentResult(definition, status, performance.now() - started, { counts, waiting, failed });
}

async function probeCrons(definition = PROBE_DEFINITIONS[4], deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const now = deps.now instanceof Date ? deps.now : new Date();
  let row = null;
  try {
    row = await db.apexComponent.findUnique({ where: { key: "crons" } });
  } catch (error) {
    return componentResult(definition, "down", null, { error: error.message });
  }
  const lastRuns = row?.metadata?.last_runs && typeof row.metadata.last_runs === "object" ? row.metadata.last_runs : {};
  const entries = Object.entries(lastRuns);
  if (!entries.length) {
    return componentResult(definition, "unknown", null, { reason: "SIN_EJECUCIONES" });
  }
  const stale = entries.flatMap(([name, entry]) => {
    const expected = CRON_EXPECTATIONS_SECONDS[name];
    const at = entry?.at ? new Date(entry.at) : null;
    if (!expected || !at || Number.isNaN(at.getTime())) return [];
    const ageSeconds = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 1000));
    const failed = entry.status === "failed";
    if (!failed && ageSeconds <= expected * 2) return [];
    return [{ name, age_s: ageSeconds, expected_s: expected, status: entry.status || "ok" }];
  });
  const status = stale.length ? "degraded" : "ok";
  return componentResult(definition, status, null, { runs: entries.length, stale });
}

async function probeBrain(definition = PROBE_DEFINITIONS[5], deps = {}) {
  const timeoutMs = Number(deps.timeoutMs || DEFAULT_TIMEOUT_MS);
  const baseUrl = String(deps.brainUrl || process.env.BRAIN_URL || "http://localhost:8000").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal, headers: { accept: "application/json" } });
    const latency = performance.now() - started;
    if (!response.ok) {
      return componentResult(definition, "down", latency, { status_code: response.status });
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const status = latency > 1500 || (body?.status && String(body.status).toUpperCase() !== "OK") ? "degraded" : "ok";
    return componentResult(definition, status, latency, { status_code: response.status, service: body?.service || "brain", version: body?.version || null });
  } catch (error) {
    return componentResult(definition, "down", performance.now() - started, { error: error.message });
  } finally {
    clearTimeout(timer);
  }
}

async function probeMinio(definition = PROBE_DEFINITIONS[6], deps = {}) {
  const timeoutMs = Number(deps.timeoutMs || DEFAULT_TIMEOUT_MS);
  const endpoint = String(process.env.MINIO_ENDPOINT || "").trim();
  const accessKey = String(process.env.MINIO_ACCESS_KEY || "").trim();
  const secretKey = String(process.env.MINIO_SECRET_KEY || "").trim();
  if (!endpoint || !accessKey || !secretKey) {
    return componentResult(definition, "unknown", null, { reason: "NO_CONFIGURADO" });
  }
  let client = deps.minioClient;
  if (!client) {
    try {
      const { Client } = require("minio");
      client = new Client({
        endPoint: endpoint,
        port: Number(process.env.MINIO_PORT || 9000),
        useSSL: String(process.env.MINIO_USE_SSL || "false").toLowerCase() === "true",
        accessKey,
        secretKey
      });
    } catch (error) {
      return componentResult(definition, "down", null, { error: error.message });
    }
  }
  const result = await timed(() => withTimeout(client.listBuckets(), timeoutMs, "minio"));
  if (!result.ok) {
    return componentResult(definition, "down", result.latency_ms, { error: result.error.message });
  }
  const status = result.latency_ms > 1500 ? "degraded" : "ok";
  return componentResult(definition, status, result.latency_ms, { buckets: Array.isArray(result.value) ? result.value.length : 0 });
}

async function probeMail(definition = PROBE_DEFINITIONS[7], deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const ingestEnabled = String(process.env.MAILBOX_INGEST_ENABLED || "").toLowerCase() === "true";
  const syncEnabled = String(process.env.MAILBOX_INVOICE_SYNC_ENABLED || "").toLowerCase() === "true";
  if (!ingestEnabled && !syncEnabled) {
    return componentResult(definition, "unknown", null, { reason: "DESHABILITADO" });
  }
  try {
    const last = await db.invoiceProcessedEmail.findFirst({
      orderBy: { created_at: "desc" },
      select: { created_at: true, status: true }
    });
    if (!last) {
      return componentResult(definition, "unknown", null, { reason: "SIN_CORREOS_PROCESADOS" });
    }
    const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(last.created_at).getTime()) / 60000));
    const expectedMinutes = Math.max(1, Number(process.env.MAILBOX_INGEST_INTERVAL_MINUTES || 15));
    const status = ageMinutes > expectedMinutes * 4 ? "degraded" : "ok";
    return componentResult(definition, status, null, { last_processed_at: new Date(last.created_at).toISOString(), age_minutes: ageMinutes, last_status: last.status });
  } catch (error) {
    return componentResult(definition, "down", null, { error: error.message });
  }
}

async function probeWebsocket(definition = PROBE_DEFINITIONS[8], deps = {}) {
  let ws;
  try {
    ws = deps.ws || require("../../fabric/wsManager");
  } catch (error) {
    return componentResult(definition, "down", null, { error: error.message });
  }
  try {
    const stats = typeof ws.stats === "function" ? ws.stats() : { clients: 0, tenants: 0 };
    return componentResult(definition, "ok", 0, stats);
  } catch (error) {
    return componentResult(definition, "down", null, { error: error.message });
  }
}

const PROBE_FUNCTIONS = {
  api: probeApi,
  db: probeDatabase,
  redis: probeRedis,
  queues: probeQueues,
  crons: probeCrons,
  brain: probeBrain,
  minio: probeMinio,
  mail: probeMail,
  websocket: probeWebsocket
};

async function collectAll(deps = {}) {
  const only = Array.isArray(deps.keys) && deps.keys.length ? new Set(deps.keys) : null;
  const definitions = only ? PROBE_DEFINITIONS.filter((definition) => only.has(definition.key)) : PROBE_DEFINITIONS;
  const settled = await Promise.allSettled(definitions.map((definition) => {
    const probe = PROBE_FUNCTIONS[definition.key];
    return probe(definition, deps);
  }));
  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return componentResult(definitions[index], "unknown", null, { error: result.reason?.message || "PROBE_FAILED" });
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  CRON_EXPECTATIONS_SECONDS,
  PROBE_DEFINITIONS,
  PROBE_FUNCTIONS,
  collectAll,
  scoreFor,
  componentResult,
  withTimeout
};
