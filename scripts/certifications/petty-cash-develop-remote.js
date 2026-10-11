// Certificacion REMOTA del modulo Gastos Menores / Cajas Menores en el ambiente DEVELOP (QA).
//
// Complementa la certificacion LOCAL (scripts/certifications/petty-cash-module-local.js): aqui se
// ejerce el MISMO flujo de extremo a extremo contra la API desplegada en Railway (rama develop) y
// la base real de Supabase QA, probando de paso tres conexiones que la prueba local no cubre:
//   1. API desplegada <-> base Supabase QA (persistencia real de maestros, anticipos y documentos).
//   2. Gastos Menores <-> Contabilidad (asiento y numeracion APC/GM/LCM + reversa en la anulacion).
//   3. Autenticacion Supabase real (auth admin + company_users) resuelta por el middleware del API.
//
// No toca produccion: aborta si la URL de API no es el host HTTPS de QA en Railway. Aprovisiona su
// propio administrador desechable en Supabase (auth user + membresia owner) y lo elimina al final.
// Sale con codigo distinto de cero ante cualquier fallo y escribe evidencia versionada.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");
function loadBcrypt() {
  try { return require("bcrypt"); } catch { return require(path.join(ROOT, "apps/api/node_modules/bcrypt")); }
}
const bcrypt = loadBcrypt();

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
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const API_URL = String(args["api-url"] || process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
if (!/^https:\/\/apexos-api-qa-production\.up\.railway\.app$/.test(API_URL)) {
  console.error("BLOQUEADO: la certificacion remota solo corre contra la API de QA en Railway (HTTPS).");
  process.exit(1);
}
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("BLOQUEADO: se requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (config/qa.env) para aprovisionar el administrador de certificacion.");
  process.exit(1);
}

const EXPECTED_COMMIT = String(args["expected-commit"] || "37d5d5ffaf3cbacb34956b694133040856fe8e85");
const COMPANY_ID = String(args["company-id"] || "c56bc5df-c807-4deb-83f8-fbb4751be613"); // Cliente Piloto QA
const CUSTODIAN_PARTY_ID = Number(args["custodian-party-id"] || 7); // Proveedor CERT-QA (supplier)
const CAB = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json"
};
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 30000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/petty-cash-module-20261010/develop-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const CERT_ID = "petty-cash-module-20261010";
const ADMIN_EMAIL = `qa.pettycash.${RUN_ID}@apexos.qa`;
const ADMIN_PASSWORD = `Qa-Petty-${crypto.randomBytes(6).toString("hex")}#26`;

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = TODAY.slice(0, 4);
const MONTH = TODAY.slice(5, 7);

