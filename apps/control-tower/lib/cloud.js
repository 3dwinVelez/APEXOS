"use strict";

const { redact } = require("./security");

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
    configured: false,
    status: "unknown",
    detail,
    project: null,
    services: [],
    deployments: [],
    environments: [],
    error: null,
    checkedAt: new Date().toISOString()
  };
}

function authError(provider, response) {
  return {
    provider,
    configured: true,
    status: "degraded",
    detail: `Token de ${provider} inválido o sin permiso (HTTP ${response.status}).`,
    project: null,
    services: [],
    deployments: [],
    environments: [],
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

async function railwayStatus({ token, projectId, apiUrl, timeoutMs = 8000, fetchImpl = global.fetch, now = new Date() } = {}) {
  const provider = "railway";
  if (!token || !projectId) {
    return unconfigured(provider, "Railway sin token o proyecto configurado. Añade RAILWAY_TOKEN y ENV_*_RAILWAY_PROJECT_ID.");
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
  return {
    provider,
    configured: true,
    status,
    detail: latest
      ? `Último deployment ${latest.status || "sin estado"} en ${latest.environment || "Railway"} · ${formatDate(latest.createdAt)}`
      : warnings.length ? `Railway respondió con advertencias: ${warnings.join("; ")}` : "Railway sin deployments recientes.",
    project: { id: project.id, name: project.name },
    services: services.slice(0, 20).map((service) => ({ id: service.id, name: service.name })),
    deployments: deployments.slice(0, 8),
    environments: environments.slice(0, 8).map((environment) => ({ id: environment.id, name: environment.name })),
    error: warnings.length ? redact(warnings.join("; ")).slice(0, 300) : null,
    checkedAt: now.toISOString()
  };
}

async function vercelStatus({ token, teamId, projectId, apiUrl, timeoutMs = 8000, fetchImpl = global.fetch, now = new Date() } = {}) {
  const provider = "vercel";
  if (!token || !projectId) {
    return unconfigured(provider, "Vercel sin token o proyecto configurado. Añade VERCEL_TOKEN y ENV_*_VERCEL_PROJECT_ID.");
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
      error: projectResponse.error,
      checkedAt: now.toISOString()
    };
  }
  if (!projectResponse.ok || !projectResponse.json) {
    return {
      ...unconfigured(provider, "Vercel no devolvió el proyecto solicitado."),
      configured: true,
      status: "degraded",
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
    ? deploymentsResponse.json.deployments.slice(0, 3).map((deployment) => ({
      id: deployment.uid || deployment.id,
      state: deployment.state,
      target: deployment.target || null,
      url: deployment.url ? (String(deployment.url).startsWith("http") ? deployment.url : `https://${deployment.url}`) : null,
      createdAt: deployment.createdAt ? new Date(deployment.createdAt).toISOString() : null
    }))
    : [];
  const latest = deployments[0] || null;
  return {
    provider,
    configured: true,
    status: latest ? deploymentStatus(latest.state) : "unknown",
    detail: latest
      ? `Último deployment ${latest.state || "sin estado"}${latest.target ? ` (${latest.target})` : ""} · ${formatDate(latest.createdAt)}`
      : deploymentsResponse.error || "Vercel sin deployments recientes.",
    project: { id: projectResponse.json.id || projectId, name: projectResponse.json.name || projectId },
    services: [],
    deployments,
    environments: [],
    error: deploymentsResponse.error || null,
    checkedAt: now.toISOString()
  };
}

async function supabaseStatus({ accessToken, ref, apiUrl, timeoutMs = 8000, fetchImpl = global.fetch, now = new Date() } = {}) {
  const provider = "supabase";
  if (!accessToken || !ref) {
    return unconfigured(provider, "Supabase sin token de gestión o ref configurada. Añade SUPABASE_ACCESS_TOKEN y ENV_*_SUPABASE_REF.");
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
      error: response.error,
      checkedAt: now.toISOString()
    };
  }
  if (!response.ok || !response.json) {
    return {
      ...unconfigured(provider, "Supabase no devolvió el proyecto solicitado."),
      configured: true,
      status: "degraded",
      error: `HTTP ${response.status}`,
      checkedAt: now.toISOString()
    };
  }
  const status = String(response.json.status || "").toUpperCase();
  return {
    provider,
    configured: true,
    status: deploymentStatus(status),
    detail: `Proyecto ${response.json.name || ref}: ${status || "sin estado"}${response.json.region ? ` · ${response.json.region}` : ""}`,
    project: { id: response.json.id || ref, name: response.json.name || ref, region: response.json.region || null },
    services: [],
    deployments: [],
    environments: [],
    error: null,
    checkedAt: now.toISOString()
  };
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

async function cloudForEnvironment(config, environment, { fetchImpl = global.fetch, now = new Date() } = {}) {
  const options = { timeoutMs: config.cloud.timeoutMs, fetchImpl, now };
  const ttlMs = config.cloud.cacheMs || 0;
  const load = async (key, loader) => {
    const cached = cachedValue(key, ttlMs, now);
    if (cached) return cached;
    return remember(key, now, await loader());
  };
  const [railway, vercel, supabase] = await Promise.all([
    load(`railway:${environment.railwayProjectId || "none"}`, () => railwayStatus({
      token: config.cloud.railway.token,
      projectId: environment.railwayProjectId,
      apiUrl: config.cloud.railway.apiUrl,
      ...options
    })),
    load(`vercel:${environment.vercelProjectId || "none"}`, () => vercelStatus({
      token: config.cloud.vercel.token,
      teamId: config.cloud.vercel.teamId,
      projectId: environment.vercelProjectId,
      apiUrl: config.cloud.vercel.apiUrl,
      ...options
    })),
    load(`supabase:${environment.supabaseRef || "none"}`, () => supabaseStatus({
      accessToken: config.cloud.supabase.accessToken,
      ref: environment.supabaseRef,
      apiUrl: config.cloud.supabase.apiUrl,
      ...options
    }))
  ]);
  return { railway, vercel, supabase };
}

module.exports = {
  cloudForEnvironment,
  railwayStatus,
  vercelStatus,
  supabaseStatus,
  deploymentStatus,
  requestJson
};
