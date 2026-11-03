"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { THRESHOLDS, bandFor, moduleScore, computeHealth, withModuleBands } = require("../lib/health");

function module(extra = {}) {
  return { key: "inventario", name: "Inventario", group: "Operacion", status: "ok", data: null, ...extra };
}

test("los umbrales oficiales son optimo 85, riesgo 60 y critico por debajo", () => {
  assert.equal(THRESHOLDS.optimal, 85);
  assert.equal(THRESHOLDS.risk, 60);
  assert.equal(bandFor(100).key, "optimal");
  assert.equal(bandFor(85).key, "optimal");
  assert.equal(bandFor(84).key, "risk");
  assert.equal(bandFor(60).key, "risk");
  assert.equal(bandFor(59).key, "critical");
  assert.equal(bandFor(0).key, "critical");
  assert.equal(bandFor(null).key, "unknown");
  assert.equal(bandFor(NaN).key, "unknown");
});

test("el score por modulo castiga estado y frescura sin puntuar lo no medido", () => {
  assert.deepEqual(moduleScore(module()), { score: 100, band: "optimal" });
  assert.deepEqual(moduleScore(module({ status: "degraded" })), { score: 65, band: "risk" });
  assert.deepEqual(moduleScore(module({ status: "down" })), { score: 10, band: "critical" });
  assert.deepEqual(moduleScore(module({ status: "unknown" })), { score: null, band: "unknown" });
  assert.deepEqual(moduleScore(module({ data: { state: "declared" } })), { score: null, band: "unknown" });

  const nearStale = moduleScore(module({
    data: { state: "fresh", age_minutes: 950, expected_minutes: 1000 }
  }));
  assert.ok(nearStale.score < 100 && nearStale.score >= 70, "un modulo al 95% de su ventana entra en riesgo");
  assert.equal(nearStale.band, "risk");

  const fresh = moduleScore(module({
    data: { state: "fresh", age_minutes: 100, expected_minutes: 1000 }
  }));
  assert.equal(fresh.score, 100);
});

test("el score del ambiente mezcla 70% modulos y 30% infraestructura", () => {
  const modules = [
    module({ key: "inventario", status: "ok" }),
    module({ key: "ventas", status: "degraded" }),
    module({ key: "compras", status: "down" }),
    module({ key: "calidad", status: "unknown", data: { state: "declared" } })
  ];
  const checks = [
    { id: "api", status: "ok", label: "API" },
    { id: "db", status: "ok", label: "PostgreSQL" },
    { id: "local.modules", status: "degraded", group: "module", source: "modules" },
    { id: "local.activity", status: "degraded", group: "activity", source: "activity" }
  ];
  const health = computeHealth({ modules, checks });
  assert.equal(health.modules.score, 58, "100 + 65 + 10 entre 3 medibles");
  assert.equal(health.modules.measurable, 3);
  assert.equal(health.infra.score, 100, "modulos y actividad no contaminan la infraestructura");
  assert.equal(health.score, 71);
  assert.equal(health.band, "risk");
  assert.deepEqual(health.counts, { total: 4, ok: 1, degraded: 1, down: 1, unknown: 1 });
  assert.deepEqual(health.thresholds, { optimal: 85, risk: 60 });
});

test("sin modulos medibles el score cae a la infraestructura y sin nada queda sin dato", () => {
  const infraOnly = computeHealth({
    modules: [module({ status: "unknown", data: { state: "declared" } })],
    checks: [{ id: "api", status: "down", label: "API" }]
  });
  assert.equal(infraOnly.score, 10);
  assert.equal(infraOnly.band, "critical");

  const empty = computeHealth({ modules: [], checks: [] });
  assert.equal(empty.score, null);
  assert.equal(empty.band, "unknown");
});

test("withModuleBands deja score y banda listos para el grafico", () => {
  const modules = [
    module({ key: "inventario", status: "ok" }),
    module({ key: "ventas", status: "down" })
  ];
  const health = computeHealth({ modules });
  const enriched = withModuleBands(modules, health);
  assert.deepEqual(enriched.map((item) => [item.key, item.band]), [["inventario", "optimal"], ["ventas", "critical"]]);
  assert.equal(enriched[0].score, 100);
  assert.equal(enriched[1].score, 10);
});
