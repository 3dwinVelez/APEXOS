// tenantCache exige REDIS_URL al importar el servicio.
process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const test = require("node:test");
const prisma = require("../src/core/prisma");
const service = require("../src/modules/accounting/service");

// assertPeriodOpen se fija por valor al cargar reversal.js: el stub se instala
// ANTES de requerir el modulo para poder simular periodos abiertos y cerrados.
let assertPeriodOpenImpl = async () => undefined;
service.assertPeriodOpen = (...args) => assertPeriodOpenImpl(...args);
delete require.cache[require.resolve("../src/modules/accounting/reversal")];
const reversal = require("../src/modules/accounting/reversal");

function withFakeTransaction(fakeTx, fn) {
  const original = prisma.$transaction;
  prisma.$transaction = (callback) => callback(fakeTx);
  return Promise.resolve()
    .then(fn)
    .finally(() => { prisma.$transaction = original; });
}

const TENANT = "tenant-reversal-1";
const USER = 99;

function manualDocument(overrides = {}) {
  return {
    id: 1,
    full_number: "CC-000001",
    document_type: "CC",
    posting_date: new Date("2026-03-10T00:00:00.000Z"),
    reference: "Factura externa 123",
    header_text: "Venta manual certificacion",
    society_code: "SOC-01",
    status: "posted",
    is_reversal: false,
    is_cancelled: false,
    total_debit: 150,
    total_credit: 150,
    lines: [
      { line_no: 1, account_id: 10, account_code: "4135", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "credit", debit: 0, credit: 150, description: "Ingreso venta", ledger_entry_id: 11 },
      { line_no: 2, account_id: 20, account_code: "110505", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "debit", debit: 150, credit: 0, description: "Caja contrapartida", ledger_entry_id: 12 }
    ],
    ...overrides
  };
}

function markerRow(documentId, provenance = service.MANUAL_PROVENANCE) {
  return { entity_id: String(documentId), new_value: { provenance } };
}

function fakeWriteClient({ document = manualDocument(), config = {}, linkRows = {}, ledgerTransactionLinked = false, emittedMax = 0, markerDocuments = [document?.id].filter(Boolean), ledgerIds = null } = {}) {
  const calls = {
    advisory: [], cabdocCreate: [], cabdocUpdate: [], cuedocCreate: [], ledgerCreate: [],
    tenantUpdate: [], auditCreate: [], aggregate: [], ledgerFindMany: [], markerQueries: []
  };
  const client = {
    calls,
    $executeRawUnsafe: async (sql, key) => { calls.advisory.push({ sql, key }); },
    cntCabdoc: {
      findFirst: async () => document,
      create: async ({ data }) => { calls.cabdocCreate.push(data); return { id: 500, ...data }; },
      update: async ({ where, data }) => { calls.cabdocUpdate.push({ where, data }); return { id: where.id, ...data }; },
      aggregate: async ({ where }) => { calls.aggregate.push(where); return { _max: { document_number: emittedMax } }; }
    },
    cntCuedoc: {
      create: async ({ data }) => { calls.cuedocCreate.push(data); return { id: 2000 + calls.cuedocCreate.length, ...data }; }
    },
    ledgerEntry: {
      create: async ({ data }) => { calls.ledgerCreate.push(data); return { id: 1000 + calls.ledgerCreate.length, ...data }; },
      // Respeta el filtro transaction_id: { not: null } que usa findDocumentProvenance.
      findFirst: async ({ where }) => (ledgerTransactionLinked && where?.transaction_id?.not === null ? { id: 11 } : null),
      findMany: async ({ where }) => {
        calls.ledgerFindMany.push(where);
        const candidates = ledgerIds || (document?.lines || []).map((line) => line.ledger_entry_id).filter(Boolean);
        const asked = where?.id?.in || [];
        return asked.filter((id) => candidates.includes(id)).map((id) => ({ id }));
      }
    },
    tenant: {
      findUnique: async () => ({ config }),
      update: async ({ where, data }) => { calls.tenantUpdate.push({ where, data }); return { id: where.id, config: data.config }; }
    },
    auditLog: {
      create: async ({ data }) => { calls.auditCreate.push(data); return { id: 1, ...data }; },
      findMany: async ({ where }) => {
        calls.markerQueries.push(where);
        const ids = [].concat(where?.entity_id?.in || [], where?.entity_id ? [where.entity_id] : []);
        return markerDocuments.filter((id) => ids.includes(String(id))).map((id) => markerRow(id));
      }
    }
  };
  const findFirst = (table) => async ({ where }) => {
    const probe = linkRows[table.model];
    return typeof probe === "function" ? probe(where) : (probe || null);
  };
  for (const table of [...reversal.SOURCE_LINK_TABLES, ...reversal.REVERSAL_LINK_TABLES]) {
    client[table.model] = { findFirst: findFirst(table) };
  }
  return client;
}

