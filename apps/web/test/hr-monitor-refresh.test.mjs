import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("la marcacion movil emite refresh inmediato para monitores abiertos", () => {
  const source = read("app/dashboard/talento-humano/marcacion/page.tsx");
  assert.match(source, /publishHrMonitorRefresh\(\{ source: "mobile-punch"/);
  assert.match(source, /publishHrMonitorRefresh\(\{ source: "mobile-activity"/);
});

test("el monitor de horarios escucha refresh local y no espera 30 segundos", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(source, /subscribeHrMonitorRefresh/);
  assert.match(source, /window\.setInterval\(refreshVisible, 10000\)/);
});
