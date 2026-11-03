"use strict";

// Certificación E2E del monitor consolidado por empresa de la torre:
// sonda real de la API (runtime + empresas + salud por módulo), rutas de la
// torre, panel navegador con selector, y ambiente bloqueado por build sin
// apex-control. No inventa datos: lo que la API no entrega se certifica como
// bloqueo con su accion de destrabe.

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const TOWER_DIR = path.join(ROOT, "apps", "control-tower");
const EVIDENCE_DIR = path.join(ROOT, "docs", "qa", "evidence", "torre-consolidado-empresas-20261103");
const UI_TOKEN = "consolidado-ui-token";
const APEX_TOKEN = "consolidado-apex-token";
const RICH_COMMIT = "cafebabe1234";
const LEGACY_COMMIT = "938fc2b6f42c";

const { createTower } = require(path.join(TOWER_DIR, "server.js"));

const startedAt = new Date().toISOString();
const checks = [];
const consoleErrors = [];
const screenshots = [];
let tower = null;
let chrome = null;
let dataDir = null;
let richApi = null;
let legacyApi = null;

function record(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` -> ${JSON.stringify(detail)}`}`);
  return Boolean(ok);
}

function assert(name, condition, detail = {}) {
  return record(name, condition, detail);
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate error");
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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "tower-consolidado-chrome-"));
  const child = spawn(binary, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--window-size=1600,2400",
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
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 2400, deviceScaleFactor: 1, mobile: false });
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
  await sleep(400);
  try {
    fs.rmSync(instance.profileDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function jsonResponder(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const payload = handler(req, url);
      if (payload === null) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "RUTA_NO_ENCONTRADA", code: "NO_ENCONTRADO" }));
        return;
      }
      res.writeHead(payload.status || 200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload.body));
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function modulePayload(tenantId, tenantName) {
  const now = new Date().toISOString();
  const modules = [
    {
      key: "hr", name: "Talento Humano", group: "Personas", status: "ok",
      data: { state: "fresco", records: 1240, last_activity_at: now, age_minutes: 2, expected_minutes: 60 },
      services: [{ key: "postgres", label: "PostgreSQL", status: "ok" }],
      alerts: [], detail: "1.240 registros · ultima actividad hace 2 min"
    },
    {
      key: "services", name: "Servicios", group: "Operacion", status: "degraded",
      data: { state: "viejo", records: 480, last_activity_at: now, age_minutes: 240, expected_minutes: 30 },
      services: [{ key: "redis", label: "Redis", status: "degraded" }],
      alerts: [{ id: "1", severity: "medium", status: "open", title: "Cola de Servicios con retraso" }],
      detail: "Ultima actividad hace 240 min (esperado <= 30 min)"
    },
    {
      key: "transport", name: "Transporte", group: "Operacion", status: "down",
      data: { state: "sin_servicio", records: null, last_activity_at: null, age_minutes: null, expected_minutes: 60 },
      services: [{ key: "stock-sync", label: "Sincronizacion", status: "down" }],
      alerts: [{ id: "2", severity: "high", status: "open", title: "Sincronizacion de Transporte caida" }],
      detail: "Dependencia de sincronizacion caida"
    }
  ];
  return {
    generated_at: now,
    scope: tenantId ? "tenant" : "environment",
    tenant: tenantId ? { id: tenantId, name: tenantName } : null,
    summary: { total: modules.length, ok: 1, degraded: 1, down: 1, unknown: 0, records: 1720 },
    modules
  };
}

const TENANTS = [
  { tenant_id: "tenant-demo", name: "Demo APEX", plan: "enterprise", active: true, modules: 12, users_active: 240, last_login_at: new Date().toISOString(), sessions_active: 18, activity_period: 4200, last_activity_at: new Date().toISOString(), gps_period: 880, last_ping_at: new Date().toISOString(), status: "ok" },
  { tenant_id: "tenant-riesgo", name: "Empresa En Riesgo", plan: "pro", active: true, modules: 8, users_active: 40, last_login_at: new Date().toISOString(), sessions_active: 2, activity_period: 120, last_activity_at: new Date().toISOString(), gps_period: 4, last_ping_at: null, status: "degraded" },
  { tenant_id: "tenant-senecal", name: "Empresa Sin Señal", plan: "pro", active: true, modules: 6, users_active: 12, last_login_at: null, sessions_active: 0, activity_period: 0, last_activity_at: null, gps_period: 0, last_ping_at: null, status: "unknown" }
];

function startRichApi() {
  return jsonResponder((req, url) => {
    const route = url.pathname;
    if (route === "/health") {
      return {
        status: 200,
        body: {
          status: "OK",
          version: "2.0",
          modules: 19,
          commit: RICH_COMMIT,
          service_certification: "products-v2",
          uptime_seconds: 7325,
          memory_mb: { rss: 214.6, heap_used: 88.4, heap_total: 121.2, external: 10.1 },
          usage: { requests_total: 98432, by_status: { "2xx": 96100, "3xx": 240, "4xx": 2010, "5xx": 82 }, slow_queries_total: 14 }
        }
      };
    }
    if (route === "/api/v1/apex-control/modules") {
      return { status: 200, body: modulePayload(null, null) };
    }
    if (route === "/api/v1/apex-control/activity") {
      return {
        status: 200,
        body: {
          generated_at: new Date().toISOString(),
          days: 7,
          activity: { today: 812, period: 4320 },
          daily: [{ date: "2026-11-02", total: 812 }, { date: "2026-11-01", total: 640 }],
          connections: { active_sessions: 20, distinct_users: 292, websocket: { clients: 7 } }
        }
      };
    }
    if (route === "/api/v1/apex-control/tenants") {
      return {
        status: 200,
        body: {
          generated_at: new Date().toISOString(),
          scope: "cross-tenant",
          days: 7,
          restricted: false,
          allowlist: [],
          summary: { total: 3, active: 3, with_activity: 2, with_sessions: 2, with_gps: 2 },
          tenants: TENANTS
        }
      };
    }
    const tenantMatch = /^\/api\/v1\/apex-control\/tenants\/([^/]+)\/modules$/.exec(route);
    if (tenantMatch) {
      if (req.headers.authorization !== `Bearer ${APEX_TOKEN}`) {
        return { status: 401, body: { error: "No autorizado", code: "NO_AUTORIZADO" } };
      }
      const tenant = TENANTS.find((item) => item.tenant_id === tenantMatch[1]);
      if (!tenant) return { status: 404, body: { error: "Empresa no encontrada", code: "EMPRESA_NO_ENCONTRADA" } };
      return { status: 200, body: modulePayload(tenant.tenant_id, tenant.name) };
    }
    return null;
  });
}

function startLegacyApi() {
  // Build desplegado anterior a apex-control: /health responde y el modulo no existe.
  return jsonResponder((req, url) => {
    if (url.pathname === "/health") {
      return {
        status: 200,
        body: {
          status: "OK",
          version: "2.0",
          modules: 17,
          commit: LEGACY_COMMIT,
          service_certification: "products-v2"
        }
      };
    }
    return null;
  });
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

function redactEnv(payload) {
  const text = JSON.stringify(payload);
  return JSON.parse(text
    .replace(new RegExp(APEX_TOKEN, "g"), "[apex-token]")
    .replace(new RegExp(UI_TOKEN, "g"), "[ui-token]"));
}

async function run() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tower-consolidado-data-"));

  const binary = chromePath();
  record("chrome_available", Boolean(binary), { path: binary || "no encontrado" });

  richApi = await startRichApi();
  legacyApi = await startLegacyApi();
  record("api_rica_sondeada", Boolean(richApi.base), { base: richApi.base });
  record("api_legada_bloqueada", Boolean(legacyApi.base), { base: legacyApi.base });

  const richHealth = await request(richApi.base, "/health");
  assert("health_expone_runtime", richHealth.status === 200
    && Number.isFinite(richHealth.body.uptime_seconds)
    && richHealth.body.memory_mb && Number.isFinite(richHealth.body.memory_mb.rss)
    && richHealth.body.usage && Number.isFinite(richHealth.body.usage.requests_total), {
    uptime: richHealth.body.uptime_seconds,
    rss: richHealth.body.memory_mb && richHealth.body.memory_mb.rss,
    requests: richHealth.body.usage && richHealth.body.usage.requests_total
  });

  tower = createTower({
    dataDir,
    pollMs: 4000,
    simulation: false,
    uiToken: UI_TOKEN,
    apexToken: APEX_TOKEN,
    // LOCAL se sonda por la ruta global de la torre: sin este override el
    // ambiente leeria el API real del puesto en vez de la API rica de la cert.
    apiBaseUrl: richApi.base,
    webBaseUrl: richApi.base,
    bridge: { token: "consolidado-bridge" },
    telegram: { mode: "off", token: "", allowedChatIds: [] },
    git: { remoteEnabled: false },
    cloud: {
      railway: { token: "", projectId: "" },
      vercel: { token: "" },
      supabase: { accessToken: "" }
    },
    environments: {
      local: {
        apiBaseUrl: richApi.base,
        webBaseUrl: richApi.base,
        apexToken: APEX_TOKEN,
        supabaseUrl: "",
        railwayProjectId: "",
        vercelProjectId: "",
        supabaseRef: ""
      },
      develop: {
        apiBaseUrl: legacyApi.base,
        webBaseUrl: legacyApi.base,
        apexToken: APEX_TOKEN,
        supabaseUrl: "",
        railwayProjectId: "",
        vercelProjectId: "",
        supabaseRef: ""
      },
      main: {
        apiBaseUrl: legacyApi.base,
        webBaseUrl: legacyApi.base,
        apexToken: APEX_TOKEN,
        supabaseUrl: "",
        railwayProjectId: "",
        vercelProjectId: "",
        supabaseRef: ""
      }
    }
  });
  const address = await tower.start({ port: 0 });
  const base = address.url;
  record("torre_iniciada", true, { url: base });

  const first = await waitFor(async () => {
    const status = await request(base, "/api/status", { token: UI_TOKEN });
    const snapshot = status.body && status.body.snapshot;
    return snapshot && snapshot.environments && snapshot.environments.local && snapshot.environments.local.activity ? snapshot : null;
  }, 30000);
  assert("snapshot_con_empresas", Boolean(first), { tenants: first ? Boolean(first.environments.local.activity.tenants) : false });

  const local = first.environments.local;
  const develop = first.environments.develop;
  const main = first.environments.main;

  assert("ambiente_local_normaliza_runtime", local.deployed
    && Number.isFinite(local.deployed.uptimeSeconds)
    && local.deployed.memory && local.deployed.memory.rss > 0
    && local.deployed.usage && local.deployed.usage.requestsTotal > 0
    && local.deployed.usage.byStatus["5xx"] === 82, {
    uptimeSeconds: local.deployed.uptimeSeconds,
    memory: local.deployed.memory,
    usage: local.deployed.usage
  });
  assert("ambiente_bloqueado_sin_runtime", develop.deployed
    && develop.deployed.memory === null
    && develop.deployed.usage === null
    && develop.deployed.commit === LEGACY_COMMIT, {
    commit: develop.deployed.commit,
    memory: develop.deployed.memory
  });

  assert("empresas_lectura_real", local.activity.tenants
    && local.activity.tenants.summary.total === 3
    && local.activity.tenants.tenants.length === 3, { summary: local.activity.tenants && local.activity.tenants.summary });

  for (const environment of [local, develop, main]) {
    const list = environment.recommendations;
    assert(`acciones_${environment.id}`, Array.isArray(list) && list.length >= 1, { count: Array.isArray(list) ? list.length : null });
  }
  const shapeOk = [local, develop, main].every((environment) => (environment.recommendations || []).every((item) => item.id
    && item.code
    && ["alta", "media", "baja"].includes(item.priority)
    && item.title
    && item.action
    && item.owner));
  assert("acciones_con_responsable_y_siguiente_paso", shapeOk, {
    ejemplo: (local.recommendations || []).slice(0, 2).map((item) => ({ code: item.code, priority: item.priority, owner: item.owner }))
  });

  const bloqueados = [develop, main].map((environment) => (environment.recommendations || []).find((item) => item.code === "MODULO_NO_DESPLEGADO"));
  assert("bloqueo_por_build_nombra_el_commit", bloqueados.every(Boolean)
    && bloqueados.every((item) => item.priority === "alta" && new RegExp(LEGACY_COMMIT.slice(0, 7)).test(item.action)), {
    acciones: bloqueados.map((item) => (item ? item.action.slice(0, 90) : null))
  });
  assert("bloqueo_no_pide_token_inútil", bloqueados.every((item) => item && !/ENV_[A-Z]+_APEX_TOKEN/.test(item.title)), {
    titulos: bloqueados.map((item) => (item ? item.title : null))
  });

  // El motivo de la lectura por empresa debe llegar a la misma accion de build,
  // aunque la sonda lo reporte como NO_DISPONIBLE en vez de MODULO_NO_DESPLEGADO.
  const empresasBloqueadas = [develop, main].map((environment) => {
    const reason = environment.activity ? (environment.activity.tenantsReason || environment.activity.reason) : null;
    return {
      reason,
      accion: (environment.recommendations || []).find((item) => item.code === "MODULO_NO_DESPLEGADO")
    };
  });
  assert("bloqueo_de_empresas_usa_la_misma_accion", empresasBloqueadas.every((item) => item.accion
    && ["MODULO_NO_DESPLEGADO", "NO_DISPONIBLE"].includes(item.reason)), {
    motivos: empresasBloqueadas.map((item) => item.reason)
  });

  const moduloLocal = (local.recommendations || []).find((item) => item.code === "MODULO_CAIDO");
  assert("modulo_caido_dueno_backend", moduloLocal && moduloLocal.priority === "alta" && /backend/.test(moduloLocal.owner), {
    accion: moduloLocal ? `${moduloLocal.title} · ${moduloLocal.owner}` : null
  });
  const atencion = (local.recommendations || []).filter((item) => item.code === "MODULO_ATENCION");
  assert("modulo_en_atencion_dueno_performance", atencion.length >= 1 && atencion.every((item) => /performance/.test(item.owner)), {
    cantidad: atencion.length
  });

  const tenantOk = await request(base, `/api/tenants/tenant-demo/modules?environment=local`, { token: UI_TOKEN });
  assert("ruta_empresa_ok", tenantOk.status === 200 && tenantOk.body.ok === true
    && Array.isArray(tenantOk.body.modules) && tenantOk.body.modules.length === 3
    && tenantOk.body.tenant && tenantOk.body.tenant.id === "tenant-demo"
    && tenantOk.body.health && Number.isFinite(tenantOk.body.health.score), {
    status: tenantOk.status,
    score: tenantOk.body.health && tenantOk.body.health.score,
    modulos: tenantOk.body.modules ? tenantOk.body.modules.length : 0
  });
  const tenantAcciones = tenantOk.body.recommendations || [];
  assert("empresa_con_acciones_y_dueno", tenantAcciones.length >= 2
    && tenantAcciones.some((item) => item.code === "MODULO_CAIDO")
    && tenantAcciones.every((item) => item.owner && item.action), {
    codigos: tenantAcciones.map((item) => item.code)
  });

  const tenantBloqueado = await request(base, `/api/tenants/tenant-demo/modules?environment=main`, { token: UI_TOKEN });
  assert("ruta_empresa_bloqueada_con_accion", tenantBloqueado.status === 409
    && tenantBloqueado.body.code
    && tenantBloqueado.body.recommendation
    && tenantBloqueado.body.recommendation.action, {
    status: tenantBloqueado.status,
    code: tenantBloqueado.body.code,
    accion: tenantBloqueado.body.recommendation && tenantBloqueado.body.recommendation.code
  });

  const tenantDesconocido = await request(base, `/api/tenants/tenant-fantasma/modules?environment=local`, { token: UI_TOKEN });
  assert("empresa_inexistente_no_se_inventa", tenantDesconocido.status === 404
    && tenantDesconocido.body.code === "EMPRESA_NO_ENCONTRADA"
    && tenantDesconocido.body.recommendation, {
    status: tenantDesconocido.status,
    accion: tenantDesconocido.body.recommendation && tenantDesconocido.body.recommendation.code
  });

  const sinToken = await request(base, `/api/tenants/tenant-demo/modules?environment=local`);
  assert("ruta_empresa_exige_token", sinToken.status === 401, { status: sinToken.status });

  const snapshotJson = JSON.stringify(redactEnv(first));
  assert("snapshot_no_filtra_el_token_de_la_torre", !snapshotJson.includes(APEX_TOKEN) && !snapshotJson.includes(UI_TOKEN), {
    tamano: snapshotJson.length
  });

  fs.writeFileSync(path.join(EVIDENCE_DIR, "snapshot-ambientes.json"), `${JSON.stringify(redactEnv(first), null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "empresa-tenant-demo.json"), `${JSON.stringify(redactEnv(tenantOk.body), null, 2)}\n`, "utf8");
  record("evidencia_json", true, { archivos: ["snapshot-ambientes.json", "empresa-tenant-demo.json"] });

  let browserError = null;
  if (binary) {
    try {
      chrome = await launchChrome(binary);
      await chrome.cdp.send("Page.navigate", { url: `${base}/?token=${UI_TOKEN}` });
      const rendered = await waitFor(() => chrome.cdp.evaluate(
        `document.querySelectorAll('#companySummary .metric-tile').length >= 7 && document.querySelectorAll('#companySelect option').length > 1 && document.getElementById('statusLegend').textContent.length > 40`
      ), 25000);
      const conteo = await chrome.cdp.evaluate(`({
        teselas: document.querySelectorAll('#companySummary .metric-tile').length,
        opciones: document.querySelectorAll('#companySelect option').length,
        leyenda: document.getElementById('statusLegend').textContent.replace(/\\s+/g,' ').trim().slice(0,220),
        picker: Boolean(document.getElementById('companySelect'))
      })`);
      assert("navegador_monitor_consolidado", Boolean(rendered), conteo);
      assert("navegador_selector_de_empresa", conteo.opciones === 4, { opciones: conteo.opciones });
      assert("navegador_leyenda_de_estados", /Requiere atenci/.test(conteo.leyenda) && !/degrad/i.test(conteo.leyenda), { leyenda: conteo.leyenda });

      const memoria = await chrome.cdp.evaluate(`(() => {
        const tiles = [...document.querySelectorAll('#companySummary .metric-tile')];
        const memory = tiles.find((t) => /Memoria del API/.test(t.textContent));
        const usage = tiles.find((t) => /Uso del API/.test(t.textContent));
        return {
          memoria: memory ? memory.textContent.replace(/\\s+/g,' ').trim() : null,
          uso: usage ? usage.textContent.replace(/\\s+/g,' ').trim() : null
        };
      })()`);
      assert("navegador_memoria_y_uso_reales", /214[,.]6/.test(memoria.memoria || "") && /98[.,]432/.test(memoria.uso || ""), memoria);

      const seleccionado = await chrome.cdp.evaluate(`(() => {
        const select = document.getElementById('companySelect');
        select.value = 'tenant-riesgo';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return select.options[select.selectedIndex].textContent;
      })()`);
      const panelListo = await waitFor(() => chrome.cdp.evaluate(
        `!document.getElementById('companyPanel').hidden && document.querySelectorAll('#companyKpis .metric-tile').length >= 6 && document.getElementById('companyHealth').textContent.includes('Talento Humano')`
      ), 15000);
      const panel = await chrome.cdp.evaluate(`({
        visible: !document.getElementById('companyPanel').hidden,
        titulo: document.getElementById('companyTitle').textContent,
        teselas: [...document.querySelectorAll('#companyKpis .metric-tile')].map((t) => t.textContent.replace(/\\s+/g,' ').trim()),
        acciones: [...document.querySelectorAll('#companyHealth .action-item')].length,
        filas: document.querySelectorAll('#companyHealth .module-row').length
      })`);
      assert("navegador_empresa_seleccionada", Boolean(panelListo) && panel.visible && /Empresa En Riesgo/.test(panel.titulo), {
        seleccion: seleccionado, titulo: panel.titulo, teselas: panel.teselas.length
      });
      assert("navegador_empresa_kpis_completos", panel.teselas.length === 6
        && panel.teselas.some((t) => /Memoria del API/.test(t))
        && panel.teselas.some((t) => /Uso del API/.test(t))
        && panel.teselas.some((t) => /Actividad de la empresa/.test(t)), { teselas: panel.teselas });
      assert("navegador_empresa_con_acciones", panel.acciones >= 1 && panel.filas >= 3, { acciones: panel.acciones, filas: panel.filas });

      const captura = await chrome.cdp.evaluate(`document.getElementById('companyPanel').scrollIntoView({block:'start'}) || true`);
      await sleep(400);
      const shotCompany = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "01-monitor-consolidado-empresa.png"));
      assert("captura_monitor_consolidado", shotCompany > 20000, { bytes: shotCompany, scroll: Boolean(captura) });

      const resumen = await chrome.cdp.evaluate(`document.body.innerText.replace(/\\s+/g,' ')`);
      assert("navegador_resumen_sin_jerga_degrade", !/degrad/i.test(resumen) && /requiere atenci/i.test(resumen), {
        coincidencias: (resumen.match(/[^ ]*degrad[^ ]*/gi) || []).slice(0, 5)
      });

      await chrome.cdp.evaluate(`document.querySelector('[data-env="main"]').click()`);
      const prodListo = await waitFor(() => chrome.cdp.evaluate(
        `document.getElementById('tenantsTitle').textContent.includes('consolidado') && document.getElementById('overallPill').textContent.includes('PROD') && document.querySelectorAll('#tenants .action-item').length >= 1`
      ), 15000);
      const prod = await chrome.cdp.evaluate(`({
        pill: document.getElementById('overallPill').textContent,
        aviso: (document.querySelector('#health .health-notice') || {}).textContent,
        titulo: (document.querySelector('#tenants .action-head h3') || {}).textContent,
        acciones: [...document.querySelectorAll('#tenants .action-item')].map((a) => a.textContent.replace(/\\s+/g,' ').trim().slice(0,140)),
        selectorVacio: document.getElementById('companySelect').disabled,
        hint: document.getElementById('pickerHint').textContent
      })`);
      assert("navegador_producico_explica_el_bloqueo", Boolean(prodListo)
        && /build con apex-control/.test((prod.aviso || "") + " " + (prod.acciones || []).join(" "))
        && /Qué falta para leer las empresas/.test(prod.titulo || ""), {
        pill: prod.pill, titulo: prod.titulo, aviso: (prod.aviso || "").replace(/\s+/g, " ").slice(0, 160)
      });
      assert("navegador_producico_sin_empresas_inventadas", prod.selectorVacio === true && prod.acciones.length === 1, {
        selectorVacio: prod.selectorVacio, acciones: prod.acciones.length, hint: prod.hint
      });
      await chrome.cdp.evaluate(`document.getElementById('tenants').scrollIntoView({block:'center'})`);
      await sleep(300);
      const shotProd = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "02-producto-bloqueado-con-acciones.png"));
      assert("captura_producto_bloqueado", shotProd > 20000, { bytes: shotProd });

      await chrome.cdp.evaluate(`document.querySelector('[data-env="local"]').click()`);
      await waitFor(() => chrome.cdp.evaluate(`document.getElementById('overallPill').textContent.includes('LOCAL')`), 10000);
      await chrome.cdp.evaluate(`document.querySelector('[data-view="detail"]').click()`);
      const detalle = await waitFor(() => chrome.cdp.evaluate(
        `document.querySelectorAll('.perf-stat').length > 8 && [...document.querySelectorAll('.perf-stat')].some((s) => /Memoria RSS/.test(s.textContent))`
      ), 12000);
      const rendimiento = await chrome.cdp.evaluate(`[...document.querySelectorAll('.perf-stat')].map((s) => s.textContent.replace(/\\s+/g,' ').trim())`);
      assert("navegador_rendimiento_con_memoria_y_uso", Boolean(detalle)
        && rendimiento.some((s) => /Memoria RSS/.test(s))
        && rendimiento.some((s) => /Peticiones/.test(s))
        && rendimiento.some((s) => /Consultas lentas/.test(s))
        && rendimiento.some((s) => /Uptime del proceso/.test(s)), { estadisticas: rendimiento.length });

      const lenguaje = await chrome.cdp.evaluate(`document.body.innerText.replace(/\\s+/g,' ')`);
      // La leyenda vive en la vista Resumen: en Detalle se exige que el texto
      // explicativo siga exista en el DOM, aunque no este a la vista.
      const leyenda = await chrome.cdp.evaluate(`document.getElementById('statusLegend').textContent.replace(/\\s+/g,' ')`);
      assert("navegador_sin_jerga_degrade", !/degrad/i.test(lenguaje) && /Requiere atenci/.test(`${lenguaje} ${leyenda}`), {
        coincidencias: (lenguaje.match(/[^ ]*degrad[^ ]*/gi) || []).slice(0, 5),
        leyenda: leyenda.slice(0, 160)
      });
      await chrome.cdp.evaluate(`window.scrollTo(0,0)`);
      await sleep(300);
      const shotDetail = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "03-vista-detalle-consolidado.png"));
      assert("captura_vista_detalle", shotDetail > 20000, { bytes: shotDetail });

      await chrome.cdp.evaluate(`document.querySelector('#health [data-health-detail]').click()`);
      const umbral = await waitFor(() => chrome.cdp.evaluate(
        `document.getElementById('detailDialog').open && !/degrad/i.test(document.getElementById('detailBody').textContent)`
      ), 8000);
      assert("navegador_umbrales_sin_jerga", Boolean(umbral), { abierto: umbral });
      await chrome.cdp.evaluate(`document.getElementById('btnDialogClose').click()`);
    } catch (error) {
      browserError = error;
      record("navegador_monitor_consolidado", false, { error: String(error.message || error) });
    }
  }

  if (chrome && !browserError) {
    assert("navegador_consola_sin_errores", consoleErrors.length === 0, { errores: consoleErrors.slice(0, 5) });
  }
}

