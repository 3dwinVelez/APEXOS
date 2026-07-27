const { AsyncLocalStorage } = require("node:async_hooks");
const { PrismaClient } = require("@prisma/client");
const { recordQuery } = require("./performanceContext");

const tenantStorage = new AsyncLocalStorage();
let prisma;

const TENANT_MODELS = new Set([
  "User", "Role", "Party", "Item", "Place", "Location", "ItemLocation",
  "Transaction", "Movement", "Resource", "Document", "Event", "BOM",
  "WorkOrder", "Employee", "WorkSchedule", "TimeRoute", "TimePunch",
  "RoutePreoperationalChecklist", "RoutePreoperationalChecklistAnswer",
  "RoutePreoperationalChecklistEvidence", "RoutePreoperationalFinding",
  "RouteStartAuthorization", "RouteBlockEvent",
  "ProcessedWorkday", "GpsPing", "WorkSession", "ActivityType", "WorkActivity", "ActivityEvidence",
  "Vehicle", "ServiceOrder", "ServiceReference",
  "VehicleDocument", "VehicleMasterAuditLog", "ServiceReferencePart", "ServiceIncident", "ServicePhoto",
  "EvidenceUploadAuthorization",
  "Project", "ProjectCommitment", "ProjectDeliverable", "ProjectRisk", "ProjectResourceAssignment",
  "ProjectComment", "ProjectEvidence", "ProjectAlert", "ProjectLog",
  "Payroll", "Account", "LedgerEntry", "CntCabdoc", "CntCuedoc", "CxpCabdoc", "CxpCuedoc", "CxpApplication", "PurchaseOrderInvoiceLine", "InventoryFamily", "InventoryFamilyAccounting", "ProductCost", "Payment",
  "BrainEvent", "BrainMetric", "CustomField", "AuditLog", "Workflow",
  "Category", "SensorReading", "OKR", "SoDRule", "EInvoice", "EInvoiceConfig"
]);

const WRITE_OPS = new Set(["create", "createMany", "upsert"]);
const READ_OPS = new Set(["findFirst", "findMany", "count", "aggregate", "groupBy"]);
const DELETE_OPS = new Set(["delete", "deleteMany"]);
const FIND_OPS = new Set(["findFirst", "findMany"]);
const SOFT_DELETE = new Set([
  "Item", "Party", "Employee", "Resource", "Place",
  "Tenant", "User", "InventoryFamily", "InventoryFamilyAccounting",
  "Location", "Account", "ProjectResourceAssignment", "WorkSchedule",
  "ActivityType", "Vehicle", "VehicleDocument", "ServiceReference",
  "Workflow", "CustomField", "EInvoiceConfig"
]);

// Modelos que pueden ser borrados físicamente (no tienen campo `active` o es intencional)
const PHYSICAL_DELETE_ALLOWED = new Set([
  "Role", "Permission", "SoDRule", "AuditLog", "Movement",
  "GpsPing", "TimePunch", "ProcessedWorkday", "WorkSession",
  "WorkActivity", "ActivityEvidence", "ServicePhoto", "ServiceIncident", "EvidenceUploadAuthorization",
  "SensorReading", "BrainEvent", "BrainMetric",
  "RoutePreoperationalChecklistAnswer", "RoutePreoperationalChecklistEvidence",
  "RoutePreoperationalFinding", "RouteStartAuthorization", "RouteBlockEvent",
  "ItemLocation", "ServiceReferencePart", "TimeRoute"
]);

function currentTenantId() {
  return tenantStorage.getStore()?.tenantId;
}

function normalizeTenantId(tenantId) {
  if (tenantId === null || tenantId === undefined) return tenantId;
  return String(tenantId);
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

  client.$use(async (params, next) => {
    const startedAt = process.hrtime.bigint();
    const tenantId = currentTenantId();
    try {
      if (!tenantId || !TENANT_MODELS.has(params.model)) return await next(params);

      if (WRITE_OPS.has(params.action) && params.args.data) {
        if (Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((row) => ({ ...row, tenant_id: tenantId }));
        } else {
          params.args.data.tenant_id = tenantId;
        }
      }

      if (READ_OPS.has(params.action)) {
        params.args = params.args || {};
        params.args.where = { ...params.args.where, tenant_id: tenantId };
      }

      return await next(params);
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const slowThresholdMs = Math.max(Number(process.env.PERFORMANCE_SLOW_QUERY_MS || 300), 1);
      recordQuery({
        model: params.model || "raw",
        action: params.action,
        durationMs: Number(durationMs.toFixed(2)),
        slow: durationMs >= slowThresholdMs,
        hasTenantFilter: Boolean(params.args?.where?.tenant_id),
        hasLimit: Number.isFinite(params.args?.take),
        includeCount: params.args?.include ? Object.keys(params.args.include).length : 0
      });
    }
  });

  client.$use(async (params, next) => {
    const result = await next(params);
    if (params.model === "Item" && ["update", "updateMany"].includes(params.action)) {
      const data = params.args.data || {};
      if ("stock_current" in data) {
        setImmediate(() => require("./stockSyncHook").trigger(params).catch(() => undefined));
      }
    }
    return result;
  });

  client.$use(async (params, next) => {
    if (SOFT_DELETE.has(params.model) && FIND_OPS.has(params.action)) {
      params.args = params.args || {};
      params.args.where = params.args.where || {};
      const includeInactive = params.args.where.__includeInactive === true;
      delete params.args.where.__includeInactive;
      if (!includeInactive && !("active" in params.args.where)) params.args.where.active = true;
    }
    return next(params);
  });

  client.$use(async (params, next) => {
    if (DELETE_OPS.has(params.action)) {
      if (SOFT_DELETE.has(params.model)) {
        params.action = params.action === "delete" ? "update" : "updateMany";
        params.args = params.args || {};
        params.args.data = { ...(params.args.data || {}), active: false };
      } else if (!PHYSICAL_DELETE_ALLOWED.has(params.model)) {
        throw new Error(
          `Operación de borrado físico bloqueada para el modelo "${params.model}". ` +
          "Este modelo no tiene soft-delete habilitado. " +
          "Use un método de archivado explícito o agregue el modelo a SOFT_DELETE en prisma.js."
        );
      }
    }
    return next(params);
  });

  return client;
}

function getPrismaClient() {
  if (!prisma) {
    prisma = createPrismaClient();
  }

  return prisma;
}

const lazyPrisma = new Proxy({}, {
  get(_target, property) {
    if (property === "runWithTenant") return (tenantId, fn) => tenantStorage.run({ tenantId: normalizeTenantId(tenantId) }, fn);
    if (property === "currentTenantId") return currentTenantId;

    const value = getPrismaClient()[property];
    return typeof value === "function" ? value.bind(getPrismaClient()) : value;
  },
  set(_target, property, value) {
    getPrismaClient()[property] = value;
    return true;
  }
});

module.exports = lazyPrisma;
