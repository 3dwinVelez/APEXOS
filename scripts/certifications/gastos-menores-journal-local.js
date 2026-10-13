// Certificacion LOCAL (en vivo) del registro de gastos tipo planilla (journal) de Gastos Menores.
//
// Alcance certificado (rediseño GM-UI-1, commit "feat(gastos-menores): registro de gastos tipo
// planilla (journal) inline" en desarrollo):
//   1. Contrato de carga de la pantalla: las 7 consultas que el journal hace al montar
//      (comprobantes filtrados por periodo, cajas, conceptos, maestro de IVA de compras,
//      proveedores, anticipos de TODOS los estados y arbol organizacional con centros de costo).
//   2. Contrato de digitacion journal: payload real de la planilla (concept_id numerico por
//      linea, vat_code null = sin IVA —el default del concepto es solo sugerencia de la UI y
//      NO se aplica automaticamente—, cost_center_code por linea, branch_code null,
//      proveedor/factura por linea). vat_amount/total enviados por el cliente se ignoran y el
//      servidor recalcula desde base_amount y el maestro de IVA.
//   3. Guardas del servidor que sostienen la planilla: proveedor/factura exigidos por concepto,
//      anticipo de otra caja rechazado, IVA inexistente rechazado, linea sin concepto rechazada.
//   4. Historial del journal: filtro por caja + rango de fechas (date_from/date_to), detalle del
//      comprobante con lineas, y anulacion con reversa contable que restaura el saldo del
//      anticipo (bloqueada si el anticipo ya fue liquidado).
//   5. Suites unitarias versionadas del modulo (3 API + 4 web) y aserciones de codigo sobre la
//      pagina journal (planilla inline: draftLines/focusNextCell/auto-append, limpieza del
//      anticipo al cambiar de caja, creacion fuera de ModalFrame).
//
// Arranca la API Fastify contra la base LOCAL, ejercita los endpoints reales por HTTP con el
// administrador demo y ademas corre las suites unitarias versionadas del modulo. NO escribe en
// QA ni en produccion: aborta si DATABASE_URL no apunta a localhost/127.0.0.1. Sale con codigo
// distinto de cero ante cualquier fallo.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (!v.startsWith("--")) continue;
    out[v.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}
const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || ".env")));

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: la certificacion solo corre contra una base LOCAL (localhost/127.0.0.1). Define DATABASE_URL local antes de ejecutar.");
  process.exit(1);
}
process.env.DISABLE_REDIS = process.env.DISABLE_REDIS || "true";
// /health expone el commit desde GIT_COMMIT_SHA: se ancla al HEAD real para que la evidencia
// local sea trazable al candidato exacto que se promueve, igual que en Railway.
if (!process.env.GIT_COMMIT_SHA) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: path.resolve(__dirname, "..", ".."), encoding: "utf8" });
  if (head.status === 0) process.env.GIT_COMMIT_SHA = head.stdout.trim();
}

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");
const WEB = path.join(ROOT, "apps/web");
const PORT = Number(args.port || 3213);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 25000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/gastos-menores-journal-20261013/local-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const EMAIL = process.env.LOCAL_TMS_EMAIL || "demo@apex.local";
const PASSWORD = process.env.LOCAL_TMS_PASSWORD || "test1234";
const CERT_ID = "gastos-menores-journal-20261013";

const SERVICE_SRC = path.join(API, "src/modules/petty-cash/service.js");
const ROUTES_SRC = path.join(API, "src/modules/petty-cash/routes.js");
const SCHEMA_SRC = path.join(API, "prisma/schema.prisma");
const GASTOS_PAGE_SRC = path.join(WEB, "app/dashboard/gastos-menores/gastos/page.tsx");
const WEB_PAGES = [
  "apps/web/app/dashboard/gastos-menores/gastos/page.tsx",
  "apps/web/components/gastos-menores-nav.tsx"
];

const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const YEAR = TODAY.slice(0, 4);
const MONTH = TODAY.slice(5, 7);

