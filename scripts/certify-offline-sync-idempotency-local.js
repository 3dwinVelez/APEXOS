const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.port, "54320");
  assert.equal(url.pathname.slice(1), "apexos_offline_cert_local");
}

async function main() {
  assertLocalDatabase();
  const prisma = require("../apps/api/src/core/prisma");
  const { createSyncProcessor } = require(
    "../apps/api/src/modules/offline/syncProcessor"
  );
  const processor = createSyncProcessor({ prisma });
  const context = {
    environmentId: "development",
    tenantId: "phase5-local-cert",
    companyId: "phase5-local-cert",
    userId: 1,
    installationId: randomUUID()
  };
  const makeOperation = (overrides = {}) => {
    const operationId = randomUUID();
    return {
      operationId,
      idempotencyKey: `phase5:${operationId}`,
      operationType: "TEST_OPERATION",
      payload: { marker: "phase5-local-cert" },
      baseVersion: 0,
      createdAtDevice: new Date().toISOString(),
      ...overrides
    };
  };

  try {
    const primary = makeOperation();
    const first = await processor.processOne(context, primary);
    const replay = await processor.processOne(context, primary);
    const sameOperation = await processor.processOne(
      context,
      { ...primary, idempotencyKey: `${primary.idempotencyKey}:changed` }
    );
    const sameKey = await processor.processOne(
      context,
      {
        ...primary,
        operationId: randomUUID(),
        payload: { marker: "altered" }
      }
    );
    const otherInstallation = await processor.processOne(
      { ...context, installationId: randomUUID() },
      primary
    );

    const concurrent = makeOperation();
    const concurrentResults = await Promise.all([
      processor.processOne(context, concurrent),
      processor.processOne(context, concurrent)
    ]);
    const primaryCount = await prisma.offlineSyncReceipt.count({
      where: { operation_id: primary.operationId }
    });
    const concurrentCount = await prisma.offlineSyncReceipt.count({
      where: { operation_id: concurrent.operationId }
    });

    assert.equal(first.status, "APPLIED");
    assert.equal(replay.status, "ALREADY_APPLIED");
    assert.equal(sameOperation.status, "REJECTED");
    assert.equal(sameKey.status, "REJECTED");
    assert.equal(otherInstallation.status, "REJECTED");
    assert.deepEqual(
      concurrentResults.map((item) => item.status).sort(),
      ["ALREADY_APPLIED", "APPLIED"]
    );
    assert.equal(primaryCount, 1);
    assert.equal(concurrentCount, 1);

    console.log(JSON.stringify({
      certified: true,
      primary: [first.status, replay.status],
      alteredReplay: sameOperation.status,
      reusedKey: sameKey.status,
      otherInstallation: otherInstallation.status,
      concurrent: concurrentResults.map((item) => item.status).sort(),
      receiptCounts: { primary: primaryCount, concurrent: concurrentCount }
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
