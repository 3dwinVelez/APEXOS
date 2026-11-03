#!/usr/bin/env node
/* Certificacion local de APEX Control F0.
 * Requiere: API y web locales corriendo, Docker con los servicios de
 * infra/docker-compose.yml y Chrome instalado.
 * Nunca corre contra QA ni produccion: exige APP_ENV=local y DATABASE_URL local.
 */
"use strict";

process.env.APP_ENV = process.env.APP_ENV || "local";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { WebSocket } = require("ws");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "../..");
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const outputDir = path.resolve(outputArg ? outputArg.slice(9) : path.join(root, "docs/qa/evidence/apex-control-f0"));
const certificationFile = path.join(outputDir, "certification.json");
const composeFile = path.join(root, "infra/docker-compose.yml");
const checks = [];

function blocked(message) {
  throw new Error(`BLOQUEADO: ${message}`);
}

function localUrl(name, value) {
  let parsed = null;
  try {
    parsed = new URL(value);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    blocked(`${name} debe ser una URL http local (localhost o 127.0.0.1).`);
  }
  return String(value).replace(/\/+$/, "");
}

function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`CHECK FALLIDO: ${name} ${JSON.stringify(detail)}`);
}

function redact(databaseUrl) {
  try {
    return new URL(databaseUrl).pathname.slice(1) || "unknown";
  } catch {
    return "unknown";
  }
}

if (String(process.env.APP_ENV).toLowerCase() !== "local") {
  blocked("APP_ENV debe ser local para certificar APEX Control F0.");
}
const databaseUrl = String(process.env.DATABASE_URL || "");
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl)) {
  blocked("DATABASE_URL debe apuntar a PostgreSQL local.");
}

const apiUrl = localUrl("LOCAL_API_URL", process.env.LOCAL_API_URL || "http://127.0.0.1:3000");
const webUrl = localUrl("LOCAL_WEB_URL", process.env.LOCAL_WEB_URL || "http://127.0.0.1:3001");
const adminEmail = process.env.CERT_ADMIN_EMAIL || "demo@apex.local";
const adminPassword = process.env.CERT_ADMIN_PASSWORD || "test1234";
const chromePath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function compose(action, service) {
  // El arranque usa --no-deps para no exigir pgbouncer/api: la certificacion
  // solo necesita el ciclo de vida del servicio observado.
  const args = action === "start"
    ? ["compose", "-f", composeFile, "up", "-d", "--no-deps", service]
    : ["compose", "-f", composeFile, action, service];
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, OFFLINE_CERT_DB_PASSWORD: process.env.OFFLINE_CERT_DB_PASSWORD || "offline-cert-local" }
  });
}

async function request(pathname, { method = "GET", token, body, root = false } = {}) {
  const response = await fetch(`${root ? apiUrl : `${apiUrl}/api/v1`}${pathname}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 300) };
  }
  return { status: response.status, body: payload };
}

async function waitFor(label, fn, timeoutMs, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`TIEMPO AGOTADO esperando ${label}`);
}

function componentOf(status, key) {
  return (status?.components || []).find((component) => component.key === key) || null;
}

async function waitForComponent(token, key, expected, timeoutMs = 45000) {
  return waitFor(`${key}=${expected}`, async () => {
    const response = await request("/apex-control/status", { token });
    if (response.status !== 200) return null;
    const component = componentOf(response.body, key);
    return component?.status === expected ? response.body : null;
  }, timeoutMs);
}

async function waitForOpenIncident(token, componentKey, timeoutMs = 45000) {
  return waitFor(`incidente abierto de ${componentKey}`, async () => {
    const response = await request("/apex-control/incidents?status=active&limit=50", { token });
    if (response.status !== 200) return null;
    return (response.body || []).find((incident) => incident.component_key === componentKey) || null;
  }, timeoutMs);
}

function openSocket(token, companyId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${apiUrl.replace(/^http/, "ws")}/apex-control/live`);
    const messages = [];
    const waiters = [];
    const push = (message) => {
      messages.push(message);
      for (const waiter of [...waiters]) {
        if (waiter.predicate(message)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve(message);
        }
      }
    };
    const timer = setTimeout(() => reject(new Error("WebSocket de APEX Control no respondio a tiempo")), 15000);
    socket.on("open", () => socket.send(JSON.stringify({ type: "authenticate", token, company_id: companyId })));
    socket.on("message", (raw) => {
      try {
        push(JSON.parse(String(raw)));
      } catch {
        // Mensaje no JSON se ignora.
      }
    });
    socket.on("error", (error) => reject(error));
    socket.on("close", (code) => {
      if (code >= 4000) reject(new Error(`WebSocket cerrado con codigo ${code}`));
    });
    const api = {
      messages,
      waitFor(predicate, timeoutMs = 45000) {
        const existing = messages.find(predicate);
        if (existing) return Promise.resolve(existing);
        return new Promise((resolveWaiter, rejectWaiter) => {
          const waiter = { predicate, resolve: resolveWaiter };
          waiters.push(waiter);
          setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            rejectWaiter(new Error("Tiempo agotado esperando mensaje WebSocket"));
          }, timeoutMs);
        });
      },
      close() {
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          // Cierre best-effort.
        }
      }
    };
    api.waitFor((message) => message.type === "apex-control:ready", 15000)
      .then(() => {
        clearTimeout(timer);
        resolve(api);
      })
      .catch(reject);
  });
}

