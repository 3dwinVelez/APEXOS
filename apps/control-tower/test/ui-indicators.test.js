"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const APP_PATH = path.join(__dirname, "..", "public", "app.js");
const HTML_PATH = path.join(__dirname, "..", "public", "index.html");

function element(id) {
  return {
    id,
    innerHTML: "",
    textContent: "",
    className: "",
    value: "",
    hidden: false,
    open: false,
    dataset: {},
    style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    scrollIntoView() {},
    show() {},
    close() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

// Las secciones y los botones de vista no los construye el JS: viven en el HTML.
// El DOM minimo los registra leyendo el mismo index.html que ve el usuario, para
// que una seccion que declare una vista inexistente falle aqui y no en la torre.
function parseViews() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const sections = [...html.matchAll(/<section\b([^>]*)>/g)]
    .filter(([, attrs]) => /data-views="/.test(attrs))
    .map(([, attrs]) => {
      const views = attrs.match(/data-views="([^"]+)"/)[1];
      const name = (attrs.match(/\bid="([^"]+)"/) || attrs.match(/\baria-labelledby="([^"]+)"/) || [])[1] || "seccion";
      return { name, views, hidden: /\bhidden\b/.test(attrs), dataset: { views } };
    });
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)]
    .filter(([, attrs]) => /data-view="/.test(attrs))
    .map(([, attrs]) => {
      const view = attrs.match(/data-view="([^"]+)"/)[1];
      const button = { view, dataset: { view }, className: "view-btn", attributes: {} };
      button.classList = {
        owner: button,
        toggle(name, on) {
          const list = new Set(this.owner.className.split(/\s+/).filter(Boolean));
          if (on) list.add(name); else list.delete(name);
          this.owner.className = [...list].join(" ");
        },
        add() {},
        remove() {},
        contains(name) { return this.owner.className.split(/\s+/).includes(name); }
      };
      button.setAttribute = (name, value) => { button.attributes[name] = value; };
      button.getAttribute = (name) => button.attributes[name] ?? null;
      return button;
    });
  return { sections, buttons };
}

// El panel es JS de navegador sin empaquetador: se ejecuta en un contexto aislado
// con un DOM minimo para poder afirmar que pinta los medidores y el mapa.
function loadPanel(snapshot, options = {}) {
  const nodes = new Map();
  const byId = (id) => {
    if (!nodes.has(id)) nodes.set(id, element(id));
    return nodes.get(id);
  };
  const { sections, buttons } = parseViews();
  const store = new Map();
  if (options.view) store.set("towerView", options.view);
  if (options.environment) store.set("towerEnvironment", options.environment);
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };
  const document = {
    getElementById: byId,
    querySelector: () => null,
    querySelectorAll: (selector) => {
      if (selector === "[data-views]") return sections;
      if (selector === "[data-view]") return buttons;
      return [];
    },
    addEventListener: () => {},
    createElement: () => element("created"),
    body: element("body"),
    documentElement: element("html"),
    hidden: false
  };
  const sandbox = {
    document,
    window: {
      location: { search: "", href: "http://127.0.0.1:4310/" },
      addEventListener: () => {},
      confirm: () => false,
      scrollTo: () => {}
    },
    localStorage: storage,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    URLSearchParams,
    Intl,
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => snapshot,
      text: async () => JSON.stringify(snapshot)
    }),
    EventSource: function EventSource() {
      this.close = () => {};
      this.readyState = 1;
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(APP_PATH, "utf8"), sandbox, { filename: APP_PATH });
  return {
    sandbox,
    byId,
    nodes,
    sections,
    buttons,
    store,
    views: () => JSON.parse(vm.runInContext("JSON.stringify({ order: VIEW_ORDER, questions: VIEW_QUESTION })", sandbox))
  };
}

async function mountedPanel(snapshot, options = {}) {
  const panel = loadPanel(snapshot, options);
  await new Promise((resolve) => setImmediate(resolve));
  await panel.sandbox.load();
  await new Promise((resolve) => setImmediate(resolve));
  return panel;
}

const { gaugesFor, moduleTicks, componentBands, p95Definition, latencyVerdict } = require("../lib/metrics");

