"use strict";

const { redact } = require("./security");

// Catalogo de respaldo cuando el ambiente no entrega token de lectura. Mantiene
// los mismos modulos que APEX Control para que la torre nunca invente salud:
// sin token solo se conoce el estado de los servicios que respaldan cada modulo.
const MODULE_CATALOG = [
  { key: "inventario", name: "Inventario", group: "Operacion", dependsOn: ["db", "queues"] },
  { key: "compras", name: "Compras", group: "Operacion", dependsOn: ["db", "queues"] },
  { key: "ventas", name: "Ventas", group: "Comercial", dependsOn: ["db", "queues"] },
  { key: "facturacion", name: "Facturacion", group: "Finanzas", dependsOn: ["db", "queues"] },
  { key: "cxc", name: "Cartera y CxC", group: "Finanzas", dependsOn: ["db"] },
  { key: "contabilidad", name: "Contabilidad", group: "Finanzas", dependsOn: ["db"] },
  { key: "tesoreria", name: "Tesoreria", group: "Finanzas", dependsOn: ["db"] },
  { key: "costos", name: "Costos", group: "Finanzas", dependsOn: ["db"] },
  { key: "gastos-menores", name: "Gastos Menores", group: "Finanzas", dependsOn: ["db"] },
  { key: "transporte", name: "Transporte", group: "Operacion", dependsOn: ["db", "redis", "brain"] },
  { key: "comercio-exterior", name: "Comercio exterior", group: "Operacion", dependsOn: ["db"] },
  { key: "talento-humano", name: "Talento Humano", group: "Talento", dependsOn: ["db", "queues", "crons"] },
  { key: "servicios", name: "Servicios", group: "Operacion", dependsOn: ["db", "queues"] },
  { key: "proyectos", name: "Proyectos", group: "Operacion", dependsOn: ["db"] },
  { key: "crm", name: "CRM", group: "Comercial", dependsOn: ["db"] },
  { key: "gestion-comercial", name: "Gestion Comercial", group: "Comercial", dependsOn: ["db"] },
  { key: "comercio", name: "Comercio", group: "Comercial", dependsOn: ["db"] },
  { key: "reportes", name: "Apex Heart", group: "Inteligencia", dependsOn: ["db", "brain", "crons"] },
  { key: "apex-ai", name: "APEX AI Core", group: "Inteligencia", dependsOn: ["db", "brain"] },
  { key: "administracion", name: "Administracion APEX", group: "Plataforma", dependsOn: ["db"] },
  { key: "facturacion-electronica", name: "Facturacion electronica", group: "Finanzas", dependsOn: ["db", "mail"] },
  { key: "suscripciones", name: "Suscripciones", group: "Plataforma", dependsOn: ["db"] },
  { key: "apex-control", name: "APEX Control", group: "Plataforma", dependsOn: ["db", "api", "redis"] },
  { key: "produccion", name: "Produccion", group: "Operacion", dependsOn: ["db"] },
  { key: "recetas", name: "Recetas y BOM", group: "Operacion", dependsOn: ["db"] },
  { key: "punto-de-venta", name: "Punto de venta", group: "Comercial", dependsOn: ["db", "queues"] },
  { key: "presupuestos", name: "Presupuestos", group: "Finanzas", dependsOn: ["db"] },
  { key: "devoluciones", name: "Devoluciones", group: "Operacion", dependsOn: ["db"] },
  { key: "calidad", name: "Calidad", group: "Operacion", dependsOn: ["db"] },
  { key: "activos", name: "Activos y mantenimiento", group: "Operacion", dependsOn: ["db"] },
  { key: "planeacion-demanda", name: "Planeacion de demanda", group: "Inteligencia", dependsOn: ["db", "brain"] },
  { key: "configuracion-inicial", name: "Configuracion inicial", group: "Plataforma", dependsOn: ["db", "api"] }
];

const COMPONENT_LABELS = {
  api: "API",
  db: "PostgreSQL",
  redis: "Redis",
  queues: "Colas BullMQ",
  crons: "Crons",
  brain: "APEX Brain",
  minio: "Almacenamiento",
  mail: "Correo",
  websocket: "WebSocket"
};

