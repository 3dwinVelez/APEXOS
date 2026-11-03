"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { cloudForEnvironment, railwayStatus, vercelStatus, supabaseStatus, deploymentStatus } = require("../lib/cloud");

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  };
}

test("deploymentStatus traduce estados de los proveedores", () => {
  for (const state of ["SUCCESS", "READY", "ACTIVE_HEALTHY", "active_healthy"]) assert.equal(deploymentStatus(state), "ok");
  for (const state of ["FAILED", "CRASHED", "REMOVED", "ERROR", "CANCELED", "INACTIVE", "PAUSED", "ACTIVE_UNHEALTHY"]) assert.equal(deploymentStatus(state), "degraded");
  for (const state of ["BUILDING", "DEPLOYING", "QUEUED"]) assert.equal(deploymentStatus(state), "degraded");
  assert.equal(deploymentStatus("algo-raro"), "unknown");
});

test("Railway sin token informa configuracion pendiente sin llamar red", async () => {
  let called = false;
  const result = await railwayStatus({ token: "", projectId: "p", fetchImpl: async () => { called = true; return response(200, {}); } });
  assert.equal(called, false);
  assert.equal(result.configured, false);
  assert.equal(result.status, "unknown");
  assert.match(result.detail, /RAILWAY_TOKEN/);
});

test("Railway consulta proyecto, servicios y deployments con su token", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const body = JSON.parse(options.body);
    if (body.query.includes("Project")) {
      return response(200, {
        data: {
          project: {
            id: "proj-1",
            name: "APEXOS QA",
            services: { edges: [{ node: { id: "svc-1", name: "api" } }, { node: { id: "svc-2", name: "web" } }] },
            environments: { edges: [{ node: { id: "env-1", name: "production" } }] }
          }
        }
      });
    }
    if (body.query.includes("Deployments")) {
      return response(200, {
        data: {
          deployments: {
            edges: [
              { node: { id: "dep-2", status: "SUCCESS", createdAt: "2026-11-02T11:00:00.000Z" } },
              { node: { id: "dep-1", status: "FAILED", createdAt: "2026-11-01T11:00:00.000Z" } }
            ]
          }
        }
      });
    }
    return response(400, { errors: [{ message: "query inesperada" }] });
  };

  const result = await railwayStatus({
    token: "railway-token",
    projectId: "proj-1",
    apiUrl: "https://railway.test/graphql",
    fetchImpl,
    now: new Date("2026-11-02T12:00:00.000Z")
  });
  assert.equal(result.configured, true);
  assert.equal(result.status, "ok");
  assert.equal(result.project.name, "APEXOS QA");
  assert.equal(result.services.length, 2);
  assert.equal(result.deployments.length, 2);
  assert.deepEqual(result.metrics, {
    services: 2,
    environments: 1,
    deployments: 2,
    failed: 1,
    last_age_minutes: 60,
    last_status: "SUCCESS"
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.authorization, "Bearer railway-token");
  assert.equal(calls[0].options.headers["project-access-token"], "railway-token");
  assert.equal(JSON.stringify(result).includes("railway-token"), false, "no filtra el token");
});

test("Railway con token invalido queda degradado", async () => {
  const result = await railwayStatus({
    token: "railway-token",
    projectId: "proj-1",
    apiUrl: "https://railway.test/graphql",
    fetchImpl: async () => response(401, "unauthorized")
  });
  assert.equal(result.configured, true);
  assert.equal(result.status, "degraded");
  assert.match(result.detail, /HTTP 401/);
  assert.equal(result.project, null);
  assert.equal(JSON.stringify(result).includes("railway-token"), false);
});

test("Vercel consulta proyecto y deployments con teamId", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes("/v9/projects/")) {
      return response(200, { id: "prj-1", name: "apexos-web" });
    }
    return response(200, {
      deployments: [{
        uid: "dep-1",
        state: "READY",
        target: "production",
        url: "apexos-web.vercel.app",
        createdAt: "2026-11-02T11:55:00.000Z",
        buildingAt: Date.parse("2026-11-02T11:55:00.000Z"),
        ready: Date.parse("2026-11-02T11:56:35.000Z")
      }]
    });
  };

  const result = await vercelStatus({
    token: "vercel-token",
    teamId: "team-1",
    projectId: "prj-1",
    apiUrl: "https://vercel.test",
    fetchImpl,
    now: new Date("2026-11-02T12:00:00.000Z")
  });
  assert.equal(result.status, "ok");
  assert.equal(result.project.name, "apexos-web");
  assert.equal(result.deployments.length, 1);
  assert.equal(result.deployments[0].url, "https://apexos-web.vercel.app");
  assert.equal(result.deployments[0].durationMs, 95000);
  assert.deepEqual(result.metrics, {
    deployments: 1,
    ready: 1,
    failed: 0,
    last_age_minutes: 5,
    avg_duration_ms: 95000,
    last_status: "READY"
  });
  assert.match(urls[0], /teamId=team-1/);
  assert.match(urls[1], /projectId=prj-1/);
  assert.match(urls[1], /limit=3/);
  assert.equal(JSON.stringify(result).includes("vercel-token"), false);
});