function openConfig(period = "2026-05", numbering = [{ document_type: "CC", prefix: "CC", next_number: 2, active: true }]) {
  return { accounting: { periods: { [period]: { status: "open" } }, accounting_numbering: numbering } };
}

// ---------------------------------------------------------------- clasificador puro

test("clasificador rechaza documentos que ya son anulaciones", () => {
  const result = reversal.classifyReversalEligibility(manualDocument({ is_reversal: true }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason_code, "REVERSAL_DOCUMENT");
  assert.equal(result.status_code, 409);
  assert.match(result.reason_message, /no se anulan desde este botón/i);
});

test("clasificador rechaza documentos ya anulados dos veces", () => {
  for (const document of [manualDocument({ is_cancelled: true }), manualDocument({ status: "cancelled" })]) {
    const result = reversal.classifyReversalEligibility(document);
    assert.equal(result.eligible, false);
    assert.equal(result.reason_code, "ALREADY_REVERSED");
    assert.equal(result.status_code, 409);
  }
});

test("clasificador rechaza asientos de modulo de origen con explicacion del modulo", () => {
  const result = reversal.classifyReversalEligibility(manualDocument(), {
    source: { module: "treasury", label: "Tesorería (pagos y recaudos CI/CE)" }
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason_code, "SOURCE_MODULE_DOCUMENT");
  assert.equal(result.status_code, 422);
  assert.match(result.reason_message, /Tesorería/);
  assert.match(result.reason_message, /módulo de origen/);
});

test("clasificador rechaza asientos con lineas ligadas a transaccion de compras", () => {
  const result = reversal.classifyReversalEligibility(manualDocument(), { hasTransactionLinks: true });
  assert.equal(result.eligible, false);
  assert.equal(result.origin, "purchases");
  assert.equal(result.reason_code, "SOURCE_MODULE_DOCUMENT");
  assert.equal(result.status_code, 422);
});

test("clasificador rechaza el cargue inicial de inventario por firma de cabecera", () => {
  const result = reversal.classifyReversalEligibility(manualDocument({ header_text: "Cargue inicial de inventario" }));
  assert.equal(result.eligible, false);
  assert.equal(result.origin, "inventory");
  assert.equal(result.status_code, 422);
});

const OPENING_REFERENCE = "SI-0123456789ABCDEF01234567";

function openingDocument(overrides = {}) {
  return manualDocument({
    document_type: "AJ",
    reference: OPENING_REFERENCE,
    header_text: "Saldos iniciales historicos",
    total_debit: 200,
    total_credit: 200,
    lines: [
      { line_no: 1, account_id: 10, account_code: "5195", branch_code: "B1", cost_center_code: "C1", party_id: null, party_tax_id: null, movement: "debit", debit: 200, credit: 0, description: "Saldo inicial historico 5195", ledger_entry_id: 21 },
      { line_no: 2, account_id: 20, account_code: "110505", branch_code: "B1", cost_center_code: "C1", party_id: null, party_tax_id: null, movement: "credit", debit: 0, credit: 200, description: "Saldo inicial historico 110505", ledger_entry_id: 22 }
    ],
    ...overrides
  });
}

test("clasificador declara elegibles los saldos iniciales historicos solo con la firma exacta del productor", () => {
  const result = reversal.classifyReversalEligibility(openingDocument(), {});
  assert.equal(result.eligible, true);
  assert.equal(result.origin, "opening_balances");
  assert.equal(result.origin_label, "Saldos iniciales históricos");
});

test("la firma de saldos iniciales exige referencia SI-<hash> de 24 hex, cabecera, tipo AJ y lineas", () => {
  const variants = [
    openingDocument({ reference: "SI-abc123" }),
    openingDocument({ reference: OPENING_REFERENCE, header_text: "Otra cabecera" }),
    openingDocument({ reference: OPENING_REFERENCE, header_text: "Saldos iniciales historicos", document_type: "CC" }),
    openingDocument({ reference: OPENING_REFERENCE, header_text: "Saldos iniciales historicos", lines: [] })
  ];
  for (const document of variants) {
    const result = reversal.classifyReversalEligibility(document, {});
    assert.equal(result.eligible, false);
    assert.equal(result.origin, "unverified");
    assert.equal(result.reason_code, "ORIGIN_UNVERIFIED");
  }
});

test("clasificador DENIEGA por defecto un asiento que solo imita tipo y cabecera manual", () => {
  const result = reversal.classifyReversalEligibility(manualDocument(), {});
  assert.equal(result.eligible, false);
  assert.equal(result.origin, "unverified");
  assert.equal(result.reason_code, "ORIGIN_UNVERIFIED");
  assert.equal(result.status_code, 422);
  assert.match(result.reason_message, /no se pudo comprobar/i);
});

test("clasificador acepta manual solo con la marca de origen que grabo el servidor", () => {
  const result = reversal.classifyReversalEligibility(manualDocument(), { marker: service.MANUAL_PROVENANCE });
  assert.equal(result.eligible, true);
  assert.equal(result.origin, "manual");
});

test("un asiento heredado con cabecera y referencia de saldos iniciales exige firma completa, no cabecera sola", () => {
  const looked = manualDocument({ reference: OPENING_REFERENCE, header_text: "Saldos iniciales historicos", document_type: "AJ", lines: [] });
  assert.equal(reversal.classifyReversalEligibility(looked, {}).origin, "unverified");
  const marked = reversal.classifyReversalEligibility(manualDocument(), { marker: service.OPENING_BALANCE_PROVENANCE });
  assert.equal(marked.eligible, true);
  assert.equal(marked.origin, "opening_balances");
});

test("reversalStatusOf distingue anulado, anulacion y contabilizado", () => {
  assert.equal(reversal.reversalStatusOf(manualDocument()), "posted");
  assert.equal(reversal.reversalStatusOf(manualDocument({ is_cancelled: true })), "cancelled");
  assert.equal(reversal.reversalStatusOf(manualDocument({ status: "cancelled" })), "cancelled");
  assert.equal(reversal.reversalStatusOf(manualDocument({ is_reversal: true })), "reversal");
});

// ---------------------------------------------------------------- provenance real

function fakeReadClient({ linkRows = {}, txLinkedLedgerIds = [], markers = [] } = {}) {
  const calls = {};
  const client = { calls };
  client.auditLog = {
    findMany: async ({ where }) => {
      (calls.auditLog ||= []).push({ op: "findMany", where });
      const ids = [].concat(where?.entity_id?.in || [], where?.entity_id ? [where.entity_id] : []).map(String);
      return markers.filter((row) => ids.includes(String(row.entity_id)));
    }
  };
  // Una sola clave de tabla puede aparecer en SOURCE_LINK_TABLES y en
  // REVERSAL_LINK_TABLES (p. ej. treasuryPayment): el handler se crea una vez por modelo
  // y una segunda asignacion no debe reemplazar al primero.
  const findFirst = (table) => async ({ where }) => {
    (calls[table.model] ||= []).push({ op: "findFirst", where });
    const probe = linkRows[table.model];
    return typeof probe === "function" ? probe(where) : (probe || null);
  };
  const findMany = (table) => async ({ where }) => {
    (calls[table.model] ||= []).push({ op: "findMany", where });
    const probe = linkRows[table.model];
    if (!probe) return [];
    if (typeof probe === "function") {
      const result = probe(where);
      return Array.isArray(result) ? result : (result ? [result] : []);
    }
    return Array.isArray(probe) ? probe : [probe];
  };
  for (const table of [...reversal.SOURCE_LINK_TABLES, ...reversal.REVERSAL_LINK_TABLES]) {
    if (!client[table.model]) client[table.model] = { findFirst: findFirst(table), findMany: findMany(table) };
  }
  client.ledgerEntry = {
    findFirst: async ({ where }) => {
      (calls.ledgerEntry ||= []).push({ op: "findFirst", where });
      const ids = where?.id?.in || [];
      return txLinkedLedgerIds.some((id) => ids.includes(id)) ? { id: ids[0] } : null;
    },
    findMany: async ({ where }) => {
      (calls.ledgerEntry ||= []).push({ op: "findMany", where });
      const ids = where?.id?.in || [];
      return ids.filter((id) => txLinkedLedgerIds.includes(id)).map((id) => ({ id }));
    }
  };
  return client;
}

test("provenance encuentra la tabla de negocio que referencia el asiento", async () => {
  const client = fakeReadClient({ linkRows: { treasuryPayment: { id: 9 } } });
  const document = manualDocument();
  const provenance = await reversal.findDocumentProvenance(client, TENANT, document);
  assert.equal(provenance.source.model, "treasuryPayment");
  assert.equal(provenance.source.module, "treasury");
  assert.equal(provenance.hasTransactionLinks, false);
  // treasuryPayment figura en SOURCE y REVERSAL: la primera llamada puede no ser la de origen.
  const sourceCall = client.calls.treasuryPayment.find((call) => Number(call.where.accounting_document_id) === 1);
  assert.ok(sourceCall, "se consulta treasuryPayment por el documento origen");
  assert.equal(sourceCall.where.tenant_id, TENANT, "modelos fuera de TENANT_MODELS llevan tenant_id explicito");
});

test("provenance no agrega tenant_id explicito a modelos dentro de TENANT_MODELS", async () => {
  const client = fakeReadClient({ linkRows: { cxpCabdoc: { id: 3 } } });
  const provenance = await reversal.findDocumentProvenance(client, TENANT, manualDocument());
  assert.equal(provenance.source.model, "cxpCabdoc");
  const where = client.calls.cxpCabdoc[0].where;
  assert.equal(Number(where.accounting_document_id), 1);
  assert.equal("tenant_id" in where, false, "el middleware de tenancy ya cubre estos modelos");
});

test("provenance detecta lineas de libro ligadas a transaccion de compras", async () => {
  const client = fakeReadClient({ txLinkedLedgerIds: [11] });
  const provenance = await reversal.findDocumentProvenance(client, TENANT, manualDocument());
  assert.equal(provenance.source, null);
  assert.equal(provenance.hasTransactionLinks, true);
  assert.deepEqual(client.calls.ledgerEntry[0].where.tenant_id, TENANT);
  assert.equal(client.calls.ledgerEntry[0].where.transaction_id.not, null);
});

test("provenance de asiento limpio no encuentra origen ni marca", async () => {
  const client = fakeReadClient();
  const provenance = await reversal.findDocumentProvenance(client, TENANT, manualDocument({ lines: [] }));
  assert.equal(provenance.source, null);
  assert.equal(provenance.hasTransactionLinks, false);
  assert.equal(provenance.marker, null);
  const markerQuery = client.calls.auditLog[0].where;
  assert.equal(markerQuery.tenant_id, TENANT);
  assert.equal(markerQuery.entity, "CntCabdoc");
  assert.equal(markerQuery.action, "CREATE");
  assert.equal(markerQuery.new_value.path[0], "provenance");
});

test("provenance reconoce la marca de origen manual grabada por el servidor", async () => {
  const client = fakeReadClient({ markers: [markerRow(1)] });
  const provenance = await reversal.findDocumentProvenance(client, TENANT, manualDocument());
  assert.equal(provenance.marker, service.MANUAL_PROVENANCE);
});

test("provenance ignora marcas desconocidas o de otro asiento", async () => {
  const client = fakeReadClient({ markers: [{ entity_id: "1", new_value: { provenance: "invented" } }, { entity_id: "2", new_value: { provenance: service.MANUAL_PROVENANCE } }] });
  const provenance = await reversal.findDocumentProvenance(client, TENANT, manualDocument({ id: 1 }));
  assert.equal(provenance.marker, null);
});

test("provenance por lote consulta una vez por tabla y clasifica por documento", async () => {
  const client = fakeReadClient({
    linkRows: {
      salesInvoice: (where) => where.accounting_document_id?.in?.includes(1) ? [{ accounting_document_id: 1 }] : []
    },
    txLinkedLedgerIds: [22]
  });
  const rows = [
    manualDocument({ id: 1, lines: [{ ledger_entry_id: 22 }] }),
    manualDocument({ id: 2, lines: [] })
  ];
  const byDoc = await reversal.collectDocumentsProvenance(client, TENANT, rows);
  assert.equal(byDoc.get(1).source.model, "salesInvoice");
  assert.equal(byDoc.get(1).hasTransactionLinks, true);
  assert.equal(byDoc.get(2).source, null);
  assert.equal(byDoc.get(2).hasTransactionLinks, false);
  assert.equal(client.calls.salesInvoice.filter((call) => call.op === "findMany").length, 1);
});

test("provenance por lote adjunta la marca solo al documento que la tiene", async () => {
  const client = fakeReadClient({ markers: [markerRow(7)] });
  const byDoc = await reversal.collectDocumentsProvenance(client, TENANT, [manualDocument({ id: 7 }), manualDocument({ id: 8 })]);
  assert.equal(byDoc.get(7).marker, service.MANUAL_PROVENANCE);
  assert.equal(byDoc.get(8).marker, null);
  assert.equal(client.calls.auditLog.length, 1, "una sola consulta de marcas por lote");
});

test("enriquecimiento adjunta estado, documento de anulacion y elegibilidad", async () => {
  const cancelled = manualDocument({ id: 3, is_cancelled: true, cancelled_by: 7 });
  const client = fakeReadClient();
  client.cntCabdoc = {
    findMany: async () => [{ id: 30, full_number: "CC-000030", referenced_document_id: 3, posting_date: new Date("2026-03-11T00:00:00.000Z") }]
  };
  const [enriched] = await reversal.enrichDocumentsWithReversal(client, TENANT, [cancelled]);
  assert.equal(enriched.reversal_status, "cancelled");
  assert.equal(enriched.reversal_document.full_number, "CC-000030");
  assert.equal(enriched.reversal_eligibility.reason_code, "ALREADY_REVERSED");
});

test("enriquecimiento marca los documentos de anulacion con su documento original", async () => {
  const reversalDoc = manualDocument({ id: 30, is_reversal: true, referenced_document_id: 3 });
  const client = fakeReadClient();
  client.cntCabdoc = { findMany: async () => [] };
  const [enriched] = await reversal.enrichDocumentsWithReversal(client, TENANT, [reversalDoc]);
  assert.equal(enriched.reversal_status, "reversal");
  assert.equal(enriched.reverses_document_id, 3);
  assert.equal(enriched.reversal_eligibility.reason_code, "REVERSAL_DOCUMENT");
});

// ---------------------------------------------------------------- transaccion de anulacion

test("anulacion crea el documento espejo, invierte las lineas, cancela el original y audita", async () => {
  const document = manualDocument();
  const client = fakeWriteClient({ document, config: openConfig(), emittedMax: 1 });
  await withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, {
    reason: "Error de digitacion en valores",
    reversal_date: "2026-05-10"
  }));

  assert.equal(client.calls.cabdocCreate.length, 1);
  const header = client.calls.cabdocCreate[0];
  assert.equal(header.document_type, "CC");
  assert.equal(header.document_number, 2);
  assert.equal(header.full_number, "CC-000002");
  assert.equal(header.reference, "CC-000001");
  assert.match(header.header_text, /^Anulación CC-000001: Error de digitacion en valores$/);
  assert.equal(header.society_code, "SOC-01");
  assert.equal(header.status, "posted");
  assert.equal(header.referenced_document_id, 1);
  assert.equal(header.is_reversal, true);
  assert.equal(header.total_debit, 150);
  assert.equal(header.total_credit, 150);
  assert.equal(header.created_by, USER);

  assert.equal(client.calls.ledgerCreate.length, 2);
  assert.deepEqual(
    client.calls.ledgerCreate.map((row) => ({ account_id: row.account_id, debit: row.debit, credit: row.credit, transaction_id: row.transaction_id, period: row.period })),
    [
      { account_id: 10, debit: 150, credit: 0, transaction_id: null, period: "2026-05" },
      { account_id: 20, debit: 0, credit: 150, transaction_id: null, period: "2026-05" }
    ]
  );
  assert.match(client.calls.ledgerCreate[0].description, /^Anulación Ingreso venta: Error de digitacion en valores$/);

  assert.equal(client.calls.cuedocCreate.length, 2);
  assert.deepEqual(
    client.calls.cuedocCreate.map((row) => ({
      account_id: row.account_id, account_code: row.account_code, branch_code: row.branch_code,
      cost_center_code: row.cost_center_code, party_id: row.party_id, party_tax_id: row.party_tax_id,
      movement: row.movement, ledger_entry_id: row.ledger_entry_id
    })),
    [
      { account_id: 10, account_code: "4135", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "debit", ledger_entry_id: 1001 },
      { account_id: 20, account_code: "110505", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "credit", ledger_entry_id: 1002 }
    ]
  );

  assert.deepEqual(client.calls.cabdocUpdate, [{
    where: { id: 1 },
    data: { status: "cancelled", is_cancelled: true, cancelled_by: USER, cancelled_at: new Date("2026-05-10T00:00:00.000Z") }
  }]);

  const updatedConfig = client.calls.tenantUpdate[0].data.config.accounting;
  assert.equal(updatedConfig.accounting_numbering.find((row) => row.document_type === "CC").next_number, 3);
  assert.deepEqual(client.calls.auditCreate[0], {
    user_id: USER,
    action: "REVERSE",
    module: "accounting",
    entity: "CntCabdoc",
    entity_id: "1",
    old_value: { status: "posted", full_number: "CC-000001" },
    new_value: {
      status: "cancelled", reason: "Error de digitacion en valores",
      reversal_date: "2026-05-10T00:00:00.000Z", reversal_document_id: 500, reversal_number: "CC-000002"
    }
  });

  // Orden fijo: primero el candado del documento, luego el candado compartido de config,
  // y la config se lee DESPUES de adquirirlo (nunca antes). El candado de numeracion
  // puede re-adquirirse con la misma clave (pg_advisory_xact_lock es reentrante y seguro),
  // asi que solo se exige la secuencia, no una cantidad exacta de adquisiciones.
  const advisoryKeys = client.calls.advisory.map((row) => row.key);
  assert.deepEqual(advisoryKeys.slice(0, 2), [
    `${TENANT}:accounting-reversal:1`,
    `${TENANT}:accounting-numbering`
  ]);
  assert.equal(advisoryKeys.filter((key) => key === `${TENANT}:accounting-reversal:1`).length, 1, "el candado del documento se toma una sola vez");
  assert.ok(advisoryKeys.every((key) => key === `${TENANT}:accounting-reversal:1` || key === `${TENANT}:accounting-numbering`));
});

