"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchActivity, activityChecks } = require("../lib/activity");
const { loadConfig, credentialReport, safeConfig } = require("../lib/config");

const BASE = { environmentTimeoutMs: 1500, simulation: false };
const environment = (extra = {}) => ({ id: "local", short: "LOCAL", apiBaseUrl: "http://api.test", apexToken: "jwt-demo", ...extra });

function activityPayload(extra = {}) {
  return {
    generated_at: "2026-11-03T12:00:00.000Z",
    scope: "tenant",
    days: 7,
    tenant: { id: "tenant-a", name: "Empresa A", plan: "PRO", active: true },
    daily: [
      { date: "2026-11-02", audit: 3, events: 2, total: 5 },
      { date: "2026-11-03", audit: 1, events: 4, total: 5 }
    ],
    activity: { today: 5, period: 10, last_activity_at: "2026-11-03T11:55:00.000Z", last_activity_age_minutes: 5, active_users: 4 },
    connections: {
      active_sessions: 3,
      distinct_users: 2,
      last_seen_at: "2026-11-03T11:58:00.000Z",
      last_seen_age_minutes: 2,
      websocket: { clients: 2, tenants: 1, scope: "process" },
      gps: { pings_period: 120, last_ping_at: "2026-11-03T11:59:00.000Z", last_ping_age_minutes: 1 }
    },
    ...extra
  };
}

function tenantsPayload() {
  return {
    generated_at: "2026-11-03T12:00:00.000Z",
    scope: "cross-tenant",
    restricted: false,
    allowlist: [],
    summary: { total: 2, active: 1, with_activity: 1, with_sessions: 1, with_gps: 1 },
    tenants: [
      { tenant_id: "tenant-a", name: "Empresa A", plan: "PRO", active: true, users_active: 4, sessions_active: 3, activity_period: 10, last_activity_at: "2026-11-03T11:55:00.000Z", gps_period: 120, last_ping_at: "2026-11-03T11:59:00.000Z", status: "ok" },
      { tenant_id: "tenant-b", name: "Empresa B", plan: "BASIC", active: false, users_active: 0, sessions_active: 0, activity_period: 0, last_activity_at: null, gps_period: 0, last_ping_at: null, status: "unknown" }
    ]
  };
}

test("sin token sondea la ruta sin credencial y deja la actividad sin dato", async () => {
  const calls = [];
  const payload = await fetchActivity(BASE, environment({ apexToken: "" }), {
    httpRequest: async (url, options) => {
      calls.push({ url, options });
      return { ok: false, status: 401, json: null };
    }
  });
  assert.equal(calls.length, 2, "sondea actividad y empresas para distinguir 401 de 404");
  assert.ok(calls.every((call) => call.options.headers.authorization === undefined));
  assert.equal(payload.reason, "SIN_TOKEN");
  assert.equal(payload.activity, null);
  assert.equal(payload.tenants, null);

  const checks = activityChecks(payload, environment());
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, "local.activity");
  assert.equal(checks[0].status, "unknown");
  assert.equal(checks[0].informational, true);
  assert.equal(checks[0].optional, true);
});

test("consulta actividad y empresas con el token del ambiente", async () => {
  const calls = [];
  const httpRequest = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/activity")) return { ok: true, status: 200, json: activityPayload() };
    return { ok: true, status: 200, json: tenantsPayload() };
  };
  const payload = await fetchActivity(BASE, environment({ id: "develop", short: "QA", apiBaseUrl: "https://api.test" }), { httpRequest });
  assert.deepEqual(calls.map((call) => call.url).sort(), [
    "https://api.test/api/v1/apex-control/activity",
    "https://api.test/api/v1/apex-control/tenants"
  ]);
  assert.ok(calls.every((call) => call.options.headers.authorization === "Bearer jwt-demo"));
  assert.equal(payload.source, "api");
  assert.equal(payload.reason, null);
  assert.equal(payload.activity.activity.today, 5);
  assert.equal(payload.tenants.summary.total, 2);

  const checks = activityChecks(payload, { id: "develop", short: "QA" });
  assert.equal(checks[0].id, "develop.activity");
  assert.equal(checks[0].status, "ok");
  assert.match(checks[0].detail, /5 actividades hoy/);
  assert.equal(checks[0].technical.tenants.summary.total, 2);
});

