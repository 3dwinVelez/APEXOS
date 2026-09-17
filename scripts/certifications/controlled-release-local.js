const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BASELINE = "0abda8c41168642f99da0831e15f940b98232a12";
const REQUIRED_ANCESTORS = [
  "1c6734476e52bfb754840a0849e723e738df218a",
  "188b66b",
  "57a406e",
  "e672786db043d84bbe2e86858a8da4956cf5d4f3",
  "9cbd916975cdb094e59c1884ff8b3c3fddef3a9e",
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function check(name, callback) {
  try {
    const detail = callback();
    return { name, status: "passed", detail: detail || "ok" };
  } catch (error) {
    return {
      name,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function main() {
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const output = outputArg
    ? path.resolve(outputArg.slice("--output=".length))
    : null;
  const head = git(["rev-parse", "HEAD"]);
  const checks = [
    check("branch_is_desarrollo", () => {
      const branch = git(["branch", "--show-current"]);
      if (branch !== "desarrollo") throw new Error(`expected desarrollo, got ${branch}`);
      return branch;
    }),
    check("main_baseline_exists", () => {
      const baseline = git(["rev-parse", BASELINE]);
      if (baseline !== BASELINE) throw new Error("main baseline mismatch");
      return baseline;
    }),
    ...REQUIRED_ANCESTORS.map((commit) => check(`contains_${commit.slice(0, 7)}`, () => {
      execFileSync("git", ["merge-base", "--is-ancestor", commit, head]);
      return `${commit} is contained in ${head}`;
    })),
    check("no_deletions_against_main", () => {
      const deletions = git(["diff", "--diff-filter=D", "--name-only", `${BASELINE}..${head}`]);
      if (deletions) throw new Error(`unexpected deletions: ${deletions}`);
      return "0 deletions";
    }),
    check("migration_inventory", () => {
      const files = git(["diff", "--name-only", `${BASELINE}..${head}`])
        .split(/\r?\n/)
        .filter((file) => file.includes("/migrations/"));
      if (!files.length) throw new Error("migration inventory is empty");
      return `${files.length} migration files inventoried`;
    }),
    check("database_migration_safety", () => {
      execFileSync(process.execPath, ["scripts/validate-database-migration-safety.js"], { stdio: "pipe" });
      return "database migration safety validator passed";
    }),
    check("protected_local_regression", () => {
      const tests = [
        "apps/api/test/security-authorization-revocation.test.js",
        "apps/api/test/supabase-auth-modules.test.js",
        "apps/api/test/admin-role-capabilities.test.js",
        "apps/api/test/inventory-transfer-tenancy-contract.test.js",
        "apps/api/test/purchases-import-tenancy.test.js",
        "apps/api/test/sales-invoicing-cxc.test.js",
        "apps/api/test/accounting-routes-contract.test.js",
        "apps/api/test/service-order-items-security-contract.test.js",
        "apps/api/test/hr-workday-novelties-policy.test.js",
        "apps/api/test/transport-tms-foundation.test.js",
        "apps/web/test/local-login-tenant-context.test.mjs",
        "apps/web/test/admin-role-capabilities.test.mjs",
        "apps/web/test/hr-workday-novelties-ui.test.mjs",
        "apps/web/test/transport-tms-ui.test.mjs",
      ];
      const testEnv = {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || "postgresql://audit:audit@127.0.0.1:5432/audit",
        JWT_SECRET: process.env.JWT_SECRET || "local-release-certification-only",
        REDIS_DISABLED: "true",
      };
      for (const test of tests) {
        execFileSync(process.execPath, ["--test", test], { stdio: "pipe", env: testEnv });
      }
      return `${tests.length} protected test files passed sequentially`;
    }),
    check("dependency_security_audit", () => {
      if (process.platform === "win32") {
        execFileSync("cmd.exe", ["/d", "/s", "/c", "npm audit --audit-level=high"], { stdio: "pipe" });
      } else {
        execFileSync("npm", ["audit", "--audit-level=high"], { stdio: "pipe" });
      }
      return "npm audit passed at high threshold";
    }),
  ];

  const result = {
    change_id: "controlled-develop-main-release-20260917",
    environment: "LOCAL",
    status: checks.every((item) => item.status === "passed") ? "passed" : "failed",
    generated_at: new Date().toISOString(),
    baseline_main_commit: BASELINE,
    candidate_commit: head,
    destructive_operations: false,
    checks,
    limitations: [
      "This certificate is local pre-QA evidence only.",
      "It does not approve develop to main or prove remote database state.",
      "QA authentication, tenant isolation, browser flows, schema alignment and rollback rehearsal remain mandatory.",
    ],
  };

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, serialized);
  } else {
    process.stdout.write(serialized);
  }
  if (result.status !== "passed") process.exit(1);
}

main();
