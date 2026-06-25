const prisma = require("../core/prisma");
const { redactSensitive } = require("../security/policy");

const PLATFORM_LOG_MODULE = "platform_logs";

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function routeModule(path = "") {
  const parts = cleanText(path).split("?")[0].split("/").filter(Boolean);
  const apiIndex = parts.findIndex((part) => part === "v1");
  return parts[apiIndex + 1] || parts[0] || "platform";
}

function logLevel(statusCode, source = "") {
  if (source === "frontend") return "error";
  if (Number(statusCode) >= 500) return "error";
  if (Number(statusCode) >= 400) return "warning";
  return "info";
}

function dto(row) {
  const value = row.new_value || {};
  return {
    id: String(row.id),
    at: row.timestamp,
    source: value.source || "api",
    level: value.level || logLevel(value.status_code),
    module: value.module || row.entity || row.module,
    action: row.action,
    route: value.route || row.entity,
    method: value.method || "",
    status_code: value.status_code || null,
    code: value.code || "",
    message: value.message || "",
    request_id: value.request_id || "",
    user_id: row.user_id || null,
    detail: value.detail || "",
    metadata: value.metadata || {}
  };
}

async function recordPlatformLog(input = {}) {
  const tenantId = cleanText(input.tenant_id);
  if (!tenantId) return null;
  const route = cleanText(input.route || input.entity || "platform");
  const source = cleanText(input.source || "api");
  const moduleName = cleanText(input.module || routeModule(route));
  const statusCode = input.status_code == null ? null : Number(input.status_code);
  const payload = redactSensitive({
    source,
    level: cleanText(input.level || logLevel(statusCode, source)),
    module: moduleName,
    route,
    method: cleanText(input.method),
    status_code: statusCode,
    code: cleanText(input.code),
    message: cleanText(input.message || input.error || "Evento tecnico registrado"),
    request_id: cleanText(input.request_id),
    detail: cleanText(input.detail).slice(0, 2000),
    stack: cleanText(input.stack).split("\n").slice(0, 6).join("\n"),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  });

  return prisma.runWithTenant(tenantId, () => prisma.auditLog.create({
    data: {
      tenant_id: tenantId,
      user_id: input.user_id || null,
      action: cleanText(input.action || `${source}.${payload.level}`),
      module: PLATFORM_LOG_MODULE,
      entity: moduleName,
      entity_id: cleanText(input.entity_id) || undefined,
      new_value: payload,
      ip: cleanText(input.ip) || undefined,
      user_agent: cleanText(input.user_agent) || undefined
    }
  })).catch(() => null);
}

async function listPlatformLogs(tenantId, query = {}) {
  const normalizedTenantId = cleanText(tenantId);
  const source = cleanText(query.source);
  const level = cleanText(query.level);
  const moduleName = cleanText(query.module);
  const take = Math.min(Math.max(Number(query.limit || 80), 1), 200);
  const rows = await prisma.runWithTenant(normalizedTenantId, () => prisma.auditLog.findMany({
    where: { module: PLATFORM_LOG_MODULE },
    orderBy: { timestamp: "desc" },
    take: 200
  }));
  return rows
    .map(dto)
    .filter((row) => !source || row.source === source)
    .filter((row) => !level || row.level === level)
    .filter((row) => !moduleName || row.module === moduleName)
    .slice(0, take);
}

module.exports = { listPlatformLogs, recordPlatformLog, routeModule };
