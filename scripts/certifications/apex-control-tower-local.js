"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const TOWER_DIR = path.join(ROOT, "apps", "control-tower");
const EVIDENCE_DIR = path.join(ROOT, "docs", "qa", "evidence", "apex-control-tower-f1");
const UI_TOKEN = "cert-ui-token";
const BRIDGE_TOKEN = "cert-bridge-token";
const ALLOWED_CHAT = "cert-chat";

const { createTower } = require(path.join(TOWER_DIR, "server.js"));

const startedAt = new Date().toISOString();
const checks = [];
const consoleErrors = [];
const screenshots = [];
let tower = null;
let chrome = null;
let dataDir = null;

function record(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` -> ${JSON.stringify(detail)}`}`);
  return Boolean(ok);
}

function assert(name, condition, detail = {}) {
  return record(name, condition, condition ? detail : detail);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(base, route, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text };
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function waitFor(fn, timeoutMs = 15000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || "CDP error"));
        else resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  onMessage(listener) {
    this.listeners.add(listener);
  }

  send(method, params = {}, timeoutMs = 20000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "evaluate error");
    }
    return result.result ? result.result.value : undefined;
  }

  async screenshot(file) {
    const result = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true });
    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    const size = fs.statSync(file).size;
    screenshots.push({ file: path.basename(file), bytes: size });
    return size;
  }
}

async function launchChrome(binary) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "tower-cert-chrome-"));
  const child = spawn(binary, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--window-size=1600,1100",
    "about:blank"
  ], { stdio: "ignore" });

  const portFile = path.join(profileDir, "DevToolsActivePort");
  const port = await waitFor(() => {
    if (!fs.existsSync(portFile)) return null;
    const value = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
    return Number.isInteger(value) && value > 0 ? value : null;
  }, 20000);
  if (!port) throw new Error("Chrome no expuso DevToolsActivePort");

  const target = await waitFor(async () => {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return list.find((item) => item.type === "page" && item.webSocketDebuggerUrl) || null;
    } catch {
      return null;
    }
  }, 10000);
  if (!target) throw new Error("Chrome sin pagina depurable");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("No se pudo abrir WebSocket CDP")), { once: true });
  });
  const cdp = new Cdp(socket);
  cdp.onMessage((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params && message.params.exceptionDetails ? message.params.exceptionDetails : {};
      consoleErrors.push(details.exception ? details.exception.description || details.text : details.text || "excepcion");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      consoleErrors.push(message.params.entry.text || "log error");
    }
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  return { child, cdp, profileDir, port };
}

async function closeChrome(instance) {
  if (!instance) return;
  try {
    await instance.cdp.send("Browser.close", {}, 5000);
  } catch {
    // ignore
  }
  try {
    instance.child.kill();
  } catch {
    // ignore
  }
  await sleep(500);
  try {
    fs.rmSync(instance.profileDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function commitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    return null;
  }
}

function workingTreeDirty() {
  try {
    return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString().trim().length > 0;
  } catch {
    return null;
  }
}

async function run() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tower-cert-data-"));

  const binary = chromePath();
  record("chrome_available", Boolean(binary), { path: binary || "no encontrado" });

  tower = createTower({
    dataDir,
    pollMs: 4000,
    simulation: true,
    uiToken: UI_TOKEN,
    bridge: { token: BRIDGE_TOKEN },
    telegram: { mode: "dry-run", allowedChatIds: [ALLOWED_CHAT] },
    git: { remoteEnabled: false }
  });
  const address = await tower.start({ port: 0 });
  const base = address.url;
  record("tower_boot", true, { url: base, port: address.port });

  const health = await request(base, "/api/health");
  assert("api_health", health.status === 200 && health.body.ok === true, { status: health.status });

  const status = await request(base, "/api/status");
  const snapshot = status.body && status.body.snapshot;
  assert("status_contract", status.status === 200 && snapshot && snapshot.checks.length >= 8, {
    overall: snapshot ? snapshot.overall : null,
    checks: snapshot ? snapshot.checks.length : 0
  });
  assert("git_three_branches", Boolean(status.body && status.body.git && status.body.git.branches.length === 3), {
    branches: status.body && status.body.git ? status.body.git.branches.map((branch) => branch.name) : []
  });
  assert("git_flow_reported", Boolean(status.body && status.body.git && Array.isArray(status.body.git.flow) && status.body.git.flow.length >= 1), {
    flow: status.body && status.body.git ? status.body.git.flow : []
  });
  assert("ui_token_configured", status.body && status.body.config && status.body.config.uiTokenConfigured === true, {});
  assert("environment_summaries", Boolean(
    snapshot &&
    snapshot.environments &&
    snapshot.environments.local &&
    snapshot.environments.develop &&
    snapshot.environments.main &&
    snapshot.environments.local.branch === "desarrollo" &&
    snapshot.environments.develop.branch === "develop" &&
    snapshot.environments.main.branch === "main"
  ), {
    environments: snapshot && snapshot.environments ? Object.keys(snapshot.environments) : []
  });

  const environments = await request(base, "/api/environments");
  assert("environments_endpoint", environments.status === 200 && Boolean(environments.body.environments.local && environments.body.environments.develop && environments.body.environments.main), {
    status: environments.status
  });

  const performance = await request(base, "/api/performance");
  assert("performance_endpoint", performance.status === 200 && performance.body.performance.local && performance.body.performance.local.samples >= 1, {
    samples: performance.body && performance.body.performance.local ? performance.body.performance.local.samples : 0
  });

  const unauthorized = await request(base, "/api/jobs", { method: "POST", body: { instruction: "analiza las colas", level: "N1" } });
  assert("ui_token_required", unauthorized.status === 401, { status: unauthorized.status });

  const created = await request(base, "/api/jobs", {
    method: "POST",
    token: UI_TOKEN,
    body: { instruction: "certificacion: corrige el reintento de la cola de correo", level: "N2" }
  });
  assert("factory_create_n2", created.status === 201 && created.body.job.status === "awaiting_approval", {
    id: created.body && created.body.job ? created.body.job.id : null
  });
  const jobId = created.body.job.id;

  const approved = await request(base, `/api/jobs/${jobId}/approve`, { method: "POST", token: UI_TOKEN, body: {} });
  assert("factory_approve", approved.status === 200 && approved.body.job.status === "queued", { status: approved.body.job.status });

  const bridgeDenied = await request(base, "/api/bridge/register", { method: "POST", body: { bridgeId: "cert-bridge" } });
  assert("bridge_token_required", bridgeDenied.status === 401, { status: bridgeDenied.status });

  await request(base, "/api/bridge/register", { method: "POST", token: BRIDGE_TOKEN, body: { bridgeId: "cert-bridge" } });
  const claimed = await request(base, "/api/bridge/claim", { method: "POST", token: BRIDGE_TOKEN, body: { bridgeId: "cert-bridge" } });
  assert("bridge_claim_envelope", claimed.status === 200 && claimed.body.job && claimed.body.envelope.scope.branch === "desarrollo" && claimed.body.envelope.scope.allowPush === false, {
    job: claimed.body && claimed.body.job ? claimed.body.job.id : null,
    scope: claimed.body ? claimed.body.envelope && claimed.body.envelope.scope : null
  });

  const completed = await request(base, `/api/bridge/jobs/${jobId}/complete`, {
    method: "POST",
    token: BRIDGE_TOKEN,
    body: {
      bridgeId: "cert-bridge",
      status: "completed",
      summary: "Certificacion del puente con evidencia",
      evidence: ["docs/qa/evidence/apex-control-tower-f1/certification.json"],
      tests: { passed: 21, failed: 0 }
    }
  });
  assert("bridge_complete", completed.status === 200 && completed.body.job.status === "completed", { status: completed.body && completed.body.job ? completed.body.job.status : null });

  const pairing = await request(base, "/api/telegram/pairing-code", { method: "POST", token: UI_TOKEN, body: {} });
  assert("telegram_pairing_code", pairing.status === 200 && /^\d{6}$/.test(pairing.body.pairing.code), { expiresAt: pairing.body.pairing.expiresAt });
  const code = pairing.body.pairing.code;

  await request(base, "/api/telegram/simulate", { method: "POST", token: UI_TOKEN, body: { text: "/estado", chatId: "intruso" } });
  const denied = await request(base, "/api/telegram");
  assert("telegram_allowlist", denied.body.outbox[0] && /no autorizado/i.test(denied.body.outbox[0].text), {});

  await request(base, "/api/telegram/simulate", { method: "POST", token: UI_TOKEN, body: { text: `/pair ${code}`, chatId: "intruso" } });
  await request(base, "/api/telegram/simulate", { method: "POST", token: UI_TOKEN, body: { text: "/estado", chatId: "intruso" } });
  const paired = await request(base, "/api/telegram");
  assert("telegram_command_status", Boolean(paired.body.outbox[0] && /Estado:/.test(paired.body.outbox[0].text)), { allowedCount: paired.body.telegram.allowedCount });

  const impl = await request(base, "/api/telegram/simulate", {
    method: "POST",
    token: UI_TOKEN,
    body: { text: "/impl certificacion: agrega prueba de regresion al monitor", chatId: "intruso" }
  });
  const pendingJob = impl.body.jobs.counts.awaiting_approval >= 1;
  assert("telegram_impl_requires_approval", pendingJob, { stats: impl.body.jobs.counts });

  let browserError = null;
  if (binary) {
    try {
      chrome = await launchChrome(binary);
      await chrome.cdp.send("Page.navigate", { url: base });
      const rendered = await waitFor(
        () => chrome.cdp.evaluate(`document.querySelectorAll('.check').length >= 8 && document.querySelectorAll('.metric-tile').length >= 8 && Boolean(document.querySelector('#health [aria-label^="Salud "]'))`),
        15000
      );
      assert("browser_dashboard_rendered", Boolean(rendered), {
        checks: await chrome.cdp.evaluate(`document.querySelectorAll('.check').length`),
        kpis: await chrome.cdp.evaluate(`document.querySelectorAll('.metric-tile').length`),
        gauge: await chrome.cdp.evaluate(`Boolean(document.querySelector('#health [aria-label^="Salud "]'))`)
      });
      await waitFor(() => chrome.cdp.evaluate(`document.getElementById('livePill').textContent.includes('SSE en vivo')`), 8000);
      const size = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-overview.png"));
      assert("browser_dashboard_screenshot", size > 20000, { bytes: size });

      const tabs = await chrome.cdp.evaluate(`document.querySelectorAll('.env-tab').length`);
      assert("browser_environment_tabs", tabs === 3, { tabs });
      // Ramas, sondas y rendimiento viven en la vista Detalle.
      await chrome.cdp.evaluate(`document.querySelector('[data-view="detail"]').click()`);
      const detailReady = await waitFor(
        () => chrome.cdp.evaluate(`document.querySelectorAll('.branch').length === 3 && document.querySelectorAll('details.tech').length >= 8 && document.querySelectorAll('.perf-stat').length >= 8`),
        8000
      );
      const technicalDetails = await chrome.cdp.evaluate(`document.querySelectorAll('details.tech').length`);
      assert("browser_technical_details", detailReady && technicalDetails >= 8, { details: technicalDetails });
      // El panel de rendimiento siempre trae los 8 estadisticos historicos; la telemetria
      // de proceso del /health agrega memoria/uso encima cuando el API la publica.
      const performanceStats = await chrome.cdp.evaluate(`document.querySelectorAll('.perf-stat').length`);
      const apiHealth = await request("http://127.0.0.1:3000", "/health");
      const runtimePublished = Boolean(apiHealth.body && apiHealth.body.memory_mb);
      const runtimeRendered = await chrome.cdp.evaluate(
        `["Memoria RSS","Peticiones","Consultas lentas"].every((label) => Array.from(document.querySelectorAll(".perf-stat")).some((node) => node.textContent.includes(label)))`
      );
      assert("browser_performance_panel", performanceStats >= 8, {
        stats: performanceStats,
        runtimePublished,
        runtimeRendered,
        required: runtimePublished ? "telemetria de proceso visible" : "8 estadisticos base"
      });
      if (runtimePublished) {
        assert("browser_performance_runtime_telemetry", runtimeRendered === true && performanceStats > 8, {
          stats: performanceStats,
          rss: await chrome.cdp.evaluate(`(Array.from(document.querySelectorAll(".perf-stat")).find((node) => node.textContent.includes("Memoria RSS")) || {}).textContent || null`)
        });
      }

      await chrome.cdp.evaluate(`document.querySelector('[data-env="main"]').click()`);
      const mainTab = await waitFor(
        () => chrome.cdp.evaluate(`document.getElementById('overallPill').textContent.includes('PROD') && document.querySelectorAll('.cloud-card').length === 3`),
        8000
      );
      assert("browser_environment_switch", Boolean(mainTab), {
        pill: await chrome.cdp.evaluate(`document.getElementById('overallPill').textContent`),
        cloudCards: await chrome.cdp.evaluate(`document.querySelectorAll('.cloud-card').length`),
        selectedBranch: await chrome.cdp.evaluate(`document.querySelectorAll('.branch.selected').length`)
      });
      const mainSize = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-env-main.png"));
      assert("browser_environment_screenshot", mainSize > 20000, { bytes: mainSize });
      await chrome.cdp.evaluate(`document.querySelector('[data-env="local"]').click()`);
      await waitFor(() => chrome.cdp.evaluate(`document.getElementById('overallPill').textContent.includes('LOCAL')`), 5000);
    } catch (error) {
      browserError = error;
      record("browser_dashboard_rendered", false, { error: String(error.message || error) });
    }
  }

  const outage = await request(base, "/api/simulate/outage", { method: "POST", token: UI_TOKEN, body: { component: "api", status: "down" } });
  assert("outage_visible", outage.status === 200 && outage.body.snapshot.overall === "down", { overall: outage.body && outage.body.snapshot ? outage.body.snapshot.overall : null });

  const openAlerts = await request(base, "/api/alerts?open=1");
  const apiAlert = (openAlerts.body.alerts || []).find((alert) => alert.component === "api" && !alert.resolvedAt);
  assert("alert_opened", Boolean(apiAlert), { alerts: (openAlerts.body.alerts || []).map((alert) => alert.component) });

  const telegramAfterAlert = await request(base, "/api/telegram");
  assert("telegram_alert_sent", (telegramAfterAlert.body.outbox || []).some((message) => /API APEXOS/.test(message.text)), {
    outbox: (telegramAfterAlert.body.outbox || []).slice(0, 2).map((message) => message.text.split("\n")[0])
  });

  const remoteOutage = await request(base, "/api/simulate/outage", { method: "POST", token: UI_TOKEN, body: { component: "develop.api", status: "down" } });
  const developAlert = ((await request(base, "/api/alerts?open=1")).body.alerts || []).find((alert) => alert.component === "develop.api");
  assert("alert_environment_detail", Boolean(
    remoteOutage.status === 200 &&
    remoteOutage.body.snapshot.environments.develop.overall === "degraded" &&
    developAlert &&
    developAlert.environment === "develop" &&
    developAlert.functional &&
    developAlert.technical
  ), {
    overall: remoteOutage.body && remoteOutage.body.snapshot ? remoteOutage.body.snapshot.environments.develop.overall : null,
    environment: developAlert ? developAlert.environment : null,
    technical: Boolean(developAlert && developAlert.technical)
  });

  if (chrome && !browserError) {
    const degraded = await waitFor(() => chrome.cdp.evaluate(`document.querySelectorAll('.alert').length > 0 && document.getElementById('overallPill').textContent.includes('Caído')`), 10000);
    assert("browser_degraded_rendered", Boolean(degraded), {
      overall: await chrome.cdp.evaluate(`document.getElementById('overallPill').textContent`),
      alerts: await chrome.cdp.evaluate(`document.querySelectorAll('.alert').length`)
    });
    const size = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-api-down.png"));
    assert("browser_degraded_screenshot", size > 20000, { bytes: size });
  }

  const recovered = await request(base, "/api/simulate", { method: "DELETE", token: UI_TOKEN });
  await sleep(500);
  const openAfter = await request(base, "/api/alerts?open=1");
  assert("recovery_resolved", recovered.status === 200 && !(openAfter.body.alerts || []).some((alert) => alert.component === "api"), {
    open: (openAfter.body.alerts || []).map((alert) => alert.component)
  });

  if (chrome && !browserError) {
    await waitFor(() => chrome.cdp.evaluate(`!document.getElementById('overallPill').textContent.includes('Caído')`), 8000).catch(() => {});
    assert("browser_console_clean", consoleErrors.length === 0, { errors: consoleErrors.slice(0, 5) });
  }

  const history = await request(base, "/api/jobs");
  assert("jobs_traceable", history.body.stats.counts.completed >= 1 && history.body.stats.counts.awaiting_approval >= 1, history.body.stats.counts);

  const telegramEvidence = {
    generated_at: new Date().toISOString(),
    mode: "dry-run",
    allowed_chat_ids: [ALLOWED_CHAT],
    outbox: (telegramAfterAlert.body.outbox || []).slice(0, 30).map((message) => ({
      at: message.at,
      chatId: message.chatId,
      text: message.text,
      dryRun: Boolean(message.dryRun)
    }))
  };
  fs.writeFileSync(path.join(EVIDENCE_DIR, "telegram-outbox.json"), `${JSON.stringify(telegramEvidence, null, 2)}\n`, "utf8");
  record("telegram_evidence", true, { messages: telegramEvidence.outbox.length });
}

async function main() {
  let fatal = null;
  try {
    await run();
  } catch (error) {
    fatal = error;
    record("certification_error", false, { error: String(error && error.message ? error.message : error) });
  } finally {
    await closeChrome(chrome);
    if (tower) {
      try {
        await tower.stop();
      } catch {
        // ignore
      }
    }
    if (dataDir) {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.filter((check) => !check.ok).length;
  const status = failed === 0 && !fatal ? "passed" : "failed";
  const certification = {
    certification: "apex-control-tower-local",
    version: 1,
    status,
    certification_status: status === "passed" ? "local_passed_qa_pending" : "blocked",
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    commit: commitSha(),
    working_tree_dirty: workingTreeDirty(),
    environment: {
      type: "local",
      node: process.version,
      chrome: chromePath() || "no disponible",
      tower_url: tower ? `http://127.0.0.1:${tower.server ? tower.server.address().port : 0}` : null,
      mode: "simulation+dry-run",
      telegram: "dry-run",
      bridge: "local-token"
    },
    checks,
    summary: {
      passed,
      failed,
      total: checks.length,
      screenshots,
      console_errors: consoleErrors.slice(0, 10)
    },
    evidence: [
      "certification.json",
      "tower-overview.png",
      "tower-env-main.png",
      "tower-api-down.png",
      "telegram-outbox.json"
    ]
  };
  fs.writeFileSync(path.join(EVIDENCE_DIR, "certification.json"), `${JSON.stringify(certification, null, 2)}\n`, "utf8");
  console.log(`\nCertificacion ${status}: ${passed}/${checks.length} verificaciones.`);
  console.log(`Evidencia: ${EVIDENCE_DIR}`);
  process.exit(status === "passed" ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
