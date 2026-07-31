import assert from "node:assert/strict";
import test from "node:test";

process.env.TZ = "America/Bogota";

const { localCalendarDate, scheduleGpsRequired, scheduleMonitorDate, scheduleMonitorPunchEvidence, scheduleTrackingMode } = await import(
  "../lib/hrScheduleMonitor.ts"
);

test("usa la fecha calendario local cuando UTC ya avanzo al dia siguiente", () => {
  const eveningInBogota = new Date("2026-07-28T02:30:00.000Z");

  assert.equal(eveningInBogota.toISOString().slice(0, 10), "2026-07-28");
  assert.equal(localCalendarDate(eveningInBogota), "2026-07-27");
});

test("consulta el monitor con la fecha del horario seleccionado", () => {
  assert.equal(scheduleMonitorDate("2026-08-03T05:00:00.000Z"), "2026-08-03");
  assert.equal(scheduleMonitorDate("fecha-invalida", "2026-07-27"), "2026-07-27");
});

test("normaliza evidencia de marcaciones para el monitor de horarios", () => {
  assert.deepEqual(scheduleMonitorPunchEvidence({
    extra_evidence: { base64_data: "data:image/jpeg;base64,abc", file_name: "salida.jpg" }
  }), {
    base64_data: "data:image/jpeg;base64,abc",
    file_name: "salida.jpg"
  });

  assert.deepEqual(scheduleMonitorPunchEvidence({
    metadata: { extra_evidence: { base64: "data:image/png;base64,xyz", name: "offline.png" } }
  }), {
    base64_data: "data:image/png;base64,xyz",
    file_name: "offline.png"
  });
});

test("mantiene GPS por defecto y permite horarios solo con marcacion", () => {
  assert.equal(scheduleGpsRequired({}), true);
  assert.equal(scheduleGpsRequired({ metadata: { gps_required: false } }), false);
  assert.equal(scheduleGpsRequired({ tracking_mode: "punch_only" }), false);
  assert.equal(scheduleTrackingMode(true), "gps");
  assert.equal(scheduleTrackingMode(false), "punch_only");
});
