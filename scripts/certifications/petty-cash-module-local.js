// Certificacion LOCAL (en vivo) del modulo Gastos Menores / Cajas Menores.
//
// Alcance certificado (spec "Gastos Menores", 5 requerimientos del usuario):
//   1. Maestro de conceptos de egreso con cuenta PUC de gasto asociada.
//   2. Maestro de cajas menores (custodio, cuentas 11xx/13xx, tope mensual, politicas de anticipo)
//      y ciclo anticipo -> gasto -> liquidacion con reintegro/faltante.
//   3. Digitacion amigable del gasto: descripcion, centro de costo, valor base, IVA por linea
//      (flag alineado al maestro de compras), referencia de factura y proveedor.
//   4. Reporteria por caja y concepto (resumen agrupable, detalle paginado y ranking de cajas
//      con % del tope mensual), con anulados excluidos por defecto.
//   5. Integracion contable: asiento y numeracion canonica por documento APC/GM/LCM con
//      reversa en la anulacion.
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
const PORT = Number(args.port || 3212);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 25000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/petty-cash-module-20261010/local-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const EMAIL = process.env.LOCAL_TMS_EMAIL || "demo@apex.local";
const PASSWORD = process.env.LOCAL_TMS_PASSWORD || "test1234";
const CERT_ID = "petty-cash-module-20261010";

const SERVICE_SRC = path.join(API, "src/modules/petty-cash/service.js");
const ROUTES_SRC = path.join(API, "src/modules/petty-cash/routes.js");
const SCHEMA_SRC = path.join(API, "prisma/schema.prisma");
const WEB_PAGES = [
  "apps/web/app/dashboard/gastos-menores/page.tsx",
  "apps/web/app/dashboard/gastos-menores/conceptos/page.tsx",
  "apps/web/app/dashboard/gastos-menores/cajas/page.tsx",
  "apps/web/app/dashboard/gastos-menores/gastos/page.tsx",
  "apps/web/app/dashboard/gastos-menores/anticipos/page.tsx",
  "apps/web/app/dashboard/gastos-menores/reportes/page.tsx",
  "apps/web/components/gastos-menores-nav.tsx"
];

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = TODAY.slice(0, 4);
const MONTH = TODAY.slice(5, 7);

