'use strict';
// Comprueba, por invariantes y no por narrativa, que un replay de promocion sigue siendo
// el replay que se certifico.
//
// Por que existe: el 2026-11-24 se promociono a `develop` un replay hecho archivo por
// archivo con Edit sobre hunks. La norma 5 y la norma 8 del brief exigian "solo las lineas
// declaradas, cero lineas anadidas en un replay por hunks". Nadie lo midio, y al ir a
// verificar el arbol publicado el hook de `service.js` traia lineas de mas. Los tres
// agentes duenos del frente reportaron verde sin haber medido el invariante. Un cambio
// escrito por un agente y no medido contra el destino es un cambio no certificado.
//
// Las cuatro invariantes, medida cada una contra el arbol del destino:
//   carry   el archivo viaja byte a byte desde la rama de origen   -> blob igual
//   delete  la ruta queda ausente en el destino                    -> blob inexistente
//   edit    un hunk solo quita las lineas declaradas               -> 0 anadidas y las
//                                                                   eliminadas coinciden
//   insert  un archivo que el destino tiene propio solo recibe lo
//           declarado (fusion a tres vias)                          -> 0 eliminadas y las
//                                                                   anadidas coinciden
//
// `insert` nace de la promocion del modulo de Talento Humano a `main` (2026-11-27): dos
// rutas del frente (apps/api/prisma/schema.prisma y apps/api/package.json) no pueden viajar
// como blob de origen porque el destino conserva modelos, comentarios y dependencias de
// otros modulos. Copiar el blob de desarrollo habria borrado ese contenido ajeno en
// silencio. La invariante exige que lo unico que cambia sea lo declarado, linea por linea:
// `add_lines` para el conjunto exacto o `added_exact` cuando el volumen hace inviable
// enumerarlo (el lockfile, por ejemplo). En ambas variantes, una sola linea eliminada rompe.
//
// Uso:
//   node scripts/certifications/promotion-migration-check.js --spec <spec.json> \
//     --against index|commit [--ref HEAD] --cwd <arbol> --output <evidence.json>
//   node scripts/certifications/promotion-migration-check.js --selftest --output <control.json>
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function argsFrom(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) out[body] = "1";
    else {
      out[body] = next;
      index += 1;
    }
  }
  return out;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function gitQuiet(args, cwd) {
  try {
    return git(args, cwd).trim() || null;
  } catch {
    return null;
  }
}

// Se compara por `ls-tree` y no por `rev-parse <ref>:<ruta>`: en esta estacion el segundo
// reescribe los separadores e inventa divergencias donde no las hay.
function blobAt(ref, file, cwd) {
  const line = gitQuiet(["ls-tree", ref, "--", file], cwd);
  if (!line) return null;
  const parts = line.split(/\s+/);
  return parts[2] || null;
}

function stagedBlobAt(file, cwd) {
  const line = gitQuiet(["ls-files", "-s", "--", file], cwd);
  if (!line) return null;
  return line.split(/\s+/)[1] || null;
}

// Diff del contenido que se va a publicar: contra el indice si aun no hay commit, contra
// el commit si ya existe. `numstat` da el numero; `-U0` da cuales.
function diffAgainstBase(baseRef, file, cwd, against, ref) {
  const scope = against === "index" ? ["diff", "--cached", "--no-color", "-U0", baseRef, "--", file] : ["diff", "--no-color", "-U0", `${baseRef}..${ref}`, "--", file];
  const output = gitQuiet(scope, cwd) || "";
  const statScope = against === "index" ? ["diff", "--cached", "--numstat", baseRef, "--", file] : ["diff", "--numstat", `${baseRef}..${ref}`, "--", file];
  const stat = (gitQuiet(statScope, cwd) || "").split(/\s+/);
  const removed = output.split(/\r?\n/).filter((line) => line.startsWith("-") && !line.startsWith("---")).map((line) => line.slice(1).trim());
  const added = output.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1).trim());
  return { additions: Number(stat[0] || 0), deletions: Number(stat[1] || 0), removed, added };
}

