const test = require("node:test");
const assert = require("node:assert/strict");
const { accumulatedOrdinaryMinutes } = require("../src/modules/hr/accumulatedOrdinaryTime");
const input = days => ({ concept_code: "JORNADA_ORDINARIA", metadata: { days } });

test("15 commercial days correspond to 105 salary-equivalent hours with a 210-hour month", () => {
  assert.equal(accumulatedOrdinaryMinutes(input(15), 210), 105 * 60);
  assert.equal(accumulatedOrdinaryMinutes(input(30), 210), 210 * 60);
});
test("the effective monthly divisor is respected instead of hardcoding 105 or eight-hour days", () => {
  assert.equal(accumulatedOrdinaryMinutes(input(15), 220), 110 * 60);
  assert.equal(accumulatedOrdinaryMinutes(input(15), 240), 120 * 60);
  assert.equal(accumulatedOrdinaryMinutes(input(10), 210), 70 * 60);
});
test("single worked days and explicit other concepts retain their existing calculation paths", () => {
  assert.equal(accumulatedOrdinaryMinutes(input(1), 210), null);
  assert.equal(accumulatedOrdinaryMinutes({ concept_code: "HED", metadata: { days: 15 } }, 210), null);
});
test("invalid or unavailable values do not invent accumulated hours", () => {
  for (const divisor of [undefined, 0, -210, Infinity, "invalid"]) assert.equal(accumulatedOrdinaryMinutes(input(15), divisor), null);
  assert.equal(accumulatedOrdinaryMinutes(input(0), 210), null);
});
