const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "nodemon.json"), "utf8"));

test("guardar scripts o pruebas no reinicia el API en desarrollo", () => {
  for (const pattern of ["scripts/**", "test/**"]) {
    assert.ok(config.ignore.includes(pattern), `nodemon debe ignorar ${pattern}`);
  }
});

test("el codigo del API sigue vigilado", () => {
  assert.ok(!config.ignore.some((pattern) => /server\.js|src\//.test(pattern)));
});
