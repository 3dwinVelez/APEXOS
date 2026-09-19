const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertSameDayShift,
  splitDayNightSegments,
  validateMileage,
  noveltyLogicalKey
} = require("../src/modules/hr/policy");

test("accepts same-day shifts and rejects shifts that cross midnight", () => {
  assert.deepEqual(assertSameDayShift({ startTime: "08:00", endTime: "17:00" }), { start: 480, end: 1020 });
  assert.throws(() => assertSameDayShift({ startTime: "22:00", endTime: "06:00" }), /hora final debe ser estrictamente posterior/);
  assert.throws(() => assertSameDayShift({ startTime: "08:00", endTime: "08:00" }), /hora final debe ser estrictamente posterior/);
});

test("splits a same-day shift when it crosses the configured night start", () => {
  const segments = splitDayNightSegments({ startTime: "17:00", endTime: "21:00" });
  assert.deepEqual(segments, [
    { start: 1020, end: 1140, minutes: 120, kind: "diurna" },
    { start: 1140, end: 1260, minutes: 120, kind: "nocturna" }
  ]);
});

test("validates closing mileage as positive decimal kilometers", () => {
  assert.equal(validateMileage("42.5"), 42.5);
  assert.equal(validateMileage(0), 0);
  assert.throws(() => validateMileage("42.55"), /kilometraje debe ser numerico/i);
  assert.throws(() => validateMileage("-1"), /kilometraje debe ser numerico/i);
  assert.throws(() => validateMileage(""), /obligatorio/i);
});

test("FM-08: los errores de kilometraje son 400 con codigo, no 500 genericos", () => {
  const cases = [
    { value: "", code: "KILOMETRAJE_REQUERIDO" },
    { value: "42.55", code: "KILOMETRAJE_INVALIDO" },
    { value: "-1", code: "KILOMETRAJE_INVALIDO" }
  ];
  for (const item of cases) {
    assert.throws(
      () => validateMileage(item.value),
      (error) => {
        assert.equal(error.statusCode, 400, `statusCode debe ser 400 para ${JSON.stringify(item.value)}`);
        assert.equal(error.code, item.code, `codigo esperado ${item.code}`);
        return true;
      }
    );
  }
});

test("builds an idempotent novelty key from tenant, employee, date, route and type", () => {
  assert.equal(
    noveltyLogicalKey({ tenantId: "tenant-a", employeeId: 7, date: "2026-09-17T12:00:00Z", routeId: 99, typeCode: "KILOMETRAJE_INCONSISTENTE" }),
    "tenant-a:7:2026-09-17:99:KILOMETRAJE_INCONSISTENTE:dia"
  );
});
