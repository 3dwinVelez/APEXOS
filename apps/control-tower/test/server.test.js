"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createTower } = require("../server");

const UI_TOKEN = "ui-test-token";
const BRIDGE_TOKEN = "bridge-test-token";

function call(base, route, { method = "GET", token, body, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  if (token) finalHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) finalHeaders["content-type"] = "application/json";
  return fetch(`${base}${route}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (response) => {
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed, text };
  });
}

function rawRequest(port, hostHeader) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port, path: "/api/health", method: "GET", headers: { host: hostHeader } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end();
  });
}

test("torre local: salud, UI, auth, fabrica, puente, simulacion y telegram", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tower-server-"));
  const tower = createTower({
    dataDir,
    pollMs: 60000,
    simulation: true,
    uiToken: UI_TOKEN,
    bridge: { token: BRIDGE_TOKEN },
    telegram: { mode: "dry-run", allowedChatIds: ["100"] },
    git: { remoteEnabled: false }
  });
  const address = await tower.start({ port: 0 });
  const base = address.url;
  t.after(async () => {
    await tower.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const health = await call(base, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);

  const index = await call(base, "/");
  assert.equal(index.status, 200);
  assert.match(index.text, /APEX Control/);
  const app = await call(base, "/app.js");
  assert.equal(app.status, 200);

  const status = await call(base, "/api/status");
  assert.equal(status.status, 200);
  assert.ok(status.body.snapshot, "debe existir snapshot");
  assert.equal(status.body.snapshot.checks.length >= 8, true);
  assert.equal(status.body.git.branches.length, 3);
  assert.equal(status.body.telegram.mode, "dry-run");
  assert.equal(status.body.bridge.online, false);

  const environmentSnapshot = status.body.snapshot.environments;
  assert.deepEqual(Object.keys(environmentSnapshot).sort(), ["develop", "local", "main"]);
  assert.equal(environmentSnapshot.local.branch, "desarrollo");
  assert.equal(environmentSnapshot.develop.branch, "develop");
  assert.equal(environmentSnapshot.main.branch, "main");
  assert.ok(environmentSnapshot.local.performance);
  assert.equal(typeof environmentSnapshot.local.performance.samples, "number");

  const environments = await call(base, "/api/environments");
  assert.equal(environments.status, 200);
  assert.deepEqual(Object.keys(environments.body.environments).sort(), ["develop", "local", "main"]);

  const performance = await call(base, "/api/performance");
  assert.equal(performance.status, 200);
  assert.equal(typeof performance.body.performance.local.samples, "number");
  assert.ok(performance.body.performance.develop);
  assert.ok(performance.body.performance.main);

  assert.ok(environmentSnapshot.local.health, "cada ambiente publica su indicador con umbrales");
  assert.equal(environmentSnapshot.local.health.thresholds.optimal, 85);
  assert.equal(environmentSnapshot.local.health.thresholds.risk, 60);
  assert.ok(Array.isArray(environmentSnapshot.local.recommendations), "cada ambiente publica sus acciones sugeridas");
  for (const recommendation of environmentSnapshot.local.recommendations) {
    assert.ok(recommendation.title && recommendation.action && recommendation.owner, "toda accion tiene titulo, paso y responsable");
    assert.ok(["alta", "media", "baja"].includes(recommendation.priority), "toda accion tiene prioridad");
  }

  // La historia medida viaja publicada: el navegador no reconstruye nada, pinta lo
  // que el anillo del servidor guardo en este sondeo.
  assert.equal(status.body.operation.gauges.length, 2, "la mesa del puesto publica sus dos medidores");
  for (const entry of status.body.operation.gauges) {
    assert.ok(Array.isArray(entry.series), `el medidor del puesto ${entry.key} publica su historia`);
    assert.equal(typeof entry.window, "number");
  }
  for (const [id, ambientes] of Object.entries(environmentSnapshot)) {
    for (const entry of ambientes.gauges) {
      assert.ok(Array.isArray(entry.series), `${id}/${entry.key} publica su historia`);
    }
    for (const component of ambientes.components || []) {
      assert.ok(Array.isArray(component.series), `${id}/componente ${component.key} publica su historia`);
    }
    const propias = status.body.snapshot.checks.filter((check) => String(check.environment || "local") === id);
    assert.ok(propias.length > 0, `${id} tiene sondas propias`);
    for (const check of propias) assert.ok(Array.isArray(check.series), `${id}/sonda ${check.id} publica su historia`);
    assert.equal(new Set(ambientes.gauges.map((entry) => entry.window)).size, 1, `${id} comparte ventana entre monitores`);
  }
  assert.ok(fs.existsSync(path.join(dataDir, "monitor-history.json")), "la historia se persiste para sobrevivir el reinicio");

  const tenantUnauthorized = await call(base, "/api/tenants/tenant-a/modules?environment=local");
  assert.equal(tenantUnauthorized.status, 401);
  const tenantWithoutScope = await call(base, "/api/tenants/tenant-a/modules?environment=local", { token: UI_TOKEN });
  assert.equal(tenantWithoutScope.status, 409, "sin lectura de empresas no se inventa el detalle");
  assert.ok(tenantWithoutScope.body.recommendation, "el bloqueo de empresas trae su accion de destrabe");
  assert.match(tenantWithoutScope.body.recommendation.owner, /apexos/);
  const invalidEnvironment = await call(base, "/api/tenants/tenant-a/modules?environment=orbita", { token: UI_TOKEN });
  assert.equal(invalidEnvironment.status, 400);
  assert.equal(invalidEnvironment.body.error, "AMBIENTE_INVALIDO");

  const forbiddenHost = await rawRequest(address.port, "evil.example");
  assert.equal(forbiddenHost, 403);

  const noAuth = await call(base, "/api/jobs", { method: "POST", body: { instruction: "analiza las colas", level: "N1" } });
  assert.equal(noAuth.status, 401);

  const created = await call(base, "/api/jobs", {
    method: "POST",
    token: UI_TOKEN,
    body: { instruction: "corrige el reintento de la cola de correo", level: "N2" }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.job.status, "awaiting_approval");
  const jobId = created.body.job.id;

  const approved = await call(base, `/api/jobs/${jobId}/approve`, { method: "POST", token: UI_TOKEN, body: {} });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.job.status, "queued");

  const bridgeUnauthorized = await call(base, "/api/bridge/register", { method: "POST", body: { bridgeId: "bridge-test" } });
  assert.equal(bridgeUnauthorized.status, 401);

  const registered = await call(base, "/api/bridge/register", { method: "POST", token: BRIDGE_TOKEN, body: { bridgeId: "bridge-test" } });
  assert.equal(registered.status, 200);
  assert.equal(registered.body.bridgeId, "bridge-test");

  const claimed = await call(base, "/api/bridge/claim", { method: "POST", token: BRIDGE_TOKEN, body: { bridgeId: "bridge-test" } });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.job.id, jobId);
  assert.equal(claimed.body.envelope.scope.branch, "desarrollo");
  assert.equal(claimed.body.envelope.scope.allowMerge, false);

  const completed = await call(base, `/api/bridge/jobs/${jobId}/complete`, {
    method: "POST",
    token: BRIDGE_TOKEN,
    body: {
      bridgeId: "bridge-test",
      status: "completed",
      summary: "Reintento corregido con prueba",
      evidence: ["docs/qa/evidence/demo.json"],
      tests: { passed: 4, failed: 0 }
    }
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.job.status, "completed");
  assert.deepEqual(completed.body.job.result.evidence, ["docs/qa/evidence/demo.json"]);

  const fetchWithoutConfirm = await call(base, "/api/actions/fetch", { method: "POST", token: UI_TOKEN, body: {} });
  assert.equal(fetchWithoutConfirm.status, 400);

  const pairing = await call(base, "/api/telegram/pairing-code", { method: "POST", token: UI_TOKEN, body: {} });
  assert.equal(pairing.status, 200);
  const code = pairing.body.pairing.code;

  await call(base, "/api/telegram/simulate", {
    method: "POST",
    token: UI_TOKEN,
    body: { text: `/pair ${code}`, chatId: "200" }
  });
  const telegramStatus = await call(base, "/api/telegram/simulate", {
    method: "POST",
    token: UI_TOKEN,
    body: { text: "/estado", chatId: "200" }
  });
  assert.equal(telegramStatus.status, 200);
  assert.ok(telegramStatus.body.outbox[0].text.includes("Estado:"));

  const down = await call(base, "/api/simulate/outage", {
    method: "POST",
    token: UI_TOKEN,
    body: { component: "api", status: "down" }
  });
  assert.equal(down.status, 200);
  assert.equal(down.body.snapshot.overall, "down");
  const alertsOpen = await call(base, "/api/alerts?open=1");
  assert.ok(alertsOpen.body.alerts.some((alert) => alert.component === "api" && !alert.resolvedAt));

  const telegramAfterAlert = await call(base, "/api/telegram");
  assert.ok(telegramAfterAlert.body.outbox.some((message) => message.text.includes("API APEXOS")));

  const remoteOutage = await call(base, "/api/simulate/outage", {
    method: "POST",
    token: UI_TOKEN,
    body: { component: "develop.api", status: "down" }
  });
  assert.equal(remoteOutage.status, 200);
  assert.equal(remoteOutage.body.snapshot.environments.develop.overall, "degraded");
  const remoteAlerts = await call(base, "/api/alerts?open=1");
  const developAlert = remoteAlerts.body.alerts.find((alert) => alert.component === "develop.api");
  assert.ok(developAlert, "debe abrir alerta del ambiente develop");
  assert.equal(developAlert.environment, "develop");
  assert.ok(developAlert.functional, "debe incluir impacto funcional");
  assert.ok(developAlert.technical, "debe incluir detalle tecnico");

  const recovered = await call(base, "/api/simulate", { method: "DELETE", token: UI_TOKEN });
  assert.equal(recovered.status, 200);
  const alertsAfter = await call(base, "/api/alerts?open=1");
  assert.equal(alertsAfter.body.alerts.some((alert) => alert.component === "api"), false);

  const jobs = await call(base, "/api/jobs");
  assert.equal(jobs.status, 200);
  assert.equal(jobs.body.stats.counts.completed >= 1, true);

  const events = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      request.destroy();
      reject(new Error("SSE sin frame ready"));
    }, 5000);
    const request = http.get(`${base}/api/events?token=${encodeURIComponent(UI_TOKEN)}`, (response) => {
      let buffer = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        buffer += chunk;
        if (buffer.includes('"type":"ready"')) {
          clearTimeout(timer);
          request.destroy();
          resolve(buffer);
        }
      });
      response.on("error", reject);
    });
    request.on("error", (error) => {
      if (error.code === "ECONNRESET") return;
      clearTimeout(timer);
      reject(error);
    });
  });
  assert.match(events, /"type":"ready"/);
});
