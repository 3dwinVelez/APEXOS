const fs = require("fs");
const path = require("path");

const ENVIRONMENTS = {
  local: {
    file: "config/local.env",
    target: "local",
    supabaseRef: null,
    forbiddenRefs: ["jbirkghkekuifgfsgquq", "jzbwzmkidfthknsohhnr"],
    requiredLocalUrl: true
  },
  qa: {
    file: "config/qa.env",
    target: "qa",
    supabaseRef: "jbirkghkekuifgfsgquq",
    forbiddenRefs: ["jzbwzmkidfthknsohhnr"],
    requiredLocalUrl: false
  },
  prod: {
    file: "config/production.env",
    target: "production",
    supabaseRef: "jzbwzmkidfthknsohhnr",
    forbiddenRefs: ["jbirkghkekuifgfsgquq"],
    requiredLocalUrl: false,
    requiredSupabaseUrl: "https://jzbwzmkidfthknsohhnr.supabase.co",
    requiredApiUrl: "https://apexos-api-prod-production.up.railway.app",
    requiredFrontendUrl: "https://apexos-web-prod-production.up.railway.app"
  }
};

const SECRET_KEYS = new Set([
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "JWT_SECRET",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "SMTP_PASS",
  "GRAFANA_PASS",
  "REDIS_URL"
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return args;
}

function readEnvFile(file) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) throw new Error(`No existe ${file}`);
  const env = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^"(.*)"$/, "$1");
    env[key] = value;
  }
  return env;
}

function isPlaceholder(value = "") {
  return !String(value || "").trim() || /^<.*>$/.test(String(value).trim()) || String(value).includes("CHANGE_ME");
}

function mask(value = "", key = "") {
  const text = String(value || "");
  if (!text) return "(missing)";
  if (key === "DATABASE_URL" || key === "DIRECT_URL" || key === "REDIS_URL") {
    return text.replace(/:\/\/([^:@]+):([^@]+)@/, "://$1:[REDACTED]@");
  }
  if (SECRET_KEYS.has(key)) {
    if (isPlaceholder(text)) return "(placeholder)";
    return `${text.slice(0, 6)}...[REDACTED]...${text.slice(-4)}`;
  }
  return text;
}

function projectRefFromUrl(url = "") {
  const match = String(url).match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : "";
}

function databaseType(value = "") {
  const text = String(value || "");
  if (/localhost|127\.0\.0\.1/i.test(text)) return "local";
  if (text.includes("postgres.jzbwzmkidfthknsohhnr") || text.includes("jzbwzmkidfthknsohhnr")) return "prod";
  if (text.includes("jbirkghkekuifgfsgquq")) return "qa";
  if (text.includes("supabase.com")) return "supabase";
  return text ? "unknown" : "missing";
}

function redisState(env) {
  const disabled = ["1", "true", "yes"].includes(String(env.DISABLE_REDIS || env.REDIS_DISABLED || "").toLowerCase());
  return disabled ? "disabled" : (env.REDIS_URL ? "enabled" : "missing");
}

function addFailure(failures, message) {
  failures.push(message);
}

