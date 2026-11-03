"use strict";

const defaultPrisma = require("../../core/prisma");
const { withTimeout } = require("./probes");

const DEFAULT_TIMEOUT_MS = 2500;
const ACTIVE_STATUSES = ["open", "acknowledged"];

// Catalogo de modulos operativos vivos en APEX. Cada entrada apunta a un
// modelo Prisma verificado; los modulos sin modelo operativo se reportan como
// declarados para que la torre evidencie el hueco en vez de inventar salud.
const MODULE_CATALOG = [
  { key: "inventario", name: "Inventario", group: "Operacion", model: "item", dateField: "updated_at", expectedMinutes: 1440, dependsOn: ["db", "queues"] },
  { key: "compras", name: "Compras", group: "Operacion", model: "transaction", dateField: "updated_at", where: { type: "purchase" }, expectedMinutes: 2880, dependsOn: ["db", "queues"] },
  { key: "ventas", name: "Ventas", group: "Comercial", model: "transaction", dateField: "updated_at", where: { type: "sale" }, expectedMinutes: 1440, dependsOn: ["db", "queues"] },
  { key: "facturacion", name: "Facturacion", group: "Finanzas", model: "salesInvoice", dateField: "updated_at", expectedMinutes: 1440, dependsOn: ["db", "queues"] },
  { key: "cxc", name: "Cartera y CxC", group: "Finanzas", model: "cxcCabdoc", dateField: "updated_at", expectedMinutes: 2880, dependsOn: ["db"] },
  { key: "contabilidad", name: "Contabilidad", group: "Finanzas", model: "cntCabdoc", dateField: "updated_at", expectedMinutes: 2880, dependsOn: ["db"] },
  { key: "tesoreria", name: "Tesoreria", group: "Finanzas", model: "treasuryPayment", dateField: "created_at", expectedMinutes: 2880, dependsOn: ["db"] },
  { key: "costos", name: "Costos", group: "Finanzas", model: "productCost", dateField: "created_at", expectedMinutes: 10080, dependsOn: ["db"] },
  { key: "gastos-menores", name: "Gastos Menores", group: "Finanzas", model: "pettyCashVoucher", dateField: "updated_at", expectedMinutes: 2880, dependsOn: ["db"] },
  { key: "transporte", name: "Transporte", group: "Operacion", model: "transportTrip", dateField: "updated_at", expectedMinutes: 1440, dependsOn: ["db", "redis", "brain"] },
  { key: "comercio-exterior", name: "Comercio exterior", group: "Operacion", model: "purchaseImport", dateField: "updated_at", expectedMinutes: 10080, dependsOn: ["db"] },
  { key: "talento-humano", name: "Talento Humano", group: "Talento", model: "timePunch", dateField: "punched_at", expectedMinutes: 1440, dependsOn: ["db", "queues", "crons"] },
  { key: "servicios", name: "Servicios", group: "Operacion", model: "serviceOrder", dateField: "updated_at", expectedMinutes: 1440, dependsOn: ["db", "queues"] },
  { key: "proyectos", name: "Proyectos", group: "Operacion", model: "project", dateField: "updated_at", expectedMinutes: 10080, dependsOn: ["db"] },
  { key: "crm", name: "CRM", group: "Comercial", model: "party", dateField: "updated_at", expectedMinutes: 10080, dependsOn: ["db"] },
  { key: "gestion-comercial", name: "Gestion Comercial", group: "Comercial", model: "commercialVisit", dateField: "updated_at", expectedMinutes: 2880, dependsOn: ["db"] },
  { key: "comercio", name: "Comercio", group: "Comercial", model: "comercioSale", dateField: "updated_at", expectedMinutes: 1440, dependsOn: ["db"] },
  { key: "reportes", name: "Apex Heart", group: "Inteligencia", model: "apexHeartAlert", dateField: "updated_at", expectedMinutes: 1440, dependsOn: ["db", "brain", "crons"] },
  { key: "apex-ai", name: "APEX AI Core", group: "Inteligencia", model: "brainEvent", dateField: "created_at", expectedMinutes: 1440, dependsOn: ["db", "brain"] },
  { key: "administracion", name: "Administracion APEX", group: "Plataforma", model: "auditLog", dateField: "timestamp", expectedMinutes: 1440, dependsOn: ["db"] },
  { key: "facturacion-electronica", name: "Facturacion electronica", group: "Finanzas", model: "eInvoice", dateField: "updated_at", expectedMinutes: 2880, dependsOn: ["db", "mail"] },
  { key: "suscripciones", name: "Suscripciones", group: "Plataforma", model: "subscription", dateField: "created_at", expectedMinutes: 10080, dependsOn: ["db"] },
  { key: "apex-control", name: "APEX Control", group: "Plataforma", model: "apexHealthSample", dateField: "sampled_at", expectedMinutes: 60, global: true, dependsOn: ["db", "api", "redis"] },
  { key: "produccion", name: "Produccion", group: "Operacion", model: "workOrder", dateField: "created_at", expectedMinutes: 10080, dependsOn: ["db"] },
  { key: "recetas", name: "Recetas y BOM", group: "Operacion", model: "bOM", dateField: "created_at", expectedMinutes: 10080, dependsOn: ["db"] },
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

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clampMinutes(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function statusFromData(entry, rows, lastActivity, now) {
  if (!entry.model) {
    return {
      state: "declared",
      records: null,
      last_activity_at: null,
      age_minutes: null,
      expected_minutes: null
    };
  }
  if (rows === 0) {
    return {
      state: "empty",
      records: 0,
      last_activity_at: null,
      age_minutes: null,
      expected_minutes: entry.expectedMinutes
    };
  }
  const ageMinutes = lastActivity ? clampMinutes((now.getTime() - new Date(lastActivity).getTime()) / 60000) : null;
  const state = ageMinutes != null && ageMinutes > entry.expectedMinutes ? "stale" : "fresh";
  return {
    state,
    records: rows,
    last_activity_at: iso(lastActivity),
    age_minutes: ageMinutes,
    expected_minutes: entry.expectedMinutes
  };
}

function moduleStatus(services, data) {
  if (services.some((service) => service.status === "down")) return "down";
  if (services.some((service) => service.status === "degraded")) return "degraded";
  if (data.state === "stale") return "degraded";
  if (["empty", "declared", "unavailable"].includes(data.state)) return "unknown";
  return "ok";
}

function moduleDetail(name, status, services, data) {
  if (status === "down") {
    const down = services.filter((service) => service.status === "down").map((service) => service.label);
    return `Dependencia caida: ${down.join(", ")}.`;
  }
  if (status === "degraded") {
    const degraded = services.filter((service) => service.status === "degraded").map((service) => service.label);
    if (degraded.length) return `Dependencia degradada: ${degraded.join(", ")}.`;
    return `Sin actividad hace ${data.age_minutes} min (esperado <= ${data.expected_minutes} min).`;
  }
  if (data.state === "declared") return "Modulo declarado sin modelo operativo verificado.";
  if (data.state === "unavailable") return "No se pudo medir el dato del modulo.";
  if (data.state === "empty") return "Sin datos operativos registrados.";
  return `${data.records} registros · ultima actividad hace ${data.age_minutes} min.`;
}

async function measureModule(entry, { db, tenantId, now, timeoutMs }) {
  if (!entry.model) {
    return { records: null, lastActivity: null };
  }
  const delegate = db[entry.model];
  if (!delegate || typeof delegate.aggregate !== "function") {
    throw new Error(`MODELO_SIN_DELEGADO:${entry.model}`);
  }
  const where = entry.global ? { ...(entry.where || {}) } : { ...(entry.where || {}), tenant_id: tenantId };
  const result = await withTimeout(delegate.aggregate({
    where,
    _count: { _all: true },
    _max: { [entry.dateField]: true }
  }), timeoutMs, `module_${entry.key}`);
  return {
    records: Number(result?._count?._all || 0),
    lastActivity: result?._max?.[entry.dateField] || null
  };
}

async function getModules(tenantId, deps = {}) {
  const db = deps.prisma || defaultPrisma;
  const now = deps.now instanceof Date ? deps.now : new Date();
  const timeoutMs = Number(deps.timeoutMs || DEFAULT_TIMEOUT_MS);
  const components = Array.isArray(deps.components) ? deps.components : [];
  const componentByKey = new Map(components.map((component) => [component.key, component]));

  const incidents = deps.incidents || await db.apexIncident.findMany({
    where: {
      OR: [{ tenant_id: null }, { tenant_id: tenantId }],
      status: { in: ACTIVE_STATUSES }
    },
    orderBy: { last_seen: "desc" },
    take: 100
  });

  const modules = await Promise.all(MODULE_CATALOG.map(async (entry) => {
    const services = entry.dependsOn.map((key) => ({
      key,
      label: COMPONENT_LABELS[key] || key,
      status: componentByKey.get(key)?.status || "unknown"
    }));

    let data;
    if (!entry.model) {
      data = statusFromData(entry, null, null, now);
    } else {
      try {
        const measured = await measureModule(entry, { db, tenantId, now, timeoutMs });
        data = statusFromData(entry, measured.records, measured.lastActivity, now);
      } catch (error) {
        data = {
          state: "unavailable",
          records: null,
          last_activity_at: null,
          age_minutes: null,
          expected_minutes: entry.expectedMinutes || null,
          error: error && error.message ? error.message : "MEDICION_FALLIDA"
        };
      }
    }

    const status = moduleStatus(services, data);
    const alerts = (entry.model ? incidents : [])
      .filter((incident) => entry.dependsOn.includes(incident.component_key))
      .slice(0, 3)
      .map((incident) => ({
        id: String(incident.id),
        severity: incident.severity,
        status: incident.status,
        title: incident.title
      }));

    return {
      key: entry.key,
      name: entry.name,
      group: entry.group,
      declared: Boolean(entry.model),
      status,
      data,
      services,
      alerts,
      detail: moduleDetail(entry.name, status, services, data)
    };
  }));

  const summary = { total: modules.length, ok: 0, degraded: 0, down: 0, unknown: 0, records: 0 };
  for (const module of modules) {
    summary[module.status] = (summary[module.status] || 0) + 1;
    if (Number.isFinite(module.data.records)) summary.records += module.data.records;
  }

  return {
    generated_at: now.toISOString(),
    scope: "tenant",
    summary,
    modules
  };
}

module.exports = {
  MODULE_CATALOG,
  COMPONENT_LABELS,
  getModules
};
