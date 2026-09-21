// Certificacion LOCAL de la integridad de numeracion contable por tipo de documento.
//
// Defecto certificado (incidente de contabilidad): la numeracion EM (entrada de mercancia)
// se perdia por el read-modify-write del accounting_numbering completo. Otros modulos
// reescriben Tenant.config entero desde una instantanea de cache y revertian EM a un
// next_number obsoleto (p.ej. 1). Como cnt_cabdoc ya tenia EM-000001..N, la siguiente
// entrada volvia a reservar EM-000001 y chocaba contra @@unique([tenant_id, full_number])
// => P2002 => rollback => 409 determinista, imposible de romper reintentando.
//
// Arreglo certificado: reserva atomica y auto-sanada por tipo de documento.
//   - reserveAccountingDocumentNumber adquiere pg_advisory_xact_lock(hashtextextended(tenant:accounting-numbering,0))
//     y reserva max(next_number configurado, MAX(cnt_cabdoc.document_number)+1).
//   - mergeNumbering normaliza el formato legacy en objeto ({EM:{next_number}}) sin descartarlo.
//   - aplicado a los 4 sitios cnt_cabdoc: createAccountingDocument, createGoodsReceiptDocumentTx (EM),
//     createInitialInventoryDocumentTx (AJ), createInventoryAdjustmentDocumentTx (AE/AS).
//
// Este script NO escribe en QA ni en produccion y NO toca la base local: ejercita las
// funciones de servicio exportadas con un tx fiel (misma forma que Prisma) que simula el
// estado exacto del incidente, corre el suite unitario versionado y hace aserciones de codigo.
// Sale con codigo distinto de cero ante cualquier comprobacion fallida o parcial.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");
const SERVICE = path.join(API, "src/modules/accounting/service.js");
const OUTPUT = path.resolve(String(process.argv[2] || "docs/qa/evidence/lote3-hr-accounting-numbering-20260921/accounting-numbering-local-certification.json"));

process.env.DISABLE_REDIS = "true";
delete require.cache[require.resolve(SERVICE)];
const service = require(SERVICE);