const result = {
  change_id: CERT_ID,
  certification: "petty-cash-module-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  scope: {
    capability: "Gastos Menores / Cajas Menores: maestros de conceptos de egreso y cajas menores con custodio y cuentas PUC 11xx/13xx, ciclo anticipo (APC) -> comprobante de gasto con IVA por linea y contabilizacion inmediata (GM) -> liquidacion con reintegro/faltante (LCM), anulacion con reversa contable y reporteria por caja/concepto (resumen agrupable, detalle paginado, ranking con % del tope mensual).",
    proven_by_live_execution: [
      "POST /petty-cash/concepts crea concepto con cuenta de gasto 5195 (concepto_duplicado y cuenta no-gasto rechazados)",
      "PUT /petty-cash/concepts/:id actualiza heredando las claves opcionales ausentes",
      "POST /petty-cash/boxes crea caja lista para anticipos (cuenta 11xx caja, 13xx anticipo, custodio, tope mensual); cuenta 13xx como caja rechazada",
      "PUT /petty-cash/boxes/:id reconfigura la politica de anticipos (require_advance + block_unliquidated_advance)",
      "POST /petty-cash/advances gira anticipo APC contabilizado contra el mayor (debito 1330 / credito 1105); tope mensual, valor 0 y nuevo anticipo con uno abierto sin liquidar (ADVANCE_ALREADY_OPEN) rechazados",
      "POST /petty-cash/vouchers exige anticipo cuando la caja lo configura (ADVANCE_REQUIRED) y contabiliza GM inmediato: IVA por linea recalculado del maestro (los importes del cliente se ignoran), imputacion linea a linea al anticipo",
      "POST /petty-cash/advances/:id/liquidate SIN cuerpo liquida con reintegro por defecto = saldo (LCM)",
      "POST /petty-cash/vouchers/:id/cancel anula con reversa contable y restaura el saldo del anticipo; doble anulacion y anulacion con anticipo liquidado rechazadas",
      "GET /petty-cash/reports/summary agrupa por concepto con totales vouchers_count/lines_count/*_total",
      "GET /petty-cash/reports/detail pagina lineas con pagination.total y expone advance_full_number/advance_status",
      "GET /petty-cash/reports/boxes-ranking rankea cajas con % del tope mensual en mes unico",
      "Reportes excluyen anulados por defecto e incluyen el filtro include_cancelled",
      "GET anonimo responde 401"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/petty-cash-masters.test.js (maestros T2)",
      "apps/api/test/petty-cash-vouchers.test.js (anticipos, gastos y contabilizacion T3)",
      "apps/api/test/petty-cash-reports.test.js (reporteria T4)",
      "apps/web/test/gastos-menores-module-registration.test.mjs (registro del modulo)",
      "apps/web/test/gastos-menores-masters.test.mjs (pantallas de maestros)",
      "apps/web/test/gastos-menores-operations.test.mjs (gastos, anticipos y liquidacion)",
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

    const anon = await capture("/api/v1/petty-cash/boxes", { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    const login = await capture("/api/v1/auth/login", { method: "POST", auth: false, body: { email: EMAIL, password: PASSWORD } });
    check("admin_login", login.status === 200 && Boolean(login.payload?.token), { status: login.status });
    TOKEN = login.payload.token;

    // ---- Maestro de conceptos de egreso (requerimiento 1) ----
    const conceptCode = `QAGM-CON-${RUN_ID}`;
    const concept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: conceptCode, name: "Peajes y gastos de certificacion", account_code: "5195", requires_supplier: false, requires_invoice_reference: false, active: true, notes: "Concepto de certificacion local" } });
    check("concept_created_with_expense_account", concept.status === 201 && concept.payload.account_code === "5195" && concept.payload.active === true && concept.payload.default_vat_code === null, { status: concept.status, account_code: concept.payload.account_code });
    const conceptId = concept.payload.id;

    const dupConcept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: conceptCode, name: "Duplicado", account_code: "5195" } });
    check("concept_duplicate_code_blocked", dupConcept.status === 409 && dupConcept.payload.code === "CONCEPT_CODE_TAKEN", { status: dupConcept.status, code: dupConcept.payload.code });

    const badAccountConcept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: `QAGM-BAD-${RUN_ID}`, name: "Cuenta no gasto", account_code: "1105" } });
    check("concept_non_expense_account_blocked", badAccountConcept.status === 400 && badAccountConcept.payload.code === "CONCEPT_ACCOUNT_INVALID", { status: badAccountConcept.status, code: badAccountConcept.payload.code });

    // El esquema de update exige code/name/account_code; las claves OPCIONALES ausentes
    // (notes, flags) se heredan del vigente: PUT parcial seguro a nivel de servicio.
    const updatedConcept = await capture(`/api/v1/petty-cash/concepts/${conceptId}`, { method: "PUT", body: { code: conceptCode, name: "Peajes y gastos v2", account_code: "5195" } });
    check("concept_update_inherits_optional_keys", updatedConcept.status === 200 && updatedConcept.payload.name === "Peajes y gastos v2" && updatedConcept.payload.notes === "Concepto de certificacion local" && updatedConcept.payload.requires_invoice_reference === false, { status: updatedConcept.status, name: updatedConcept.payload.name, notes: updatedConcept.payload.notes });

    const deactivated = await capture(`/api/v1/petty-cash/concepts/${conceptId}/deactivate`, { method: "POST" });
    const reactivated = await capture(`/api/v1/petty-cash/concepts/${conceptId}/activate`, { method: "POST" });
    check("concept_deactivate_activate_cycle", deactivated.status === 200 && deactivated.payload.active === false && reactivated.status === 200 && reactivated.payload.active === true, { deactivated: deactivated.status, reactivated: reactivated.status });

    // ---- Maestro de cajas menores (requerimiento 2) ----
    const boxCode = `QAGM-BOX-${RUN_ID}`;
    const box = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: boxCode, name: "Caja certificacion local", account_code: "1105", advance_account_code: "1330", custodian_party_id: 9, monthly_limit: 1000000, require_advance: false, block_unliquidated_advance: false, active: true, notes: "Caja de certificacion" } });
    check("box_created_ready_for_advances", box.status === 201 && box.payload.ready_for_advances === true && Array.isArray(box.payload.warnings) && box.payload.warnings.length === 0 && box.payload.monthly_limit === 1000000, { status: box.status, ready: box.payload.ready_for_advances, warnings: box.payload.warnings?.length });
    const boxId = box.payload.id;

    const badBox = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: `QAGM-BOX2-${RUN_ID}`, name: "Caja mal clasificada", account_code: "1305", advance_account_code: "1330" } });
    check("box_non_cash_asset_blocked", badBox.status === 400 && badBox.payload.code === "BOX_ACCOUNT_INVALID", { status: badBox.status, code: badBox.payload.code });

    // ---- Anticipo APC contabilizado (requerimiento 2 y 5) ----
    const advance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 500000, description: "Anticipo de certificacion" } });
    check("advance_created_and_accounted", advance.status === 201 && advance.payload.status === "open" && advance.payload.document_type === "APC" && String(advance.payload.full_number).startsWith("APC-") && advance.payload.amount === 500000 && advance.payload.balance === 500000 && advance.payload.applied_total === 0 && Boolean(advance.payload.accounting_document_id), { status: advance.status, full_number: advance.payload.full_number, balance: advance.payload.balance });
    const advanceId = advance.payload.id;

    const zeroAdvance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 0 } });
    check("advance_zero_amount_blocked", zeroAdvance.status === 400 && zeroAdvance.payload.code === "ADVANCE_AMOUNT_INVALID", { status: zeroAdvance.status, code: zeroAdvance.payload.code });

    // Con block_unliquidated_advance aun en false el tope mensual es la unica barrera:
    // 500000 girados + 600000 pedidos superan el limite de 1000000.
    const overLimit = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 600000 } });
    check("advance_over_monthly_limit_blocked", overLimit.status === 422 && overLimit.payload.code === "ADVANCE_EXCEEDS_MONTHLY_LIMIT", { status: overLimit.status, code: overLimit.payload.code });

    // El esquema de update exige code/name/account_code/advance_account_code; las claves OPCIONALES
    // ausentes (custodio, limite) se heredan del vigente mientras la politica de anticipos se reconfigura.
    const policy = await capture(`/api/v1/petty-cash/boxes/${boxId}`, { method: "PUT", body: { code: boxCode, name: "Caja certificacion local", account_code: "1105", advance_account_code: "1330", require_advance: true, block_unliquidated_advance: true } });
    check("box_advance_policy_configurable", policy.status === 200 && policy.payload.require_advance === true && policy.payload.block_unliquidated_advance === true && policy.payload.custodian_party_id === 9 && policy.payload.monthly_limit === 1000000, { status: policy.status, require_advance: policy.payload.require_advance, block: policy.payload.block_unliquidated_advance, custodian: policy.payload.custodian_party_id, monthly_limit: policy.payload.monthly_limit });

    // Parametro configurable pedido por el usuario: con un anticipo abierto no se gira otro hasta
    // liquidarlo. Los 400000 no rozan el tope mensual (900000 < 1000000): solo responde el candado.
    const secondAdvance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 400000 } });
    check("advance_blocked_while_previous_open", secondAdvance.status === 409 && secondAdvance.payload.code === "ADVANCE_ALREADY_OPEN", { status: secondAdvance.status, code: secondAdvance.payload.code });

    // ---- Comprobante de gasto GM con contabilizacion inmediata (requerimientos 3 y 5) ----
    const noAdvanceVoucher = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, lines: [{ concept_code: conceptCode, description: "Gasto sin anticipo", base_amount: 50000 }] } });
    check("voucher_requires_advance_when_configured", noAdvanceVoucher.status === 422 && noAdvanceVoucher.payload.code === "ADVANCE_REQUIRED", { status: noAdvanceVoucher.status, code: noAdvanceVoucher.payload.code });

    // vat_amount/total del cliente se envian mal a proposito: el servidor debe recalcularlos.
    const voucher = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: {
      box_id: boxId,
      date: TODAY,
      advance_id: advanceId,
      description: "Comprobante de certificacion",
      lines: [
        { concept_code: conceptCode, description: "Peajes de la semana sin IVA", base_amount: 100000, vat_code: null, supplier_party_id: 9, invoice_reference: "FV-CERT-001" },
        { concept_code: conceptCode, description: "Materiales con IVA 19", base_amount: 100000, vat_code: "COMPRAS-19", vat_amount: 999999, total: 999999, supplier_party_id: 9 }
      ]
    } });
    const v1 = voucher.payload.lines || [];
    check("voucher_created_and_accounted_with_line_vat", voucher.status === 201
      && voucher.payload.status === "posted"
      && voucher.payload.document_type === "GM"
      && String(voucher.payload.full_number).startsWith("GM-")
      && voucher.payload.subtotal === 200000
      && voucher.payload.vat_total === 19000
      && voucher.payload.total === 219000
      && Boolean(voucher.payload.accounting_document_id)
      && voucher.payload.lines_count === 2
      && voucher.payload.advance_applied_total === 219000
      && voucher.payload.cash_applied_total === 0
      && v1[0].vat_amount === 0 && v1[0].total === 100000 && v1[0].vat_code === null && v1[0].invoice_reference === "FV-CERT-001"
      && v1[1].vat_percent === 19 && v1[1].vat_amount === 19000 && v1[1].total === 119000
      && v1[1].advance_applied === 119000 && v1[1].cash_applied === 0,
      { status: voucher.status, full_number: voucher.payload.full_number, total: voucher.payload.total, client_vat_ignored: v1[1]?.vat_amount });
    const voucherId = voucher.payload.id;

    const lineNoConcept = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, lines: [{ description: "Linea sin concepto", base_amount: 10000 }] } });
    check("voucher_line_without_concept_blocked", lineNoConcept.status === 400 && lineNoConcept.payload.code === "CONCEPT_NOT_FOUND", { status: lineNoConcept.status, code: lineNoConcept.payload.code });

    const badVat = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, lines: [{ concept_code: conceptCode, description: "IVA inexistente", base_amount: 10000, vat_code: "COMPRAS-99" }] } });
    check("voucher_unknown_vat_code_blocked", badVat.status === 400 && badVat.payload.code === "VAT_MASTER_NOT_FOUND", { status: badVat.status, code: badVat.payload.code });

    const advanceAfterVoucher = await capture(`/api/v1/petty-cash/advances/${advanceId}`);
    check("advance_balance_after_voucher", advanceAfterVoucher.status === 200 && advanceAfterVoucher.payload.applied_total === 219000 && advanceAfterVoucher.payload.balance === 281000 && advanceAfterVoucher.payload.status === "open", { applied: advanceAfterVoucher.payload.applied_total, balance: advanceAfterVoucher.payload.balance });

    // ---- Reporteria con el comprobante vigente (requerimiento 4) ----
    const summary = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    const sRow = summary.payload.rows?.[0] || {};
    check("report_summary_groups_by_concept", summary.status === 200
      && summary.payload.group_by === "concept"
      && summary.payload.rows?.length === 1
      && sRow.concept_code === conceptCode
      && sRow.vouchers_count === 1 && sRow.lines_count === 2
      && sRow.base_total === 200000 && sRow.vat_total === 19000 && sRow.total === 219000
      && sRow.advance_applied_total === 219000 && sRow.cash_applied_total === 0
      && summary.payload.totals?.total === 219000
      && summary.payload.filters?.box_id === boxId
      && summary.payload.filters?.include_cancelled === false,
      { status: summary.status, rows: summary.payload.rows?.length, total: summary.payload.totals?.total });

    const detail = await capture(`/api/v1/petty-cash/reports/detail?box_id=${boxId}`);
    const dRows = detail.payload.rows || [];
    const ivaRow = dRows.find((row) => row.vat_percent === 19) || {};
    check("report_detail_paginates_lines", detail.status === 200
      && detail.payload.pagination?.total === 2
      && detail.payload.pagination?.returned === 2
      && detail.payload.pagination?.limit === 200
      && dRows.length === 2
      && String(ivaRow.full_number).startsWith("GM-")
      && String(ivaRow.advance_full_number).startsWith("APC-")
      && ivaRow.advance_status === "open"
      && ivaRow.vat_amount === 19000 && ivaRow.total === 119000
      && ivaRow.advance_applied === 119000 && ivaRow.cash_applied === 0
      && ivaRow.supplier_party_id === 9
      && detail.payload.totals?.total === 219000,
      { status: detail.status, total: detail.payload.pagination?.total, advance_status: ivaRow.advance_status });

    const ranking = await capture(`/api/v1/petty-cash/reports/boxes-ranking?year=${YEAR}&month=${MONTH}&box_id=${boxId}`);
    const rRow = ranking.payload.rows?.[0] || {};
    check("report_boxes_ranking_with_monthly_limit_pct", ranking.status === 200
      && ranking.payload.single_month === `${YEAR}-${MONTH}`
      && rRow.box?.code === boxCode
      && rRow.total === 219000
      && rRow.limit_pct === 21.9
      && rRow.concepts?.[0]?.concept_code === conceptCode
      && rRow.concepts?.[0]?.total === 219000,
      { status: ranking.status, single_month: ranking.payload.single_month, limit_pct: rRow.limit_pct });

    const monthNoYear = await capture("/api/v1/petty-cash/reports/summary?month=10");
    check("report_month_without_year_blocked", monthNoYear.status === 400 && monthNoYear.payload.code === "REPORT_FILTER_INVALID", { status: monthNoYear.status, code: monthNoYear.payload.code });

    // ---- Anulacion con reversa contable y restauracion del anticipo ----
    const cancel = await capture(`/api/v1/petty-cash/vouchers/${voucherId}/cancel`, { method: "POST" });
    check("voucher_cancelled_with_accounting_reversal", cancel.status === 200 && cancel.payload.status === "cancelled" && Boolean(cancel.payload.reversal_accounting_document_id), { status: cancel.status, reversal: Boolean(cancel.payload.reversal_accounting_document_id) });

    const advanceRestored = await capture(`/api/v1/petty-cash/advances/${advanceId}`);
    check("advance_balance_restored_after_cancel", advanceRestored.status === 200 && advanceRestored.payload.applied_total === 0 && advanceRestored.payload.balance === 500000 && advanceRestored.payload.status === "open", { applied: advanceRestored.payload.applied_total, balance: advanceRestored.payload.balance });

    const reCancel = await capture(`/api/v1/petty-cash/vouchers/${voucherId}/cancel`, { method: "POST" });
    check("voucher_double_cancel_blocked", reCancel.status === 409 && reCancel.payload.code === "VOUCHER_ALREADY_CANCELLED", { status: reCancel.status, code: reCancel.payload.code });

    const summaryCancelled = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    check("report_excludes_cancelled_by_default", summaryCancelled.status === 200 && summaryCancelled.payload.totals?.total === 0 && summaryCancelled.payload.rows?.length === 0, { total: summaryCancelled.payload.totals?.total, rows: summaryCancelled.payload.rows?.length });

    const summaryIncludeCancelled = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}&include_cancelled=true`);
    check("report_include_cancelled_flag", summaryIncludeCancelled.status === 200 && summaryIncludeCancelled.payload.totals?.total === 219000 && summaryIncludeCancelled.payload.filters?.include_cancelled === true, { total: summaryIncludeCancelled.payload.totals?.total, include_cancelled: summaryIncludeCancelled.payload.filters?.include_cancelled });

    // ---- Liquidacion LCM con reintegro por defecto (llamada sin cuerpo) ----
    const voucher2 = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, description: "Comprobante post-anulacion", lines: [{ concept_code: conceptCode, description: "Aseo de oficina sin IVA", base_amount: 100000, vat_code: null }] } });
    check("second_voucher_applies_remaining_advance", voucher2.status === 201 && voucher2.payload.total === 100000 && voucher2.payload.advance_applied_total === 100000, { status: voucher2.status, total: voucher2.payload.total, applied: voucher2.payload.advance_applied_total });
    const voucher2Id = voucher2.payload.id;

    // Sin body: el reintegro por defecto es el saldo pendiente (400000).
    const liquidate = await capture(`/api/v1/petty-cash/advances/${advanceId}/liquidate`, { method: "POST" });
    check("advance_liquidated_bodyless_default_refund", liquidate.status === 200
      && liquidate.payload.status === "liquidated"
      && liquidate.payload.refund_amount === 400000
      && liquidate.payload.shortfall_amount === 0
      && Boolean(liquidate.payload.liquidated_at),
      { status: liquidate.status, refund: liquidate.payload.refund_amount, shortfall: liquidate.payload.shortfall_amount });

    const reLiquidate = await capture(`/api/v1/petty-cash/advances/${advanceId}/liquidate`, { method: "POST", body: {} });
    check("advance_reliquidation_blocked", reLiquidate.status === 409 && reLiquidate.payload.code === "ADVANCE_NOT_OPEN", { status: reLiquidate.status, code: reLiquidate.payload.code });

    const cancelLiquidated = await capture(`/api/v1/petty-cash/vouchers/${voucher2Id}/cancel`, { method: "POST" });
    check("cancel_voucher_with_liquidated_advance_blocked", cancelLiquidated.status === 409 && cancelLiquidated.payload.code === "VOUCHER_ADVANCE_LIQUIDATED", { status: cancelLiquidated.status, code: cancelLiquidated.payload.code });

    // ---- Reporteria final: solo el comprobante vigente, anticipo liquidado visible en detalle ----
    const finalSummary = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    const finalDetail = await capture(`/api/v1/petty-cash/reports/detail?box_id=${boxId}`);
    const finalRanking = await capture(`/api/v1/petty-cash/reports/boxes-ranking?year=${YEAR}&month=${MONTH}&box_id=${boxId}`);
    const fr = finalRanking.payload.rows?.[0] || {};
    check("final_report_reflects_live_state", finalSummary.status === 200
      && finalSummary.payload.totals?.vouchers_count === 1
      && finalSummary.payload.totals?.total === 100000
      && finalDetail.payload.pagination?.total === 1
      && finalDetail.payload.rows?.[0]?.advance_status === "liquidated"
      && fr.total === 100000
      && fr.limit_pct === 10,
      { summary_total: finalSummary.payload.totals?.total, detail_total: finalDetail.payload.pagination?.total, advance_status: finalDetail.payload.rows?.[0]?.advance_status, ranking_limit_pct: fr.limit_pct });

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

    // ---- Aserciones a nivel de codigo (estructura versionada) ----
    const schemaSrc = fs.readFileSync(SCHEMA_SRC, "utf8");
    check("schema_has_petty_cash_models", ["PettyCashConcept", "PettyCashBox", "PettyCashAdvance", "PettyCashVoucher", "PettyCashVoucherLine"].every((m) => schemaSrc.includes(`model ${m} `)), {});
    const routesSrc = fs.readFileSync(ROUTES_SRC, "utf8");
    // Los guards se construyen una vez (read/write/approve sobre el modulo accounting) y se
    // reutilizan: la senal real de RBAC es que CADA registro de ruta declare preHandler.
    const routeCount = (routesSrc.match(/fastify\.(?:get|post|put|delete|patch)\(/g) || []).length;
    const guardCount = (routesSrc.match(/preHandler:/g) || []).length;
    check("routes_guarded_by_accounting_rbac", routeCount === guardCount && guardCount > 0
      && /requirePermission\("accounting", "read"\)/.test(routesSrc)
      && /requirePermission\("accounting", "write"\)/.test(routesSrc)
      && /requirePermission\("accounting", "approve"\)/.test(routesSrc)
      && /fastify\.authenticate/.test(routesSrc)
      && /tenancy/.test(routesSrc), { routes: routeCount, guards: guardCount });
    const serviceSrc = fs.readFileSync(SERVICE_SRC, "utf8");
    check("service_tenant_isolation_and_locks", /runWithTenant/.test(serviceSrc) && /pg_advisory_xact_lock/.test(serviceSrc) && /reserveAccountingDocumentNumber/.test(serviceSrc), {});
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
