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

// Lista blanca de claves diagnosticas que pueden bajar del servidor al registro tecnico. Nunca el
// cuerpo completo: una selfie en base64 o una cadena de conexion convertirian un rechazo legible
// en una filtracion. Medido en produccion, los 4xx de la marcacion se registraban sin codigo y sin
// detalle, y un bloqueo de secuencia era indistinguible de un rechazo de foto.
const REJECTION_DETAIL_KEYS = [
  "evidence_failure_code",
  "reason",
  "field",
  "declared_mime",
  "sniffed_mime",
  "byte_length",
  "max_bytes",
  "expected_type",
  "punch_type",
  "max_age_hours"
];

// `key=value` compacto y acotado: es lo que lee el instrumento de triage en la columna `detail`.
function rejectionDetailFrom(source) {
  const details = source && typeof source === "object" && source.details && typeof source.details === "object"
    ? source.details
    : source;
  if (!details || typeof details !== "object") return "";
  return REJECTION_DETAIL_KEYS.map((key) => {
    const value = details[key];
    if (value === null || value === undefined || value === "" || typeof value === "object") return null;
    return `${key}=${String(value).slice(0, 40)}`;
  })
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

// Un 4xx que un hook responde con `reply.code(400).send(...)` nunca pasa por `onError`: sin leer la
// respuesta, su registro quedaba en el generico `REQUEST_REJECTED`. Se parsea solo para sacar el
// codigo y la lista blanca; si el cuerpo no es JSON pequeno, se deja el registro como estaba.
function rejectionFromPayload(payload) {
  const empty = { code: "", detail: "" };
  const text = typeof payload === "string" ? payload : Buffer.isBuffer(payload) ? payload.toString("utf8") : "";
  if (!text || text.length > 65536) return empty;
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
  return { code: cleanText(parsed.code), detail: rejectionDetailFrom(parsed) };
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

module.exports = { listPlatformLogs, recordPlatformLog, rejectionDetailFrom, rejectionFromPayload, routeModule };
