const assert = require("node:assert/strict");
const test = require("node:test");

const { sameSecret } = require("../src/security/metricsAuth");

test("metrics secret comparison rejects missing and incorrect values", () => {
  assert.equal(sameSecret("", "configured"), false);
  assert.equal(sameSecret("incorrect", "configured"), false);
});

test("metrics secret comparison accepts the exact configured value", () => {
  assert.equal(sameSecret("dedicated-monitor-secret", "dedicated-monitor-secret"), true);
});