const environment = {
  id: "local",
  label: "Local",
  short: "LOCAL",
  enabled: true,
  branch: "desarrollo",
  overall: "degraded",
  summary: { ok: 6, total: 8, down: 1, degraded: 1, unknown: 0 },
  checks: [],
  performance: { samples: 120, failures: 37, errorRate: 30.8, p50: 90, p95: 182, avg: 140, min: 20, max: 900, last: { at: "2026-11-05T10:00:00.000Z", ms: 182, ok: true }, series: [
    { at: "2026-11-05T09:59:00.000Z", ms: 120, ok: true },
    { at: "2026-11-05T10:00:00.000Z", ms: 182, ok: true }
  ] },
  deployed: {
    status: "ok",
    version: "1.0.0",
    commit: "abcdef1234567890",
    uptimeSeconds: 7200,
    memory: { rss: 107.9, heapUsed: 18, heapTotal: 40 },
    usage: { requestsTotal: 98432, slowQueries: 0, byStatus: { "2xx": 90000, "4xx": 10, "5xx": 0 } }
  },
  activity: { tenants: { summary: { active: 200, with_activity: 1, with_sessions: 1, total: 210 }, tenants: [] } },
  components: [
    { key: "api", name: "API", kind: "servicio", status: "ok", latencyMs: 12, score: 100, detail: "Fastify 5" },
    { key: "db", name: "Base de datos", kind: "postgresql", criticality: "critica", status: "ok", latencyMs: 42, score: 96, detail: "pool 4/10" }
  ],
  modules: {
    source: "api",
    generated_at: "2026-11-05T10:00:00.000Z",
    summary: { ok: 1, total: 3, degraded: 1, down: 1, unknown: 0, records: 940 },
    modules: [
      { key: "hr", name: "Talento Humano", group: "Talento", status: "degraded", band: "risk", score: 65, data: { records: 40, age_minutes: 90, expected_minutes: 60 }, services: [], alerts: [] },
      { key: "services", name: "Servicios", group: "Operacion", status: "ok", band: "optimal", score: 100, data: { records: 900, age_minutes: 2, expected_minutes: 60 }, services: [], alerts: [] },
      { key: "fleet", name: "Flota", group: "Operacion", status: "down", band: "critical", score: 10, data: { records: 0 }, services: [], alerts: [] }
    ]
  }
};

// Reconstruye lo que el servidor publica por ambiente: bandas, umbrales y
// veredicto de latencia. El panel no calcula nada, solo pinta esta carga.
function publishIndicators(snapshot) {
  const env = snapshot.snapshot.environments.local;
  env.components = componentBands(env.components);
  env.gauges = gaugesFor(env);
  env.latency = latencyVerdict(env.performance.series, p95Definition(env.id).risk);
  return snapshot;
}

function snapshotWithIndicators() {
  const clone = JSON.parse(JSON.stringify({
    at: "2026-11-05T10:00:00.000Z",
    overall: "degraded",
    environments: { local: environment },
    checks: [],
    alerts: [],
    events: []
  }));
  const env = clone.environments.local;
  env.moduleHistory = [
    moduleTicks(env.modules.modules, "2026-11-05T09:59:00.000Z", { ms: 400, ok: false }, env.id),
    moduleTicks(env.modules.modules, "2026-11-05T10:00:00.000Z", { ms: 182, ok: true }, env.id)
  ];
  return publishIndicators({
    version: "1.4.0",
    config: { repoRoot: "APEXOS", pollMs: 20000, simulation: false, uiTokenConfigured: true, cloud: { credentials: [] } },
    snapshot: clone,
    git: { branches: [], flow: [], warnings: [] },
    telegram: { mode: "off" },
    jobs: { active: 0, counts: { awaiting_approval: 0 }, total: 0 },
    jobsList: [],
    events: [],
    alerts: [],
    performance: { local: env.performance }
  });
}

test("el panel pinta un medidor por cada umbral publicado por el servidor", async () => {
  const snapshot = snapshotWithIndicators();
  const { byId } = await mountedPanel(snapshot);
  const html = byId("gauges").innerHTML;
  const cards = html.split('<article class="measure-card').length - 1;
  assert.equal(cards, snapshot.snapshot.environments.local.gauges.length);
  assert.equal(cards, 10, "las diez preguntas que mide el servidor");
  assert.match(html, /p95 de la sonda al API/);
  assert.match(html, /Sondas fallidas/);
  // El corte del p95 es el presupuesto de sonda del ambiente, no el del API.
  assert.match(html, /óptimo ≤ 240 ms · en riesgo ≤ 400 ms/);
  assert.equal(byId("gaugesMeta").textContent, "7 medidores con umbral · 2 en rojo · 1 en riesgo");
});

test("cada medidor empieza por la pregunta y termina en la vista que la responde", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("gauges").innerHTML;
  assert.match(html, /<p class="measure-question">¿Cómo está la latencia\?<\/p>/);
  assert.match(html, /<p class="measure-question">¿La base de datos está rápida\?<\/p>/);
  assert.match(html, /<button class="measure-link" type="button" data-view="latencia">Ver evidencia<\/button>/);
  assert.match(html, /<button class="measure-link" type="button" data-view="datos">Ver evidencia<\/button>/);
  assert.equal(html.split("measure-question").length - 1, 10, "ningún medidor se queda sin pregunta");
});

