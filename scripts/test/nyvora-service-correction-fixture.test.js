const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../certifications/fixtures/nyvora-service-correction.js"), "utf8");

test("el fixture Nyvora exige confirmacion explicita y no imprime claves", () => {
  assert.match(source, /CONFIRM_NYVORA_FIXTURE/);
  assert.match(source, /crypto\.randomBytes/);
  assert.doesNotMatch(source, /console\.log/);
  assert.doesNotMatch(source, /temporary_password/);
});

test("el fixture crea perfiles visibles con permisos separados", () => {
  assert.match(source, /NYVORA QA Correcciones Autorizado/);
  assert.match(source, /NYVORA QA Correcciones Limitado/);
  assert.match(source, /NYVORA QA Aislamiento Autorizado/);
  assert.match(source, /services\.orders", "edit_any_state/);
  assert.match(source, /NYV-QA-EVIDENCE/);
});
