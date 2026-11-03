"use strict";

const defaultPrisma = require("../../core/prisma");
const { collectAll, scoreFor, PROBE_DEFINITIONS } = require("./probes");
const { emit } = require("./events");

const RESOLVE_STREAK = 2;
const INCIDENT_HREF = "/dashboard/apex-control";
const CRITICAL_WEIGHT = 3;

const logger = {
  info: (message) => console.info(`[apex-control] ${message}`),
  warn: (message) => console.warn(`[apex-control] ${message}`),
  error: (message) => console.error(`[apex-control] ${message}`)
};

function weightOf(component) {
  return component?.criticality === "critical" ? CRITICAL_WEIGHT : 1;
}

function computeOverall(components = []) {
  const counts = { ok: 0, degraded: 0, down: 0, unknown: 0 };
  for (const component of components) {
    if (counts[component.status] == null) continue;
    counts[component.status] += 1;
  }

  const critical = components.filter((c) => c.criticality === "critical");
  const criticalDown = critical.filter((c) => c.status === "down");
  const databaseDown = components.some((c) => c.key === "db" && c.status === "down");
  const hasAnyDown = components.some((c) => c.status === "down");
  const hasCriticalDegraded = critical.some((c) => c.status === "degraded");
  const hasAnyDegraded = components.some((c) => c.status === "degraded");

  // "down" queda para perdida total (base de datos o todos los criticos);
  // una caida parcial de un critico (Redis, por ejemplo) degrada el sistema.
  let status = "ok";
  if (databaseDown || (critical.length > 0 && criticalDown.length === critical.length)) status = "down";
  else if (criticalDown.length || hasAnyDown || hasCriticalDegraded || hasAnyDegraded) status = "degraded";
  else if (!counts.ok) status = "unknown";

  const weightSum = components.reduce((sum, component) => sum + weightOf(component), 0) || 1;
  const weighted = components.reduce((sum, component) => sum + scoreFor(component.status) * weightOf(component), 0);
  return { status, score: Math.round(weighted / weightSum), counts };
}

function incidentFingerprint(componentKey) {
  return `component:${componentKey}:health`;
}

function incidentSeverity(component) {
  if (component.status === "down") return component.criticality === "critical" ? "critical" : "error";
  return component.criticality === "critical" ? "error" : "warning";
}

function describe(component) {
  if (component.status === "down") return `${component.name} no responde`;
  if (component.status === "degraded") return `${component.name} esta degradado`;
  return `${component.name} recuperado`;
}

function serializableComponent(component) {
  return {
    ...component,
    sampled_at: component.sampled_at || null
  };
}

async function notify(db, ws, payload) {
  let record = null;
  try {
    record = await db.apexNotification.create({
      data: {
        tenant_id: payload.tenant_id || null,
        user_id: payload.user_id || null,
        level: payload.level,
        title: payload.title,
        message: payload.message,
        href: payload.href || INCIDENT_HREF
      }
    });
  } catch (error) {
    logger.warn(`no se pudo crear la notificacion "${payload.title}": ${error.message}`);
  }
  try {
    ws.broadcastAll({
      type: "apex-control:notification",
      data: {
        id: record?.id == null ? null : String(record.id),
        level: payload.level,
        title: payload.title,
        message: payload.message,
        href: payload.href || INCIDENT_HREF,
        created_at: new Date().toISOString()
      }
    });
  } catch {
    // El push es best-effort.
  }
}

async function openOrTouchIncident(db, component, now, deps) {
  const fingerprint = incidentFingerprint(component.key);
  const severity = incidentSeverity(component);
  const title = `${component.name}: ${component.status}`;
  const summary = describe(component);
  const evidence = {
    status: component.status,
    latency_ms: component.latency_ms,
    score: component.score,
    details: component.details
  };

  const open = await db.apexIncident.findFirst({
    where: { fingerprint, status: { in: ["open", "acknowledged"] } },
    orderBy: { id: "desc" }
  });

  if (open) {
    await db.apexIncident.update({
      where: { id: open.id },
      data: { severity, title, summary, last_seen: now, evidence }
    });
    return { incident: open, opened: false };
  }

  const created = await db.apexIncident.create({
    data: {
      tenant_id: null,
      component_key: component.key,
      severity,
      status: "open",
      title,
      summary,
      fingerprint,
      first_seen: now,
      last_seen: now,
      evidence
    }
  });

  await emit({
    source: "apex-control",
    kind: "incident.opened",
    severity,
    component_key: component.key,
    entity_type: "apex_incident",
    entity_id: String(created.id),
    fingerprint,
    payload: evidence
  }, deps);

  await notify(db, deps.ws || require("../../fabric/wsManager"), {
    level: severity === "critical" ? "critical" : severity === "warning" ? "warning" : "error",
    title: `Incidente abierto: ${component.name}`,
    message: `${summary}. Revisa la Torre de Control.`,
    href: INCIDENT_HREF
  });

  return { incident: created, opened: true };
}

async function consecutiveStatuses(db, componentKey, take) {
  const samples = await db.apexHealthSample.findMany({
    where: { component_key: componentKey },
    orderBy: { id: "desc" },
    take,
    select: { status: true }
  });
  return samples.map((sample) => sample.status);
}

