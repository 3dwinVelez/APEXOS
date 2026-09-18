const assert = require("node:assert/strict");
const test = require("node:test");
const { DEFAULT_API_URL, FIXTURE_TAG, expectedCounts, fixture, monthWindow, normalizeBaseUrl } = require("../certifications/commercial-management-population-qa");

test("la poblacion comercial tiene volumen sustancial y codigos deterministas", () => {
  const counts = expectedCounts();
  assert.equal(FIXTURE_TAG, "QA-CM-STABILITY-V1");
  assert.ok(counts.customers >= 20);
  assert.ok(counts.products >= 16);
  assert.ok(counts.visits >= 20);
  assert.ok(counts.commitments >= 20);
  assert.equal(new Set(fixture.zones.map(([code]) => code)).size, counts.zones);
  assert.equal(new Set(fixture.categories.map(([code]) => code)).size, counts.categories);
});

test("el guard solo acepta el API QA aprobado", () => {
  assert.equal(normalizeBaseUrl(DEFAULT_API_URL), DEFAULT_API_URL);
  assert.throws(() => normalizeBaseUrl("https://api.apexos.com"), /Solo se permite el API QA/);
  assert.throws(() => normalizeBaseUrl("http://apexos-api-qa-production.up.railway.app"), /exige HTTPS/);
});

test("el periodo cubre el mes completo de Bogota", () => {
  const result = monthWindow(new Date("2026-09-03T18:00:00Z"));
  assert.equal(result.today, "2026-09-03");
  assert.equal(result.start, "2026-09-01T00:00:00-05:00");
  assert.equal(result.end, "2026-09-30T23:59:59.999-05:00");
});
