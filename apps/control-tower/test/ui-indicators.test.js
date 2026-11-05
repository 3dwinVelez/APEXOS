"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const APP_PATH = path.join(__dirname, "..", "public", "app.js");

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

// El panel es JS de navegador sin empaquetador: se ejecuta en un contexto aislado
// con un DOM minimo para poder afirmar que pinta los medidores y el mapa.
function loadPanel(snapshot) {
  const nodes = new Map();
  const byId = (id) => {
    if (!nodes.has(id)) nodes.set(id, element(id));
    return nodes.get(id);
  };
  const document = {
    getElementById: byId,
    querySelector: () => null,
    querySelectorAll: () => [],
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
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
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
  return { sandbox, byId, nodes };
}

async function mountedPanel(snapshot) {
  const panel = loadPanel(snapshot);
  await new Promise((resolve) => setImmediate(resolve));
  await panel.sandbox.load();
  await new Promise((resolve) => setImmediate(resolve));
  return panel;
}

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
    { at: "2026-11-05T09:59:00.000Z", ms: 120, ok: false },
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

function snapshotWithIndicators() {
  const { gaugesFor, moduleTicks } = require("../lib/metrics");
  const clone = JSON.parse(JSON.stringify({
    at: "2026-11-05T10:00:00.000Z",
    overall: "degraded",
    environments: { local: environment },
    checks: [],
    alerts: [],
    events: []
  }));
  const env = clone.environments.local;
  env.gauges = gaugesFor(env);
  env.moduleHistory = [
    moduleTicks(env.modules.modules, "2026-11-05T09:59:00.000Z", { ms: 400, ok: false }),
    moduleTicks(env.modules.modules, "2026-11-05T10:00:00.000Z", { ms: 182, ok: true })
  ];
  return {
    version: "1.3.0",
    config: { repoRoot: "APEXOS", pollMs: 20000, simulation: false, uiTokenConfigured: true, cloud: { credentials: [] } },
    snapshot: clone,
    git: { branches: [], flow: [], warnings: [] },
    telegram: { mode: "off" },
    jobs: { active: 0, counts: { awaiting_approval: 0 }, total: 0 },
    jobsList: [],
    events: [],
    alerts: [],
    performance: { local: env.performance }
  };
}

test("el panel pinta un medidor por cada umbral publicado por el servidor", async () => {
  const snapshot = snapshotWithIndicators();
  const { byId } = await mountedPanel(snapshot);
  const html = byId("gauges").innerHTML;
  const cards = html.split('<article class="measure-card').length - 1;
  assert.equal(cards, snapshot.snapshot.environments.local.gauges.length);
  assert.match(html, /p95 del API/);
  assert.match(html, /Sondas fallidas/);
  assert.match(html, /óptimo ≤ 600 ms · en riesgo ≤ 1\.000 ms/);
  assert.equal(byId("gaugesMeta").textContent, "6 medidores con umbral · 2 en rojo · 1 en riesgo");
});

test("cada medidor muestra su banda medida: latencia verde y sondas en rojo", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("gauges").innerHTML;
  assert.match(html, /<article class="measure-card band-optimal"[^>]*aria-label="p95 del API: 182 ms\. Óptimo\./);
  assert.match(html, /<article class="measure-card band-critical overflow"[^>]*aria-label="Sondas fallidas: 30,8 %\. Crítico\./);
  assert.match(html, /class="measure-marker critical"/);
});

// Uptime y peticiones son contexto del proceso: el servidor no publica cortes
// para ellos, asi que el panel no les dibuja escala ni los pinta en rojo.
test("los medidores informativos no fingir una escala ni un veredicto", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("gauges").innerHTML;
  assert.match(html, /<article class="measure-card band-informational"[^>]*aria-label="Uptime del proceso: 2 h\. Informativo\. contexto del proceso, no diagnóstico\./);
  assert.match(html, /<article class="measure-card band-informational"[^>]*aria-label="Peticiones atendidas: 98\.432\. Informativo\./);
  assert.equal(html.split('class="measure-scale idle"').length - 1, 2, "solo los informativos van sin tramos");
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
