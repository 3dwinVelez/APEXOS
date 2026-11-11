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

// La regla que el propietario firmo: cada magnitud medida se pinta como el
// grafico de latencia con sus cortes. Un recuadro sin grafica, o una serie
// dibujada sin umbral y sin admision honesta ("sin banda habitual todavia",
// "ninguno dejo lectura"), es el defecto que estos gates persiguen. Se expresa
// como funcion JS fuente para poder inyectarla en el evaluate del navegador.
const graficaConUmbral = `(tile) => {
  const grafica = tile.querySelector('.monitor-chart, .map-strip.map-chart');
  if (!grafica) return false;
  if (grafica.querySelector('.chart-optimal, .chart-risk')) return true;
  return /sin banda habitual todavía|ninguno dejó lectura|sin sondeos guardados|sin historia/.test(tile.textContent);
}`;
const sinGrafica = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)}))
  .filter((n) => n.offsetParent !== null && !(${graficaConUmbral})(n)).length`;

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
    try {
      // Chrome escribe el archivo y Windows puede negar la lectura por un instante
      // (EBUSY): es el navegador arrancando, no un fallo de la certificación.
      const value = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
      return Number.isInteger(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
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
      // El arranque cae en el cockpit del Resumen: un grafico dominante, dos
      // medidores de peso, seis teselas y la barra de estado. Nada de sondas,
      // ramas ni nubes mezcladas con la respuesta de "¿cómo está APEXOS?".
      const visible = `(n) => n.offsetParent !== null`;
      // Cada clause se lee por separado: un rojo en el arranque tiene que decir
      // cual de las cinco piezas del cockpit falto, no dejar un `false` mudo.
      const cockpitListo = () => chrome.cdp.evaluate(`({
        teselas: document.querySelectorAll('#cockpitTiles .cockpit-tile').length,
        diales: document.querySelectorAll('#cockpitDials .dial').length,
        hero: document.querySelectorAll('#cockpitHero .cockpit-hero').length,
        secciones: Array.from(document.querySelectorAll('[data-views]')).filter(${visible}).length,
        mapa: document.querySelectorAll('#moduleMap .map-strip.map-chart').length,
        mapaVacio: document.querySelectorAll('#moduleMap .map-strip .map-empty').length,
        silencio: ((document.querySelector('#moduleMap .map-silent') || {}).textContent || '').trim(),
        salud: Boolean(document.querySelector('#cockpitDials [aria-label^="Salud de la plataforma"]'))
      })`);
      // El mapa del Resumen se certifica en dos modos. SIN credencial el ambiente
      // cae al catalogo y dibuja sus bandas, asi que se exigen filas. CON la
      // credencial del puesto los 32 modulos reales son leidos por el API y la
      // ventana del arranque todavia no tiene historia: pintar tres tiras ahi
      // seria dibujar lo no medido. La gate acepta entonces el placeholder
      // vacio, pero SOLO si el panel declara la cuenta de los que quedaron sin
      // lectura. El crecimiento real a top 10 se certifica aparte, en la fase
      // real (browser_modulos_con_datos_reales), no en el arranque.
      const listoEsCockpit = (leido) => Boolean(leido) && leido.teselas === 6 && leido.diales === 2
        && leido.hero === 1 && leido.secciones === 4 && leido.salud === true
        && ((leido.mapa >= 3 && leido.mapa - leido.mapaVacio >= 3)
          || (leido.mapa >= 1 && leido.mapaVacio >= 1 && leido.silencio.length > 0));
      const rendered = await waitFor(async () => listoEsCockpit(await cockpitListo().catch(() => null)), 15000);
      assert("browser_dashboard_rendered", Boolean(rendered), await cockpitListo().catch(() => ({})));

      // Resumen = preguntas con semaforo y tope. Las filas tecnicas (sondas,
      // teselas, ramas) siguen en el DOM pero NO a la vista.
      // El grafico se dibuja con dos lecturas medidas, asi que se espera a que el
      // anillo tenga historia: certificar el Resumen en el primer sondeo certificaria
      // un panel que todavia no tiene nada que pintar. Se esperan los cuatro
      // medidores que el puesto SI publica en simulacion (p95, peticiones por
      // minuto, latencia de la base y errores del servidor): registros, frescura y
      // cobertura nacen del modulo de datos por empresa, y ahi la simulacion congela
      // el catalogo, asi que su hueco honesto es el comportamiento correcto y su
      // profundidad se exige con dato real en la fase real.
      const cortesDelCockpit = `document.querySelectorAll('#cockpitHero .threshold-chart .chart-optimal, #cockpitHero .threshold-chart .chart-risk, #cockpitTiles .threshold-chart .chart-optimal, #cockpitTiles .threshold-chart .chart-risk').length`;
      const historiaLista = await waitFor(() => chrome.cdp.evaluate(
        `document.querySelectorAll('#cockpitHero .monitor-chart svg, #cockpitTiles .monitor-chart svg').length >= 4 && ${cortesDelCockpit} >= 8`), 90000).catch(() => false);
      const resumen = await chrome.cdp.evaluate(`({
        bandas: Array.from(document.querySelectorAll('#cockpitHero .band-pill, #cockpitDials .band-pill, #cockpitTiles .band-pill')).map((n) => n.textContent.trim()),
        pregunta: (document.querySelector('#cockpitHero .hero-question') || {}).textContent || '',
        enlaces: Array.from(document.querySelectorAll('#cockpitTiles .measure-link')).map((n) => n.dataset.view),
        metas: document.getElementById('cockpitMeta').textContent.trim(),
        tarjetas: document.querySelectorAll('#cockpitTiles .cockpit-tile').length,
        diales: document.querySelectorAll('#cockpitDials .dial').length,
        agujas: document.querySelectorAll('#cockpitDials .dial-needle').length,
        dialSinLectura: document.querySelectorAll('#cockpitDials .dial-empty').length,
        rotulos: Array.from(document.querySelectorAll('#cockpitTiles .tile-label')).map((n) => n.textContent.trim()),
        graficas: document.querySelectorAll('#cockpitTiles .monitor-chart').length,
        pies: document.querySelectorAll('#cockpitTiles .monitor-chart-foot').length,
        lineasUmbral: document.querySelectorAll('#cockpitHero .threshold-chart .chart-optimal, #cockpitHero .threshold-chart .chart-risk, #cockpitTiles .threshold-chart .chart-optimal, #cockpitTiles .threshold-chart .chart-risk').length,
        etiquetasUmbral: Array.from(document.querySelectorAll('#cockpitHero .threshold-chart .chart-label, #cockpitTiles .threshold-chart .chart-label')).map((n) => n.textContent.trim()),
        tirasConLectura: document.querySelectorAll('#cockpitHero .monitor-chart svg, #cockpitTiles .monitor-chart svg').length,
        sinUmbral: ${sinGrafica("#cockpitTiles .cockpit-tile")},
        chips: Array.from(document.querySelectorAll('#cockpitStatus .status-chip')).map((n) => n.textContent.trim()),
        kpisVisibles: Array.from(document.querySelectorAll('#kpis .metric-tile')).filter(${visible}).length,
        checksVisibles: Array.from(document.querySelectorAll('#checks .check')).filter(${visible}).length,
        secciones: Array.from(document.querySelectorAll('[data-views]')).filter(${visible}).length
      })`);
      assert("browser_summary_uses_gauges", resumen.kpisVisibles === 0
        && resumen.checksVisibles === 0
        && resumen.secciones === 4
        && resumen.tarjetas === 6
        && /\d+ de \d+ medidores/.test(resumen.metas), {
        kpisVisibles: resumen.kpisVisibles, checksVisibles: resumen.checksVisibles,
        secciones: resumen.secciones, metas: resumen.metas
      });
      // Ningun medidor del cockpit se queda en un numero suelto: cada tesela trae
      // su grafico tipo latencia y su pie. Donde todavia no hubo lectura el hueco
      // existe y el pie dice cuantas lecturas faltan (`sinUmbral = 0` es la regla
      // estructural), por eso se cuenta por graficas dibujadas y no por marcas
      // sueltas. Y el Resumen solo muestra los nueve elegidos por el servidor: la
      // evidencia por modulo vive en su vista.
      assert("browser_cada_medidor_trae_su_grafica_con_umbral", Boolean(historiaLista)
        && resumen.tarjetas === 6
        && resumen.graficas === resumen.tarjetas
        && resumen.pies === resumen.tarjetas
        && resumen.tirasConLectura >= 4
        && resumen.sinUmbral === 0
        && resumen.lineasUmbral >= 8
        && resumen.etiquetasUmbral.length >= 6
        && resumen.etiquetasUmbral.every((texto) => /óptimo|tope|piso/.test(texto))
        // Un dial sin lectura admite el hueco: una aguja en cero seria un dato
        // inventado, y lo no medido no es cero.
        && (resumen.agujas + resumen.dialSinLectura) === resumen.diales
        && !/Actividad de hoy|Usuarios activos|Sesiones activas|Conexiones WebSocket|Pings GPS/
          .test(resumen.rotulos.join(" | ")), {
        historia_esperada: Boolean(historiaLista),
        tarjetas: resumen.tarjetas, graficas: resumen.graficas, pies: resumen.pies,
        tiras_con_lectura: resumen.tirasConLectura, sin_umbral: resumen.sinUmbral,
        lineas_umbral: resumen.lineasUmbral,
        etiquetas: resumen.etiquetasUmbral, rotulos: resumen.rotulos,
        diales: resumen.diales, agujas: resumen.agujas, dial_sin_lectura: resumen.dialSinLectura
      });
      // La barra del pie del cockpit es la cuenta del puesto: cuantos contadores
      // se midieron y que sigue abierto, no un numero inventado por la interfaz.
      assert("browser_cockpit_status_bar", resumen.chips.length >= 4
        && /Contadores: \d+/.test(resumen.chips.join(" | "))
        && /Errores: \d+/.test(resumen.chips.join(" | "))
        && /Advertencias: \d+/.test(resumen.chips.join(" | "))
        && /Alertas abiertas: \d+/.test(resumen.chips.join(" | ")), { chips: resumen.chips });
      // La lista de enlaces ya no se limita a cuatro vistas: el medidor de la nube
      // y el del puesto tambien responden desde el resumen.
      assert("browser_bandas_sin_jerga", resumen.bandas.every((banda) => /Óptimo|En riesgo|Crítico|Sin dato|Informativo/.test(banda))
        && resumen.enlaces.every((view) => /latencia|api|modulos|datos|nube|operacion/.test(view)), {
        bandas: resumen.bandas, enlaces: resumen.enlaces
      });
      // Las seis teselas del cockpit reparten la pantalla entre las tres vistas que
      // responden sus preguntas (API, Base de datos y Modulos): lo que se exige es que
      // ninguna se quede sin destino y que el Resumen no mande todo a un solo sitio.
      assert("browser_cada_pregunta_apunta_a_su_vista", new Set(resumen.enlaces).size >= 3
        && resumen.enlaces.length === 6, { vistas: resumen.enlaces, pregunta: resumen.pregunta });

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
            const hero = document.querySelector('#cockpitHero .cockpit-hero');
            return hero ? (hero.querySelector('.hero-limits') || {}).textContent || '' : '';
          })(),
          tope: (() => {
            const linea = Array.from(document.querySelectorAll('#performance .chart-label'))
              .find((n) => /^tope /.test(n.textContent.trim()));
            return linea ? { y: Number(linea.getAttribute('y')), texto: linea.textContent.trim() } : null;
          })(),
          estadisticas: document.querySelectorAll('.perf-stat').length,
          textoStats: Array.from(document.querySelectorAll('.perf-stat')).map((n) => n.textContent.replace(/\\s+/g, " ").trim()),
          checks: Array.from(document.querySelectorAll('#checks .check')).filter(${visible}).length,
          sondas: document.getElementById('probeMeta').textContent.trim(),
          sondasContenido: document.getElementById('checks').innerHTML.trim().length,
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
      // La lista de sondas ya no se pinta entera: se dibujan las que tienen
      // problema (la que no respondio o cuyo viaje cruzo el tope firmado por el
      // servidor) y el pie dice cuantas quedan en verde. Ciento veinte tarjetas no
      // responden ninguna pregunta.
      assert("browser_latencia_muestra_las_sondas", Boolean(latencia) && latencia.checks >= 0
        && latencia.checks <= 10 && latencia.sondasContenido > 40
        && / sondas · \d+ en verde · \d+ fallan o avisan/.test(latencia.sondas)
        && latencia.secciones === 2, {
        checks: latencia ? latencia.checks : 0, sondas: latencia ? latencia.sondas : "",
        secciones: latencia ? latencia.secciones : 0
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
          graficas: document.querySelectorAll('#kpis .monitor-chart').length,
          sinUmbral: ${sinGrafica("#kpis .metric-tile")},
          lineasUmbral: document.querySelectorAll('#kpis .threshold-chart .chart-optimal, #kpis .threshold-chart .chart-risk').length,
          etiquetasUmbral: Array.from(document.querySelectorAll('#kpis .threshold-chart .chart-label')).map((n) => n.textContent.trim()),
          graficasComponentes: document.querySelectorAll('#components .monitor-chart').length,
          sinUmbralComponentes: ${sinGrafica("#components .component-row")},
          graficasSondas: document.querySelectorAll('#checks .monitor-chart').length,
          sinUmbralSondas: ${sinGrafica("#checks .check")},
          presion: (() => {
            const tarjeta = Array.from(document.querySelectorAll('#kpis .metric-tile'))
              .filter((n) => n.offsetParent !== null)
              .find((n) => /Presión de heap/.test(n.textContent));
            return tarjeta ? tarjeta.textContent.replace(/\\s+/g, " ").trim() : "";
          })(),
          sondas: document.querySelectorAll('#checks .check').length,
          tecnicos: document.querySelectorAll('details.tech').length
        };
        return leido.componentes >= 6 && /\d/.test(leido.base) ? leido : null;
      })()`), 45000);
      assert("browser_vista_api_con_componentes_reales", Boolean(apiVista)
        && apiVista.componentes >= 6
        && apiVista.componentes <= 8
        && /\d+ componentes · \d+ con latencia medida/.test(apiVista.metas)
        && /\d+ ms/.test(apiVista.base), apiVista);
      // El recorte deja las cuatro teselas que responden "¿el API esta optimo con la
      // carga que tiene?" (la seleccion la firma metrics.VIEW_SHORTLIST) y ninguna se
      // pinta con un numero suelto: cada una trae su grafica tipo latencia y, si el
      // corte aun no existe, la propia tesela lo dice.
      assert("browser_vista_api_teselas_tecnicas", Boolean(apiVista)
        && apiVista.teselas === 4
        && apiVista.graficas === apiVista.teselas
        && apiVista.sinUmbral === 0
        && apiVista.lineasUmbral >= 4
        && apiVista.etiquetasUmbral.every((texto) => /óptimo|tope|piso/.test(texto)), {
        teselas: apiVista ? apiVista.teselas : 0,
        graficas: apiVista ? apiVista.graficas : 0,
        sin_umbral: apiVista ? apiVista.sinUmbral : 0,
        lineas_umbral: apiVista ? apiVista.lineasUmbral : 0,
        etiquetas: apiVista ? apiVista.etiquetasUmbral : []
      });
      // La memoria del proceso no se borro del panel: la magnitud que decide es la
      // presion de heap (usage sobre el presupuesto), y ahora lleva su corte
      // versionado visible. El RSS sigue publicado por el servidor, pero dejo de
      // ocupar pantalla porque no responde ninguna pregunta del dueno.
      assert("browser_telemetria_proceso_con_umbral", Boolean(apiVista)
        && /\d/.test(apiVista.presion) && /óptimo|tope/i.test(apiVista.presion), {
        presion: apiVista ? apiVista.presion : "", runtimePublished
      });
      // Cada sonda y cada componente es un medidor mas: su grafica con el corte
      // que el servidor publico (el de la sonda de la torre, el propio del servicio).
      assert("browser_componentes_y_sondas_con_historia", Boolean(apiVista)
        && apiVista.graficasComponentes === apiVista.componentes
        && apiVista.sinUmbralComponentes === 0
        && apiVista.graficasSondas >= 1
        && apiVista.graficasSondas <= 10
        && apiVista.sinUmbralSondas === 0, {
        componentes: apiVista ? apiVista.componentes : 0,
        graficas_componentes: apiVista ? apiVista.graficasComponentes : 0,
        graficas_sondas: apiVista ? apiVista.graficasSondas : 0,
        sondas_sin_umbral: apiVista ? apiVista.sinUmbralSondas : 0
      });
      // El detalle tecnico sigue vivo, pero viaja con las sondas que tienen
      // problema: ya no se abren ciento veinte bloques para leer uno.
      const technicalDetails = apiVista ? apiVista.tecnicos : 0;
      assert("browser_technical_details", technicalDetails >= 1 && apiVista.sondas <= 10, {
        details: technicalDetails, sondas: apiVista ? apiVista.sondas : 0
      });
      const shotApi = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-vista-api.png"));
      assert("browser_vista_api_capturada", shotApi > 20000, { bytes: shotApi });

      // --- Vista Modulos: un solo mapa con la API arriba de cada modulo.
      await chrome.cdp.evaluate(`document.querySelector('[data-view="modulos"]').click()`);
      // En simulacion el catalogo no publica frescura ni registros por modulo, asi
      // que el mapa dibuja lo que si tiene lectura o una banda mala y cuenta en una
      // sola linea lo que no: exigirle tres renglones dibujados seria certificar un
      // imposible. La estructura (un renglon = una grafica, ninguna sin umbral, la
      // cabecera que cuenta los sondeos y la linea que admite los silentes) se
      // afirma aqui; la profundidad con dato real se afirma en la fase real.
      const leidoMapa = `(() => {
        const visibles = (n) => n.offsetParent !== null;
        return {
          filas: Array.from(document.querySelectorAll('#moduleMap .map-row')).filter(visibles).length,
          graficas: Array.from(document.querySelectorAll('#moduleMap .map-strip.map-chart')).filter(visibles).length,
          sinUmbral: ${sinGrafica("#moduleMap .map-row")},
          leyenda: document.getElementById('moduleMapMeta').textContent.trim(),
          silencio: (document.querySelector('#moduleMap .map-silent') || {}).textContent || '',
          veredicto: (document.querySelector('#modulesVerdict .verdict-question') || {}).textContent || ''
        };
      })()`;
      const mapaListo = await waitFor(async () => {
        const leido = await chrome.cdp.evaluate(leidoMapa);
        return leido.filas >= 1 && leido.graficas === leido.filas && /módulos dibujados · \d+ sondeos/.test(leido.leyenda) ? leido : null;
      }, 20000);
      assert("browser_modulos_mapa_unico", Boolean(mapaListo)
        && mapaListo.sinUmbral === 0
        && (mapaListo.filas >= 3 || /sin lectura medida/.test(mapaListo.silencio)), mapaListo);
      assert("browser_modulos_veredicto_preguntado", mapaListo
        && mapaListo.veredicto === "¿Los módulos están óptimos y al día?", {
        veredicto: mapaListo ? mapaListo.veredicto : null
      });
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
          graficas: document.querySelectorAll('#databaseKpis .monitor-chart').length,
          sinUmbral: ${sinGrafica("#databaseKpis .metric-tile")},
          columnas: document.querySelectorAll('#databaseVolume th').length,
          vacio: (document.querySelector('#databaseVolume .empty') || {}).textContent || '',
          metas: document.getElementById('databaseMeta').textContent.trim(),
          empresas: Array.from(document.querySelectorAll('#tenants .metric-tile, #tenants .action-item')).filter(${visible}).length
        };
        return leido.teselas === 4 && leido.veredicto && leido.columnas === 0 && /SIMULACION/.test(leido.vacio) ? leido : null;
      })()`), 12000);
      // La banda de la vista ya no redacta una frase propia: nombra el peor
      // medidor medido y su banda, y la regla cita los topes del servidor.
      assert("browser_datos_veredicto_de_base", Boolean(datos)
        && datos.pregunta === "¿La base está rápida y con datos reales?"
        && /· (Óptimo|En riesgo|Crítico)$/.test(datos.veredicto)
        && /óptimo ≤/.test(datos.regla)
        && /registros medidos|conteo de registros/.test(datos.regla), datos);
      assert("browser_datos_teselas_con_historia", Boolean(datos)
        && datos.graficas === datos.teselas && datos.sinUmbral === 0, {
        teselas: datos ? datos.teselas : 0, graficas: datos ? datos.graficas : 0,
        sin_umbral: datos ? datos.sinUmbral : 0
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
          graficas: document.querySelectorAll('#operationKpis .monitor-chart').length,
          pies: document.querySelectorAll('#operationKpis .monitor-chart-foot').length,
          sinUmbral: ${sinGrafica("#operationKpis .metric-tile")}
        };
        return leido.teselas === 2 && leido.pregunta ? leido : null;
      })()`), 12000);
      assert("browser_operacion_mesa_con_historia", Boolean(operacion)
        && operacion.pregunta === "¿Qué se está haciendo y qué falta?"
        && /· (Óptimo|En riesgo|Crítico|Sin dato)$/.test(operacion.veredicto)
        && operacion.graficas === operacion.teselas
        && operacion.pies === operacion.teselas
        && operacion.sinUmbral === 0, operacion);
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
    // La fase real se espera leyendo el ambiente hasta que la API del puesto
    // responda por si sola. Si no lo hace, la evidencia tiene que decir QUE parte
    // falto (fuente, componentes, registros o latencia de la base), no un null.
    let localReal = null;
    let ultimaLectura = null;
    const deadlineReal = Date.now() + 150000;
    while (!localReal && Date.now() < deadlineReal) {
      try {
        const env = (await request(liveBase, "/api/status")).body.snapshot.environments.local;
        ultimaLectura = {
          fuente: env && env.modules ? env.modules.source : null,
          componentes: env && env.components ? env.components.length : 0,
          registros: env && env.modules ? metrics.totalRecords(env.modules.modules) : null,
          db_ms: env && env.components ? metrics.componentLatency(env.components, "db") : null,
          sondeos: env && env.moduleHistory ? env.moduleHistory.length : 0
        };
        const listo = env && env.modules && env.modules.source === "api"
          && env.components && env.components.length
          && metrics.totalRecords(env.modules.modules) > 0
          && metrics.componentLatency(env.components, "db") !== null;
        if (listo) localReal = env;
      } catch (error) {
        ultimaLectura = { error: String(error.message || error).slice(0, 160) };
      }
      if (!localReal) await sleep(2000);
    }
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
      muestras_latencia: localReal && localReal.latency ? localReal.latency.samples : 0,
      ultima_lectura: ultimaLectura
    });
    assert("mapa_real_de_modulos", Boolean(localReal) && localReal.moduleHistory.length >= 1
      && Object.keys(localReal.moduleHistory[localReal.moduleHistory.length - 1].ticks).length >= 3, {
      sondeos: localReal ? localReal.moduleHistory.length : 0,
      modulos_del_ultimo_sondeo: localReal
        ? Object.keys(localReal.moduleHistory[localReal.moduleHistory.length - 1].ticks).length
        : 0,
      ultima_lectura: ultimaLectura
    });

    if (chrome && !browserError && localReal) {
      const visibleReal = `(n) => n.offsetParent !== null`;
      try {
        await chrome.cdp.send("Page.navigate", { url: liveBase });
        await waitFor(() => chrome.cdp.evaluate(`document.querySelectorAll('#cockpitTiles .cockpit-tile').length === 6`).catch(() => false), 20000);
        // La profundidad del cockpit se pide aqui, no en simulacion: con la fuente
        // real del puesto, registros, frescura y cobertura dejan de ser un hueco y
        // el grafico de la tesela se traza con sus dos lecturas.
        const cockpitRealListo = await waitFor(() => chrome.cdp.evaluate(
          `document.querySelectorAll('#cockpitHero .monitor-chart svg, #cockpitTiles .monitor-chart svg').length >= 5`
        ).catch(() => false), 90000);
        const cockpitReal = await chrome.cdp.evaluate(`(() => {
          const visibles = (n) => n.offsetParent !== null;
          return {
            tarjetas: Array.from(document.querySelectorAll('#cockpitTiles .cockpit-tile')).filter(visibles).length,
            graficas: Array.from(document.querySelectorAll('#cockpitTiles .monitor-chart')).filter(visibles).length,
            tirasConLectura: document.querySelectorAll('#cockpitHero .monitor-chart svg, #cockpitTiles .monitor-chart svg').length,
            sinUmbral: ${sinGrafica("#cockpitTiles .cockpit-tile")},
            metas: document.getElementById('cockpitMeta').textContent.trim()
          };
        })()`).catch(() => null);
        assert("browser_cockpit_con_historia_real", Boolean(cockpitRealListo) && Boolean(cockpitReal)
          && cockpitReal.tarjetas === 6 && cockpitReal.graficas === cockpitReal.tarjetas
          && cockpitReal.tirasConLectura >= 5 && cockpitReal.sinUmbral === 0
          && /\d+ de \d+ medidores/.test(cockpitReal.metas), {
          espera: Boolean(cockpitRealListo), ...(cockpitReal || {})
        });
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
            graficas: document.querySelectorAll('#databaseKpis .monitor-chart').length,
            sinUmbral: ${sinGrafica("#databaseKpis .metric-tile")}
          };
          return leido.filas >= 3 && leido.columnas >= 6 ? leido : null;
        })()`).catch(() => null), 20000);
        assert("browser_datos_con_volumen_real", Boolean(datosReales)
          && /^\d+ módulos con conteo/.test(datosReales.conteo)
          && !/^0 módulos con conteo/.test(datosReales.conteo)
          && datosReales.pregunta === "¿La base está rápida y con datos reales?"
          && /· (Óptimo|En riesgo|Crítico)$/.test(datosReales.veredicto)
          && /registros medidos en \d+ módulos con conteo/.test(datosReales.regla)
          && datosReales.teselas === 4
          && datosReales.graficas === datosReales.teselas
          && datosReales.sinUmbral === 0, datosReales);
        await chrome.cdp.evaluate(`window.scrollTo(0, 0)`);
        const shotReales = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-datos-reales.png"), { fullPage: false });
        assert("browser_vista_datos_reales_capturada", shotReales > 20000, { bytes: shotReales });

        await chrome.cdp.evaluate(`document.querySelector('[data-view="modulos"]').click()`);
        const modulosReales = await waitFor(() => chrome.cdp.evaluate(`(() => {
          const leido = {
            filas: Array.from(document.querySelectorAll('#moduleMap .map-row')).filter(${visibleReal}).length,
            graficas: Array.from(document.querySelectorAll('#moduleMap .map-strip.map-chart')).filter(${visibleReal}).length,
            conRegistros: Array.from(document.querySelectorAll('#moduleMap .map-strip.map-chart svg title'))
              .filter((n) => /registros/.test(n.textContent)).length,
            sinUmbral: ${sinGrafica("#moduleMap .map-row")},
            leyenda: document.getElementById('moduleMapMeta').textContent.trim()
          };
          return leido.filas >= 3 && leido.graficas === leido.filas && leido.conRegistros >= 3 ? leido : null;
        })()`).catch(() => null), 20000);
        assert("browser_modulos_con_datos_reales", Boolean(modulosReales)
          && /sondeos/.test(modulosReales.leyenda)
          && modulosReales.conRegistros >= 3 && modulosReales.sinUmbral === 0, modulosReales);
        await chrome.cdp.evaluate(`window.scrollTo(0, 0)`);
        const shotModulosReales = await chrome.cdp.screenshot(path.join(EVIDENCE_DIR, "tower-modulos-reales.png"), { fullPage: false });
        assert("browser_vista_modulos_reales_capturada", shotModulosReales > 20000, { bytes: shotModulosReales });
      } finally {
        // La pagina no puede quedarse apuntando a la torre real que ya se detiene:
        // sus reintentos de SSE llenarian la consola de errores y el resto del
        // script esta leerian otra interfaz distinta a la que se certifica.
        await chrome.cdp.send("Page.navigate", { url: base }).catch(() => {});
        await waitFor(() => chrome.cdp.evaluate(`document.querySelectorAll('#cockpitTiles .cockpit-tile').length === 6`).catch(() => false), 20000);
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
