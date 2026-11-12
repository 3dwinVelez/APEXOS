"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadConfig, safeConfig } = require("./lib/config");
const { Store } = require("./lib/store");
const { Jobs } = require("./lib/jobs");
const { AlertEngine } = require("./lib/alerts");
const { TelegramChannel } = require("./lib/telegram");
const { runAllProbes, computeOverall, computeSummary } = require("./lib/probes");
const { PerformanceTracker } = require("./lib/performance");
const { diagnoseCheck } = require("./lib/diagnostics");
const { collectGitState, runGit, clearRemoteCache } = require("./lib/git");
const { fetchModules, REASON_DETAIL } = require("./lib/modules");
const { recommendationsFor } = require("./lib/recommendations");
const { GAUGES, gaugesFor, latencyVerdict, p95Definition, componentBands, viewVerdicts, viewVerdict, cockpitFor, viewGaugesFor, operationGauges, bandFromEntry, bandForValue, probeBand, applyWindowLimits, windowLimits } = require("./lib/metrics");
const { ModuleTelemetry } = require("./lib/telemetry");
const { createCredentialPump } = require("./lib/credential");
const { MonitorHistory, measuredSeries, measuredValues } = require("./lib/monitor-history");
const { computeHealth, withModuleBands } = require("./lib/health");
const { createAuthGuard, createRateLimiter, safeEqual, readToken, assertLoopback, redact, isPlainObject } = require("./lib/security");

const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 256 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

// Los tres destinos de la nube que la torre sondea: su viaje torre->SaaS tiene
// un presupuesto propio (GAUGES.cloudLatency) y no se banda contra el del API.
const CLOUD_SOURCES = Object.freeze(["railway", "vercel", "supabase"]);

function json(res, status, body) {  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("cuerpo demasiado grande"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(isPlainObject(parsed) ? parsed : {});
      } catch {
        reject(Object.assign(new Error("JSON invalido"), { status: 400 }));
      }
    });
    req.on("error", (error) => reject(error));
  });
}

function hostnameOf(header) {
  if (!header) return "";
  const value = String(header).trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  return value.split(":")[0];
}

function isLoopbackHost(header) {
  return ["127.0.0.1", "localhost", "::1"].includes(hostnameOf(header));
}

function eventId() {
  return `EVT-${crypto.randomBytes(3).toString("hex")}`;
}

