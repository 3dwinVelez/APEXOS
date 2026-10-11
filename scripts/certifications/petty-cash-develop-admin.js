// Certificacion REMOTA del modulo Gastos Menores / Cajas Menores en DEVELOP (QA) usando el
// USUARIO ADMIN REAL del ambiente.
//
// A diferencia de petty-cash-develop-remote.js (que aprovisiona un administrador desechable en la
// tabla Prisma User), este script:
//   1. Inicia sesion como el administrador real de QA a traves de Supabase Auth (password grant) y
//      consume la API con el Bearer token de Supabase, ejercitando la MISMA ruta que usa la web.
//   2. POBLA datos reales en la herramienta (conceptos de egreso, caja menor, anticipo y
//      comprobantes de gasto contabilizados) y los DEJA activos en el tenant piloto QA para poder
//      verlos en la interfaz. No elimina ni desactiva nada al terminar.
//
// No toca produccion: aborta si la URL de API no es el host HTTPS de QA en Railway. La contrasena
// del administrador se toma de QA_ADMIN_PASSWORD (variable de entorno); nunca se escribe en el repo.

const fs = require("node:fs");
const path = require("node:path");

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
const ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "");
const ADMIN_EMAIL = String(process.env.QA_ADMIN_EMAIL || "admin@apexos.qa");
const ADMIN_PASSWORD = String(process.env.QA_ADMIN_PASSWORD || "");
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("BLOQUEADO: se requiere SUPABASE_URL y SUPABASE_ANON_KEY (config/qa.env).");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("BLOQUEADO: define QA_ADMIN_PASSWORD (contrasena del administrador real de QA) antes de ejecutar.");
  process.exit(1);
}

const EXPECTED_COMMIT = String(args["expected-commit"] || process.env.EXPECTED_COMMIT || "");
const COMPANY_ID = String(args["company-id"] || "c56bc5df-c807-4deb-83f8-fbb4751be613"); // Cliente Piloto QA
const CUSTODIAN_PARTY_ID = Number(args["custodian-party-id"] || 7); // Proveedor CERT-QA (Party del tenant)
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 30000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/petty-cash-module-20261010/develop-admin-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const CERT_ID = "petty-cash-module-admin-20261011";

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = TODAY.slice(0, 4);
const MONTH = TODAY.slice(5, 7);