const result = {
  change_id: CERT_ID,
  certification: "petty-cash-module-develop-remote",
  environment: "QA",
  target_environment: "develop",
  api_url: API_URL,
  supabase_url: SUPABASE_URL,
  api_commit: "unknown",
  expected_commit: EXPECTED_COMMIT.slice(0, 12),
  generated_at: new Date().toISOString(),
  tenant: { company_id: COMPANY_ID, name: "Cliente Piloto QA", custodian_party_id: CUSTODIAN_PARTY_ID },
  provisioned_admin: { email: ADMIN_EMAIL, user_table: "User(role_id=1)", deactivated: null },
  scope: {
    capability: "Gastos Menores end-to-end en develop: API desplegada (Railway) contra base real de Supabase QA, con integracion contable (APC/GM/LCM + reversa) y autenticacion Supabase real.",
    proven_by_live_execution: [
      "Sesion real: administrador desechable creado en la base QA (rol APEX_ADMIN del tenant) y autenticado por /api/v1/auth/login; /petty-cash/boxes anonimo responde 401",
      "Maestros: conceptos de egreso con cuenta PUC de gasto y cajas menores con custodio/11xx/13xx persistidos en la base QA",
      "Anticipos APC contabilizados en el mayor QA (debito 1330 / credito 1105) con tope mensual y candado por anticipo abierto",
      "Comprobantes GM con IVA por linea (recalculo del maestro) e imputacion al anticipo, contabilizados de inmediato",
      "Reporteria por caja/concepto (resumen, detalle paginado, ranking con % del tope) sobre los datos persistidos",
      "Liquidacion LCM sin cuerpo (reintegro por defecto) y anulacion con reversa contable",
      "Administrador de certificacion eliminado de Supabase al final (auth user + company_users)"
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

async function supabase(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers: { ...CAB, ...(method === "POST" ? { Prefer: "return=representation" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: res.status, payload };
}

// El endpoint /api/v1/auth/login autentica contra la tabla Prisma User con bcrypt (no contra
// Supabase Auth). Por eso el administrador desechable se crea directo en la base QA con la misma
// fila que crearia admin.createUser: rol APEX_ADMIN (role_id 1) del propio tenant, y se elimina al
// terminar. La service role de Supabase se usa solo como transporte PostgREST (bypassa RLS).
let provisionedUserId = "";
async function provisionAdmin() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  // La tabla User no tiene default para updated_at (el Prisma no lo declarara en la migracion):
  // se informa explicitamente para que el insert por PostgREST cumpla el NOT NULL.
  const now = new Date().toISOString();
  const created = await supabase("/rest/v1/User", { method: "POST", body: [{ tenant_id: COMPANY_ID, name: `Certificacion Petty Cash ${RUN_ID}`, email: ADMIN_EMAIL, password: passwordHash, role_id: 1, active: true, authorization_version: 1, preferences: {}, created_at: now, updated_at: now }] });
  if (created.status >= 300 || !created.payload?.[0]?.id) throw new Error(`No se pudo crear el administrador de certificacion: ${created.status} ${JSON.stringify(created.payload).slice(0, 240)}`);
  provisionedUserId = created.payload[0].id;
}

async function deprovisionAdmin() {
  try {
    const removed = await supabase(`/rest/v1/User?id=eq.${encodeURIComponent(provisionedUserId)}`, { method: "DELETE" });
    result.provisioned_admin.deactivated = removed.status < 300;
  } catch (error) {
    result.provisioned_admin.deactivated = false;
    result.provisioned_admin.error = error.message;
  }
}

async function main() {
  try {
    const health = await capture("/health", { auth: false });
    result.api_commit = health.payload?.commit || "unknown";
    check("develop_health_and_commit", health.status === 200 && health.payload?.status === "OK" && result.api_commit === EXPECTED_COMMIT.slice(0, 12), { status: health.status, commit: result.api_commit, expected: EXPECTED_COMMIT.slice(0, 12) });

    const anon = await capture("/api/v1/petty-cash/boxes", { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    await provisionAdmin();
    check("certification_admin_provisioned", Boolean(provisionedUserId), { user_id_suffix: String(provisionedUserId).slice(-6) });

    const login = await capture("/api/v1/auth/login", { method: "POST", auth: false, body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    check("admin_login_and_tenant_resolution", login.status === 200 && Boolean(login.payload?.token) && login.payload?.user?.tenant_id === COMPANY_ID, { status: login.status, tenant_id: login.payload?.user?.tenant_id });
    TOKEN = login.payload.token;

    // ---- Maestro de conceptos de egreso ----
    const conceptCode = `QAGM-CON-${RUN_ID}`;
    const concept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: conceptCode, name: "Peajes y gastos de certificacion develop", account_code: "5195", requires_supplier: false, requires_invoice_reference: false, active: true, notes: `Concepto de certificacion develop ${RUN_ID}` } });
    check("concept_created_with_expense_account", concept.status === 201 && concept.payload.account_code === "5195" && concept.payload.active === true, { status: concept.status, account_code: concept.payload.account_code });
    const conceptId = concept.payload.id;

    const dupConcept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: conceptCode, name: "Duplicado", account_code: "5195" } });
    check("concept_duplicate_code_blocked", dupConcept.status === 409 && dupConcept.payload.code === "CONCEPT_CODE_TAKEN", { status: dupConcept.status, code: dupConcept.payload.code });

    const badAccountConcept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: `QAGM-BAD-${RUN_ID}`, name: "Cuenta no gasto", account_code: "1105" } });
    check("concept_non_expense_account_blocked", badAccountConcept.status === 400 && badAccountConcept.payload.code === "CONCEPT_ACCOUNT_INVALID", { status: badAccountConcept.status, code: badAccountConcept.payload.code });

    // ---- Maestro de cajas menores ----
    const boxCode = `QAGM-BOX-${RUN_ID}`;
    const box = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: boxCode, name: "Caja certificacion develop", account_code: "1105", advance_account_code: "1330", custodian_party_id: CUSTODIAN_PARTY_ID, monthly_limit: 1000000, require_advance: false, block_unliquidated_advance: false, active: true, notes: `Caja de certificacion develop ${RUN_ID}` } });
    check("box_created_ready_for_advances", box.status === 201 && box.payload.ready_for_advances === true && box.payload.monthly_limit === 1000000 && box.payload.custodian_party_id === CUSTODIAN_PARTY_ID, { status: box.status, ready: box.payload.ready_for_advances, warnings: box.payload.warnings?.length, custodian: box.payload.custodian_party_id });
    const boxId = box.payload.id;

    const badBox = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: `QAGM-BOX2-${RUN_ID}`, name: "Caja mal clasificada", account_code: "1305", advance_account_code: "1330" } });
    check("box_non_cash_asset_blocked", badBox.status === 400 && badBox.payload.code === "BOX_ACCOUNT_INVALID", { status: badBox.status, code: badBox.payload.code });

    // ---- Anticipo APC contabilizado (integracion Gastos Menores -> Contabilidad) ----
    const advance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 500000, description: "Anticipo de certificacion develop" } });
    check("advance_created_and_accounted", advance.status === 201 && advance.payload.status === "open" && advance.payload.document_type === "APC" && String(advance.payload.full_number).startsWith("APC-") && advance.payload.balance === 500000 && Boolean(advance.payload.accounting_document_id), { status: advance.status, full_number: advance.payload.full_number, balance: advance.payload.balance });
    const advanceId = advance.payload.id;

    const zeroAdvance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 0 } });
    check("advance_zero_amount_blocked", zeroAdvance.status === 400 && zeroAdvance.payload.code === "ADVANCE_AMOUNT_INVALID", { status: zeroAdvance.status, code: zeroAdvance.payload.code });

    const overLimit = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 600000 } });
    check("advance_over_monthly_limit_blocked", overLimit.status === 422 && overLimit.payload.code === "ADVANCE_EXCEEDS_MONTHLY_LIMIT", { status: overLimit.status, code: overLimit.payload.code });

    const policy = await capture(`/api/v1/petty-cash/boxes/${boxId}`, { method: "PUT", body: { code: boxCode, name: "Caja certificacion develop", account_code: "1105", advance_account_code: "1330", require_advance: true, block_unliquidated_advance: true } });
    check("box_advance_policy_configurable", policy.status === 200 && policy.payload.require_advance === true && policy.payload.block_unliquidated_advance === true && policy.payload.custodian_party_id === CUSTODIAN_PARTY_ID && policy.payload.monthly_limit === 1000000, { status: policy.status, require_advance: policy.payload.require_advance, block: policy.payload.block_unliquidated_advance });

    const secondAdvance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 400000 } });
    check("advance_blocked_while_previous_open", secondAdvance.status === 409 && secondAdvance.payload.code === "ADVANCE_ALREADY_OPEN", { status: secondAdvance.status, code: secondAdvance.payload.code });

    // ---- Comprobante GM con contabilizacion inmediata e IVA por linea ----
    const noAdvanceVoucher = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, lines: [{ concept_code: conceptCode, description: "Gasto sin anticipo", base_amount: 50000 }] } });
    check("voucher_requires_advance_when_configured", noAdvanceVoucher.status === 422 && noAdvanceVoucher.payload.code === "ADVANCE_REQUIRED", { status: noAdvanceVoucher.status, code: noAdvanceVoucher.payload.code });

    const voucher = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: {
      box_id: boxId,
      date: TODAY,
      advance_id: advanceId,
      description: "Comprobante de certificacion develop",
      lines: [
        { concept_code: conceptCode, description: "Peajes de la semana sin IVA", base_amount: 100000, vat_code: null, supplier_party_id: CUSTODIAN_PARTY_ID, invoice_reference: "FV-CERT-QA-001" },
        { concept_code: conceptCode, description: "Materiales con IVA 19", base_amount: 100000, vat_code: "COMPRAS-19", vat_amount: 999999, total: 999999, supplier_party_id: CUSTODIAN_PARTY_ID }
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
      && v1[0].vat_amount === 0 && v1[0].total === 100000 && v1[0].vat_code === null && v1[0].invoice_reference === "FV-CERT-QA-001"
      && v1[1].vat_percent === 19 && v1[1].vat_amount === 19000 && v1[1].total === 119000,
      { status: voucher.status, full_number: voucher.payload.full_number, total: voucher.payload.total, client_vat_ignored: v1[1]?.vat_amount });
    const voucherId = voucher.payload.id;

    const badVat = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, lines: [{ concept_code: conceptCode, description: "IVA inexistente", base_amount: 10000, vat_code: "COMPRAS-99" }] } });
    check("voucher_unknown_vat_code_blocked", badVat.status === 400 && badVat.payload.code === "VAT_MASTER_NOT_FOUND", { status: badVat.status, code: badVat.payload.code });

    const advanceAfterVoucher = await capture(`/api/v1/petty-cash/advances/${advanceId}`);
    check("advance_balance_after_voucher", advanceAfterVoucher.status === 200 && advanceAfterVoucher.payload.applied_total === 219000 && advanceAfterVoucher.payload.balance === 281000 && advanceAfterVoucher.payload.status === "open", { applied: advanceAfterVoucher.payload.applied_total, balance: advanceAfterVoucher.payload.balance });

    // ---- Reporteria sobre datos persistidos en la base QA ----
    const summary = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    const sRow = summary.payload.rows?.[0] || {};
    check("report_summary_groups_by_concept", summary.status === 200 && summary.payload.rows?.length === 1 && sRow.concept_code === conceptCode && sRow.vouchers_count === 1 && sRow.lines_count === 2 && sRow.total === 219000 && summary.payload.totals?.total === 219000 && summary.payload.filters?.box_id === boxId, { status: summary.status, rows: summary.payload.rows?.length, total: summary.payload.totals?.total });

    const detail = await capture(`/api/v1/petty-cash/reports/detail?box_id=${boxId}`);
    const dRows = detail.payload.rows || [];
    const ivaRow = dRows.find((row) => row.vat_percent === 19) || {};
    check("report_detail_paginates_lines", detail.status === 200 && detail.payload.pagination?.total === 2 && detail.payload.pagination?.limit === 200 && dRows.length === 2 && String(ivaRow.full_number).startsWith("GM-") && String(ivaRow.advance_full_number).startsWith("APC-") && ivaRow.advance_status === "open" && ivaRow.vat_amount === 19000 && ivaRow.total === 119000 && ivaRow.supplier_party_id === CUSTODIAN_PARTY_ID && detail.payload.totals?.total === 219000, { status: detail.status, total: detail.payload.pagination?.total, advance_status: ivaRow.advance_status });

    const ranking = await capture(`/api/v1/petty-cash/reports/boxes-ranking?year=${YEAR}&month=${MONTH}&box_id=${boxId}`);
    const rRow = ranking.payload.rows?.[0] || {};
    check("report_boxes_ranking_with_monthly_limit_pct", ranking.status === 200 && ranking.payload.single_month === `${YEAR}-${MONTH}` && rRow.box?.code === boxCode && rRow.total === 219000 && rRow.limit_pct === 21.9, { status: ranking.status, single_month: ranking.payload.single_month, limit_pct: rRow.limit_pct });

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

    // ---- Liquidacion LCM con reintegro por defecto y candado de anulacion posterior ----
    const voucher2 = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, description: "Comprobante post-anulacion develop", lines: [{ concept_code: conceptCode, description: "Aseo de oficina sin IVA", base_amount: 100000, vat_code: null }] } });
    check("second_voucher_applies_remaining_advance", voucher2.status === 201 && voucher2.payload.total === 100000 && voucher2.payload.advance_applied_total === 100000, { status: voucher2.status, total: voucher2.payload.total, applied: voucher2.payload.advance_applied_total });
    const voucher2Id = voucher2.payload.id;

    const liquidate = await capture(`/api/v1/petty-cash/advances/${advanceId}/liquidate`, { method: "POST" });
    check("advance_liquidated_bodyless_default_refund", liquidate.status === 200 && liquidate.payload.status === "liquidated" && liquidate.payload.refund_amount === 400000 && liquidate.payload.shortfall_amount === 0, { status: liquidate.status, refund: liquidate.payload.refund_amount, shortfall: liquidate.payload.shortfall_amount });

    const reLiquidate = await capture(`/api/v1/petty-cash/advances/${advanceId}/liquidate`, { method: "POST", body: {} });
    check("advance_reliquidation_blocked", reLiquidate.status === 409 && reLiquidate.payload.code === "ADVANCE_NOT_OPEN", { status: reLiquidate.status, code: reLiquidate.payload.code });

    const cancelLiquidated = await capture(`/api/v1/petty-cash/vouchers/${voucher2Id}/cancel`, { method: "POST" });
    check("cancel_voucher_with_liquidated_advance_blocked", cancelLiquidated.status === 409 && cancelLiquidated.payload.code === "VOUCHER_ADVANCE_LIQUIDATED", { status: cancelLiquidated.status, code: cancelLiquidated.payload.code });

    const finalSummary = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    const finalDetail = await capture(`/api/v1/petty-cash/reports/detail?box_id=${boxId}`);
    const finalRanking = await capture(`/api/v1/petty-cash/reports/boxes-ranking?year=${YEAR}&month=${MONTH}&box_id=${boxId}`);
    const fr = finalRanking.payload.rows?.[0] || {};
    check("final_report_reflects_live_state", finalSummary.status === 200 && finalSummary.payload.totals?.vouchers_count === 1 && finalSummary.payload.totals?.total === 100000 && finalDetail.payload.pagination?.total === 1 && finalDetail.payload.rows?.[0]?.advance_status === "liquidated" && fr.total === 100000 && fr.limit_pct === 10, { summary_total: finalSummary.payload.totals?.total, detail_total: finalDetail.payload.pagination?.total, advance_status: finalDetail.payload.rows?.[0]?.advance_status, ranking_limit_pct: fr.limit_pct });

    // ---- Limpieza del tenant QA (no deja maestros activos colgando) ----
    const boxOff = await capture(`/api/v1/petty-cash/boxes/${boxId}/deactivate`, { method: "POST" });
    const conceptOff = await capture(`/api/v1/petty-cash/concepts/${conceptId}/deactivate`, { method: "POST" });
    check("qa_masters_deactivated_after_run", boxOff.status === 200 && conceptOff.status === 200 && boxOff.payload.active === false && conceptOff.payload.active === false, { box: boxOff.status, concept: conceptOff.status });

    await deprovisionAdmin();
    check("certification_admin_deprovisioned", result.provisioned_admin.deactivated === true, { email: ADMIN_EMAIL });

    result.fixture = { company_id: COMPANY_ID, concept_id: conceptId, box_id: boxId, advance_id: advanceId, voucher_id: voucherId, voucher2_id: voucher2Id };
    result.status = "passed";
    result.checks_passed = result.checks.filter((c) => c.ok).length;
    result.checks_total = result.checks.length;
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
    console.error("[cert] ERROR:", error.message);
    if (provisionedUserId && result.provisioned_admin.deactivated === null) await deprovisionAdmin();
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
    console.error(`[cert] evidencia: ${path.relative(path.resolve(__dirname, "..", ".."), OUTPUT)} status=${result.status} (${result.checks.filter((c) => c.ok).length}/${result.checks.length})`);
    process.exit(result.status === "passed" ? 0 : 1);
  }
}

main();
