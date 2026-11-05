"use strict";

const { moduleTicks } = require("./metrics");

const DEFAULT_SIZE = 40;

// Anillo de sondeos por ambiente con lo que la torre realmente midio de cada
// modulo en ese momento (banda, ratio de frescura y registros). No guarda
// latencias por modulo: la API las publica por conjunto, no por componente, e
// inventar una por componente daria un grafico decorativo.
class ModuleTelemetry {
  constructor({ maxSamples = DEFAULT_SIZE, persisted = null } = {}) {
    this.maxSamples = Math.max(2, Math.min(Number(maxSamples) || DEFAULT_SIZE, 240));
    this.series = new Map();
    if (persisted && typeof persisted === "object") {
      for (const [environment, samples] of Object.entries(persisted)) {
        if (!Array.isArray(samples)) continue;
        this.series.set(String(environment), samples
          .filter((sample) => sample && sample.at && sample.ticks && typeof sample.ticks === "object")
          .slice(-this.maxSamples));
      }
    }
  }

  record(environment, modules, at, api = null) {
    const id = String(environment || "local");
    const sample = moduleTicks(modules, at || new Date().toISOString(), api);
    if (!Object.keys(sample.ticks).length) return null;
    const list = this.series.get(id) || [];
    list.push(sample);
    if (list.length > this.maxSamples) list.splice(0, list.length - this.maxSamples);
    this.series.set(id, list);
    return sample;
  }

  seriesFor(environment, { size = DEFAULT_SIZE } = {}) {
    const list = this.series.get(String(environment || "local")) || [];
    return list.slice(-Math.max(1, Number(size) || DEFAULT_SIZE));
  }

  toJSON() {
    return Object.fromEntries(Array.from(this.series.entries()));
  }
}

module.exports = { ModuleTelemetry, DEFAULT_SIZE };