test("Vercel sin credenciales y con error de token", async () => {
  const unconfigured = await vercelStatus({ token: "", projectId: "prj-1", apiUrl: "https://vercel.test", fetchImpl: async () => response(200, {}) });
  assert.equal(unconfigured.configured, false);
  assert.match(unconfigured.detail, /VERCEL_TOKEN/);

  const denied = await vercelStatus({
    token: "vercel-token",
    projectId: "prj-1",
    apiUrl: "https://vercel.test",
    fetchImpl: async () => response(403, "forbidden")
  });
  assert.equal(denied.configured, true);
  assert.equal(denied.status, "degraded");
  assert.match(denied.detail, /HTTP 403/);
});

function supabaseStub(project, health, { healthStatus = 200 } = {}) {
  return async (url) => {
    if (url.includes("/health")) return response(healthStatus, healthStatus === 200 ? health : "health down");
    return response(200, project);
  };
}

test("Supabase refleja estado del proyecto", async () => {
  const healthy = await supabaseStatus({
    accessToken: "sb-token",
    ref: "jzbwzmkidfthknsohhnr",
    apiUrl: "https://supabase.test",
    fetchImpl: supabaseStub(
      { id: "jzbwzmkidfthknsohhnr", name: "apexos-prod", status: "ACTIVE_HEALTHY", region: "us-east-1", database: { version: "15.1", postgres_engine: "15" } },
      [{ name: "db", healthy: true }, { name: "rest", healthy: true }]
    )
  });
  assert.equal(healthy.status, "ok");
  assert.equal(healthy.project.name, "apexos-prod");
  assert.equal(healthy.project.region, "us-east-1");
  assert.equal(healthy.project.database.version, "15.1");
  assert.equal(healthy.health.length, 2);
  assert.deepEqual(healthy.metrics, { services: 2, healthy: 2, unhealthy: 0 });
  assert.equal(JSON.stringify(healthy).includes("sb-token"), false);

  const paused = await supabaseStatus({
    accessToken: "sb-token",
    ref: "jzbwzmkidfthknsohhnr",
    apiUrl: "https://supabase.test",
    fetchImpl: supabaseStub({ id: "ref", name: "apexos", status: "PAUSED" }, [])
  });
  assert.equal(paused.status, "degraded");

  const denied = await supabaseStatus({
    accessToken: "sb-token",
    ref: "jzbwzmkidfthknsohhnr",
    apiUrl: "https://supabase.test",
    fetchImpl: async () => response(401, "unauthorized")
  });
  assert.equal(denied.configured, true);
  assert.equal(denied.status, "degraded");
  assert.match(denied.detail, /HTTP 401/);
});

test("Supabase degrada si alguno de sus servicios internos falla", async () => {
  const result = await supabaseStatus({
    accessToken: "sb-token",
    ref: "ref",
    apiUrl: "https://supabase.test",
    fetchImpl: supabaseStub(
      { id: "ref", name: "apexos", status: "ACTIVE_HEALTHY" },
      { db: { healthy: true }, auth: { healthy: false, error: "connection refused" }, storage: { healthy: true } }
    )
  });
  assert.equal(result.status, "degraded");
  assert.equal(result.metrics.services, 3);
  assert.equal(result.metrics.unhealthy, 1);
  const failing = result.health.find((item) => !item.healthy);
  assert.equal(failing.service, "auth");
  assert.match(failing.error, /connection refused/);
});

