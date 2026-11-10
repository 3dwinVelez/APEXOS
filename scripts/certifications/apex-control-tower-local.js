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
const metrics = require(path.join(TOWER_DIR, "lib", "metrics.js"));

const startedAt = new Date().toISOString();
const checks = [];
const consoleErrors = [];
const screenshots = [];
let tower = null;
let liveTower = null;
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
      // CDP deja el texto util en exception.description; "text" solo dice
      // "Uncaught" y no permite saber que evaluacion del panel fallo.
      const details = result.exceptionDetails;
      const inner = details.exception ? details.exception.description || details.exception.value : null;
      throw new Error(String(inner || details.text || "evaluate error").split("\n")[0]);
    }
    return result.result ? result.result.value : undefined;
  }

  // Con la pagina entera (captureBeyondViewport) una vista de 34 filas deja de
  // caber en la superficie y el headless tarda mas que el presupuesto del CDP.
  async screenshot(file, { fullPage = true } = {}) {
    const result = await this.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: fullPage
    }, 45000);
    const bytes = Buffer.from(result.data, "base64");
    // El PNG de la corrida anterior puede seguir bloqueado por el antivirus del
    // puesto: se reescribe sobre un archivo fresco y, si aun asi falla, se reintenta.
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // ignore
    }
    try {
      fs.writeFileSync(file, bytes);
    } catch {
      await sleep(600);
      fs.rmSync(file, { force: true });
      fs.writeFileSync(file, bytes);
    }
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

  // Esta torre es hermetica: en simulacion omite las sondas remotas y la salud por
  // modulo a proposito, pero SI lee el /apex-control/status real del puesto, que es
  // de donde sale la latencia de la base que despues se bandea. La evidencia de los
  // conteos por modulo vive mas abajo, en la fase real.
  const localSim = await waitFor(async () => {
    const env = (await request(base, "/api/status")).body.snapshot.environments.local;
    return env && Array.isArray(env.gauges) && env.gauges.length && env.components && env.components.length ? env : null;
  }, 30000, 1000) || snapshot.environments.local;
  const dbSimMs = metrics.componentLatency(localSim.components, "db");
  // El contraste no es el tamano del catalogo (15 claves, 2 internas): es que todo
  // lo publicado nazca del catalogo versionado y traiga su historia medida, que es
  // lo que el panel pinta como ticks.
  const historiaSim = localSim.gauges.filter((entry) => Array.isArray(entry.series) && typeof entry.window === "number");
  assert("local_componentes_reales", Number.isFinite(dbSimMs)
    && localSim.gauges.every((entry) => metrics.GAUGES[entry.key])
    && historiaSim.length === localSim.gauges.length
    && localSim.components.every((component) => Array.isArray(component.series))
    && Boolean(localSim.latency) && localSim.latency.samples > 0, {
    db_ms: dbSimMs,
    componentes: localSim.components.length,
    medidores: localSim.gauges.length,
    medidores_con_historia: historiaSim.length,
    muestras_latencia: localSim.latency ? localSim.latency.samples : 0
  });
  assert("simulacion_declarada_en_el_panel", Boolean(localSim.modules)
    && localSim.modules.source === "catalog" && localSim.modules.reason === "SIMULACION", {
    fuente: localSim.modules ? localSim.modules.source : null,
    motivo: localSim.modules ? localSim.modules.reason : null
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
      // El arranque cae en Resumen: salud, medidores y alertas. Nada de sondas,
      // ramas ni nubes mezcladas con la respuesta de "¿cómo está APEXOS?".
      const visible = `(n) => n.offsetParent !== null`;
      const rendered = await waitFor(
        () => chrome.cdp.evaluate(`document.querySelectorAll('#gauges .measure-card').length >= 10
          && Array.from(document.querySelectorAll('[data-views]')).filter(${visible}).length === 3
          && document.querySelectorAll('.check').length >= 8
          && document.querySelectorAll('#moduleMap .map-tick').length >= 3
          && Boolean(document.querySelector('#health [aria-label^="Salud "]'))`),
        15000
      );
      assert("browser_dashboard_rendered", Boolean(rendered), {
        medidores: await chrome.cdp.evaluate(`document.querySelectorAll('#gauges .measure-card').length`),
        seccionesVisibles: await chrome.cdp.evaluate(`Array.from(document.querySelectorAll('[data-views]')).filter(${visible}).length`),
        gauge: await chrome.cdp.evaluate(`Boolean(document.querySelector('#health [aria-label^="Salud "]'))`)
      });

      // Resumen = preguntas con semaforo y tope. Las filas tecnicas (sondas,
      // teselas, ramas) siguen en el DOM pero NO a la vista.
      const resumen = await chrome.cdp.evaluate(`({
        bandas: Array.from(document.querySelectorAll('#gauges .band-pill')).map((n) => n.textContent.trim()),
        preguntas: Array.from(document.querySelectorAll('#gauges .measure-question')).map((n) => n.textContent.trim()),
        enlaces: Array.from(document.querySelectorAll('#gauges .measure-link')).map((n) => n.dataset.view),
        metas: document.getElementById('gaugesMeta').textContent.trim(),
        tarjetas: document.querySelectorAll('#gauges .measure-card').length,
        franjas: document.querySelectorAll('#gauges .monitor-ticks').length,
        pies: document.querySelectorAll('#gauges .monitor-ticks-foot').length,
        marcas: document.querySelectorAll('#gauges .map-tick').length,
        tirasConLectura: Array.from(document.querySelectorAll('#gauges .monitor-ticks')).filter((n) => n.children.length).length,
        kpisVisibles: Array.from(document.querySelectorAll('#kpis .metric-tile')).filter(${visible}).length,
        checksVisibles: Array.from(document.querySelectorAll('#checks .check')).filter(${visible}).length,
        secciones: Array.from(document.querySelectorAll('[data-views]')).filter(${visible}).length
      })`);
      assert("browser_summary_uses_gauges", resumen.kpisVisibles === 0
        && resumen.checksVisibles === 0
        && resumen.secciones === 3
        && resumen.preguntas.length >= 10
        && /medidores con umbral/.test(resumen.metas), {
        kpisVisibles: resumen.kpisVisibles, checksVisibles: resumen.checksVisibles,
        secciones: resumen.secciones, metas: resumen.metas
      });
      // Ningun medidor se queda en un numero suelto: cada tarjeta trae su franja y
      // su pie. Donde todavia no hubo lectura la franja existe y el pie lo dice,
      // por eso se cuenta por tiras y no por marcas totales.
      assert("browser_cada_medidor_trae_su_historia", resumen.tarjetas >= 10
        && resumen.franjas === resumen.tarjetas
        && resumen.pies === resumen.tarjetas
        && resumen.tirasConLectura >= 5, {
        tarjetas: resumen.tarjetas, franjas: resumen.franjas, pies: resumen.pies,
        tiras_con_lectura: resumen.tirasConLectura, marcas: resumen.marcas
      });
      // La lista de enlaces ya no se limita a cuatro vistas: el medidor de la nube
      // y el del puesto tambien responden desde el resumen.
      assert("browser_bandas_sin_jerga", resumen.bandas.every((banda) => /Óptimo|En riesgo|Crítico|Sin dato|Informativo/.test(banda))
        && resumen.enlaces.every((view) => /latencia|api|modulos|datos|nube|operacion/.test(view)), {
        bandas: resumen.bandas, enlaces: resumen.enlaces
      });
      assert("browser_cada_pregunta_apunta_a_su_vista", new Set(resumen.enlaces).size >= 4, { vistas: resumen.enlaces });

      await waitFor(() => chrome.cdp.evaluate(`document.getElementById('livePill').textContent.includes('SSE en vivo')`), 8000);
      const size = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-overview.png"));
      assert("browser_dashboard_screenshot", size > 20000, { bytes: size });

      const tabs = await chrome.cdp.evaluate(`document.querySelectorAll('.env-tab').length`);
      assert("browser_environment_tabs", tabs === 3, { tabs });

      // --- Vista Latencia: el tope dibujado y el veredicto sostenido vs evento.
      await chrome.cdp.evaluate(`document.querySelector('[data-view="latencia"]').click()`);
      const latencia = await waitFor(() => chrome.cdp.evaluate(`(() => {
        const leido = {
          chart: document.querySelectorAll('#performance .latency-chart').length,
          lineas: Array.from(document.querySelectorAll('#performance .chart-label')).map((n) => n.textContent.trim()),
          aria: document.querySelector('#performance .latency-chart')
            ? document.querySelector('#performance .latency-chart').getAttribute('aria-label') : '',
          veredicto: (document.querySelector('#latencyVerdict .verdict-text') || {}).textContent || '',
          regla: (document.querySelector('#latencyVerdict .verdict-rule') || {}).textContent || '',
          medidor: (() => {
            const tarjeta = Array.from(document.querySelectorAll('#gauges .measure-card')).find((n) => /p95/.test(n.textContent));
            return tarjeta ? (tarjeta.querySelector('.measure-limits') || {}).textContent || '' : '';
          })(),
          tope: (() => {
            const linea = Array.from(document.querySelectorAll('#performance .chart-label'))
              .find((n) => /^tope /.test(n.textContent.trim()));
            return linea ? { y: Number(linea.getAttribute('y')), texto: linea.textContent.trim() } : null;
          })(),
          estadisticas: document.querySelectorAll('.perf-stat').length,
          textoStats: Array.from(document.querySelectorAll('.perf-stat')).map((n) => n.textContent.replace(/\\s+/g, " ").trim()),
          checks: Array.from(document.querySelectorAll('#checks .check')).filter(${visible}).length,
          secciones: Array.from(document.querySelectorAll('[data-views]')).filter(${visible}).length
        };
        return leido.chart === 1 && leido.veredicto && leido.medidor ? leido : null;
      })()`), 25000);
      assert("browser_latencia_con_tope_dibujado", Boolean(latencia)
        && latencia.lineas.some((texto) => /^tope \d+ ms$/.test(texto))
        && latencia.lineas.some((texto) => /^óptimo \d+ ms$/.test(texto))
        && /tope de \d+ ms/.test(latencia.aria || ""), latencia);
      assert("browser_latencia_veredicto_sostenido_o_evento", Boolean(latencia)
        && /Dentro del tope|Picos por evento|Fuera del tope/.test(latencia.veredicto)
        && /muestras sobre \d+ ms · racha máxima \d+ · ventana \d+/.test(latencia.regla), {
        veredicto: latencia ? latencia.veredicto : null, regla: latencia ? latencia.regla : null
      });
      // El mismo numero: el tope que se dibuja es el tope que publica el medidor.
      const lineaTope = latencia ? (latencia.lineas.find((texto) => /^tope /.test(texto)) || "") : "";
      const topeGrafico = Number((lineaTope.match(/\d+/) || [])[0]);
      const topesMedidor = latencia ? (latencia.medidor.match(/\d+/g) || []).map(Number) : [];
      assert("browser_tope_del_grafico_es_el_del_medidor", Number.isFinite(topeGrafico)
        && topesMedidor.includes(topeGrafico), {
        grafico: topeGrafico, medidor: topesMedidor, lineas: latencia ? latencia.lineas : null
      });
      assert("browser_latencia_muestra_las_sondas", Boolean(latencia) && latencia.checks >= 8 && latencia.secciones === 2, {
        checks: latencia ? latencia.checks : 0, secciones: latencia ? latencia.secciones : 0
      });
      // El recorte de la vista Latencia: la grafica se queda con los cuatro
      // estadisticos que responden a su pregunta y suelta la telemetria de proceso,
      // que hoy se bandea en las teselas con umbral de la vista API.
      const performanceStats = latencia ? latencia.estadisticas : 0;
      // Sonda tolerante: si el API local esta caido esto no es un fallo del panel,
      // es una fuente real ausente. Decirlo aparte evita culpar a la interfaz.
      const apiHealth = await request("http://127.0.0.1:3000", "/health")
        .then((r) => ({ ok: true, body: r.body }))
        .catch(() => ({ ok: false, body: null }));
      const runtimePublished = Boolean(apiHealth.body && apiHealth.body.memory_mb);
      assert("browser_performance_panel", performanceStats === 4
        && latencia.textoStats.join(" ").includes("p95")
        && !/Memoria RSS|Consultas lentas|Peticiones/.test(latencia.textoStats.join(" ")), {
        stats: performanceStats, etiquetas: latencia ? latencia.textoStats : [], runtimePublished
      });
      // El tope dibujado no puede ser adorno: su etiqueta tiene que caer sobre la
      // ordenada que le corresponde en la escala real del SVG. Pegarla arriba hacia
      // leer mal la altura de la curva, que es justamente lo que el dueno mide.
      const topeDibujado = latencia && latencia.tope
        ? await chrome.cdp.evaluate(`(() => {
          const svg = document.querySelector('#performance .latency-chart');
          const texto = Array.from(document.querySelectorAll('#performance .chart-label')).find((n) => /^tope/.test(n.textContent.trim()));
          if (!svg || !texto) return null;
          const escala = svg.getBoundingClientRect().height / 208;
          return {
            esperado: ${latencia.tope.y} * escala,
            medido: texto.getBoundingClientRect().top - svg.getBoundingClientRect().top,
            escala
          };
        })()`).catch(() => null)
        : null;
      assert("browser_tope_dibujado_en_su_ordenada", Boolean(topeDibujado)
        && Math.abs(topeDibujado.medido - topeDibujado.esperado) <= 14, topeDibujado);
      // La rejilla es el producto: si el navegador de vistas cae a una columna de
      // 1/12 deja una banda muerta de 1300 px y el dueno vuelve a ver "regado".
      const rejilla = await chrome.cdp.evaluate(`(() => {
        const main = document.querySelector('main');
        const nav = document.getElementById('viewNav');
        const leyenda = document.getElementById('statusLegend');
        const visibles = Array.from(main.children).filter((n) => !n.hidden && n.offsetParent !== null);
        const R = (n) => n.getBoundingClientRect();
        return {
          anchoNav: Math.round(R(nav).width),
          anchoMain: Math.round(R(main).width),
          altoNav: Math.round(R(nav).height),
          leyendaUltima: visibles[visibles.length - 1] === leyenda,
          seccionesVisibles: visibles.filter((n) => n.tagName === 'SECTION').length
        };
      })()`);
      assert("browser_rejilla_vistas_horizontal", rejilla.anchoNav > rejilla.anchoMain * 0.6
        && rejilla.altoNav < 90 && rejilla.leyendaUltima && rejilla.seccionesVisibles >= 2, rejilla);

      // El grafico tiene que responder por el punto que el dueno senale: hora,
      // medicion y si fue pico, no solo la forma de la curva. La serie se llena
      // sondeo a sondeo, asi que se espera a que este dibujada en vez de leer una
      // sola vez: leida de una vez, esta certificacion pasa o falla segun el minuto.
      const explorador = await waitFor(() => chrome.cdp.evaluate(`(() => {
        const blancos = document.querySelectorAll('.latency-chart .chart-hit').length;
        const horarios = Array.from(document.querySelectorAll('.latency-chart .chart-tick')).map((t) => t.textContent.trim());
        const picos = document.querySelectorAll('.peak-btn').length;
        if (blancos < 2 || picos < 1 || new Set(horarios).size < 2) return null;
        const btn = document.querySelector('.peak-btn');
        btn.click();
        return { blancos, horarios, picos, hora: btn.dataset.chartPointAt };
      })()`).catch(() => null), 30000);
      await sleep(400);
      const detalle = await chrome.cdp.evaluate(`(() => {
        const filas = Array.from(document.querySelectorAll('#performance .point-row')).map((r) => ({
          k: r.querySelector('dt').textContent.trim(),
          v: r.querySelector('dd').textContent.trim()
        }));
        const porHora = (nombre) => (filas.find((f) => f.k === nombre) || {}).v || '';
        return {
          filas: filas.length,
          hora: porHora('Hora de la muestra'),
          medicion: porHora('Medicion'),
          anterior: porHora('Muestra anterior'),
          cursor: document.querySelectorAll('.latency-chart .chart-cursor').length,
          activo: document.querySelectorAll('.peak-btn.active').length
        };
      })()`);
      assert("browser_latencia_detalle_por_punto", Boolean(explorador) && explorador.blancos >= 2
        && explorador.horarios.length >= 2 && explorador.picos >= 1
        && explorador.hora && detalle.filas >= 6
        && /\d{1,2}\/\d{1,2}, \d{2}:\d{2}:\d{2}/.test(detalle.hora)
        && /\d+ ms · (Óptimo|En riesgo|Crítico)/.test(detalle.medicion)
        && detalle.cursor === 1 && detalle.activo === 1, { explorador, detalle });
      // Con la cadencia de sondeo de esta certificacion la ventana medida caben en
      // un minuto: un eje que solo lee hora:minuto repite la marca y deja el
      // grafico sin horarios. Cada etiqueta del eje tiene que ser distinta.
      assert("browser_eje_con_horarios_distintos", explorador.horarios.length >= 2
        && new Set(explorador.horarios).size === explorador.horarios.length
        && explorador.horarios.every((texto) => /\d{2}:\d{2}(:\d{2})?$/.test(texto)), {
        horarios: explorador.horarios
      });
      const shotDetalle = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-latencia-punto.png"));
      assert("browser_latencia_punto_capturado", shotDetalle > 20000, { bytes: shotDetalle });
      await chrome.cdp.evaluate(`(() => { const b = document.querySelector('.peak-btn.active'); if (b) b.click(); })()`);

      const shotLatencia = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-vista-latencia.png"));
      assert("browser_vista_latencia_capturada", shotLatencia > 20000, { bytes: shotLatencia });

      // La torre local lee /apex-control/status del API real del puesto. Con el
      // puesto cargado esa lectura puede tardar mas que un sondeo, asi que la vista
      // se espera a lo largo de varios sondeos, no de uno solo.
      // --- Vista API: que dice el servidor de si mismo y de sus componentes.
      await chrome.cdp.evaluate(`document.querySelector('[data-view="api"]').click()`);
      const apiVista = await waitFor(() => chrome.cdp.evaluate(`(() => {
        const leido = {
          componentes: Array.from(document.querySelectorAll('#components .component-row')).filter(${visible}).length,
          metas: document.getElementById('componentsMeta').textContent.trim(),
          base: Array.from(document.querySelectorAll('#components .component-row'))
            .map((n) => n.textContent.replace(/\\s+/g, " ").trim())
            .filter((texto) => /PostgreSQL|Base de datos/.test(texto))[0] || "",
          teselas: Array.from(document.querySelectorAll('#kpis .metric-tile')).filter(${visible}).length,
          franjas: document.querySelectorAll('#kpis .monitor-ticks').length,
          marcas: document.querySelectorAll('#kpis .map-tick').length,
          franjasComponentes: document.querySelectorAll('#components .monitor-ticks').length,
          franjasSondas: document.querySelectorAll('#checks .monitor-ticks').length,
          memoria: (() => {
            const tarjeta = Array.from(document.querySelectorAll('#kpis .metric-tile'))
              .filter((n) => n.offsetParent !== null)
              .find((n) => /Memoria del API|Uso de memoria/.test(n.textContent));
            return tarjeta ? tarjeta.textContent.replace(/\\s+/g, " ").trim() : "";
          })(),
          tecnicos: document.querySelectorAll('details.tech').length
        };
        return leido.componentes >= 6 && /\d/.test(leido.base) ? leido : null;
      })()`), 45000);
      assert("browser_vista_api_con_componentes_reales", Boolean(apiVista)
        && apiVista.componentes >= 6
        && /\d+ componentes · \d+ con latencia medida/.test(apiVista.metas)
        && /\d+ ms/.test(apiVista.base), apiVista);
      // El recorte deja las seis teselas que responden "¿el API esta optimo con la
      // carga que tiene?" y ninguna se pinta con un numero suelto.
      assert("browser_vista_api_teselas_tecnicas", Boolean(apiVista)
        && apiVista.teselas === 6
        && apiVista.franjas === apiVista.teselas
        && apiVista.marcas >= apiVista.teselas, {
        teselas: apiVista ? apiVista.teselas : 0,
        franjas: apiVista ? apiVista.franjas : 0,
        marcas: apiVista ? apiVista.marcas : 0
      });
      // La memoria del proceso no se borro del panel: cambió de sitio y ahora
      // lleva su corte versionado visible, que es lo que la convierte en decision.
      assert("browser_telemetria_proceso_con_umbral", Boolean(apiVista)
        && /\d/.test(apiVista.memoria) && /óptimo|tope/i.test(apiVista.memoria), {
        memoria: apiVista ? apiVista.memoria : "", runtimePublished
      });
      assert("browser_componentes_y_sondas_con_historia", Boolean(apiVista)
        && apiVista.franjasComponentes === apiVista.componentes
        && apiVista.franjasSondas >= 8, {
        componentes: apiVista ? apiVista.componentes : 0,
        franjas_componentes: apiVista ? apiVista.franjasComponentes : 0,
        franjas_sondas: apiVista ? apiVista.franjasSondas : 0
      });
      const technicalDetails = apiVista ? apiVista.tecnicos : 0;
      assert("browser_technical_details", technicalDetails >= 8, { details: technicalDetails });
      const shotApi = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-vista-api.png"));
      assert("browser_vista_api_capturada", shotApi > 20000, { bytes: shotApi });

      // --- Vista Modulos: un solo mapa con la API arriba de cada modulo.
      await chrome.cdp.evaluate(`document.querySelector('[data-view="modulos"]').click()`);
      const modulos = await waitFor(() => chrome.cdp.evaluate(`(() => {
        const leido = {
          filas: Array.from(document.querySelectorAll('#moduleMap .map-row')).filter(${visible}).length,
          marcas: Array.from(document.querySelectorAll('#moduleMap .map-tick')).filter(${visible}).length,
          leyenda: document.getElementById('moduleMapMeta').textContent.trim(),
          detalle: Array.from(document.querySelectorAll('#modules .module-row')).filter(${visible}).length
        };
        return leido.filas >= 3 && leido.marcas >= 3 ? leido : null;
      })()`), 8000);
      assert("browser_modulos_mapa_unico", Boolean(modulos) && /sondeos/.test(modulos.leyenda), modulos);
      const shotModulos = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-vista-modulos.png"));
      assert("browser_vista_modulos_capturada", shotModulos > 20000, { bytes: shotModulos });

      // --- Vista Base de datos: rapidez medida, volumen y cobertura.
      await chrome.cdp.evaluate(`document.querySelector('[data-view="datos"]').click()`);
      const datos = await waitFor(() => chrome.cdp.evaluate(`(() => {
        const leido = {
          pregunta: (document.querySelector('#databaseVerdict .verdict-question') || {}).textContent || '',
          veredicto: (document.querySelector('#databaseVerdict .verdict-text') || {}).textContent || '',
          regla: (document.querySelector('#databaseVerdict .verdict-rule') || {}).textContent || '',
          teselas: Array.from(document.querySelectorAll('#databaseKpis .metric-tile')).filter(${visible}).length,
          franjas: document.querySelectorAll('#databaseKpis .monitor-ticks').length,
          columnas: document.querySelectorAll('#databaseVolume th').length,
          vacio: (document.querySelector('#databaseVolume .empty') || {}).textContent || '',
          metas: document.getElementById('databaseMeta').textContent.trim(),
          empresas: Array.from(document.querySelectorAll('#tenants .metric-tile, #tenants .action-item')).filter(${visible}).length
        };
        return leido.teselas === 5 && leido.veredicto && leido.columnas === 0 && /SIMULACION/.test(leido.vacio) ? leido : null;
      })()`), 12000);
      // La banda de la vista ya no redacta una frase propia: nombra el peor
      // medidor medido y su banda, y la regla cita los topes del servidor.
      assert("browser_datos_veredicto_de_base", Boolean(datos)
        && datos.pregunta === "¿La base está rápida y con datos reales?"
        && /· (Óptimo|En riesgo|Crítico)$/.test(datos.veredicto)
        && /óptimo ≤/.test(datos.regla)
        && /registros medidos|conteo de registros/.test(datos.regla), datos);
      assert("browser_datos_teselas_con_historia", Boolean(datos) && datos.franjas === datos.teselas, {
        teselas: datos ? datos.teselas : 0, franjas: datos ? datos.franjas : 0
      });
      assert("browser_datos_volumen_por_modulo", Boolean(datos) && datos.columnas === 0
        && /^0 módulos con conteo/.test(datos.metas)
        && /SIMULACION/.test(datos.vacio), {
        columnas: datos ? datos.columnas : 0, metas: datos ? datos.metas : null, vacio: datos ? datos.vacio : null
      });
      const shotDatos = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-vista-datos.png"));
      assert("browser_vista_datos_capturada", shotDatos > 20000, { bytes: shotDatos });

      // --- Vista Operacion: la mesa del puesto (alertas abiertas y trabajos por
      // aprobar) con la misma banda medida y la misma historia que el resto.
      await chrome.cdp.evaluate(`document.querySelector('[data-view="operacion"]').click()`);
      const operacion = await waitFor(() => chrome.cdp.evaluate(`(() => {
        const leido = {
          pregunta: (document.querySelector('#operationVerdict .verdict-question') || {}).textContent || '',
          veredicto: (document.querySelector('#operationVerdict .verdict-text') || {}).textContent || '',
          teselas: Array.from(document.querySelectorAll('#operationKpis .metric-tile')).filter(${visible}).length,
          franjas: document.querySelectorAll('#operationKpis .monitor-ticks').length,
          pies: document.querySelectorAll('#operationKpis .monitor-ticks-foot').length
        };
        return leido.teselas === 2 && leido.pregunta ? leido : null;
      })()`), 12000);
      assert("browser_operacion_mesa_con_historia", Boolean(operacion)
        && operacion.pregunta === "¿Qué se está haciendo y qué falta?"
        && /· (Óptimo|En riesgo|Crítico|Sin dato)$/.test(operacion.veredicto)
        && operacion.franjas === operacion.teselas
        && operacion.pies === operacion.teselas, operacion);
      const shotOperacion = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-vista-operacion.png"));
      assert("browser_vista_operacion_capturada", shotOperacion > 20000, { bytes: shotOperacion });
      await chrome.cdp.evaluate(`document.querySelector('[data-view="resumen"]').click()`);

      // Ninguna seccion puede quedar huerfana: toda evidencia debe estar declarada
      // en alguna de las siete vistas, y ninguna vista puede quedarse sin secciones.
      const cobertura = await chrome.cdp.evaluate(`(() => {
        const views = ["resumen", "latencia", "api", "modulos", "datos", "nube", "operacion"];
        const secciones = Array.from(document.querySelectorAll("[data-views]"));
        const porVista = {};
        const declaradas = new Set();
        for (const view of views) {
          const propias = secciones.filter((n) => n.dataset.views.split(/\\s+/).includes(view));
          porVista[view] = propias.length;
          propias.forEach((n) => declaradas.add(n));
        }
        document.querySelector('[data-view="resumen"]').click();
        return { porVista, total: secciones.length, cubiertas: declaradas.size };
      })()`);
      assert("browser_cada_vista_tiene_evidencia", Object.values(cobertura.porVista).every((n) => n >= 2)
        && cobertura.cubiertas === cobertura.total, cobertura);

      await chrome.cdp.evaluate(`document.querySelector('[data-view="nube"]').click()`);
      await chrome.cdp.evaluate(`document.querySelector('[data-env="main"]').click()`);
      const mainTab = await waitFor(
        () => chrome.cdp.evaluate(`document.getElementById('overallPill').textContent.includes('PROD') && Array.from(document.querySelectorAll('.cloud-card')).filter(${visible}).length === 3`),
        8000
      );
      assert("browser_environment_switch", Boolean(mainTab), {
        pill: await chrome.cdp.evaluate(`document.getElementById('overallPill').textContent`),
        cloudCards: await chrome.cdp.evaluate(`Array.from(document.querySelectorAll('.cloud-card')).filter(${visible}).length`),
        seleccionadas: await chrome.cdp.evaluate(`document.querySelectorAll('.branch.selected').length`),
        vista: await chrome.cdp.evaluate(`document.getElementById('cloudPanel').offsetParent !== null`)
      });
      const mainSize = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-env-main.png"));
      assert("browser_environment_screenshot", mainSize > 20000, { bytes: mainSize });
      await chrome.cdp.evaluate(`document.querySelector('[data-env="local"]').click()`);
      await chrome.cdp.evaluate(`document.querySelector('[data-view="resumen"]').click()`);
      await waitFor(() => chrome.cdp.evaluate(`document.getElementById('overallPill').textContent.includes('LOCAL')`), 5000);
    } catch (error) {
      browserError = error;
      record("browser_dashboard_rendered", false, { error: String(error.message || error) });
    }
  }

  // --- Fase REAL: una torre sin simulacion, con solo el ambiente del puesto
  // vigilado, leyendo el API y la base de datos de verdad. Es la evidencia de que
  // las vistas-pregunta se pintan con datos medidos y no con el catalogo de
  // respaldo; el resto del script es hermetico y no puede mostrarla.
  const live = createTower({
    dataDir: path.join(dataDir, "live"),
    // 15 s: leer los ~34 modulos le cuesta al API local alrededor de un segundo, y
    // una torre de certificacion no debe convertir esa lectura en una DoS local.
    pollMs: 15000,
    simulation: false,
    uiToken: UI_TOKEN,
    telegram: { mode: "off" },
    git: { remoteEnabled: false },
    environments: { develop: { enabled: false }, main: { enabled: false } }
  });
  liveTower = live;
  try {
    const liveAddress = await live.start({ port: 0 });
    const liveBase = liveAddress.url;
    const localReal = await waitFor(async () => {
      const env = (await request(liveBase, "/api/status")).body.snapshot.environments.local;
      const listo = env && env.modules && env.modules.source === "api"
        && env.components && env.components.length
        && metrics.totalRecords(env.modules.modules) > 0
        && metrics.componentLatency(env.components, "db") !== null;
      return listo ? env : null;
    }, 90000, 2000);
    const registrosReales = localReal ? metrics.totalRecords(localReal.modules.modules) : null;
    const coberturaReal = localReal ? metrics.coveragePercent(localReal.activity) : null;
    const historiaReal = localReal && localReal.gauges
      ? localReal.gauges.filter((entry) => Array.isArray(entry.series) && typeof entry.window === "number").length
      : 0;
    assert("local_fuente_real", Boolean(localReal)
      && localReal.modules.source === "api"
      && registrosReales > 0
      && Number.isFinite(metrics.componentLatency(localReal.components, "db"))
      && Number.isFinite(coberturaReal)
      && localReal.gauges.every((entry) => metrics.GAUGES[entry.key])
      && historiaReal === localReal.gauges.length
      && Boolean(localReal.latency) && localReal.latency.samples > 0, {
      fuente: localReal ? localReal.modules.source : null,
      db_ms: localReal ? metrics.componentLatency(localReal.components, "db") : null,
      registros: registrosReales,
      cobertura_empresial: coberturaReal,
      medidores: localReal && localReal.gauges ? localReal.gauges.length : 0,
      medidores_con_historia: historiaReal,
      muestras_latencia: localReal && localReal.latency ? localReal.latency.samples : 0
    });
    assert("mapa_real_de_modulos", Boolean(localReal) && localReal.moduleHistory.length >= 1
      && Object.keys(localReal.moduleHistory[localReal.moduleHistory.length - 1].ticks).length >= 3, {
      sondeos: localReal ? localReal.moduleHistory.length : 0,
      modulos_del_ultimo_sondeo: localReal
        ? Object.keys(localReal.moduleHistory[localReal.moduleHistory.length - 1].ticks).length
        : 0
    });

    if (chrome && !browserError && localReal) {
      const visibleReal = `(n) => n.offsetParent !== null`;
      try {
        await chrome.cdp.send("Page.navigate", { url: liveBase });
        await waitFor(() => chrome.cdp.evaluate(`document.querySelectorAll('#gauges .measure-card').length >= 10`).catch(() => false), 20000);
        await chrome.cdp.evaluate(`document.querySelector('[data-view="datos"]').click()`);
        const datosReales = await waitFor(() => chrome.cdp.evaluate(`(() => {
          const leido = {
            columnas: document.querySelectorAll('#databaseVolume th').length,
            filas: document.querySelectorAll('#databaseVolume tbody tr').length,
            conteo: document.getElementById('databaseMeta').textContent.trim(),
            pregunta: (document.querySelector('#databaseVerdict .verdict-question') || {}).textContent || '',
            veredicto: (document.querySelector('#databaseVerdict .verdict-text') || {}).textContent || '',
            regla: (document.querySelector('#databaseVerdict .verdict-rule') || {}).textContent || '',
            teselas: Array.from(document.querySelectorAll('#databaseKpis .metric-tile')).filter(${visibleReal}).length,
            franjas: document.querySelectorAll('#databaseKpis .monitor-ticks').length,
            marcas: document.querySelectorAll('#databaseKpis .map-tick').length
          };
          return leido.filas >= 3 && leido.columnas >= 6 ? leido : null;
        })()`).catch(() => null), 20000);
        assert("browser_datos_con_volumen_real", Boolean(datosReales)
          && /^\d+ módulos con conteo/.test(datosReales.conteo)
          && !/^0 módulos con conteo/.test(datosReales.conteo)
          && datosReales.pregunta === "¿La base está rápida y con datos reales?"
          && /· (Óptimo|En riesgo|Crítico)$/.test(datosReales.veredicto)
          && /registros medidos en \d+ módulos con conteo/.test(datosReales.regla)
          && datosReales.teselas === 5
          && datosReales.franjas === datosReales.teselas
          && datosReales.marcas >= datosReales.teselas, datosReales);
        await chrome.cdp.evaluate(`window.scrollTo(0, 0)`);
        const shotReales = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-datos-reales.png"), { fullPage: false });
        assert("browser_vista_datos_reales_capturada", shotReales > 20000, { bytes: shotReales });

        await chrome.cdp.evaluate(`document.querySelector('[data-view="modulos"]').click()`);
        const modulosReales = await waitFor(() => chrome.cdp.evaluate(`(() => {
          const leido = {
            filas: Array.from(document.querySelectorAll('#moduleMap .map-row')).filter(${visibleReal}).length,
            marcas: Array.from(document.querySelectorAll('#moduleMap .map-tick')).filter(${visibleReal}).length,
            conRegistros: Array.from(document.querySelectorAll('#moduleMap .map-tick'))
              .filter((n) => /registros/.test(n.getAttribute('title') || '')).length,
            leyenda: document.getElementById('moduleMapMeta').textContent.trim()
          };
          return leido.filas >= 3 && leido.marcas >= 3 && leido.conRegistros > 0 ? leido : null;
        })()`).catch(() => null), 20000);
        assert("browser_modulos_con_datos_reales", Boolean(modulosReales) && /sondeos/.test(modulosReales.leyenda), modulosReales);
        await chrome.cdp.evaluate(`window.scrollTo(0, 0)`);
        const shotModulosReales = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-modulos-reales.png"), { fullPage: false });
        assert("browser_vista_modulos_reales_capturada", shotModulosReales > 20000, { bytes: shotModulosReales });
      } finally {
        // La pagina no puede quedarse apuntando a la torre real que ya se detiene:
        // sus reintentos de SSE llenarian la consola de errores y el resto del
        // script esta leerian otra interfaz distinta a la que se certifica.
        await chrome.cdp.send("Page.navigate", { url: base }).catch(() => {});
        await waitFor(() => chrome.cdp.evaluate(`document.querySelectorAll('#gauges .measure-card').length >= 10`).catch(() => false), 20000);
      }
    }
  } catch (error) {
    record("fase_real_disponible", false, { error: String(error.message || error) });
  } finally {
    try {
      await live.stop();
    } catch {
      // ignore
    }
    liveTower = null;
  }

  const outage = await request(base, "/api/simulate/outage", { method: "POST", token: UI_TOKEN, body: { component: "api", status: "down" } });
  assert("outage_visible", outage.status === 200 && outage.body.snapshot.overall === "down", { overall: outage.body && outage.body.snapshot ? outage.body.snapshot.overall : null });

  // La alerta la abre un sondeo, no el POST que pinta la falla: consultarla de
  // inmediato encuentra el inventario del sondeo anterior.
  const alertos = await waitFor(async () => {
    const alerts = (await request(base, "/api/alerts?open=1")).body.alerts || [];
    return alerts.some((alert) => alert.component === "api") ? alerts : null;
  }, 60000, 1000);
  assert("alert_opened", Boolean(alertos), {
    alerts: alertos ? alertos.map((alert) => alert.component)
      : ((await request(base, "/api/alerts?open=1")).body.alerts || []).map((alert) => alert.component)
  });

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

  await request(base, "/api/simulate", { method: "DELETE", token: UI_TOKEN });
  // La resolucion ocurre en el siguiente sondeo: dormirse un rato fijo declararia
  // recuperado un ambiente que la torre aun no ha vuelto a medir.
  const openAfter = await waitFor(async () => {
    const alerts = (await request(base, "/api/alerts?open=1")).body.alerts || [];
    return alerts.some((alert) => alert.component === "api") ? null : alerts;
  }, 30000, 1000);
  assert("recovery_resolved", openAfter !== null && !openAfter.some((alert) => alert.component === "api"), {
    open: ((await request(base, "/api/alerts?open=1")).body.alerts || []).map((alert) => alert.component)
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
      mode: "torre hermetica en simulacion + torre real contra el API del puesto",
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
      "telegram-outbox.json",
      ...screenshots.map((shot) => shot.file)
    ],
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
