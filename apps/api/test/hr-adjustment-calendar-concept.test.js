const test = require("node:test");
const assert = require("node:assert/strict");
const { adjustmentCalendarConcept } = require("../src/modules/hr/adjustmentCalendarConcept");
const ordinary = (metadata, minutes = 0) => ({ concept_code: "JORNADA_ORDINARIA", metadata, minutes });

test("the reported 15-day range stays ordinary even when its reference date is Sunday", () => {
  assert.deepEqual(adjustmentCalendarConcept(ordinary({ days: 15, date_start: "2026-11-01", date_end: "2026-11-15", work_date: "2026-11-15" }), "dominical"), { code: "JORNADA_ORDINARIA", accumulated: true });
});
test("accumulated days, date ranges and more than a day of minutes do not inherit a holiday", () => {
  for (const input of [ordinary({ days: "15" }), ordinary({ dias: 2 }), ordinary({ date_start: "2026-11-01", date_end: "2026-11-15" }), ordinary({}, 7200)]) {
    assert.equal(adjustmentCalendarConcept(input, "festivo").code, "JORNADA_ORDINARIA");
  }
});
test("single-day Sunday, holiday and nonworking-day classification is preserved", () => {
  for (const type of ["dominical", "festivo", "no_laboral"]) {
    assert.deepEqual(adjustmentCalendarConcept(ordinary({ days: 1, date_start: "2026-11-15", date_end: "2026-11-15" }, 480), type), { code: "DOM_FEST_DIURNO", accumulated: false });
  }
});
test("partial days and legacy single-day corrections retain calendar classification", () => {
  assert.equal(adjustmentCalendarConcept(ordinary({ days: 0.5 }), "dominical").code, "DOM_FEST_DIURNO");
  assert.equal(adjustmentCalendarConcept(ordinary({}, 540), "dominical").code, "DOM_FEST_DIURNO");
  assert.equal(adjustmentCalendarConcept(ordinary({ days: 1 }), "ordinario").code, "JORNADA_ORDINARIA");
});
test("explicit overtime, surcharge and manual concepts are never relabeled", () => {
  for (const code of ["HED", "HEN", "DOM_FEST_DIURNO", "DOM_FEST_NOCTURNO", "BONIFICACION_SALARIAL"]) {
    assert.deepEqual(adjustmentCalendarConcept({ concept_code: code, metadata: { days: 15 } }, "dominical"), { code, accumulated: false });
  }
});
