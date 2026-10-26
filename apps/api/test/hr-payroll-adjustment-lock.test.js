const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

// Regresion del mismo patron que tumbo las mallas el 2026-10-26 (P2028 -> 500 "backend caido"):
// el ajuste de nomina (IBC, correccion de jornada) esperaba su advisory lock bloqueante dentro
// de una transaccion sin presupuesto explicito. Con dos correcciones simultaneas de la misma
// persona, la transaccion se abortaba y el error que veia el contador era un 500 generico.

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

function adjustmentInput() {
  return {
    employee_id: 41,
    period_key: "mensual:2026-10-01:2026-10-31",
    adjustment_type: "manual",
    concept_code: "AJUSTE_MANUAL",
    amount: 25_000,
    description: "Ajuste de prueba para concurrencia"
  };
}

function buildTx({ acquired, capture }) {
  return {
    processedWorkday: { findFirst: async () => null },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      capture.sql.push(sql);
      capture.values.push(values);
      if (/pg_try_advisory_xact_lock/i.test(sql)) return [{ acquired }];
      if (/FROM "Employee"/i.test(sql)) return [{ id: 41 }];
      if (/INSERT INTO th_nomina_ajustes/i.test(sql)) return [{ id: 777, employee_id: 41 }];
      return [];
    },
    $executeRaw: async (strings, ...values) => {
      capture.sql.push(strings.join("?"));
      capture.values.push(values);
      return 1;
    }
  };
}

function fakePrismaFor(tx) {
  return {
    runWithTenant: (_tenantId, callback) => callback(),
    $queryRaw: async () => [],
    $transaction: async (callback, options) => {
      tx.transactionOptions = options;
      return callback(tx);
    }
  };
}

test("el ajuste de nomina declara presupuesto de transaccion y serializa con try-lock acotado", async () => {
  const capture = { sql: [], values: [] };
  const tx = buildTx({ acquired: true, capture });
  const loaded = loadHrService(fakePrismaFor(tx));
  try {
    const created = await loaded.service.createPayrollAdjustment("tenant-qa", adjustmentInput(), { id: 7 });
    assert.equal(created.id, 777, "el ajuste se escribe y se devuelve");
    assert.deepEqual(tx.transactionOptions, { maxWait: 5_000, timeout: 30_000 }, "sin presupuesto, los 5s por defecto de Prisma abortan la transaccion con P2028");
    const lockSql = capture.sql.find((sql) => /advisory_xact_lock/i.test(sql));
    assert.match(lockSql, /pg_try_advisory_xact_lock/, "el lock debe ser acotado: un lock bloqueante no puede devolver 503");
    assert.doesNotMatch(capture.sql.join("\n"), /SELECT pg_advisory_xact_lock/, "no queda ningun lock bloqueante residual");
    const scope = capture.values.flat().find((value) => String(value).startsWith("hr-ibc-adjustment:"));
    assert.equal(scope, "hr-ibc-adjustment:tenant-qa:41", "el alcance sigue siendo tenant y empleado");
  } finally {
    loaded.restore();
  }
});

test("con el candado ocupado el ajuste rinde 503 controlado y no escribe nada", async () => {
  const capture = { sql: [], values: [] };
  const tx = buildTx({ acquired: false, capture });
  const loaded = loadHrService(fakePrismaFor(tx));
  try {
    loaded.service.__setContentionLockWaitMsForTests(120);
    const started = Date.now();
    await assert.rejects(
      loaded.service.createPayrollAdjustment("tenant-qa", adjustmentInput(), { id: 7 }),
      (error) => error.statusCode === 503 && error.code === "AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL",
      "el candado ocupado debe rendirse con 503 del propio servicio, no con P2028 ni 500"
    );
    assert.ok(Date.now() - started < 5_000, "la operacion queda acotada por el deadline");
    assert.ok(!capture.sql.some((sql) => /INSERT INTO th_nomina_ajustes/i.test(sql)), "un ajuste rechazado no deja registro a medias");
  } finally {
    loaded.service.__setContentionLockWaitMsForTests(0);
    loaded.restore();
  }
});

test("el servidor trata cualquier 503 con codigo como fallo controlado", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const server = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  assert.match(
    server,
    /if \(error\.statusCode === 503 && error\.code\) \{/,
    "un 503 con codigo no puede caer al 500 generico: el operario lo leeria como caida del backend"
  );
});
