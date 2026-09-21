import assert from "node:assert/strict";
import test from "node:test";

process.env.TZ = "America/Bogota";

const { localCalendarDate, scheduleGpsRequired, scheduleMonitorDate, scheduleMonitorPunchEvidence, scheduleMonitorPunchEvidenceSummary, scheduleSameDayShiftIssue, scheduleTrackingMode } = await import(
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

test("resume la evidencia sin transportar la foto hasta que el administrador la solicite", () => {
  assert.deepEqual(scheduleMonitorPunchEvidenceSummary({
    id: "punch-17",
    extra_evidence: { base64_data: "data:image/jpeg;base64,abc", file_name: "salida.jpg" }
  }), {
    id: "punch-17",
    file_name: "salida.jpg",
    has_base64_data: true,
    available: true
  });
});

test("mantiene GPS por defecto y permite horarios solo con marcacion", () => {
  assert.equal(scheduleGpsRequired({}), true);
  assert.equal(scheduleGpsRequired({ metadata: { gps_required: false } }), false);
  assert.equal(scheduleGpsRequired({ tracking_mode: "punch_only" }), false);
  assert.equal(scheduleTrackingMode(true), "gps");
  assert.equal(scheduleTrackingMode(false), "punch_only");
});

const mismoDiaMessage = "La hora final debe ser estrictamente posterior a la hora inicial dentro de la misma fecha.";

test("bloquea en el formulario el horario que cruza medianoche reportado en QA", () => {
  assert.equal(scheduleSameDayShiftIssue("20:35", "05:00"), mismoDiaMessage);
  assert.equal(scheduleSameDayShiftIssue("22:00", "06:00"), mismoDiaMessage);
});

test("bloquea horas iguales porque la jornada debe terminar despues de empezar", () => {
  assert.equal(scheduleSameDayShiftIssue("08:00", "08:00"), mismoDiaMessage);
  assert.equal(scheduleSameDayShiftIssue("00:00", "00:00"), mismoDiaMessage);
});

test("acepta la jornada del mismo dia y los limites del reloj", () => {
  assert.equal(scheduleSameDayShiftIssue("08:00", "17:00"), "");
  assert.equal(scheduleSameDayShiftIssue("08:00", "08:01"), "");
  assert.equal(scheduleSameDayShiftIssue("00:00", "23:59"), "");
});

test("normaliza HH:mm:ss para que editar un horario no deje pasar horas iguales", () => {
  assert.equal(scheduleSameDayShiftIssue("08:00:00", "17:00:00"), "");
  assert.equal(scheduleSameDayShiftIssue("08:00", "08:00:00"), mismoDiaMessage);
  assert.equal(scheduleSameDayShiftIssue("20:35:00", "05:00:00"), mismoDiaMessage);
});

test("pide horas validas cuando el campo viene vacio o mal formado", () => {
  assert.equal(scheduleSameDayShiftIssue("", "17:00"), "Define horas validas en formato HH:mm.");
  assert.equal(scheduleSameDayShiftIssue("8:00", "17:00"), "Define horas validas en formato HH:mm.");
  assert.equal(scheduleSameDayShiftIssue("08:00", "25:00"), "Define horas validas en formato HH:mm.");
  assert.equal(scheduleSameDayShiftIssue(null, undefined), "Define horas validas en formato HH:mm.");
});