// Adjunta lo que el panel pinta: medidores bandeados, veredicto de latencia e
// historial de ticks. Es puro sobre el snapshot; el registro del sondeo ocurre
// antes, sobre la lectura real, para que una simulacion no contamine el anillo
// persistido.
function attachIndicators(snapshot, telemetry, monitors, operation = []) {
  for (const [id, environment] of Object.entries((snapshot && snapshot.environments) || {})) {
    const definition = p95Definition(id);
    environment.gauges = gaugesFor(environment, { checks: snapshot.checks });
    // Un veredicto por vista-pregunta, con la peor banda entre sus medidores. La
    // vista Latencia conserva su veredicto propio (sostenido vs pico), que es mas
    // fino que la peor banda de un solo numero.
    environment.verdicts = viewVerdicts(environment.gauges);
    // El Resumen ya no firma su veredicto sobre los dieciseis medidores del
    // ambiente: lo firma el cockpit, sobre los nueve que efectivamente se pintan.
    // Asi el encabezado no puede gritar "critico" por una magnitud que el dueño
    // no tiene en pantalla.
    if (Array.isArray(environment.components) && environment.components.length) {
      environment.components = componentBands(environment.components);
    }
    environment.moduleHistory = telemetry ? telemetry.seriesFor(id, { size: 24 }) : [];
    // El anillo guarda lo que este sondeo realmente midio, no lo que el navegador
    // quiera dibujar: cada monitor se pinta con su propia historia y una muestra
    // que no existio queda como hueco visible, nunca como un cero inventado.
    if (monitors) {
      const ownChecks = (Array.isArray(snapshot.checks) ? snapshot.checks : [])
        .filter((check) => check && String(check.environment || "local") === id);
      monitors.record(id, snapshot.at, {
        gauges: environment.gauges,
        components: environment.components,
        checks: ownChecks
      });
      const history = monitors.seriesFor(id, { size: 24 });
      // La ventana es el numero de sondeos guardados; las muestras que llegaron
      // por otra via (un sondeo sin lectura de este monitor) se cuentan aparte,
      // para que el panel pueda decir "20 de 24" en lugar de fingir una serie llena.
      const polls = history.length;
      for (const entry of environment.gauges) {
        // Primero la ventana: un medidor sin presupuesto versionado recibe su corte
        // calculado sobre sus propias lecturas, y solo despues se bandea. Asi el
        // grafico del monitor siempre tiene su barra de comportamiento o dice
        // cuantas lecturas faltan para trazarla.
        applyWindowLimits(entry, measuredValues(history, "gauges", entry.key));
        entry.series = measuredSeries(history, "gauges", entry.key, (value) => bandFromEntry(entry, value));
        entry.window = polls;
      }
      for (const component of Array.isArray(environment.components) ? environment.components : []) {
        // La base tiene tope versionado; el resto de los componentes no, y su
        // referencia es la banda habitual de sus propias lecturas. La banda del
        // valor actual la firma el estado del componente (un caido es critico con
        // cualquier latencia); el corte solo decide como se colorea la serie.
        const windowed = { direction: "relative", watch: "up", limitsFrom: "window" };
        component.limits = component.key === "db"
          ? { optimal: GAUGES.dbLatency.optimal, risk: GAUGES.dbLatency.risk, kind: "budget", unit: "ms" }
          : windowLimits(windowed, measuredValues(history, "components", component.key));
        const reference = component.key === "db" ? GAUGES.dbLatency : { ...windowed, limits: component.limits };
        component.series = measuredSeries(history, "components", component.key, (value) =>
          bandFromEntry(reference, value));
        component.window = polls;
      }
      for (const check of ownChecks) {
        // La sonda viaja desde la torre, asi que su corte es el presupuesto de
        // sondeo del ambiente, no el del API sondeado. Excepto cuando el destino
        // es un servicio de la nube: ese viaje incluye DNS + TLS + el proveedor y
        // su corte es el de la nube, no el presupuesto local.
        const cloud = CLOUD_SOURCES.includes(check.source);
        const cuts = cloud ? GAUGES.cloudLatency : definition;
        const bandOfTrip = (value) =>
          (cloud ? bandForValue(GAUGES.cloudLatency, value) : probeBand(value, true, id));
        check.limits = { optimal: cuts.optimal, risk: cuts.risk, kind: "budget", unit: "ms" };
        // La banda de la sonda la firma el servidor sobre su viaje medido: una
        // sonda puede responder "ok" y aun asi pasar el tope del trayecto (el
        // viaje a la nube incluye DNS + TLS + proveedor). La lista de sondas con
        // problema se filtra con esta banda y no con un criterio del navegador.
        check.band = check.status && check.status !== "ok"
          ? "critical"
          : bandOfTrip(check.durationMs);
        check.series = measuredSeries(history, "checks", String(check.id), bandOfTrip);
        check.window = polls;
      }
      // La tarjeta del proveedor se pinta con la historia de su propia sonda: el
      // viaje torre->proveedor es el unico numero medido de esa tarjeta, y el
      // panel no debe buscarlo en otro sitio. Los cortes viajan con la serie para
      // que el grafico dibuje la misma raya que el servidor banda.
      if (environment.cloud) {
        for (const source of CLOUD_SOURCES) {
          const match = ownChecks.find((check) => check.source === source);
          if (environment.cloud[source] && match) {
            environment.cloud[source].series = match.series;
            environment.cloud[source].window = match.window;
            environment.cloud[source].limits = match.limits;
            environment.cloud[source].direction = GAUGES.cloudLatency.direction;
            environment.cloud[source].unit = GAUGES.cloudLatency.unit;
          }
        }
      }
    }
    // La seleccion del cockpit y la de cada vista la firma el servidor: el
    // navegador pinta los nueve indicadores del Resumen y las cuatro teselas de
    // cada detalle, y no decide cantidades ni nombres. La vista Operacion no vive
    // en el ambiente sino en el puesto, asi que sus medidores entran por el
    // parametro: sin ellos la publicacion diria "ningun medidor" donde si hay dos.
    environment.cockpit = cockpitFor(environment, operation);
    environment.viewGauges = viewGaugesFor(environment, operation);
    environment.verdicts.resumen = environment.cockpit.verdict;
    // El veredicto lo firma el servidor sobre muestras medidas: un p95 aislado no
    // dice si la franja fue continua, y esa diferencia es la que separa
    // "atender" de "vigilar el evento".
    environment.latency = latencyVerdict(
      environment.performance ? environment.performance.series : [],
      definition.risk
    );
  }
  return snapshot;
}

function recordModuleTicks(probe, telemetry, metrics) {
  const apiByEnvironment = new Map((metrics || []).map((metric) => [String(metric.environment), metric]));
  for (const [id, environment] of Object.entries((probe && probe.environments) || {})) {
    const modules = environment.modules && Array.isArray(environment.modules.modules)
      ? environment.modules.modules
      : [];
    if (modules.length) telemetry.record(id, modules, probe.at, apiByEnvironment.get(id) || null);
  }
  return telemetry;
}

function attachRecommendations(snapshot) {
  for (const environment of Object.values((snapshot && snapshot.environments) || {})) {
    environment.recommendations = recommendationsFor(environment, { performance: environment.performance });
  }
  return snapshot;
}

function reasonRecommendation(environment, deployed, reason) {
  const [recommendation] = recommendationsFor({
    id: environment.id,
    short: environment.short,
    enabled: true,
    apiBaseUrl: environment.apiBaseUrl,
    webBaseUrl: environment.webBaseUrl,
    deployed: deployed || null,
    modules: { reason: reason || "NO_DISPONIBLE", modules: [] },
    health: { band: null }
  }, {});
  return recommendation || null;
}

