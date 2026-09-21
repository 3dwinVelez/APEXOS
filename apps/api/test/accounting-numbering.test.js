const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

function loadAccountingService() {
  const servicePath = require.resolve("../src/modules/accounting/service");
  delete require.cache[servicePath];
  return require(servicePath);
}

// tx falso que ejercita createGoodsReceiptDocumentTx sin base de datos real.
// emittedMax simula el mayor document_number ya persistido en cnt_cabdoc;
// configuredNumbering es el accounting_numbering guardado en Tenant.config.
function fakeGoodsReceiptTx({ emittedMax = 0, configuredNumbering = [] } = {}) {
  const calls = { locks: [], created: [], numberingWrites: [] };
  const account = { id: 10, code: "1435", active: true, allows_tx: true };
  const tx = {
    $executeRawUnsafe: async (sql, key) => { calls.locks.push({ sql, key }); return 1; },
    tenant: {
      findUnique: async () => ({ config: { accounting: { accounting_numbering: configuredNumbering } } }),
      update: async (args) => { calls.numberingWrites.push(args.data.config.accounting.accounting_numbering); return { config: args.data.config }; }
    },
    cntCabdoc: {
      aggregate: async () => ({ _max: { document_number: emittedMax } }),
      create: async (args) => { calls.created.push(args.data); return { id: 100, ...args.data }; },
      findUnique: async (args) => ({ id: args.where.id, ...calls.created[0], lines: [] })
    },
    account: { findFirst: async () => account },
    ledgerEntry: { create: async () => ({ id: 1 }) },
    cntCuedoc: { create: async () => ({ id: 1 }) }
  };
  return { tx, calls };
}

function goodsReceiptData() {
  return {
    posting_date: new Date("2026-09-21T12:00:00.000Z"),
    society_code: "SOC1",
    header_text: "Entrada de mercancia",
    lines: [{ amount: 1000, inventory_account_code: "1435", gr_ir_account_code: "2205", description: "Item" }]
  };
}

test("EM auto-sana la numeracion contra el mayor document_number emitido", async () => {
  const service = loadAccountingService();
  // config obsoleto dice next_number=1 pero ya existen 5 entradas: sin self-heal
  // reutilizaria EM-000001 y chocaria (P2002/409). Debe reservar 6.
  const { tx, calls } = fakeGoodsReceiptTx({
    emittedMax: 5,
    configuredNumbering: [{ document_type: "EM", prefix: "EM", next_number: 1, active: true }]
  });
  const doc = await service.createGoodsReceiptDocumentTx(tx, "tenant-1", 9, goodsReceiptData());
  assert.equal(calls.created[0].document_number, 6);
  assert.equal(calls.created[0].full_number, "EM-000006");
  assert.equal(doc.document_number, 6);
  // La numeracion persistida avanza al numero sano + 1, reparando el config.
  const emRow = calls.numberingWrites[0].find((row) => row.document_type === "EM");
  assert.equal(emRow.next_number, 7);
});

test("EM respeta el next_number configurado cuando es mayor al emitido", async () => {
  const service = loadAccountingService();
  const { tx, calls } = fakeGoodsReceiptTx({
    emittedMax: 2,
    configuredNumbering: [{ document_type: "EM", prefix: "EM", next_number: 10, active: true }]
  });
  await service.createGoodsReceiptDocumentTx(tx, "tenant-1", 9, goodsReceiptData());
  assert.equal(calls.created[0].document_number, 10);
  assert.equal(calls.created[0].full_number, "EM-000010");
});

