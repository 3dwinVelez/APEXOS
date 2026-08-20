const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args["env-file"]) require("../load-env")(String(args["env-file"]));

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}

function assertQaUrl(name, value) {
  const parsed = new URL(value);
  if (process.env.TARGET_ENV !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  if (!/^https:$/.test(parsed.protocol)) throw new Error(`${name} debe usar HTTPS.`);
  const explicitlyQaHost = /(^|[.-])qa([.-]|$)/i.test(parsed.hostname);
  if (/jzbwzmkidfthknsohhnr/i.test(value) || (/prod|production/i.test(value) && !explicitlyQaHost)) {
    throw new Error(`${name} parece productiva; certificacion cancelada.`);
  }
  return value.replace(/\/$/, "");
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 200) }; }
  return { status: response.status, ok: response.ok, body };
}

function assertResult(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(supabaseUrl, anonKey, email, password) {
  return request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

async function main() {
  const webUrl = assertQaUrl("QA_WEB_URL", required("QA_WEB_URL"));
  const supabaseUrl = assertQaUrl("QA_SUPABASE_URL", required("QA_SUPABASE_URL"));
  const anonKey = required("QA_SUPABASE_ANON_KEY");
  const adminEmail = required("QA_ADMIN_EMAIL");
  const adminPassword = required("QA_ADMIN_PASSWORD");
  const expectedCommit = required("QA_EXPECTED_COMMIT");
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
  const email = `qa-user-cert-${runId}@internal.apexos.local`;
  const firstPassword = `QaCycle-${runId}#1`;
  const secondPassword = `QaCycle-${runId}#2`;
  const outputPath = path.resolve(String(args.output || `admin-user-cycle-qa-${runId}.json`));
  const evidence = { certification: "admin-user-cycle-qa", environment: "QA", expected_commit: expectedCommit, checks: [], cleanup: "not_required", certified_at: new Date().toISOString() };
  let token = "";
  let employeeId = "";

  const check = (name, ok, detail = {}) => {
    evidence.checks.push({ name, status: ok ? "passed" : "failed", detail });
    assertResult(ok, `${name} fallo.`);
  };

  try {
    const adminLogin = await login(supabaseUrl, anonKey, adminEmail, adminPassword);
    check("admin_login", adminLogin.ok && Boolean(adminLogin.body.access_token), { status: adminLogin.status });
    token = adminLogin.body.access_token;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const initial = await request(`${webUrl}/api/admin/users`, { headers });
    check("deployed_commit", initial.ok && String(initial.body.commit || "").startsWith(expectedCommit), { status: initial.status, commit: initial.body.commit || "missing" });
    const initialUsers = Array.isArray(initial.body.employees) ? initial.body.employees : [];
    const roles = initialUsers.map((user) => ({ id: String(user.metadata?.role_id || ""), name: String(user.metadata?.role_name || "") })).filter((role) => role.id && role.name);
    const primaryRole = roles[0];
    const alternateRole = roles.find((role) => role.id !== primaryRole?.id);
    check("role_fixtures_available", Boolean(primaryRole && alternateRole), { roles_found: roles.length });

    const unauthorized = await request(`${webUrl}/api/admin/users`);
    check("authentication_required", unauthorized.status === 401, { status: unauthorized.status });

    const crossTenant = await request(`${webUrl}/api/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ company_id: randomUUID(), name: "QA Tenant Rechazado", email: `qa-rejected-${runId}@internal.apexos.local`, password: firstPassword, document: `QA-REJECT-${runId}`, company: "Invalid", role_id: primaryRole.id, role_name: primaryRole.name })
    });
    check("cross_tenant_rejected", crossTenant.status === 403, { status: crossTenant.status });

    const created = await request(`${webUrl}/api/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "QA User Cert", first_names: "QA User", last_names: "Cert", email, access_email: email, password: firstPassword, document: `QA-CERT-${runId}`, document_type: "CC", company: "Nyvora", role_id: primaryRole.id, role_name: primaryRole.name, user_status: "activo", phone: "3000000000", position: "QA inicial", department: "Calidad", operational_classification: "administrativo" })
    });
    check("user_created", created.ok && Boolean(created.body.employee?.id), { status: created.status });
    employeeId = String(created.body.employee.id);

    const duplicate = await request(`${webUrl}/api/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "QA Duplicado", email, password: firstPassword, document: `QA-DUP-${runId}`, company: "Nyvora", role_id: primaryRole.id, role_name: primaryRole.name })
    });
    check("duplicate_email_rejected", [400, 409, 422].includes(duplicate.status), { status: duplicate.status });

    const updated = await request(`${webUrl}/api/admin/users`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ employee_id: employeeId, action: "update", name: "QA User Cert Updated", first_names: "QA User", last_names: "Cert Updated", email, access_email: email, document: `QA-CERT-${runId}`, document_type: "CC", company: "Nyvora", role_id: alternateRole.id, role_name: alternateRole.name, user_status: "activo", phone: "3111111111", position: "QA actualizado", department: "Certificacion", operational_classification: "administrativo", password: secondPassword })
    });
    check("user_updated_and_credentials_synced", updated.ok && updated.body.credential_sync?.provider === "supabase" && updated.body.credential_sync?.password_changed === true, { status: updated.status, credential_provider: updated.body.credential_sync?.provider || "missing" });

    const refreshed = await request(`${webUrl}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
    const persisted = (refreshed.body.employees || []).find((user) => String(user.id) === employeeId);
    check("persistence_after_refresh", refreshed.ok && persisted?.phone === "3111111111" && persisted?.position === "QA actualizado" && persisted?.department === "Certificacion" && String(persisted?.metadata?.role_id) === alternateRole.id, { status: refreshed.status });

    const oldLogin = await login(supabaseUrl, anonKey, email, firstPassword);
    check("old_password_rejected", [400, 401].includes(oldLogin.status), { status: oldLogin.status });
    const newLogin = await login(supabaseUrl, anonKey, email, secondPassword);
    check("new_password_accepted", newLogin.ok && Boolean(newLogin.body.access_token), { status: newLogin.status });

    const inactive = await request(`${webUrl}/api/admin/users`, { method: "PATCH", headers, body: JSON.stringify({ employee_id: employeeId, action: "status", active: false }) });
    check("user_inactivated", inactive.ok, { status: inactive.status });
    const inactiveLogin = await login(supabaseUrl, anonKey, email, secondPassword);
    check("inactive_user_login_rejected", [400, 401, 403].includes(inactiveLogin.status), { status: inactiveLogin.status });
    evidence.cleanup = "temporary_user_inactivated";
  } finally {
    if (token && employeeId && evidence.cleanup !== "temporary_user_inactivated") {
      const cleanup = await request(`${webUrl}/api/admin/users`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employeeId, action: "status", active: false }) });
      evidence.cleanup = cleanup.ok ? "temporary_user_inactivated_in_finally" : `cleanup_failed_http_${cleanup.status}`;
    }
    evidence.status = evidence.checks.every((item) => item.status === "passed") && !String(evidence.cleanup).startsWith("cleanup_failed") ? "passed" : "failed";
    evidence.user = { email_hint: `qa***${runId.slice(-4)}@internal.apexos.local`, employee_created: Boolean(employeeId) };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  if (evidence.status !== "passed") throw new Error(`Certificacion QA incompleta. Evidencia: ${outputPath}`);
  console.log(`CERTIFICACION QA COMPLETA: ${outputPath}`);
}

main().catch((error) => {
  console.error(`CERTIFICACION QA BLOQUEADA: ${error.message}`);
  process.exitCode = 1;
});