function createTower(overrides = {}) {
  const config = loadConfig(overrides);
  if (!assertLoopback(config.host) && !config.uiToken) {
    throw new Error("TOWER_UI_TOKEN es obligatorio cuando TOWER_HOST no es loopback");
  }

  const store = new Store({ dataDir: config.dataDir, alertMax: config.alerts.max }).init();
  const performance = new PerformanceTracker({ persisted: store.readAux("performance", {}) });
  const telemetry = new ModuleTelemetry({ persisted: store.readAux("module-telemetry", {}) });
  const monitors = new MonitorHistory({ persisted: store.readAux("monitor-history", {}) });
  // La credencial de cada ambiente se renueva antes de vencer: sin este bombeo el
  // JWT de ocho horas caducaba y los puntos de medicion bajaban solos a catalogo.
  const credentials = createCredentialPump({ config, store });
  const jobs = new Jobs({ store });
  const clients = new Set();
  const overridesMap = new Map();
  const mutationLimiter = createRateLimiter({ limit: 60, windowMs: 60000 });
  const fetchLimiter = createRateLimiter({ limit: 1, windowMs: 30000 });
  const tenantLimiter = createRateLimiter({ limit: 30, windowMs: 60000 });
  const state = {
    snapshot: null,
    git: null,
    operation: null,
    bridge: { bridgeId: null, lastSeenAt: null },
    staleNotifiedFor: null
  };

  const tower = {
    config,
    store,
    jobs,
    performance,
    credentials,
    state,
    server: null,
    timer: null,
    alerts: null,
    telegram: null,
    startedAt: new Date().toISOString()
  };

  function broadcast(type, payload) {
    const frame = `data: ${JSON.stringify({ type, at: new Date().toISOString(), payload })}\n\n`;
    for (const client of clients) {
      try {
        client.write(frame);
      } catch {
        clients.delete(client);
      }
    }
  }

  tower.alerts = new AlertEngine({
    store,
    config,
    onOpen: (alert) => {
      broadcast("alert.opened", alert);
      if (tower.telegram) tower.telegram.notifyAlert(alert, "opened").catch(() => {});
    },
    onResolve: (alert) => {
      broadcast("alert.resolved", alert);
      if (tower.telegram) tower.telegram.notifyAlert(alert, "resolved").catch(() => {});
    }
  });

  function bridgeStatus() {
    const lastSeenAt = state.bridge.lastSeenAt;
    const seenMs = lastSeenAt ? Date.parse(lastSeenAt) : 0;
    const online = Boolean(seenMs) && Date.now() - seenMs < config.bridge.offlineMs;
    const active = jobs.jobs.find((job) => ["claimed", "running"].includes(job.status));
    return {
      bridgeId: state.bridge.bridgeId,
      online,
      lastSeenAt,
      offlineMs: config.bridge.offlineMs,
      activeJobId: active ? active.id : null,
      activeStatus: active ? active.status : null,
      queued: jobs.jobs.filter((job) => job.status === "queued").length
    };
  }

  tower.telegram = new TelegramChannel({
    config,
    jobs,
    alerts: tower.alerts,
    store,
    getSnapshot: () => state.snapshot,
    getGit: () => state.git,
    getBridgeStatus: bridgeStatus,
    onEvent: (event) => broadcast("telegram", event)
  });

  function recomputeSnapshot(snapshot) {
    snapshot.summary = computeSummary(snapshot.checks);
    snapshot.overall = computeOverall(snapshot.checks);
    for (const [id, environment] of Object.entries(snapshot.environments || {})) {
      const checks = snapshot.checks.filter((check) => check.environment === id);
      environment.summary = computeSummary(checks);
      environment.overall = environment.enabled ? computeOverall(checks) : "unknown";
    }
    return snapshot;
  }

  function applyOverrides(snapshot) {
    if (!config.simulation || overridesMap.size === 0) return snapshot;
    snapshot.checks = snapshot.checks.map((check) => {
      if (!overridesMap.has(check.id)) return check;
      return diagnoseCheck({ ...check, status: overridesMap.get(check.id), detail: "Estado simulado por certificacion", synthetic: true });
    });
    snapshot.synthetic = true;
    return recomputeSnapshot(snapshot);
  }

  function gitSummary(git) {
    if (!git) return null;
    return {
      at: git.at,
      status: git.status,
      flowOk: git.flowOk,
      current: git.worktree.branch,
      clean: git.worktree.clean,
      warnings: git.warnings,
      branches: git.branches.map((branch) => ({
        name: branch.name,
        relation: branch.relation,
        ahead: branch.ahead,
        behind: branch.behind,
        current: branch.current
      }))
    };
  }

  // La mesa del puesto no vive en un ambiente: sus medidores se calculan con las
  // alertas abiertas y los trabajos que esperan aprobación, con el mismo modelo de
  // banda y de historia que el resto de las vistas. Se pide la lista completa de
  // abiertas, no las 20 que pinta el panel, para no contar de menos. Se graba una
  // vez por sondeo, no por lectura del navegador: la historia mide el puesto, no
  // cuantas veces alguien abrio la pestaña.
  function publishOperation() {
    const list = operationGauges({
      alerts: tower.alerts.list({ onlyOpen: true, limit: 200 }),
      jobs: jobs.stats()
    });
    monitors.record("puesto", new Date().toISOString(), { gauges: list });
    const history = monitors.seriesFor("puesto", { size: 24 });
    for (const entry of list) {
      entry.series = measuredSeries(history, "gauges", entry.key, (value) => bandFromEntry(entry, value));
      entry.window = history.length;
    }
    return { gauges: list, verdict: viewVerdict(list, null, "operacion") };
  }

  async function collect() {
    // El bombeo va antes del sondeo: las sondas leen con la credencial del ciclo,
    // no con la que quedo en el archivo al arrancar la torre.
    await credentials.ensure();
    const [probeResult, gitResult] = await Promise.allSettled([runAllProbes(config), collectGitState(config)]);

    if (probeResult.status === "fulfilled") {
      performance.recordAll(probeResult.value.metrics);
      const probeMetrics = probeResult.value.metrics;
      delete probeResult.value.metrics;
      const summaries = performance.all(Object.keys(probeResult.value.environments));
      probeResult.value.performance = summaries;
      for (const [id, environment] of Object.entries(probeResult.value.environments)) {
        environment.performance = summaries[id] || null;
        environment.credential = credentials.statusFor(id) || null;
      }
      store.writeAux("performance", performance.toJSON());
      recordModuleTicks(probeResult.value, telemetry, probeMetrics);
      store.writeAux("module-telemetry", telemetry.toJSON());
      const snapshot = applyOverrides(probeResult.value);
      attachRecommendations(snapshot);
      // La mesa del puesto se publica antes de adjuntar los indicadores: la
      // seleccion versionada de la vista Operacion necesita sus medidores para no
      // dejar la vista publicada en vacio.
      state.operation = publishOperation();
      attachIndicators(snapshot, telemetry, monitors, state.operation ? state.operation.gauges : []);
      // El anillo se escribe despues de grabar los tres ambitos del ciclo (los tres
      // ambientes y la mesa del puesto) para que el archivo sea una foto del sondeo.
      store.writeAux("monitor-history", monitors.toJSON());
      state.snapshot = snapshot;
      store.setSnapshot({ ...snapshot, git: gitSummary(state.git) });
      tower.alerts.evaluate(snapshot);
      broadcast("snapshot", { ...snapshot, git: gitSummary(state.git) });
    } else {
      store.addEvent({ id: eventId(), at: new Date().toISOString(), kind: "probe.error", message: redact(String(probeResult.reason)) });
    }

    if (gitResult.status === "fulfilled") {
      state.git = gitResult.value;
      broadcast("git", state.git);
    } else {
      store.addEvent({ id: eventId(), at: new Date().toISOString(), kind: "git.error", message: redact(String(gitResult.reason)) });
    }

    broadcast("bridge", bridgeStatus());
    return { snapshot: state.snapshot, git: state.git };
  }

  function checkStaleBridge() {
    const stale = jobs.staleClaim({ offlineMs: config.bridge.offlineMs });
    if (!stale) {
      if (state.staleNotifiedFor && !jobs.jobs.some((job) => job.id === state.staleNotifiedFor && ["claimed", "running"].includes(job.status))) {
        state.staleNotifiedFor = null;
      }
      return;
    }
    if (state.staleNotifiedFor === stale.id) return;
    state.staleNotifiedFor = stale.id;
    const message = `Puente Qoder sin latido para ${stale.id} (${stale.assignment.bridgeId || "sin id"}).`;
    store.addEvent({ id: eventId(), at: new Date().toISOString(), kind: "bridge.stale", message });
    broadcast("bridge", { ...bridgeStatus(), warning: message });
    if (["polling", "dry-run"].includes(tower.telegram.mode)) {
      for (const chatId of tower.telegram.allowedChatIds) tower.telegram.send(chatId, `[AVISO] ${message}`).catch(() => {});
    }
  }

  function requireUi(req, res) {
    if (!config.uiToken) return true;
    const guard = createAuthGuard(config.uiToken)(req);
    if (!guard.ok) {
      json(res, guard.status, { error: guard.code });
      return false;
    }
    return true;
  }

  function requireBridge(req, res) {
    if (!config.bridge.token) {
      json(res, 503, { error: "BRIDGE_TOKEN_NO_CONFIGURADO" });
      return false;
    }
    if (!safeEqual(readToken(req), config.bridge.token)) {
      json(res, 401, { error: "NO_AUTORIZADO" });
      return false;
    }
    return true;
  }

  function requireMutation(req, res) {
    const limit = mutationLimiter.check(req.socket.remoteAddress || "local");
    if (!limit.ok) {
      json(res, 429, { error: "DEMASIADAS_SOLICITUDES", retryAfterMs: limit.retryAfterMs });
      return false;
    }
    return requireUi(req, res);
  }

  function announceJob(job) {
    if (!job || job.status !== "awaiting_approval") return;
    if (!["polling", "dry-run"].includes(tower.telegram.mode)) return;
    const text = `Trabajo ${job.id} (${job.level}) requiere aprobacion.\n\n${job.instruction}\n\nDestino: ${job.target.branch || "lectura"}`;
    for (const chatId of tower.telegram.allowedChatIds) {
      tower.telegram.send(chatId, text, {
        keyboard: [[{ text: "Aprobar", callback_data: `approve:${job.id}` }, { text: "Rechazar", callback_data: `reject:${job.id}` }]]
      }).catch(() => {});
    }
  }

  function afterJob(job) {
    broadcast("job", job);
    broadcast("bridge", bridgeStatus());
  }

  async function serveStatic(res, pathname) {
    const name = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith(".")) {
      json(res, 404, { error: "NO_ENCONTRADO" });
      return;
    }
    const file = path.join(PUBLIC_DIR, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      json(res, 404, { error: "NO_ENCONTRADO" });
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(name).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
      "referrer-policy": "no-referrer"
    });
    fs.createReadStream(file).pipe(res);
  }

  async function handleApi(req, res, url) {
    const { pathname } = url;
    const method = req.method || "GET";

    if (method === "GET" && pathname === "/api/health") {
      json(res, 200, { ok: true, version: config.version, uptimeMs: Date.now() - Date.parse(tower.startedAt), now: new Date().toISOString() });
      return;
    }

    if (method === "GET" && pathname === "/api/status") {
      const alerts = tower.alerts.list({ limit: 20 });
      const jobStats = jobs.stats();
      if (!state.operation) state.operation = publishOperation();
      json(res, 200, {
        version: config.version,
        startedAt: tower.startedAt,
        uptimeMs: Date.now() - Date.parse(tower.startedAt),
        config: safeConfig(config),
        snapshot: state.snapshot,
        git: state.git,
        alerts,
        events: store.events.slice(0, 30),
        jobs: jobStats,
        jobsList: jobs.list({ limit: 20 }),
        telegram: tower.telegram.status(),
        bridge: bridgeStatus(),
        operation: state.operation,
        performance: performance.all(["local", "develop", "main"]),
        store: store.status()
      });
      return;
    }

    if (method === "GET" && pathname === "/api/snapshot") {
      json(res, 200, { snapshot: state.snapshot, git: state.git });
      return;
    }

    if (method === "GET" && pathname === "/api/environments") {
      json(res, 200, { environments: state.snapshot ? state.snapshot.environments || {} : {} });
      return;
    }

    const tenantModulesMatch = /^\/api\/tenants\/([A-Za-z0-9_-]{4,64})\/modules$/.exec(pathname);
    if (method === "GET" && tenantModulesMatch) {
      if (!requireUi(req, res)) return;
      const limit = tenantLimiter.check(req.socket.remoteAddress || "local");
      if (!limit.ok) {
        json(res, 429, { error: "DEMASIADAS_SOLICITUDES", retryAfterMs: limit.retryAfterMs });
        return;
      }
      const environmentId = String(url.searchParams.get("environment") || "local");
      const environment = config.environments[environmentId];
      if (!environment) {
        json(res, 400, { error: "AMBIENTE_INVALIDO" });
        return;
      }
      if (!environment.enabled) {
        json(res, 409, { error: "AMBIENTE_DESACTIVADO" });
        return;
      }
      // Solo se consulta una empresa que ya aparecio en la lectura agregada:
      // el endpoint no sirve para descubrir ni sondear tenants a ciegas.
      const envSnapshot = state.snapshot && state.snapshot.environments ? state.snapshot.environments[environmentId] : null;
      const activity = envSnapshot && envSnapshot.activity ? envSnapshot.activity : null;
      const tenants = activity && activity.tenants ? activity.tenants : null;
      if (!tenants) {
        const code = (activity && activity.tenantsReason) || "VISTA_EMPRESAS_NO_DISPONIBLE";
        json(res, 409, {
          error: "La lectura por empresa no esta disponible en este ambiente.",
          code,
          recommendation: reasonRecommendation(environment, envSnapshot && envSnapshot.deployed, code)
        });
        return;
      }
      const tenantId = tenantModulesMatch[1];
      const tenant = (tenants.tenants || []).find((item) => String(item.tenant_id) === tenantId);
      if (!tenant) {
        json(res, 404, {
          error: "Empresa no encontrada en la lectura vigente.",
          code: "EMPRESA_NO_ENCONTRADA",
          recommendation: reasonRecommendation(environment, envSnapshot && envSnapshot.deployed, "EMPRESA_NO_ENCONTRADA")
        });
        return;
      }

      const payload = await fetchModules(config, environment, { tenantId });
      if (!payload || payload.source !== "api") {
        const reason = payload ? payload.reason : "NO_DISPONIBLE";
        json(res, 200, {
          ok: false,
          reason,
          detail: REASON_DETAIL[reason] || "Sin salud por modulo para la empresa.",
          recommendation: reasonRecommendation(environment, envSnapshot && envSnapshot.deployed, reason),
          tenant: { id: tenantId, name: tenant.name || tenantId },
          checkedAt: payload ? payload.checkedAt : new Date().toISOString()
        });
        return;
      }

      const health = computeHealth({ modules: payload.modules });
      json(res, 200, {
        ok: true,
        reason: null,
        tenant: payload.tenant || { id: tenantId, name: tenant.name || tenantId },
        generated_at: payload.generated_at,
        checkedAt: payload.checkedAt,
        summary: payload.summary,
        health,
        recommendations: recommendationsFor({
          id: environment.id,
          short: environment.short,
          enabled: true,
          apiBaseUrl: environment.apiBaseUrl,
          deployed: (envSnapshot && envSnapshot.deployed) || null,
          modules: { reason: null, modules: payload.modules },
          activity: null,
          cloud: null,
          health
        }, {}),
        modules: withModuleBands(payload.modules, health)
      });
      return;
    }

    if (method === "GET" && pathname === "/api/performance") {
      json(res, 200, { performance: performance.all(["local", "develop", "main"]) });
      return;
    }

    if (method === "GET" && pathname === "/api/git") {
      json(res, 200, state.git || {});
      return;
    }

    if (method === "POST" && pathname === "/api/git/refresh") {
      if (!requireMutation(req, res)) return;
      clearRemoteCache();
      state.git = await collectGitState(config);
      broadcast("git", state.git);
      json(res, 200, state.git);
      return;
    }

    if (method === "POST" && pathname === "/api/actions/fetch") {
      if (!requireMutation(req, res)) return;
      const body = await readBody(req);
      if (body.confirm !== true) {
        json(res, 400, { error: "CONFIRMACION_REQUERIDA", hint: "Envia { confirm: true } para ejecutar git fetch" });
        return;
      }
      const rate = fetchLimiter.check("fetch");
      if (!rate.ok) {
        json(res, 429, { error: "ESPERA_ANTES_DE_OTRO_FETCH", retryAfterMs: rate.retryAfterMs });
        return;
      }
      const result = await runGit(["fetch", "--prune", config.git.remote], { repoRoot: config.repoRoot, timeoutMs: config.git.fetchTimeoutMs });
      clearRemoteCache();
      state.git = await collectGitState(config);
      broadcast("git", state.git);
      json(res, result.ok ? 200 : 502, { ok: result.ok, stdout: redact(result.stdout), stderr: redact(result.stderr), git: state.git });
      return;
    }

    if (method === "GET" && pathname === "/api/alerts") {
      json(res, 200, { alerts: tower.alerts.list({ onlyOpen: url.searchParams.get("open") === "1", limit: url.searchParams.get("limit") || 50 }) });
      return;
    }

    const ackMatch = /^\/api\/alerts\/([A-Za-z0-9-]+)\/ack$/.exec(pathname);
    if (method === "POST" && ackMatch) {
      if (!requireMutation(req, res)) return;
      const alert = tower.alerts.acknowledge(ackMatch[1], { by: "web" });
      if (!alert) {
        json(res, 404, { error: "ALERTA_NO_ENCONTRADA" });
        return;
      }
      broadcast("alert.acknowledged", alert);
      json(res, 200, { alert });
      return;
    }

    if (method === "POST" && pathname === "/api/alerts/ack-all") {
      if (!requireMutation(req, res)) return;
      const acknowledged = tower.alerts.ackAll({ by: "web" });
      for (const alert of acknowledged) broadcast("alert.acknowledged", alert);
      json(res, 200, { acknowledged: acknowledged.length });
      return;
    }

    if (method === "POST" && pathname === "/api/probe") {
      if (!requireMutation(req, res)) return;
      const result = await collect();
      json(res, 200, { snapshot: result.snapshot, git: result.git });
      return;
    }

    if (method === "GET" && pathname === "/api/jobs") {
      json(res, 200, { jobs: jobs.list({ status: url.searchParams.get("status"), limit: url.searchParams.get("limit") || 50 }), stats: jobs.stats() });
      return;
    }

    if (method === "POST" && pathname === "/api/jobs") {
      if (!requireMutation(req, res)) return;
      const body = await readBody(req);
      const created = jobs.create({
        instruction: body.instruction,
        level: body.level,
        requestedBy: { channel: "web", name: body.name || "panel" },
        context: {
          snapshotAt: state.snapshot ? state.snapshot.at : null,
          overall: state.snapshot ? state.snapshot.overall : null
        }
      });
      if (!created.ok) {
        json(res, 400, { error: created.code });
        return;
      }
      afterJob(created.job);
      announceJob(created.job);
      json(res, 201, { job: created.job });
      return;
    }

    const jobMatch = /^\/api\/jobs\/([A-Za-z0-9-]+)\/(approve|reject|cancel)$/.exec(pathname);
    if (method === "POST" && jobMatch) {
      if (!requireMutation(req, res)) return;
      await readBody(req);
      const [, id, action] = jobMatch;
      const result = action === "approve"
        ? jobs.approve(id, { approvedBy: "web" })
        : action === "reject"
          ? jobs.reject(id, { rejectedBy: "web" })
          : jobs.cancel(id, { by: "web" });
      if (!result.ok) {
        json(res, 409, { error: result.code });
        return;
      }
      afterJob(result.job);
      json(res, 200, { job: result.job });
      return;
    }

    if (method === "GET" && pathname === "/api/telegram") {
      json(res, 200, { telegram: tower.telegram.status(), outbox: tower.telegram.outbox.slice(0, 20) });
      return;
    }

    if (method === "POST" && pathname === "/api/telegram/pairing-code") {
      if (!requireMutation(req, res)) return;
      if (tower.telegram.mode === "off") {
        json(res, 409, { error: "TELEGRAM_DESHABILITADO" });
        return;
      }
      json(res, 200, { pairing: tower.telegram.createPairingCode() });
      return;
    }

    if (method === "POST" && pathname === "/api/telegram/simulate") {
      if (!requireMutation(req, res)) return;
      if (tower.telegram.mode !== "dry-run") {
        json(res, 409, { error: "SOLO_DRY_RUN" });
        return;
      }
      const body = await readBody(req);
      await tower.telegram.simulate(String(body.text || ""), { chatId: body.chatId || "dry-run-chat", kind: body.kind || "message" });
      json(res, 200, { outbox: tower.telegram.outbox.slice(0, 10), jobs: jobs.stats() });
      return;
    }

    if (method === "POST" && pathname === "/api/simulate/outage") {
      if (!requireMutation(req, res)) return;
      if (!config.simulation) {
        json(res, 409, { error: "SIMULACION_DESHABILITADA" });
        return;
      }
      const body = await readBody(req);
      const component = String(body.component || "");
      const status = String(body.status || "");
      if (!["ok", "degraded", "down", "unknown"].includes(status)) {
        json(res, 400, { error: "ESTADO_INVALIDO" });
        return;
      }
      if (!state.snapshot || !state.snapshot.checks.some((check) => check.id === component)) {
        json(res, 404, { error: "COMPONENTE_NO_ENCONTRADO" });
        return;
      }
      overridesMap.set(component, status);
      const result = await collect();
      json(res, 200, { snapshot: result.snapshot, overrides: Object.fromEntries(overridesMap) });
      return;
    }

    if (method === "DELETE" && pathname === "/api/simulate") {
      if (!requireMutation(req, res)) return;
      overridesMap.clear();
      const result = await collect();
      json(res, 200, { snapshot: result.snapshot, overrides: {} });
      return;
    }

    if (method === "GET" && pathname === "/api/bridge/status") {
      json(res, 200, bridgeStatus());
      return;
    }

    if (method === "POST" && pathname === "/api/bridge/register") {
      if (!requireBridge(req, res)) return;
      const body = await readBody(req);
      const bridgeId = String(body.bridgeId || "").slice(0, 120);
      if (!/^[A-Za-z0-9._:-]{3,120}$/.test(bridgeId)) {
        json(res, 400, { error: "BRIDGE_ID_INVALIDO" });
        return;
      }
      state.bridge.bridgeId = bridgeId;
      state.bridge.lastSeenAt = new Date().toISOString();
      state.staleNotifiedFor = null;
      broadcast("bridge", bridgeStatus());
      json(res, 200, bridgeStatus());
      return;
    }

    if (method === "POST" && pathname === "/api/bridge/heartbeat") {
      if (!requireBridge(req, res)) return;
      const body = await readBody(req);
      const bridgeId = String(body.bridgeId || state.bridge.bridgeId || "");
      if (!bridgeId) {
        json(res, 400, { error: "BRIDGE_ID_REQUERIDO" });
        return;
      }
      state.bridge.bridgeId = bridgeId;
      state.bridge.lastSeenAt = new Date().toISOString();
      state.staleNotifiedFor = null;
      const active = jobs.jobs.find((job) => ["claimed", "running"].includes(job.status));
      if (active) jobs.heartbeat(active.id, bridgeId);
      broadcast("bridge", bridgeStatus());
      json(res, 200, bridgeStatus());
      return;
    }

    if (method === "POST" && pathname === "/api/bridge/claim") {
      if (!requireBridge(req, res)) return;
      const body = await readBody(req);
      const bridgeId = String(body.bridgeId || "");
      state.bridge.bridgeId = bridgeId;
      state.bridge.lastSeenAt = new Date().toISOString();
      const claimed = jobs.claim({ bridgeId, level: body.level || null });
      if (!claimed.ok) {
        json(res, 200, { job: null, reason: claimed.code });
        return;
      }
      afterJob(claimed.job);
      json(res, 200, { job: claimed.job, envelope: claimed.envelope });
      return;
    }

    const bridgeJobMatch = /^\/api\/bridge\/jobs\/([A-Za-z0-9-]+)\/(heartbeat|complete|release)$/.exec(pathname);
    if (method === "POST" && bridgeJobMatch) {
      if (!requireBridge(req, res)) return;
      const [, id, action] = bridgeJobMatch;
      const body = await readBody(req);
      const bridgeId = String(body.bridgeId || "");
      const result = action === "heartbeat"
        ? jobs.heartbeat(id, bridgeId)
        : action === "complete"
          ? jobs.complete(id, bridgeId, body)
          : jobs.release(id, bridgeId, body.note);
      if (!result.ok) {
        json(res, 409, { error: result.code });
        return;
      }
      state.bridge.lastSeenAt = new Date().toISOString();
      afterJob(result.job);
      json(res, 200, { job: result.job });
      return;
    }

    if (method === "GET" && pathname === "/api/events") {
      const token = url.searchParams.get("token") || "";
      const loopbackRequest = isLoopbackHost(req.headers.host) && assertLoopback(config.host);
      if (config.uiToken && !loopbackRequest && !safeEqual(token, config.uiToken)) {
        json(res, 401, { error: "NO_AUTORIZADO" });
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      });
      res.write(`retry: 3000\n\n`);
      res.write(`data: ${JSON.stringify({ type: "ready", at: new Date().toISOString(), payload: { version: config.version } })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          clearInterval(ping);
          clients.delete(res);
        }
      }, 20000);
      if (ping.unref) ping.unref();
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    json(res, 404, { error: "RUTA_NO_ENCONTRADA" });
  }

  async function handler(req, res) {
    try {
      if (assertLoopback(config.host) && !isLoopbackHost(req.headers.host)) {
        json(res, 403, { error: "HOST_NO_PERMITIDO" });
        return;
      }
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }
      if (req.method !== "GET") {
        json(res, 405, { error: "METODO_NO_PERMITIDO" });
        return;
      }
      await serveStatic(res, url.pathname);
    } catch (error) {
      const status = error && error.status ? error.status : 500;
      if (status === 500) console.error(`[tower] ${new Date().toISOString()} error interno: ${redact(String(error && error.message ? error.message : error))}`);
      if (!res.headersSent) json(res, status, { error: status === 500 ? "ERROR_INTERNO" : String(error.message || "ERROR") });
      else res.end();
    }
  }

  function schedule() {
    if (tower.timer) return;
    const tick = async () => {
      try {
        await collect();
        checkStaleBridge();
      } catch (error) {
        console.error(`[tower] ciclo fallido: ${redact(String(error.message || error))}`);
      }
      tower.timer = setTimeout(tick, config.pollMs);
      if (tower.timer.unref) tower.timer.unref();
    };
    tower.timer = setTimeout(tick, config.pollMs);
    if (tower.timer.unref) tower.timer.unref();
  }

  async function start({ port = config.port } = {}) {
    if (tower.server) {
      const address = tower.server.address();
      return { port: address.port, url: `http://${config.host}:${address.port}` };
    }
    tower.server = http.createServer((req, res) => {
      handler(req, res).catch(() => {
        if (!res.headersSent) json(res, 500, { error: "ERROR_INTERNO" });
      });
    });
    await new Promise((resolve, reject) => {
      tower.server.once("error", reject);
      tower.server.listen(port, config.host, () => {
        tower.server.off("error", reject);
        resolve();
      });
    });
    await collect();
    tower.telegram.start();
    if (tower.telegram.mode !== "off" && tower.telegram.allowedChatIds.size === 0) {
      const pairing = tower.telegram.createPairingCode();
      console.log(`[tower] Telegram sin chats autorizados. Codigo de emparejamiento: ${pairing.code} (vence ${pairing.expiresAt})`);
    }
    schedule();
    const address = tower.server.address();
    return { port: address.port, url: `http://${config.host}:${address.port}` };
  }

  async function stop() {
    if (tower.timer) clearTimeout(tower.timer);
    tower.timer = null;
    tower.telegram.stop();
    for (const client of clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    clients.clear();
    if (tower.server) {
      await new Promise((resolve) => tower.server.close(() => resolve()));
      tower.server = null;
    }
  }

  return {
    config,
    store,
    jobs,
    performance,
    state,
    tower,
    get alerts() {
      return tower.alerts;
    },
    get telegram() {
      return tower.telegram;
    },
    bridgeStatus,
    collect,
    checkStaleBridge,
    handler,
    start,
    stop
  };
}

async function main() {
  const tower = createTower();
  const address = await tower.start();
  console.log(`[tower] APEX Control Tower ${tower.config.version} en ${address.url}`);
  console.log(`[tower] Repositorio: ${tower.config.repoRoot}`);
  console.log(`[tower] Telegram: ${tower.telegram.mode}${tower.config.telegram.token ? "" : " (sin token)"}`);
  console.log(`[tower] Puente Qoder: ${tower.config.bridge.token ? "token configurado" : "sin token (solo lectura)"}`);

  const shutdown = async (signal) => {
    console.log(`[tower] Cerrando por ${signal}...`);
    await tower.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[tower] No se pudo iniciar: ${redact(String(error.message || error))}`);
    process.exit(1);
  });
}

module.exports = { createTower, isLoopbackHost, hostnameOf, attachIndicators };