async function resolveIfRecovered(db, component, now, deps) {
  const samples = await consecutiveStatuses(db, component.key, RESOLVE_STREAK);
  if (samples.length < RESOLVE_STREAK || samples.some((status) => status !== "ok")) return null;

  const fingerprint = incidentFingerprint(component.key);
  const open = await db.apexIncident.findFirst({
    where: { fingerprint, status: { in: ["open", "acknowledged"] } },
    orderBy: { id: "desc" }
  });
  if (!open) return null;

  const resolved = await db.apexIncident.update({
    where: { id: open.id },
    data: {
      status: "resolved",
      resolved_at: now,
      last_seen: now,
      evidence: {
        status: component.status,
        latency_ms: component.latency_ms,
        resolved_after_samples: samples.length
      }
    }
  });

  await emit({
    source: "apex-control",
    kind: "incident.resolved",
    severity: "info",
    component_key: component.key,
    entity_type: "apex_incident",
    entity_id: String(resolved.id),
    fingerprint,
    payload: { status: "ok", resolved_at: now.toISOString() }
  }, deps);

  await notify(db, deps.ws || require("../../fabric/wsManager"), {
    level: "info",
    title: `Incidente resuelto: ${component.name}`,
    message: `${component.name} volvio a responder correctamente.`,
    href: INCIDENT_HREF
  });

  return resolved;
}

async function persistSnapshot(db, components, now) {
  if (components.length) {
    await db.apexHealthSample.createMany({
      data: components.map((component) => ({
        component_key: component.key,
        status: component.status,
        latency_ms: component.latency_ms,
        error_rate: component.error_rate,
        score: component.score,
        details: component.details,
        sampled_at: now
      }))
    });
  }

  for (const component of components) {
    await db.apexComponent.upsert({
      where: { key: component.key },
      create: {
        key: component.key,
        name: component.name,
        kind: component.kind,
        criticality: component.criticality,
        last_status: component.status,
        last_checked_at: now,
        metadata: {}
      },
      update: {
        name: component.name,
        kind: component.kind,
        criticality: component.criticality,
        last_status: component.status,
        last_checked_at: now
      }
    });
  }
}

async function runPulse(deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const ws = deps.ws || require("../../fabric/wsManager");
  const now = deps.now instanceof Date ? deps.now : new Date();
  const collect = deps.collectAll || collectAll;
  const depsWithWs = { ...deps, prisma: db, ws, now };

  const rows = await db.apexComponent.findMany({
    where: { key: { in: PROBE_DEFINITIONS.map((definition) => definition.key) } },
    select: { key: true, enabled: true, last_status: true }
  });
  const previousByKey = new Map(rows.map((row) => [row.key, row]));
  const enabledKeys = PROBE_DEFINITIONS
    .filter((definition) => previousByKey.get(definition.key)?.enabled !== false)
    .map((definition) => definition.key);

  const components = await collect({ ...depsWithWs, keys: enabledKeys });
  const takenAt = now.toISOString();
  const withTimestamp = components.map((component) => ({ ...component, sampled_at: takenAt }));

  await persistSnapshot(db, withTimestamp, now);

  for (const component of components) {
    const previousStatus = previousByKey.get(component.key)?.last_status || "unknown";
    try {
      if (component.status === "down" || component.status === "degraded") {
        await openOrTouchIncident(db, component, now, depsWithWs);
        if (previousStatus !== component.status) {
          await emit({
            source: "apex-control",
            kind: `component.${component.status}`,
            severity: incidentSeverity(component),
            component_key: component.key,
            entity_type: "apex_component",
            entity_id: component.key,
            fingerprint: incidentFingerprint(component.key),
            payload: {
              previous_status: previousStatus,
              status: component.status,
              latency_ms: component.latency_ms,
              details: component.details
            }
          }, depsWithWs);
        }
      } else if (component.status === "ok") {
        await resolveIfRecovered(db, component, now, depsWithWs);
        if (previousStatus !== "ok" && previousStatus !== "unknown") {
          await emit({
            source: "apex-control",
            kind: "component.ok",
            severity: "info",
            component_key: component.key,
            entity_type: "apex_component",
            entity_id: component.key,
            fingerprint: incidentFingerprint(component.key),
            payload: { previous_status: previousStatus, status: "ok" }
          }, depsWithWs);
        }
      }
    } catch (error) {
      logger.error(`fallo al procesar ${component.key}: ${error.message}`);
    }
  }

  const overall = computeOverall(components);
  const snapshot = {
    type: "apex-control:snapshot",
    data: {
      taken_at: takenAt,
      status: overall.status,
      score: overall.score,
      counts: overall.counts,
      components: withTimestamp.map(serializableComponent)
    }
  };

  try {
    ws.broadcastAll(snapshot);
  } catch {
    // Snapshot best-effort: la persistencia ya ocurrio.
  }

  return snapshot.data;
}

function createPulse(options = {}) {
  const intervalMs = Math.max(5000, Number(options.intervalMs || process.env.APEX_CONTROL_PULSE_MS || 15000));
  const log = options.logger || logger;
  let timer = null;
  let inFlight = null;
  let lastSnapshot = null;

  async function runOnce(overrides = {}) {
    if (inFlight) return inFlight;
    inFlight = runPulse({ ...options, ...overrides })
      .then((snapshot) => {
        lastSnapshot = snapshot;
        return snapshot;
      })
      .catch((error) => {
        log.error(`pulso fallido: ${error.message}`);
        return null;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      runOnce().catch(() => undefined);
    }, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    runOnce().catch(() => undefined);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    intervalMs,
    start,
    stop,
    runOnce,
    get lastSnapshot() {
      return lastSnapshot;
    },
    get running() {
      return Boolean(inFlight);
    }
  };
}

module.exports = {
  RESOLVE_STREAK,
  computeOverall,
  incidentFingerprint,
  runPulse,
  createPulse
};
