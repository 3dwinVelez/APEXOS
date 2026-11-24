const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function fail(message) {
  throw new Error(message);
}

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

function matchesAllowed(file, allowedPaths) {
  return allowedPaths.some((allowed) => allowed.endsWith("/") ? file.startsWith(allowed) : file === allowed);
}

function changedFiles(base, candidate) {
  const output = git(["diff", "--name-status", `${base}..${candidate}`]);
  if (!output) return [];
  return output.split(/\r?\n/).flatMap((line) => {
    const parts = line.split("\t");
    const status = parts[0];
    if (status.startsWith("R")) return [{ status: "D", file: parts[1] }, { status: "A", file: parts[2] }];
    return [{ status, file: parts[parts.length - 1] }];
  });
}

function normalizedChange(change) {
  return `${change.status}:${change.file}`;
}

function validateExpectedChanges(manifest, changes) {
  if (manifest.scope_schema_version !== 2) return;
  if (!manifest.change_intent || typeof manifest.change_intent.summary !== "string" || !manifest.change_intent.summary.trim()) {
    fail("scope_schema_version 2 requiere change_intent.summary");
  }
  if (!Array.isArray(manifest.change_intent.modules) || !manifest.change_intent.modules.length) {
    fail("scope_schema_version 2 requiere change_intent.modules");
  }
  if (!Array.isArray(manifest.expected_changes) || !manifest.expected_changes.length) {
    fail("scope_schema_version 2 requiere expected_changes");
  }
  const expected = manifest.expected_changes.map((change) => {
    if (!change || !["A", "M", "D"].includes(change.status) || typeof change.file !== "string" || !change.file.trim()) {
      fail("expected_changes solo admite entradas exactas { status: A|M|D, file }");
    }
    return normalizedChange(change);
  }).sort();
  if (new Set(expected).size !== expected.length) fail("expected_changes contiene entradas duplicadas");
  const actual = changes.map(normalizedChange).sort();
  if (expected.length !== actual.length || expected.some((entry, index) => entry !== actual[index])) {
    const missing = expected.filter((entry) => !actual.includes(entry));
    const extra = actual.filter((entry) => !expected.includes(entry));
    fail(`diff distinto al inventario exacto; faltan [${missing.join(", ")}], sobran [${extra.join(", ")}]`);
  }
}

function validateManifest(manifest, manifestDir, changes) {
  if (!manifest.change_id || (!manifest.base_commit && !manifest.base_commits) || !manifest.certified_commit) fail("faltan change_id, base_commit/base_commits o certified_commit");
  if (!Array.isArray(manifest.allowed_paths) || !manifest.allowed_paths.length) fail("allowed_paths debe declarar rutas puntuales");
  if (!Array.isArray(manifest.allowed_deletions)) fail("allowed_deletions debe existir, incluso cuando este vacio");
  const unexpected = changes.filter(({ file }) => !matchesAllowed(file, manifest.allowed_paths));
  if (unexpected.length) fail(`rutas fuera de alcance: ${unexpected.map(({ status, file }) => `${status}:${file}`).join(", ")}`);
  const forbiddenDeletes = changes.filter(({ status, file }) => status.startsWith("D") && !manifest.allowed_deletions.includes(file));
  if (forbiddenDeletes.length) fail(`eliminaciones no autorizadas: ${forbiddenDeletes.map(({ file }) => file).join(", ")}`);
  validateExpectedChanges(manifest, changes);
  if (!Array.isArray(manifest.protected_capabilities) || !manifest.protected_capabilities.length) fail("protected_capabilities es obligatorio");
  for (const capability of manifest.protected_capabilities) {
    if (!capability.name || capability.status !== "passed") fail("toda capacidad protegida debe estar identificada y aprobada");
    if (!Array.isArray(capability.evidence) || !capability.evidence.length) fail(`la capacidad ${capability.name} no tiene evidencia`);
    for (const evidence of capability.evidence) {
      if (!fs.existsSync(path.resolve(manifestDir, evidence))) fail(`no existe evidencia para ${capability.name}: ${evidence}`);
    }
  }
}