function currentBlob(file, cwd, against, ref) {
  return against === "index" ? stagedBlobAt(file, cwd) : blobAt(ref, file, cwd);
}

function checkSpec(spec, cwd, against, ref) {
  const results = [];
  for (const item of spec.carry || []) {
    const wanted = blobAt(item.from_ref || spec.origin_ref, item.file, cwd);
    const actual = currentBlob(item.file, cwd, against, ref);
    results.push({
      tipo: "carry",
      file: item.file,
      esperado: wanted,
      actual,
      ok: Boolean(wanted) && wanted === actual,
      detalle: wanted === actual ? "byte a byte con la rama de origen" : "el contenido publicado no es el de origen"
    });
  }
  for (const file of spec.delete || []) {
    const actual = currentBlob(file, cwd, against, ref);
    results.push({
      tipo: "delete",
      file,
      esperado: null,
      actual,
      ok: actual === null,
      detalle: actual === null ? "ausente en lo que se publica" : "la ruta sigue viva en lo que se publica"
    });
  }
  for (const item of spec.edit || []) {
    const change = diffAgainstBase(spec.base_ref, item.file, cwd, against, ref);
    const declared = (item.remove_lines || []).map((line) => String(line).trim());
    const quitadasReales = change.removed.filter((line) => line.length > 0);
    const faltan = declared.filter((line) => !quitadasReales.includes(line));
    const sobran = quitadasReales.filter((line) => !declared.includes(line));
    results.push({
      tipo: "edit",
      file: item.file,
      esperado: { anadidas: 0, eliminadas: declared.length },
      actual: { anadidas: change.additions, eliminadas: quitadasReales.length },
      lineas_sobran: sobran,
      lineas_faltan: faltan,
      ok: change.additions === 0 && sobran.length === 0 && faltan.length === 0,
      detalle:
        change.additions > 0
          ? `un replay por hunks anadio ${change.additions} lineas en ${item.file}`
          : sobran.length || faltan.length
            ? "las lineas quitadas no son las declaradas en el spec"
            : `replay exacto: 0 anadidas, ${quitadasReales.length} eliminadas declaradas`
    });
  }
  for (const item of spec.insert || []) {
    results.push(checkInsert(spec, item, cwd, against, ref));
  }
  return results;
}

// Fusion a tres vias: el destino conserva su contenido y solo recibe lo declarado.
function checkInsert(spec, item, cwd, against, ref) {
  const change = diffAgainstBase(spec.base_ref, item.file, cwd, against, ref);
  const anadidas = change.added.filter((line) => line.length > 0);
  const eliminadas = change.removed.filter((line) => line.length > 0);
  const declared = Array.isArray(item.add_lines) ? item.add_lines.map((line) => String(line).trim()) : null;
  const faltan = declared ? declared.filter((line) => !anadidas.includes(line)) : [];
  const sobran = declared ? anadidas.filter((line) => !declared.includes(line)) : [];
  const cuentaDeclarada = declared ? declared.length : item.added_exact;
  const cuentaCoincide = typeof cuentaDeclarada === "number" ? anadidas.length === cuentaDeclarada : anadidas.length > 0;
  const ok = eliminadas.length === 0 && faltan.length === 0 && sobran.length === 0 && cuentaCoincide && anadidas.length > 0;
  return {
    tipo: "insert",
    file: item.file,
    esperado: { anadidas: cuentaDeclarada ?? ">0", eliminadas: 0 },
    actual: { anadidas: anadidas.length, eliminadas: eliminadas.length },
    lineas_sobran: sobran,
    lineas_faltan: faltan,
    ok,
    detalle: ok
      ? `fusion exacta: ${anadidas.length} anadidas declaradas, 0 eliminadas (el contenido del destino queda intacto)`
      : eliminadas.length
        ? `la insercion borro ${eliminadas.length} lineas propias del destino en ${item.file}`
        : !cuentaCoincide
          ? `la insercion anadio ${anadidas.length} lineas, se declararon ${cuentaDeclarada}`
          : sobran.length || faltan.length
            ? "las lineas anadidas no son las declaradas en el spec"
            : `la ruta no recibio ninguna linea en ${item.file}`
  };
}

