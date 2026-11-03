"use strict";

const defaultPrisma = require("../../core/prisma");

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const MAX_SESSIONS = 5000;
const DEFAULT_TENANT_LIMIT = 200;

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function clampDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, Math.floor(parsed)));
}

function periodStart(now, days) {
  const start = startOfUtcDay(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function daySeries(now, days) {
  const start = periodStart(now, days);
  const series = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start.getTime());
    date.setUTCDate(date.getUTCDate() + index);
    series.push({ date: dayKey(date), audit: 0, events: 0, total: 0 });
  }
  return series;
}

function applyDaily(series, rows, field) {
  const byDay = new Map(series.map((item) => [item.date, item]));
  for (const row of Array.isArray(rows) ? rows : []) {
    const entry = byDay.get(String(row.day || ""));
    if (!entry) continue;
    entry[field] = Number(row.total || 0);
    entry.total = entry.audit + entry.events;
  }
  return series;
}

function minutesAgo(value, now) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function crossTenantEnabled(env = process.env) {
  const flag = String(env.APEX_CONTROL_CROSS_TENANT || "").trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  const appEnv = String(env.APP_ENV || "").trim().toLowerCase();
  if (["qa", "production", "prod", "staging"].includes(appEnv)) return false;
  return appEnv === "local" || env.NODE_ENV === "development";
}

function crossTenantTenants(env = process.env) {
  return String(env.APEX_CONTROL_CROSS_TENANT_TENANTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function wsStats(deps) {
  try {
    const manager = deps.wsManager || require("../../fabric/wsManager");
    const stats = typeof manager.stats === "function" ? manager.stats() : null;
    return {
      clients: Number(stats && stats.clients) || 0,
      tenants: Number(stats && stats.tenants) || 0,
      scope: "process"
    };
  } catch {
    return { clients: 0, tenants: 0, scope: "process", unavailable: true };
  }
}

async function dailyCounts(db, tenantId, since) {
  const [auditRows, eventRows] = await Promise.all([
    db.$queryRaw`
      SELECT to_char(date_trunc('day', "timestamp"), 'YYYY-MM-DD') AS day, count(*)::int AS total
      FROM "AuditLog"
      WHERE tenant_id = ${tenantId} AND "timestamp" >= ${since}
      GROUP BY 1
      ORDER BY 1`,
    db.$queryRaw`
      SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day, count(*)::int AS total
      FROM apex_events
      WHERE tenant_id = ${tenantId} AND occurred_at >= ${since}
      GROUP BY 1
      ORDER BY 1`
  ]);
  return { auditRows, eventRows };
}

async function getActivity(tenantId, query = {}, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const now = deps.now instanceof Date ? deps.now : new Date();
  const days = clampDays(query.days);
  const since = periodStart(now, days);

  const [daily, tenant, activeUsers, sessions, lastAudit, lastEvent, gps] = await Promise.all([
    dailyCounts(db, tenantId, since),
    db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, plan: true, active: true } }),
    db.user.count({ where: { tenant_id: tenantId, active: true } }),
    db.authorizationSession.findMany({
      where: { tenant_id: tenantId, revoked_at: null, expires_at: { gt: now } },
      select: { user_id: true, last_seen_at: true },
      take: MAX_SESSIONS
    }),
    db.auditLog.aggregate({ where: { tenant_id: tenantId }, _max: { timestamp: true } }),
    db.apexEvent.aggregate({ where: { tenant_id: tenantId }, _max: { occurred_at: true } }),
    db.gpsPing.aggregate({
      where: { tenant_id: tenantId, captured_at: { gte: since } },
      _count: { _all: true },
      _max: { captured_at: true }
    })
  ]);

  const series = applyDaily(applyDaily(daySeries(now, days), daily.auditRows, "audit"), daily.eventRows, "events");
  const todayKey = dayKey(now);
  const today = series.find((item) => item.date === todayKey) || { total: 0 };
  const period = series.reduce((sum, item) => sum + item.total, 0);
  const sessionUsers = new Set(sessions.map((session) => session.user_id));
  const lastSeen = sessions.reduce((latest, session) => {
    const value = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
    return value > latest ? value : latest;
  }, 0);
  const lastPing = gps && gps._max ? gps._max.captured_at : null;
  const lastActivityAt = [lastAudit && lastAudit._max && lastAudit._max.timestamp, lastEvent && lastEvent._max && lastEvent._max.occurred_at]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .reduce((latest, value) => Math.max(latest, value), 0);

  return {
    generated_at: now.toISOString(),
    scope: "tenant",
    days,
    tenant: tenant ? { id: tenant.id, name: tenant.name, plan: tenant.plan, active: tenant.active !== false } : { id: tenantId, name: null, plan: null, active: true },
    daily: series,
    activity: {
      today: today.total || 0,
      period,
      last_activity_at: lastActivityAt ? new Date(lastActivityAt).toISOString() : null,
      last_activity_age_minutes: lastActivityAt ? minutesAgo(lastActivityAt, now) : null,
      active_users: activeUsers
    },
    connections: {
      active_sessions: sessions.length,
      distinct_users: sessionUsers.size,
      last_seen_at: lastSeen ? new Date(lastSeen).toISOString() : null,
      last_seen_age_minutes: lastSeen ? minutesAgo(lastSeen, now) : null,
      websocket: wsStats(deps),
      gps: {
        pings_period: Number(gps && gps._count ? gps._count._all : 0) || 0,
        last_ping_at: iso(lastPing),
        last_ping_age_minutes: lastPing ? minutesAgo(lastPing, now) : null
      }
    }
  };
}

