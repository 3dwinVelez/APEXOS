const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  REPLAY_TRANSPORT,
  findUnoriginatedChanges,
  matchesAllowed,
  readBlobAt,
  readRefAt,
  validateCertifiedTransport,
  validateManifest,
  validateOriginUniqueness,
  validateReplayTransport
} = require("../validate-promotion-scope");

test("solo acepta rutas exactas o prefijos declarados", () => {
  assert.equal(matchesAllowed("apps/web/lib/api.ts", ["apps/web/lib/api.ts"]), true);
  assert.equal(matchesAllowed("docs/qa/evidence/run/result.json", ["docs/qa/evidence/run/"]), true);
  assert.equal(matchesAllowed("apps/api/server.js", ["apps/web/"]), false);
});

test("rechaza cambios laterales y eliminaciones implicitas", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-promotion-scope-"));
  fs.writeFileSync(path.join(directory, "evidence.json"), "{}");
  const manifest = {
    change_id: "scope-test",
    base_commit: "base",
    certified_commit: "certified",
    allowed_paths: ["apps/web/lib/api.ts"],
    allowed_deletions: [],
    protected_capabilities: [{ name: "services", status: "passed", evidence: ["evidence.json"] }]
  };
  assert.throws(() => validateManifest(manifest, directory, [{ status: "M", file: "apps/api/server.js" }]));
  assert.throws(() => validateManifest(manifest, directory, [{ status: "D", file: "apps/web/lib/api.ts" }]));
  fs.unlinkSync(path.join(directory, "evidence.json"));
  fs.rmdirSync(directory);
});

test("el esquema v2 exige el inventario exacto incluso dentro de un prefijo permitido", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-promotion-scope-v2-"));
  fs.writeFileSync(path.join(directory, "evidence.json"), "{}");
  const manifest = {
    scope_schema_version: 2,
    change_id: "scope-v2-test",
    change_intent: { summary: "Ajustar exclusivamente servicios", modules: ["services"] },
    base_commit: "base",
    certified_commit: "certified",
    allowed_paths: ["apps/web/"],
    allowed_deletions: [],
    expected_changes: [{ status: "M", file: "apps/web/lib/api.ts" }],
    protected_capabilities: [{ name: "services", status: "passed", evidence: ["evidence.json"] }]
  };
  assert.doesNotThrow(() => validateManifest(manifest, directory, [{ status: "M", file: "apps/web/lib/api.ts" }]));
  assert.throws(
    () => validateManifest(manifest, directory, [
      { status: "M", file: "apps/web/lib/api.ts" },
      { status: "M", file: "apps/web/app/dashboard/talento-humano/page.tsx" }
    ]),
    /diff distinto al inventario exacto/
  );
  fs.unlinkSync(path.join(directory, "evidence.json"));
  fs.rmdirSync(directory);
});

test("el esquema v2 rechaza una intencion o un inventario incompletos", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-promotion-scope-v2-invalid-"));
  fs.writeFileSync(path.join(directory, "evidence.json"), "{}");
  const manifest = {
    scope_schema_version: 2,
    change_id: "scope-v2-invalid",
    base_commit: "base",
    certified_commit: "certified",
    allowed_paths: ["docs/"],
    allowed_deletions: [],
    protected_capabilities: [{ name: "documentation", status: "passed", evidence: ["evidence.json"] }]
  };
  assert.throws(() => validateManifest(manifest, directory, [{ status: "M", file: "docs/policy.md" }]), /change_intent.summary/);
  fs.unlinkSync(path.join(directory, "evidence.json"));
  fs.rmdirSync(directory);
});

