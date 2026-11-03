"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_JSONL_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY = 180;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

function readJsonlTail(file, limit) {
  try {
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const records = [];
    for (const line of lines.slice(-limit)) {
      try {
        records.push(JSON.parse(line));
      } catch {
        // linea corrupta: se descarta sin romper el arranque
      }
    }
    return records;
  } catch {
    return [];
  }
}

function appendJsonl(file, record) {
  try {
    const stats = fs.existsSync(file) ? fs.statSync(file) : null;
    if (stats && stats.size > MAX_JSONL_BYTES) {
      fs.renameSync(file, `${file}.1`);
    }
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // la persistencia es secundaria: nunca tumba la torre
  }
}

class Store {
  constructor({ dataDir, alertMax = 80, eventMax = 300 } = {}) {
    this.dataDir = dataDir;
    this.alertMax = alertMax;
    this.eventMax = eventMax;
    this.alertsFile = path.join(dataDir, "alerts.jsonl");
    this.alertsSnapshotFile = path.join(dataDir, "alerts.json");
    this.eventsFile = path.join(dataDir, "events.jsonl");
    this.jobsFile = path.join(dataDir, "jobs.json");
    this.stateFile = path.join(dataDir, "state.json");
    this.alerts = [];
    this.events = [];
    this.jobs = [];
    this.history = [];
    this.snapshot = null;
    this.startedAt = new Date().toISOString();
    this.initialized = false;
  }

  init() {
    if (this.initialized) return this;
    ensureDir(this.dataDir);
    const persistedAlerts = readJson(this.alertsSnapshotFile, null);
    this.alerts = Array.isArray(persistedAlerts)
      ? persistedAlerts.slice(0, this.alertMax)
      : readJsonlTail(this.alertsFile, this.alertMax).reverse();
    this.events = readJsonlTail(this.eventsFile, this.eventMax).reverse();
    const persistedJobs = readJson(this.jobsFile, []);
    this.jobs = Array.isArray(persistedJobs) ? persistedJobs : [];
    const previous = readJson(this.stateFile, {});
    if (previous && previous.snapshot) this.snapshot = previous.snapshot;
    this.initialized = true;
    return this;
  }

  addAlert(alert) {
    this.alerts.unshift(alert);
    if (this.alerts.length > this.alertMax) this.alerts.length = this.alertMax;
    appendJsonl(this.alertsFile, alert);
    this.persistAlerts();
    return alert;
  }

  updateAlert(id, patch) {
    const index = this.alerts.findIndex((item) => item.id === id);
    if (index < 0) return null;
    this.alerts[index] = { ...this.alerts[index], ...patch, updatedAt: new Date().toISOString() };
    this.persistAlerts();
    return this.alerts[index];
  }

  persistAlerts() {
    try {
      writeJsonAtomic(this.alertsSnapshotFile, this.alerts);
    } catch {
      // ignore
    }
  }

  addEvent(event) {
    this.events.unshift(event);
    if (this.events.length > this.eventMax) this.events.length = this.eventMax;
    appendJsonl(this.eventsFile, event);
    return event;
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    this.history.unshift({ at: snapshot.at, overall: snapshot.overall, checks: snapshot.summary });
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
    try {
      writeJsonAtomic(this.stateFile, { snapshot, updatedAt: snapshot.at });
    } catch {
      // ignore
    }
  }

  setJobs(jobs) {
    this.jobs = jobs;
    try {
      writeJsonAtomic(this.jobsFile, jobs);
    } catch {
      // ignore
    }
  }

  readAux(name, fallback) {
    return readJson(path.join(this.dataDir, `${name}.json`), fallback);
  }

  writeAux(name, value) {
    try {
      writeJsonAtomic(path.join(this.dataDir, `${name}.json`), value);
      return true;
    } catch {
      return false;
    }
  }

  status() {
    return {
      dataDir: this.dataDir,
      alerts: this.alerts.length,
      events: this.events.length,
      jobs: this.jobs.length,
      history: this.history.length,
      lastSnapshotAt: this.snapshot ? this.snapshot.at : null,
      startedAt: this.startedAt
    };
  }
}

module.exports = { Store, readJson, writeJsonAtomic, appendJsonl, readJsonlTail };