const result = {
  change_id: "accounting-numbering-integrity-20260921",
  certification: "accounting-numbering-integrity-local",
  environment: "LOCAL",
  generated_at: new Date().toISOString(),
  scope: {
    defect: "numeracion EM perdida por read-modify-write del accounting_numbering completo; config revertido a next_number obsoleto => P2002/409 determinista en entradas de mercancia.",
    fix: "reserva atomica auto-sanada (candado advisory + max(configurado, MAX(document_number)+1)) y normalizacion legacy del formato objeto, aplicada a los 4 sitios cnt_cabdoc.",
    proven_by_simulated_incident: [
      "config EM next_number=1 con 5 entradas ya emitidas reserva EM-000006 (no EM-000001)",
      "config EM next_number mayor al emitido se respeta",
      "formato legacy {EM:{next_number:7}} se honra en vez de resembrarse a 1",
      "AJ y AE/AS auto-sanan igual que EM",
      "se adquiere el candado advisory de numeracion del tenant antes de reservar"
    ],
    proven_by_code_level_assertion: [
      "reserveAccountingDocumentNumber usa pg_advisory_xact_lock(hashtextextended($1,0)) y cnt_cabdoc.aggregate _max.document_number",
      "los 4 sitios cnt_cabdoc llaman a reserveAccountingDocumentNumber",
      "mergeNumbering delega en normalizeAccountingNumberingRows (acepta arreglo y objeto legacy)"
    ],
    proven_by_versioned_unit_suite: "apps/api/test/accounting-numbering.test.js (6 controles)"
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

// tx fiel a la forma de Prisma para createGoodsReceiptDocumentTx / createInitialInventoryDocumentTx /
// createInventoryAdjustmentDocumentTx. emittedMax = mayor document_number ya persistido en cnt_cabdoc.
function fakeTx({ emittedMax = 0, configuredNumbering = [], documentType = "EM" } = {}) {
  const calls = { locks: [], created: [], numberingWrites: [] };
  const tx = {
    $executeRawUnsafe: async (sql, key) => { calls.locks.push({ sql, key }); return 1; },
    tenant: {
      findUnique: async () => ({ config: { accounting: { accounting_numbering: configuredNumbering } } }),
      update: async (args) => { calls.numberingWrites.push(args.data.config.accounting.accounting_numbering); return { config: args.data.config }; }
    },
    cntCabdoc: {
      aggregate: async (args) => { check("aggregate_scoped_by_document_type", args.where.document_type === documentType, { where: args.where }); return { _max: { document_number: emittedMax } }; },
      create: async (args) => { calls.created.push(args.data); return { id: 100, ...args.data }; },
      findUnique: async (args) => ({ id: args.where.id, ...calls.created[0], lines: [] })
    },
    account: { findFirst: async () => ({ id: 10, code: "1435", active: true, allows_tx: true }), create: async (args) => ({ id: 11, ...args.data, active: true, allows_tx: true }) },
    party: { findFirst: async () => ({ id: 7 }), create: async (args) => ({ id: 8, ...args.data }) },
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

async function main() {
  try {
    // ---- Reproduccion simulada del incidente EM ----
    // A. Config obsoleto (next_number=1) con 5 entradas emitidas: antes reutilizaba EM-000001 (409).
    const stale = fakeTx({ emittedMax: 5, configuredNumbering: [{ document_type: "EM", prefix: "EM", next_number: 1, active: true }] });
    const staleDoc = await service.createGoodsReceiptDocumentTx(stale.tx, "tenant-cert", 9, goodsReceiptData());
    check("em_self_heals_against_emitted_max", stale.calls.created[0].document_number === 6 && staleDoc.full_number === "EM-000006", {
      document_number: stale.calls.created[0].document_number, full_number: staleDoc.full_number
    });
    const healedRow = (stale.calls.numberingWrites[0] || []).find((row) => row.document_type === "EM");
    check("em_persist_repairs_next_number", healedRow && healedRow.next_number === 7, { next_number: healedRow?.next_number });

    // B. Config mayor al emitido se respeta.
    const ahead = fakeTx({ emittedMax: 2, configuredNumbering: [{ document_type: "EM", prefix: "EM", next_number: 10, active: true }] });
    await service.createGoodsReceiptDocumentTx(ahead.tx, "tenant-cert", 9, goodsReceiptData());
    check("em_respects_higher_configured_number", ahead.calls.created[0].document_number === 10 && ahead.calls.created[0].full_number === "EM-000010", {
      document_number: ahead.calls.created[0].document_number
    });

    // C. Formato legacy en objeto: antes se descartaba y resembraba a 1.
    const legacy = fakeTx({ emittedMax: 2, configuredNumbering: { EM: { prefix: "EM", next_number: 7, active: true } } });
    await service.createGoodsReceiptDocumentTx(legacy.tx, "tenant-cert", 9, goodsReceiptData());
    check("em_honors_legacy_object_format", legacy.calls.created[0].document_number === 7 && legacy.calls.created[0].full_number === "EM-000007", {
      document_number: legacy.calls.created[0].document_number
    });

    // D. Candado advisory adquirido antes de reservar.
    check("em_acquires_advisory_lock", stale.calls.locks.length === 1
      && /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/.test(stale.calls.locks[0].sql)
      && stale.calls.locks[0].key === "tenant-cert:accounting-numbering", { locks: stale.calls.locks });

    // E. AJ (cargue inicial) auto-sana igual.
    const aj = fakeTx({ emittedMax: 3, configuredNumbering: [{ document_type: "AJ", prefix: "AJ", next_number: 1, active: true }], documentType: "AJ" });
    await service.createInitialInventoryDocumentTx(aj.tx, "tenant-cert", 9, {
      posting_date: new Date("2026-09-21T12:00:00.000Z"), society_code: "SOC1",
      lines: [{ inventory_account_code: "1435", amount: 500, branch_code: "B1", cost_center_code: "C1", description: "Inicial" }]
    });
    check("aj_self_heals_against_emitted_max", aj.calls.created[0].document_number === 4 && aj.calls.created[0].full_number === "AJ-000004", {
      document_number: aj.calls.created[0].document_number
    });

    // F. AE/AS (ajuste) auto-sana y admite legacy.
    const ae = fakeTx({ emittedMax: 8, configuredNumbering: { AE: { prefix: "AE", next_number: 2, active: true } }, documentType: "AE" });
    await service.createInventoryAdjustmentDocumentTx(ae.tx, "tenant-cert", 9, {
      posting_date: new Date("2026-09-21T12:00:00.000Z"), document_type: "AE", society_code: "SOC1", header_text: "Ajuste",
      lines: [{ debit_account_code: "1435", credit_account_code: "2205", amount: 300, description: "Ajuste" }]
    });
    check("ae_self_heals_and_honors_legacy", ae.calls.created[0].document_number === 9 && ae.calls.created[0].full_number === "AE-000009", {
      document_number: ae.calls.created[0].document_number
    });

    // ---- Aserciones a nivel de codigo ----
    const source = fs.readFileSync(SERVICE, "utf8");
    check("reserve_helper_uses_advisory_lock_and_max", [
      /async function reserveAccountingDocumentNumber\(tx, tenantId, documentType, numbering\)/.test(source),
      /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/.test(source),
      /_max: \{ document_number: true \}/.test(source),
      /Math\.max\(configured, emitted \+ 1\)/.test(source)
    ].every(Boolean), {
      helper: /async function reserveAccountingDocumentNumber/.test(source),
      lock: /pg_advisory_xact_lock/.test(source),
      aggregate: /_max: \{ document_number: true \}/.test(source),
      self_heal: /Math\.max\(configured, emitted \+ 1\)/.test(source)
    });
    const reserveCallSites = (source.match(/await reserveAccountingDocumentNumber\(tx, tenantId, documentType, numbering\)/g) || []).length;
    check("four_cntcabdoc_sites_reserve", reserveCallSites === 4, { reserve_call_sites: reserveCallSites });
    check("merge_numbering_normalizes_legacy", /function mergeNumbering\(defaultTypes, custom\)[\s\S]*?normalizeAccountingNumberingRows\(custom\)/.test(source)
      && /function normalizeAccountingNumberingRows\(value\)/.test(source), {
      merge_uses_normalizer: /for \(const row of normalizeAccountingNumberingRows\(custom\)\)/.test(source),
      normalizer_defined: /function normalizeAccountingNumberingRows\(value\)/.test(source)
    });

    // ---- Suite unitario versionado ----
    const suite = spawnSync(process.execPath, ["--test", "test/accounting-numbering.test.js"], { cwd: API, encoding: "utf8", env: { ...process.env, DISABLE_REDIS: "true" } });
    const suiteOut = `${suite.stdout || ""}${suite.stderr || ""}`;
    const passCount = Number((suiteOut.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1] || 0);
    const failCount = Number((suiteOut.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1] || -1);
    const suitePass = suite.status === 0 && failCount === 0 && passCount === 6;
    check("versioned_unit_suite_passes", suitePass, { exit: suite.status, pass: passCount, fail: failCount });

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    result.finished_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
}

main()
  .then(() => console.log(`CERTIFICACION NUMERACION CONTABLE APROBADA: ${result.checks.length} controles, status=${result.status}`))
  .catch((error) => { console.error(`CERTIFICACION NUMERACION CONTABLE BLOQUEADA: ${error.message}`); process.exitCode = 1; });