function summarize(label, results) {
  const rotos = results.filter((result) => !result.ok);
  return { label, passed: rotos.length === 0, total: results.length, rotos: rotos.length, results };
}

// Control de mutacion hermetico: un repositorio Git temporan con el arbol base, el replay
// correcto y tres derivas (anadir una linea, tocar un archivo llevado, revivir un borrado).
// Exige verde en el replay correcto y rojo en cada deriva: si el instrumento no puede
// fallar, no esta certificando nada.
function selftest() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-migration-check-"));
  const cwd = repo;
  const run = (args) => git(args, cwd);
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), content);
  };
  try {
    run(["init", "-q", "-b", "base"]);
    run(["config", "user.email", "cert@apex.local"]);
    run(["config", "user.name", "Certificacion"]);
    run(["config", "core.autocrlf", "false"]);
    write("src/rule.js", "const SELFIE = ['entrada', 'salida'];\nmodule.exports = { SELFIE };\n");
    write("src/gate.js", "module.exports = { strict: true };\n");
    write("src/service.js", "async function mark(input) {\n  input = strict(input);\n  return run(input);\n}\n");
    write("src/schema.txt", "model TimePunch {\n  id Int\n}\n\nmodel GastosMenores {\n  // nota del destino que desarrollo no tiene\n}\n");
    run(["add", "-A"]);
    run(["commit", "-qm", "destino antes de la promocion"]);

    run(["checkout", "-q", "-b", "work"]);
    write("src/rule.js", "const SELFIE = ['entrada', 'salida'];\nconst WEB_SELFIE = ['entrada', 'inicio_almuerzo', 'fin_almuerzo', 'salida'];\nmodule.exports = { SELFIE, WEB_SELFIE };\n");
    run(["rm", "-q", "src/gate.js"]);
    write("src/service.js", "async function mark(input) {\n  return run(input);\n}\n");
    write("src/schema.txt", "model TimePunch {\n  id Int\n}\n\n// maestro nuevo\nmodel HrShared {\n  id Int\n}\n\nmodel GastosMenores {\n  // nota del destino que desarrollo no tiene\n}\n");
    run(["add", "-A"]);
    run(["commit", "-qm", "replay exacto del hunks, del carry y de la fusion a tres vias"]);

    const spec = {
      base_ref: "base",
      origin_ref: "work",
      carry: [{ file: "src/rule.js" }],
      delete: ["src/gate.js"],
      edit: [{ file: "src/service.js", remove_lines: ["  input = strict(input);"] }],
      insert: [{ file: "src/schema.txt", add_lines: ["// maestro nuevo", "model HrShared {", "  id Int", "}"] }]
    };

    const bueno = summarize("replay correcto", checkSpec(spec, cwd, "commit", "work"));

    const derivas = [];
    const drift = (name, mutate, esperado) => {
      // La deriva se commitea en su propia rama: si se commitea sobre `work`, el replay
      // bueno queda contaminado y las siguientes derivas miden la deriva anterior.
      run(["checkout", "-q", "-b", "drift", "work"]);
      mutate();
      run(["add", "-A"]);
      run(["commit", "-qm", `deriva ${name}`]);
      const medida = summarize(name, checkSpec(spec, cwd, "commit", "drift"));
      derivas.push({ name, esperado, ...medida });
      run(["checkout", "-q", "work"]);
      run(["branch", "-D", "drift"]);
    };
    drift("anadir_linea_en_hunk", () => {
      write("src/service.js", "async function mark(input) {\n  return run(input) || extra(input);\n}\n");
    }, "roto por lineas anadidas");
    drift("tocar_archivo_llevado", () => {
      write("src/rule.js", "const SELFIE = ['entrada', 'salida'];\nmodule.exports = { SELFIE };\n");
    }, "roto porque el blob ya no es el de origen");
    drift("revivir_borrado", () => {
      write("src/gate.js", "module.exports = { strict: true };\n");
    }, "roto porque la ruta borrada vuelve a existir");
    drift("insert_borra_contenido_del_destino", () => {
      write("src/schema.txt", "model TimePunch {\n  id Int\n}\n\n// maestro nuevo\nmodel HrShared {\n  id Int\n}\n");
    }, "roto porque la insercion se llevo por delante el modelo propio del destino");
    drift("insert_linea_no_declada", () => {
      write("src/schema.txt", "model TimePunch {\n  id Int\n}\n\n// maestro nuevo\nmodel HrShared {\n  id Int\n  extra String\n}\n\nmodel GastosMenores {\n  // nota del destino que desarrollo no tiene\n}\n");
    }, "roto porque la insercion anade una linea que nadie declaro");

    const derivasRojas = derivas.filter((deriva) => !deriva.passed);
    return {
      instrumento: "promotion-migration-check selftest",
      ejecutado_en: new Date().toISOString(),
      passed: bueno.passed && derivasRojas.length === derivas.length,
      replay_correcto: bueno,
      controles_de_mutacion: derivas,
      conclusion:
        bueno.passed && derivasRojas.length === derivas.length
          ? "el instrumento detecta las cinco derivas que justifica su existencia"
          : "el instrumento puede quedar verde con el replay roto: no es evidencia de nada"
    };
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function main() {
  const opts = argsFrom(process.argv.slice(2));
  const cwd = path.resolve(opts.cwd || process.cwd());
  if (!opts.output) throw new Error("falta --output con la ruta de evidencia");
  const absoluteOutput = path.resolve(cwd, opts.output);
  if (!opts["allow-output-overwrite"] && fs.existsSync(absoluteOutput)) {
    throw new Error(
      `--output apunta a evidencia ya existente (${opts.output}); un rojo no pisa la corrida buena. Use una ruta nueva o --allow-output-overwrite`
    );
  }

  let report;
  if (opts.selftest) {
    report = selftest();
  } else {
    if (!opts.spec) throw new Error("falta --spec con el manifiesto del replay");
    const spec = JSON.parse(fs.readFileSync(path.resolve(cwd, opts.spec), "utf8"));
    const against = opts.against || "index";
    const ref = opts.ref || "HEAD";
    const results = checkSpec(spec, cwd, against, ref);
    const summary = summarize("invariantes del replay", results);
    report = {
      instrumento: "promotion-migration-check",
      ejecutado_en: new Date().toISOString(),
      cwd,
      spec: opts.spec,
      base_ref: spec.base_ref,
      origin_ref: spec.origin_ref,
      contra: against === "index" ? "indice del arbol candidato" : `commit ${ref}`,
      ...summary
    };
  }

  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`);
  if (opts.selftest) {
    console.log(`${report.passed ? "CONTROL DE MUTACION VALIDO" : "CONTROL DE MUTACION INVALIDO"}: ${report.controles_de_mutacion.length} derivas medidas en ${opts.output}`);
  } else {
    console.log(`${report.passed ? "INVARIANTES DE REPLAY VALIDAS" : "INVARIANTES DE REPLAY ROTAS"}: ${report.total - report.rotos}/${report.total} en ${opts.output}`);
    for (const result of report.results.filter((item) => !item.ok)) console.log(`  ROTO ${result.tipo} ${result.file}: ${result.detalle}`);
  }
  if (!report.passed) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`INVARIANTES DE REPLAY ROTAS: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = { argsFrom, blobAt, checkInsert, checkSpec, diffAgainstBase, main, selftest };
