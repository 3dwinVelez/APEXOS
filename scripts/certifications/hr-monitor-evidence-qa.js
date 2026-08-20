const fs = require("node:fs");
const path = require("node:path");

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

function qaUrl(name, value) {
  const parsed = new URL(value);
  if (process.env.TARGET_ENV !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  if (parsed.protocol !== "https:") throw new Error(`${name} debe usar HTTPS.`);
  const explicitlyQaHost = /(^|[.-])qa([.-]|$)/i.test(parsed.hostname);
  if (/jzbwzmkidfthknsohhnr/i.test(value) || (/prod|production/i.test(value) && !explicitlyQaHost)) {
    throw new Error(`${name} parece productivo; certificacion cancelada.`);
  }
  return value.replace(/\/$/, "");
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { ok: response.ok, status: response.status, body };
}

async function main() {
  const webUrl = qaUrl("QA_WEB_URL", required("QA_WEB_URL"));
  const supabaseUrl = qaUrl("QA_SUPABASE_URL", required("QA_SUPABASE_URL"));
  const anonKey = required("QA_SUPABASE_ANON_KEY");
  const adminEmail = required("QA_ADMIN_EMAIL");
  const adminPassword = required("QA_ADMIN_PASSWORD");
  const expectedCommit = required("QA_EXPECTED_COMMIT");
  const routeId = Number(process.env.QA_HR_ROUTE_ID || 10);
  if (!Number.isInteger(routeId) || routeId < 1) throw new Error("QA_HR_ROUTE_ID debe ser numerico.");
  const outputPath = path.resolve(String(args.output || `hr-monitor-evidence-qa-${Date.now()}.json`));
  const evidence = {
    certification: "hr-monitor-evidence-qa",
    environment: "QA",
    route_id: routeId,
    expected_commit: expectedCommit,
    checks: [],
    certified_at: new Date().toISOString()
  };
  const check = (name, ok, detail = {}) => {
    evidence.checks.push({ name, status: ok ? "passed" : "failed", detail });
    if (!ok) throw new Error(`${name} fallo.`);
  };

  try {
    const login = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword })
    });
    check("admin_login", login.ok && Boolean(login.body.access_token), { status: login.status });
    const headers = { Authorization: `Bearer ${login.body.access_token}`, "Content-Type": "application/json" };

    const deployed = await request(`${webUrl}/api/admin/users`, { headers });
    check("deployed_commit", deployed.ok && String(deployed.body.commit || "").startsWith(expectedCommit), { status: deployed.status, commit: deployed.body.commit || "missing" });

    const routes = await request(`${webUrl}/api/v1/hr/routes`, { headers });
    const route = Array.isArray(routes.body) ? routes.body.find((item) => Number(item.id) === routeId) : null;
    check("target_route_available", routes.ok && Boolean(route), { status: routes.status, route_id: routeId });
    const date = String(route.date || "").slice(0, 10);

    const summaries = await request(`${webUrl}/api/v1/hr/routes/event-summaries`, { headers });
    const routeSummary = summaries.body?.routes?.find((item) => Number(item.route_id) === routeId);
    check("route_events_registered", summaries.ok && Number(routeSummary?.activity_count || 0) > 0 && Number(routeSummary?.evidence_count || 0) > 0, {
      status: summaries.status,
      punch_count: Number(routeSummary?.punch_count || 0),
      activity_count: Number(routeSummary?.activity_count || 0),
      evidence_count: Number(routeSummary?.evidence_count || 0)
    });

    const operations = await request(`${webUrl}/api/v1/hr/operations-map?date=${encodeURIComponent(date)}&minutes=30&footprint_days=30`, { headers });
    const monitorRoute = operations.body?.routes?.find((item) => Number(item.id) === routeId);
    const activity = monitorRoute?.activity_points?.find((item) => item.evidence?.[0]?.id);
    const summaryEvidence = activity?.evidence?.[0];
    check("monitor_activity_visible", operations.ok && Boolean(activity), { status: operations.status, activity_count: monitorRoute?.activity_points?.length || 0 });
    check("monitor_payload_is_lightweight", summaryEvidence && !("base64_data" in summaryEvidence), { evidence_id: summaryEvidence?.id || null });

    const unauthorized = await request(`${webUrl}/api/v1/hr/work-activities/${activity.id}/evidence/${summaryEvidence.id}`);
    check("authentication_required", unauthorized.status === 401, { status: unauthorized.status });

    const detail = await request(`${webUrl}/api/v1/hr/work-activities/${activity.id}/evidence/${summaryEvidence.id}`, { headers });
    const base64Data = String(detail.body?.base64_data || "");
    check("evidence_loaded_on_demand", detail.ok && /^data:image\/[a-z0-9.+-]+;base64,/i.test(base64Data), {
      status: detail.status,
      evidence_id: detail.body?.id || null,
      mime_type: detail.body?.mime_type || null,
      encoded_length: base64Data.length
    });

    const mismatched = await request(`${webUrl}/api/v1/hr/work-activities/${Number(activity.id) + 1000000}/evidence/${summaryEvidence.id}`, { headers });
    check("activity_evidence_binding_enforced", mismatched.status === 404, { status: mismatched.status, code: mismatched.body?.code || null });

    const invalid = await request(`${webUrl}/api/v1/hr/work-activities/invalid/evidence/${summaryEvidence.id}`, { headers });
    check("invalid_identifier_rejected", invalid.status === 400, { status: invalid.status, code: invalid.body?.code || null });

    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error.message;
    throw error;
  } finally {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