const result = {
  change_id: CERT_ID,
  certification: "gastos-menores-journal-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  scope: {
    capability: "Registro de gastos de caja menor tipo planilla (journal) estilo libro caja: carga de la pantalla (7 consultas), digitacion inline de lineas con concept_id y IVA por linea (vat_code null = sin IVA), centro de costo por linea, guardas de proveedor/factura exigidos por concepto, historial filtrado por caja y rango de fechas, detalle con lineas, anulacion con reversa contable que restaura el saldo del anticipo, y anticipo de otra caja rechazado.",
    proven_by_live_execution: [
      "GET /petty-cash/vouchers?limit=1000&box_id&date_from&date_to responde 200 con lines_count (filtro de periodo del journal)",
      "GET /petty-cash/boxes?include_inactive=true, /petty-cash/concepts, /accounting/vat-masters?scope=purchases, /accounting/third-parties?type=supplier, /petty-cash/advances?limit=1000 (todos los estados) y /accounting/organization-tree responden 200: las 7 consultas de carga de la pantalla",
      "POST /accounting/organization-tree crea sucursal y centro de costo enlazados a la sociedad (contrato del selector C. costo de la planilla)",
      "POST /petty-cash/concepts crea concepto con default_vat_code COMPRAS-19 y requires_supplier/requires_invoice_reference (contrato de sugerencia de IVA y soportes exigidos)",
      "POST /petty-cash/vouchers con el payload real del journal (concept_id numerico, vat_code null, cost_center_code por linea, branch_code null): contabiliza GM inmediato, aplica el IVA explicito de la linea, ignora vat_amount/total del cliente y respeta cost_center_code",
      "vat_code null con concepto que tiene default_vat_code = gasto SIN IVA (el default es solo sugerencia de la UI, no se aplica automaticamente)",
      "Guardas: SUPPLIER_REQUIRED, INVOICE_REFERENCE_REQUIRED, ADVANCE_BOX_MISMATCH, VAT_MASTER_NOT_FOUND, CONCEPT_NOT_FOUND",
      "GET /petty-cash/vouchers/:id devuelve las lineas del comprobante (contrato del Ver del historial)",
      "Anulacion con reversa contable que restaura saldo/aplicado del anticipo; doble anulacion y anulacion con anticipo liquidado rechazadas",
      "Reporteria excluye anulados por defecto e incluye el anticipo liquidado en el detalle",
      "GET anonimo responde 401"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/petty-cash-masters.test.js (maestros T2)",
      "apps/api/test/petty-cash-vouchers.test.js (anticipos, gastos y contabilizacion T3)",
      "apps/api/test/petty-cash-reports.test.js (reporteria T4)",
      "apps/web/test/gastos-menores-module-registration.test.mjs (registro del modulo)",
      "apps/web/test/gastos-menores-masters.test.mjs (pantallas de maestros)",
      "apps/web/test/gastos-menores-operations.test.mjs (gastos journal: planilla, anticipos y liquidacion)",
      "apps/web/test/gastos-menores-reports.test.mjs (reporteria con exportacion)"
    ]
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

let TOKEN = "";
async function capture(pathname, { method = "GET", body, auth = true } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const res = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: { ...(auth && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    status = res.status;
    payload = await res.json().catch(() => ({}));
  } catch (error) {
    transportError = error.message;
  }
  return { status, payload, transportError, latency_ms: Date.now() - started };
}

async function main() {
  let app = null;
  try {
    const build = require(path.join(API, "server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });

    const health = await capture("/health", { auth: false });
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    const anon = await capture("/api/v1/petty-cash/vouchers", { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    const login = await capture("/api/v1/auth/login", { method: "POST", auth: false, body: { email: EMAIL, password: PASSWORD } });
    check("admin_login", login.status === 200 && Boolean(login.payload?.token), { status: login.status });
    TOKEN = login.payload.token;

    // ---- Contrato de carga de la pantalla journal (las 7 consultas del montaje) ----
    const [vouchersEmpty, boxesList, conceptsList, vatList, suppliersList, advancesAll, orgTree] = await Promise.all([
      capture("/api/v1/petty-cash/vouchers?limit=1000"),
      capture("/api/v1/petty-cash/boxes?include_inactive=true"),
      capture("/api/v1/petty-cash/concepts"),
      capture("/api/v1/accounting/vat-masters?scope=purchases"),
      capture("/api/v1/accounting/third-parties?type=supplier&active=true&limit=500"),
      capture("/api/v1/petty-cash/advances?limit=1000"),
      capture("/api/v1/accounting/organization-tree")
    ]);
    check("journal_page_load_vouchers_boxes_concepts", vouchersEmpty.status === 200 && Array.isArray(vouchersEmpty.payload)
      && boxesList.status === 200 && Array.isArray(boxesList.payload)
      && conceptsList.status === 200 && Array.isArray(conceptsList.payload),
      { vouchers: vouchersEmpty.status, boxes: boxesList.status, concepts: conceptsList.status });
    check("journal_page_load_vats_suppliers_advances_tree", vatList.status === 200 && Array.isArray(vatList.payload)
      && suppliersList.status === 200 && Array.isArray(suppliersList.payload)
      && advancesAll.status === 200 && Array.isArray(advancesAll.payload)
      && orgTree.status === 200 && Array.isArray(orgTree.payload?.societies) && Array.isArray(orgTree.payload?.cost_centers),
      { vats: vatList.status, suppliers: suppliersList.status, advances: advancesAll.status, tree: orgTree.status });
    const vat19 = (vatList.payload || []).find((row) => row.code === "COMPRAS-19" && row.active !== false);
    check("vat_master_compras_19_available_for_lines", Boolean(vat19) && Number(vat19.percent) === 19, { code: vat19?.code, percent: vat19?.percent });

    // ---- Arbol organizacional: sucursal + centro de costo (selector C. costo de la planilla) ----
    const branchCode = `QA-SUC-${RUN_ID}`;
    const ccCode = `QA-CC-${RUN_ID}`;
    const branch = await capture("/api/v1/accounting/organization-tree", { method: "POST", body: { type: "branch", code: branchCode, name: "Sucursal certificacion journal", society_code: "SOC-01" } });
    check("org_branch_created_for_journal_cc", branch.status === 201 && (branch.payload?.branches || []).some((row) => row.code === branchCode), { status: branch.status, code: branchCode });
    const cc = await capture("/api/v1/accounting/organization-tree", { method: "POST", body: { type: "cost_center", code: ccCode, name: "Centro de costo certificacion journal", society_code: "SOC-01", branch_code: branchCode } });
    check("org_cost_center_created_and_listed", cc.status === 201 && (cc.payload?.cost_centers || []).some((row) => row.code === ccCode && row.branch_code === branchCode), { status: cc.status, code: ccCode });

    // ---- Conceptos del journal: sugerencia de IVA y soportes exigidos ----
    const conceptCode1 = `QAJRN-C1-${RUN_ID}`;
    const concept1 = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: conceptCode1, name: "Combustible journal certificacion", account_code: "5195", default_vat_code: "COMPRAS-19", requires_supplier: true, requires_invoice_reference: true, active: true, notes: "Concepto journal con IVA sugerido y soportes exigidos" } });
    check("concept_with_suggested_vat_and_required_supports", concept1.status === 201 && concept1.payload.default_vat_code === "COMPRAS-19" && concept1.payload.requires_supplier === true && concept1.payload.requires_invoice_reference === true, { status: concept1.status, default_vat: concept1.payload.default_vat_code });
    const conceptId1 = concept1.payload.id;

    const conceptCode2 = `QAJRN-C2-${RUN_ID}`;
    const concept2 = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: conceptCode2, name: "Aseo y cafetería journal", account_code: "5195", default_vat_code: null, requires_supplier: false, requires_invoice_reference: false, active: true } });
    check("concept_plain_without_defaults", concept2.status === 201 && concept2.payload.default_vat_code === null && concept2.payload.requires_supplier === false, { status: concept2.status });
    const conceptId2 = concept2.payload.id;

    // ---- Caja menor del journal ----
    const boxCode = `QAJRN-BOX-${RUN_ID}`;
    const box = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: boxCode, name: "Caja journal certificacion", account_code: "1105", advance_account_code: "1330", custodian_party_id: 9, monthly_limit: 2000000, require_advance: false, block_unliquidated_advance: false, active: true } });
    check("box_created_ready_for_journal", box.status === 201 && box.payload.ready_for_advances === true && Array.isArray(box.payload.warnings) && box.payload.warnings.length === 0, { status: box.status, ready: box.payload.ready_for_advances });
    const boxId = box.payload.id;

    const secondBox = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: `${boxCode}-B`, name: "Caja journal otra (para ADVANCE_BOX_MISMATCH)", account_code: "1105", advance_account_code: "1330", custodian_party_id: 9, monthly_limit: 2000000, active: true } });
    check("second_box_created_for_mismatch_guard", secondBox.status === 201, { status: secondBox.status });
    const secondBoxId = secondBox.payload.id;

    // ---- Anticipo APC imputable del journal ----
    const advance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 400000, description: "Anticipo del journal de certificacion" } });
    check("advance_created_for_journal", advance.status === 201 && advance.payload.status === "open" && String(advance.payload.full_number).startsWith("APC-") && advance.payload.balance === 400000 && advance.payload.applied_total === 0 && Boolean(advance.payload.accounting_document_id), { status: advance.status, full_number: advance.payload.full_number, balance: advance.payload.balance });
    const advanceId = advance.payload.id;

    // ---- Comprobante GM con el payload REAL del journal (planilla inline) ----
    // Linea 1: IVA explicito COMPRAS-19 (la UI lo pre-llena desde default_vat_code), centro de
    // costo asignado, proveedor y factura (el concepto los exige). El cliente envia
    // vat_amount/total mal a proposito: el servidor los ignora y recalcula.
    // Linea 2: MISMO concepto (que tiene IVA sugerido) con vat_code null: el default NO se
    // aplica automaticamente, la linea queda SIN IVA.
    // Linea 3: concepto sin default, vat_code null, sin proveedor/factura: imputa al anticipo.
    const voucher = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: {
      box_id: boxId,
      date: TODAY,
      advance_id: advanceId,
      description: "Comprobante del journal de certificacion",
      lines: [
        { concept_id: Number(conceptId1), description: "Combustible ruta norte", base_amount: 100000, vat_code: "COMPRAS-19", vat_amount: 999999, total: 999999, cost_center_code: ccCode, branch_code: null, supplier_party_id: 9, invoice_reference: "FV-JRN-001" },
        { concept_id: Number(conceptId1), description: "Peajes sin IVA (sugerencia quitada)", base_amount: 80000, vat_code: null, cost_center_code: null, branch_code: null, supplier_party_id: 9, invoice_reference: "FV-JRN-002" },
        { concept_id: Number(conceptId2), description: "Aseo oficina", base_amount: 50000, vat_code: null, cost_center_code: null, branch_code: null, supplier_party_id: null, invoice_reference: null }
      ]
    } });
    const vl = voucher.payload.lines || [];
    check("journal_voucher_posted_with_real_payload", voucher.status === 201
      && voucher.payload.status === "posted"
      && voucher.payload.document_type === "GM"
      && String(voucher.payload.full_number).startsWith("GM-")
      && voucher.payload.subtotal === 230000
      && voucher.payload.vat_total === 19000
      && voucher.payload.total === 249000
      && voucher.payload.lines_count === 3
      && voucher.payload.advance_applied_total === 249000
      && voucher.payload.cash_applied_total === 0
      && Boolean(voucher.payload.accounting_document_id)
      // Linea 1: IVA explicito recalculado (vat_amount/total del cliente ignorados) y CC asignado.
      && vl[0].vat_code === "COMPRAS-19" && vl[0].vat_percent === 19 && vl[0].vat_amount === 19000 && vl[0].total === 119000
      && vl[0].cost_center_code === ccCode && vl[0].invoice_reference === "FV-JRN-001" && vl[0].advance_applied === 119000
      // Linea 2: vat_code null con concepto de IVA sugerido = SIN IVA (default no auto-aplicado).
      && vl[1].vat_code === null && vl[1].vat_amount === 0 && vl[1].total === 80000
      // Linea 3: concepto sin default, sin IVA, imputada al anticipo.
      && vl[2].vat_code === null && vl[2].vat_amount === 0 && vl[2].total === 50000 && vl[2].advance_applied === 50000,
      { status: voucher.status, full_number: voucher.payload.full_number, total: voucher.payload.total, line1_cc: vl[0]?.cost_center_code, line1_client_vat_ignored: vl[0]?.vat_amount, line2_vat: vl[1]?.vat_amount });
    const voucherId = voucher.payload.id;

    // ---- Guardas del servidor que sostienen la digitacion journal ----
    const noSupplier = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, lines: [{ concept_id: Number(conceptId1), description: "Sin proveedor", base_amount: 10000, vat_code: null, invoice_reference: "FV-X" }] } });
    check("journal_line_supplier_required_enforced", noSupplier.status === 400 && noSupplier.payload.code === "SUPPLIER_REQUIRED", { status: noSupplier.status, code: noSupplier.payload.code });

    const noInvoice = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, lines: [{ concept_id: Number(conceptId1), description: "Sin factura", base_amount: 10000, vat_code: null, supplier_party_id: 9 }] } });
    check("journal_line_invoice_reference_required_enforced", noInvoice.status === 400 && noInvoice.payload.code === "INVOICE_REFERENCE_REQUIRED", { status: noInvoice.status, code: noInvoice.payload.code });

    const otherBoxAdvance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: secondBoxId, date: TODAY, amount: 100000 } });
    check("second_advance_created_for_box_mismatch", otherBoxAdvance.status === 201, { status: otherBoxAdvance.status });
    const mismatch = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: otherBoxAdvance.payload.id, lines: [{ concept_id: Number(conceptId2), description: "Anticipo de otra caja", base_amount: 10000, vat_code: null }] } });
    check("journal_advance_from_other_box_blocked", mismatch.status === 422 && mismatch.payload.code === "ADVANCE_BOX_MISMATCH", { status: mismatch.status, code: mismatch.payload.code });

    const badVat = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, lines: [{ concept_id: Number(conceptId2), description: "IVA inexistente", base_amount: 10000, vat_code: "COMPRAS-99" }] } });
    check("journal_unknown_vat_code_blocked", badVat.status === 400 && badVat.payload.code === "VAT_MASTER_NOT_FOUND", { status: badVat.status, code: badVat.payload.code });

    const lineNoConcept = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, lines: [{ description: "Linea sin concepto", base_amount: 10000 }] } });
    check("journal_line_without_concept_blocked", lineNoConcept.status === 400 && lineNoConcept.payload.code === "CONCEPT_NOT_FOUND", { status: lineNoConcept.status, code: lineNoConcept.payload.code });

    const advanceAfterVoucher = await capture(`/api/v1/petty-cash/advances/${advanceId}`);
    check("journal_advance_balance_after_voucher", advanceAfterVoucher.status === 200 && advanceAfterVoucher.payload.applied_total === 249000 && advanceAfterVoucher.payload.balance === 151000 && advanceAfterVoucher.payload.status === "open", { applied: advanceAfterVoucher.payload.applied_total, balance: advanceAfterVoucher.payload.balance });

    // ---- Historial del journal: detalle con lineas y filtro de periodo por caja/fechas ----
    const detail = await capture(`/api/v1/petty-cash/vouchers/${voucherId}`);
    check("journal_voucher_detail_returns_lines", detail.status === 200 && Array.isArray(detail.payload.lines) && detail.payload.lines.length === 3 && detail.payload.lines[0].concept_code === conceptCode1 && detail.payload.lines[0].cost_center_code === ccCode, { status: detail.status, lines: detail.payload.lines?.length });

    const listByBoxAndPeriod = await capture(`/api/v1/petty-cash/vouchers?limit=1000&box_id=${boxId}&date_from=${TODAY}&date_to=${TODAY}`);
    const inPeriod = (listByBoxAndPeriod.payload || []).find((row) => row.id === voucherId) || {};
    check("journal_history_filter_by_box_and_period", listByBoxAndPeriod.status === 200 && inPeriod.id === voucherId && inPeriod.lines_count === 3, { status: listByBoxAndPeriod.status, found: Boolean(inPeriod.id), lines_count: inPeriod.lines_count });

    const listFuture = await capture(`/api/v1/petty-cash/vouchers?limit=1000&box_id=${boxId}&date_from=${TOMORROW}`);
    check("journal_history_period_excludes_out_of_range", listFuture.status === 200 && !(listFuture.payload || []).some((row) => row.id === voucherId), { status: listFuture.status, rows: listFuture.payload?.length });

    const listOtherBox = await capture(`/api/v1/petty-cash/vouchers?limit=1000&box_id=${secondBoxId}`);
    check("journal_history_filter_by_other_box_excludes", listOtherBox.status === 200 && !(listOtherBox.payload || []).some((row) => row.id === voucherId), { status: listOtherBox.status, rows: listOtherBox.payload?.length });

    // ---- Listados de anticipos del journal (todos los estados + solo abiertos) ----
    const advancesAllStates = await capture("/api/v1/petty-cash/advances?limit=1000");
    const listedAdvance = (advancesAllStates.payload || []).find((row) => row.id === advanceId) || {};
    check("journal_advances_all_states_listing", advancesAllStates.status === 200 && listedAdvance.id === advanceId && listedAdvance.vouchers_count === 1 && listedAdvance.balance === 151000, { status: advancesAllStates.status, vouchers_count: listedAdvance.vouchers_count, balance: listedAdvance.balance });

    const advancesOpen = await capture("/api/v1/petty-cash/advances?status=open&limit=1000");
    check("journal_advances_open_listing", advancesOpen.status === 200 && (advancesOpen.payload || []).some((row) => row.id === advanceId), { status: advancesOpen.status, rows: advancesOpen.payload?.length });

    // ---- Anulacion desde el historial del journal: reversa + restauracion del saldo ----
    const cancel = await capture(`/api/v1/petty-cash/vouchers/${voucherId}/cancel`, { method: "POST" });
    check("journal_voucher_cancelled_with_reversal", cancel.status === 200 && cancel.payload.status === "cancelled" && Boolean(cancel.payload.reversal_accounting_document_id), { status: cancel.status, reversal: Boolean(cancel.payload.reversal_accounting_document_id) });

    const advanceRestored = await capture(`/api/v1/petty-cash/advances/${advanceId}`);
    check("journal_advance_balance_restored_after_cancel", advanceRestored.status === 200 && advanceRestored.payload.applied_total === 0 && advanceRestored.payload.balance === 400000 && advanceRestored.payload.status === "open", { applied: advanceRestored.payload.applied_total, balance: advanceRestored.payload.balance });

    const reCancel = await capture(`/api/v1/petty-cash/vouchers/${voucherId}/cancel`, { method: "POST" });
    check("journal_double_cancel_blocked", reCancel.status === 409 && reCancel.payload.code === "VOUCHER_ALREADY_CANCELLED", { status: reCancel.status, code: reCancel.payload.code });

    const summaryCancelled = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    check("journal_report_excludes_cancelled_by_default", summaryCancelled.status === 200 && summaryCancelled.payload.totals?.total === 0 && summaryCancelled.payload.rows?.length === 0, { total: summaryCancelled.payload.totals?.total, rows: summaryCancelled.payload.rows?.length });

    // ---- Anticipo liquidado: la anulacion queda bloqueada (guard del historial) ----
    const voucher2 = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, description: "Comprobante post-anulacion journal", lines: [{ concept_id: Number(conceptId2), description: "Aseo final sin IVA", base_amount: 50000, vat_code: null }] } });
    check("journal_second_voucher_applies_remaining_advance", voucher2.status === 201 && voucher2.payload.total === 50000 && voucher2.payload.advance_applied_total === 50000, { status: voucher2.status, total: voucher2.payload.total });
    const voucher2Id = voucher2.payload.id;

    // Sin body: el reintegro por defecto es el saldo pendiente (350000).
    const liquidate = await capture(`/api/v1/petty-cash/advances/${advanceId}/liquidate`, { method: "POST" });
    check("journal_advance_liquidated_bodyless_default_refund", liquidate.status === 200 && liquidate.payload.status === "liquidated" && liquidate.payload.refund_amount === 350000 && liquidate.payload.shortfall_amount === 0, { status: liquidate.status, refund: liquidate.payload.refund_amount });

    const cancelLiquidated = await capture(`/api/v1/petty-cash/vouchers/${voucher2Id}/cancel`, { method: "POST" });
    check("journal_cancel_with_liquidated_advance_blocked", cancelLiquidated.status === 409 && cancelLiquidated.payload.code === "VOUCHER_ADVANCE_LIQUIDATED", { status: cancelLiquidated.status, code: cancelLiquidated.payload.code });

    const finalDetail = await capture(`/api/v1/petty-cash/reports/detail?box_id=${boxId}`);
    check("journal_final_report_reflects_live_state", finalDetail.status === 200 && finalDetail.payload.pagination?.total === 1 && finalDetail.payload.rows?.[0]?.advance_status === "liquidated" && finalDetail.payload.totals?.total === 50000, { total: finalDetail.payload.pagination?.total, advance_status: finalDetail.payload.rows?.[0]?.advance_status });

    // ---- Suites unitarias versionadas ----
    const apiSuites = ["petty-cash-masters.test.js", "petty-cash-vouchers.test.js", "petty-cash-reports.test.js"];
    for (const suite of apiSuites) {
      const run = spawnSync(process.execPath, ["--test", `test/${suite}`], { cwd: API, encoding: "utf8" });
      const out = `${run.stdout || ""}${run.stderr || ""}`;
      check(`unit_suite_${suite.replace(/\.test\.js$/, "")}_pass`, run.status === 0 && /# fail 0\b/.test(out), { status: run.status, pass: (out.match(/# pass (\d+)/) || [])[1], fail: (out.match(/# fail (\d+)/) || [])[1] });
    }
    const webSuites = ["gastos-menores-module-registration.test.mjs", "gastos-menores-masters.test.mjs", "gastos-menores-operations.test.mjs", "gastos-menores-reports.test.mjs"];
    for (const suite of webSuites) {
      const run = spawnSync(process.execPath, ["--test", `test/${suite}`], { cwd: WEB, encoding: "utf8" });
      const out = `${run.stdout || ""}${run.stderr || ""}`;
      check(`unit_suite_${suite.replace(/\.test\.mjs$/, "")}_pass`, run.status === 0 && /# fail 0\b/.test(out), { status: run.status, pass: (out.match(/# pass (\d+)/) || [])[1], fail: (out.match(/# fail (\d+)/) || [])[1] });
    }

    // ---- Aserciones a nivel de codigo (estructura versionada del journal) ----
    const gastosSrc = fs.readFileSync(GASTOS_PAGE_SRC, "utf8");
    // La creacion es una planilla inline: el encabezado "Nuevo comprobante" aparece ANTES del
    // primer ModalFrame (que solo sirve el detalle/historial), nunca dentro de un modal.
    const firstModal = gastosSrc.indexOf("<ModalFrame");
    const registerHeading = gastosSrc.indexOf("Nuevo comprobante");
    check("journal_page_inline_register_not_modal", registerHeading > 0 && (firstModal === -1 || registerHeading < firstModal)
      && /draftLines/.test(gastosSrc)
      && /focusNextCell/.test(gastosSrc)
      && /next\.length < 100/.test(gastosSrc)
      && /Contabilizar \$\{filledLines/.test(gastosSrc),
      { register_heading: registerHeading, first_modal: firstModal });
    check("journal_page_payload_contract", /concept_id: Number\(line\.concept_id\)/.test(gastosSrc)
      && /vat_code: line\.vat_code \|\| null/.test(gastosSrc)
      && /cost_center_code: line\.cost_center_code \|\| null/.test(gastosSrc)
      && /branch_code: null/.test(gastosSrc)
      && /supplier_party_id: line\.supplier_party_id \? Number\(line\.supplier_party_id\) : null/.test(gastosSrc)
      && /invoice_reference: line\.invoice_reference\.trim\(\) \|\| null/.test(gastosSrc),
      {});
    check("journal_page_period_and_advance_contract", /params\.set\("date_from", dateFrom\)/.test(gastosSrc)
      && /params\.set\("date_to", dateTo\)/.test(gastosSrc)
      && /advances\.filter\(\(row\) => row\.status === "open" && Number\(row\.balance\) > 0 && String\(row\.box_id\) === effectiveBoxId\)/.test(gastosSrc)
      && /setDraft\(\(current\) => \(\{ \.\.\.current, advance_id: "" \}\)\)/.test(gastosSrc),
      {});
    check("journal_page_advance_guidance_and_empty_state", /El anticipo es el fondo girado al custodio/.test(gastosSrc)
      && /Esta caja exige anticipo pero no hay anticipos abiertos con saldo/.test(gastosSrc)
      && /href="\/dashboard\/gastos-menores\/anticipos"/.test(gastosSrc)
      && /Sin anticipos abiertos con saldo/.test(gastosSrc)
      && /Saldo anticipos vigentes/.test(gastosSrc)
      && /boxAdvances\.length === 0/.test(gastosSrc),
      {});
    const globalsSrc = fs.readFileSync(path.join(WEB, "app/globals.css"), "utf8");
    check("select_popup_color_scheme_follows_theme", /select\s*\{\s*color-scheme:\s*light;/.test(globalsSrc)
      && /html\.dark\s+select\s*\{\s*color-scheme:\s*dark;/.test(globalsSrc),
      {});

    const schemaSrc = fs.readFileSync(SCHEMA_SRC, "utf8");
    check("schema_has_petty_cash_models", ["PettyCashConcept", "PettyCashBox", "PettyCashAdvance", "PettyCashVoucher", "PettyCashVoucherLine"].every((m) => schemaSrc.includes(`model ${m} `)), {});
    const routesSrc = fs.readFileSync(ROUTES_SRC, "utf8");
    const routeCount = (routesSrc.match(/fastify\.(?:get|post|put|delete|patch)\(/g) || []).length;
    const guardCount = (routesSrc.match(/preHandler:/g) || []).length;
    check("routes_guarded_by_accounting_rbac", routeCount === guardCount && guardCount > 0
      && /requirePermission\("accounting", "read"\)/.test(routesSrc)
      && /requirePermission\("accounting", "write"\)/.test(routesSrc)
      && /requirePermission\("accounting", "approve"\)/.test(routesSrc)
      && /fastify\.authenticate/.test(routesSrc)
      && /tenancy/.test(routesSrc), { routes: routeCount, guards: guardCount });
    const serviceSrc = fs.readFileSync(SERVICE_SRC, "utf8");
    check("service_tenant_isolation_and_journal_line_resolution", /runWithTenant/.test(serviceSrc) && /pg_advisory_xact_lock/.test(serviceSrc) && /reserveAccountingDocumentNumber/.test(serviceSrc) && /concept_id/.test(serviceSrc), {});
    const missingPages = WEB_PAGES.filter((page) => !fs.existsSync(path.join(ROOT, page)));
    check("web_pages_present", missingPages.length === 0, { missing: missingPages });

    result.status = "passed";
    result.checks_passed = result.checks.filter((c) => c.ok).length;
    result.checks_total = result.checks.length;
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
    console.error("[cert] ERROR:", error.message);
  } finally {
    if (app) { try { await app.close(); } catch { /* noop */ } }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
    console.error(`[cert] evidencia: ${path.relative(ROOT, OUTPUT)} status=${result.status} (${result.checks.filter((c) => c.ok).length}/${result.checks.length})`);
    process.exit(result.status === "passed" ? 0 : 1);
  }
}

main();
