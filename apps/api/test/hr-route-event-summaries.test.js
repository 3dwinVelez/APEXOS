const assert = require("node:assert/strict");
const test = require("node:test");
const { buildRouteEventSummaries } = require("../src/modules/hr/routeEventSummaries");

test("combina marcaciones, actividades, evidencias y cierres por horario", () => {
  const rows = buildRouteEventSummaries({
    routeContexts: [{ route_id: 21 }, { route_id: 22 }],
    punchGroups: [{ route_id: 21, _count: { _all: 3 }, _max: { punched_at: new Date("2026-08-10T15:00:00Z") } }],
    activityGroups: [{ route_id: 21, _count: { _all: 2 }, _max: { occurred_at: new Date("2026-08-10T16:00:00Z") } }],
    closedGroups: [{ route_id: 21, _count: { _all: 1 } }],
    evidenceRows: [{ activity: { route_id: 21 } }, { activity: { route_id: 21 } }]
  });

  assert.deepEqual(rows[0], {
    route_id: 21,
    punch_count: 3,
    activity_count: 2,
    evidence_count: 2,
    closed_count: 1,
    event_count: 5,
    last_event_at: "2026-08-10T16:00:00.000Z"
  });
  assert.deepEqual(rows[1], {
    route_id: 22,
    punch_count: 0,
    activity_count: 0,
    evidence_count: 0,
    closed_count: 0,
    event_count: 0,
    last_event_at: null
  });
});

test("ignora fechas invalidas sin romper el resumen", () => {
  const [row] = buildRouteEventSummaries({
    routeContexts: [{ route_id: 7 }],
    punchGroups: [{ route_id: 7, _count: { _all: 1 }, _max: { punched_at: "fecha-invalida" } }]
  });
  assert.equal(row.event_count, 1);
  assert.equal(row.last_event_at, null);
});

test("asocia eventos sin route_id por fecha e identidad como el detalle", () => {
  const [row] = buildRouteEventSummaries({
    routeContexts: [{ route_id: 25, date: "2026-08-10T05:00:00.000Z", assigned_aliases: ["usuario horarios", "EMP-25"] }],
    unlinkedPunches: [{
      employee_id: null,
      user_name: "Usuario Horarios",
      type: "entrada",
      punched_at: "2026-08-10T13:05:00.000Z",
      metadata: {}
    }],
    unlinkedActivities: [{
      user_name: "EMP-25",
      occurred_at: "2026-08-11T03:30:00.000Z",
      metadata: {},
      _count: { evidence: 1 }
    }]
  });

  assert.equal(row.punch_count, 1);
  assert.equal(row.activity_count, 1);
  assert.equal(row.evidence_count, 1);
  assert.equal(row.event_count, 2);
});

test("prioriza la ruta explicita en metadata para eventos historicos", () => {
  const rows = buildRouteEventSummaries({
    routeContexts: [
      { route_id: 25, date: "2026-08-10T05:00:00.000Z", assigned_aliases: ["usuario"] },
      { route_id: 26, date: "2026-08-10T05:00:00.000Z", assigned_aliases: ["usuario"] }
    ],
    unlinkedPunches: [{ user_name: "usuario", type: "salida", punched_at: "2026-08-10T22:00:00.000Z", metadata: { display_route_id: "26" } }]
  });

  assert.equal(rows[0].event_count, 0);
  assert.equal(rows[1].event_count, 1);
  assert.equal(rows[1].closed_count, 1);
});
