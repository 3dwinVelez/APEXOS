const fs = require("fs");
const path = require("path");

const PROD_PROJECT_REF = "jzbwzmkidfthknsohhnr";
const PROD_SUPABASE_URL = `https://${PROD_PROJECT_REF}.supabase.co`;

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

function cleanUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function databaseUrlMatchesProjectRef(value = "") {
  const text = String(value || "");
  return text.includes(PROD_PROJECT_REF) && !/(localhost|127\.0\.0\.1|jbirkghkekuifgfsgquq)/i.test(text);
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
  if (targetEnv === "production") {
    const databaseUrl = process.env.DATABASE_URL || "";
    const directUrl = process.env.DIRECT_URL || "";
    const supabaseUrl = cleanUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (!databaseUrlMatchesProjectRef(databaseUrl) && !databaseUrlMatchesProjectRef(directUrl)) {
      throw new Error(`DATABASE_URL/DIRECT_URL debe apuntar a Supabase PROD ${PROD_PROJECT_REF}.`);
    }
    if (supabaseUrl !== PROD_SUPABASE_URL) {
      throw new Error(`SUPABASE_URL debe ser exactamente ${PROD_SUPABASE_URL}.`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args["env-file"] || process.env.PLATFORM_INIT_ENV_FILE || ".env");
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
