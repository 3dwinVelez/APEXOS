const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.resolve(__dirname, "../scripts/certifications/nyvora-hr-monitor-dynamic.js"),
  "utf8"
);

test("the dynamic HR monitor certificate validates the summary contract", () => {
  assert.match(source, /event_count/);
  assert.match(source, /evidence_count/);
  assert.match(source, /after\?\.closed_count/);
  assert.doesNotMatch(source, /after\?\.closed\)/);
});
