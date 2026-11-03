"use strict";

const fs = require("node:fs");
const path = require("node:path");

const APP_DIR = path.resolve(__dirname, "..");
const DEFAULT_REPO_ROOT = path.resolve(APP_DIR, "..", "..");
let envLoaded = false;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (!key || key in process.env) continue;
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadEnvFiles() {
  if (envLoaded) return;
  envLoaded = true;
  loadEnvFile(path.join(APP_DIR, ".env.local"));
  loadEnvFile(path.join(APP_DIR, ".env"));
}

function boolValue(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on", "si", "sí"].includes(String(value).trim().toLowerCase());
}

function intValue(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function listValue(value, fallback = []) {
  if (value == null || value === "") return fallback;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function mergeSection(base, override) {
  if (!override || typeof override !== "object") return base;
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object") {
      merged[key] = mergeSection(base[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

const ENV_DEFAULTS = {
  develop: {
    apiBaseUrl: "https://apexos-api-qa-production.up.railway.app",
    webBaseUrl: "https://apexos-web-qa-production.up.railway.app",
    supabaseUrl: "https://jbirkghkekuifgfsgquq.supabase.co",
    supabaseRef: "jbirkghkekuifgfsgquq"
  },
  main: {
    apiBaseUrl: "https://apexos-api-prod-production.up.railway.app",
    webBaseUrl: "https://apexos-web-prod-production.up.railway.app",
    supabaseUrl: "https://jzbwzmkidfthknsohhnr.supabase.co",
    supabaseRef: "jzbwzmkidfthknsohhnr"
  }
};

function urlValue(value, fallback) {
  return String(value || fallback || "").replace(/\/+$/, "");
}

function loadConfig(overrides = {}) {
  loadEnvFiles();
  const env = process.env;
  const mode = String(env.TELEGRAM_MODE || "auto").trim().toLowerCase();
  const config = {
    appDir: APP_DIR,
    repoRoot: path.resolve(env.REPO_ROOT || DEFAULT_REPO_ROOT),
    dataDir: path.resolve(env.TOWER_DATA_DIR || path.join(APP_DIR, "data")),
    version: require("../package.json").version,
    host: env.TOWER_HOST || "127.0.0.1",
    port: intValue(env.TOWER_PORT, 4310, 1, 65535),
    pollMs: intValue(env.TOWER_POLL_MS, 10000, 2000, 300000),
    apiBaseUrl: String(env.API_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, ""),
    webBaseUrl: String(env.WEB_BASE_URL || "http://127.0.0.1:3001").replace(/\/+$/, ""),
    apexToken: env.APEX_CONTROL_TOKEN || "",
    uiToken: env.TOWER_UI_TOKEN || "",
    simulation: boolValue(env.TOWER_SIMULATION, false),
    git: {
      remote: env.TOWER_REMOTE || "origin",
      branches: listValue(env.TOWER_BRANCHES, ["desarrollo", "develop", "main"]),
      remoteEnabled: boolValue(env.TOWER_GIT_REMOTE, true),
      timeoutMs: intValue(env.TOWER_GIT_TIMEOUT_MS, 8000, 1000, 60000),
      fetchTimeoutMs: intValue(env.TOWER_GIT_FETCH_TIMEOUT_MS, 60000, 5000, 300000),
      remoteCacheMs: intValue(env.TOWER_GIT_REMOTE_CACHE_MS, 60000, 5000, 600000)
    },
    infra: {
      timeoutMs: intValue(env.TOWER_INFRA_TIMEOUT_MS, 2500, 500, 30000),
      postgres: {
        host: env.PG_HOST || "127.0.0.1",
        port: intValue(env.PG_PORT, 55432, 1, 65535)
      },
      redis: {
        host: env.REDIS_HOST || "127.0.0.1",
        port: intValue(env.REDIS_PORT, 6379, 1, 65535)
      },
      brainUrl: String(env.BRAIN_URL || "http://127.0.0.1:8000").replace(/\/+$/, ""),
      minioUrl: String(env.MINIO_URL || "http://127.0.0.1:9000").replace(/\/+$/, ""),
      dockerEnabled: boolValue(env.TOWER_DOCKER, true)
    },
    telegram: {
      token: env.TELEGRAM_BOT_TOKEN || "",
      mode: ["auto", "polling", "dry-run", "off"].includes(mode) ? mode : "auto",
      allowedChatIds: listValue(env.TELEGRAM_ALLOWED_CHAT_IDS),
      pollTimeoutS: intValue(env.TELEGRAM_POLL_TIMEOUT_S, 25, 1, 50),
      rateLimitPerMin: intValue(env.TELEGRAM_RATE_LIMIT_PER_MIN, 20, 1, 120),
      pairingTtlMs: intValue(env.TELEGRAM_PAIRING_TTL_MS, 600000, 60000, 3600000)
    },
    bridge: {
      token: env.BRIDGE_TOKEN || "",
      offlineMs: intValue(env.BRIDGE_OFFLINE_MS, 30000, 5000, 600000)
    },
    alerts: {
      cooldownMs: intValue(env.TOWER_ALERT_COOLDOWN_MS, 300000, 10000, 3600000),
      max: intValue(env.TOWER_ALERT_MAX, 80, 10, 500)
    },
    environments: {
      local: {
        id: "local",
        label: "Local",
        short: "LOCAL",
        branch: "desarrollo",
        enabled: boolValue(env.ENV_LOCAL_ENABLED, true),
        apiBaseUrl: urlValue(env.ENV_LOCAL_API_URL, env.API_BASE_URL || "http://127.0.0.1:3000"),
        webBaseUrl: urlValue(env.ENV_LOCAL_WEB_URL, env.WEB_BASE_URL || "http://127.0.0.1:3001"),
        supabaseUrl: urlValue(env.ENV_LOCAL_SUPABASE_URL, ""),
        supabaseAnonKey: env.ENV_LOCAL_SUPABASE_ANON_KEY || "",
        railwayUrl: urlValue(env.ENV_LOCAL_RAILWAY_URL, ""),
        vercelUrl: urlValue(env.ENV_LOCAL_VERCEL_URL, ""),
        railwayProjectId: env.ENV_LOCAL_RAILWAY_PROJECT_ID || "",
        vercelProjectId: env.ENV_LOCAL_VERCEL_PROJECT_ID || "",
        supabaseRef: env.ENV_LOCAL_SUPABASE_REF || "",
        apexToken: env.ENV_LOCAL_APEX_TOKEN || env.APEX_CONTROL_TOKEN || ""
      },
      develop: {
        id: "develop",
        label: "Develop · QA",
        short: "QA",
        branch: "develop",
        enabled: boolValue(env.ENV_DEVELOP_ENABLED, true),
        apiBaseUrl: urlValue(env.ENV_DEVELOP_API_URL, ENV_DEFAULTS.develop.apiBaseUrl),
        webBaseUrl: urlValue(env.ENV_DEVELOP_WEB_URL, ENV_DEFAULTS.develop.webBaseUrl),
        supabaseUrl: urlValue(env.ENV_DEVELOP_SUPABASE_URL, ENV_DEFAULTS.develop.supabaseUrl),
        supabaseAnonKey: env.ENV_DEVELOP_SUPABASE_ANON_KEY || "",
        railwayUrl: urlValue(env.ENV_DEVELOP_RAILWAY_URL, ""),
        vercelUrl: urlValue(env.ENV_DEVELOP_VERCEL_URL, ""),
        railwayProjectId: env.ENV_DEVELOP_RAILWAY_PROJECT_ID || "",
        vercelProjectId: env.ENV_DEVELOP_VERCEL_PROJECT_ID || "",
        supabaseRef: env.ENV_DEVELOP_SUPABASE_REF || ENV_DEFAULTS.develop.supabaseRef,
        apexToken: env.ENV_DEVELOP_APEX_TOKEN || ""
      },
      main: {
        id: "main",
        label: "Main · Producción",
        short: "PROD",
        branch: "main",
        enabled: boolValue(env.ENV_MAIN_ENABLED, true),
        apiBaseUrl: urlValue(env.ENV_MAIN_API_URL, ENV_DEFAULTS.main.apiBaseUrl),
        webBaseUrl: urlValue(env.ENV_MAIN_WEB_URL, ENV_DEFAULTS.main.webBaseUrl),
        supabaseUrl: urlValue(env.ENV_MAIN_SUPABASE_URL, ENV_DEFAULTS.main.supabaseUrl),
        supabaseAnonKey: env.ENV_MAIN_SUPABASE_ANON_KEY || "",
        railwayUrl: urlValue(env.ENV_MAIN_RAILWAY_URL, ""),
        vercelUrl: urlValue(env.ENV_MAIN_VERCEL_URL, ""),
        railwayProjectId: env.ENV_MAIN_RAILWAY_PROJECT_ID || "",
        vercelProjectId: env.ENV_MAIN_VERCEL_PROJECT_ID || "",
        supabaseRef: env.ENV_MAIN_SUPABASE_REF || ENV_DEFAULTS.main.supabaseRef,
        apexToken: env.ENV_MAIN_APEX_TOKEN || ""
      }
    },
    environmentTimeoutMs: intValue(env.ENV_TIMEOUT_MS, 6000, 1000, 30000),
    cloud: {
      timeoutMs: intValue(env.CLOUD_TIMEOUT_MS, 8000, 1000, 30000),
      cacheMs: intValue(env.CLOUD_CACHE_MS, 60000, 5000, 600000),
      railway: {
        token: env.RAILWAY_TOKEN || "",
        apiUrl: urlValue(env.RAILWAY_API_URL, "https://backboard.railway.app/graphql/v2")
      },
      vercel: {
        token: env.VERCEL_TOKEN || "",
        teamId: env.VERCEL_TEAM_ID || "",
        apiUrl: urlValue(env.VERCEL_API_URL, "https://api.vercel.com")
      },
      supabase: {
        accessToken: env.SUPABASE_ACCESS_TOKEN || "",
        apiUrl: urlValue(env.SUPABASE_MANAGEMENT_API_URL, "https://api.supabase.com")
      }
    }
  };

  const merged = mergeSection(config, overrides);
  merged.telegram.mode = resolveTelegramMode(merged.telegram);
  return merged;
}

function resolveTelegramMode(telegram) {
  if (telegram.mode === "auto") return telegram.token ? "polling" : "off";
  if (telegram.mode === "polling" && !telegram.token) return "off";
  return telegram.mode;
}

function credentialReport(config) {
  const cloud = config.cloud;
  const environments = config.environments || {};
  const railwayEnvs = {};
  const supabaseEnvs = {};
  const vercelEnvs = {};
  const railwayMissing = [];
  const supabaseMissing = [];
  const vercelMissing = [];

  for (const id of ["develop", "main"]) {
    const environment = environments[id] || {};
    railwayEnvs[id] = Boolean(environment.railwayProjectId);
    supabaseEnvs[id] = Boolean(environment.supabaseRef);
    vercelEnvs[id] = Boolean(environment.vercelProjectId);
    if (!environment.railwayProjectId) railwayMissing.push(`ENV_${id.toUpperCase()}_RAILWAY_PROJECT_ID`);
    if (!environment.supabaseRef) supabaseMissing.push(`ENV_${id.toUpperCase()}_SUPABASE_REF`);
    if (!environment.vercelProjectId) vercelMissing.push(`ENV_${id.toUpperCase()}_VERCEL_PROJECT_ID`);
  }
  if (!cloud.railway.token) railwayMissing.unshift("RAILWAY_TOKEN");
  if (!cloud.supabase.accessToken) supabaseMissing.unshift("SUPABASE_ACCESS_TOKEN");
  if (!cloud.vercel.token) vercelMissing.unshift("VERCEL_TOKEN");

  return [
    {
      provider: "railway",
      label: "Railway",
      tokenConfigured: Boolean(cloud.railway.token),
      environments: { local: "not_required", ...railwayEnvs },
      missing: railwayMissing,
      configured: Boolean(cloud.railway.token) && Object.values(railwayEnvs).some(Boolean)
    },
    {
      provider: "supabase",
      label: "Supabase",
      tokenConfigured: Boolean(cloud.supabase.accessToken),
      environments: { local: "not_required", ...supabaseEnvs },
      missing: supabaseMissing,
      configured: Boolean(cloud.supabase.accessToken) && Object.values(supabaseEnvs).some(Boolean)
    },
    {
      provider: "vercel",
      label: "Vercel",
      tokenConfigured: Boolean(cloud.vercel.token),
      environments: { local: "not_required", ...vercelEnvs },
      missing: vercelMissing,
      configured: Boolean(cloud.vercel.token) && Object.values(vercelEnvs).some(Boolean)
    }
  ];
}

function safeConfig(config) {
  return {
    version: config.version,
    repoRoot: config.repoRoot,
    apiBaseUrl: config.apiBaseUrl,
    webBaseUrl: config.webBaseUrl,
    pollMs: config.pollMs,
    branches: config.git.branches,
    simulation: config.simulation,
    uiTokenConfigured: Boolean(config.uiToken),
    telegram: {
      configured: Boolean(config.telegram.token),
      mode: config.telegram.mode,
      allowedCount: config.telegram.allowedChatIds.length
    },
    bridge: {
      tokenConfigured: Boolean(config.bridge.token),
      offlineMs: config.bridge.offlineMs
    },
    environments: Object.fromEntries(
      Object.entries(config.environments).map(([id, environment]) => [id, {
        id,
        label: environment.label,
        short: environment.short,
        branch: environment.branch,
        enabled: environment.enabled,
        apiBaseUrl: environment.apiBaseUrl,
        webBaseUrl: environment.webBaseUrl,
        supabaseUrl: environment.supabaseUrl,
        railwayUrl: environment.railwayUrl,
        vercelUrl: environment.vercelUrl,
        apexTokenConfigured: Boolean(environment.apexToken)
      }])
    ),
    cloud: {
      railwayConfigured: Boolean(config.cloud.railway.token),
      vercelConfigured: Boolean(config.cloud.vercel.token),
      supabaseConfigured: Boolean(config.cloud.supabase.accessToken),
      credentials: credentialReport(config)
    }
  };
}

module.exports = {
  APP_DIR,
  DEFAULT_REPO_ROOT,
  loadConfig,
  safeConfig,
  credentialReport,
  loadEnvFile
};
