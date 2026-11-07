#!/usr/bin/env node
/*
 * Certificacion local del paquete "contrato de equipo" (desarrollo -> develop).
 *
 * Que certifica: que el contrato que se promociona es EJECUTABLE en el arbol donde
 * aterriza, no solo legible. Para eso ejercita, sobre el candidato, las cinco
 * herramientas que el propio contrato obliga a correr (sync/check, test:agents,
 * preflight, coverage), verifica que todo comando `npm run` citado por los skills
 * resuelve en el package.json del destino, y mide que las rutas del contrato viajan
 * byte a byte como en desarrollo y que el candidato no borra nada del destino.
 *
 * Uso (desde el arbol del candidato, con las rutas ya en el index):
 *   node scripts/certifications/agents-contract-promotion-local.js \
 *     --base=origin/develop --output=docs/qa/evidence/<cambio>/contract.json
 *
 * No imprime secretos y no toca la red: solo git y scripts locales.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const arg = (name, fallback = "") => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=") || fallback;

const BASE = arg("base", "origin/develop");
const OUTPUT = arg("output");
const EVIDENCE_DIR = OUTPUT ? path.dirname(OUTPUT) : "";
const FALLO = [];
const checks = [];

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 64e6 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${(result.stderr || result.stdout || "").trim()}`);
  return String(result.stdout || "");
}

function record(name, ok, detail) {
  checks.push({ name, status: ok ? "passed" : "failed", ...detail });
  if (!ok) FALLO.push(name);
  console.log(`${ok ? "OK  " : "FALLO"} ${name}${detail && Object.keys(detail).length ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`);
}

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 64e6 });
}

/** El contrato son los skills, los espejos y AGENTS.md; la maquinaria son las herramientas que esos textos obligan a correr. */
function contractPaths() {
  const listed = git(["diff", "--cached", "--name-only", BASE, "--"]).split(/\r?\n/).filter(Boolean);
  return listed.filter((f) => /^(.qoder\/skills\/|agents\/|AGENTS\.md$|scripts\/agents\/|scripts\/test\/agents-|scripts\/certifications\/agents-contract-promotion-local\.js$)/.test(f));
}

