"use strict";

const REASON_DETAIL = {
  SIN_TOKEN: "Sin token de lectura para actividad y conexiones.",
  TOKEN_INVALIDO: "Token invalido o sin permiso para actividad.",
  NO_DISPONIBLE: "El ambiente no expone actividad por tenant.",
  MODULO_NO_DESPLEGADO: "El build desplegado en el ambiente no incluye el modulo apex-control.",
  SIN_CONEXION: "Sin conexion con la API para leer actividad.",
  SIMULACION: "Simulacion activa: actividad omitida."
};

const TENANT_REASON_DETAIL = {
  CROSS_TENANT_DESHABILITADO: "La lectura entre empresas esta deshabilitada en este ambiente.",
  PERMISO_DENEGADO: "El token de la torre no tiene permiso de lectura entre empresas.",
  TOKEN_INVALIDO: "La API rechazo la credencial de la torre: esta vencida o revocada.",
  SIN_TOKEN: "Sin credencial propia, la torre no puede listar empresas.",
  MODULO_NO_HABILITADO: "APEX Control no esta habilitado para la empresa del token.",
  NO_DISPONIBLE: "El ambiente no expone la vista por empresa.",
  SIN_CONEXION: "Sin conexion con la API para leer empresas."
};

function emptyPayload(reason, now) {
  return {
    source: "catalog",
    configured: false,
    reason,
    activity: null,
    tenants: null,
    tenantsReason: null,
    checkedAt: now.toISOString()
  };
}

function tenantReasonFrom(status, json, tokenConfigured = true) {
  if (json && json.code && TENANT_REASON_DETAIL[json.code]) return json.code;
  // Un 401 es credencial, no permiso: confundirlos mandaba al dueño a pedir un
  // read_all_tenants que ya tenia, mientras el JWT de la torre estaba vencido.
  if (status === 401) return tokenConfigured ? "TOKEN_INVALIDO" : "SIN_TOKEN";
  if (status === 403) return "PERMISO_DENEGADO";
  if (status === 404) return "NO_DISPONIBLE";
  if (status === 0) return "SIN_CONEXION";
  return "NO_DISPONIBLE";
}

async function requestStatus(httpRequest, url, { timeoutMs, headers }) {
  const result = await httpRequest(url, { timeoutMs, headers });
  if (result && result.ok && result.json) return { ok: true, json: result.json, status: result.status };
  return {
    ok: false,
    status: result ? result.status : 0,
    error: result ? result.error : null,
    json: result ? result.json : null
  };
}

async function fetchActivity(config, environment, { httpRequest, now = new Date() } = {}) {
  if (config.simulation) return emptyPayload("SIMULACION", now);
  const fallback = environment.id === "local" ? config.apexToken : "";
  const token = environment.apexToken || fallback || "";
  if (!environment.apiBaseUrl) return emptyPayload("NO_DISPONIBLE", now);

  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const timeoutMs = config.environmentTimeoutMs;
  const base = `${environment.apiBaseUrl}/api/v1/apex-control`;
  const [activity, tenants] = await Promise.all([
    requestStatus(httpRequest, `${base}/activity`, { timeoutMs, headers }),
    requestStatus(httpRequest, `${base}/tenants`, { timeoutMs, headers })
  ]);

  if (!activity.ok) {
    const reason = activity.status === 404
      ? "MODULO_NO_DESPLEGADO"
      : !token
        ? "SIN_TOKEN"
        : activity.status === 401 || activity.status === 403 ? "TOKEN_INVALIDO" : "SIN_CONEXION";
    return {
      ...emptyPayload(reason, now),
      configured: Boolean(token),
      tenantsReason: tenants.ok ? null : tenantReasonFrom(tenants.status, tenants.json, Boolean(token))
    };
  }

  return {
    source: "api",
    configured: true,
    reason: null,
    activity: activity.json,
    tenants: tenants.ok ? tenants.json : null,
    tenantsReason: tenants.ok ? null : tenantReasonFrom(tenants.status, tenants.json, Boolean(token)),
    checkedAt: now.toISOString()
  };
}

function activityStatus(activity) {
  if (!activity) return "unknown";
  if (activity.connections && activity.connections.active_sessions > 0) return "ok";
  if (activity.activity && activity.activity.period > 0) return "ok";
  return "unknown";
}

function activityChecks(payload, environment) {
  const environmentId = environment.id;
  const activity = payload && payload.activity ? payload.activity : null;
  const status = activityStatus(activity);
  const detail = activity
    ? `${activity.activity.today} actividades hoy · ${activity.activity.period} en ${activity.days} dias · ${activity.connections.active_sessions} conexiones (${activity.connections.distinct_users} usuarios)`
    : (REASON_DETAIL[payload && payload.reason] || "Sin datos de actividad.");
  const tenants = payload && payload.tenants ? payload.tenants : null;
  return [{
    id: `${environmentId}.activity`,
    label: `Actividad ${environment.short || environmentId.toUpperCase()}`,
    environment: environmentId,
    status,
    severity: "low",
    critical: false,
    optional: true,
    informational: true,
    group: "activity",
    detail,
    durationMs: 0,
    source: "activity",
    checkedAt: (payload && payload.checkedAt) || new Date().toISOString(),
    functional: null,
    technical: {
      source: payload ? payload.source : "catalog",
      reason: payload ? payload.reason : null,
      days: activity ? activity.days : null,
      activity: activity ? activity.activity : null,
      connections: activity ? activity.connections : null,
      tenants: tenants ? { scope: tenants.scope, summary: tenants.summary, restricted: tenants.restricted } : null,
      tenantsReason: payload ? payload.tenantsReason : null,
      tenantsDetail: payload && payload.tenantsReason ? TENANT_REASON_DETAIL[payload.tenantsReason] || payload.tenantsReason : null
    }
  }];
}

module.exports = {
  REASON_DETAIL,
  TENANT_REASON_DETAIL,
  fetchActivity,
  activityChecks
};
