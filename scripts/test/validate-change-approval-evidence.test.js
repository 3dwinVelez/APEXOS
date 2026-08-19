const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const validator = path.resolve(__dirname, "../validate-change-approval-evidence.js");

function fixture(status = "approved") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-qa-approval-"));
  const checks = {};
  for (const name of ["functional", "error", "support_scripts", "regression", "platform_regression"]) {
    const file = `${name}.md`;
    fs.writeFileSync(path.join(directory, file), `${name} passed\n`);
    checks[name] = { status: "passed", evidence: [file] };
  }
  fs.writeFileSync(path.join(directory, "certification.js"), "process.exit(0);\n");
  fs.writeFileSync(path.join(directory, "certification.json"), '{"ok":true}\n');
  const manifest = {
    change_id: "test-change",
    environment: "QA",
    source_branch: "develop",
    target_branch: "main",
    commit: "abc1234",
    checks,
    certification: {
      status: "passed",
      script: "certification.js",
      evidence: ["certification.json"]
    },
    regression_certification: {
      status: "passed",
      script: "certification.js",
      evidence: ["certification.json"]
    },
    model_company_certification: {
      status: "passed",
      company: "NYVORA",
      environment: "QA",
      script: "certification.js",
      evidence: ["certification.json"]
    },
    rollback_plan: {
      status: "ready",
      strategy: "controlled_revert",
      previous_main_commit: "def5678",
      trigger: "cualquier falla funcional posterior al despliegue"
    },
    approval: { status, approved_by: "QA", approved_at: "2026-08-10T12:00:00Z" }
  };
  const manifestPath = path.join(directory, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  return { directory, manifestPath };
}

test("aprueba un manifiesto QA completo", () => {
  const { directory, manifestPath } = fixture();
  try {
    const output = execFileSync(process.execPath, [validator, manifestPath], { encoding: "utf8" });
    assert.match(output, /APROBACION QA VALIDA/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("bloquea una promocion sin aprobacion QA", () => {
  const { directory, manifestPath } = fixture("pending");
  try {
    const result = spawnSync(process.execPath, [validator, manifestPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /APROBACION QA BLOQUEADA/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("bloquea una promocion sin certificacion transversal", () => {
  const { directory, manifestPath } = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    delete manifest.regression_certification;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [validator, manifestPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /regression_certification/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("bloquea una promocion sin certificacion Nyvora", () => {
  const { directory, manifestPath } = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    delete manifest.model_company_certification;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [validator, manifestPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /model_company_certification/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("bloquea una promocion sin reversa controlada preparada", () => {
  const { directory, manifestPath } = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    delete manifest.rollback_plan;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [validator, manifestPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /rollback_plan/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