test("cada medidor muestra su banda medida: latencia verde y sondas en rojo", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("gauges").innerHTML;
  assert.match(html, /<article class="measure-card band-optimal"[^>]*aria-label="p95 de la sonda al API: 182 ms\. Óptimo\./);
  assert.match(html, /<article class="measure-card band-critical overflow"[^>]*aria-label="Sondas fallidas: 30,8 %\. Crítico\./);
  assert.match(html, /class="measure-marker critical"/);
});

test("la tarjeta de latencia firma el veredicto del servidor, no uno propio", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  assert.match(byId("gauges").innerHTML, /<p class="measure-verdict tone-ok">Dentro del tope de 400 ms<\/p>/);

  const conRacha = snapshotWithIndicators();
  conRacha.snapshot.environments.local.performance.series = [
    { at: "2026-11-05T09:58:00.000Z", ms: 520, ok: true },
    { at: "2026-11-05T09:59:00.000Z", ms: 610, ok: true },
    { at: "2026-11-05T10:00:00.000Z", ms: 700, ok: true }
  ];
  publishIndicators(conRacha);
  assert.equal(conRacha.snapshot.environments.local.latency.state, "sustained");
  const second = await mountedPanel(conRacha);
  assert.match(second.byId("gauges").innerHTML,
    /<p class="measure-verdict tone-down">Fuera del tope: atender · 3\/3 muestras sobre 400 ms · racha máxima 3<\/p>/);
});

// Uptime, peticiones y registros son contexto del proceso o de la base: el
// servidor no publica cortes para ellos, asi que el panel no les dibuja escala.
test("los medidores informativos no fingen una escala ni un veredicto", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("gauges").innerHTML;
  assert.match(html, /<article class="measure-card band-informational"[^>]*aria-label="Uptime del proceso: 2 h\. Informativo\. contexto del proceso, no diagnóstico\./);
  assert.match(html, /<article class="measure-card band-informational"[^>]*aria-label="Peticiones atendidas: 98\.432\. Informativo\./);
  assert.match(html, /<article class="measure-card band-informational"[^>]*aria-label="Registros medidos: 940\. Informativo\./);
  assert.equal(html.split('class="measure-scale idle"').length - 1, 3, "solo los informativos van sin tramos");
});

test("la latencia dibuja el tope y la zona optima sobre la serie medida", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("performance").innerHTML;
  assert.match(html, /<svg class="latency-chart"/);
  assert.match(html, /<line class="chart-risk"/);
  assert.match(html, /<line class="chart-optimal"/);
  assert.match(html, /tope 400 ms/);
  assert.match(html, /óptimo 240 ms/);
  assert.match(html, /aria-label="Latencia de la sonda con su tope de 400 ms dibujado"/);
  assert.equal(html.split("spark-over").length - 1, 0, "ninguna muestra supera el tope");
});

test("un pico aislado se reporta como evento, no como falla que atender", async () => {
  const snapshot = snapshotWithIndicators();
  const env = snapshot.snapshot.environments.local;
  env.performance.series = [
    { at: "2026-11-05T09:55:00.000Z", ms: 120, ok: true },
    { at: "2026-11-05T09:56:00.000Z", ms: 130, ok: true },
    { at: "2026-11-05T09:57:00.000Z", ms: 900, ok: true },
    { at: "2026-11-05T09:58:00.000Z", ms: 140, ok: true },
    { at: "2026-11-05T09:59:00.000Z", ms: 125, ok: true },
    { at: "2026-11-05T10:00:00.000Z", ms: 135, ok: true }
  ];
  publishIndicators(snapshot);
  assert.equal(env.latency.state, "spikes");
  const { byId } = await mountedPanel(snapshot);
  const html = byId("latencyVerdict").innerHTML;
  assert.match(html, /<div class="verdict tone-degraded">/);
  assert.match(html, /<p class="verdict-text">Picos por evento: vigilar · tope 400 ms<\/p>/);
  assert.match(html, /<p class="verdict-rule">1\/6 muestras sobre 400 ms · racha máxima 1 · ventana 30<\/p>/);
  assert.match(byId("performance").innerHTML, /class="spark-over"/);
});

test("sin muestras suficientes la torre admite que no puede firmar un veredicto", async () => {
  const snapshot = snapshotWithIndicators();
  snapshot.snapshot.environments.local.performance.series = [];
  publishIndicators(snapshot);
  assert.equal(snapshot.snapshot.environments.local.latency.state, "unknown");
  const { byId } = await mountedPanel(snapshot);
  assert.match(byId("latencyVerdict").innerHTML, /<p class="verdict-empty">Sin muestras suficientes para firmar un veredicto de latencia\.<\/p>/);
});

test("la vista API pinta los componentes que devolvio el propio servidor", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("components").innerHTML;
  assert.equal(html.split('class="component-row').length - 1, 2);
  assert.match(html, /<div class="component-row band-optimal">/);
  assert.match(html, /Base de datos/);
  assert.match(html, /42 ms/);
  assert.match(html, /critica/);
  assert.match(html, /96\/100/);
  assert.equal(byId("componentsMeta").textContent, "2 componentes · 2 con latencia medida · 0 requieren atención");
});

