const { randomUUID, createHash } = require("node:crypto");
const prisma = require("../../core/prisma");
const {
  evaluateOfflineCapabilities
} = require("../../offline/featureFlags");
const {
  OFFLINE_BOOTSTRAP_SCHEMA_VERSION,
  validateOfflineBootstrapResponse
} = require("../../offline/bootstrapContract");

const ACTIVE_STATUSES = Object.freeze(["en_curso", "inspeccion", "ejecucion"]);
const PENDING_STATUS = "pendiente";
const VERSION_STRATEGY = "READ_TIMESTAMP_REVISION";

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function limits(env = process.env) {
  return Object.freeze({
    ttlSeconds: boundedInteger(env.OFFLINE_BOOTSTRAP_TTL_SECONDS, 86400, 300, 86400),
    futureDays: boundedInteger(env.OFFLINE_BOOTSTRAP_FUTURE_DAYS, 7, 1, 14),
    maxOrders: boundedInteger(env.OFFLINE_BOOTSTRAP_MAX_ORDERS, 100, 1, 200),
    maxActivities: boundedInteger(env.OFFLINE_BOOTSTRAP_MAX_ACTIVITIES, 500, 1, 1000),
    maxChecklists: boundedInteger(env.OFFLINE_BOOTSTRAP_MAX_CHECKLISTS, 1000, 1, 2000),
    maxCatalogs: boundedInteger(env.OFFLINE_BOOTSTRAP_MAX_CATALOGS, 100, 1, 200),
    maxBytes: boundedInteger(env.OFFLINE_BOOTSTRAP_MAX_BYTES, 1024 * 1024, 32768, 2 * 1024 * 1024),
    timeoutMs: boundedInteger(env.OFFLINE_BOOTSTRAP_TIMEOUT_MS, 5000, 500, 10000)
  });
}

function environmentId(env = process.env) {
  return String(env.APP_ENV || env.TARGET_ENV || env.NODE_ENV || "unknown")
    .trim()
    .toLowerCase();
}

function featureContext(tenantId, user) {
  return {
    tenantId: String(tenantId || ""),
    userId: String(user?.id || ""),
    role: String(user?.role?.name || "")
  };
}

function capabilitiesFor(tenantId, user, env = process.env) {
  const evaluated = evaluateOfflineCapabilities(featureContext(tenantId, user), env);
  return Object.freeze({
    offlineTechnician: {
      enabled: evaluated.technician,
      readOnly: evaluated.technician,
      syncEnabled: evaluated.sync,
      evidenceEnabled: evaluated.evidenceUpload,
      autoSyncEnabled: evaluated.autoSync
    },
    context: evaluated.technician
      ? {
          environmentId: environmentId(env),
          companyId: String(tenantId),
          userId: String(user?.id)
        }
      : null
  });
}

function assertBootstrapAuthorized(tenantId, user, env) {
  const capabilities = capabilitiesFor(tenantId, user, env);
  if (!capabilities.offlineTechnician.enabled) {
    throw appError(403, "OFFLINE_NOT_AUTHORIZED", "La capacidad offline no esta autorizada.");
  }
  if (String(user?.role?.name || "").toLowerCase() !== "tecnico") {
    throw appError(403, "OFFLINE_TECHNICIAN_ROLE_REQUIRED", "La capacidad requiere un tecnico autorizado.");
  }
  return capabilities;
}

function readRevision(value) {
  const revision = new Date(value).getTime();
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw appError(500, "OFFLINE_VERSION_UNAVAILABLE", "No fue posible versionar el snapshot.");
  }
  return revision;
}

function inspectionValue(order, partId) {
  const items = Array.isArray(order.metadata?.inspection?.items)
    ? order.metadata.inspection.items
    : [];
  const item = items.find((candidate) => String(candidate?.part_id) === String(partId));
  return item?.status == null ? null : String(item.status);
}

function stageStatus(orderStatus, stage) {
  const rank = {
    pendiente: 0,
    en_curso: 1,
    inspeccion: 2,
    ejecucion: 3
  };
  const stageRank = { start: 1, inspection: 2, execution: 3 };
  return (rank[orderStatus] || 0) >= stageRank[stage] ? "completed" : "pending";
}

