'use strict';
// Prueba de los dos instrumentos que sujetan una promocion por hunks.
//
// El control de mutacion no es decorativo: la promocion a `develop` del 2026-11-24 publico
// seis lineas de mas en `service.js` y los tres agentes duenos reportaron verde. Estos casos
// exigen que el instrumento grite ante cada una de las tres derivas posibles, y que un rojo
// de compuerta no pueda publicarse como verde.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const CHECK = path.join(ROOT, "scripts", "certifications", "promotion-migration-check.js");
const GATES = path.join(ROOT, "scripts", "certifications", "promotion-gates-runner.js");

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: "utf8", windowsHide: true });
}

test("el control de mutacion del verificador de replay detecta las seis derivas", () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "apexos-replay-selftest-")), "control.json");
  const result = runNode(CHECK, ["--selftest", "--output", output]);
  assert.equal(result.status, 0, `el selftest debe terminar en verde: ${result.stdout}${result.stderr}`);
  const report = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(report.passed, true);
  assert.equal(report.replay_correcto.passed, true, "el replay exacto tiene que dar verde");
  assert.equal(report.controles_de_mutacion.length, 6, "se miden las seis derivas declaradas");
  for (const deriva of report.controles_de_mutacion) {
    assert.equal(deriva.passed, false, `la deriva ${deriva.name} tenia que quedar roja`);
  }
  const tipos = report.controles_de_mutacion.map((deriva) => deriva.results.filter((r) => !r.ok).map((r) => r.tipo).sort().join("+"));
  assert.ok(tipos.includes("edit"), "anadir lineas en un hunks debe romperse por la invariante edit");
  assert.ok(tipos.includes("carry"), "tocar un archivo llevado debe romperse por la invariante carry");
  assert.ok(tipos.includes("delete"), "revivir un borrado debe romperse por la invariante delete");
  assert.ok(tipos.includes("insert"), "borrar contenido del destino en una fusion a tres vias debe romperse por la invariante insert");
  const reemplazo = report.controles_de_mutacion.find((d) => d.name === "insert_reemplazo_no_declado");
  assert.ok(reemplazo && !reemplazo.passed, "la fusion con reemplazo no declarado tiene que quedar roja");
  fs.rmSync(path.dirname(output), { recursive: true, force: true });
});

test("el verificador se niega a pisar evidencia existente sin decirlo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-replay-guard-"));
  const output = path.join(dir, "evidencia.json");
  fs.writeFileSync(output, '{"passed":true}\n');
  const result = runNode(CHECK, ["--selftest", "--output", output]);
  assert.notEqual(result.status, 0, "un rojo no puede sobrescribir la corrida buena");
  assert.match(result.stderr + result.stdout, /pisa la corrida buena/);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), { passed: true }, "la evidencia anterior queda intacta");
  const revalida = runNode(CHECK, ["--selftest", "--output", output, "--allow-output-overwrite"]);
  assert.equal(revalida.status, 0, "revalidar a proposito si esta permitido");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("las compuertas se corren por codigo y un rojo no se publica como verde", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-gates-"));
  const salida = path.join(dir, "puertas.json");
  // Manifiesto inexistente: la puerta tiene que responder roja y el reporte tambien.
  const result = runNode(GATES, [
    "--candidate", "HEAD",
    "--target", "origin/develop",
    "--scope", "docs/qa/manifests/no-existe-20261124-scope.json",
    "--output", salida
  ]);
  assert.notEqual(result.status, 0, "una compuerta rota no puede devolver verde");
  const report = JSON.parse(fs.readFileSync(salida, "utf8"));
  assert.equal(report.passed, false);
  assert.equal(report.gates.length, 1);
  assert.notEqual(report.gates[0].exit_code, 0);
  assert.ok(report.gates[0].stdout.length + report.gates[0].stderr.length > 0, "la salida va verbatim al JSON");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("el analizador de banderas acepta las dos formas y no se traga la salida", () => {
  const { argsFrom } = require(GATES);
  assert.deepEqual(argsFrom(["--candidate=HEAD", "--target", "origin/develop", "--selftest"]), {
    candidate: "HEAD",
    target: "origin/develop",
    selftest: "1"
  });
  const { argsFrom: argsFromCheck } = require(CHECK);
  assert.equal(argsFromCheck(["--against", "commit", "--ref", "HEAD"]).ref, "HEAD");
  assert.equal(argsFromCheck(["--against=commit"]).against, "commit");
});