test("empresas restringidas conservan la actividad del tenant", async () => {
  const httpRequest = async (url) => {
    if (url.endsWith("/activity")) return { ok: true, status: 200, json: activityPayload() };
    return { ok: false, status: 403, json: { code: "CROSS_TENANT_DESHABILITADO" } };
  };
  const payload = await fetchActivity(BASE, environment(), { httpRequest });
  assert.equal(payload.activity.activity.today, 5);
  assert.equal(payload.tenants, null);
  assert.equal(payload.tenantsReason, "CROSS_TENANT_DESHABILITADO");
  const checks = activityChecks(payload, environment());
  assert.equal(checks[0].technical.tenantsReason, "CROSS_TENANT_DESHABILITADO");
  assert.match(checks[0].technical.tenantsDetail, /deshabilitada/);
});

test("401 en actividad y caida de red se reportan sin inventar datos", async () => {
  const denied = await fetchActivity(BASE, environment(), {
    httpRequest: async () => ({ ok: false, status: 401, json: null })
  });
  assert.equal(denied.reason, "TOKEN_INVALIDO");
  assert.equal(denied.configured, true);
  assert.equal(denied.activity, null);

  const offline = await fetchActivity(BASE, environment(), {
    httpRequest: async () => ({ ok: false, status: 0, json: null, error: "ECONNREFUSED" })
  });
  assert.equal(offline.reason, "SIN_CONEXION");

  const missing = await fetchActivity(BASE, environment(), {
    httpRequest: async () => ({ ok: false, status: 404, json: null })
  });
  assert.equal(missing.reason, "MODULO_NO_DESPLEGADO");
});

test("sin token un 404 acusa build anterior y no falta de credencial", async () => {
  const payload = await fetchActivity(
    { ...BASE, apexToken: "token-local" },
    { id: "main", short: "PROD", apiBaseUrl: "https://api.test", apexToken: "" },
    { httpRequest: async () => ({ ok: false, status: 404, json: null }) }
  );
  assert.equal(payload.reason, "MODULO_NO_DESPLEGADO");
  assert.equal(payload.configured, false);
});

test("el token local no se envia a ambientes remotos", async () => {
  const calls = [];
  const payload = await fetchActivity(
    { ...BASE, apexToken: "token-local" },
    { id: "main", short: "PROD", apiBaseUrl: "https://api.test", apexToken: "" },
    { httpRequest: async (url, options) => { calls.push({ url, options }); return { ok: false, status: 401, json: null }; } }
  );
  assert.equal(payload.reason, "SIN_TOKEN");
  assert.ok(calls.every((call) => call.options.headers.authorization === undefined), "no se envia el token local");
});

test("la simulacion omite la red y las credenciales solo exponen nombres", async () => {
  let called = false;
  const simulated = await fetchActivity({ ...BASE, simulation: true }, environment(), {
    httpRequest: async () => {
      called = true;
      return { ok: true, status: 200, json: {} };
    }
  });
  assert.equal(called, false);
  assert.equal(simulated.reason, "SIMULACION");

  const config = loadConfig({
    cloud: {
      railway: { token: "railway-secret-value" },
      vercel: { token: "" },
      supabase: { accessToken: "" }
    },
    environments: {
      develop: { railwayProjectId: "proj-qa", vercelProjectId: "prj-qa", supabaseRef: "ref-qa" },
      main: { railwayProjectId: "", vercelProjectId: "", supabaseRef: "ref-prod" }
    }
  });
  const report = credentialReport(config);
  const railway = report.find((entry) => entry.provider === "railway");
  assert.equal(railway.configured, true);
  assert.deepEqual(railway.environments, { local: "not_required", develop: true, main: false });
  assert.deepEqual(railway.missing, ["ENV_MAIN_RAILWAY_PROJECT_ID"]);

  const supabase = report.find((entry) => entry.provider === "supabase");
  assert.equal(supabase.tokenConfigured, false);
  assert.ok(supabase.missing.includes("SUPABASE_ACCESS_TOKEN"));
  assert.ok(!supabase.missing.some((name) => name.includes("ANON")));

  const vercel = report.find((entry) => entry.provider === "vercel");
  assert.equal(vercel.configured, false);
  assert.ok(vercel.missing.includes("VERCEL_TOKEN"));
  assert.ok(!vercel.missing.includes("ENV_DEVELOP_VERCEL_PROJECT_ID"));

  const serialized = JSON.stringify(safeConfig(config));
  assert.equal(serialized.includes("railway-secret-value"), false);
});
