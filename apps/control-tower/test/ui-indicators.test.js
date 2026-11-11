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
const { attachIndicators } = require("../server");
const { MonitorHistory } = require("../lib/monitor-history");

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

// Reconstruye la publicacion del servidor replay de sondeos reales: se llama al
// mismo attachIndicators del server, con el mismo anillo de historia, para que el
// panel reciba la publicacion de verdad y no una imitacion que pueda divergir.
// El telemetry entra como lectura del moduleHistory que la propia fixture armo,
// porque los ticks de modulos se graban en el ciclo de sondeo, no aqui.
function publishIndicators(outer, polls = 2) {
  const inner = outer.snapshot;
  const telemetry = { seriesFor: (id) => (inner.environments[id] || {}).moduleHistory || [] };
  const monitors = new MonitorHistory();
  const times = ["2026-11-05T09:59:00.000Z", "2026-11-05T10:00:00.000Z"];
  for (let index = 0; index < polls; index += 1) {
    inner.at = times[Math.min(index, times.length - 1)];
    attachIndicators(inner, telemetry, monitors);
  }
  return outer;
}

function snapshotWithIndicators() {
  const clone = JSON.parse(JSON.stringify({
    at: "2026-11-05T10:00:00.000Z",
    overall: "degraded",
    environments: { local: environment },
    // Dos sondas con viaje medido: son las que dejan ticks en la vista Servicios
    // y las que permiten afirmar que un sondeo sin viaje no pinta barra.
    checks: [
      { id: "api", label: "API", source: "http", environment: "local", status: "ok", durationMs: 53, detail: "Fastify 5" },
      { id: "web", label: "Web", source: "http", environment: "local", status: "unknown", durationMs: 0, detail: "sin viaje medido" }
    ],
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

// Corta el medidor que lleva la etiqueta pedida: las afirmaciones sobre el grafico
// de un medidor no pueden salir cruzadas con las de otro.
function cardByLabel(html, label, open = '<article class="measure-card') {
  return html.split(open).slice(1)
    .filter((chunk) => chunk.includes(label))
    .map((chunk) => `${open}${chunk}`)
    .join("\n");
}

const tileByLabel = (html, label) => cardByLabel(html, label, '<article class="cockpit-tile');

// Cuantas veces aparece una cadena: contar elementos pintados sin parsear HTML.
const count = (html, needle) => html.split(needle).length - 1;

test("el resumen pinta los nueve indicadores del cockpit y deja la evidencia por módulo en su vista", async () => {
  const snapshot = snapshotWithIndicators();
  const { byId } = await mountedPanel(snapshot);
  const published = snapshot.snapshot.environments.local.gauges;
  const cockpit = snapshot.snapshot.environments.local.cockpit;
  const hero = byId("cockpitHero").innerHTML;
  const dials = byId("cockpitDials").innerHTML;
  const tiles = byId("cockpitTiles").innerHTML;
  assert.equal(published.length, 19, "el servidor publica diecinueve medidores");
  // El Resumen es un cockpit, no una lista: un grafico dominante, dos medidores de
  // peso y seis teselas. Los nueve los eligio metrics.COCKPIT, no el navegador.
  assert.equal(count(hero, '<article class="cockpit-hero'), 1);
  assert.equal(count(dials, '<article class="dial '), 2);
  assert.equal(count(tiles, '<article class="cockpit-tile'), 6);
  assert.equal(cockpit.hero.key, "p95");
  assert.deepEqual(cockpit.dials.map((entry) => entry.key), ["platformHealth", "heapPressure"]);
  // El uso real, las sesiones y el GPS son evidencia de la vista Módulos: el
  // catalogo los marca y el panel no los sube al resumen.
  assert.doesNotMatch(tiles, /Actividad de hoy|Sesiones activas|Pings GPS/);
  assert.match(hero, /p95 de la sonda al API/);
  // El corte del p95 es el presupuesto de sonda del ambiente, no el del API.
  assert.match(hero, /óptimo ≤ 240 ms · en riesgo ≤ 400 ms/);
  assert.equal(byId("cockpitMeta").textContent, "9 de 19 medidores · 1 en rojo · 1 en riesgo");
});

test("el pie del cockpit cuenta lo que se midio, no lo que se pintó", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const status = byId("cockpitStatus").innerHTML;
  assert.match(status, /<span class="status-chip">Contadores: \d+<\/span>/);
  assert.match(status, /<span class="status-chip">Errores: \d+<\/span>/);
  assert.match(status, /<span class="status-chip">Advertencias: \d+<\/span>/);
  assert.match(status, /<span class="status-chip">Alertas abiertas: 0<\/span>/);
});

test("cada indicador del cockpit abre la vista que responde su pregunta", async () => {
  const snapshot = snapshotWithIndicators();
  const { byId } = await mountedPanel(snapshot);
  const tiles = byId("cockpitTiles").innerHTML;
  const cockpit = snapshot.snapshot.environments.local.cockpit;
  // La pregunta del grafico dominante es la de la vista Latencia: el p95 se
  // responde ahi, no en el Resumen.
  assert.match(byId("cockpitHero").innerHTML, /<p class="hero-question">¿Cómo está la latencia\?<\/p>/);
  const views = [...tiles.matchAll(/<button class="measure-link" type="button" data-view="([a-z]+)">Ver evidencia<\/button>/g)]
    .map((match) => match[1]);
  assert.deepEqual(views, cockpit.tiles.map((entry) => entry.view), "cada tesela apunta a su propia vista");
  assert.equal(views.length, 6, "ninguna tesela se queda sin su evidencia");
});

test("cada indicador del cockpit muestra su banda medida y su grafica con el tope cruzada", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const hero = byId("cockpitHero").innerHTML;
  const tiles = byId("cockpitTiles").innerHTML;
  assert.match(hero, /<article class="cockpit-hero band-optimal"[^>]*aria-label="p95 de la sonda al API: 182 ms\. Óptimo\./);
  assert.match(tiles, /<article class="cockpit-tile band-critical"[^>]*aria-label="Empresas con actividad: 0,5 %\. Crítico\./);
  // La banda no es un adorno del titulo: cada lectura que pasa el tope se marca en
  // su propia serie, y la raya del tope esta dibujada en la tesela. El grafico
  // dominante reusa el mismo renderer de la vista Latencia, solo que mas grande.
  assert.match(hero, /<svg class="threshold-chart cockpit-hero-svg"/);
  const cobertura = tileByLabel(tiles, "Empresas con actividad");
  assert.match(cobertura, /<line class="chart-risk"/);
  assert.match(cobertura, /<text class="chart-label risk"[^>]*>piso 5 %</);
  assert.equal(count(cobertura, 'class="spark-over"'), 2, "las dos lecturas medidas pasaron el piso");
  assert.equal(count(hero, 'class="threshold-chart'), 1, "un solo grafico dominante");
  assert.equal(count(tiles, 'class="threshold-chart'), 6, "toda tesela pinta su historia");
  assert.doesNotMatch(byId("cockpitDials").innerHTML, /threshold-chart/, "el dial no es una serie: es una aguja sobre el presupuesto");
});

test("el cockpit firma el veredicto del servidor, no uno propio", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  assert.match(byId("cockpitHero").innerHTML, /<p class="hero-verdict tone-ok">Dentro del tope de 400 ms<\/p>/);
  // La banda del Resumen sale de los nueve que se pintan: aqui la manda el
  // semáforo de empresas con actividad, no un medidor que el dueño no ve.
  const verdict = byId("cockpitVerdict").innerHTML;
  assert.match(verdict, /<p class="verdict-question">¿Cómo está APEXOS ahora mismo\?<\/p>/);
  assert.match(verdict, /<p class="verdict-text">Empresas con actividad 0,5 % · Crítico<\/p>/);

  const conRacha = snapshotWithIndicators();
  conRacha.snapshot.environments.local.performance.series = [
    { at: "2026-11-05T09:58:00.000Z", ms: 520, ok: true },
    { at: "2026-11-05T09:59:00.000Z", ms: 610, ok: true },
    { at: "2026-11-05T10:00:00.000Z", ms: 700, ok: true }
  ];
  publishIndicators(conRacha);
  assert.equal(conRacha.snapshot.environments.local.latency.state, "sustained");
  const second = await mountedPanel(conRacha);
  assert.match(second.byId("cockpitHero").innerHTML,
    /<p class="hero-verdict tone-down">Fuera del tope: atender · 3\/3 muestras sobre 400 ms · racha máxima 3<\/p>/);
});

// Un medidor cuya banda es su propia ventana no puede afirmarla con dos lecturas,
// y un dial sin lectura no puede inventar la aguja. Lo que pinta entonces es la
// serie medida sin rayas inventadas y un pie que dice cuantas lecturas faltan:
// "sin banda todavia" y "sin lectura" son respuestas, no un verde ni un cero.
test("el cockpit dice cuantas lecturas faltan en lugar de fingir una banda o una aguja", async () => {
  const snapshot = snapshotWithIndicators();
  const { byId } = await mountedPanel(snapshot);
  const tiles = byId("cockpitTiles").innerHTML;
  const carga = tileByLabel(tiles, "Peticiones por minuto");
  assert.match(carga, /<article class="cockpit-tile band-informational"[^>]*aria-label="Peticiones por minuto: 820,3 req\/min\. Informativo\. sin banda habitual todavía: 2 de 8 lecturas medidas\./);
  assert.match(carga, /aria-label="Peticiones por minuto: 2 lecturas medidas con corte todavía pendiente"/);
  assert.match(carga, /<polyline class="chart-line"/, "la lectura medida si se dibuja");
  assert.doesNotMatch(carga, /class="chart-risk"/, "el corte que no existe no se raya");
  assert.match(tileByLabel(tiles, "Registros medidos"), /sin banda habitual todavía: 2 de 8 lecturas medidas/);
  // El dial de la salud solo dibuja aguja si el servidor publico la cifra: Number
  // de un valor nulo es cero, y una aguja en cero seria un dato inventado.
  assert.equal(snapshot.snapshot.environments.local.cockpit.dials[0].key, "platformHealth");
  assert.match(byId("cockpitDials").innerHTML, /<p class="dial-empty">sin lectura medida: el dial no dibuja una aguja inventada<\/p>/);
  assert.match(byId("cockpitDials").innerHTML, /<article class="dial band-optimal"[\s\S]*?<line class="dial-needle"/);
});

test("la latencia dibuja el tope y la zona optima sobre la serie medida", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("performance").innerHTML;
  // La grafica grande y las teselas compactas comparten geometria y clases: "como
  // el grafico de latencia" es una sola implementacion, no un estilo por pantalla.
  assert.match(html, /<svg class="threshold-chart latency-chart"/);
  assert.match(html, /<line class="chart-risk"/);
  assert.match(html, /<line class="chart-optimal"/);
  assert.match(html, /tope 400 ms/);
  assert.match(html, /óptimo 240 ms/);
  assert.match(html, /aria-label="Latencia de la sonda con su tope de 400 ms dibujado; cada muestra es un punto inspeccionable"/);
  assert.equal(html.split("spark-over").length - 1, 0, "ninguna muestra supera el tope");
  // Cada muestra medida recibe su propio blanco clicable con la hora dentro del
  // area accesible: sin esto el grafico es una figura y no una respuesta.
  assert.equal(html.split('class="chart-hit"').length - 1, 2, "un blanco por cada muestra de la serie");
  assert.match(html, /<title>\d+\/\d+, \d{2}:\d{2}:\d{2} · 120 ms · Óptimo<\/title>/);
  assert.equal(html.split('class="chart-tick"').length - 1, 2, "eje con horarios, no con indices");
});

test("la serie medida se explora por picos y el punto elegido todavia no esta seleccionado", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("performance").innerHTML;
  assert.match(html, /<div class="latency-explorer">/);
  assert.match(html, /Picos y horarios medidos/);
  assert.match(html, /ninguna muestra sobre el tope de 400 ms · los 2 tiempos mas altos/);
  assert.equal(html.split("data-chart-point-at=").length - 1, 4, "los blancos del grafico y la lista apuntan a la misma muestra");
  assert.match(html, /<div class="point-detail"><p class="empty">Elija un punto del grafico o un pico de la lista/);
});

test("el pico sobre el tope se nombra con su hora y su medicion, no con su posicion", async () => {
  const snapshot = snapshotWithIndicators();
  const env = snapshot.snapshot.environments.local;
  env.performance.series = [
    { at: "2026-11-05T09:55:00.000Z", ms: 120, ok: true },
    { at: "2026-11-05T09:56:00.000Z", ms: 130, ok: true },
    { at: "2026-11-05T09:57:00.000Z", ms: 900, ok: true },
    { at: "2026-11-05T09:58:00.000Z", ms: 140, ok: false },
    { at: "2026-11-05T09:59:00.000Z", ms: 125, ok: true },
    { at: "2026-11-05T10:00:00.000Z", ms: 135, ok: true }
  ];
  publishIndicators(snapshot);
  const html = (await mountedPanel(snapshot)).byId("performance").innerHTML;
  assert.match(html, /1 de 6 muestras sobre el tope de 400 ms/);
  assert.match(html, /<span class="peak-time">\d+\/\d+, \d{2}:\d{2}:\d{2}<\/span>/);
  assert.match(html, /<span class="peak-ms">900 ms<\/span>/);
  assert.match(html, /<title>\d+\/\d+, \d{2}:\d{2}:\d{2} · 140 ms · Óptimo · sonda fallida<\/title>/);
});

test("la barra de vistas abre la fila y la leyenda cierra el panel", () => {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
  const lastSection = html.lastIndexOf("<section");
  const legend = html.indexOf('id="statusLegend"');
  assert.ok(legend > lastSection, "la leyenda de estados va despues de las secciones, no entre la navegacion y la respuesta");
  assert.match(styles, /\.view-nav\s*\{[^}]*grid-column:\s*span 12/, "el navegador de vistas ocupa toda la fila");
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

test("las etiquetas del tope y del optimo no se montan entre si cuando el techo es alto", async () => {
  const snapshot = snapshotWithIndicators();
  const env = snapshot.snapshot.environments.local;
  // Techo 2.656 ms contra un tope de 400: es la corrida real del puesto. Con las
  // dos etiquetas ancladas a la derecha y a 3 px sobre su linea, "tope 400 ms" y
  // "óptimo 240 ms" caian encima una de otra.
  env.performance.series = [
    { at: "2026-11-05T09:55:00.000Z", ms: 83, ok: true },
    { at: "2026-11-05T09:56:00.000Z", ms: 2656, ok: false },
    { at: "2026-11-05T09:57:00.000Z", ms: 791, ok: true },
    { at: "2026-11-05T09:58:00.000Z", ms: 966, ok: true }
  ];
  publishIndicators(snapshot);
  const { byId } = await mountedPanel(snapshot);
  const html = byId("performance").innerHTML;
  const etiquetas = [...html.matchAll(/<text class="chart-label[^"]*" x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)">([^<]+)<\/text>/g)]
    .map(([, x, y, anchor, texto]) => ({ x: Number(x), y: Number(y), anchor, texto }));
  assert.equal(etiquetas.length, 2, "tope y optimo etiquetados sobre el propio corte");
  assert.ok(etiquetas.every((n) => n.anchor === "start" && n.x < 40), "las etiquetas abren por la izquierda, donde el eje no las tapa");
  assert.ok(Math.abs(etiquetas[0].y - etiquetas[1].y) >= 12, "los dos textos guardan su altura tipografica");
  assert.ok(etiquetas.every((n) => n.y >= 9 && n.y <= 182), "ninguna etiqueta sale del area dibujada");
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
  // La banda de la vista es la peor entre los cuatro medidores que se pintan:
  // aqui la latencia esta en verde y es la cobertura por empresa la que manda el
  // semaforo.
  const verdict = byId("databaseVerdict").innerHTML;
  assert.match(verdict, /<p class="verdict-question">¿La base está rápida y con datos reales\?<\/p>/);
  assert.match(verdict, /<p class="verdict-text">Empresas con actividad 0,5 % · Crítico<\/p>/);
  assert.match(verdict, /Latencia de la base 42 ms \(óptimo ≤ 100, tope 300\)/);
  assert.match(verdict, /940 registros medidos en 3 módulos con conteo/);
  const kpis = byId("databaseKpis").innerHTML;
  assert.equal(kpis.split('<article class="metric-tile').length - 1, 4, "cuatro teselas: el maximo que publica el servidor por vista");
  assert.match(kpis, /Latencia de la base/);
  assert.match(kpis, /Consultas lentas/);
  assert.match(kpis, /Registros medidos/);
  assert.match(kpis, /Empresas con actividad/);
  // La frescura es evidencia de la vista Módulos: la vista Base no la repite.
  assert.doesNotMatch(kpis, /Frescura de datos/);
  // Cada tesela de la base carga su propia historia medida, no un numero suelto.
  assert.equal(kpis.split('class="monitor-chart" role="img"').length - 1, 4, "las cuatro teselas pintan su gráfico");
  assert.equal(kpis.split('<line class="chart-risk"').length - 1, 3,
    "tres con corte firmado; registros todavía está construyendo su banda habitual");
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
  const verdict = byId("databaseVerdict").innerHTML;
  assert.match(verdict, /<p class="verdict-text">Empresas con actividad 0,5 % · Crítico<\/p>/);
  assert.match(verdict, /ningún módulo publicó conteo de registros/);
  // El conteo que nunca llego tampoco se disfraza con una linea: la tesela queda
  // sin serie y el pie dice cuantas lecturas faltan para trazar su banda.
  assert.match(byId("databaseKpis").innerHTML, /<div class="monitor-chart idle" aria-hidden="true"><\/div><p class="monitor-chart-foot">sin banda habitual todavía: 0 de 8 lecturas medidas<\/p>/);
  assert.match(byId("databaseKpis").innerHTML, /<p class="tile-value">—<span class="tile-unit"><\/span><\/p>/, "un conteo que no existe se pinta como hueco, no como cero");
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
  // El componente que nunca devolvio viaje no recibe una linea: recibe el hueco
  // explicado. Lo no medido no es cero y tampoco es una muestra en el grafico.
  assert.match(byId("components").innerHTML, /Correo[\s\S]*?<div class="monitor-chart idle" aria-hidden="true"><\/div><p class="monitor-chart-foot">sin banda habitual todavía: 0 de 8 lecturas medidas<\/p>/);
});

// El recorte de etiquetas no puede dejar un monitor con un numero suelto: todo lo
// que se compara contra un tope se ve con la historia de sondeos que lo sustenta,
// dibujada con el mismo grafico y las mismas rayas que usa la vista Latencia.
// La publicacion real de esta forma la verifica test/server.test.js.
test("componentes, sondas y nube pintan su grafica con las lecturas medidas", async () => {
  const snapshot = snapshotWithIndicators();
  const env = snapshot.snapshot.environments.local;
  env.components.push({ key: "mail", name: "Correo", kind: "queue", status: "ok", latencyMs: null, score: null });
  env.cloud = {
    railway: { configured: true, status: "ok", latencyMs: 512, checkedAt: "2026-11-05T10:00:00.000Z", project: { name: "apex-api" } },
    supabase: { configured: false, status: "unknown" },
    vercel: null
  };
  snapshot.snapshot.checks.push({
    id: "cloud_railway", label: "Railway", source: "railway", environment: "local", status: "ok", durationMs: 512, detail: "GraphQL"
  });
  publishIndicators(snapshot);
  const { byId } = await mountedPanel(snapshot);

  const components = byId("components").innerHTML;
  assert.equal(components.split('class="monitor-chart" role="img"').length - 1, 2, "API y base trajeron viaje en los dos sondeos");
  // La base tiene tope versionado (dbLatency 100/300) y su raya se dibuja; el API
  // no tiene presupuesto propio y todavia no junta las ocho lecturas de su ventana.
  assert.match(components, /<div class="component-history"><div class="monitor-chart" role="img" aria-label="Base de datos: 2 lecturas medidas en 2 sondeos">[\s\S]*?<text class="chart-label risk"[^>]*>tope 300 ms</);
  assert.match(components, /aria-label="API: 2 lecturas medidas con corte todavía pendiente"/);
  assert.equal(components.split('class="threshold-chart').length - 1, 2, "cada componente con historia pinta su grafica");

  const checks = byId("checks").innerHTML;
  // La lista de sondas ya no se pinta entera: se dibujan las que tienen problema
  // y las demas se cuentan. El presupuesto de sonda del ambiente manda el viaje:
  // la sonda HTTP se corta en 400 ms y la de la nube en 800 ms.
  assert.equal(checks.split('<article class="check').length - 1, 2, "la sonda en verde no ocupa pantalla");
  assert.doesNotMatch(checks, /<h3>API<\/h3>/, "la sonda que respondio dentro del optimo queda en la cuenta");
  assert.equal(byId("probeMeta").textContent, "3 sondas · 1 en verde · 2 fallan o avisan");
  assert.match(checks, /aria-label="Railway: 2 lecturas medidas en 2 sondeos"[\s\S]*?<text class="chart-label risk"[^>]*>tope 800 ms</);
  assert.match(checks, /512 ms · En riesgo/, "512 ms a Railway pasa el optimo de 250 y se nombra como riesgo");
  assert.equal(checks.split('class="monitor-chart" role="img"').length - 1, 1, "la sonda sin viaje medido no pinta historia");
  assert.match(checks, /<div class="monitor-chart idle" aria-hidden="true"><\/div><p class="monitor-chart-foot">2 sondeos guardados · ninguno dejó lectura de este monitor<\/p>/);

  const cloud = byId("cloud").innerHTML;
  assert.match(cloud, /aria-label="Railway · viaje a la nube: 2 lecturas medidas en 2 sondeos"/);
  assert.match(cloud, /<line class="chart-optimal"[\s\S]*?<text class="chart-label risk"[^>]*>tope 800 ms</);
  assert.equal(cloud.split('class="threshold-chart').length - 1, 1, "un proveedor sin sonda propia no inventa historia");
});

test("la mesa del puesto se pinta con su propia historia medida", async () => {
  const snapshot = snapshotWithIndicators();
  // Forma publicada por server.js#publishOperation: los medidores del puesto
  // salen de alertas y trabajos, y llevan su serie en el mismo anillo.
  snapshot.operation = {
    gauges: [
      { key: "openAlerts", label: "Alertas abiertas", value: 0, band: "optimal", unit: "", window: 2,
        limits: { optimal: 0, risk: 2, kind: "budget", unit: "" },
        series: [{ at: "2026-11-05T09:59:00.000Z", value: 1, band: "risk" }, { at: "2026-11-05T10:00:00.000Z", value: 0, band: "optimal" }] },
      { key: "queuedJobs", label: "Trabajos por aprobar", value: 2, band: "risk", unit: "", window: 2,
        limits: { optimal: 0, risk: 3, kind: "budget", unit: "" },
        series: [{ at: "2026-11-05T09:59:00.000Z", value: 2, band: "risk" }, { at: "2026-11-05T10:00:00.000Z", value: 2, band: "risk" }] }
    ],
    verdict: { state: "risk", tone: "degraded", text: "Trabajos por aprobar 2 · En riesgo", rule: "Alertas abiertas 0 (óptimo ≤ 0, tope 3)", question: "¿Qué se está haciendo y qué falta?" }
  };
  const { byId } = await mountedPanel(snapshot);
  const html = byId("operationKpis").innerHTML;
  assert.equal(html.split('class="monitor-chart" role="img"').length - 1, 2, "cada cifra del puesto trae su grafica");
  assert.match(html, /<p class="tile-foot">óptimo ≤ 0 · en riesgo ≤ 2<\/p>[\s\S]*?<text class="chart-label risk"[^>]*>tope 2</);
  // La alerta que bajo de riesgo a optimo se ve en la serie: el numero de hoy no
  // borra la muestra de ayer.
  assert.match(html, /<title>[\s\S]*?· 1 · En riesgo<\/title>[\s\S]*?<title>[\s\S]*?· 0 · Óptimo<\/title>/);
  assert.match(byId("operationVerdict").innerHTML, /<p class="verdict-question">¿Qué se está haciendo y qué falta\?<\/p>/);
});

test("el mapa pinta cada módulo como el gráfico de latencia, en altura de renglón", async () => {
  const { byId } = await mountedPanel(snapshotWithIndicators());
  const html = byId("moduleMap").innerHTML;
  assert.equal(html.split('class="map-row').length - 1, 4, "3 módulos más la fila de la API");
  // La frescura medida se corta contra los topes publicados del medidor de
  // frescura (1x y 3x); la fila de la API usa el presupuesto de sonda.
  assert.equal(html.split('class="threshold-chart').length - 1, 3, "las filas con lecturas medidas dibujan su serie");
  assert.match(html, /Talento Humano[\s\S]*?<text class="chart-label risk"[^>]*>tope 3x</);
  assert.match(html, /<text class="chart-label"[^>]*>óptimo 1x</);
  assert.match(html, /Sonda \/health de la torre: 2 lecturas medidas con sus topes dibujados[\s\S]*?<text class="chart-label risk"[^>]*>tope 400 ms</);
  assert.match(html, /400 ms · Crítico · sonda fallida/, "el sondeo caido se nombra con su hora y su lectura");
  // Flota nunca publico frescura: su renglon dice cuantas lecturas faltan en vez
  // de dibujar una serie plana en cero.
  assert.match(html, /<span class="map-strip map-chart idle" aria-hidden="true"><small class="map-empty">sin historia: 0 de 2 lecturas medidas<\/small><\/span>/);
  assert.doesNotMatch(html, /map-tick/, "el mapa ya no pinta marcas sueltas");
  // El mapa es la unica vista de modulos: lleva su propio veredicto y cuenta
  // cuantos renglones se dibujaron de los leidos, porque el recorte se admite.
  assert.match(byId("moduleMapMeta").textContent, /^3 de 3 módulos dibujados · 2 sondeos/);
  assert.match(byId("modulesVerdict").innerHTML, /<p class="verdict-question">¿Los módulos están óptimos y al día\?<\/p>/);
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
  // La pregunta no se escribe dos veces: el panel reproduce la del servidor. Si
  // alguien la cambia en un lado, la banda y el titulo dejarian de responderse.
  const { VIEW_QUESTIONS } = require("../lib/metrics");
  assert.deepEqual(questions, VIEW_QUESTIONS);
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

test("la vista Resumen se queda con el cockpit y su barra de estado", async () => {
  const panel = await mountedPanel(snapshotWithIndicators());
  assert.deepEqual(panel.sections.filter((section) => !section.hidden).map((section) => section.name),
    ["cockpitTitle", "cockpitDialsTitle", "cockpitTilesTitle", "cockpitStatusPanel"]);
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
  assert.equal(panel.sections.filter((section) => !section.hidden).length, 4);
  assert.equal(panel.store.get("towerView"), "resumen");
});