function mapOrder(order) {
  const serverUpdatedAt = order.updated_at.toISOString();
  return {
    serverId: String(order.id),
    orderId: String(order.id),
    orderNumber: order.number,
    status: order.status,
    assignedTechnicianId: String(order.technician_id),
    customerDisplayName: order.customer_name,
    serviceAddress: order.customer_address,
    scheduledAt: order.scheduled_date?.toISOString() || null,
    minimumOperationalData: {
      referenceDisplayName: order.reference?.name || order.service_type,
      serviceSummary: order.service_type,
      ...(order.customer_phone ? { contactPhone: order.customer_phone } : {})
    },
    serverVersion: readRevision(order.updated_at),
    serverUpdatedAt
  };
}

function mapActivities(order) {
  const serverUpdatedAt = order.updated_at.toISOString();
  const common = {
    orderId: String(order.id),
    required: true,
    serverVersion: readRevision(order.updated_at),
    serverUpdatedAt
  };
  return [
    {
      ...common,
      serverId: `${order.id}:start`,
      activityId: `${order.id}:start`,
      activityType: "service_start",
      title: "Inicio del servicio",
      description: "Estado autoritativo del inicio.",
      status: stageStatus(order.status, "start"),
      sequence: 1
    },
    {
      ...common,
      serverId: `${order.id}:inspection`,
      activityId: `${order.id}:inspection`,
      activityType: "inspection",
      title: "Inspeccion",
      description: "Revision de piezas requeridas.",
      status: stageStatus(order.status, "inspection"),
      sequence: 2
    },
    {
      ...common,
      serverId: `${order.id}:execution`,
      activityId: `${order.id}:execution`,
      activityType: "execution",
      title: "Ejecucion",
      description: "Ejecucion del servicio asignado.",
      status: stageStatus(order.status, "execution"),
      sequence: 3
    }
  ];
}

function mapChecklists(order) {
  return (order.reference?.parts || []).map((part, index) => ({
    serverId: String(part.id),
    checklistId: String(part.id),
    orderId: String(order.id),
    label: part.name,
    sequence: part.display_order ?? index,
    required: true,
    value: inspectionValue(order, part.id),
    serverVersion: readRevision(order.updated_at),
    serverUpdatedAt: order.updated_at.toISOString()
  }));
}

function mapCatalogs(orders, generatedAt) {
  const labels = {
    pendiente: "Pendiente",
    en_curso: "En curso",
    inspeccion: "Inspeccion",
    ejecucion: "Ejecucion"
  };
  return [...new Set(orders.map((order) => order.status))].map((status) => ({
    serverId: `service_status:${status}`,
    catalogType: "service_status",
    code: status,
    label: labels[status] || status,
    serverVersion: readRevision(generatedAt),
    serverUpdatedAt: generatedAt.toISOString()
  }));
}

function snapshotCheckpoint(snapshotId, orders) {
  const digest = createHash("sha256");
  digest.update(snapshotId);
  for (const order of orders) digest.update(`${order.serverId}:${order.serverVersion};`);
  return `bootstrap:${digest.digest("hex").slice(0, 32)}`;
}

function assertLimits(snapshot, appliedLimits) {
  if (snapshot.activities.length > appliedLimits.maxActivities) {
    throw appError(413, "OFFLINE_ACTIVITY_LIMIT_EXCEEDED", "El snapshot supera el limite permitido.");
  }
  if (snapshot.checklists.length > appliedLimits.maxChecklists) {
    throw appError(413, "OFFLINE_CHECKLIST_LIMIT_EXCEEDED", "El snapshot supera el limite permitido.");
  }
  if (snapshot.catalogs.length > appliedLimits.maxCatalogs) {
    throw appError(413, "OFFLINE_CATALOG_LIMIT_EXCEEDED", "El snapshot supera el limite permitido.");
  }
  const bytes = Buffer.byteLength(JSON.stringify(snapshot));
  if (bytes > appliedLimits.maxBytes) {
    throw appError(413, "OFFLINE_SNAPSHOT_TOO_LARGE", "El snapshot supera el tamano permitido.");
  }
  return bytes;
}

function validateSnapshot(snapshot) {
  const validation = validateOfflineBootstrapResponse(snapshot);
  if (!validation.success) {
    throw appError(500, "OFFLINE_SNAPSHOT_INVALID", "El snapshot generado no cumple el contrato.");
  }
  return snapshot;
}

