const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "nyvora-users-roles-qa.js"),
  "utf8"
);

test("inactive users preserve the generic unauthorized login contract", () => {
  assert.match(
    source,
    /inactive_user_cannot_login[\s\S]*?,\s*401\s*\)/,
    "The production certificate must expect the generic 401 login response."
  );
});

test("Nyvora certification counts normalized emails without case sensitivity", () => {
  assert.match(source, /contains:\s*`nyvora\.qa\.`\s*,\s*mode:\s*"insensitive"/);
  assert.match(source, /contains:\s*RUN_ID\s*,\s*mode:\s*"insensitive"/);
});
