"use strict";

const DEFAULT_SERIES = 40;

function percentile(sorted, value) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((value / 100) * sorted.length) - 1));
  return sorted[index];
}

function round(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

class PerformanceTracker {
  constructor({ maxSamples = 120, persisted = null } = {}) {
    this.maxSamples = Math.max(10, Math.min(Number(maxSamples) || 120, 720));
    this.series = new Map();
    if (persisted && typeof persisted === "object") {
      for (const [environment, samples] of Object.entries(persisted)) {
        if (!Array.isArray(samples)) continue;
        this.series.set(environment, samples
          .filter((sample) => sample && Number.isFinite(Number(sample.ms)))
          .slice(-this.maxSamples)
          .map((sample) => ({
            at: sample.at,
            ms: Math.max(0, Number(sample.ms)),
            ok: sample.ok !== false,
            endpoint: typeof sample.endpoint === "string" ? sample.endpoint : null,
            status: typeof sample.status === "string" ? sample.status : null
          })));
      }
    }
  }

  record(environment, sample) {
    const id = String(environment || "local");
    const ms = Number(sample && sample.ms);
    if (!Number.isFinite(ms) || ms < 0) return null;
    const record = {
      at: sample.at || new Date().toISOString(),
      ms,
      ok: sample.ok !== false,
      endpoint: sample.endpoint || null,
      status: sample.status || null
    };
    const list = this.series.get(id) || [];
    list.push(record);
    if (list.length > this.maxSamples) list.splice(0, list.length - this.maxSamples);
    this.series.set(id, list);
    return record;
  }

  recordAll(metrics) {
    for (const metric of metrics || []) {
      this.record(metric.environment, metric);
    }
  }

  summary(environment, { seriesSize = DEFAULT_SERIES } = {}) {
    const samples = this.series.get(String(environment || "local")) || [];
    const durations = samples.map((sample) => sample.ms).sort((left, right) => left - right);
    const last = samples[samples.length - 1] || null;
    const failures = samples.filter((sample) => !sample.ok).length;
    return {
      samples: samples.length,
      failures,
      errorRate: samples.length ? round((failures / samples.length) * 100) : null,
      last,
      avg: durations.length ? round(durations.reduce((total, value) => total + value, 0) / durations.length) : null,
      min: durations.length ? round(durations[0]) : null,
      max: durations.length ? round(durations[durations.length - 1]) : null,
      p50: round(percentile(durations, 50)),
      p95: round(percentile(durations, 95)),
      series: samples.slice(-seriesSize).map((sample) => ({ at: sample.at, ms: round(sample.ms), ok: sample.ok }))
    };
  }

  all(environments) {
    const ids = environments && environments.length ? environments : Array.from(this.series.keys());
    return Object.fromEntries(ids.map((id) => [id, this.summary(id)]));
  }

  toJSON() {
    return Object.fromEntries(Array.from(this.series.entries()).map(([id, samples]) => [id, samples]));
  }
}

module.exports = { PerformanceTracker, percentile };