test("anulacion rechaza un asiento sin marca de origen aunque imite tipo y cabecera manual", async () => {
  const client = fakeWriteClient({
    document: manualDocument({ header_text: "Documento manual", document_type: "CC" }),
    config: openConfig(),
    markerDocuments: []
  });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "origen no probado", reversal_date: "2026-05-10" })),
    (error) => error.statusCode === 422 && error.code === "ORIGIN_UNVERIFIED"
  );
  assert.equal(client.calls.cabdocCreate.length, 0);
  assert.equal(client.calls.ledgerCreate.length, 0);
  assert.equal(client.calls.cabdocUpdate.length, 0);
});

test("anulacion de saldos iniciales exige la firma exacta y se emite con la marca de origen", async () => {
  const opening = openingDocument();
  const markedClient = fakeWriteClient({ document: opening, config: openConfig("2026-05", [{ document_type: "AJ", prefix: "AJ", next_number: 1, active: true }]), markerDocuments: [] });
  const result = await withFakeTransaction(markedClient, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "saldos errados", reversal_date: "2026-05-10" }));
  assert.equal(result.reversed, true);
  assert.equal(markedClient.calls.cabdocCreate.length, 1);

  // La firma heredada solo vale si es exacta: cabecera y carencia de tipo AJ no prueban.
  const lookalike = fakeWriteClient({ document: openingDocument({ document_type: "CC" }), config: openConfig(), markerDocuments: [] });
  await assert.rejects(
    withFakeTransaction(lookalike, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "firma imitada", reversal_date: "2026-05-10" })),
    (error) => error.statusCode === 422 && error.code === "ORIGIN_UNVERIFIED"
  );
  assert.equal(lookalike.calls.cabdocCreate.length, 0);
  const imitated = fakeWriteClient({ document: openingDocument({ reference: "SI-abc", header_text: "Saldos iniciales historicos" }), config: openConfig(), markerDocuments: [] });
  await assert.rejects(
    withFakeTransaction(imitated, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "firma imitada", reversal_date: "2026-05-10" })),
    (error) => error.statusCode === 422 && error.code === "ORIGIN_UNVERIFIED"
  );
  assert.equal(imitated.calls.cabdocCreate.length, 0);
});