const ORIGIN_BASELINE = "origin/desarrollo";
const REPLAY_TRANSPORT = "replay_puntual";

function gitQuiet(args, options = {}) {
  try {
    return git(args, options) || null;
  } catch {
    return null;
  }
}

function readBlobAt(ref, file, options) {
  return gitQuiet(["rev-parse", "--verify", "--quiet", `${ref}:${file}`], options);
}

function readRefAt(ref, options) {
  return gitQuiet(["rev-parse", "--verify", "--quiet", ref], options);
}

// Unica fuente del camino promocional: desarrollo -> develop -> main. Cada ruta del diff
// se compara contra el blob que esa ruta tiene en `origin/desarrollo`, que es donde el
// cambio se escribio, se probo y se certifico.
//
// Nacio de la caida de produccion del 23-11: `webPunchSelfie.js` se escribio directo en
// `develop` el 20-11 sin pasar nunca por `desarrollo` y se fundo en `main` sin que nadie
// lo viera ahi. El porton por rutas no la detecto porque la ruta si estaba declarada en el
// manifiesto; lo que faltaba exigir era el ORIGEN del contenido, no la ruta.
function findUnoriginatedChanges(changes, { candidateRef, baselineRef = ORIGIN_BASELINE, cwd } = {}) {
  const options = cwd ? { cwd } : {};
  if (!readRefAt(baselineRef, options)) {
    fail(`no se puede verificar el origen: no existe ${baselineRef}. Ejecute git fetch origin desarrollo y vuelva a intentar`);
  }
  if (!readRefAt(candidateRef, options)) fail(`no se puede verificar el origen: no existe ${candidateRef}`);
  return changes.filter((change) => readBlobAt(candidateRef, change.file, options) !== readBlobAt(baselineRef, change.file, options));
}

function validateOriginUniqueness(manifest, changes, origin = {}) {
  const waivers = new Map();
  for (const waiver of manifest.origin_waivers || []) {
    if (!waiver || typeof waiver.file !== "string" || !waiver.file.trim()) fail("origin_waivers exige entradas con file");
    if (!String(waiver.reason || "").trim() || !String(waiver.approval || "").trim()) {
      fail(`la excepcion de origen de ${waiver.file} debe declarar reason y approval nominales`);
    }
    if (waivers.has(waiver.file)) fail(`origin_waivers duplica la excepcion de ${waiver.file}`);
    waivers.set(waiver.file, waiver);
  }
  const unattributed = findUnoriginatedChanges(changes, origin).filter((change) => !waivers.has(change.file));
  if (!unattributed.length) return;
  const detail = unattributed.map(({ status, file }) => `${status}:${file}`).join(", ");
  fail(`contenido sin origen en desarrollo, no se promociona: [${detail}]. Solo sube lo escrito y certificado en desarrollo; una divergencia real exige un origin_waivers con reason y approval`);
}

