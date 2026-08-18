const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.resolve(__dirname, "..", "src", "middleware", "rbac.js"), "utf8");

test("payroll is enabled by the active human-resources module aliases", () => {
  assert.match(source, /payroll:\s*\[[^\]]*"talento-humano"[^\]]*"talento_humano"[^\]]*"hr"/);
});
