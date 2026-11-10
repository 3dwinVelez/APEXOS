"use strict";

const DEFAULT_SIZE = 40;
const MEASURED_KEYS = ["gauges", "components", "checks"];

function finite(value) {
  // null y "" no son un cero: son la ausencia de lectura. Convertirlos en 0 daria
  // una barra pintada con una muestra que nunca existio.
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

// Anillo de lo que la torre realmente midio en cada sondeo, monitor por monitor.
// Es la columna vertebral de los ticks: un monitor se pinta con su historia, y una
// muestra que no existio no se guarda. El panel nunca ve un cero en el hueco: ve
// que el hueco esta ahi, que es otra respuesta.
//
// El anillo no banda nada: guarda el numero y la hora. El umbral vive en metrics.js
// y se aplica al leer, para que una subida de tope no deje historial viejo
// coloreado con la regla vieja.
class MonitorHistory {
  constructor({ maxSamples = DEFAULT_SIZE, persisted = null } = {}) {
    this.maxSamples = Math.max(2, Math.min(Number(maxSamples) || DEFAULT_SIZE, 240));
    this.series = new Map();
    if (persisted && typeof persisted === "object") {
      for (const [scope, samples] of Object.entries(persisted)) {
        if (!Array.isArray(samples)) continue;
        this.series.set(String(scope), samples
          .filter((sample) => sample && sample.at && MEASURED_KEYS.some((key) => sample[key] && typeof sample[key] === "object"))
          .slice(-this.maxSamples));
      }
    }
  }

  // gauges: las entradas publicadas por metrics (valor numerico y key).
  // components: los componentes leidos por el propio servidor (latencyMs).
  // checks: las sondas que hicieron el viaje (durationMs > 0; el cero es ausencia).
  record(scope, at, { gauges = [], components = [], checks = [] } = {}) {
    const id = String(scope || "local");
    const sample = { at: at || new Date().toISOString(), gauges: {}, components: {}, checks: {} };
    for (const entry of Array.isArray(gauges) ? gauges : []) {
      const value = finite(entry && entry.value);
      if (value != null && entry && entry.key) sample.gauges[entry.key] = value;
    }
    for (const component of Array.isArray(components) ? components : []) {
      // El panel recibe los componentes normalizados en camelCase, pero el API
      // publica snake_case: leer las dos formas evita un anillo vacio segun la
      // via por la que llego la lectura.
      const value = finite(component && (component.latencyMs ?? component.latency_ms));
      if (value != null && component && component.key) sample.components[component.key] = value;
    }
    for (const check of Array.isArray(checks) ? checks : []) {
      const value = finite(check && check.durationMs);
      if (value != null && value > 0 && check && check.id) sample.checks[String(check.id)] = value;
    }
    if (!MEASURED_KEYS.some((key) => Object.keys(sample[key]).length)) return null;
    const list = this.series.get(id) || [];
    list.push(sample);
    if (list.length > this.maxSamples) list.splice(0, list.length - this.maxSamples);
    this.series.set(id, list);
    return sample;
  }

  // Los sondeos mas recientes, en el orden en que sucedieron: el panel lee de
  // izquierda a derecha y no vuelve a ordenar nada.
  seriesFor(scope, { size = DEFAULT_SIZE } = {}) {
    const list = this.series.get(String(scope || "local")) || [];
    return list.slice(-Math.max(1, Number(size) || DEFAULT_SIZE));
  }

  toJSON() {
    return Object.fromEntries(Array.from(this.series.entries()));
  }
}

// Series bandeadas para un monitor: solo las muestras donde hubo lectura. La
// banda la calcula el llamador con el umbral del propio medidor.
function measuredSeries(samples, family, key, bandOf) {
  const list = Array.isArray(samples) ? samples : [];
  return list
    .filter((sample) => sample && sample[family] && finite(sample[family][key]) != null)
    .map((sample) => {
      const value = finite(sample[family][key]);
      return { at: sample.at, value, band: bandOf(value) };
    });
}

module.exports = { MonitorHistory, measuredSeries, DEFAULT_SIZE };
