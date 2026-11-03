process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const test = require("node:test");

const { computeOverall, incidentFingerprint, runPulse } = require("../src/modules/apex-control/pulse");
const { buildEvent, emit, fingerprintOf } = require("../src/modules/apex-control/events");
const { componentResult, PROBE_DEFINITIONS, scoreFor } = require("../src/modules/apex-control/probes");

function componentOf(key, status, latency = 12) {
  const definition = PROBE_DEFINITIONS.find((item) => item.key === key);
  return componentResult(definition, status, latency, { probe: key });
}

function createDb(seedComponents = []) {
  const state = {
    components: new Map(seedComponents.map((row) => [row.key, { enabled: true, metadata: {}, ...row }])),
    samples: [],
    incidents: [],
    notifications: [],
    events: []
  };
  let seq = 1;
  const nextId = () => seq++;

  const db = {
    state,
    apexComponent: {
      async findMany({ where } = {}) {
        const keys = where?.key?.in;
        return [...state.components.values()]
          .filter((row) => !keys || keys.includes(row.key))
          .map((row) => ({ ...row }));
      },
      async findUnique({ where }) {
        return state.components.get(where.key) || null;
      },
      async upsert({ where, create, update }) {
        const existing = state.components.get(where.key);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { enabled: true, metadata: {}, ...create };
        state.components.set(where.key, row);
        return { ...row };
      }
    },
    apexHealthSample: {
      async createMany({ data }) {
        for (const row of data) state.samples.push({ id: nextId(), ...row });
        return { count: data.length };
      },
      async findMany({ where, take }) {
        const rows = state.samples
          .filter((row) => row.component_key === where.component_key)
          .sort((a, b) => b.id - a.id);
        return (take ? rows.slice(0, take) : rows).map((row) => ({ id: row.id, status: row.status, component_key: row.component_key }));
      }
    },
    apexIncident: {
      async findFirst({ where }) {
        const statuses = where.status?.in;
        return state.incidents.find((row) => row.fingerprint === where.fingerprint && (!statuses || statuses.includes(row.status))) || null;
      },
      async create({ data }) {
        const row = { id: nextId(), ...data };
        state.incidents.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = state.incidents.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }
    },
    apexNotification: {
      async create({ data }) {
        const row = { id: nextId(), created_at: new Date(), ...data };
        state.notifications.push(row);
        return row;
      }
    },
    apexEvent: {
      async findFirst({ where }) {
        const since = where.occurred_at?.gte;
        return state.events
          .filter((row) => row.fingerprint === where.fingerprint && (!since || row.occurred_at >= since))
          .at(-1) || null;
      },
      async create({ data }) {
        const row = { id: nextId(), ...data };
        state.events.push(row);
        return row;
      }
    }
  };
  return db;
}

function pulseDeps(db, statuses, now) {
  const ws = {
    broadcasts: [],
    broadcast() {},
    broadcastAll(message) {
      this.broadcasts.push(message);
    }
  };
  return {
    prisma: db,
    ws,
    now,
    collectAll: async ({ keys }) => keys.map((key) => componentOf(key, statuses[key] || "ok"))
  };
}

test("buildEvent normaliza severidad, calcula fingerprint y redacta secretos", () => {
  const event = buildEvent({
    source: "api",
    kind: "http.5xx",
    severity: "FATAL",
    component_key: "api",
    entity_type: "http_route",
    entity_id: "/api/v1/orders",
    payload: { password: "super-secreto", token: "abc", route: "/api/v1/orders" }
  });
  assert.equal(event.severity, "info", "una severidad desconocida no escala a critical");
  assert.equal(event.payload.password, "[REDACTED]");
  assert.equal(event.payload.token, "[REDACTED]");
  assert.equal(event.payload.route, "/api/v1/orders");
  assert.equal(event.fingerprint, fingerprintOf({ source: "api", kind: "http.5xx", component_key: "api", entity_type: "http_route", entity_id: "/api/v1/orders" }));
  assert.equal(buildEvent({ kind: "a", component_key: "db" }).fingerprint, buildEvent({ kind: "a", component_key: "db" }).fingerprint);
  assert.notEqual(buildEvent({ kind: "a", component_key: "db" }).fingerprint, buildEvent({ kind: "a", component_key: "redis" }).fingerprint);
});

