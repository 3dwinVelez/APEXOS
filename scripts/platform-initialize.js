const fs = require("fs");
const path = require("path");

function loadEnvFile(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1).replace(/^"|"$/g, "");
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    if (key === "execute" || key === "dry-run" || key === "json") {
      args[key] = true;
    } else {
      args[key] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function value(args, key, envKey) {
  return args[key] || process.env[envKey] || "";
}

function assertRuntime(args) {
  const targetEnv = process.env.TARGET_ENV || "";
  if (!["qa", "production"].includes(targetEnv)) {
    throw new Error("TARGET_ENV debe ser 'qa' o 'production'.");
  }
  if (targetEnv === "production" && process.env.CONFIRM_PLATFORM_INIT !== "true") {
    throw new Error("Para produccion define CONFIRM_PLATFORM_INIT=true.");
  }
  if (args.execute && args["dry-run"]) {
    throw new Error("Usa --execute o --dry-run, no ambos.");
  }
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  assertRuntime(args);

  const execute = args.execute === true;
  const dryRun = !execute;
  const input = {
    first_name: value(args, "first-name", "PLATFORM_INIT_FIRST_NAME"),
    last_name: value(args, "last-name", "PLATFORM_INIT_LAST_NAME"),
    document: value(args, "document", "PLATFORM_INIT_DOCUMENT"),
    email: value(args, "email", "PLATFORM_INIT_EMAIL"),
    username: value(args, "username", "PLATFORM_INIT_USERNAME"),
    password: value(args, "password", "PLATFORM_INIT_TEMP_PASSWORD")
  };

  const servicePath = path.join(__dirname, "..", "apps", "api", "src", "modules", "platformInitialization", "service");
  const { initializePlatform } = require(servicePath);
  const result = await initializePlatform(input, { dryRun });

  const output = {
    ...result,
    credentials: {
      email: input.email,
      username: input.username,
      temporary_password: input.password ? "[REDACTED]" : ""
    }
  };
  console.log(JSON.stringify(output, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`[platform-initialize] ${error.message}`);
  process.exit(1);
});
