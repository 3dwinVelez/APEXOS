"use strict";

const crypto = require("node:crypto");
const defaultPrisma = require("../../core/prisma");
const { redactSensitive } = require("../../security/policy");

const SEVERITIES = new Set(["debug", "info", "warning", "error", "critical"]);
const CRON_COMPONENT_KEY = "crons";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeSeverity(value) {
  const severity = clean(value).toLowerCase();
  return SEVERITIES.has(severity) ? severity : "info";
}

function fingerprintOf({ source, kind, component_key, entity_type, entity_id }) {
  const parts = [source, kind, component_key, entity_type, entity_id].map((value) => clean(value) || "-");
  return crypto.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 32);
}

function buildEvent(input = {}) {
  const source = clean(input.source) || "apex-control";
  const kind = clean(input.kind) || "unknown";
  const componentKey = clean(input.component_key) || null;
  const occurredAt = input.occurred_at ? new Date(input.occurred_at) : new Date();
  return {
    tenant_id: clean(input.tenant_id) || null,
    source,
    kind,
    severity: normalizeSeverity(input.severity),
    component_key: componentKey,
    entity_type: clean(input.entity_type) || null,
    entity_id: clean(input.entity_id) || null,
    fingerprint: clean(input.fingerprint) || fingerprintOf({ source, kind, component_key: componentKey, entity_type: input.entity_type, entity_id: input.entity_id }),
    correlation_id: clean(input.correlation_id) || null,
    payload: redactSensitive(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {}),
    occurred_at: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt
  };
}

function serializable(event, id) {
  return {
    ...event,
    id: id == null ? null : String(id),
    occurred_at: event.occurred_at.toISOString()
  };
}

async function emit(input, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const ws = deps.ws || require("../../fabric/wsManager");
  const event = buildEvent(input);
  const dedupeWindow = Number(input.dedupe_window_s ?? deps.dedupe_window_s ?? 0);

  // Un pico de 5xx no debe crear cientos de filas identicas: dentro de la
  // ventana de deduplicacion se reutiliza el ultimo evento del mismo fingerprint.
  if (Number.isFinite(dedupeWindow) && dedupeWindow > 0) {
    const since = new Date(event.occurred_at.getTime() - dedupeWindow * 1000);
    const existing = await db.apexEvent.findFirst({
      where: { fingerprint: event.fingerprint, occurred_at: { gte: since } },
      orderBy: { id: "desc" }
    }).catch(() => null);
    if (existing) return serializable(existing, existing.id);
  }

  const record = await db.apexEvent.create({ data: event }).catch((error) => {
    console.warn(`[apex-control] no se pudo persistir el evento ${event.kind}: ${error.message}`);
    return null;
  });
  const data = serializable(event, record?.id);
  const message = { type: "apex-control:event", data };
  try {
    if (event.tenant_id) ws.broadcast(event.tenant_id, message);
    else ws.broadcastAll(message);
  } catch {
    // El broadcast es best-effort; el evento ya quedo persistido.
  }
  return data;
}

async function recordCronRun(name, status, durationMs, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const at = new Date().toISOString();
  const entry = {
    at,
    status: status === "failed" ? "failed" : "ok",
    duration_ms: Math.max(0, Math.round(Number(durationMs) || 0))
  };

  try {
    const current = await db.apexComponent.findUnique({ where: { key: CRON_COMPONENT_KEY } });
    const metadata = current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata) ? current.metadata : {};
    const lastRuns = metadata.last_runs && typeof metadata.last_runs === "object" && !Array.isArray(metadata.last_runs) ? metadata.last_runs : {};
    lastRuns[name] = entry;
    await db.apexComponent.upsert({
      where: { key: CRON_COMPONENT_KEY },
      create: {
        key: CRON_COMPONENT_KEY,
        name: "Crons",
        kind: "cron",
        criticality: "standard",
        metadata: { last_runs: lastRuns }
      },
      update: { metadata: { ...metadata, last_runs: lastRuns } }
    });
  } catch (error) {
    console.warn(`[apex-control] no se pudo registrar el cron ${name}: ${error.message}`);
  }

  // Solo los fallos generan evento: un cron exitoso cada 30 s inundaria el bus.
  if (entry.status === "failed") {
    return emit({
      source: "cron",
      kind: "cron.failed",
      severity: "error",
      component_key: CRON_COMPONENT_KEY,
      fingerprint: `cron:${name}`,
      payload: { name, ...entry }
    }, deps);
  }
  return null;
}

module.exports = {
  SEVERITIES,
  CRON_COMPONENT_KEY,
  buildEvent,
  emit,
  recordCronRun,
  fingerprintOf
};