// Repositorio en miniatura que reproduce el accidente: una ruta nace en la rama que se
// promociona sin haber existido jamas en desarrollo. Se usa git real, no un diccionario
// simulado, porque lo que hay que probar es la plomeria de `rev-parse --verify --quiet`.
function twoBranchRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-origin-repo-"));
  const gitHere = (args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" });
  const write = (file, content) => fs.writeFileSync(path.join(directory, file), content);
  const commit = (message) => {
    gitHere(["add", "-A"]);
    gitHere(["commit", "-q", "-m", message]);
  };
  gitHere(["init", "-q", "--initial-branch=desarrollo"]);
  gitHere(["config", "user.email", "porton@apex.local"]);
  gitHere(["config", "user.name", "Porton de origen"]);
  gitHere(["config", "commit.gpgsign", "false"]);
  write("compartido.js", "const version = 2;\n");
  write("divergente.js", "const version = 1;\n");
  commit("desarrollo certifico su version");
  gitHere(["checkout", "-q", "-b", "origin_promocion"]);
  write("divergente.js", "const version = 999;\n");
  write("rogue.js", "const nacido = 'en develop';\n");
  commit("la rama promocionada escribe contenido aparte");
  return directory;
}

const CHANGES = [
  { status: "M", file: "compartido.js" },
  { status: "M", file: "divergente.js" },
  { status: "A", file: "rogue.js" }
];

