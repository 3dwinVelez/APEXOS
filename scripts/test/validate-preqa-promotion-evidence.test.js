const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const validator = path.resolve(__dirname, "../validate-preqa-promotion-evidence.js");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-preqa-approval-"));
  const checks = {};
  for (const name of ["functional", "error", "support_scripts", "regression", "platform_regression"]) {
    const file = `${name}.md`;
    fs.writeFileSync(path.join(directory, file), `${name} passed\n`);
    checks[name] = { status: "passed", evidence: [file] };
  }
  fs.writeFileSync(path.join(directory, "certification.js"), "process.exit(0);\n");
  fs.writeFileSync(path.join(directory, "certification.json"), '{"ok":true}\n');
  const manifest = {
    change_id: "test-preqa-change",
    environment: "LOCAL",
    source_branch: "desarrollo",
    target_branch: "develop",
    commit: "abc1234",
    qa_status: "pending",
    checks,
    certification: { status: "passed", script: "certification.js", evidence: ["certification.json"] },
    regression_certification: { status: "passed", script: "certification.js", evidence: ["certification.json"] },
    approval: {
      status: "approved",
      scope: "promotion_to_develop_for_qa",
      approved_by: "Solicitante",
      approved_at: "2026-09-08T12:00:00-05:00"
    }
  };
  const manifestPath = path.join(directory, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  return { directory, manifestPath };
}

test("aprueba evidencia local completa para desarrollo a develop", () => {
  const { directory, manifestPath } = fixture();
  try {
    const output = execFileSync(process.execPath, [validator, manifestPath], { encoding: "utf8" });
    assert.match(output, /AUTORIZACION PRE-QA VALIDA/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("bloquea un manifiesto que intenta usar la compuerta pre-QA hacia main", () => {
  const { directory, manifestPath } = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.target_branch = "main";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [validator, manifestPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /desarrollo -> develop/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("bloquea evidencia incompleta o no ejecutada", () => {
  const { directory, manifestPath } = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.certification.status = "pending";
    manifest.checks.regression.evidence = [];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [validator, manifestPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /certification.status debe ser passed/);
    assert.match(result.stderr, /checks.regression.evidence/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