test("anulacion rechaza lineas vacias en vez de emitir un espejo parcial", async () => {
  const document = manualDocument({
    lines: [
      { line_no: 1, account_id: 10, account_code: "4135", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "debit", debit: 0, credit: 0, description: "Linea sin valor", ledger_entry_id: 11 },
      { line_no: 2, account_id: 20, account_code: "110505", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "debit", debit: 150, credit: 0, description: "Caja", ledger_entry_id: 12 }
    ],
    total_debit: 150, total_credit: 0
  });
  const client = fakeWriteClient({ document, config: openConfig(), emittedMax: 0 });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "linea vacia", reversal_date: "2026-05-10" })),
    (error) => error.statusCode === 422 && error.code === "REVERSAL_SOURCE_EMPTY_LINE"
  );
  assert.equal(client.calls.ledgerCreate.length, 0);
  assert.equal(client.calls.cabdocCreate.length, 0);
});

test("anulacion rechaza asientos sin lineas, desbalanceados o con totales de cabecera inconsistentes", async () => {
  const cases = [
    { document: manualDocument({ lines: [] }), code: "REVERSAL_SOURCE_LINES_MISSING" },
    { document: manualDocument({ total_debit: 900, total_credit: 900 }), code: "REVERSAL_SOURCE_TOTALS_MISMATCH" },
    {
      document: manualDocument({
        lines: [
          { line_no: 1, account_id: 10, account_code: "4135", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "credit", debit: 0, credit: 150, description: "Ingreso", ledger_entry_id: 11 },
          { line_no: 2, account_id: 20, account_code: "110505", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "debit", debit: 100, credit: 0, description: "Caja", ledger_entry_id: 12 }
        ],
        total_debit: 100, total_credit: 150
      }),
      code: "REVERSAL_SOURCE_UNBALANCED"
    }
  ];
  for (const item of cases) {
    const client = fakeWriteClient({ document: item.document, config: openConfig() });
    await assert.rejects(
      withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "estructura invalida", reversal_date: "2026-05-10" })),
      (error) => error.statusCode === 422 && error.code === item.code
    );
    assert.equal(client.calls.cabdocCreate.length, 0, item.code);
    assert.equal(client.calls.cabdocUpdate.length, 0, item.code);
  }
});