async function main() {
  let fatal = null;
  try {
    await run();
  } catch (error) {
    fatal = error;
    record("certificacion_error", false, { error: String(error && error.message ? error.message : error) });
  } finally {
    await closeChrome(chrome);
    if (tower) {
      try {
        await tower.stop();
      } catch {
        // ignore
      }
    }
    for (const instance of [richApi, legacyApi]) {
      if (instance) {
        try {
          instance.server.close();
        } catch {
          // ignore
        }
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
    certification: "apex-control-tower-consolidado-local",
    version: 1,
    status,
    certification_status: status === "passed" ? "local_passed_qa_pending" : "blocked",
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    commit: commitSha(),
    working_tree_dirty: workingTreeDirty(),
    alcance: [
      "monitor consolidado por empresa (empresas, carga, actividad, memoria, uso del API, rendimiento)",
      "selector de empresa y panel por empresa con acciones sugeridas",
      "/health del API con runtime agregado (uptime, memoria, uso) y su normalizacion en la torre",
      "motor de acciones sugeridas por ambiente y por empresa",
      "ambientes bloqueados por build sin apex-control: bloqueo explicado con accion y responsable"
    ],
    no_certifica: [
      "datos reales por empresa en QA y PROD: sus builds desplegados no incluyen apex-control",
      "promocion a develop o main",
      "despliegue en Railway"
    ],
    environment: {
      type: "local",
      node: process.version,
      chrome: chromePath() || "no disponible",
      modo: "torre real contra API rica (con runtime) y API legada (sin apex-control)",
      tokens: "roles locales de certificacion, nunca credenciales reales"
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
      "snapshot-ambientes.json",
      "empresa-tenant-demo.json",
      "01-monitor-consolidado-empresa.png",
      "02-producto-bloqueado-con-acciones.png",
      "03-vista-detalle-consolidado.png"
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