test("EM adquiere el candado advisory de numeracion del tenant", async () => {
  const service = loadAccountingService();
  const { tx, calls } = fakeGoodsReceiptTx({ emittedMax: 0, configuredNumbering: [] });
  await service.createGoodsReceiptDocumentTx(tx, "tenant-1", 9, goodsReceiptData());
  assert.equal(calls.locks.length, 1);
  assert.match(calls.locks[0].sql, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.equal(calls.locks[0].key, "tenant-1:accounting-numbering");
});

test("EM lee la numeracion legacy en formato objeto sin descartarla", async () => {
  const service = loadAccountingService();
  // Formato legacy {EM:{...}} en vez de arreglo. Antes se descartaba y resembraba a 1;
  // ahora debe honrar next_number=7 (mayor que el emitido 2).
  const { tx, calls } = fakeGoodsReceiptTx({
    emittedMax: 2,
    configuredNumbering: { EM: { prefix: "EM", next_number: 7, active: true } }
  });
  await service.createGoodsReceiptDocumentTx(tx, "tenant-1", 9, goodsReceiptData());
  assert.equal(calls.created[0].document_number, 7);
  assert.equal(calls.created[0].full_number, "EM-000007");
});

test("AJ (cargue inicial) auto-sana la numeracion igual que EM", async () => {
  const service = loadAccountingService();
  const calls = { locks: [], created: [] };
  const tx = {
    $executeRawUnsafe: async (sql, key) => { calls.locks.push(key); return 1; },
    tenant: {
      findUnique: async () => ({ config: { accounting: { accounting_numbering: [{ document_type: "AJ", prefix: "AJ", next_number: 1, active: true }] } } }),
      update: async () => ({ config: {} })
    },
    cntCabdoc: {
      aggregate: async () => ({ _max: { document_number: 3 } }),
      create: async (args) => { calls.created.push(args.data); return { id: 200, ...args.data }; },
      findUnique: async () => ({ id: 200, lines: [] })
    },
    account: { findFirst: async () => ({ id: 5, code: "1435", active: true, allows_tx: true }), create: async (args) => ({ id: 6, ...args.data, active: true, allows_tx: true }) },
    party: { findFirst: async () => ({ id: 7 }), create: async (args) => ({ id: 8, ...args.data }) },
    ledgerEntry: { create: async () => ({ id: 1 }) },
    cntCuedoc: { create: async () => ({ id: 1 }) }
  };
  await service.createInitialInventoryDocumentTx(tx, "tenant-1", 9, {
    posting_date: new Date("2026-09-21T12:00:00.000Z"),
    society_code: "SOC1",
    lines: [{ inventory_account_code: "1435", amount: 500, branch_code: "B1", cost_center_code: "C1", description: "Inicial" }]
  });
  assert.equal(calls.created[0].document_number, 4);
  assert.equal(calls.created[0].full_number, "AJ-000004");
  assert.deepEqual(calls.locks, ["tenant-1:accounting-numbering"]);
});

test("AE/AS (ajuste) auto-sana la numeracion y admite formato legacy", async () => {
  const service = loadAccountingService();
  const calls = { created: [] };
  const tx = {
    $executeRawUnsafe: async () => 1,
    tenant: {
      findUnique: async () => ({ config: { accounting: { accounting_numbering: { AE: { prefix: "AE", next_number: 2, active: true } } } } }),
      update: async () => ({ config: {} })
    },
    cntCabdoc: {
      aggregate: async () => ({ _max: { document_number: 8 } }),
      create: async (args) => { calls.created.push(args.data); return { id: 300, ...args.data }; },
      findUnique: async () => ({ id: 300, lines: [] })
    },
    account: { findFirst: async () => ({ id: 5, code: "1435", active: true, allows_tx: true }) },
    party: { findFirst: async () => ({ id: 7 }), create: async (args) => ({ id: 8, ...args.data }) },
    ledgerEntry: { create: async () => ({ id: 1 }) },
    cntCuedoc: { create: async () => ({ id: 1 }) }
  };
  await service.createInventoryAdjustmentDocumentTx(tx, "tenant-1", 9, {
    posting_date: new Date("2026-09-21T12:00:00.000Z"),
    document_type: "AE",
    society_code: "SOC1",
    header_text: "Ajuste",
    lines: [{ debit_account_code: "1435", credit_account_code: "2205", amount: 300, description: "Ajuste" }]
  });
  // legacy next_number=2, emitido 8 -> reserva 9.
  assert.equal(calls.created[0].document_number, 9);
  assert.equal(calls.created[0].full_number, "AE-000009");
});