test("anulacion rechaza un asiento de libro declarado que no aparece en las lineas", () => {
  const document = manualDocument();
  const ownLedgerIds = document.lines.map((line) => line.ledger_entry_id);
  const assessment = reversal.assessReversalStructure(document, { ledgerIds: [...ownLedgerIds, 77], foundLedgerIds: [...ownLedgerIds, 77] });
  assert.equal(assessment.ok, false);
  assert.equal(assessment.code, "REVERSAL_SOURCE_LEDGER_INCONSISTENT");
  // Sin enlaces de libro heredados el asiento se valida con sus propias lineas.
  const legacy = manualDocument({
    lines: document.lines.map((line) => ({ ...line, ledger_entry_id: null }))
  });
  assert.equal(reversal.assessReversalStructure(legacy, { ledgerIds: [], foundLedgerIds: [] }).ok, true);
});

test("anulacion rechaza lineas cuyo asiento de libro no existe o pertenece a otro tenant", async () => {
  const client = fakeWriteClient({ document: manualDocument(), config: openConfig(), ledgerIds: [11] });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "libro inconsistente", reversal_date: "2026-05-10" })),
    (error) => error.statusCode === 422 && error.code === "REVERSAL_SOURCE_LEDGER_INCONSISTENT"
  );
  assert.equal(client.calls.ledgerFindMany[0].tenant_id, TENANT);
  assert.equal(client.calls.cabdocCreate.length, 0);
});