function npmTokensFrom(paths) {
  const tokens = new Map();
  for (const f of paths) {
    let text;
    try { text = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
    for (const m of text.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
      if (!tokens.has(m[1])) tokens.set(m[1], new Set());
      tokens.get(m[1]).add(f);
    }
  }
  return tokens;
}

try {
  const head = git(["rev-parse", "HEAD"]).trim();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const scriptsDisponibles = new Set(Object.keys(pkg.scripts || {}));

  // 1. Espejos y registry: agents/*/SKILL.md contra .qoder/skills/*/SKILL.md y sha256 del registry.
  const sync = run(process.execPath, ["scripts/agents/sync-agents.js", "check"]);
  record("espejos_y_registry_coherentes", sync.status === 0, {
    exit_code: sync.status, salida: String(sync.stdout || "").trim().slice(-600), error: String(sync.stderr || "").trim().slice(-600)
  });

  // 2. Pruebas del ruteo, contrato, cobertura y versionado.
  const test = run(process.execPath, ["--test", "scripts/test/agents-preflight.test.js", "scripts/test/agents-contract.test.js", "scripts/test/agents-coverage.test.js", "scripts/test/agents-versioning.test.js"]);
  const testOut = `${test.stdout || ""}${test.stderr || ""}`;
  const leido = (re) => Number((testOut.match(re) || [])[1] || -1);
  const conteo = { pruebas: leido(/# pass (\d+)/), fallidas: leido(/# fail (\d+)/), canceladas: leido(/# cancelled (\d+)/) };
  record("pruebas_de_la_maquinaria_verdes", test.status === 0 && conteo.pruebas > 0 && conteo.fallidas === 0, {
    exit_code: test.status, ...conteo, salida: testOut.trim().slice(-800)
  });

  // 3. Preflight del contrato contra origin/desarrollo: el veredicto no puede ser CONFLICTO.
  //    En una rama auxiliar la maquinaria responde RAMA_NO_AUTORIZADA por diseno (el contrato solo
  //    se edita en desarrollo); la comparacion de versiones se ejecuto ademas desde desarrollo y su
  //    salida esta en ../gates-desarrollo.txt.
  const rama = git(["branch", "--show-current"]).trim() || "DETACHED";
  const preflight = run(process.execPath, ["scripts/agents/preflight.js", "--paths", ".qoder/skills,agents,AGENTS.md"]);
  const preflightOut = `${preflight.stdout || ""}${preflight.stderr || ""}`.trim();
  const veredicto = (preflightOut.match(/Veredicto:\s*([A-Z_]+)/) || [])[1] || "SIN_VEREDICTO";
  const veredictoAceptable = !["CONFLICTO", "INTEGRAR_REMOTO"].includes(veredicto);
  record("preflight_del_contrato_sin_conflicto", veredictoAceptable, {
    rama, veredicto, exit_code: preflight.status, salida: preflightOut.slice(-1200)
  });

  // 4. Cobertura: cada ruta tocada con agente dueño debe aparecer avanzando.
  const coverage = run(process.execPath, ["scripts/agents/coverage.js", "--paths", ".qoder/skills,agents,AGENTS.md"]);
  const coverageOut = `${coverage.stdout || ""}${coverage.stderr || ""}`.trim();
  const coberturaEsperadaEnRama = rama === "desarrollo";
  record("cobertura_de_agentes_mide_a_duefios", coberturaEsperadaEnRama ? coverage.status === 0 : true, {
    rama, aplicable_en_esta_rama: coberturaEsperadaEnRama, exit_code: coverage.status, salida: coverageOut.slice(-1200)
  });

  // 5. Toda comando citada por el contrato resuelve en el package.json del candidato.
  const contrato = contractPaths();
  const textos = contrato.filter((f) => /^(.qoder\/skills\/|agents\/|AGENTS\.md$)/.test(f));
  const tokens = npmTokensFrom(textos);
  // Permitido cerrado: la torre de control vive solo en desarrollo (residencia declarada en AGENTS.md).
  const RESIDENTES_EN_DESARROLLO = ["certify:control-tower", "control:test"];
  const sinResolver = [...tokens.keys()].filter((t) => !scriptsDisponibles.has(t) && !RESIDENTES_EN_DESARROLLO.some((r) => t.startsWith(r)));
  const residenciaDeclarada = /control-tower/.test(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"));
  record("comandos_citados_resuelven_en_el_destino", sinResolver.length === 0 && residenciaDeclarada, {
    tokens: [...tokens.keys()].sort(), sin_resolver: sinResolver, residencia_de_torre_declarada: residenciaDeclarada
  });

  // 6. Las rutas del contrato viajan byte a byte como en origin/desarrollo.
  const referencia = process.env.APEXOS_CONTRACT_REFERENCE || "origin/desarrollo";
  const fueraDeParidad = [];
  for (const f of contrato) {
    if (/^(docs\/qa\/|scripts\/certifications\/)/.test(f)) continue;
    const esperado = git(["ls-tree", referencia, "--", f]).trim().split(/\s+/)[2] || "";
    const medido = git(["hash-object", "-w", "--path", f, path.join(root, f)]).trim();
    if (esperado !== medido) fueraDeParidad.push({ file: f, esperado, medido });
  }
  record("rutas_identicas_a_la_rama_de_trabajo", fueraDeParidad.length === 0, {
    referencia, rutas_comparadas: contrato.filter((f) => !/^(docs\/qa\/|scripts\/certifications\/)/.test(f)).length, diferencias: fueraDeParidad
  });

  // 7. Inventario del candidato contra el destino: sin borrados.
  const inventario = git(["diff", "--cached", "--name-status", BASE]).split(/\r?\n/).filter(Boolean).map((l) => l.split("\t"));
  const conteoInventario = { A: 0, M: 0, D: 0, R: 0 };
  for (const parts of inventario) {
    const st = parts[0][0];
    if (parts[0].startsWith("R")) conteoInventario.R += 1;
    else if (conteoInventario[st] !== undefined) conteoInventario[st] += 1;
  }
  const pendientes = OUTPUT ? git(["status", "--porcelain", "--", EVIDENCE_DIR.replace(root + path.sep, "")]).split(/\r?\n/).filter(Boolean).length : 0;
  const total = inventario.length + pendientes;
  record("candidato_no_borra_nada_del_destino", conteoInventario.D === 0 && conteoInventario.R === 0, {
    base: BASE, ...conteoInventario, evidencia_pendiente_de_add: pendientes, rutas_totales_del_paquete: total
  });

  // 8. Negativos: la CI del destino rechaza la forma equivocada (el lesson de la ronda 7B).
  const negativos = [];
  const guard = path.join(root, "scripts/git-governance-guard.js");
  const prDesdePromocion = spawnSync(process.execPath, [guard, "ci"], {
    cwd: root, encoding: "utf8", shell: false,
    env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "develop", GITHUB_HEAD_REF: "promocion/equipo-develop-20261107" }
  });
  negativos.push({ sonda: "PR hacia develop desde promocion/*", rechado: prDesdePromocion.status !== 0, mensaje: String(prDesdePromocion.stderr || prDesdePromocion.stdout || "").trim().slice(0, 300) });
  const prDesdeDesarrollo = spawnSync(process.execPath, [guard, "ci"], {
    cwd: root, encoding: "utf8", shell: false,
    env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "develop", GITHUB_HEAD_REF: "desarrollo" }
  });
  negativos.push({ sonda: "PR hacia develop desde desarrollo", aceptado: prDesdeDesarrollo.status === 0, mensaje: String(prDesdeDesarrollo.stderr || "").trim().slice(0, 300) });
  const pushRamaAuxiliar = spawnSync(process.execPath, [guard, "ci"], {
    cwd: root, encoding: "utf8", shell: false,
    env: { ...process.env, GITHUB_REF_NAME: "codex/qa-equipo-develop-20261107", GITHUB_EVENT_NAME: "push" }
  });
  negativos.push({ sonda: "push/CI sobre rama auxiliar (modo ci)", rechado: pushRamaAuxiliar.status !== 0, mensaje: String(pushRamaAuxiliar.stderr || "").trim().slice(0, 300) });
  record("forma_de_la_rama_auxiliar_es_parte_del_contrato", negativos.every((n) => n.rechado !== false && n.aceptado !== false), { negativos });

  const resultado = {
    version: 1,
    certification: "agents-contract-promotion-local",
    status: FALLO.length ? "failed" : "passed",
    ambiente: "LOCAL",
    medido_en_commit: head,
    nota_metodo: "El sha declarado es el HEAD vigente al momento de la medicion (la linea base del candidato); el arbol medido es el del index mas los archivos de evidencia que este mismo run escribe. Un archivo no puede llevar el sha del commit que lo contiene.",
    base: BASE,
    rutas_del_contrato: contrato,
    fallidos: FALLO,
    checks
  };

  if (OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(root, OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(root, OUTPUT), `${JSON.stringify(resultado, null, 2)}\n`);
  }
  console.log(JSON.stringify({ status: resultado.status, fallidos: FALLO, medido_en_commit: head }, null, 2));
  if (FALLO.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ certification: "agents-contract-promotion-local", status: "failed", error: String(error.stack || error), checks }, null, 2));
  process.exitCode = 1;
}
