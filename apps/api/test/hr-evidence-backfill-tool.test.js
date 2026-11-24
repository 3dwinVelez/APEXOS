const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

// El guion de backfill escribe en Produccion, asi que lo que se prueba aqui no es la subida (esa
// exige nube y autorizacion del dueno) sino lo que impide escribir donde no se debe y lo que define
// la forma de la fila: si la sentencia SET asigna dos veces `metadata`, Postgres rechaza el UPDATE
// y la corrida se va por la rama de omision creyendo que purgo.
const tool = require("../../../scripts/hr-evidence-backfill-storage.js");
const SCRIPT = path.resolve(__dirname, "../../../scripts/hr-evidence-backfill-storage.js");

test("sin ambiente declarado no hay corrida, y el modo por defecto es dry", () => {
  assert.match(tool.resolveRuntime([]).problems.join(" "), /falta --env/);
  assert.match(tool.resolveRuntime(["--env", "produccion"]).problems.join(" "), /falta --env/);
  const qa = tool.resolveRuntime(["--env", "qa"]);
  assert.deepEqual(qa.problems, []);
  assert.equal(qa.mode, "dry", "el modo por defecto escribe: debe medir");
  assert.equal(tool.resolveRuntime(["--env", "qa", "--execute"]).mode, "execute");
});

test("--keep-inline solo existe sobre una escritura declarada", () => {
  assert.match(tool.resolveRuntime(["--env", "qa", "--keep-inline"]).problems.join(" "), /acompana a --execute/);
  assert.equal(tool.resolveRuntime(["--env", "qa", "--execute", "--keep-inline"]).keepInline, true);
});

test("el tenant y la rama se validan antes de leer configuracion", () => {
  assert.match(tool.resolveRuntime(["--env", "qa", "--tenant", "x'; drop"]).problems.join(" "), /--tenant/);
  assert.match(tool.resolveRuntime(["--env", "qa", "--only", "ambas"]).problems.join(" "), /--only/);
  assert.deepEqual(tool.resolveRuntime(["--env", "qa", "--tenant", "67a5dcb8-100b-4a44-b5db-d024f2e57450", "--only", "identity"]).problems, []);
});

// La guarda que mas vale: un archivo de ambiente que apunta a otro proyecto no puede arrastrar la
// corrida al proyecto equivocado. Se prueba con una fixture, no con el config real.
test("un ambiente con project ref ajeno aborta sin conectar", () => {
  const fixture = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "apexos-backfill-")), "ajeno.env");
  fs.writeFileSync(fixture, [
    "SUPABASE_URL=https://ajeno-ojos.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=clave-que-no-se-imprime",
    "DATABASE_URL=postgresql://postgres:cl@ajeno-ojos.supabase.co:5432/postgres"
  ].join("\n"));

  const resultado = tool.resolveRuntime(["--env", "prod", `--env-file=${fixture}`]);
  assert.match(resultado.problems.join(" "), /no apunta al project ref esperado/);
  assert.equal(resultado.databaseUrl, undefined, "devolvio credenciales de un proyecto no declarado");
  assert.match(tool.resolveRuntime(["--env", "qa", `--config=${fixture}`]).problems.join(" "), /no apunta al project ref esperado/);
});

test("el guion aborta por proceso con codigo 2 antes de tocar la red", () => {
  const ajeno = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "apexos-backfill-spawn-")), "ajeno.env");
  fs.writeFileSync(ajeno, ["SUPABASE_URL=https://otro-proyecto.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=clave-que-no-se-imprime",
    "DATABASE_URL=postgresql://postgres:cl@otro-proyecto.supabase.co:5432/postgres"].join("\n"));
  const corrida = spawnSync(process.execPath, [SCRIPT, "--env", "prod", `--config=${ajeno}`, "--execute"], { encoding: "utf8" });
  assert.equal(corrida.status, 2, `salio con ${corrida.status}: ${corrida.stderr}`);
  assert.match(corrida.stderr, /no apunta al project ref esperado/);
  assert.equal(corrida.stdout.includes("[backfill C.1]"), false, "anuncio la corrida sobre un proyecto no declarado");
});

// Cada rama declara UN destino por columna: `"metadata" = ...` dos veces es un error de Postgres,
// no un detalle de estilo, y la corrida lo contaria como fila omitida.
test("la sentencia SET asigna cada columna una sola vez", () => {
  for (const branch of tool.BRANCHES) {
    for (const keep of [false, true]) {
      const sets = branch.sets(keep);
      const asignaciones = [...sets.matchAll(/"([A-Za-z_]+)" =/g)].map((m) => m[1]);
      assert.equal(new Set(asignaciones).size, asignaciones.length, `${branch.kind} (keep=${keep}) repite columna en SET: ${asignaciones.join(", ")}`);
      assert.ok(asignaciones.includes("metadata"), `${branch.kind} no escribe la bandera de rescate en metadata`);
      assert.ok(sets.includes(`'{${branch.flagKey}}'`), `${branch.kind} no escribe la bandera ${branch.flagKey} que consulta el lector`);
      assert.match(sets, /\$4::jsonb/, `${branch.kind} no binda la bandera: texto suelto en SQL`);
    }
  }
  const extra = tool.BRANCHES.find((b) => b.kind === "extra");
  assert.match(extra.sets(false), /"extra_evidence" =/);
  assert.match(extra.sets(false), /- 'base64' - 'base64_data'/, "la purga deja una de las dos grafias del binario");
  assert.equal(/- 'base64'/.test(extra.sets(true)), false, "--keep-inline borro bytes: la fase intermedia no puede destruir");
});

// El lector canonico resuelve la fila por `storage_path`, y la escritura nueva escribe ambas grafias
// segun el cliente: el guion tiene que cubrir las dos o deja binario dentro de la fila "purgada".
test("la lectura puntual cubre las dos grafias del binario", () => {
  for (const branch of tool.BRANCHES) {
    assert.match(branch.single, /base64_data/, `${branch.kind} ignora la grafia base64_data`);
    assert.match(branch.single, /nullif\([^)]* ->> 'base64', ''\)/, `${branch.kind} ignora la grafia base64`);
    assert.match(branch.guard, /jsonb_typeof/ , `${branch.kind} escribiria sobre un json que no es objeto`);
  }
});
