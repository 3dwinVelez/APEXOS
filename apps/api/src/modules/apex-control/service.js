"use strict";

const defaultPrisma = require("../../core/prisma");
const { computeOverall } = require("./pulse");
const { PROBE_DEFINITIONS, scoreFor } = require("./probes");
const { getModules: computeModules } = require("./modules");
const { getActivity: computeActivity, getTenants: computeTenants } = require("./activity");

const COMPONENT_KEYS = PROBE_DEFINITIONS.map((definition) => definition.key);
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const ACTIVE_STATUSES = ["open", "acknowledged"];

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseId(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) {
    throw Object.assign(new Error("Identificador invalido"), { statusCode: 400, code: "ID_INVALIDO" });
  }
  return BigInt(raw);
}

function serializeEvent(event) {
  return {
    id: String(event.id),
    tenant_id: event.tenant_id || null,
    source: event.source,
    kind: event.kind,
    severity: event.severity,
    component_key: event.component_key || null,
    entity_type: event.entity_type || null,
    entity_id: event.entity_id || null,
    fingerprint: event.fingerprint,
    correlation_id: event.correlation_id || null,
    payload: event.payload || {},
    occurred_at: iso(event.occurred_at)
  };
}

function serializeIncident(incident) {
  return {
    id: String(incident.id),
    tenant_id: incident.tenant_id || null,
    component_key: incident.component_key,
    severity: incident.severity,
    status: incident.status,
    title: incident.title,
    summary: incident.summary,
    fingerprint: incident.fingerprint,
    first_seen: iso(incident.first_seen),
    last_seen: iso(incident.last_seen),
    acknowledged_at: iso(incident.acknowledged_at),
    acknowledged_by: incident.acknowledged_by ?? null,
    resolved_at: iso(incident.resolved_at),
    evidence: incident.evidence || {}
  };
}

function serializeNotification(notification) {
  return {
    id: String(notification.id),
    tenant_id: notification.tenant_id || null,
    user_id: notification.user_id ?? null,
    level: notification.level,
    title: notification.title,
    message: notification.message,
    href: notification.href || null,
    read_at: iso(notification.read_at),
    created_at: iso(notification.created_at)
  };
}

function serializeReportRun(run) {
  return {
    id: String(run.id),
    kind: run.kind,
    period_key: run.period_key,
    status: run.status,
    recipients: run.recipients || [],
    summary: run.summary || {},
    sent_at: iso(run.sent_at),
    created_at: iso(run.created_at)
  };
}

async function latestSamples(db) {
  const rows = await db.apexHealthSample.findMany({
    where: { component_key: { in: COMPONENT_KEYS } },
    orderBy: [{ component_key: "asc" }, { id: "desc" }],
    distinct: ["component_key"]
  });
  return new Map(rows.map((row) => [row.component_key, row]));
}

async function loadComponents(deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const [rows, samples] = await Promise.all([
    db.apexComponent.findMany({
      where: { key: { in: COMPONENT_KEYS } },
      select: { key: true, name: true, kind: true, criticality: true, enabled: true, last_status: true, last_checked_at: true }
    }),
    latestSamples(db)
  ]);
  const byKey = new Map(rows.map((row) => [row.key, row]));

  return PROBE_DEFINITIONS.map((definition) => {
    const row = byKey.get(definition.key);
    const sample = samples.get(definition.key);
    const status = sample?.status || row?.last_status || "unknown";
    return {
      key: definition.key,
      name: row?.name || definition.name,
      kind: row?.kind || definition.kind,
      criticality: row?.criticality || definition.criticality,
      enabled: row ? row.enabled !== false : true,
      status,
      latency_ms: sample?.latency_ms ?? null,
      error_rate: sample?.error_rate ?? null,
      score: sample?.score ?? scoreFor(status),
      details: sample?.details || {},
      last_checked_at: iso(row?.last_checked_at),
      sampled_at: iso(sample?.sampled_at)
    };
  });
}

function tenantScope(tenantId) {
  return [{ tenant_id: null }, { tenant_id: tenantId }];
}

async function getStatus(tenantId, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const [components, incidents, unread, lastReport] = await Promise.all([
    loadComponents(deps),
    listIncidents(tenantId, { status: "active", limit: 20 }, deps),
    db.apexNotification.count({ where: { OR: tenantScope(tenantId), read_at: null } }),
    db.apexReportRun.findFirst({ orderBy: { created_at: "desc" } })
  ]);
  const overall = computeOverall(components.filter((component) => component.enabled));
  return {
    generated_at: new Date().toISOString(),
    status: overall.status,
    score: overall.score,
    counts: overall.counts,
    enabled: String(process.env.APEX_CONTROL_ENABLED || "true").toLowerCase() !== "false",
    interval_ms: Math.max(5000, Number(process.env.APEX_CONTROL_PULSE_MS || 15000)),
    components,
    incidents,
    notifications_unread: unread,
    last_report: lastReport ? serializeReportRun(lastReport) : null
  };
}

async function getModules(tenantId, deps = {}) {
  const components = await loadComponents(deps);
  return computeModules(tenantId, { ...deps, components });
}