function createOfflineService(dependencies = {}) {
  const database = dependencies.prisma || prisma;
  const clock = dependencies.now || (() => new Date());
  const uuid = dependencies.randomUUID || randomUUID;
  const observer = dependencies.observer || { record: async () => undefined };

  async function capabilities(tenantId, user, env = process.env) {
    return capabilitiesFor(tenantId, user, env);
  }

  async function generateBootstrap(tenantId, user, env = process.env) {
    const startedAt = process.hrtime.bigint();
    const appliedLimits = limits(env);
    assertBootstrapAuthorized(tenantId, user, env);
    const generatedAt = clock();
    const futureBoundary = new Date(generatedAt.getTime() + appliedLimits.futureDays * 86400000);

    try {
      const snapshot = await database.runWithTenant(tenantId, async () => {
        const employee = await database.employee.findFirst({
          where: {
            user_id: Number(user.id),
            active: true,
            user_type: "tecnico"
          },
          select: { id: true }
        });
        if (!employee) {
          throw appError(
            403,
            "OFFLINE_TECHNICIAN_PROFILE_REQUIRED",
            "No existe un perfil tecnico autorizado."
          );
        }

        const rows = await database.serviceOrder.findMany({
          where: {
            technician_id: employee.id,
            OR: [
              { status: { in: ACTIVE_STATUSES } },
              { status: PENDING_STATUS, scheduled_date: { lte: futureBoundary } }
            ]
          },
          select: {
            id: true,
            number: true,
            technician_id: true,
            service_type: true,
            status: true,
            customer_name: true,
            customer_address: true,
            customer_phone: true,
            scheduled_date: true,
            metadata: true,
            updated_at: true,
            reference: {
              select: {
                name: true,
                parts: {
                  select: { id: true, name: true, display_order: true },
                  orderBy: { display_order: "asc" }
                }
              }
            }
          },
          orderBy: [{ scheduled_date: "asc" }, { id: "asc" }],
          take: appliedLimits.maxOrders + 1
        });
        const hasMore = rows.length > appliedLimits.maxOrders;
        const selected = rows.slice(0, appliedLimits.maxOrders);
        const orders = selected.map(mapOrder);
        const activities = selected.flatMap(mapActivities);
        const checklists = selected.flatMap(mapChecklists);
        const catalogs = mapCatalogs(selected, generatedAt);
        const snapshotId = uuid();
        const expiresAt = new Date(
          generatedAt.getTime() + appliedLimits.ttlSeconds * 1000
        ).toISOString();
        const result = {
          schemaVersion: OFFLINE_BOOTSTRAP_SCHEMA_VERSION,
          snapshotId,
          generatedAt: generatedAt.toISOString(),
          expiresAt,
          environmentId: environmentId(env),
          companyId: String(tenantId),
          userId: String(user.id),
          serverCheckpoint: snapshotCheckpoint(snapshotId, orders),
          orders,
          activities,
          checklists,
          catalogs,
          metadata: {
            ttlSeconds: appliedLimits.ttlSeconds,
            hasMore,
            versionStrategy: VERSION_STRATEGY
          }
        };
        const bytes = assertLimits(result, appliedLimits);
        return { result: validateSnapshot(result), bytes, queryCount: 2 };
      });

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      await observer.record({
        event: "offline_bootstrap_authorized",
        tenantId,
        userId: user.id,
        durationMs,
        orderCount: snapshot.result.orders.length,
        bytes: snapshot.bytes,
        queryCount: snapshot.queryCount
      });
      return snapshot.result;
    } catch (error) {
      await observer.record({
        event: "offline_bootstrap_rejected",
        tenantId,
        userId: user?.id,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        statusCode: error.statusCode || 500,
        code: error.code || "OFFLINE_BOOTSTRAP_FAILED"
      });
      if (error.statusCode) throw error;
      throw appError(500, "OFFLINE_BOOTSTRAP_FAILED", "No fue posible generar el snapshot offline.");
    }
  }

  async function bootstrap(tenantId, user, env = process.env) {
    const timeoutMs = limits(env).timeoutMs;
    let timer;
    try {
      return await Promise.race([
        generateBootstrap(tenantId, user, env),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                appError(
                  503,
                  "OFFLINE_BOOTSTRAP_TIMEOUT",
                  "La capacidad offline no esta disponible temporalmente."
                )
              ),
            timeoutMs
          );
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return { bootstrap, capabilities };
}

module.exports = {
  ACTIVE_STATUSES,
  VERSION_STRATEGY,
  capabilitiesFor,
  createOfflineService,
  limits,
  readRevision
};
