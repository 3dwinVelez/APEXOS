const prisma = require("../../core/prisma");
const { evaluateOfflineCapabilities } = require("../../offline/featureFlags");
const { MAX_REQUEST_BYTES, SYNC_TIMEOUT_MS } = require("./syncContract");
const { createSyncProcessor } = require("./syncProcessor");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function environmentId(env) {
  return String(env.APP_ENV || env.TARGET_ENV || env.NODE_ENV || "unknown").trim().toLowerCase();
}

function assertAuthorized(tenantId, user, env) {
  const capability = evaluateOfflineCapabilities({
    tenantId: String(tenantId),
    userId: String(user?.id || ""),
    role: String(user?.role?.name || "")
  }, env);
  if (!capability.technician || !capability.sync) {
    throw appError(403, "OFFLINE_SYNC_NOT_AUTHORIZED", "La sincronizacion offline no esta autorizada.");
  }
  if (String(user?.role?.name || "").toLowerCase() !== "tecnico") {
    throw appError(403, "OFFLINE_TECHNICIAN_ROLE_REQUIRED", "La sincronizacion requiere un tecnico autorizado.");
  }
}

function createOfflineSyncService(dependencies = {}) {
  const database = dependencies.prisma || prisma;
  const processor = dependencies.processor || createSyncProcessor({ prisma: database });

  async function push(tenantId, user, body, env = process.env) {
    assertAuthorized(tenantId, user, env);
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_REQUEST_BYTES) {
      throw appError(413, "OFFLINE_SYNC_REQUEST_TOO_LARGE", "La solicitud supera el limite permitido.");
    }
    const context = {
      environmentId: environmentId(env),
      tenantId: String(tenantId),
      companyId: String(tenantId),
      userId: Number(user.id),
      installationId: body.installationId
    };
    let timer;
    try {
      const results = await Promise.race([
        database.runWithTenant(tenantId, () => processor.processBatch(context, body.operations)),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(appError(503, "OFFLINE_SYNC_TIMEOUT", "La sincronizacion no esta disponible temporalmente.")),
            SYNC_TIMEOUT_MS
          );
        })
      ]);
      return {
        context: {
          environmentId: context.environmentId,
          companyId: context.companyId,
          userId: String(context.userId),
          installationId: context.installationId
        },
        results
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { push };
}

module.exports = { assertAuthorized, createOfflineSyncService, environmentId };