function validate(envName, env, config) {
  const failures = [];
  const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const publicSupabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
  const databaseUrl = env.DATABASE_URL || "";
  const apiUrl = env.NEXT_PUBLIC_API_URL || "";
  const frontendUrl = env.FRONTEND_URL || "";
  const expectedEnvironment = String(env.EXPECTED_ENVIRONMENT || "");
  const expectedProjectRef = String(env.EXPECTED_SUPABASE_PROJECT_REF || "");

  for (const key of ["NODE_ENV", "APP_ENV", "TARGET_ENV", "DATABASE_URL", "FRONTEND_URL", "NEXT_PUBLIC_API_URL"]) {
    if (isPlaceholder(env[key])) addFailure(failures, `${key} faltante o placeholder`);
  }
  if (envName !== "local") {
    if (expectedEnvironment !== envName || env.TARGET_ENV !== envName) {
      addFailure(failures, `EXPECTED_ENVIRONMENT y TARGET_ENV deben ser ${envName}`);
    }
    if (isPlaceholder(expectedProjectRef)) addFailure(failures, "EXPECTED_SUPABASE_PROJECT_REF faltante o placeholder");
    const actualRef = projectRefFromUrl(supabaseUrl || publicSupabaseUrl);
    if (expectedProjectRef && !isPlaceholder(expectedProjectRef) && actualRef !== expectedProjectRef) {
      addFailure(failures, "El proyecto Supabase no coincide con EXPECTED_SUPABASE_PROJECT_REF");
    }
    if (expectedProjectRef && !isPlaceholder(expectedProjectRef) && !databaseUrl.includes(expectedProjectRef)) {
      addFailure(failures, "DATABASE_URL no coincide con EXPECTED_SUPABASE_PROJECT_REF");
    }
  }

  const requiredSecrets = envName === "local"
    ? ["JWT_SECRET"]
    : ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET"];
  for (const key of requiredSecrets) {
    if (isPlaceholder(env[key])) addFailure(failures, `${key} faltante o placeholder`);
  }

  const allText = Object.values(env).join("\n");
  for (const ref of config.forbiddenRefs || []) {
    if (allText.includes(ref)) addFailure(failures, `Referencia prohibida detectada: ${ref}`);
  }

  if (config.supabaseRef && !supabaseUrl.includes(config.supabaseRef) && !publicSupabaseUrl.includes(config.supabaseRef)) {
    addFailure(failures, `Supabase ref esperada no detectada: ${config.supabaseRef}`);
  }

  if (config.requiredSupabaseUrl && supabaseUrl !== config.requiredSupabaseUrl) {
    addFailure(failures, `SUPABASE_URL debe ser ${config.requiredSupabaseUrl}`);
  }
  if (config.requiredApiUrl && apiUrl !== config.requiredApiUrl) {
    addFailure(failures, `NEXT_PUBLIC_API_URL debe ser ${config.requiredApiUrl}`);
  }
  if (config.requiredFrontendUrl && frontendUrl !== config.requiredFrontendUrl) {
    addFailure(failures, `FRONTEND_URL debe ser ${config.requiredFrontendUrl}`);
  }

  if (envName === "prod") {
    if (/localhost|127\.0\.0\.1/i.test(allText)) addFailure(failures, "PROD no puede contener localhost/127.0.0.1");
    if (!databaseUrl.includes("postgres.jzbwzmkidfthknsohhnr")) {
      addFailure(failures, "DATABASE_URL PROD debe usar Session Pooler postgres.jzbwzmkidfthknsohhnr");
    }
  }

  if (envName === "qa" && allText.includes("apexos-api-prod-production.up.railway.app")) {
    addFailure(failures, "QA no puede apuntar al API PROD");
  }

  if (envName === "local") {
    if (!/localhost|127\.0\.0\.1/i.test(databaseUrl)) addFailure(failures, "LOCAL debe usar DATABASE_URL local");
    if (/railway\.app|supabase\.co/i.test(apiUrl)) addFailure(failures, "LOCAL no puede apuntar a Railway/Supabase API remota");
  }

  return {
    failures,
    summary: {
      environment: envName,
      NODE_ENV: env.NODE_ENV || "",
      APP_ENV: env.APP_ENV || "",
      TARGET_ENV: env.TARGET_ENV || "",
      SUPABASE_URL: supabaseUrl,
      project_ref: projectRefFromUrl(supabaseUrl || publicSupabaseUrl) || "(none)",
      database_type: databaseType(databaseUrl),
      DATABASE_URL: mask(databaseUrl, "DATABASE_URL"),
      FRONTEND_URL: frontendUrl || "",
      NEXT_PUBLIC_API_URL: apiUrl || "",
      redis: redisState(env)
    }
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envName = String(args.env || args._ || "local").toLowerCase();
  const config = ENVIRONMENTS[envName];
  if (!config) throw new Error(`Ambiente invalido: ${envName}`);
  const file = args.file || config.file;
  const env = readEnvFile(file);
  const result = validate(envName, env, config);

  console.log(JSON.stringify({
    ok: result.failures.length === 0,
    file,
    ...result.summary,
    required: {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: mask(env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
      JWT_SECRET: mask(env.JWT_SECRET, "JWT_SECRET")
    },
    failures: result.failures
  }, null, 2));

  if (result.failures.length) process.exitCode = 1;
}

main();
