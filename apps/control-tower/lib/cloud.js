"use strict";

const { redact } = require("./security");
const { resolveRailwayToken } = require("./railway-session");

async function requestJson(fetchImpl, url, { method = "GET", headers = {}, body = null, timeoutMs = 8000 } = {}) {
  const startedAt = Date.now();
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      method,
      headers: { accept: "application/json", "user-agent": "apex-control-tower", ...headers },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json, text, durationMs: Date.now() - startedAt, error: null };
  } catch (error) {
    const message = error && error.name === "AbortError"
      ? `timeout ${timeoutMs}ms`
      : String((error && error.message) || error);
    return { ok: false, status: 0, json: null, text: "", durationMs: Date.now() - startedAt, error: redact(message) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function unconfigured(provider, detail) {
  return {
    provider,
    // "aplica" es la topologia, "configurado" es el puesto: un proveedor que el
    // ambiente no usa no debe aparecer como una credencial que falta.
    applies: true,
    configured: false,
    status: "unknown",
    detail,
    project: null,
    services: [],
    deployments: [],
    environments: [],
    health: [],
    metrics: null,
    error: null,
    // Sin llamada HTTP no hay latencia medida: null, para que no se lea "instantanea".
    latencyMs: null,
    checkedAt: new Date().toISOString()
  };
}

function notApplicable(provider, label) {
  return {
    ...unconfigured(provider, `${label} no forma parte de la topología de este ambiente: no hay nada que sondear.`),
    applies: false,
    status: "not_applicable"
  };
}

function ageMinutes(value, now) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function authError(provider, response) {
  return {
    provider,
    applies: true,
    configured: true,
    status: "degraded",
    detail: `Token de ${provider} inválido o sin permiso (HTTP ${response.status}).`,
    project: null,
    services: [],
    deployments: [],
    environments: [],
    health: [],
    metrics: null,
    latencyMs: Number.isFinite(response.durationMs) ? response.durationMs : null,
    error: redact(response.text).slice(0, 300) || null,
    checkedAt: new Date().toISOString()
  };
}

function deploymentStatus(state) {
  const value = String(state || "").toUpperCase();
  if (["SUCCESS", "READY", "ACTIVE_HEALTHY"].includes(value)) return "ok";
  if (["FAILED", "CRASHED", "REMOVED", "ERROR", "CANCELED", "INACTIVE", "PAUSED", "ACTIVE_UNHEALTHY"].includes(value)) return "degraded";
  if (["BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED", "RESTORING"].includes(value)) return "degraded";
  return "unknown";
}

async function railwayStatus({ token, projectId, apiUrl, credentialSource = "", timeoutMs = 8000, fetchImpl = global.fetch, now = new Date() } = {}) {
  const provider = "railway";
  if (!token || !projectId) {
    return unconfigured(provider, token
      ? "Railway sin proyecto configurado. Añade ENV_*_RAILWAY_PROJECT_ID."
      : "Railway sin credencial: añade RAILWAY_TOKEN en apps/control-tower/.env.local o inicia sesión con el CLI de Railway en el puesto.");
  }
  const headers = {
    authorization: `Bearer ${token}`,
    "project-access-token": token,
    "content-type": "application/json"
  };
  const projectQuery = `query Project($id: String!) {
    project(id: $id) {
      id
      name
      services { edges { node { id name } } }
      environments { edges { node { id name } } }
    }
  }`;
  const projectResponse = await requestJson(fetchImpl, apiUrl, {
    method: "POST",
    headers,
    timeoutMs,
    body: { query: projectQuery, variables: { id: projectId } }
  });
  if (projectResponse.status === 401 || projectResponse.status === 403) return authError(provider, projectResponse);
  if (projectResponse.error) {
    return {
      ...unconfigured(provider, "Sin conexión con Railway."),
      configured: true,
      status: "degraded",
      latencyMs: projectResponse.durationMs,
      error: projectResponse.error,
      checkedAt: now.toISOString()
    };
  }
  const project = projectResponse.json && projectResponse.json.data ? projectResponse.json.data.project : null;
  if (!projectResponse.ok || !project) {
    const graphErrors = projectResponse.json && Array.isArray(projectResponse.json.errors)
      ? projectResponse.json.errors.map((item) => item.message).join("; ")
      : `HTTP ${projectResponse.status}`;
    return {
      ...unconfigured(provider, "Railway no devolvió el proyecto solicitado."),
      configured: true,
      status: "degraded",
      latencyMs: projectResponse.durationMs,
      error: redact(graphErrors).slice(0, 300),
      checkedAt: now.toISOString()
    };
  }

  const services = ((project.services && project.services.edges) || []).map((edge) => edge.node).filter(Boolean);
  const environments = ((project.environments && project.environments.edges) || []).map((edge) => edge.node).filter(Boolean);
  const deployments = [];
  const warnings = [];
  for (const environment of environments.slice(0, 4)) {
    const response = await requestJson(fetchImpl, apiUrl, {
      method: "POST",
      headers,
      timeoutMs,
      body: {
        query: `query Deployments($input: DeploymentListInput!) {
          deployments(input: $input, first: 3) {
            edges { node { id status createdAt } }
          }
        }`,
        variables: { input: { projectId, environmentId: environment.id } }
      }
    });
    if (response.error) {
      warnings.push(`${environment.name || environment.id}: ${response.error}`);
      continue;
    }
    const nodes = response.json && response.json.data && response.json.data.deployments
      ? (response.json.data.deployments.edges || []).map((edge) => edge.node).filter(Boolean)
      : [];
    if (response.json && Array.isArray(response.json.errors) && response.json.errors.length) {
      warnings.push(`${environment.name || environment.id}: ${response.json.errors.map((item) => item.message).join("; ")}`);
      continue;
    }
    for (const node of nodes.slice(0, 3)) {
      deployments.push({
        environment: environment.name || environment.id,
        id: node.id,
        status: node.status,
        createdAt: node.createdAt
      });
    }
  }

  const latest = deployments.slice().sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null;
  const status = latest ? deploymentStatus(latest.status) : "unknown";
  const failed = deployments.filter((deployment) => deploymentStatus(deployment.status) === "degraded").length;
  const metrics = {
    services: services.length,
    environments: environments.length,
    deployments: deployments.length,
    failed,
    last_age_minutes: latest ? ageMinutes(latest.createdAt, now) : null,
    last_status: latest ? (latest.status || null) : null
  };
  return {
    provider,
    applies: true,
    configured: true,
    credentialSource: credentialSource || null,
    status,
    detail: latest
      ? `Último deployment ${latest.status || "sin estado"} en ${latest.environment || "Railway"} · ${formatDate(latest.createdAt)}`
      : warnings.length ? `Railway respondió con advertencias: ${warnings.join("; ")}` : "Railway sin deployments recientes.",
    project: { id: project.id, name: project.name },
    services: services.slice(0, 20).map((service) => ({ id: service.id, name: service.name })),
    deployments: deployments.slice(0, 8),
    environments: environments.slice(0, 8).map((environment) => ({ id: environment.id, name: environment.name })),
    health: [],
    metrics,
    latencyMs: projectResponse.durationMs,
    error: warnings.length ? redact(warnings.join("; ")).slice(0, 300) : null,
    checkedAt: now.toISOString()
  };
}

async function vercelStatus({ token, teamId, projectId, apiUrl, timeoutMs = 8000, fetchImpl = global.fetch, now = new Date() } = {}) {
  const provider = "vercel";
  if (!token || !projectId) {
    return unconfigured(provider, token
      ? "Vercel sin proyecto configurado. Añade ENV_*_VERCEL_PROJECT_ID."
      : "Vercel sin token. Añade VERCEL_TOKEN en apps/control-tower/.env.local.");
  }
  const suffix = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const headers = { authorization: `Bearer ${token}` };
  const projectResponse = await requestJson(fetchImpl, `${apiUrl}/v9/projects/${encodeURIComponent(projectId)}${suffix}`, { headers, timeoutMs });
  if (projectResponse.status === 401 || projectResponse.status === 403) return authError(provider, projectResponse);
  if (projectResponse.error) {
    return {
      ...unconfigured(provider, "Sin conexión con Vercel."),
      configured: true,
      status: "degraded",
      latencyMs: projectResponse.durationMs,
      error: projectResponse.error,
      checkedAt: now.toISOString()
    };
  }
  if (!projectResponse.ok || !projectResponse.json) {
    return {
      ...unconfigured(provider, "Vercel no devolvió el proyecto solicitado."),
      configured: true,
      status: "degraded",
      latencyMs: projectResponse.durationMs,
      error: `HTTP ${projectResponse.status}`,
      checkedAt: now.toISOString()
    };
  }

  const separator = suffix ? `${suffix}&` : "?";
  const deploymentsResponse = await requestJson(
    fetchImpl,
    `${apiUrl}/v6/deployments${separator}projectId=${encodeURIComponent(projectId)}&limit=3`,
    { headers, timeoutMs }
  );
  const deployments = deploymentsResponse.ok && deploymentsResponse.json && Array.isArray(deploymentsResponse.json.deployments)
    ? deploymentsResponse.json.deployments.slice(0, 3).map((deployment) => {
      const buildingAt = Number(deployment.buildingAt || deployment.createdAt || 0);
      const readyAt = Number(deployment.ready || 0);
      return {
        id: deployment.uid || deployment.id,
        state: deployment.state,
        target: deployment.target || null,
        url: deployment.url ? (String(deployment.url).startsWith("http") ? deployment.url : `https://${deployment.url}`) : null,
        createdAt: deployment.createdAt ? new Date(deployment.createdAt).toISOString() : null,
        durationMs: buildingAt && readyAt > buildingAt ? readyAt - buildingAt : null
      };
    })
    : [];
  const latest = deployments[0] || null;
  const metrics = {
    deployments: deployments.length,
    ready: deployments.filter((deployment) => deploymentStatus(deployment.state) === "ok").length,
    failed: deployments.filter((deployment) => ["ERROR", "CANCELED"].includes(String(deployment.state || "").toUpperCase())).length,
    last_age_minutes: latest ? ageMinutes(latest.createdAt, now) : null,
    avg_duration_ms: average(deployments.map((deployment) => deployment.durationMs)),
    last_status: latest ? (latest.state || null) : null
  };
  return {
    provider,
    applies: true,
    configured: true,
    status: latest ? deploymentStatus(latest.state) : "unknown",
    detail: latest
      ? `Último deployment ${latest.state || "sin estado"}${latest.target ? ` (${latest.target})` : ""} · ${formatDate(latest.createdAt)}`
      : deploymentsResponse.error || "Vercel sin deployments recientes.",
    project: { id: projectResponse.json.id || projectId, name: projectResponse.json.name || projectId },
    services: [],
    deployments,
    environments: [],
    health: [],
    metrics,
    latencyMs: projectResponse.durationMs,
    error: deploymentsResponse.error || null,
    checkedAt: now.toISOString()
  };
}

async function supabaseStatus({ accessToken, ref, apiUrl, timeoutMs = 8000, fetchImpl = global.fetch, now = new Date() } = {}) {
  const provider = "supabase";
  if (!accessToken || !ref) {
    return unconfigured(provider, accessToken
      ? "Supabase sin ref de proyecto. Añade ENV_*_SUPABASE_REF."
      : `Supabase sin token de gestión. Añade SUPABASE_ACCESS_TOKEN en apps/control-tower/.env.local${ref ? ": la ref del proyecto ya está configurada." : " y ENV_*_SUPABASE_REF."}`);
  }
  const response = await requestJson(fetchImpl, `${apiUrl}/v1/projects/${encodeURIComponent(ref)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    timeoutMs
  });
  if (response.status === 401 || response.status === 403) return authError(provider, response);
  if (response.error) {
    return {
      ...unconfigured(provider, "Sin conexión con la API de Supabase."),
      configured: true,
      status: "degraded",
      latencyMs: response.durationMs,
      error: response.error,
      checkedAt: now.toISOString()
    };
  }
  if (!response.ok || !response.json) {
    return {
      ...unconfigured(provider, "Supabase no devolvió el proyecto solicitado."),
      configured: true,
      status: "degraded",
      latencyMs: response.durationMs,
      error: `HTTP ${response.status}`,
      checkedAt: now.toISOString()
    };
  }
  const healthResponse = await requestJson(
    fetchImpl,
    `${apiUrl}/v1/projects/${encodeURIComponent(ref)}/health?services=db,auth,storage,realtime,rest`,
    { headers: { authorization: `Bearer ${accessToken}` }, timeoutMs }
  );
  const health = parseSupabaseHealth(healthResponse.ok ? healthResponse.json : null);
  const unhealthy = health.filter((item) => !item.healthy).length;
  const statusRaw = String(response.json.status || "").toUpperCase();
  const status = unhealthy > 0 ? "degraded" : deploymentStatus(statusRaw);
  const database = response.json.database && typeof response.json.database === "object"
    ? { version: response.json.database.version || null, engine: response.json.database.postgres_engine || null }
    : null;
  const metrics = { services: health.length, healthy: health.length - unhealthy, unhealthy };
  return {
    provider,
    applies: true,
    configured: true,
    status,
    detail: `Proyecto ${response.json.name || ref}: ${statusRaw || "sin estado"}${response.json.region ? ` · ${response.json.region}` : ""} · ${health.length} servicios${unhealthy ? ` (${unhealthy} con falla)` : ""}`,
    project: { id: response.json.id || ref, name: response.json.name || ref, region: response.json.region || null, database },
    services: [],
    deployments: [],
    environments: [],
    health,
    metrics,
    latencyMs: response.durationMs,
    error: null,
    healthError: healthResponse.ok
      ? null
      : redact(`HTTP ${healthResponse.status}${healthResponse.text ? `: ${healthResponse.text}` : ""}${healthResponse.error ? `: ${healthResponse.error}` : ""}`).slice(0, 200),
    checkedAt: now.toISOString()
  };
}

function parseSupabaseHealth(json) {
  if (!json) return [];
  const list = Array.isArray(json)
    ? json
    : (typeof json === "object"
      ? Object.entries(json).map(([name, value]) => ({ name, ...(value && typeof value === "object" ? value : {}) }))
      : []);
  return list.map((item) => ({
    service: String(item.name || item.service || "servicio"),
    healthy: item.healthy !== false && !item.error,
    status: item.status || null,
    error: item.error ? redact(String(item.error)).slice(0, 160) : null
  }));
}

function formatDate(value) {
  if (!value) return "sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

const cache = new Map();

function cachedValue(key, ttlMs, now) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (ttlMs <= 0 || now.getTime() - entry.at >= ttlMs) return null;
  return entry.value;
}

function remember(key, now, value) {
  cache.set(key, { at: now.getTime(), value });
  if (cache.size > 50) {
    const oldest = Array.from(cache.entries()).sort((left, right) => left[1].at - right[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return value;
}

async function cloudForEnvironment(config, environment, { fetchImpl = global.fetch, now = new Date(), env = process.env, homeDir, fsImpl } = {}) {
  const options = { timeoutMs: config.cloud.timeoutMs, fetchImpl, now };
  const ttlMs = config.cloud.cacheMs || 0;
  const load = async (key, loader) => {
    const cached = cachedValue(key, ttlMs, now);
    if (cached) return cached;
    return remember(key, now, await loader());
  };
  // El token de Railway vive donde ya lo tiene el puesto: la variable del ambiente
  // manda y, si no hay, la torre adopta la sesion del CLI en cada sondeo. Copiar el
  // token a un segundo archivo lo envejeceria; leerlo hace que un nuevo
  // `railway login` alcance a la torre sin reiniciarla.
  const railwayToken = resolveRailwayToken(config.cloud.railway, { env, homeDir, fsImpl });
  const probe = (applies, label, card) => (applies
    ? card()
    : Promise.resolve(notApplicable(label.toLowerCase(), label)));
  const [railway, vercel, supabase] = await Promise.all([
    load(`railway:${environment.railwayProjectId || "none"}`, () => probe(
      environment.railwayProjectId,
      "Railway",
      () => railwayStatus({
        token: railwayToken.token,
        credentialSource: railwayToken.source,
        projectId: environment.railwayProjectId,
        apiUrl: config.cloud.railway.apiUrl,
        ...options
      })
    )),
    load(`vercel:${environment.vercelProjectId || "none"}`, () => probe(
      environment.vercelProjectId,
      "Vercel",
      () => vercelStatus({
        token: config.cloud.vercel.token,
        teamId: config.cloud.vercel.teamId,
        projectId: environment.vercelProjectId,
        apiUrl: config.cloud.vercel.apiUrl,
        ...options
      })
    )),
    load(`supabase:${environment.supabaseRef || "none"}`, () => probe(
      environment.supabaseRef,
      "Supabase",
      () => supabaseStatus({
        accessToken: config.cloud.supabase.accessToken,
        ref: environment.supabaseRef,
        apiUrl: config.cloud.supabase.apiUrl,
        ...options
      })
    ))
  ]);
  return { railway, vercel, supabase };
}

module.exports = {
  cloudForEnvironment,
  railwayStatus,
  vercelStatus,
  supabaseStatus,
  deploymentStatus,
  notApplicable,
  requestJson
};
