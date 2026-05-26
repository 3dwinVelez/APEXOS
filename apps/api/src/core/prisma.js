const { AsyncLocalStorage } = require("node:async_hooks");
const { PrismaClient } = require("@prisma/client");

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
  "Project", "ProjectCommitment", "ProjectDeliverable", "ProjectRisk", "ProjectResourceAssignment",
  "ProjectComment", "ProjectEvidence", "ProjectAlert", "ProjectLog",
  "Payroll", "Account", "LedgerEntry", "Payment",
  "BrainEvent", "BrainMetric", "CustomField", "AuditLog", "Workflow",
  "Category", "SensorReading", "OKR", "SoDRule", "EInvoice", "EInvoiceConfig"
]);

const WRITE_OPS = new Set(["create", "createMany", "upsert"]);
const READ_OPS = new Set(["findFirst", "findMany", "count", "aggregate", "groupBy"]);
const SOFT_DELETE = new Set(["Item", "Party", "Employee", "Resource", "Place"]);

function currentTenantId() {
  return tenantStorage.getStore()?.tenantId;
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

  client.$use(async (params, next) => {
    const tenantId = currentTenantId();
    if (!tenantId || !TENANT_MODELS.has(params.model)) return next(params);

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

    return next(params);
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
    if (SOFT_DELETE.has(params.model) && ["findMany", "findFirst"].includes(params.action)) {
      params.args = params.args || {};
      params.args.where = params.args.where || {};
      if (!("active" in params.args.where)) params.args.where.active = true;
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
    if (property === "runWithTenant") return (tenantId, fn) => tenantStorage.run({ tenantId }, fn);
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