const REASON_DETAIL = {
  SIN_TOKEN: "Sin token de lectura para datos por modulo; se muestra solo la salud de servicios.",
  TOKEN_INVALIDO: "Token APEX Control invalido o sin permiso; se muestra solo la salud de servicios.",
  NO_DISPONIBLE: "El ambiente no expone salud por modulo; se muestra solo la salud de servicios.",
  MODULO_NO_DESPLEGADO: "El build desplegado en el ambiente no incluye el modulo apex-control; no puede entregar salud por modulo hasta desplegar un build que lo contenga.",
  SIN_CONEXION: "Sin conexion con la API para leer datos por modulo.",
  SIMULACION: "Simulacion activa: salud por modulo omitida.",
  CROSS_TENANT_DESHABILITADO: "La lectura de salud entre empresas esta deshabilitada en este ambiente.",
  PERMISO_DENEGADO: "El token de la torre no tiene permiso para leer la salud de otras empresas.",
  EMPRESA_FUERA_DE_ALCANCE: "La empresa esta fuera de la allowlist autorizada para lectura entre empresas.",
  EMPRESA_NO_ENCONTRADA: "La empresa solicitada no existe en este ambiente.",
  EMPRESA_ID_INVALIDO: "El identificador de empresa no es valido."
};

function summaryOf(modules) {
  const summary = { total: modules.length, ok: 0, degraded: 0, down: 0, unknown: 0 };
  for (const module of modules) summary[module.status] = (summary[module.status] || 0) + 1;
  return summary;
}

function catalogPayload(reason) {
  const modules = MODULE_CATALOG.map((entry) => ({
    key: entry.key,
    name: entry.name,
    group: entry.group,
    declared: null,
    status: "unknown",
    data: null,
    services: entry.dependsOn.map((key) => ({ key, label: COMPONENT_LABELS[key] || key, status: "unknown" })),
    alerts: [],
    detail: REASON_DETAIL[reason] || "Sin datos por modulo."
  }));
  return {
    source: "catalog",
    configured: false,
    reason,
    generated_at: new Date().toISOString(),
    summary: summaryOf(modules),
    modules
  };
}

function normalizeApiPayload(json) {
  const modules = Array.isArray(json.modules) ? json.modules : [];
  if (!modules.length) return null;
  return {
    source: "api",
    configured: true,
    reason: null,
    generated_at: json.generated_at || new Date().toISOString(),
    scope: json.scope || "tenant",
    tenant: json.tenant || null,
    summary: json.summary && typeof json.summary === "object" ? json.summary : summaryOf(modules),
    modules: modules.map((module) => ({
      key: String(module.key || ""),
      name: String(module.name || module.key || ""),
      group: module.group || "Operacion",
      declared: module.declared !== false,
      status: ["ok", "degraded", "down", "unknown"].includes(module.status) ? module.status : "unknown",
      data: module.data || null,
      services: Array.isArray(module.services) ? module.services : [],
      alerts: Array.isArray(module.alerts) ? module.alerts.slice(0, 3) : [],
      detail: module.detail || null
    })).filter((module) => module.key)
  };
}

function checkIdFor(environmentId, key) {
  return environmentId === "local" ? key : `${environmentId}.${key}`;
}

function serviceStatusFromChecks(checksById, environmentId, key) {
  const check = checksById.get(checkIdFor(environmentId, key));
  return check && check.status ? check.status : "unknown";
}

function enrichWithChecks(payload, checks, environmentId) {
  const checksById = new Map((checks || []).map((check) => [check.id, check]));
  const modules = payload.modules.map((module) => {
    const services = (module.services && module.services.length ? module.services : [])
      .map((service) => {
        const observed = serviceStatusFromChecks(checksById, environmentId, service.key);
        const status = service.status && service.status !== "unknown" ? service.status : observed;
        return { ...service, label: service.label || COMPONENT_LABELS[service.key] || service.key, status };
      });
    if (!services.length) {
      const entry = MODULE_CATALOG.find((item) => item.key === module.key);
      for (const key of (entry ? entry.dependsOn : [])) {
        services.push({ key, label: COMPONENT_LABELS[key] || key, status: serviceStatusFromChecks(checksById, environmentId, key) });
      }
    }
    let status = module.status;
    if (payload.source === "catalog") {
      if (services.some((service) => service.status === "down")) status = "down";
      else if (services.some((service) => service.status === "degraded")) status = "degraded";
      else status = "unknown";
    }
    return { ...module, services, status };
  });
  const summary = summaryOf(modules);
  const records = Number.isFinite(payload.summary && payload.summary.records)
    ? payload.summary.records
    : modules.reduce((total, module) => total + (module.data && Number.isFinite(module.data.records) ? module.data.records : 0), 0);
  if (records > 0) summary.records = records;
  return { ...payload, modules, summary };
}