const result = {
  change_id: CERT_ID,
  certification: "petty-cash-module-develop-admin",
  environment: "QA",
  target_environment: "develop",
  api_url: API_URL,
  supabase_url: SUPABASE_URL,
  api_commit: "unknown",
  expected_commit: EXPECTED_COMMIT ? EXPECTED_COMMIT.slice(0, 12) : "unset",
  generated_at: new Date().toISOString(),
  admin: { email: ADMIN_EMAIL, auth: "supabase-password-grant" },
  tenant: { company_id: COMPANY_ID, name: "Cliente Piloto QA", custodian_party_id: CUSTODIAN_PARTY_ID },
  scope: {
    capability: "Gastos Menores end-to-end en develop con el administrador real de QA: maestros, anticipo APC, comprobante GM con IVA por linea, liquidacion LCM, anulacion con reversa y reporteria, poblando datos reales visibles en la herramienta.",
    proven_by_live_execution: [
      "Sesion del administrador real de QA via Supabase Auth (password grant) consumiendo la API con el Bearer de Supabase",
      "Maestros persistidos: conceptos de egreso con cuenta PUC 5195 y caja menor con 1105/1330, custodio y tope mensual",
      "Anticipo APC contabilizado (debito 1330 / credito 1105) y comprobante GM con IVA por linea e imputacion al anticipo",
      "Reporteria por caja/concepto (resumen, detalle paginado, ranking con % del tope) sobre los datos poblados",
      "Los datos quedan activos en el tenant piloto QA para inspeccion en la interfaz"
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

async function supabaseLogin() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

async function main() {
  try {
    const health = await capture("/health", { auth: false });
    result.api_commit = health.payload?.commit || "unknown";
    check("develop_health", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });
    if (EXPECTED_COMMIT) {
      check("develop_commit_matches_candidate", result.api_commit === EXPECTED_COMMIT.slice(0, 12), { commit: result.api_commit, expected: EXPECTED_COMMIT.slice(0, 12) });
    }

    const anon = await capture("/api/v1/petty-cash/boxes", { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    const login = await supabaseLogin();
    check("admin_supabase_login", login.status === 200 && Boolean(login.payload?.access_token), { status: login.status, error: login.payload?.error_description || login.payload?.msg });
    TOKEN = login.payload.access_token;

    const me = await capture("/api/v1/auth/me");
    check("admin_tenant_resolved", me.status === 200 && me.payload?.user?.email === ADMIN_EMAIL && me.payload?.tenant?.id === COMPANY_ID && me.payload?.user?.role === "APEX_ADMIN", { status: me.status, tenant: me.payload?.tenant?.id, role: me.payload?.user?.role });

    // ---- Maestro de conceptos de egreso (datos reales, se dejan activos) ----
    const conceptCode = `GM-PAP-${RUN_ID}`;
    const concept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: conceptCode, name: "Papelería y aseo de oficina", account_code: "5195", requires_supplier: true, requires_invoice_reference: true, active: true, notes: `Poblado por certificacion admin ${RUN_ID}` } });
    check("concept_created_with_expense_account", concept.status === 201 && concept.payload.account_code === "5195" && concept.payload.active === true && concept.payload.requires_supplier === true, { status: concept.status, code: concept.payload.code, account: concept.payload.account_code });
    const conceptId = concept.payload.id;

    const concept2 = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: `GM-TRA-${RUN_ID}`, name: "Transporte y peajes", account_code: "5195", requires_invoice_reference: false, active: true, notes: `Poblado por certificacion admin ${RUN_ID}` } });
    check("second_concept_created", concept2.status === 201 && concept2.payload.account_code === "5195", { status: concept2.status, code: concept2.payload.code });

    const dupConcept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: conceptCode, name: "Duplicado", account_code: "5195" } });
    check("concept_duplicate_code_blocked", dupConcept.status === 409 && dupConcept.payload.code === "CONCEPT_CODE_TAKEN", { status: dupConcept.status, code: dupConcept.payload.code });

    const badAccountConcept = await capture("/api/v1/petty-cash/concepts", { method: "POST", body: { code: `GM-BAD-${RUN_ID}`, name: "Cuenta no gasto", account_code: "1105" } });
    check("concept_non_expense_account_blocked", badAccountConcept.status === 400 && badAccountConcept.payload.code === "CONCEPT_ACCOUNT_INVALID", { status: badAccountConcept.status, code: badAccountConcept.payload.code });

    // ---- Maestro de cajas menores ----
    const boxCode = `GM-CAJA-${RUN_ID}`;
    const box = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: boxCode, name: "Caja menor Administración", account_code: "1105", advance_account_code: "1330", custodian_party_id: CUSTODIAN_PARTY_ID, monthly_limit: 2000000, require_advance: true, block_unliquidated_advance: true, active: true, notes: `Poblado por certificacion admin ${RUN_ID}` } });
    check("box_created_ready_for_advances", box.status === 201 && box.payload.ready_for_advances === true && box.payload.monthly_limit === 2000000 && box.payload.custodian_party_id === CUSTODIAN_PARTY_ID && box.payload.require_advance === true, { status: box.status, ready: box.payload.ready_for_advances, warnings: box.payload.warnings?.length, custodian: box.payload.custodian_party_id });
    const boxId = box.payload.id;

    const badBox = await capture("/api/v1/petty-cash/boxes", { method: "POST", body: { code: `GM-CAJA2-${RUN_ID}`, name: "Caja mal clasificada", account_code: "1305", advance_account_code: "1330" } });
    check("box_non_cash_asset_blocked", badBox.status === 400 && badBox.payload.code === "BOX_ACCOUNT_INVALID", { status: badBox.status, code: badBox.payload.code });

    // ---- Anticipo APC contabilizado ----
    // El tope mensual se prueba ANTES de abrir un anticipo: con un anticipo abierto y la caja
    // configurada con block_unliquidated_advance el candado responde primero (ADVANCE_ALREADY_OPEN).
    const zeroAdvance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 0 } });
    check("advance_zero_amount_blocked", zeroAdvance.status === 400 && zeroAdvance.payload.code === "ADVANCE_AMOUNT_INVALID", { status: zeroAdvance.status, code: zeroAdvance.payload.code });

    const overLimit = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 2500000 } });
    check("advance_over_monthly_limit_blocked", overLimit.status === 422 && overLimit.payload.code === "ADVANCE_EXCEEDS_MONTHLY_LIMIT", { status: overLimit.status, code: overLimit.payload.code });

    const advance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 800000, description: "Anticipo a custodio caja menor" } });
    check("advance_created_and_accounted", advance.status === 201 && advance.payload.status === "open" && advance.payload.document_type === "APC" && String(advance.payload.full_number).startsWith("APC-") && advance.payload.balance === 800000 && Boolean(advance.payload.accounting_document_id), { status: advance.status, full_number: advance.payload.full_number, balance: advance.payload.balance });
    const advanceId = advance.payload.id;

    const secondAdvance = await capture("/api/v1/petty-cash/advances", { method: "POST", body: { box_id: boxId, date: TODAY, amount: 100000 } });
    check("advance_blocked_while_previous_open", secondAdvance.status === 409 && secondAdvance.payload.code === "ADVANCE_ALREADY_OPEN", { status: secondAdvance.status, code: secondAdvance.payload.code });

    // ---- Comprobante GM con IVA por linea (los importes del cliente se ignoran) ----
    const noAdvanceVoucher = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, lines: [{ concept_code: conceptCode, description: "Gasto sin anticipo", base_amount: 50000 }] } });
    check("voucher_requires_advance_when_configured", noAdvanceVoucher.status === 422 && noAdvanceVoucher.payload.code === "ADVANCE_REQUIRED", { status: noAdvanceVoucher.status, code: noAdvanceVoucher.payload.code });

    const voucher = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: {
      box_id: boxId,
      date: TODAY,
      advance_id: advanceId,
      description: "Reposición papelería y aseo",
      lines: [
        { concept_code: conceptCode, description: "Resma de papel y tintas", base_amount: 150000, vat_code: "COMPRAS-19", vat_amount: 999999, total: 999999, supplier_party_id: CUSTODIAN_PARTY_ID, invoice_reference: `FV-ADMIN-${RUN_ID}-1` },
        { concept_code: concept2.payload.code, description: "Taxi y peajes de gestiones", base_amount: 50000, vat_code: null, supplier_party_id: CUSTODIAN_PARTY_ID }
      ]
    } });
    const v1 = voucher.payload.lines || [];
    check("voucher_created_and_accounted_with_line_vat", voucher.status === 201
      && voucher.payload.status === "posted"
      && voucher.payload.document_type === "GM"
      && String(voucher.payload.full_number).startsWith("GM-")
      && voucher.payload.subtotal === 200000
      && voucher.payload.vat_total === 28500
      && voucher.payload.total === 228500
      && Boolean(voucher.payload.accounting_document_id)
      && voucher.payload.lines_count === 2
      && voucher.payload.advance_applied_total === 228500
      && v1[0].vat_percent === 19 && v1[0].vat_amount === 28500 && v1[0].total === 178500
      && v1[1].vat_amount === 0 && v1[1].total === 50000,
      { status: voucher.status, full_number: voucher.payload.full_number, total: voucher.payload.total, line0_vat: v1[0]?.vat_amount });
    const voucherId = voucher.payload.id;

    const badVat = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, lines: [{ concept_code: conceptCode, description: "IVA inexistente", base_amount: 10000, vat_code: "COMPRAS-99", supplier_party_id: CUSTODIAN_PARTY_ID, invoice_reference: `FV-BAD-${RUN_ID}` }] } });
    check("voucher_unknown_vat_code_blocked", badVat.status === 400 && badVat.payload.code === "VAT_MASTER_NOT_FOUND", { status: badVat.status, code: badVat.payload.code });

    const advanceAfterVoucher = await capture(`/api/v1/petty-cash/advances/${advanceId}`);
    check("advance_balance_after_voucher", advanceAfterVoucher.status === 200 && advanceAfterVoucher.payload.applied_total === 228500 && advanceAfterVoucher.payload.balance === 571500 && advanceAfterVoucher.payload.status === "open", { applied: advanceAfterVoucher.payload.applied_total, balance: advanceAfterVoucher.payload.balance });

    // Segundo comprobante para enriquecer la reporteria (se deja posted)
    const voucher2 = await capture("/api/v1/petty-cash/vouchers", { method: "POST", body: { box_id: boxId, date: TODAY, advance_id: advanceId, description: "Aseo de oficina", lines: [{ concept_code: conceptCode, description: "Jabón y toallas", base_amount: 120000, vat_code: "COMPRAS-19", supplier_party_id: CUSTODIAN_PARTY_ID, invoice_reference: `FV-ADMIN-${RUN_ID}-2` }] } });
    check("second_voucher_applies_advance", voucher2.status === 201 && voucher2.payload.total === 142800 && voucher2.payload.advance_applied_total === 142800, { status: voucher2.status, total: voucher2.payload.total, applied: voucher2.payload.advance_applied_total });
    const voucher2Id = voucher2.payload.id;

    // ---- Reporteria sobre los datos poblados ----
    const summary = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    const rowsByConcept = Object.fromEntries((summary.payload.rows || []).map((r) => [r.concept_code, r]));
    check("report_summary_groups_by_concept", summary.status === 200 && summary.payload.rows?.length === 2 && rowsByConcept[conceptCode]?.vouchers_count === 2 && rowsByConcept[conceptCode]?.total === 321300 && summary.payload.totals?.total === 371300, { status: summary.status, rows: summary.payload.rows?.length, total: summary.payload.totals?.total });

    const detail = await capture(`/api/v1/petty-cash/reports/detail?box_id=${boxId}`);
    check("report_detail_paginates_lines", detail.status === 200 && detail.payload.pagination?.total === 3 && detail.payload.totals?.total === 371300 && (detail.payload.rows || []).every((row) => String(row.full_number).startsWith("GM-") && String(row.advance_full_number).startsWith("APC-")), { status: detail.status, total: detail.payload.pagination?.total });

    const ranking = await capture(`/api/v1/petty-cash/reports/boxes-ranking?year=${YEAR}&month=${MONTH}&box_id=${boxId}`);
    const rRow = ranking.payload.rows?.[0] || {};
    check("report_boxes_ranking_with_monthly_limit_pct", ranking.status === 200 && ranking.payload.single_month === `${YEAR}-${MONTH}` && rRow.box?.code === boxCode && rRow.total === 371300 && Math.abs(rRow.limit_pct - 18.57) < 0.01, { status: ranking.status, single_month: ranking.payload.single_month, limit_pct: rRow.limit_pct });

    const monthNoYear = await capture("/api/v1/petty-cash/reports/summary?month=10");
    check("report_month_without_year_blocked", monthNoYear.status === 400 && monthNoYear.payload.code === "REPORT_FILTER_INVALID", { status: monthNoYear.status, code: monthNoYear.payload.code });

    // ---- Anulacion con reversa contable y restauracion del anticipo; luego se deja el voucher2 vigente ----
    const cancel = await capture(`/api/v1/petty-cash/vouchers/${voucherId}/cancel`, { method: "POST" });
    check("voucher_cancelled_with_accounting_reversal", cancel.status === 200 && cancel.payload.status === "cancelled" && Boolean(cancel.payload.reversal_accounting_document_id), { status: cancel.status, reversal: Boolean(cancel.payload.reversal_accounting_document_id) });

    const advanceRestored = await capture(`/api/v1/petty-cash/advances/${advanceId}`);
    check("advance_balance_restored_after_cancel", advanceRestored.status === 200 && advanceRestored.payload.applied_total === 142800 && advanceRestored.payload.balance === 657200 && advanceRestored.payload.status === "open", { applied: advanceRestored.payload.applied_total, balance: advanceRestored.payload.balance });

    const reCancel = await capture(`/api/v1/petty-cash/vouchers/${voucherId}/cancel`, { method: "POST" });
    check("voucher_double_cancel_blocked", reCancel.status === 409 && reCancel.payload.code === "VOUCHER_ALREADY_CANCELLED", { status: reCancel.status, code: reCancel.payload.code });

    const summaryAfterCancel = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    check("report_excludes_cancelled_by_default", summaryAfterCancel.status === 200 && summaryAfterCancel.payload.totals?.total === 142800, { total: summaryAfterCancel.payload.totals?.total });

    // ---- Liquidacion LCM con reintegro por defecto (cierra el ciclo y deja evidencia visible) ----
    const liquidate = await capture(`/api/v1/petty-cash/advances/${advanceId}/liquidate`, { method: "POST" });
    check("advance_liquidated_bodyless_default_refund", liquidate.status === 200 && liquidate.payload.status === "liquidated" && liquidate.payload.refund_amount === 657200 && liquidate.payload.shortfall_amount === 0, { status: liquidate.status, refund: liquidate.payload.refund_amount, shortfall: liquidate.payload.shortfall_amount });

    const reLiquidate = await capture(`/api/v1/petty-cash/advances/${advanceId}/liquidate`, { method: "POST", body: {} });
    check("advance_reliquidation_blocked", reLiquidate.status === 409 && reLiquidate.payload.code === "ADVANCE_NOT_OPEN", { status: reLiquidate.status, code: reLiquidate.payload.code });

    const finalSummary = await capture(`/api/v1/petty-cash/reports/summary?group_by=concept&box_id=${boxId}`);
    check("final_report_reflects_live_state", finalSummary.status === 200 && finalSummary.payload.totals?.vouchers_count === 1 && finalSummary.payload.totals?.total === 142800, { vouchers: finalSummary.payload.totals?.vouchers_count, total: finalSummary.payload.totals?.total });

    result.fixture = { company_id: COMPANY_ID, concept_id: conceptId, concept2_id: concept2.payload.id, box_id: boxId, advance_id: advanceId, voucher_id: voucherId, voucher2_id: voucher2Id, note: "Datos dejados activos en el tenant piloto QA para inspeccion en la interfaz" };
    result.status = "passed";
    result.checks_passed = result.checks.filter((c) => c.ok).length;
    result.checks_total = result.checks.length;
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
    console.error("[cert] ERROR:", error.message);
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
    console.error(`[cert] evidencia: ${path.relative(path.resolve(__dirname, "..", ".."), OUTPUT)} status=${result.status} (${result.checks.filter((c) => c.ok).length}/${result.checks.length})`);
    process.exit(result.status === "passed" ? 0 : 1);
  }
}

main();