test("Supabase conserva el proyecto si la sonda de salud falla", async () => {
  const result = await supabaseStatus({
    accessToken: "sb-token",
    ref: "ref",
    apiUrl: "https://supabase.test",
    fetchImpl: supabaseStub({ id: "ref", name: "apexos", status: "ACTIVE_HEALTHY" }, "boom", { healthStatus: 500 })
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.health, []);
  assert.match(result.healthError, /HTTP 500/);
});

test("cloudForEnvironment consulta los tres proveedores del ambiente", async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push({ url, options });
    if (url.includes("/graphql")) {
      const body = JSON.parse(options.body);
      if (body.query.includes("Project")) {
        return response(200, { data: { project: { id: "p", name: "qa", services: { edges: [] }, environments: { edges: [{ node: { id: "e", name: "prod" } }] } } } });
      }
      return response(200, { data: { deployments: { edges: [{ node: { id: "d", status: "SUCCESS", createdAt: "2026-11-02T11:00:00.000Z" } }] } } });
    }
    if (url.includes("/v9/projects/")) return response(200, { id: "prj", name: "qa-web" });
    if (url.includes("/v6/deployments")) return response(200, { deployments: [{ uid: "d", state: "READY", createdAt: "2026-11-02T11:00:00.000Z" }] });
    if (url.includes("/health")) return response(200, [{ name: "db", healthy: true }, { name: "auth", healthy: true }]);
    if (url.includes("/v1/projects/")) return response(200, { id: "ref", name: "qa-db", status: "ACTIVE_HEALTHY" });
    return response(404, "no encontrado");
  };

  const config = {
    cloud: {
      timeoutMs: 2000,
      railway: { token: "railway-token", apiUrl: "https://railway.test/graphql" },
      vercel: { token: "vercel-token", teamId: "team", apiUrl: "https://vercel.test" },
      supabase: { accessToken: "sb-token", apiUrl: "https://supabase.test" }
    }
  };
  const environment = {
    id: "develop",
    railwayProjectId: "proj-railway",
    vercelProjectId: "prj-vercel",
    supabaseRef: "ref-supabase"
  };

  const cloud = await cloudForEnvironment(config, environment, { fetchImpl });
  assert.equal(cloud.railway.status, "ok");
  assert.equal(cloud.vercel.status, "ok");
  assert.equal(cloud.supabase.status, "ok");
  assert.equal(cloud.railway.metrics.services, 0);
  assert.equal(cloud.vercel.metrics.deployments, 1);
  assert.deepEqual(cloud.supabase.metrics, { services: 2, healthy: 2, unhealthy: 0 });
  assert.equal(urls.length, 6, "railway hace 2 consultas; vercel 2; supabase proyecto + salud");
});

test("cloudForEnvironment reutiliza la consulta durante CLOUD_CACHE_MS", async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    if (url.includes("/graphql")) {
      const isProject = JSON.parse(options.body).query.includes("Project");
      return response(200, isProject
        ? { data: { project: { id: "cache", name: "cache", services: { edges: [] }, environments: { edges: [{ node: { id: "env", name: "production" } }] } } } }
        : { data: { deployments: { edges: [] } } });
    }
    if (url.includes("/v9/projects/")) return response(200, { id: "cache", name: "cache-web" });
    if (url.includes("/v6/deployments")) return response(200, { deployments: [] });
    if (url.includes("/health")) return response(200, [{ name: "db", healthy: true }]);
    if (url.includes("/v1/projects/")) return response(200, { id: "cache", name: "cache-db", status: "ACTIVE_HEALTHY" });
    return response(404, "no encontrado");
  };
  const config = {
    cloud: {
      timeoutMs: 2000,
      cacheMs: 60000,
      railway: { token: "railway-token", apiUrl: "https://railway.test/graphql" },
      vercel: { token: "vercel-token", teamId: "team", apiUrl: "https://vercel.test" },
      supabase: { accessToken: "sb-token", apiUrl: "https://supabase.test" }
    }
  };
  const environment = {
    id: "main",
    railwayProjectId: "cache-railway",
    vercelProjectId: "cache-vercel",
    supabaseRef: "cache-supabase"
  };
  const now = new Date("2026-11-02T12:00:00.000Z");

  const first = await cloudForEnvironment(config, environment, { fetchImpl, now });
  assert.equal(urls.length, 6);
  const second = await cloudForEnvironment(config, environment, { fetchImpl, now });
  assert.equal(urls.length, 6, "dentro del TTL no se repiten las llamadas");
  assert.deepEqual(second, first);

  const later = new Date("2026-11-02T12:01:30.000Z");
  await cloudForEnvironment(config, environment, { fetchImpl, now: later });
  assert.equal(urls.length, 12, "vencido el TTL se vuelve a consultar");
});

test("cloudForEnvironment sin credenciales no hace red", async () => {
  let called = false;
  const config = {
    cloud: {
      timeoutMs: 2000,
      railway: { token: "", apiUrl: "https://railway.test/graphql" },
      vercel: { token: "", apiUrl: "https://vercel.test" },
      supabase: { accessToken: "", apiUrl: "https://supabase.test" }
    }
  };
  const cloud = await cloudForEnvironment(
    config,
    { id: "main", railwayProjectId: "", vercelProjectId: "", supabaseRef: "" },
    { fetchImpl: async () => { called = true; return response(200, {}); } }
  );
  assert.equal(called, false);
  assert.equal(cloud.railway.configured, false);
  assert.equal(cloud.vercel.configured, false);
  assert.equal(cloud.supabase.configured, false);
});