function moduleChecks(payload, environment) {
  const environmentId = environment.id;
  const short = environment.short || environmentId.toUpperCase();
  const checks = payload.modules.map((module) => ({
    id: `${environmentId}.module.${module.key}`,
    label: `Modulo ${module.name}`,
    environment: environmentId,
    status: module.status,
    severity: "medium",
    critical: false,
    optional: true,
    informational: true,
    group: "module",
    moduleKey: module.key,
    detail: module.detail,
    durationMs: 0,
    source: "modules",
    checkedAt: payload.generated_at,
    functional: module.status === "down" ? `El modulo ${module.name} no puede operar mientras su dependencia siga caida.` : null,
    technical: {
      source: payload.source,
      records: module.data ? module.data.records : null,
      last_activity_at: module.data ? module.data.last_activity_at : null,
      age_minutes: module.data ? module.data.age_minutes : null,
      expected_minutes: module.data ? module.data.expected_minutes : null,
      services: module.services,
      alerts: module.alerts
    }
  }));

  const summary = payload.summary;
  const hasApiData = payload.source === "api";
  const detail = hasApiData
    ? `${summary.ok}/${summary.total} modulos sanos · ${summary.degraded} degradados · ${summary.down} caidos · ${summary.unknown} sin dato`
    : `${REASON_DETAIL[payload.reason] || "Sin datos por modulo."} ${summary.down} con dependencia caida de ${summary.total}.`;
  checks.push({
    id: `${environmentId}.modules`,
    label: `Modulos ${short}`,
    environment: environmentId,
    status: summary.down > 0 || summary.degraded > 0 ? "degraded" : hasApiData ? "ok" : "unknown",
    severity: "high",
    critical: false,
    optional: !hasApiData,
    group: "module",
    detail,
    durationMs: 0,
    source: "modules",
    checkedAt: payload.generated_at,
    technical: {
      source: payload.source,
      configured: payload.configured,
      reason: payload.reason,
      summary
    }
  });
  return checks;
}

async function requestModules(config, environment, path, token, { httpRequest, fetchImpl = global.fetch } = {}) {
  const url = `${environment.apiBaseUrl}${path}`;
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (httpRequest) {
    return httpRequest(url, { timeoutMs: config.environmentTimeoutMs, headers });
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), config.environmentTimeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      headers: { ...headers, accept: "application/json" },
      signal: controller ? controller.signal : undefined
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json, error: null };
  } catch (error) {
    return { ok: false, status: 0, json: null, error: redact(String(error && error.message ? error.message : error)) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchModules(config, environment, { httpRequest, fetchImpl = global.fetch, now = new Date(), tenantId = null } = {}) {
  if (config.simulation) return catalogPayload("SIMULACION");
  // El token global apunta a la API local; un ambiente remoto solo usa el suyo.
  const fallback = environment.id === "local" ? config.apexToken : "";
  const token = environment.apexToken || fallback || "";
  if (!environment.apiBaseUrl) return catalogPayload("NO_DISPONIBLE");

  const scope = tenantId ? String(tenantId).trim() : "";
  if (tenantId && !/^[A-Za-z0-9_-]{4,64}$/.test(scope)) return catalogPayload("EMPRESA_ID_INVALIDO");
  const path = scope
    ? `/api/v1/apex-control/tenants/${encodeURIComponent(scope)}/modules`
    : "/api/v1/apex-control/modules";

  // Sin token tambien se consulta la ruta: el codigo HTTP distingue "falta la
  // credencial" (401) de "el build no trae el modulo" (404). Adivinar la causa
  // fue lo que dejo a QA y PROD como SIN_TOKEN cuando su build era anterior.
  const result = await requestModules(config, environment, path, token, { httpRequest, fetchImpl });

  if (result.error || result.status === 0) return catalogPayload("SIN_CONEXION");
  const responseCode = result.json && result.json.code;
  if (result.status === 404) return catalogPayload(REASON_DETAIL[responseCode] ? responseCode : "MODULO_NO_DESPLEGADO");
  if (!token) return catalogPayload(result.status === 403 ? "TOKEN_INVALIDO" : "SIN_TOKEN");
  if (result.status === 401) return catalogPayload("TOKEN_INVALIDO");
  if (result.status === 403) return catalogPayload(REASON_DETAIL[responseCode] ? responseCode : "TOKEN_INVALIDO");
  if (result.status === 400) return catalogPayload(REASON_DETAIL[responseCode] ? responseCode : "EMPRESA_ID_INVALIDO");
  if (!result.ok || !result.json) return catalogPayload("NO_DISPONIBLE");
  const payload = normalizeApiPayload(result.json);
  if (!payload) return catalogPayload("NO_DISPONIBLE");
  payload.checkedAt = now.toISOString();
  return payload;
}

module.exports = {
  MODULE_CATALOG,
  COMPONENT_LABELS,
  REASON_DETAIL,
  fetchModules,
  enrichWithChecks,
  moduleChecks,
  summaryOf,
  checkIdFor
};