test("anulacion invierte la base y el valor del impuesto y conserva la tasa", async () => {
  // Totales de cabecera = suma de lineas (119 / 119), como emite createAccountingDocument;
  // el IVA viaja en campos fiscales y no altera los movimientos contables.
  const document = manualDocument({
    total_debit: 119,
    total_credit: 119,
    lines: [
      { line_no: 1, account_id: 10, account_code: "240805", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "credit", debit: 0, credit: 119, description: "IVA generado", ledger_entry_id: 11, tax_type: "iva", tax_code: "01", tax_base: 100, tax_rate: 19, tax_amount: 19 },
      { line_no: 2, account_id: 20, account_code: "110505", branch_code: "B1", cost_center_code: "C1", party_id: 5, party_tax_id: "900255181", movement: "debit", debit: 119, credit: 0, description: "Caja IVA", ledger_entry_id: 12, tax_type: "iva", tax_code: "01", tax_base: 100, tax_rate: 19, tax_amount: 19 }
    ]
  });
  const client = fakeWriteClient({ document, config: openConfig(), emittedMax: 1 });
  await withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "IVA errado", reversal_date: "2026-05-10" }));
  assert.deepEqual(client.calls.cuedocCreate.map((row) => ({ tax_type: row.tax_type, tax_code: row.tax_code, tax_base: row.tax_base, tax_rate: row.tax_rate, tax_amount: row.tax_amount })), [
    { tax_type: "iva", tax_code: "01", tax_base: 100, tax_rate: 19, tax_amount: 19 },
    { tax_type: "iva", tax_code: "01", tax_base: -100, tax_rate: 19, tax_amount: -19 }
  ]);
});