function tenantStatus(tenant, activity, sessions, gpsPeriod) {
  if (tenant.active === false) return "unknown";
  if (sessions > 0 || activity > 0 || gpsPeriod > 0) return "ok";
  return "degraded";
}

async function getTenants(query = {}, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const now = deps.now instanceof Date ? deps.now : new Date();
  const days = clampDays(query.days);
  const since = periodStart(now, days);
  const allowlist = crossTenantTenants(deps.env || process.env);
  const limit = Math.min(DEFAULT_TENANT_LIMIT, Math.max(1, Number(deps.limit) || DEFAULT_TENANT_LIMIT));

  const tenantWhere = allowlist.length ? { id: { in: allowlist } } : {};
  const scoped = (where) => (allowlist.length ? { ...where, tenant_id: { in: allowlist } } : where);

  const [tenants, users, sessions, audit, events, gps] = await Promise.all([
    db.tenant.findMany({
      where: tenantWhere,
      select: { id: true, name: true, plan: true, active: true, active_modules: true },
      orderBy: { name: "asc" },
      take: limit
    }),
    db.user.groupBy({
      by: ["tenant_id"],
      where: scoped({ active: true }),
      _count: { _all: true },
      _max: { last_login: true }
    }),
    db.authorizationSession.groupBy({
      by: ["tenant_id"],
      where: scoped({ revoked_at: null, expires_at: { gt: now } }),
      _count: { _all: true },
      _max: { last_seen_at: true }
    }),
    db.auditLog.groupBy({
      by: ["tenant_id"],
      where: scoped({ timestamp: { gte: since } }),
      _count: { _all: true },
      _max: { timestamp: true }
    }),
    db.apexEvent.groupBy({
      by: ["tenant_id"],
      where: scoped({ tenant_id: { not: null }, occurred_at: { gte: since } }),
      _count: { _all: true }
    }),
    db.gpsPing.groupBy({
      by: ["tenant_id"],
      where: scoped({ captured_at: { gte: since } }),
      _count: { _all: true },
      _max: { captured_at: true }
    })
  ]);

  const index = (rows, maxField) => new Map((rows || [])
    .filter((row) => row && row.tenant_id)
    .map((row) => [String(row.tenant_id), {
      count: Number(row._count && row._count._all) || 0,
      max: maxField ? row._max && row._max[maxField] : null
    }]));
  const usersById = index(users, "last_login");
  const sessionsById = index(sessions, "last_seen_at");
  const auditById = index(audit, "timestamp");
  const eventsById = index(events);
  const gpsById = index(gps, "captured_at");

  const rows = tenants.map((tenant) => {
    const id = String(tenant.id);
    const userStats = usersById.get(id) || { count: 0, max: null };
    const sessionStats = sessionsById.get(id) || { count: 0, max: null };
    const auditStats = auditById.get(id) || { count: 0, max: null };
    const eventStats = eventsById.get(id) || { count: 0, max: null };
    const gpsStats = gpsById.get(id) || { count: 0, max: null };
    const activity = auditStats.count + eventStats.count;
    const lastActivity = [auditStats.max, eventStats.max]
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .reduce((latest, value) => Math.max(latest, value), 0);
    return {
      tenant_id: id,
      name: tenant.name,
      plan: tenant.plan || null,
      active: tenant.active !== false,
      modules: Array.isArray(tenant.active_modules) ? tenant.active_modules.length : 0,
      users_active: userStats.count,
      last_login_at: iso(userStats.max),
      sessions_active: sessionStats.count,
      last_seen_at: iso(sessionStats.max),
      activity_period: activity,
      last_activity_at: lastActivity ? new Date(lastActivity).toISOString() : null,
      gps_period: gpsStats.count,
      last_ping_at: iso(gpsStats.max),
      status: tenantStatus(tenant, activity, sessionStats.count, gpsStats.count)
    };
  });

  const summary = {
    total: rows.length,
    active: rows.filter((row) => row.active).length,
    with_activity: rows.filter((row) => row.activity_period > 0).length,
    with_sessions: rows.filter((row) => row.sessions_active > 0).length,
    with_gps: rows.filter((row) => row.gps_period > 0).length
  };

  return {
    generated_at: now.toISOString(),
    scope: "cross-tenant",
    days,
    restricted: allowlist.length > 0,
    allowlist,
    summary,
    tenants: rows
  };
}

module.exports = {
  getActivity,
  getTenants,
  crossTenantEnabled,
  crossTenantTenants,
  daySeries,
  clampDays
};
