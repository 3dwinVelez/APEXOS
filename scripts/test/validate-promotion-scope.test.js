const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { matchesAllowed, validateManifest } = require("../validate-promotion-scope");

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