test("anulacion exige fecha ISO exacta sin rollover de calendario", () => {
  assert.throws(() => reversal.parseReversalDate("2026-02-31"), (error) => error.statusCode === 400 && error.code === "INVALID_REVERSAL_DATE");
  assert.throws(() => reversal.parseReversalDate("2026-5-10"), (error) => error.code === "INVALID_REVERSAL_DATE");
  assert.throws(() => reversal.parseReversalDate("2026-05-10T00:00:00Z"), (error) => error.code === "INVALID_REVERSAL_DATE");
  assert.throws(() => reversal.parseReversalDate(""), (error) => error.code === "INVALID_REVERSAL_DATE");
  assert.equal(reversal.parseReversalDate("2028-02-29").toISOString(), "2028-02-29T00:00:00.000Z");
});

test("anulacion rechaza por API una fecha con rollover antes de abrir transaccion", async () => {
  const client = fakeWriteClient({ document: manualDocument(), config: openConfig() });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "fecha imposible", reversal_date: "2026-02-31" })),
    (error) => error.statusCode === 400 && error.code === "INVALID_REVERSAL_DATE"
  );
  assert.equal(client.calls.advisory.length, 0);
});

test("anulacion concurrente doble recibe 409 sin crear segundo documento", async () => {
  const document = manualDocument({ is_cancelled: true, status: "cancelled" });
  const client = fakeWriteClient({ document, config: openConfig() });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "segundo intento", reversal_date: "2026-05-10" })),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "ALREADY_REVERSED");
      return true;
    }
  );
  assert.equal(client.calls.cabdocCreate.length, 0);
  assert.equal(client.calls.ledgerCreate.length, 0);
});

test("anulacion rechaza asiento con lineas de libro ligadas a transaccion de compras", async () => {
  const client = fakeWriteClient({ document: manualDocument(), config: openConfig(), ledgerTransactionLinked: true });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "linea de compras", reversal_date: "2026-05-10" })),
    (error) => error.statusCode === 422 && error.code === "SOURCE_MODULE_DOCUMENT" && /compras/.test(error.message)
  );
  assert.equal(client.calls.cabdocCreate.length, 0);
});

test("anulacion rechaza asiento de modulo de origen con 422 dentro de la transaccion", async () => {
  const client = fakeWriteClient({
    document: manualDocument(),
    config: openConfig(),
    linkRows: { treasuryPayment: { id: 9 } }
  });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "intento indebido", reversal_date: "2026-05-10" })),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.code, "SOURCE_MODULE_DOCUMENT");
      assert.match(error.message, /Tesorería/);
      return true;
    }
  );
  assert.equal(client.calls.cabdocCreate.length, 0);
  assert.equal(client.calls.cabdocUpdate.length, 0);
});

test("anulacion rechaza periodo cerrado re-verificado contra la config fresca", async () => {
  const client = fakeWriteClient({ document: manualDocument(), config: openConfig(), emittedMax: 0 });
  client.tenant.findUnique = async () => ({ config: { accounting: { periods: { "2026-05": { status: "closed" } }, accounting_numbering: [] } } });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "fuera de periodo", reversal_date: "2026-05-10" })),
    (error) => {
      assert.equal(error.statusCode, 423);
      assert.equal(error.code, "PERIOD_CLOSED");
      return true;
    }
  );
  assert.equal(client.calls.cabdocCreate.length, 0);
});

