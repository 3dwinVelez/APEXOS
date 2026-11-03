"use strict";

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const { execFile } = require("node:child_process");
const { cloudForEnvironment } = require("./cloud");
const { diagnoseCheck } = require("./diagnostics");
const { redact } = require("./security");
const { fetchModules, enrichWithChecks, moduleChecks } = require("./modules");
const { fetchActivity, activityChecks } = require("./activity");
const { computeHealth, withModuleBands } = require("./health");

const DEFAULT_MAX_BYTES = 256 * 1024;
const ENVIRONMENT_ORDER = ["local", "develop", "main"];

function httpRequest(url, { timeoutMs = 2500, headers = {}, maxBytes = DEFAULT_MAX_BYTES, redirects = 0 } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve({ ok: false, status: 0, durationMs: 0, error: "URL invalida" });
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      resolve({ ok: false, status: 0, durationMs: 0, error: "Protocolo no soportado" });
      return;
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(
      parsed,
      { method: "GET", headers: { accept: "application/json,text/plain,*/*", "user-agent": "apex-control-tower", ...headers }, timeout: timeoutMs },
      (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location && redirects < 2) {
          response.resume();
          const nextUrl = new URL(response.headers.location, parsed).toString();
          httpRequest(nextUrl, { timeoutMs, headers, maxBytes, redirects: redirects + 1 }).then(resolve);
          return;
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          if (size >= maxBytes) return;
          chunks.push(chunk);
          size += chunk.length;
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks).slice(0, maxBytes).toString("utf8");
          let json = null;
          try {
            json = body ? JSON.parse(body) : null;
          } catch {
            json = null;
          }
          resolve({
            ok: status >= 200 && status < 400,
            status,
            body,
            json,
            durationMs: Date.now() - startedAt,
            error: null
          });
        });
        response.on("error", (error) => {
          resolve({ ok: false, status, durationMs: Date.now() - startedAt, error: String(error.message || error) });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`timeout ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      resolve({ ok: false, status: 0, durationMs: Date.now() - startedAt, error: String(error.message || error) });
    });
    request.end();
  });
}

function tcpCheck(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, durationMs: Date.now() - startedAt, error: error || null });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, null));
    socket.once("timeout", () => finish(false, `timeout ${timeoutMs}ms`));
    socket.once("error", (error) => finish(false, String(error.message || error)));
    socket.connect(port, host);
  });
}

function redisPing(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = new net.Socket();
    let buffer = "";
    let settled = false;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, detail, durationMs: Date.now() - startedAt });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => socket.write("*1\r\n$4\r\nPING\r\n"));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\n")) finish(buffer.startsWith("+PONG"), buffer.trim());
    });
    socket.once("timeout", () => finish(false, `timeout ${timeoutMs}ms`));
    socket.once("error", (error) => finish(false, String(error.message || error)));
    socket.connect(port, host);
  });
}

function dockerStatus(timeoutMs = 2500) {
  return new Promise((resolve) => {
    execFile("docker", ["ps", "--format", "{{.Names}}|{{.Status}}"], { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const message = String(stderr || error.message || error);
        if (/not recognized|ENOENT|no se reconoce/i.test(message)) {
          resolve({ available: false, running: false, containers: [], error: "Docker CLI no disponible" });
          return;
        }
        resolve({ available: true, running: false, containers: [], error: message });
        return;
      }
      const containers = String(stdout || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [name, status] = line.split("|");
          return { name, status };
        });
      resolve({ available: true, running: true, containers, error: null });
    });
  });
}

function baseCheck(id, label, options = {}) {
  return {
    id,
    label,
    environment: options.environment || "local",
    status: "unknown",
    severity: options.severity || "medium",
    critical: Boolean(options.critical),
    optional: Boolean(options.optional),
    detail: null,
    technical: null,
    durationMs: 0,
    source: options.source || "tower",
    checkedAt: new Date().toISOString()
  };
}

function bodyExcerpt(result, limit = 400) {
  const value = result && result.json ? result.json : result && result.body ? result.body : null;
  if (value == null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return redact(text).slice(0, limit);
}

function statusFromHttp(result, { okStatuses = [200] } = {}) {
  if (result.error) return "down";
  return okStatuses.includes(result.status) ? "ok" : "degraded";
}

async function probeApi(config) {
  const check = baseCheck("api", "API APEXOS", { severity: "critical", critical: true });
  const endpoint = `${config.apiBaseUrl}/health`;
  const result = await httpRequest(endpoint, { timeoutMs: config.infra.timeoutMs });
  check.durationMs = result.durationMs;
  check.status = statusFromHttp(result, { okStatuses: [200] });
  check.detail = result.json ? result.json : result.error ? result.error : `HTTP ${result.status}`;
  check.technical = { endpoint, method: "GET", httpStatus: result.status, error: result.error, response: bodyExcerpt(result) };
  return check;
}

async function probePostgres(config) {
  const check = baseCheck("db", "PostgreSQL", { severity: "critical", critical: true });
  const result = await tcpCheck(config.infra.postgres.host, config.infra.postgres.port, config.infra.timeoutMs);
  check.durationMs = result.durationMs;
  check.status = result.ok ? "ok" : "down";
  check.detail = result.ok ? `tcp ${config.infra.postgres.host}:${config.infra.postgres.port}` : result.error;
  check.technical = {
    protocol: "tcp",
    host: config.infra.postgres.host,
    port: config.infra.postgres.port,
    error: result.error
  };
  return check;
}

async function probeRedis(config) {
  const check = baseCheck("redis", "Redis", { severity: "high" });
  const result = await redisPing(config.infra.redis.host, config.infra.redis.port, config.infra.timeoutMs);
  check.durationMs = result.durationMs;
  check.status = result.ok ? "ok" : "down";
  check.detail = result.ok ? "PING -> PONG" : result.detail;
  check.technical = {
    protocol: "redis",
    host: config.infra.redis.host,
    port: config.infra.redis.port,
    response: result.detail
  };
  return check;
}

async function probeBrain(config) {
  const check = baseCheck("brain", "Brain (Python)", { severity: "high" });
  const endpoint = `${config.infra.brainUrl}/health`;
  const result = await httpRequest(endpoint, { timeoutMs: config.infra.timeoutMs });
  check.durationMs = result.durationMs;
  check.status = statusFromHttp(result);
  check.detail = result.json ? result.json : result.error ? result.error : `HTTP ${result.status}`;
  check.technical = { endpoint, method: "GET", httpStatus: result.status, error: result.error, response: bodyExcerpt(result) };
  return check;
}

async function probeWeb(config) {
  const check = baseCheck("web", "Web APEXOS", { severity: "medium" });
  const result = await httpRequest(config.webBaseUrl, { timeoutMs: config.infra.timeoutMs });
  check.durationMs = result.durationMs;
  check.status = statusFromHttp(result, { okStatuses: [200, 301, 302, 307, 308] });
  check.detail = result.error || `HTTP ${result.status}`;
  check.technical = { endpoint: config.webBaseUrl, method: "GET", httpStatus: result.status, error: result.error, response: bodyExcerpt(result) };
  return check;
}

async function probeMinio(config) {
  const check = baseCheck("minio", "MinIO", { severity: "medium", optional: true });
  const endpoint = `${config.infra.minioUrl}/minio/health/live`;
  const result = await httpRequest(endpoint, { timeoutMs: config.infra.timeoutMs });
  check.durationMs = result.durationMs;
  check.status = result.ok ? "ok" : result.error ? "down" : "degraded";
  check.detail = result.error || `HTTP ${result.status}`;
  check.technical = { endpoint, method: "GET", httpStatus: result.status, error: result.error, response: bodyExcerpt(result) };
  return check;
}

async function probeDocker(config) {
  const check = baseCheck("docker", "Docker", { severity: "low", optional: true });
  if (!config.infra.dockerEnabled) {
    check.status = "unknown";
    check.detail = "Deshabilitado por configuracion";
    return check;
  }
  const startedAt = Date.now();
  const result = await dockerStatus(config.infra.timeoutMs);
  check.durationMs = Date.now() - startedAt;
  if (!result.available) {
    check.status = "unknown";
    check.detail = result.error;
    check.technical = { command: "docker ps", error: result.error };
    return check;
  }
  check.status = result.running ? "ok" : "degraded";
  check.detail = result.running
    ? { containers: result.containers.filter((item) => item.status && !/exited/i.test(item.status)).length, listing: result.containers.slice(0, 12) }
    : result.error;
  check.technical = { command: "docker ps", error: result.error, containers: result.containers.slice(0, 12) };
  return check;
}

function probeFromStatus(id, label, component, options = {}) {
  const check = baseCheck(id, label, { severity: "medium", optional: true, source: "apex-control", ...options });
  if (!component) {
    check.status = "unknown";
    check.detail = "Sin dato en /apex-control/status";
    return check;
  }
  const raw = String(component.status || component.state || "unknown").toLowerCase();
  check.status = ["ok", "degraded", "down", "unknown"].includes(raw) ? raw : "unknown";
  check.detail = component.detail || component.message || component.details || null;
  check.latencyMs = component.latencyMs ?? component.latency_ms ?? null;
  return check;
}

async function probeApexControl(config) {
  const results = [];
  const deep = baseCheck("apex-control", "APEX Control (API)", { severity: "medium", optional: true });
  const headers = config.apexToken ? { authorization: `Bearer ${config.apexToken}` } : {};
  const endpoint = `${config.apiBaseUrl}/api/v1/apex-control/status`;
  const result = await httpRequest(endpoint, { timeoutMs: config.infra.timeoutMs, headers });
  deep.durationMs = result.durationMs;
  deep.technical = {
    endpoint,
    method: "GET",
    httpStatus: result.status,
    error: result.error,
    tokenConfigured: Boolean(config.apexToken),
    response: bodyExcerpt(result)
  };
  if (result.error) {
    deep.status = "down";
    deep.detail = result.error;
  } else if (result.status === 200 && result.json) {
    deep.status = ["ok", "degraded", "down"].includes(String(result.json.overall)) ? String(result.json.overall) : "ok";
    const rawComponents = result.json.components;
    const components = Array.isArray(rawComponents)
      ? Object.fromEntries(rawComponents.map((component) => [component.key, component]))
      : (rawComponents && typeof rawComponents === "object" ? rawComponents : {});
    deep.detail = { overall: result.json.overall, components: Object.keys(components).length };
    for (const [id, label] of [
      ["queues", "Colas BullMQ"],
      ["crons", "Crons"],
      ["mail", "Correo"],
      ["websocket", "WebSocket"]
    ]) {
      results.push(probeFromStatus(id, label, components[id]));
    }
  } else if (result.status === 401 || result.status === 403) {
    deep.status = "degraded";
    deep.detail = "Token APEX Control invalido o sin permiso";
  } else if (result.status === 404) {
    deep.status = "unknown";
    deep.detail = "Modulo apex-control no habilitado en la API";
  } else {
    deep.status = "degraded";
    deep.detail = `HTTP ${result.status}`;
  }
  results.unshift(deep);
  return results;
}

function scored(checks) {
  return checks.filter((check) => !check.informational);
}

function computeSummary(allChecks) {
  const checks = scored(allChecks);
  const summary = { ok: 0, degraded: 0, down: 0, unknown: 0, total: checks.length };
  for (const check of checks) summary[check.status] = (summary[check.status] || 0) + 1;
  return summary;
}

function computeOverall(allChecks) {
  const checks = scored(allChecks);
  if (!checks.length || checks.every((check) => check.status === "unknown")) return "unknown";
  const required = checks.filter((check) => !check.optional);
  if (required.some((check) => check.critical && check.status === "down")) return "down";
  if (required.some((check) => ["down", "degraded"].includes(check.status))) return "degraded";
  if (required.some((check) => check.status === "unknown")) return "degraded";
  if (checks.some((check) => check.status === "down")) return "degraded";
  return "ok";
}

async function collectModules(config, environment, checks) {
  try {
    const payload = enrichWithChecks(await fetchModules(config, environment, { httpRequest }), checks, environment.id);
    return { payload, checks: moduleChecks(payload, environment) };
  } catch (error) {
    return { payload: null, checks: [] };
  }
}

async function collectActivity(config, environment) {
  try {
    const payload = await fetchActivity(config, environment, { httpRequest });
    return { payload, checks: activityChecks(payload, environment) };
  } catch (error) {
    return { payload: null, checks: [] };
  }
}

async function runProbes(config) {
  const startedAt = Date.now();
  const checks = await Promise.all([
    probeApi(config),
    probePostgres(config),
    probeRedis(config),
    probeBrain(config),
    probeWeb(config),
    probeMinio(config),
    probeDocker(config)
  ]);
  checks.push(...(await probeApexControl(config)));
  const modules = await collectModules(config, config.environments.local, checks);
  if (modules.payload) checks.push(...modules.checks);
  const activity = await collectActivity(config, config.environments.local);
  if (activity.checks.length) checks.push(...activity.checks);
  checks.sort((left, right) => {
    if (left.critical !== right.critical) return left.critical ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
  const summary = computeSummary(checks);
  const apiCheck = checks.find((check) => check.id === "api");
  return {
    at: new Date().toISOString(),
    source: "tower",
    overall: computeOverall(checks),
    durationMs: Date.now() - startedAt,
    summary,
    checks,
    api: deployedInfo(apiCheck),
    modules: modules.payload,
    activity: activity.payload,
    metrics: apiCheck ? [{
      environment: "local",
      endpoint: "/health",
      ms: apiCheck.durationMs,
      ok: apiCheck.status === "ok",
      status: apiCheck.status,
      at: apiCheck.checkedAt
    }] : []
  };
}

function cloudPlaceholder(provider, configured, detail) {
  return {
    provider,
    configured: Boolean(configured),
    status: "unknown",
    detail,
    project: null,
    services: [],
    deployments: [],
    environments: [],
    health: [],
    metrics: null,
    error: null,
    checkedAt: new Date().toISOString()
  };
}

function simulatedCloud(config, environment) {
  return {
    railway: cloudPlaceholder("railway", config.cloud.railway.token && environment.railwayProjectId, "Simulación: integración Railway omitida."),
    vercel: cloudPlaceholder("vercel", config.cloud.vercel.token && environment.vercelProjectId, "Simulación: integración Vercel omitida."),
    supabase: cloudPlaceholder("supabase", config.cloud.supabase.accessToken && environment.supabaseRef, "Simulación: integración Supabase omitida.")
  };
}

function deployedInfo(apiCheck) {
  const payload = apiCheck && apiCheck.detail && typeof apiCheck.detail === "object" ? apiCheck.detail : null;
  if (!payload) return null;
  const commit = payload.commit && !/^unknown$/i.test(String(payload.commit)) ? String(payload.commit).slice(0, 12) : null;
  return {
    status: apiCheck.status,
    version: payload.version != null ? String(payload.version) : null,
    commit,
    modules: Number.isFinite(payload.modules) ? payload.modules : null
  };
}

function remoteCheck(environment, id, label, options = {}) {
  return baseCheck(id, label, {
    environment: environment.id,
    severity: options.severity || "high",
    critical: Boolean(options.critical),
    optional: Boolean(options.optional),
    source: options.source || "tower"
  });
}

async function runEnvironmentProbes(config, environment, { fetchImpl = global.fetch, simulation = config.simulation } = {}) {
  const checks = [];
  const metrics = [];
  const short = environment.short || environment.id.toUpperCase();
  const timeoutMs = config.environmentTimeoutMs || config.infra.timeoutMs;

  if (!environment.enabled) {
    const check = remoteCheck(environment, `${environment.id}.config`, `${short} sin vigilancia`, { severity: "low", optional: true });
    check.status = "unknown";
    check.detail = `Ambiente desactivado (ENV_${environment.id.toUpperCase()}_ENABLED=false).`;
    check.technical = { enabled: false };
    checks.push(check);
    return {
      checks,
      metrics,
      enabled: false,
      api: null,
      modules: null,
      activity: null,
      cloud: {
        railway: cloudPlaceholder("railway", false, "Ambiente desactivado."),
        vercel: cloudPlaceholder("vercel", false, "Ambiente desactivado."),
        supabase: cloudPlaceholder("supabase", false, "Ambiente desactivado.")
      }
    };
  }

  if (simulation) {
    for (const [suffix, label, endpoint] of [
      ["api", `API ${short}`, `${environment.apiBaseUrl}/health`],
      ["web", `Web ${short}`, environment.webBaseUrl],
      ["supabase", `Supabase ${short}`, environment.supabaseUrl ? `${environment.supabaseUrl}/auth/v1/health` : null]
    ]) {
      const check = remoteCheck(environment, `${environment.id}.${suffix}`, label, {
        severity: suffix === "api" ? "critical" : suffix === "web" ? "high" : "critical",
        critical: suffix !== "web",
        optional: true
      });
      check.status = "unknown";
      check.detail = "Simulación: sonda remota omitida.";
      check.technical = { endpoint, simulated: true };
      checks.push(check);
    }
    // La simulacion alimenta el panel de modulos con el catalogo, pero no crea
    // sondas: no hay evidencia real que puntuar.
    const simulatedModules = await collectModules(config, environment, checks);
    const simulatedActivity = await collectActivity(config, environment);
    return {
      checks,
      metrics,
      enabled: true,
      api: null,
      modules: simulatedModules.payload,
      activity: simulatedActivity.payload,
      cloud: simulatedCloud(config, environment)
    };
  }

  const apiEndpoint = `${environment.apiBaseUrl}/health`;
  const webEndpoint = environment.webBaseUrl;
  const supabaseEndpoint = environment.supabaseUrl ? `${environment.supabaseUrl}/auth/v1/health` : null;
  const supabaseHeaders = environment.supabaseAnonKey
    ? { apikey: environment.supabaseAnonKey, authorization: `Bearer ${environment.supabaseAnonKey}` }
    : {};
  const [apiResult, webResult, supabaseResult, cloud] = await Promise.all([
    httpRequest(apiEndpoint, { timeoutMs }),
    webEndpoint ? httpRequest(webEndpoint, { timeoutMs }) : Promise.resolve(null),
    supabaseEndpoint ? httpRequest(supabaseEndpoint, { timeoutMs, headers: supabaseHeaders }) : Promise.resolve(null),
    cloudForEnvironment(config, environment, { fetchImpl }).catch((error) => ({
      railway: cloudPlaceholder("railway", false, `Error consultando Railway: ${redact(String(error && error.message ? error.message : error))}`),
      vercel: cloudPlaceholder("vercel", false, `Error consultando Vercel: ${redact(String(error && error.message ? error.message : error))}`),
      supabase: cloudPlaceholder("supabase", false, `Error consultando Supabase: ${redact(String(error && error.message ? error.message : error))}`)
    }))
  ]);

  const apiCheck = remoteCheck(environment, `${environment.id}.api`, `API ${short}`, { severity: "critical", critical: true });
  apiCheck.durationMs = apiResult.durationMs;
  apiCheck.status = statusFromHttp(apiResult, { okStatuses: [200] });
  apiCheck.detail = apiResult.json ? apiResult.json : apiResult.error || `HTTP ${apiResult.status}`;
  apiCheck.technical = { endpoint: apiEndpoint, method: "GET", httpStatus: apiResult.status, error: apiResult.error, response: bodyExcerpt(apiResult) };
  checks.push(apiCheck);
  metrics.push({
    environment: environment.id,
    endpoint: "/health",
    ms: apiResult.durationMs,
    ok: apiCheck.status === "ok",
    status: apiCheck.status,
    at: apiCheck.checkedAt
  });

  if (webResult) {
    const webCheck = remoteCheck(environment, `${environment.id}.web`, `Web ${short}`, { severity: "high" });
    webCheck.durationMs = webResult.durationMs;
    webCheck.status = statusFromHttp(webResult, { okStatuses: [200, 301, 302, 307, 308] });
    webCheck.detail = webResult.error || `HTTP ${webResult.status}`;
    webCheck.technical = { endpoint: webEndpoint, method: "GET", httpStatus: webResult.status, error: webResult.error, response: bodyExcerpt(webResult) };
    checks.push(webCheck);
  }

  const managementConfigured = Boolean(cloud.supabase && cloud.supabase.configured);
  const supabaseCheck = remoteCheck(environment, `${environment.id}.supabase`, `Supabase ${short}`, {
    severity: "critical",
    critical: true,
    optional: !environment.supabaseUrl || (!environment.supabaseAnonKey && !managementConfigured)
  });
  if (!supabaseResult) {
    supabaseCheck.status = "unknown";
    supabaseCheck.detail = "Supabase URL no configurada.";
    supabaseCheck.technical = { configured: false };
  } else {
    supabaseCheck.durationMs = supabaseResult.durationMs;
    supabaseCheck.status = supabaseResult.ok ? "ok" : supabaseResult.error ? "down" : "degraded";
    supabaseCheck.detail = supabaseResult.error || (supabaseResult.ok ? "auth/v1/health OK" : `HTTP ${supabaseResult.status}`);
    supabaseCheck.technical = {
      endpoint: supabaseEndpoint,
      method: "GET",
      httpStatus: supabaseResult.status,
      error: supabaseResult.error,
      anonKeyConfigured: Boolean(environment.supabaseAnonKey),
      response: bodyExcerpt(supabaseResult)
    };
    if (managementConfigured) {
      if (["degraded", "down"].includes(cloud.supabase.status)) {
        supabaseCheck.status = cloud.supabase.status;
        supabaseCheck.detail = `Gestión Supabase: ${cloud.supabase.detail}`;
      } else if (cloud.supabase.status === "ok") {
        supabaseCheck.status = "ok";
        supabaseCheck.detail = `Gestión Supabase: ${cloud.supabase.detail}`;
      }
    } else if (supabaseResult.status === 401 && !environment.supabaseAnonKey) {
      supabaseCheck.detail = "Supabase responde pero exige apikey. Configura ENV_*_SUPABASE_ANON_KEY para validar autenticación.";
    }
  }
  checks.push(supabaseCheck);

  for (const [provider, label] of [["railway", `Railway ${short}`], ["vercel", `Vercel ${short}`]]) {
    const data = cloud[provider];
    const check = remoteCheck(environment, `${environment.id}.${provider}`, label, { severity: "medium", optional: true, source: provider });
    check.status = data && data.status ? data.status : "unknown";
    check.detail = data ? data.detail : "Integración no configurada.";
    check.technical = data ? {
      configured: data.configured,
      project: data.project,
      error: data.error,
      checkedAt: data.checkedAt
    } : { configured: false };
    checks.push(check);
  }

  const modules = await collectModules(config, environment, checks);
  if (modules.payload) checks.push(...modules.checks);

  const activity = await collectActivity(config, environment);
  if (activity.checks.length) checks.push(...activity.checks);

  return { checks, metrics, enabled: true, api: deployedInfo(apiCheck), modules: modules.payload, activity: activity.payload, cloud };
}

function buildEnvironmentMeta(config, environment, checks, cloud = null, modules = null, activity = null, apiInfo = null) {
  const health = computeHealth({ modules: modules ? modules.modules : [], checks });
  return {
    id: environment.id,
    label: environment.label,
    short: environment.short,
    branch: environment.branch,
    enabled: environment.enabled,
    apiBaseUrl: environment.apiBaseUrl,
    webBaseUrl: environment.webBaseUrl,
    overall: environment.enabled ? computeOverall(checks) : "unknown",
    summary: computeSummary(checks),
    deployed: apiInfo || null,
    modules: modules ? { ...modules, modules: withModuleBands(modules.modules, health) } : null,
    health,
    activity: activity || null,
    cloud
  };
}

function sortChecks(checks) {
  const rank = (check) => {
    const index = ENVIRONMENT_ORDER.indexOf(check.environment || "local");
    return index < 0 ? ENVIRONMENT_ORDER.length : index;
  };
  return checks.sort((left, right) => {
    if (left.critical !== right.critical) return left.critical ? -1 : 1;
    const byEnvironment = rank(left) - rank(right);
    if (byEnvironment !== 0) return byEnvironment;
    return left.id.localeCompare(right.id);
  });
}

async function runAllProbes(config, { fetchImpl = global.fetch } = {}) {
  const startedAt = Date.now();
  const [local, develop, main] = await Promise.all([
    runProbes(config),
    runEnvironmentProbes(config, config.environments.develop, { fetchImpl }),
    runEnvironmentProbes(config, config.environments.main, { fetchImpl })
  ]);
  const checks = sortChecks([
    ...local.checks,
    ...develop.checks,
    ...main.checks
  ].map(diagnoseCheck));
  const environments = {
    local: buildEnvironmentMeta(config, config.environments.local, checks.filter((check) => check.environment === "local"), null, local.modules, local.activity, local.api),
    develop: buildEnvironmentMeta(config, config.environments.develop, checks.filter((check) => check.environment === "develop"), develop.cloud, develop.modules, develop.activity, develop.api),
    main: buildEnvironmentMeta(config, config.environments.main, checks.filter((check) => check.environment === "main"), main.cloud, main.modules, main.activity, main.api)
  };
  return {
    at: new Date().toISOString(),
    source: "tower",
    overall: computeOverall(checks),
    durationMs: Date.now() - startedAt,
    summary: computeSummary(checks),
    environments,
    checks,
    metrics: [...local.metrics, ...develop.metrics, ...main.metrics]
  };
}

module.exports = {
  httpRequest,
  tcpCheck,
  redisPing,
  dockerStatus,
  runProbes,
  runEnvironmentProbes,
  runAllProbes,
  computeOverall,
  computeSummary,
  probeApi,
  probePostgres,
  probeRedis,
  probeBrain,
  probeWeb,
  probeMinio,
  probeDocker,
  probeApexControl
};