async function getTenantModules(tenantId, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, plan: true, active: true }
  });
  if (!tenant) {
    throw Object.assign(new Error("Empresa no encontrada"), { statusCode: 404, code: "EMPRESA_NO_ENCONTRADA" });
  }
  const components = await loadComponents(deps);
  const payload = await computeModules(tenantId, { ...deps, components });
  return {
    ...payload,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      plan: tenant.plan || null,
      active: tenant.active !== false
    }
  };
}

async function getActivity(tenantId, query = {}, deps = {}) {
  return computeActivity(tenantId, query, deps);
}

async function getTenants(query = {}, deps = {}) {
  return computeTenants(query, deps);
}

async function listEvents(tenantId, query = {}, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const where = { OR: tenantScope(tenantId) };
  if (query.kind) where.kind = String(query.kind);
  if (query.severity) where.severity = String(query.severity);
  if (query.component_key) where.component_key = String(query.component_key);
  if (query.since) {
    const since = new Date(query.since);
    if (!Number.isNaN(since.getTime())) where.occurred_at = { gte: since };
  }
  const rows = await db.apexEvent.findMany({
    where,
    orderBy: { id: "desc" },
    take: clampLimit(query.limit)
  });
  return { events: rows.map(serializeEvent), generated_at: new Date().toISOString() };
}

async function listIncidents(tenantId, query = {}, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const status = String(query.status || "active").toLowerCase();
  const where = { OR: tenantScope(tenantId) };
  if (status === "active") where.status = { in: ACTIVE_STATUSES };
  else if (status && status !== "all") where.status = status;
  if (query.component_key) where.component_key = String(query.component_key);
  if (query.severity) where.severity = String(query.severity);

  const rows = await db.apexIncident.findMany({
    where,
    orderBy: [{ last_seen: "desc" }, { id: "desc" }],
    take: clampLimit(query.limit, 50)
  });
  return rows.map(serializeIncident);
}

async function acknowledgeIncident(tenantId, userId, incidentId, context = {}, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const id = parseId(incidentId);
  const incident = await db.apexIncident.findFirst({
    where: { id, OR: tenantScope(tenantId) }
  });
  if (!incident) {
    throw Object.assign(new Error("Incidente no encontrado"), { statusCode: 404, code: "INCIDENTE_NO_ENCONTRADO" });
  }
  if (incident.status === "resolved") {
    throw Object.assign(new Error("El incidente ya fue resuelto"), { statusCode: 409, code: "INCIDENTE_RESUELTO" });
  }

  const acknowledgedAt = incident.acknowledged_at ? incident.acknowledged_at : new Date();
  const updated = await db.apexIncident.update({
    where: { id: incident.id },
    data: {
      status: "acknowledged",
      acknowledged_at: acknowledgedAt,
      acknowledged_by: userId ?? null
    }
  });

  await db.runWithTenant(tenantId, () => db.auditLog.create({
    data: {
      tenant_id: tenantId,
      user_id: userId ?? null,
      action: "ACKNOWLEDGE",
      module: "apex-control",
      entity: "apex_incident",
      entity_id: String(updated.id),
      new_value: { status: updated.status, acknowledged_at: iso(updated.acknowledged_at) },
      ip: context.ip || null,
      user_agent: context.user_agent || null
    }
  }));

  return serializeIncident(updated);
}

async function listNotifications(tenantId, query = {}, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const where = { OR: tenantScope(tenantId) };
  if (String(query.unread || "") === "true") where.read_at = null;
  const rows = await db.apexNotification.findMany({
    where,
    orderBy: { id: "desc" },
    take: clampLimit(query.limit, 50)
  });
  const unread = await db.apexNotification.count({ where: { OR: tenantScope(tenantId), read_at: null } });
  return { notifications: rows.map(serializeNotification), unread };
}

async function markNotificationRead(tenantId, notificationId, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const id = parseId(notificationId);
  const notification = await db.apexNotification.findFirst({
    where: { id, OR: tenantScope(tenantId) }
  });
  if (!notification) {
    throw Object.assign(new Error("Notificacion no encontrada"), { statusCode: 404, code: "NOTIFICACION_NO_ENCONTRADA" });
  }
  if (notification.read_at) return serializeNotification(notification);
  const updated = await db.apexNotification.update({
    where: { id: notification.id },
    data: { read_at: new Date() }
  });
  return serializeNotification(updated);
}

async function markAllNotificationsRead(tenantId, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const result = await db.apexNotification.updateMany({
    where: { OR: tenantScope(tenantId), read_at: null },
    data: { read_at: new Date() }
  });
  return { updated: result.count };
}

async function listReportRuns(tenantId, query = {}, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const rows = await db.apexReportRun.findMany({
    where: { OR: tenantScope(tenantId) },
    orderBy: { created_at: "desc" },
    take: clampLimit(query.limit, 30)
  });
  return rows.map(serializeReportRun);
}

module.exports = {
  getStatus,
  getModules,
  getTenantModules,
  getActivity,
  getTenants,
  loadComponents,
  listEvents,
  listIncidents,
  acknowledgeIncident,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listReportRuns
};
