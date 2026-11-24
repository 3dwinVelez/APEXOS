'use strict';
// Ejecuta las compuertas de promocion y versiona su salida VERBATIM.
//
// Nace del cierre del 2026-11-24: las dos compuertas de la pata a `develop` se reportaron
// en prosa ("scope valido 72 rutas", "pre-QA aprobada") sin captura. Cuando se fue a medir
// el arbol publicado, resulto que el replay habia anadido lineas de mas en un archivo
// compartido y esas afirmaciones no lo habian visto. Una promocion no puede certificar su
// propia puerta a mano: el numero tiene que salir del comando.
//
// Cada puerta se corre como proceso hijo y se guarda codigo de retorno, stdout y stderr.
// `passed` es verdadero solo si TODAS devolvieron 0. Un rojo no se disculpa: se versiona.
//
// Uso (desde el arbol del candidato):
//   node scripts/certifications/promotion-gates-runner.js \
//     --candidate HEAD --target origin/develop \
//     --scope docs/qa/manifests/<cambio>-scope.json \
//     [--preqa docs/qa/manifests/<cambio>-preqa.json] \
//     [--approval docs/qa/manifests/<cambio>-approval.json] \
//     [--aux-branch codex/qa-<cambio>-<fecha>] \
//     --output docs/qa/evidence/<cambio>/puertas-promocion.json
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// El analizador admite `--clave valor` y `--clave=valor`: la otra forma pisa la salida.
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

function rootFrom(cwd) {
  let current = cwd;
  for (;;) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

// La puerta es la que declara `package.json`, no una invocacion inventada aqui: se lee el
// script y se ejecuta su propio `node`, porque en Windows `npm.cmd` no arranca sin shell y
// un envoltorio inventado dejaria de ser la compuerta versionada.
function gateCommand(root, name, extraArgs) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const declared = (pkg.scripts || {})[name];
  if (!declared) throw new Error(`el script ${name} no existe en package.json`);
  const tokens = declared.trim().split(/\s+/);
  if (tokens[0] !== "node") throw new Error(`el script ${name} no invoca node directo: ${declared}`);
  return { command: process.execPath, args: [path.resolve(root, tokens[1]), ...extraArgs] };
}

function runGate(root, label, command, args) {
  const started = new Date().toISOString();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  const exit = result.error ? -1 : result.status;
  return {
    label,
    command: [path.basename(command), ...args].join(" "),
    started_at: started,
    exit_code: exit,
    passed: exit === 0,
    veredicto: (stdout + stderr).trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || "(sin salida)",
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    error: result.error ? String(result.error.message || result.error) : null
  };
}

function main() {
  const opts = argsFrom(process.argv.slice(2));
  const root = rootFrom(path.resolve(opts.cwd || process.cwd()));
  const candidate = opts.candidate || "HEAD";
  const target = opts.target;
  if (!target) throw new Error("falta --target (origin/develop u origin/main)");
  if (!opts.scope) throw new Error("falta --scope con el manifiesto de alcance");
  if (!opts.output) throw new Error("falta --output con la ruta de evidencia");

  const absoluteOutput = path.resolve(root, opts.output);
  if (!opts["allow-output-overwrite"] && fs.existsSync(absoluteOutput)) {
    throw new Error(
      `--output apunta a evidencia ya existente (${opts.output}); un rojo no puede pisar la corrida buena. ` +
        "Use una ruta nueva o --allow-output-overwrite si revalida a proposito"
    );
  }

  const gates = [];
  const scope = gateCommand(root, "qa:promotion:scope", [opts.scope, candidate, target]);
  gates.push(runGate(root, "qa:promotion:scope", scope.command, scope.args));
  if (opts.preqa) {
    const preqa = gateCommand(root, "qa:preqa:evidence", [opts.preqa]);
    gates.push(runGate(root, "qa:preqa:evidence", preqa.command, preqa.args));
  }
  if (opts.approval) {
    const approval = gateCommand(root, "qa:approval:evidence", [opts.approval]);
    gates.push(runGate(root, "qa:approval:evidence", approval.command, approval.args));
  }
  // El contrato de CI del destino se mide antes de empujar: un rojo de forma en GitHub ya es historia compartida.
  if (opts["aux-branch"]) {
    const destino = target.split("/").pop();
    if (destino === "develop") {
      gates.push(
        runGate(root, "git-governance-guard ci-promotion", process.execPath, [
          path.join(root, "scripts", "git-governance-guard.js"),
          "ci-promotion",
          candidate,
          target,
          "develop",
          opts["aux-branch"]
        ])
      );
    } else {
      gates.push({
        label: "git-governance-guard ci-promotion",
        command: "(omitido: main se empuja por ref, no por PR)",
        exit_code: 0,
        passed: true,
        veredicto: `no aplica para destino ${destino}; la CI de main corre en modo ci y solo admite desarrollo`
      });
    }
  }

  const report = {
    instrumento: "promotion-gates-runner",
    ejecutado_en: new Date().toISOString(),
    root,
    candidate,
    target,
    manifest_scope: opts.scope,
    manifest_preqa: opts.preqa || null,
    manifest_approval: opts.approval || null,
    aux_branch: opts["aux-branch"] || null,
    passed: gates.every((gate) => gate.passed),
    total_puertas: gates.length,
    puertas_verdes: gates.filter((gate) => gate.passed).length,
    gates
  };
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `${report.passed ? "PUERTAS DE PROMOCION VALIDAS" : "PUERTAS DE PROMOCION INVALIDAS"}: ${report.puertas_verdes}/${report.total_puertas} en ${opts.output}`
  );
  for (const gate of report.gates) console.log(`  ${gate.passed ? "OK  " : "ROTO"} ${gate.label}: ${gate.veredicto}`);
  if (!report.passed) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`PUERTAS DE PROMOCION INVALIDAS: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = { argsFrom, main, rootFrom, runGate };
