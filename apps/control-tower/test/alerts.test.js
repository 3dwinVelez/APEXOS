"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { AlertEngine } = require("../lib/alerts");

class MemoryStore {
  constructor() {
    this.alerts = [];
    this.events = [];
  }

  addAlert(alert) {
    this.alerts.unshift(alert);
    return alert;
  }

  updateAlert(id, patch) {
    const index = this.alerts.findIndex((alert) => alert.id === id);
    if (index < 0) return null;
    this.alerts[index] = { ...this.alerts[index], ...patch };
    return this.alerts[index];
  }

  addEvent(event) {
    this.events.unshift(event);
    return event;
  }
}

function snapshot(checks) {
  return { at: new Date().toISOString(), checks };
}

function check(id, status, extra = {}) {
  return { id, label: id.toUpperCase(), status, severity: "medium", critical: false, optional: false, detail: "detalle", ...extra };
}

test("abre alerta al caer un servicio critico y la resuelve al recuperarse", () => {
  let now = 1000;
  const store = new MemoryStore();
  const engine = new AlertEngine({ store, config: { alerts: { cooldownMs: 60000 } }, now: () => now });

  const opened = engine.evaluate(snapshot([check("api", "down", { critical: true })]));
  assert.equal(opened.opened.length, 1);
  assert.equal(opened.opened[0].severity, "critical");
  assert.equal(engine.list({ onlyOpen: true }).length, 1);

  now += 5000;
  const stillDown = engine.evaluate(snapshot([check("api", "down", { critical: true })]));
  assert.equal(stillDown.opened.length, 0, "no duplica la alerta");

  const recovered = engine.evaluate(snapshot([check("api", "ok", { critical: true })]));
  assert.equal(recovered.resolved.length, 1);
  assert.equal(engine.list({ onlyOpen: true }).length, 0);
});

test("respeta el cooldown ante parpadeo", () => {
  let now = 1000;
  const store = new MemoryStore();
  const engine = new AlertEngine({ store, config: { alerts: { cooldownMs: 60000 } }, now: () => now });

  engine.evaluate(snapshot([check("redis", "down")]));
  engine.evaluate(snapshot([check("redis", "ok")]));
  now += 10000;
  const flap = engine.evaluate(snapshot([check("redis", "down")]));
  assert.equal(flap.opened.length, 0);

  now += 60000;
  const later = engine.evaluate(snapshot([check("redis", "down")]));
  assert.equal(later.opened.length, 1);
});

test("componentes opcionales degradados no generan alerta", () => {
  const store = new MemoryStore();
  const engine = new AlertEngine({ store, config: { alerts: { cooldownMs: 60000 } } });
  const result = engine.evaluate(snapshot([check("minio", "degraded", { optional: true })]));
  assert.equal(result.opened.length, 0);
  assert.equal(engine.list({ onlyOpen: true }).length, 0);
});

test("opcional caido si alerta y reconocer persiste", () => {
  const store = new MemoryStore();
  const engine = new AlertEngine({ store, config: { alerts: { cooldownMs: 60000 } } });
  const result = engine.evaluate(snapshot([check("brain", "down", { optional: true })]));
  assert.equal(result.opened.length, 1);

  const acknowledged = engine.acknowledge(result.opened[0].id, { by: "telegram" });
  assert.equal(acknowledged.acknowledged, true);
  assert.equal(acknowledged.acknowledgedBy, "telegram");
  assert.equal(store.alerts[0].acknowledged, true);
});

test("alerta conserva ambiente, impacto funcional y detalle tecnico", () => {
  const store = new MemoryStore();
  const engine = new AlertEngine({ store, config: { alerts: { cooldownMs: 60000 } } });
  const result = engine.evaluate(snapshot([
    check("develop.api", "down", {
      environment: "develop",
      functional: "Los usuarios de QA no pueden operar.",
      action: "Revisa el despliegue de QA.",
      technical: { endpoint: "https://qa.example/health", httpStatus: 502 }
    })
  ]));
  const alert = result.opened[0];
  assert.equal(alert.environment, "develop");
  assert.equal(alert.functional, "Los usuarios de QA no pueden operar.");
  assert.equal(alert.action, "Revisa el despliegue de QA.");
  assert.equal(alert.technical.endpoint, "https://qa.example/health");
  assert.equal(alert.technical.httpStatus, 502);
  assert.equal(alert.fingerprint, "develop:develop.api:down");
});

test("ambientes distintos generan alertas independientes", () => {
  const store = new MemoryStore();
  const engine = new AlertEngine({ store, config: { alerts: { cooldownMs: 60000 } } });
  const result = engine.evaluate(snapshot([
    check("api", "down", { environment: "local" }),
    check("develop.api", "down", { environment: "develop" })
  ]));
  assert.equal(result.opened.length, 2);
  assert.deepEqual(result.opened.map((alert) => alert.environment).sort(), ["develop", "local"]);
  assert.deepEqual(result.opened.map((alert) => alert.fingerprint).sort(), ["develop:develop.api:down", "local:api:down"]);
  assert.equal(engine.list({ onlyOpen: true }).length, 2);
});
