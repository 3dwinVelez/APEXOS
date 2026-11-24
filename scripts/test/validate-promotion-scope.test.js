const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  findUnoriginatedChanges,
  matchesAllowed,
  readBlobAt,
  readRefAt,
  validateManifest,
  validateOriginUniqueness
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