test("emit deduplica eventos dentro de la ventana y publica el primero", async () => {
  const db = createDb();
  const ws = { broadcasts: [], broadcast() {}, broadcastAll(message) { this.broadcasts.push(message); } };
  const payload = { source: "api", kind: "http.5xx", severity: "error", component_key: "api", fingerprint: "http:GET:/x:5xx", dedupe_window_s: 30 };
  const first = await emit(payload, { prisma: db, ws });
  const second = await emit(payload, { prisma: db, ws });
  assert.equal(db.state.events.length, 1);
  assert.equal(first.id, second.id);
  assert.equal(ws.broadcasts.filter((message) => message.type === "apex-control:event").length, 1);
});

test("computeOverall degrada con un componente crítico caído y no escala por unknown", () => {
  const ok = componentOf("api", "ok");
  const db = { ...componentOf("db", "down"), criticality: "critical" };
  const redis = { ...componentOf("redis", "degraded"), criticality: "critical" };

  assert.equal(computeOverall([ok, { ...db }]).status, "down");
  assert.equal(computeOverall([ok, { ...db, key: "redis", status: "down" }]).status, "degraded", "una caida parcial de un critico no equivale a perder la base de datos");
  assert.equal(computeOverall([ok, { ...db, status: "degraded" }]).status, "degraded");
  assert.equal(computeOverall([ok, redis]).status, "degraded");
  assert.equal(computeOverall([ok, componentOf("minio", "unknown")]).status, "ok");
  assert.equal(computeOverall([componentOf("minio", "unknown")]).status, "unknown");
  assert.equal(computeOverall([ok]).score, 100);
});

test("runPulse abre un incidente, no lo duplica y lo resuelve tras dos muestras ok", async () => {
  const db = createDb();
  const now = new Date("2026-11-02T12:00:00.000Z");

  const degraded = await runPulse(pulseDeps(db, { db: "down" }, now));
  assert.equal(degraded.status, "down");
  assert.equal(db.state.components.get("db").last_status, "down");
  assert.equal(db.state.samples.length, PROBE_DEFINITIONS.length);
  assert.equal(db.state.incidents.length, 1);
  const incident = db.state.incidents[0];
  assert.equal(incident.fingerprint, incidentFingerprint("db"));
  assert.equal(incident.severity, "critical");
  assert.equal(incident.status, "open");
  assert.equal(db.state.notifications.length, 1);
  assert.ok(db.state.events.some((event) => event.kind === "incident.opened" && event.component_key === "db"));

  const stillDown = await runPulse(pulseDeps(db, { db: "down" }, new Date(now.getTime() + 15000)));
  assert.equal(stillDown.status, "down");
  assert.equal(db.state.incidents.length, 1, "el fingerprint evita duplicar el incidente abierto");
  assert.equal(db.state.notifications.length, 1, "un incidente abierto no vuelve a notificar");
  assert.equal(db.state.incidents[0].last_seen.getTime(), now.getTime() + 15000);

  await runPulse(pulseDeps(db, {}, new Date(now.getTime() + 30000)));
  assert.equal(db.state.incidents[0].status, "open", "una sola muestra ok no resuelve el incidente");

  const recovered = await runPulse(pulseDeps(db, {}, new Date(now.getTime() + 45000)));
  assert.equal(recovered.status, "ok");
  assert.equal(db.state.incidents[0].status, "resolved");
  assert.ok(db.state.incidents[0].resolved_at);
  assert.ok(db.state.events.some((event) => event.kind === "incident.resolved"));
  assert.equal(db.state.notifications.length, 2);
});

test("runPulse respeta componentes deshabilitados y publica el snapshot global", async () => {
  const db = createDb([{ key: "minio", name: "Almacenamiento", kind: "storage", criticality: "standard", enabled: false, last_status: "unknown" }]);
  const deps = pulseDeps(db, {}, new Date("2026-11-02T12:00:00.000Z"));
  const collected = [];
  const original = deps.collectAll;
  deps.collectAll = async (options) => {
    collected.push(...options.keys);
    return original(options);
  };

  const snapshot = await runPulse(deps);
  assert.equal(collected.includes("minio"), false, "un componente deshabilitado no se sondea");
  assert.equal(snapshot.components.some((item) => item.key === "minio"), false);
  const broadcast = deps.ws.broadcasts.find((message) => message.type === "apex-control:snapshot");
  assert.ok(broadcast);
  assert.equal(broadcast.data.status, "ok");
  assert.equal(broadcast.data.components.length, PROBE_DEFINITIONS.length - 1);
  assert.equal(scoreFor("degraded"), 60);
});
