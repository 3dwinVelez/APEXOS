import assert from "node:assert/strict";
import test from "node:test";

process.env.TZ = "America/Bogota";

const { localCalendarDate, scheduleMonitorDate, scheduleMonitorPunchEvidence } = await import(
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
