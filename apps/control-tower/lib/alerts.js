"use strict";

const crypto = require("node:crypto");

function severityFor(check) {
  if (check.status === "down") return check.critical ? "critical" : check.optional ? "medium" : "high";
  return check.critical ? "high" : "medium";
}

function summarizeDetail(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return detail.slice(0, 260);
  try {
    return JSON.stringify(detail).slice(0, 260);
  } catch {
    return "";
  }
}

class AlertEngine {
  constructor({ store, config, now = () => Date.now(), onOpen = null, onResolve = null } = {}) {
    this.store = store;
    this.config = config;
    this.now = now;
    this.onOpen = onOpen;
    this.onResolve = onResolve;
    this.open = new Map();
    this.lastFingerprint = new Map();
    const persisted = store ? store.alerts : [];
    for (const alert of persisted) {
      if (!alert.resolvedAt) this.open.set(alert.component, alert);
      this.lastFingerprint.set(alert.fingerprint, Date.parse(alert.at) || 0);
    }
  }

  evaluate(snapshot) {
    const opened = [];
    const resolved = [];
    const actionable = snapshot.checks.filter((check) => check.status === "down" || (check.status === "degraded" && !check.optional));

    for (const check of actionable) {
      const environment = check.environment || "local";
      const fingerprint = `${environment}:${check.id}:${check.status}`;
      const current = this.open.get(check.id);
      if (current && current.fingerprint === fingerprint) continue;
      if (current) {
        this.resolve(current, `Cambio de estado a ${check.status}`, resolved);
      }
      const last = this.lastFingerprint.get(fingerprint);
      if (last != null && this.now() - last < this.config.alerts.cooldownMs) continue;

      const alert = {
        id: `ALR-${crypto.randomBytes(3).toString("hex")}`,
        at: new Date(this.now()).toISOString(),
        severity: severityFor(check),
        component: check.id,
        environment,
        label: check.label,
        status: check.status,
        fingerprint,
        title: `${check.label}: ${check.status === "down" ? "caído" : "requiere atención"}`,
        message: summarizeDetail(check.detail),
        functional: check.functional || null,
        action: check.action || null,
        technical: check.technical || null,
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedAt: null,
        resolvedReason: null
      };
      if (this.store) this.store.addAlert(alert);
      this.open.set(check.id, alert);
      this.lastFingerprint.set(fingerprint, this.now());
      opened.push(alert);
      if (this.store) this.store.addEvent({ id: `EVT-${crypto.randomBytes(3).toString("hex")}`, at: alert.at, kind: "alert.opened", component: check.id, message: alert.title });
      if (this.onOpen) this.onOpen(alert);
    }

    for (const [component, alert] of this.open) {
      const check = snapshot.checks.find((item) => item.id === component);
      if (check && (check.status === "down" || check.status === "degraded")) continue;
      this.resolve(alert, check ? `Recuperado (${check.status})` : "Componente fuera del monitoreo", resolved);
    }

    return { opened, resolved };
  }

  resolve(alert, reason, sink = []) {
    const updated = this.store
      ? this.store.updateAlert(alert.id, { resolvedAt: new Date(this.now()).toISOString(), resolvedReason: reason })
      : { ...alert, resolvedAt: new Date(this.now()).toISOString(), resolvedReason: reason };
    this.open.delete(alert.component);
    if (this.store) {
      this.store.addEvent({ id: `EVT-${crypto.randomBytes(3).toString("hex")}`, at: new Date(this.now()).toISOString(), kind: "alert.resolved", component: alert.component, message: reason });
    }
    if (updated) sink.push(updated);
    if (updated && this.onResolve) this.onResolve(updated);
    return updated;
  }

  acknowledge(id, { by = "web" } = {}) {
    const alert = this.store ? this.store.alerts.find((item) => item.id === id) : null;
    if (!alert) return null;
    const updated = this.store.updateAlert(id, {
      acknowledged: true,
      acknowledgedBy: by,
      acknowledgedAt: new Date(this.now()).toISOString()
    });
    if (updated) {
      this.store.addEvent({ id: `EVT-${crypto.randomBytes(3).toString("hex")}`, at: new Date(this.now()).toISOString(), kind: "alert.acknowledged", component: alert.component, message: `Reconocida por ${by}` });
      this.open.set(alert.component, updated);
    }
    return updated;
  }

  ackAll({ by = "web" } = {}) {
    const acknowledged = [];
    for (const alert of this.open.values()) {
      const updated = this.acknowledge(alert.id, { by });
      if (updated) acknowledged.push(updated);
    }
    return acknowledged;
  }

  list({ onlyOpen = false, limit = 50 } = {}) {
    const alerts = this.store ? this.store.alerts : [];
    const filtered = onlyOpen ? alerts.filter((alert) => !alert.resolvedAt) : alerts;
    return filtered.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
  }
}

module.exports = { AlertEngine, severityFor, summarizeDetail };
