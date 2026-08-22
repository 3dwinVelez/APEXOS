const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

function loadHrService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const previousPrisma = require.cache[prismaPath];
  const previousService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
    }
  };
}

test("carga una evidencia fotografica bajo demanda dentro de la empresa", async () => {
  let receivedQuery;
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    activityEvidence: {
      findFirst: async (query) => {
        receivedQuery = query;
        return { id: 29, activity_id: 29, evidence_type: "photo", file_name: "registro.png", mime_type: "image/png", file_size: 12, file_url: null, base64_data: "aW1hZ2U=" };
      }
    }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    const evidence = await loaded.service.getWorkActivityEvidence("tenant-qa", 29, 29);
    assert.deepEqual(receivedQuery.where, { id: 29, activity_id: 29, activity: { tenant_id: "tenant-qa" } });
    assert.equal(evidence.base64_data, "data:image/png;base64,aW1hZ2U=");
    assert.equal(evidence.file_name, "registro.png");
  } finally {
    loaded.restore();
  }
});

test("rechaza evidencia inexistente o perteneciente a otra empresa", async () => {
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    activityEvidence: { findFirst: async () => null }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    await assert.rejects(
      () => loaded.service.getWorkActivityEvidence("tenant-qa", 29, 99),
      (error) => error.statusCode === 404 && error.code === "ACTIVITY_EVIDENCE_NOT_FOUND"
    );
  } finally {
    loaded.restore();
  }
});
