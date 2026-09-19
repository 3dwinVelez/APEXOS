const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "qa-monitor-evidence-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test";

function serviceWith(database) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const originalPrisma = require.cache[prismaPath];
  const originalService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: database };
  delete require.cache[servicePath];
  const service = require(servicePath);
  if (originalPrisma) require.cache[prismaPath] = originalPrisma;
  else delete require.cache[prismaPath];
  if (originalService) require.cache[servicePath] = originalService;
  else delete require.cache[servicePath];
  return service;
}

function database() {
  const calls = [];
  return {
    calls,
    runWithTenant: async (tenantId, callback) => {
      calls.push({ model: "tenant", tenantId });
      return callback();
    },
    activityEvidence: {
      findFirst: async (args) => {
        calls.push({ model: "activityEvidence", args });
        return args.where.tenant_id === "nyvora" ? { id: 17, file_name: "actividad.png", base64_data: "data:image/png;base64,activity" } : null;
      }
    },
    timePunch: {
      findFirst: async (args) => {
        calls.push({ model: "timePunch", args });
        return args.where.tenant_id === "nyvora" ? { id: 21, extra_evidence: { name: "salida.png", base64: "data:image/png;base64,punch" } } : null;
      }
    }
  };
}

test("carga la evidencia completa de actividad solo al solicitarla", async () => {
  const db = database();
  const result = await serviceWith(db).getMonitorEvidence("nyvora", "activity", 17);
  assert.equal(result.base64_data, "data:image/png;base64,activity");
  assert.equal(result.source, "activity");
  const query = db.calls.find((call) => call.model === "activityEvidence").args;
  assert.deepEqual(query.where, { id: 17, tenant_id: "nyvora", activity: { tenant_id: "nyvora" } });
});

test("carga evidencia de marcacion sin exponer otro tenant", async () => {
  const db = database();
  const service = serviceWith(db);
  const result = await service.getMonitorEvidence("nyvora", "punch", 21);
  assert.equal(result.base64_data, "data:image/png;base64,punch");
  assert.equal(result.file_name, "salida.png");
  await assert.rejects(
    service.getMonitorEvidence("otro-tenant", "punch", 21),
    (error) => error.statusCode === 404 && error.code === "EVIDENCIA_MONITOR_NO_ENCONTRADA"
  );
});

test("rechaza origen o identificador invalido antes de consultar datos", async () => {
  const db = database();
  const service = serviceWith(db);
  await assert.rejects(service.getMonitorEvidence("nyvora", "archivo", 17), (error) => error.statusCode === 400);
  await assert.rejects(service.getMonitorEvidence("nyvora", "activity", "abc"), (error) => error.statusCode === 400);
  assert.equal(db.calls.length, 0);
});

function batchDatabase() {
  const calls = [];
  return {
    calls,
    runWithTenant: async (tenantId, callback) => {
      calls.push({ model: "tenant", tenantId });
      return callback();
    },
    timePunch: {
      findMany: async (args) => {
        calls.push({ model: "timePunch", args });
        if (args.where.tenant_id !== "nyvora") return [];
        return [
          { id: 21, route_id: 5, extra_evidence: { name: "salida.png", base64: "data:image/png;base64,punch" } },
          { id: 22, route_id: 5, extra_evidence: null, metadata: {} }
        ];
      }
    },
    workActivity: {
      findMany: async (args) => {
        calls.push({ model: "workActivity", args });
        if (args.where.tenant_id !== "nyvora") return [];
        return [
          { id: 9, route_id: 5, evidence: [{ id: 17, file_name: "actividad.png", base64_data: "data:image/png;base64,activity" }] },
          { id: 10, route_id: 5, evidence: [] }
        ];
      }
    }
  };
}

test("carga en lote la evidencia de marcaciones y actividades de una ruta", async () => {
  const db = batchDatabase();
  const result = await serviceWith(db).getMonitorEvidenceBatch("nyvora", 5);
  assert.equal(result.route_id, 5);
  assert.equal(result.punch_evidence["21"].base64_data, "data:image/png;base64,punch");
  assert.equal(result.punch_evidence["21"].source, "punch");
  assert.deepEqual(result.punch_evidence["22"], { id: 22, source: "punch" });
  assert.equal(result.activity_evidence["9"][0].base64_data, "data:image/png;base64,activity");
  assert.equal(result.activity_evidence["9"][0].source, "activity");
  assert.deepEqual(result.activity_evidence["10"], []);
  assert.deepEqual(result.counts, { punches: 2, punch_evidence: 1, activities: 2, activity_evidence: 1 });
  const punchQuery = db.calls.find((call) => call.model === "timePunch").args;
  const activityQuery = db.calls.find((call) => call.model === "workActivity").args;
  assert.deepEqual(punchQuery.where, { route_id: 5, tenant_id: "nyvora" });
  assert.deepEqual(activityQuery.where, { route_id: 5, tenant_id: "nyvora" });
});

test("el lote de evidencias no expone datos de otro tenant", async () => {
  const db = batchDatabase();
  const result = await serviceWith(db).getMonitorEvidenceBatch("otro-tenant", 5);
  assert.deepEqual(result.punch_evidence, {});
  assert.deepEqual(result.activity_evidence, {});
  assert.equal(result.counts.punches, 0);
  assert.equal(result.counts.activities, 0);
});

test("rechaza identificador de ruta invalido antes de consultar datos", async () => {
  const db = batchDatabase();
  await assert.rejects(serviceWith(db).getMonitorEvidenceBatch("nyvora", "abc"), (error) => error.statusCode === 400 && error.code === "EVIDENCIA_MONITOR_RUTA_INVALIDA");
  assert.equal(db.calls.length, 0);
});