// Transporte puntual (replay) sobre un destino que esta cientos de commits atras. Aqui lo
// que sube NO desciende del binario que se certifico: se reconstruye sobre el arbol del
// destino, asi que la prueba de ascendencia no puede darse y el candado cambia de prueba,
// no se afloja. Exige las cuatro cosas a la vez:
//   1) que el commit certificado viva en origin/desarrollo, la rama donde nace todo;
//   2) que cada ruta del diff sea, blob por blob, la que esa ruta tiene en origin/desarrollo
//      (sube el contenido que se probo, no una reconstruccion parecida);
//   3) que no se declare ninguna excepcion de origen: sin ascendencia, no hay nada perdonable;
//   4) que la base declarada del delta sea el punto real de divergencia entre el destino y el
//      commit certificado, para que "el delta es solo la promesa" no se invente despues.
function validateReplayTransport(manifest, changes, { candidate, target, baselineRef = ORIGIN_BASELINE, cwd } = {}) {
  const options = cwd ? { cwd } : {};
  if (!manifest.certified_commit) fail(`el transporte puntual exige certified_commit: es el commit que se certifico en ${baselineRef}`);
  const certified = git(["rev-parse", manifest.certified_commit], options);
  try {
    git(["merge-base", "--is-ancestor", certified, baselineRef], options);
  } catch {
    fail(`el commit certificado ${manifest.certified_commit} no esta en ${baselineRef}: el transporte puntual solo lleva contenido nacido y certificado en desarrollo`);
  }
  if (Array.isArray(manifest.origin_waivers) && manifest.origin_waivers.length) {
    fail("el transporte puntual no admite origin_waivers: sin ascendencia que respalde el replay, cada ruta tiene que ser el blob de origen");
  }
  const unoriginated = findUnoriginatedChanges(changes, { candidateRef: candidate, baselineRef, cwd });
  if (unoriginated.length) {
    fail(`el transporte puntual promete rutas que no son el blob de ${baselineRef}: [${unoriginated.map(({ status, file }) => `${status}:${file}`).join(", ")}]`);
  }
  if (!manifest.replay_baseline) fail("el transporte puntual exige replay_baseline: el antepasado comun contra el que se midio el delta");
  const declared = readRefAt(manifest.replay_baseline, options);
  if (!declared) fail(`no se puede verificar replay_baseline: no existe ${manifest.replay_baseline}`);
  const divergenceBase = git(["merge-base", target, certified], options);
  if (declared !== divergenceBase) {
    fail(`replay_baseline declarado (${declared}) distinto del punto real de divergencia entre el destino y el commit certificado (${divergenceBase})`);
  }
}

function validateCertifiedTransport(manifest, changes, refs = {}) {
  if (manifest.transport === REPLAY_TRANSPORT) return validateReplayTransport(manifest, changes, refs);
  const options = refs.cwd ? { cwd: refs.cwd } : {};
  const certified = git(["rev-parse", manifest.certified_commit], options);
  let contained = true;
  try { git(["merge-base", "--is-ancestor", certified, refs.candidate], options); } catch { contained = false; }
  if (contained) return;
  try {
    git(["merge-base", "--is-ancestor", certified, refs.target], options);
  } catch {
    fail("ni el candidato ni el destino contienen el commit funcional certificado; un transporte puntual se declara con transport: replay_puntual");
  }
}

function main() {
  const manifestPath = process.argv[2];
  const candidateRef = process.argv[3] || "HEAD";
  const targetRef = process.argv[4] || "origin/main";
  if (!manifestPath) fail("uso: npm run qa:promotion:scope -- <manifiesto> <candidato> <destino>");

  const absoluteManifest = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
  const candidate = git(["rev-parse", candidateRef]);
  const target = git(["rev-parse", targetRef]);
  const targetName = targetRef.split("/").pop();
  const declaredBase = manifest.base_commits?.[targetName] || manifest.base_commit;
  if (!declaredBase) fail(`el manifiesto no declara baseline para ${targetName}`);
  if (target !== git(["rev-parse", declaredBase])) fail(`el destino ${targetRef} cambio desde el baseline aprobado`);
  const commonBase = git(["merge-base", target, candidate]);
  if (!commonBase) fail("el candidato y el destino no comparten un historial controlado");
  const changes = changedFiles(target, candidate);
  validateCertifiedTransport(manifest, changes, { candidate, target });
  validateManifest(manifest, path.dirname(absoluteManifest), changes);
  validateOriginUniqueness(manifest, changes, { candidateRef: candidate });
  console.log(`ALCANCE DE PROMOCION VALIDO: ${manifest.change_id} (${changes.length} rutas, transporte ${manifest.transport === REPLAY_TRANSPORT ? "puntual: cada blob verificado contra " + ORIGIN_BASELINE : "por ascendencia del commit certificado"}, origen verificado contra ${ORIGIN_BASELINE})`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`ALCANCE DE PROMOCION INVALIDO: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = {
  REPLAY_TRANSPORT,
  changedFiles,
  findUnoriginatedChanges,
  matchesAllowed,
  readBlobAt,
  readRefAt,
  validateCertifiedTransport,
  validateExpectedChanges,
  validateManifest,
  validateOriginUniqueness,
  validateReplayTransport
};
