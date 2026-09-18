const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

const columns = ["codigo", "nombre", "categoria", "descripcion", "minutos_estimados", "marca", "modelo", "activa", "pieza", "cantidad_pieza", "unidad_pieza", "descripcion_pieza", "titulo_manual", "url_manual", "notas_manual"];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    args[item.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

function requiredAny(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  throw new Error(`${names.join(" o ")} es obligatorio.`);
}

function assertQaUrl(name, value) {
  const parsed = new URL(value);
  if (String(process.env.TARGET_ENV || "").toLowerCase() !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  const localHost = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  const localCandidate = localHost && String(process.env.ALLOW_LOCAL_CANDIDATE || "").toLowerCase() === "true";
  if (localHost && !localCandidate) throw new Error(`${name} local requiere ALLOW_LOCAL_CANDIDATE=true.`);
  if (parsed.protocol !== "https:" && !(localCandidate && parsed.protocol === "http:")) throw new Error(`${name} debe usar HTTPS.`);
  const explicitlyQaHost = /(^|[.-])qa([.-]|$)/i.test(parsed.hostname);
  if (/jzbwzmkidfthknsohhnr/i.test(value) || (/prod|production/i.test(value) && !explicitlyQaHost)) throw new Error(`${name} parece productiva; certificacion cancelada.`);
  return value.replace(/\/$/, "");
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const buffer = Buffer.from(await response.arrayBuffer());
  let body = {};
  try { body = buffer.length ? JSON.parse(buffer.toString("utf8")) : {}; } catch { body = { raw: buffer.toString("utf8", 0, 300) }; }
  return { status: response.status, ok: response.ok, body, buffer, headers: response.headers };
}

async function login(supabaseUrl, anonKey, email, password) {
  return request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function importRow(code, overrides = {}) {
  return {
    code,
    name: "Referencia certificable Excel",
    category: "muebles",
    description: "Registro temporal de certificacion QA",
    estimated_minutes: 75,
    brand: "APEX QA",
    model: "XLSX-2026",
    active: true,
    part_name: "Estructura certificable",
    part_quantity: 1,
    part_unit: "und",
    part_description: "Validar ensamble",
    manual_title: "Manual certificable",
    manual_url: "https://example.com/manual-certificable.pdf",
    manual_notes: "Documento de prueba",
    ...overrides
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["env-file"]) require("../load-env")(String(args["env-file"]));
  if (String(args["allow-local-candidate"] || "").toLowerCase() === "true") process.env.ALLOW_LOCAL_CANDIDATE = "true";
  const apiUrl = assertQaUrl("QA_API_URL", String(args["api-url"] || requiredAny("QA_API_URL")));
  const webUrl = assertQaUrl("QA_WEB_URL", String(args["web-url"] || process.env.QA_WEB_URL || process.env.NEXT_PUBLIC_APP_URL || ""));
  const supabaseUrl = assertQaUrl("QA_SUPABASE_URL", requiredAny("QA_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"));
  const anonKey = requiredAny("QA_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const expectedCommit = String(args["expected-commit"] || requiredAny("QA_EXPECTED_COMMIT"));
  const outputPath = path.resolve(String(args.output || `service-reference-excel-qa-${Date.now()}.json`));
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const code = `QA-XLSX-${runId}`;
  const evidence = { certification: "service-reference-excel-qa", environment: "QA", expected_commit: expectedCommit, checks: [], cleanup: "not_started", certified_at: new Date().toISOString() };
  const check = (name, ok, detail = {}) => {
    evidence.checks.push({ name, status: ok ? "passed" : "failed", detail });
    if (!ok) throw new Error(`${name} fallo.`);
  };
  let adminToken = "";
  let createdId = "";
  let currentPayload = null;

  try {
    const health = await request(`${apiUrl}/health`);
    check("deployed_commit", health.ok && String(health.body.commit || "").startsWith(expectedCommit.slice(0, 12)), { status: health.status, commit: health.body.commit || "missing" });

    const template = await request(`${webUrl}/plantillas/plantilla-referencias-servicio.xlsx`);
    check("xlsx_download", template.ok && template.buffer.subarray(0, 2).toString() === "PK", { status: template.status, bytes: template.buffer.length, content_type: template.headers.get("content-type") });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template.buffer);
    check("xlsx_structure", ["Referencias", "Ejemplo", "Instrucciones"].every((name) => workbook.getWorksheet(name)), { sheets: workbook.worksheets.map((sheet) => sheet.name) });
    const referenceHeaders = columns.map((_, index) => String(workbook.getWorksheet("Referencias").getRow(1).getCell(index + 1).value || ""));
    check("xlsx_headers_and_guidance", JSON.stringify(referenceHeaders) === JSON.stringify(columns) && workbook.getWorksheet("Ejemplo").actualRowCount >= 3 && workbook.getWorksheet("Instrucciones").actualRowCount >= 19, { headers: referenceHeaders.length });

    const adminLogin = await login(supabaseUrl, anonKey, requiredAny("QA_SERVICE_ADMIN_EMAIL", "QA_TRANSPORT_ADMIN_EMAIL", "QA_SUPABASE_SCJ_EMAIL"), requiredAny("QA_SERVICE_ADMIN_PASSWORD", "QA_TRANSPORT_ADMIN_PASSWORD", "QA_SUPABASE_SCJ_PASSWORD"));
    check("admin_login", adminLogin.ok && Boolean(adminLogin.body.access_token), { status: adminLogin.status });
    adminToken = adminLogin.body.access_token;
    const adminHeaders = authHeaders(adminToken);

    const readonlyEmail = String(process.env.QA_SERVICE_READONLY_EMAIL || process.env.QA_TRANSPORT_READONLY_EMAIL || "").trim();
    const readonlyPassword = String(process.env.QA_SERVICE_READONLY_PASSWORD || process.env.QA_TRANSPORT_READONLY_PASSWORD || "").trim();
    let readonlyHeaders = null;
    if (readonlyEmail && readonlyPassword) {
      const readonlyLogin = await login(supabaseUrl, anonKey, readonlyEmail, readonlyPassword);
      check("readonly_login", readonlyLogin.ok && Boolean(readonlyLogin.body.access_token), { status: readonlyLogin.status });
      readonlyHeaders = authHeaders(readonlyLogin.body.access_token);
    }

    const invalidPayload = importRow(`${code}-INVALID`, { part_quantity: 0, manual_url: "archivo-local.pdf" });
    const invalid = await request(`${apiUrl}/api/v1/services/references/import`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ rows: [invalidPayload] }) });
    check("invalid_batch_rejected", [400, 422].includes(invalid.status) && /cantidad|url|valid/i.test(JSON.stringify(invalid.body)), { status: invalid.status });
    const afterInvalid = await request(`${apiUrl}/api/v1/services/references?search=${encodeURIComponent(`${code}-INVALID`)}`, { headers: adminHeaders });
    check("invalid_batch_no_injection", afterInvalid.ok && Array.isArray(afterInvalid.body) && !afterInvalid.body.some((item) => item.code === `${code}-INVALID`), { status: afterInvalid.status });

    const rows = [importRow(code), importRow(code, { part_name: "Cojineria certificable", part_quantity: 3, manual_title: "", manual_url: "", manual_notes: "" })];
    currentPayload = rows[0];
    const imported = await request(`${apiUrl}/api/v1/services/references/import`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ rows }) });
    check("valid_excel_rows_imported", imported.ok && imported.body.created === 1 && imported.body.updated === 0 && imported.body.skipped === 0, { status: imported.status, created: imported.body.created, updated: imported.body.updated, skipped: imported.body.skipped });
    createdId = String(imported.body.references?.[0]?.id || "");
    check("import_returns_reference", Boolean(createdId), { id: createdId || null });

    const reloaded = await request(`${apiUrl}/api/v1/services/references/${createdId}`, { headers: adminHeaders });
    check("import_persists_all_fields", reloaded.ok && reloaded.body.code === code && reloaded.body.estimated_minutes === 75 && reloaded.body.active === true && reloaded.body.parts?.length === 2 && reloaded.body.manuals?.length === 1, { status: reloaded.status, parts: reloaded.body.parts?.length, manuals: reloaded.body.manuals?.length });

    const unauthorizedWrite = await request(`${apiUrl}/api/v1/services/references/import`, { method: "POST", headers: readonlyHeaders || { "Content-Type": "application/json" }, body: JSON.stringify({ rows: [importRow(`${code}-RO`)] }) });
    check(readonlyHeaders ? "readonly_import_denied" : "unauthenticated_import_denied", unauthorizedWrite.status === (readonlyHeaders ? 403 : 401), { status: unauthorizedWrite.status });

    const updatedRow = importRow(code, { name: "Referencia certificable Excel actualizada", estimated_minutes: 80, part_name: "Pieza final", manual_title: "", manual_url: "", manual_notes: "" });
    currentPayload = updatedRow;
    const updated = await request(`${apiUrl}/api/v1/services/references/import`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ rows: [updatedRow] }) });
    check("existing_reference_updated", updated.ok && updated.body.created === 0 && updated.body.updated === 1 && updated.body.skipped === 0, { status: updated.status, created: updated.body.created, updated: updated.body.updated });
    const updatedReload = await request(`${apiUrl}/api/v1/services/references/${createdId}`, { headers: adminHeaders });
    check("update_replaces_parts_without_duplicates", updatedReload.ok && updatedReload.body.name.endsWith("actualizada") && updatedReload.body.estimated_minutes === 80 && updatedReload.body.parts?.length === 1 && updatedReload.body.parts[0].name === "Pieza final", { status: updatedReload.status, parts: updatedReload.body.parts?.length });

    const cleanupPayload = { code, name: currentPayload.name, category: currentPayload.category, description: currentPayload.description, estimated_minutes: currentPayload.estimated_minutes, brand: currentPayload.brand, model: currentPayload.model, active: false, parts: [{ name: currentPayload.part_name, quantity: currentPayload.part_quantity, unit: currentPayload.part_unit, description: currentPayload.part_description }], manuals: [] };
    const cleanup = await request(`${apiUrl}/api/v1/services/references/${createdId}`, { method: "PUT", headers: adminHeaders, body: JSON.stringify(cleanupPayload) });
    check("temporary_reference_deactivated", cleanup.ok && cleanup.body.active === false, { status: cleanup.status });
    evidence.cleanup = "temporary_reference_deactivated";
  } finally {
    if (adminToken && createdId && evidence.cleanup !== "temporary_reference_deactivated" && currentPayload) {
      const cleanup = await request(`${apiUrl}/api/v1/services/references/${createdId}`, { method: "PUT", headers: authHeaders(adminToken), body: JSON.stringify({ code, name: currentPayload.name, category: currentPayload.category, description: currentPayload.description, estimated_minutes: currentPayload.estimated_minutes, brand: currentPayload.brand, model: currentPayload.model, active: false, parts: [{ name: currentPayload.part_name, quantity: currentPayload.part_quantity, unit: currentPayload.part_unit, description: currentPayload.part_description }], manuals: [] }) });
      evidence.cleanup = cleanup.ok ? "temporary_reference_deactivated_in_finally" : `cleanup_failed_http_${cleanup.status}`;
    }
    evidence.status = evidence.checks.every((item) => item.status === "passed") && !String(evidence.cleanup).startsWith("cleanup_failed") ? "passed" : "failed";
    evidence.test_record = { reference_id: createdId || null, code, credentials_recorded: false };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }
  if (evidence.status !== "passed") throw new Error(`Certificacion QA incompleta. Evidencia: ${outputPath}`);
  console.log(`CERTIFICACION REFERENCIAS EXCEL QA COMPLETA: ${outputPath}`);
}

if (require.main === module) main().catch((error) => { console.error(`CERTIFICACION REFERENCIAS EXCEL QA BLOQUEADA: ${error.message}`); process.exitCode = 1; });
module.exports = { assertQaUrl, importRow };
