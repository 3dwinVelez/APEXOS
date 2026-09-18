const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const scriptPath = path.resolve(__dirname, "../certifications/transport-master-qa.js");
const source = fs.readFileSync(scriptPath, "utf8");
const { assertQaUrl, vehiclePayload } = require(scriptPath);

test("el certificador solo permite destinos QA HTTPS", () => {
  const previous = process.env.TARGET_ENV;
  process.env.TARGET_ENV = "qa";
  try {
    assert.equal(assertQaUrl("QA_API_URL", "https://apexos-api-qa-production.up.railway.app/"), "https://apexos-api-qa-production.up.railway.app");
    assert.throws(() => assertQaUrl("QA_API_URL", "https://apexos-api-prod-production.up.railway.app"), /parece productiva/);
    assert.throws(() => assertQaUrl("QA_API_URL", "http://apexos-api-qa.local"), /HTTPS/);
  } finally {
    if (previous === undefined) delete process.env.TARGET_ENV;
    else process.env.TARGET_ENV = previous;
  }
});

test("el payload base es valido, trazable y no usa produccion", () => {
  const payload = vehiclePayload("20260825123456");
  for (const field of ["plate", "type", "brand", "ownership_type", "base_site", "vin_chassis", "soat_issued_at", "soat_expires", "technical_review_issued_at", "technical_review_expires"]) {
    assert.ok(payload[field], `falta ${field}`);
  }
  assert.match(payload.notes, /Certificacion Transporte/);
  assert.doesNotMatch(JSON.stringify(payload), /production|prod|jzbwzmkidfthknsohhnr/i);
});

test("el certificado cubre el flujo funcional y las negativas protegidas", () => {
  for (const check of [
    "deployed_commit", "authentication_required", "readonly_can_list", "vehicle_created_and_plate_normalized",
    "readonly_write_denied", "required_fields_rejected", "inconsistent_dates_rejected", "duplicate_vin_rejected",
    "vehicle_updated", "document_uploaded", "document_versioned", "detail_documents_and_audit", "planning_contract",
    "dashboard_metrics_include_vehicle", "cross_tenant_detail_denied", "vehicle_soft_retired",
    "retired_excluded_by_default", "retired_available_for_filter"
  ]) {
    assert.match(source, new RegExp(`"${check}"`), `falta ${check}`);
  }
  assert.match(source, /temporary_vehicle_soft_retired_in_finally/);
  assert.match(source, /QA_EXPECTED_COMMIT/);
});

test("la evidencia no serializa secretos", () => {
  assert.match(source, /credentials_recorded: false/);
  assert.doesNotMatch(source, /evidence\.(adminToken|password|anonKey)/);
  assert.doesNotMatch(source, /test_record[^\n]+password/);
});