test("una base lenta se pinta en su banda y cuenta como atencion pendiente", async () => {
  const snapshot = snapshotWithIndicators();
  snapshot.snapshot.environments.local.components = [{ key: "db", name: "Base de datos", kind: "postgresql", status: "ok", latencyMs: 850, score: 20 }];
  publishIndicators(snapshot);
  const { byId } = await mountedPanel(snapshot);
  assert.match(byId("components").innerHTML, /<div class="component-row band-critical">/);
  assert.match(byId("componentsMeta").textContent, /1 requieren atención/);
  assert.match(byId("databaseVerdict").innerHTML, /verdict tone-down/);
});

test("sin componentes leidos la torre explica que falta en lugar de dejar el panel vacio", async () => {
  const snapshot = snapshotWithIndicators();
  snapshot.snapshot.environments.local.components = [];
  publishIndicators(snapshot);
  const { byId } = await mountedPanel(snapshot);
  assert.equal(byId("componentsMeta").textContent, "Sin componentes leidos");
  assert.match(byId("components").innerHTML, /no expone \/api\/v1\/apex-control\/status/);
});

test("la vista Base de datos responde rapidez, volumen y cobertura medidos", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  assert.match(byId("databaseVerdict").innerHTML, /La base responde en 42 ms \(medido por el propio API\)\. Óptimo/);
  assert.match(byId("databaseVerdict").innerHTML, /Hay 940 registros medidos en 3 módulos con conteo\./);
  const tiles = byId("databaseKpis").innerHTML.split('<article class="metric-tile').length - 1;
  assert.equal(tiles, 6);
  assert.match(byId("databaseKpis").innerHTML, /Latencia de la base/);
  assert.match(byId("databaseKpis").innerHTML, /Consultas lentas/);
  assert.match(byId("databaseKpis").innerHTML, /Registros medidos/);
  assert.match(byId("databaseVolume").innerHTML, /<th>Frescura<\/th>/);
  assert.match(byId("databaseVolume").innerHTML, /Talento Humano/);
  // La tabla se ordena por volumen: Servicios (900) antes que Talento Humano (40).
  assert.ok(byId("databaseVolume").innerHTML.indexOf("Servicios") < byId("databaseVolume").innerHTML.indexOf("Talento Humano"));
});

// Con el catalogo de respaldo (simulacion, sin token o sin build de apex-control)
// ningun modulo trae conteo: la vista no puede decir "32 módulos con conteo" ni
// dejar la tabla vacia, porque el numero contradice a la tabla.
test("un modulo sin conteo no se cuenta como modulo medido", async () => {
  const snapshot = snapshotWithIndicators();
  const env = snapshot.snapshot.environments.local;
  env.modules = {
    source: "catalog",
    reason: "SIMULACION",
    generated_at: "2026-11-05T10:00:00.000Z",
    summary: { total: 3, ok: 0, degraded: 0, down: 0, unknown: 3 },
    modules: [
      { key: "hr", name: "Talento Humano", status: "unknown", data: null },
      { key: "services", name: "Servicios", status: "unknown", data: null },
      { key: "fleet", name: "Flota", status: "unknown", data: null }
    ]
  };
  env.moduleHistory = [];
  publishIndicators(snapshot);
  const { byId } = await mountedPanel(snapshot);
  assert.equal(byId("databaseMeta").textContent, "0 módulos con conteo · 3 módulos leídos");
  assert.match(byId("databaseVerdict").innerHTML, /Ningún módulo publicó conteo de registros\./);
  assert.match(byId("databaseVolume").innerHTML,
    /Ningún módulo devolvió conteo de registros en este ambiente \(motivo: SIMULACION\)\./);
});