test("anulacion respeta el cierre de periodo previo a la transaccion", async () => {
  assertPeriodOpenImpl = async () => {
    const error = new Error("El periodo contable 2026-05 esta cerrado");
    error.statusCode = 423;
    error.code = "PERIOD_CLOSED";
    throw error;
  };
  try {
    const client = fakeWriteClient({ document: manualDocument(), config: openConfig() });
    await assert.rejects(
      withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "fuera de periodo", reversal_date: "2026-05-10" })),
      (error) => error.statusCode === 423 && error.code === "PERIOD_CLOSED"
    );
    assert.equal(client.calls.advisory.length, 0, "no se abre transaccion con periodo cerrado");
  } finally {
    assertPeriodOpenImpl = async () => undefined;
  }
});

test("anulacion valida motivo y fecha antes de tocar la base de datos", async () => {
  const client = fakeWriteClient({ document: manualDocument(), config: openConfig() });
  const cases = [
    { reason: "ab", reversal_date: "2026-05-10", code: "REVERSAL_REASON_REQUIRED" },
    { reason: "x".repeat(501), reversal_date: "2026-05-10", code: "REVERSAL_REASON_TOO_LONG" },
    { reason: "motivo valido", reversal_date: "no-es-fecha", code: "INVALID_REVERSAL_DATE" },
    { reason: "motivo valido", reversal_date: "", code: "INVALID_REVERSAL_DATE" }
  ];
  for (const item of cases) {
    await assert.rejects(
      withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, item)),
      (error) => error.statusCode === 400 && error.code === item.code
    );
  }
  assert.equal(client.calls.advisory.length, 0);
});

test("anulacion rechaza fechas inexistentes en el calendario con 400", async () => {
  const client = fakeWriteClient({ document: manualDocument(), config: openConfig() });
  for (const reversal_date of ["2026-02-30", "2026-13-01", "2026-00-10", "2026/05/10"]) {
    await assert.rejects(
      withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "fecha invalida", reversal_date })),
      (error) => error.statusCode === 400 && error.code === "INVALID_REVERSAL_DATE"
    );
  }
  assert.equal(client.calls.advisory.length, 0);
});

test("anulacion devuelve 404 cuando el documento no existe en el tenant", async () => {
  const client = fakeWriteClient({ document: null, config: openConfig() });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 999, { reason: "no existe", reversal_date: "2026-05-10" })),
    (error) => error.statusCode === 404 && error.code === "ACCOUNTING_DOCUMENT_NOT_FOUND"
  );
});

test("anulacion exige numeracion activa del tipo de documento original", async () => {
  const client = fakeWriteClient({ document: manualDocument({ document_type: "ZZ" }), config: openConfig(), emittedMax: 0 });
  await assert.rejects(
    withFakeTransaction(client, () => reversal.reverseAccountingDocument(TENANT, USER, 1, { reason: "tipo sin numeracion", reversal_date: "2026-05-10" })),
    (error) => error.statusCode === 400 && error.code === "REVERSAL_NUMBERING_NOT_FOUND"
  );
  assert.equal(client.calls.cabdocCreate.length, 0);
});

test("createAccountingDocument es el unico llamador de la marca de origen manual", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const serviceSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/service.js"), "utf8");
  const routeSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/routes.js"), "utf8");
  const markers = [...serviceSource.matchAll(/provenance: MANUAL_PROVENANCE/g)];
  assert.equal(markers.length, 1, "solo createAccountingDocument graba la marca manual");
  assert.equal(routeSource.includes("MANUAL_PROVENANCE"), false, "las rutas no inyectan la marca");
  assert.equal(serviceSource.includes("header_text === \"manual\""), false, "la cabecera no prueba origen");
  assert.equal(serviceSource.includes("header_text === \"Documento contable manual\""), false, "la cabecera no prueba origen");
  // La marca manual solo aparece dentro de la transaccion de createAccountingDocument.
  const createBlock = serviceSource.slice(serviceSource.indexOf("async function createAccountingDocument("), serviceSource.indexOf("async function listPayableDocuments("));
  assert.equal([...createBlock.matchAll(/provenance: MANUAL_PROVENANCE/g)].length, 1);
  // Cada modulo escribe sus propios asientos en su transaccion; ninguno usa el creador manual.
  for (const modulePath of ["../src/modules/petty-cash/service.js"]) {
    const source = fs.readFileSync(path.resolve(__dirname, modulePath), "utf8");
    assert.doesNotMatch(source, /accounting\.createAccountingDocument\(/);
  }
});

test("rutas de anulacion estan protegidas por permisos de contabilidad", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/routes.js"), "utf8");
  assert.match(routes, /accounting\/documents\/:id\/reversal-eligibility/);
  assert.match(routes, /accounting\/documents\/:id\/reverse/);
  assert.match(routes, /documentReversalSchema/);
  assert.match(routes, /requirePermission\("accounting", "write"\)/);
  assert.match(routes, /requirePermission\("accounting", "read"\)/);
});
