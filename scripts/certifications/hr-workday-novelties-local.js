const { spawnSync } = require("node:child_process");

const commands = [
  {
    name: "api-policy-and-contract-tests",
    command: "node",
    args: [
      "--test",
      "apps/api/test/hr-workday-novelties-contract.test.js",
      "apps/api/test/hr-workday-novelties-policy.test.js",
    ],
  },
  {
    name: "web-hr-ui-tests",
    command: "node",
    args: [
      "--test",
      "apps/web/test/hr-workday-novelties-ui.test.mjs",
      "apps/web/test/hr-landing-information-architecture.test.mjs",
    ],
  },
  {
    name: "api-service-syntax-check",
    command: "node",
    args: ["--check", "apps/api/src/modules/hr/service.js"],
  },
  {
    name: "api-routes-syntax-check",
    command: "node",
    args: ["--check", "apps/api/src/modules/hr/routes.js"],
  },
  {
    name: "api-schema-syntax-check",
    command: "node",
    args: ["--check", "apps/api/src/modules/hr/schema.js"],
  },
];

for (const item of commands) {
  console.log(`\n[certification] ${item.name}`);
  const result = spawnSync(item.command, item.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`[certification] failed: ${item.name}`);
    process.exit(result.status || 1);
  }
}

console.log("\n[certification] hr-workday-novelties-local passed");