test("un componente sin latencia publicada no se cuenta ni se pinta como medido", async () => {
  const snapshot = snapshotWithIndicators();
  snapshot.snapshot.environments.local.components = [
    { key: "db", name: "Base de datos", kind: "postgresql", status: "ok", latencyMs: 42, score: null },
    { key: "mail", name: "Correo", kind: "queue", status: "ok", latencyMs: null, score: null }
  ];
  publishIndicators(snapshot);
  const { byId } = await mountedPanel(snapshot);
  assert.equal(byId("componentsMeta").textContent, "2 componentes · 1 con latencia medida · 0 requieren atención");
  assert.match(byId("components").innerHTML, /sin medición/);
});

test("el mapa dibuja una marca por sondeo y modulo, mas la fila de la API", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("moduleMap").innerHTML;
  assert.equal(html.split('class="map-row').length - 1, 4, "3 módulos más la fila de la API");
  assert.equal(html.split("map-tick").length - 1, 8, "2 sondeos por cada una de las 4 filas");
  assert.match(html, /API \/health/);
  assert.match(html, /map-tick band-critical/);
  assert.match(byId("moduleMapMeta").textContent, /^2 sondeos/);
});

test("un ambiente sin historia de sondeos no deja filas vacías", async () => {
  const snapshot = snapshotWithIndicators();
  snapshot.snapshot.environments.local.moduleHistory = [];
  const { byId } = await mountedPanel(snapshot);
  assert.match(byId("moduleMap").innerHTML, /El mapa necesita un sondeo con módulos medidos/);
  assert.match(byId("moduleMapMeta").textContent, /^Sin sondeos/);
});

test("sin modulos medidos el mapa explica por que no hay nada que dibujar", async () => {
  const snapshot = snapshotWithIndicators();
  snapshot.snapshot.environments.local.modules.modules = [];
  snapshot.snapshot.environments.local.moduleHistory = [];
  const { byId } = await mountedPanel(snapshot);
  assert.match(byId("moduleMap").innerHTML, /El mapa necesita un sondeo con módulos medidos/);
});

// ------------------------------------------------------------------ vistas-pregunta

test("el panel ofrece las siete vistas-pregunta en orden y cada una con su pregunta", async () => {
  const panel = await mountedPanel(snapshotWithIndicators());
  const { order, questions } = panel.views();
  assert.deepEqual(order, ["resumen", "latencia", "api", "modulos", "datos", "nube", "operacion"]);
  assert.deepEqual(Object.keys(questions), order);
  assert.equal(panel.buttons.length, 7, "un boton por vista en el HTML");
  assert.match(panel.buttons[0].className, /active/);
});

test("una vista deja visible solo las secciones que responden a esa pregunta", async () => {
  const panel = await mountedPanel(snapshotWithIndicators(), { view: "datos" });
  assert.deepEqual(panel.sections.filter((section) => !section.hidden).map((section) => section.name),
    ["databaseTitle", "tenantsTitle", "companyPanel"]);
  assert.equal(panel.buttons.find((button) => button.view === "datos").getAttribute("aria-pressed"), "true");
  assert.equal(panel.buttons.find((button) => button.view === "latencia").getAttribute("aria-pressed"), "false");
});

test("la vista Latencia muestra el grafico con su tope y las sondas, nada mas", async () => {
  const panel = await mountedPanel(snapshotWithIndicators(), { view: "latencia" });
  assert.deepEqual(panel.sections.filter((section) => !section.hidden).map((section) => section.views), ["latencia", "latencia api"]);
});

test("la vista Resumen se queda con salud, medidores y alertas", async () => {
  const panel = await mountedPanel(snapshotWithIndicators());
  assert.deepEqual(panel.sections.filter((section) => !section.hidden).map((section) => section.name),
    ["healthTitle", "gaugesTitle", "alertsTitle"]);
});

test("toda vista declarada en el HTML existe y toda vista tiene secciones que mostrar", async () => {
  const panel = await mountedPanel(snapshotWithIndicators());
  const { order } = panel.views();
  for (const section of panel.sections) {
    for (const view of section.views.split(/\s+/).filter(Boolean)) {
      assert.ok(order.includes(view), `la sección ${section.name} declara la vista inexistente "${view}"`);
    }
  }
  for (const view of order) {
    assert.ok(panel.sections.some((section) => section.views.split(/\s+/).includes(view)),
      `la vista "${view}" no tiene ninguna sección que la responda`);
  }
});

test("una vista antigua guardada en el navegador cae en Resumen y no deja el panel en blanco", async () => {
  const panel = await mountedPanel(snapshotWithIndicators(), { view: "summary" });
  assert.equal(panel.sections.filter((section) => !section.hidden).length, 3);
  assert.equal(panel.store.get("towerView"), "resumen");
});
