const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "qa-monitor-evidence-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test";

const { projectEvidence } = require("../src/modules/hr/monitorEvidenceRows");

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

// El lote ya no es un payload: es el indice de que evidencia existe en la ruta. La
// proyeccion la ejecuta PostgreSQL, asi que el stub devuelve exactamente lo que devolveria
// la base (extra_evidence y metadata como texto ya proyectado) usando el twin JS de
// monitorEvidenceRows.projectEvidence.
function batchDatabase() {
  const calls = [];
  const punches = [
    { id: 21, type: "SALIDA", punched_at: new Date("2026-11-04T14:00:00Z"), extra_evidence: { name: "salida.png", base64: "data:image/png;base64,punch" }, metadata: { source: "apexos-movil", identity_photo: { base64_data: "data:image/jpeg;base64,selfie" } } },
    { id: 22, type: "ENTRADA", punched_at: new Date("2026-11-04T08:00:00Z"), extra_evidence: null, metadata: {} }
  ];
  const activityEvidence = [
    { id: 17, activity_id: 9, evidence_type: "FOTO", file_name: "actividad.png", file_url: "", storage_path: "", mime_type: "image/png", file_size: 12, base64_data: "data:image/png;base64,activity" }
  ];
  return {
    calls,
    runWithTenant: async (tenantId, callback) => {
      calls.push({ model: "tenant", tenantId });
      return callback();
    },
    $queryRaw: async (query) => {
      calls.push({ model: "raw", sql: query.sql, values: query.values });
      const tenantId = query.values[0];
      if (tenantId !== "nyvora") return [];
      if (query.sql.includes('"ActivityEvidence"')) {
        return activityEvidence.map((row) => ({ ...row, base64_data: projectEvidence({ base64_data: row.base64_data }).base64_data }));
      }
      return punches.map((row) => ({
        ...row,
        extra_evidence: JSON.stringify(projectEvidence(row.extra_evidence)),
        metadata: JSON.stringify({ ...row.metadata, identity_photo: projectEvidence(row.metadata.identity_photo) })
      }));
    },
    workActivity: {
      findMany: async (args) => {
        calls.push({ model: "workActivity", args });
        if (args.where.tenant_id !== "nyvora") return [];
        return [{ id: 9 }, { id: 10 }];
      }
    }
  };
}

function containsBytes(payload) {
  const seen = JSON.stringify(payload, (key, value) => ((key === "base64_data" || key === "base64") && typeof value === "string" ? `BYTES:${value}` : value));
  return seen.includes("BYTES:");
}

test("el lote del monitor es un indice: cuenta la evidencia y nunca arrastra sus bytes", async () => {
  const db = batchDatabase();
  const result = await serviceWith(db).getMonitorEvidenceBatch("nyvora", 5);
  assert.equal(result.route_id, 5);
  assert.deepEqual(result.punch_evidence["21"], {
    id: 21, source: "punch", file_name: "salida.png", mime_type: "image/png", has_base64_data: true, available: true
  });
  assert.equal(result.identity_evidence["21"].source, "identity");
  assert.equal(result.identity_evidence["21"].has_base64_data, true);
  assert.deepEqual(result.punch_evidence["22"], { id: 22, source: "punch" });
  assert.deepEqual(result.activity_evidence["9"], [
    { id: 17, source: "activity", evidence_type: "FOTO", file_name: "actividad.png", mime_type: "image/png", file_size: 12, has_base64_data: true, available: true }
  ]);
  assert.deepEqual(result.activity_evidence["10"], []);
  assert.deepEqual(result.counts, { punches: 2, punch_evidence: 1, activities: 2, activity_evidence: 1 });
  assert.equal(containsBytes(result), false, "el lote devolvio bytes de evidencia");
  const punchQuery = db.calls.find((call) => call.model === "raw" && call.sql.includes('"TimePunch"'));
  const activityQuery = db.calls.find((call) => call.model === "raw" && call.sql.includes('"ActivityEvidence"'));
  assert.equal(punchQuery.values.includes("nyvora"), true, "la lectura cruda de marcaciones filtra por tenant");
  assert.equal(punchQuery.values.includes(5), true, "la lectura cruda de marcaciones filtra por ruta");
  assert.match(punchQuery.sql, /md5\(/, "la lectura cruda de marcaciones proyecta el base64");
  assert.equal(activityQuery.values.includes("nyvora"), true, "la lectura cruda de actividades filtra por tenant");
  const activityModelQuery = db.calls.find((call) => call.model === "workActivity").args;
  assert.deepEqual(activityModelQuery.where, { route_id: 5, tenant_id: "nyvora" });
  assert.deepEqual(activityModelQuery.select, { id: true });
});

test("el lote de evidencias no expone datos de otro tenant", async () => {
  const db = batchDatabase();
  const result = await serviceWith(db).getMonitorEvidenceBatch("otro-tenant", 5);
  assert.deepEqual(result.punch_evidence, {});
  assert.deepEqual(result.identity_evidence, {});
  assert.deepEqual(result.activity_evidence, {});
  assert.equal(result.counts.punches, 0);
  assert.equal(result.counts.activities, 0);
});

test("rechaza identificador de ruta invalido antes de consultar datos", async () => {
  const db = batchDatabase();
  await assert.rejects(serviceWith(db).getMonitorEvidenceBatch("nyvora", "abc"), (error) => error.statusCode === 400 && error.code === "EVIDENCIA_MONITOR_RUTA_INVALIDA");
  assert.equal(db.calls.length, 0);
});
