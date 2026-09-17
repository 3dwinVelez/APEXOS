const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BASELINE = "0abda8c41168642f99da0831e15f940b98232a12";
const CERTIFIED_COMMIT = "57a406e51b3a88509fa6e0390d6ca105966eed1d";
const OUTPUT = "docs/qa/evidence/controlled-develop-main-release-20260917/scope-manifest.json";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function changes() {
  const tracked = git(["diff", "--name-status", BASELINE])
    .split(/\r?\n/)
    .filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => `A\t${file}`);
  return [...tracked, ...untracked]
    .map((line) => {
      const [status, ...fileParts] = line.split("\t");
      return { status: status[0], file: fileParts.at(-1) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

const expectedChanges = changes();
const deletions = expectedChanges.filter((item) => item.status === "D");
if (deletions.length) {
  throw new Error(`Refusing to generate scope with deletions: ${deletions.map((item) => item.file).join(", ")}`);
}
const migrations = expectedChanges
  .filter((item) => item.file.includes("/migrations/"))
  .map((item) => item.file);

const manifest = {
  scope_schema_version: 2,
  change_id: "controlled-develop-main-release-20260917",
  change_intent: {
    summary: "Certificar de forma agregada y sin eliminaciones el estado integrado de develop antes de QA y de una eventual promocion controlada a main.",
    modules: [
      "admin", "inventory", "purchases", "sales", "invoicing",
      "accounts-receivable", "accounting", "projects", "services",
      "hr", "transport", "brain", "database", "security", "platform",
    ],
  },
  base_commits: {
    main: BASELINE,
    develop: "1c6734476e52bfb754840a0849e723e738df218a",
  },
  certified_commit: CERTIFIED_COMMIT,
  expected_changes: expectedChanges,
  allowed_paths: expectedChanges.map((item) => item.file),
  allowed_deletions: [],
  migration_plan: {
    status: "pending_qa_execution",
    strategy: "inventory_then_apply_only_pending_in_order",
    destructive_operations_authorized: false,
    files: migrations,
    prerequisites: [
      "verified backup and restore point",
      "QA schema audit before and after execution",
      "migration safety validation",
      "application compatibility and tenant-isolation certification",
    ],
  },
  rollback_plan: {
    status: "prepared_not_executed",
    strategy: "controlled_revert",
    previous_main_commit: BASELINE,
    data_strategy: "forward-fix schema changes; restore data only from a verified backup when an objective integrity trigger is met",
    trigger: "data integrity failure, tenant isolation failure, schema mismatch, critical functional regression, or failed production smoke",
  },
  protected_capabilities: [
    { name: "release-inventory-has-no-deletions", status: "passed", evidence: ["local-certification.json"] },
    { name: "main-history-preservation", status: "passed", evidence: ["runbook.md", "local-certification.json"] },
    { name: "database-migration-order-and-recovery", status: "passed", evidence: ["runbook.md", "local-certification.json"] },
    { name: "authentication-authorization-and-tenant-isolation", status: "passed", evidence: ["runbook.md"] },
    { name: "platform-critical-module-regression-plan", status: "passed", evidence: ["runbook.md"] },
  ],
  qa_gate: {
    status: "pending",
    required: true,
    note: "This scope manifest does not contain or imply QA approval.",
  },
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${OUTPUT} with ${expectedChanges.length} exact entries and ${migrations.length} migration files.`);