async function waitForCardStatus(page, name, expected, timeoutMs = 45000) {
  await page.waitForFunction((cardName, label) => {
    const cards = [...document.querySelectorAll(".apex-section-card")];
    const card = cards.find((item) => item.textContent?.includes(cardName));
    return Boolean(card?.textContent?.includes(label));
  }, { timeout: timeoutMs, polling: 1000 }, name, expected);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const startedAt = new Date().toISOString();
  let browser = null;
  let socket = null;
  let redisStopped = false;
  let brainStopped = false;
  let loginToken = "";
  let tenantId = "";
  let commit = "unknown";

  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    const health = await request("/health", { root: true });
    check("api_health", health.status === 200 && health.body?.status === "OK", { status: health.status });

    const login = await request("/auth/login", { method: "POST", body: { email: adminEmail, password: adminPassword } });
    check("admin_login", login.status === 200 && Boolean(login.body?.token), { status: login.status });
    loginToken = login.body.token;
    tenantId = login.body.tenant?.id || login.body.user?.tenant_id || "";

    const initial = await waitFor("primer pulso de salud", async () => {
      const response = await request("/apex-control/status", { token: loginToken });
      if (response.status !== 200) return null;
      const sampled = (response.body.components || []).filter((component) => component.sampled_at).length;
      return sampled >= 9 ? response.body : null;
    }, 60000);
    check("status_contract", initial.components.length >= 9 && ["ok", "degraded", "down", "unknown"].includes(initial.status), {
      status: initial.status,
      components: initial.components.length
    });
    check("components_registered", ["api", "db", "redis", "queues", "crons", "brain", "minio", "mail", "websocket"].every((key) => componentOf(initial, key)), {
      keys: initial.components.map((component) => component.key)
    });

    socket = await openSocket(loginToken, tenantId);
    check("websocket_authenticated", socket.messages.some((message) => message.type === "apex-control:ready"), { messages: socket.messages.length });

    if (!fs.existsSync(chromePath)) throw new Error(`Chrome no encontrado en ${chromePath}. Define CHROME_BIN.`);
    browser = await puppeteer.launch({ executablePath: chromePath, headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // El favicon ausente es ruido del shell, no un error de la Torre.
      const resource = message.location()?.url || "";
      if (/favicon\.ico/.test(resource) || /favicon\.ico/.test(message.text())) return;
      consoleErrors.push(message.text());
    });
    await page.evaluateOnNewDocument((session) => {
      for (const [key, value] of Object.entries(session)) localStorage.setItem(key, value);
    }, {
      token: loginToken,
      refresh: login.body.refresh || "",
      auth_provider: "password",
      tenant_active_modules: JSON.stringify(login.body.tenant?.active_modules || ["administracion_apex"]),
      apexos_company_id: tenantId,
      apexos_company_name: login.body.tenant?.name || "APEX Local",
      role_name: login.body.user?.role?.name || "APEX_ADMIN",
      role_permissions: JSON.stringify(login.body.user?.role?.permissions || []),
      role_metadata: JSON.stringify(login.body.user?.role?.metadata || {})
    });
    await page.goto(`${webUrl}/dashboard/apex-control`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForFunction(() => document.body.textContent?.includes("Torre de Control"), { timeout: 30000 });
    await page.screenshot({ path: path.join(outputDir, "browser-overview.png"), fullPage: true });
    check("browser_overview", consoleErrors.length === 0, { console_errors: consoleErrors });

    redisStopped = true;
    compose("stop", "redis");
    const degraded = await waitForComponent(loginToken, "redis", "down", 45000);
    const redisIncident = await waitForOpenIncident(loginToken, "redis", 45000);
    check("redis_down_visible", degraded.status === "degraded", { overall: degraded.status, redis: componentOf(degraded, "redis")?.status });
    check("redis_incident_open", redisIncident.status === "open", { id: redisIncident.id, title: redisIncident.title });
    const event = await socket.waitFor((message) => message.type === "apex-control:event" && message.data?.component_key === "redis", 45000);
    check("redis_event_broadcast", Boolean(event), { kind: event.data.kind, fingerprint: event.data.fingerprint });

    await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
    await waitForCardStatus(page, "Redis", "Caído", 45000);
    await page.screenshot({ path: path.join(outputDir, "browser-degraded.png"), fullPage: true });
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim().startsWith("Acusar"));
      if (!button) return false;
      button.click();
      return true;
    });
    check("browser_acknowledge_clicked", clicked, { visible: clicked });
    await page.waitForFunction(() => document.body.textContent?.includes("Acusado"), { timeout: 15000 });
    check("browser_acknowledge_confirmed", true, {});

    compose("start", "redis");
    redisStopped = false;
    const recovered = await waitForComponent(loginToken, "redis", "ok", 45000);
    check("redis_recovered", recovered.status !== "down", { overall: recovered.status, redis: componentOf(recovered, "redis")?.status });
    await waitFor("incidente de Redis resuelto", async () => {
      const response = await request("/apex-control/incidents?status=all&limit=50", { token: loginToken });
      return (response.body || []).some((incident) => incident.component_key === "redis" && incident.status === "resolved");
    }, 45000);

    brainStopped = true;
    compose("stop", "brain");
    const brainDown = await waitForComponent(loginToken, "brain", "down", 45000);
    check("brain_down_visible", componentOf(brainDown, "brain")?.status === "down", { overall: brainDown.status });
    compose("start", "brain");
    brainStopped = false;
    const brainUp = await waitForComponent(loginToken, "brain", "ok", 60000);
    check("brain_recovered", componentOf(brainUp, "brain")?.status === "ok", {});

    const simulation = await request("/apex-control/_simulate/failure", { method: "POST", token: loginToken, body: {} });
    if (simulation.status === 404) {
      throw new Error("La simulacion 5xx esta deshabilitada: inicia el API con APP_ENV=local y APEX_CONTROL_SIMULATION_ENABLED=true.");
    }
    check("simulation_returns_500", simulation.status === 500, { status: simulation.status, body: simulation.body });
    const simulatedEvent = await waitFor("evento de simulacion", async () => {
      const response = await request("/apex-control/events?limit=50", { token: loginToken });
      return (response.body?.events || []).find((item) => item.kind === "simulation.failure") || null;
    }, 20000);
    check("simulation_event_persisted", simulatedEvent.severity === "error", { id: simulatedEvent.id });

    const preview = await request("/apex-control/reports/daily/preview", { method: "POST", token: loginToken, body: {} });
    check("daily_report_preview", preview.status === 200 && preview.body?.overall, { status: preview.status, overall: preview.body?.overall });
    fs.writeFileSync(path.join(outputDir, "daily-report.json"), `${JSON.stringify(preview.body, null, 2)}\n`);

    const result = {
      certification: "apex-control-local",
      version: 1,
      status: "passed",
      certification_status: "local_passed_qa_pending",
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      commit,
      environment: { type: "local", database: redact(databaseUrl), api: apiUrl, web: webUrl, node: process.version },
      checks,
      summary: {
        components: initial.components.length,
        incidents_detected: 2,
        websocket_messages: socket.messages.length,
        console_errors: consoleErrors.length
      },
      evidence: ["certification.json", "browser-overview.png", "browser-degraded.png", "daily-report.json"]
    };
    fs.writeFileSync(certificationFile, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const result = {
      certification: "apex-control-local",
      version: 1,
      status: "failed",
      certification_status: "blocked_local_environment",
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      commit,
      environment: { type: "local", database: redact(databaseUrl), api: apiUrl, web: webUrl, node: process.version },
      error: error.message,
      checks
    };
    fs.writeFileSync(certificationFile, `${JSON.stringify(result, null, 2)}\n`);
    throw error;
  } finally {
    if (brainStopped) {
      try { compose("start", "brain"); } catch (error) { console.error(`[cert] no se pudo reiniciar brain: ${error.message}`); }
    }
    if (redisStopped) {
      try { compose("start", "redis"); } catch (error) { console.error(`[cert] no se pudo reiniciar redis: ${error.message}`); }
    }
    if (socket) socket.close();
    if (browser) await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
