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

  const result = await railwayStatus({ token: "railway-token", projectId: "proj-1", apiUrl: "https://railway.test/graphql", fetchImpl });
  assert.equal(result.configured, true);
  assert.equal(result.status, "ok");
  assert.equal(result.project.name, "APEXOS QA");
  assert.equal(result.services.length, 2);
  assert.equal(result.deployments.length, 2);
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
        createdAt: "2026-11-02T11:00:00.000Z"
      }]
    });
  };

  const result = await vercelStatus({ token: "vercel-token", teamId: "team-1", projectId: "prj-1", apiUrl: "https://vercel.test", fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.project.name, "apexos-web");
  assert.equal(result.deployments.length, 1);
  assert.equal(result.deployments[0].url, "https://apexos-web.vercel.app");
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

test("Supabase refleja estado del proyecto", async () => {
  const healthy = await supabaseStatus({
    accessToken: "sb-token",
    ref: "jzbwzmkidfthknsohhnr",
    apiUrl: "https://supabase.test",
    fetchImpl: async () => response(200, { id: "jzbwzmkidfthknsohhnr", name: "apexos-prod", status: "ACTIVE_HEALTHY", region: "us-east-1" })
  });
  assert.equal(healthy.status, "ok");
  assert.equal(healthy.project.name, "apexos-prod");
  assert.equal(healthy.project.region, "us-east-1");
  assert.equal(JSON.stringify(healthy).includes("sb-token"), false);

  const paused = await supabaseStatus({
    accessToken: "sb-token",
    ref: "jzbwzmkidfthknsohhnr",
    apiUrl: "https://supabase.test",
    fetchImpl: async () => response(200, { id: "ref", name: "apexos", status: "PAUSED" })
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
  assert.equal(urls.length, 5, "railway hace 2 consultas y los otros 2 proveedores una cada uno");
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
  assert.equal(urls.length, 5);
  const second = await cloudForEnvironment(config, environment, { fetchImpl, now });
  assert.equal(urls.length, 5, "dentro del TTL no se repiten las llamadas");
  assert.deepEqual(second, first);

  const later = new Date("2026-11-02T12:01:30.000Z");
  await cloudForEnvironment(config, environment, { fetchImpl, now: later });
  assert.equal(urls.length, 10, "vencido el TTL se vuelve a consultar");
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