test("el porton exige que cada ruta promocionada exista igual en desarrollo", () => {
  const directory = twoBranchRepository();
  try {
    const unoriginated = findUnoriginatedChanges(CHANGES, { candidateRef: "origin_promocion", baselineRef: "desarrollo", cwd: directory });
    assert.deepEqual(unoriginated.map(({ file }) => file).sort(), ["divergente.js", "rogue.js"]);
    assert.throws(
      () => validateOriginUniqueness({ origin_waivers: [] }, CHANGES, { candidateRef: "origin_promocion", baselineRef: "desarrollo", cwd: directory }),
      /contenido sin origen en desarrollo.*rogue\.js/s
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("la excepcion de origen solo vale con motivo y autorizacion nominales", () => {
  const directory = twoBranchRepository();
  const origin = { candidateRef: "origin_promocion", baselineRef: "desarrollo", cwd: directory };
  try {
    assert.throws(
      () => validateOriginUniqueness({ origin_waivers: [{ file: "rogue.js", reason: "nacio en develop" }] }, CHANGES, origin),
      /reason y approval/
    );
    assert.throws(
      () => validateOriginUniqueness({ origin_waivers: [{ file: "rogue.js", reason: "  ", approval: "ok" }] }, CHANGES, origin),
      /reason y approval/
    );
    const manifest = {
      origin_waivers: [
        { file: "divergente.js", reason: "contabilidad de release propia de main", approval: "dueno 2026-11-24" },
        { file: "rogue.js", reason: "retiro de una compuerta alterna certificada en desarrollo", approval: "dueno 2026-11-24" }
      ]
    };
    assert.doesNotThrow(() => validateOriginUniqueness(manifest, CHANGES, origin));
    assert.throws(
      () => validateOriginUniqueness({ origin_waivers: [{ file: "rogue.js", reason: "x", approval: "y" }] }, CHANGES, origin),
      /divergente\.js/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("el porton se niega a opinar si no puede ver la referencia de origen", () => {
  const directory = twoBranchRepository();
  try {
    assert.throws(
      () => findUnoriginatedChanges(CHANGES, { candidateRef: "origin_promocion", baselineRef: "desarrollo-inauditable", cwd: directory }),
      /no se puede verificar el origen/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("la plomeria de blob distingue la ruta ausente de la ruta distinta", () => {
  // Control de la herramienta misma: si leer un blob ausente devolviera el mismo valor
  // que leer un blob distinto, el porton se volveria verde en falso para todo lo nuevo.
  const directory = twoBranchRepository();
  try {
    const presente = readBlobAt("origin_promocion", "compartido.js", { cwd: directory });
    assert.match(presente, /^[0-9a-f]{40}$/);
    assert.equal(readBlobAt("desarrollo", "compartido.js", { cwd: directory }), presente);
    assert.equal(readBlobAt("desarrollo", "rogue.js", { cwd: directory }), null);
    assert.notEqual(readBlobAt("origin_promocion", "divergente.js", { cwd: directory }), readBlobAt("desarrollo", "divergente.js", { cwd: directory }));
    assert.equal(readRefAt("desarrollo-inexistente", { cwd: directory }), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

// Reproduccion en miniatura del caso real del 2026-11-24: main esta atras de desarrollo y
// el fix se lleva arriba por replay, asi que el commit certificado NO es ancestro del
// candidato. El modo ascendencia lo bloquea (y asi nacio el bloqueo que el dueno resolvio
// enderezando el candado); el modo replay exige, en lugar de ascendencia, que cada ruta sea
// el blob de desarrollo, que el certificado viva en desarrollo y que la base del delta sea
// el punto real de divergencia. Cada control de esta seccion tiene que poder fallar.
function replayRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-replay-repo-"));
  const gitHere = (args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  const write = (file, content) => fs.writeFileSync(path.join(directory, file), content);
  const commit = (message) => {
    gitHere(["add", "-A"]);
    gitHere(["commit", "-q", "-m", message]);
  };
  gitHere(["init", "-q", "--initial-branch=desarrollo"]);
  gitHere(["config", "user.email", "porton@apex.local"]);
  gitHere(["config", "user.name", "Porton de replay"]);
  gitHere(["config", "commit.gpgsign", "false"]);
  write("producto.js", "const viejo = 1;\n");
  write("compartido.js", "const compartido = 1;\n");
  commit("base comun de desarrollo y main");
  const BASE = gitHere(["rev-parse", "HEAD"]);
  write("producto.js", "const fix = 1;\n");
  commit("desarrollo escribe y certifica el fix");
  const CERT = gitHere(["rev-parse", "HEAD"]);
  gitHere(["checkout", "-q", "-b", "main", BASE]);
  write("propio-de-main.js", "const contabilidad = 'release que solo existe en main';\n");
  commit("main avanza por su lado");
  const MAIN = gitHere(["rev-parse", "HEAD"]);
  gitHere(["checkout", "-q", "-b", "candidato", "main"]);
  write("producto.js", "const fix = 1;\n");
  commit("replay del fix sobre el arbol de main");
  const CANDIDATO = gitHere(["rev-parse", "HEAD"]);
  gitHere(["checkout", "-q", "-b", "candidato_adulterado", "candidato"]);
  write("producto.js", "const fix = 1; // reescrito en el candidato\n");
  commit("el candidato reescribe el fix sin que exista ese blob en desarrollo");
  const ADULTERADO = gitHere(["rev-parse", "HEAD"]);
  gitHere(["checkout", "-q", "desarrollo"]);
  const changes = (from, to) => gitHere(["diff", "--name-status", `${from}..${to}`])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      return { status: parts[0], file: parts[parts.length - 1] };
    });
  return { directory, BASE, CERT, MAIN, CANDIDATO, ADULTERADO, changes };
}

// Sin valores por defecto: un placeholder que se cuela en el manifiesto taparia el control
// de la base ausente (así lo demostró la primera corrida de esta suite).
const replayManifest = ({ certified_commit, replay_baseline, origin_waivers = [] }) => ({
  transport: REPLAY_TRANSPORT,
  certified_commit,
  ...(replay_baseline === undefined ? {} : { replay_baseline }),
  origin_waivers
});

test("el modo ascendencia bloquea un replay: el commit certificado no esta en la linea que sube", () => {
  const repo = replayRepository();
  const changes = repo.changes(repo.MAIN, repo.CANDIDATO);
  try {
    assert.deepEqual(changes.map(({ file }) => file), ["producto.js"]);
    assert.throws(
      () => validateCertifiedTransport({ certified_commit: repo.CERT }, changes, {
        candidate: repo.CANDIDATO, target: repo.MAIN, cwd: repo.directory
      }),
      /ni el candidato ni el destino contienen el commit funcional certificado/
    );
    // Control positivo del mismo modo: cuando si hay ascendencia, no se interpone.
    assert.doesNotThrow(() => validateCertifiedTransport({ certified_commit: repo.CERT }, changes, {
      candidate: repo.CERT, target: repo.MAIN, cwd: repo.directory
    }));
  } finally {
    fs.rmSync(repo.directory, { recursive: true, force: true });
  }
});

test("el transporte puntual pasa con el blob de desarrollo, el certificado en desarrollo y la base real", () => {
  const repo = replayRepository();
  const changes = repo.changes(repo.MAIN, repo.CANDIDATO);
  try {
    const manifest = replayManifest({ certified_commit: repo.CERT, replay_baseline: repo.BASE });
    assert.doesNotThrow(() => validateReplayTransport(manifest, changes, {
      candidate: repo.CANDIDATO, target: repo.MAIN, baselineRef: "desarrollo", cwd: repo.directory
    }));
    // Y el dispatch por la clave del manifiesto: con transport puesto, el mismo candidato
    // que el modo ascendencia rechazaba arriba se acepta aqui. Sin esa linea el modo nuevo
    // seria decorativo: nunca lo invocaria nadie.
    assert.doesNotThrow(() => validateCertifiedTransport(manifest, changes, {
      candidate: repo.CANDIDATO, target: repo.MAIN, cwd: repo.directory, baselineRef: "desarrollo"
    }));
  } finally {
    fs.rmSync(repo.directory, { recursive: true, force: true });
  }
});

test("el transporte puntual rechaza un blob reescrito en el candidato", () => {
  const repo = replayRepository();
  const changes = repo.changes(repo.MAIN, repo.ADULTERADO);
  try {
    assert.throws(
      () => validateReplayTransport(
        replayManifest({ certified_commit: repo.CERT, replay_baseline: repo.BASE }),
        changes,
        { candidate: repo.ADULTERADO, target: repo.MAIN, baselineRef: "desarrollo", cwd: repo.directory }
      ),
      /rutas que no son el blob de desarrollo: \[M:producto\.js\]/
    );
  } finally {
    fs.rmSync(repo.directory, { recursive: true, force: true });
  }
});

test("el transporte puntual rechaza un commit certificado nacido fuera de desarrollo", () => {
  const repo = replayRepository();
  const changes = repo.changes(repo.MAIN, repo.CANDIDATO);
  try {
    assert.throws(
      () => validateReplayTransport(
        replayManifest({ certified_commit: repo.MAIN, replay_baseline: repo.BASE }),
        changes,
        { candidate: repo.CANDIDATO, target: repo.MAIN, baselineRef: "desarrollo", cwd: repo.directory }
      ),
      /no esta en desarrollo/
    );
    assert.throws(
      () => validateReplayTransport({ transport: REPLAY_TRANSPORT }, changes, {
        candidate: repo.CANDIDATO, target: repo.MAIN, baselineRef: "desarrollo", cwd: repo.directory
      }),
      /exige certified_commit/
    );
  } finally {
    fs.rmSync(repo.directory, { recursive: true, force: true });
  }
});

test("el transporte puntual no admite excepciones de origen ni una base de delta inventada", () => {
  const repo = replayRepository();
  const changes = repo.changes(repo.MAIN, repo.CANDIDATO);
  const refs = { candidate: repo.CANDIDATO, target: repo.MAIN, baselineRef: "desarrollo", cwd: repo.directory };
  try {
    assert.throws(
      () => validateReplayTransport(
        replayManifest({ certified_commit: repo.CERT, replay_baseline: repo.BASE, origin_waivers: [{ file: "producto.js", reason: "conveniencia", approval: "nadie" }] }),
        changes, refs
      ),
      /no admite origin_waivers/
    );
    assert.throws(
      () => validateReplayTransport(replayManifest({ certified_commit: repo.CERT, replay_baseline: repo.MAIN }), changes, refs),
      /distinto del punto real de divergencia/
    );
    assert.throws(
      () => validateReplayTransport(replayManifest({ certified_commit: repo.CERT }), changes, refs),
      /exige replay_baseline/
    );
    assert.throws(
      () => validateReplayTransport(replayManifest({ certified_commit: repo.CERT, replay_baseline: "referencia-inexistente" }), changes, refs),
      /no se puede verificar replay_baseline/
    );
  } finally {
    fs.rmSync(repo.directory, { recursive: true, force: true });
  }
});
