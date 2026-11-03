"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchModules, enrichWithChecks, moduleChecks, checkIdFor, MODULE_CATALOG } = require("../lib/modules");

const BASE = { environmentTimeoutMs: 1500, simulation: false };

const environment = (extra = {}) => ({ id: "local", short: "LOCAL", apiBaseUrl: "http://api.test", apexToken: "jwt-demo", ...extra });

test("sin token la torre cae al catalogo y no inventa salud de datos", async () => {
  let probe = null;
  const payload = await fetchModules(BASE, environment({ apexToken: "" }), {
    httpRequest: async (url, options) => {
      probe = { url, options };
      return { ok: false, status: 401, json: null, error: null };
    }
  });
  assert.ok(probe, "sin token se sondea la ruta para distinguir 401 de 404");
  assert.equal(probe.options.headers.authorization, undefined, "la sonda no lleva credencial inventada");
  assert.equal(payload.source, "catalog");
  assert.equal(payload.configured, false);
  assert.equal(payload.reason, "SIN_TOKEN");
  assert.equal(payload.modules.length, MODULE_CATALOG.length);
  assert.equal(payload.summary.unknown, MODULE_CATALOG.length);
  assert.equal(payload.modules.every((module) => module.status === "unknown"), true);
  assert.ok(payload.modules[0].services.every((service) => service.status === "unknown"));
});

test("simulacion, 401, 404 y sin conexion caen al catalogo con su razon", async () => {
  const simulated = await fetchModules({ ...BASE, simulation: true }, environment());
  assert.equal(simulated.reason, "SIMULACION");

  const denied = await fetchModules(BASE, environment(), { httpRequest: async () => ({ ok: false, status: 401, json: null, error: null }) });
  assert.equal(denied.reason, "TOKEN_INVALIDO");

  const missing = await fetchModules(BASE, environment(), { httpRequest: async () => ({ ok: false, status: 404, json: null, error: null }) });
  assert.equal(missing.reason, "MODULO_NO_DESPLEGADO", "un 404 sin codigo significa que el build no trae el modulo");

  const offline = await fetchModules(BASE, environment(), { httpRequest: async () => ({ ok: false, status: 0, json: null, error: "ECONNREFUSED" }) });
  assert.equal(offline.reason, "SIN_CONEXION");

  const remoteWithoutToken = await fetchModules(
    { ...BASE, apexToken: "token-local" },
    { id: "develop", short: "DEV", apiBaseUrl: "https://api.test", apexToken: "" },
    { httpRequest: async () => ({ ok: false, status: 401, json: null, error: null }) }
  );
  assert.equal(remoteWithoutToken.reason, "SIN_TOKEN", "el token local no se envia a ambientes remotos");

  const remoteNotDeployed = await fetchModules(
    { ...BASE, apexToken: "token-local" },
    { id: "main", short: "PROD", apiBaseUrl: "https://api.test", apexToken: "" },
    { httpRequest: async () => ({ ok: false, status: 404, json: null, error: null }) }
  );
  assert.equal(remoteNotDeployed.reason, "MODULO_NO_DESPLEGADO", "sin token, un 404 acusa build anterior y no falta de credencial");
});

test("con token usa la API y consulta con el JWT del ambiente", async () => {
  let received = null;
  const httpRequest = async (url, options) => {
    received = { url, options };
    return {
      ok: true,
      status: 200,
      error: null,
      json: {
        generated_at: "2026-11-03T10:00:00.000Z",
        scope: "tenant",
        summary: { total: 2, ok: 1, degraded: 1, down: 0, unknown: 0 },
        modules: [
          { key: "inventario", name: "Inventario", group: "Operacion", status: "ok", declared: true, data: { records: 42, last_activity_at: "2026-11-03T09:40:00.000Z" }, services: [{ key: "db", label: "PostgreSQL", status: "ok" }], alerts: [] },
          { key: "transporte", name: "Transporte", group: "Operacion", status: "degraded", declared: null, detail: "Datos viejos" },
          { key: "calidad", name: "Calidad", status: "explosivo" },
          { key: "", name: "sin clave" }
        ]
      }
    };
  };
  const payload = await fetchModules(BASE, environment({ id: "develop", short: "DEV" }), { httpRequest });
  assert.equal(received.url, "http://api.test/api/v1/apex-control/modules");
  assert.equal(received.options.headers.authorization, "Bearer jwt-demo");
  assert.equal(payload.source, "api");
  assert.equal(payload.configured, true);
  assert.equal(payload.modules.length, 3, "descarta modulos sin clave");
  assert.equal(payload.modules[0].status, "ok");
  assert.equal(payload.modules[1].declared, true);
  assert.equal(payload.modules[2].status, "unknown", "un estado desconocido no se propaga");
  assert.ok(payload.checkedAt);
  const enriched = enrichWithChecks(payload, [], "develop");
  assert.equal(enriched.summary.records, 42, "el enriquecido conserva el total de registros de la API");
});

test("la salud de una empresa usa la ruta acotada y conserva su identidad", async () => {
  const calls = [];
  const httpRequest = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      error: null,
      json: {
        generated_at: "2026-11-03T10:00:00.000Z",
        scope: "tenant",
        tenant: { id: "tenant-a", name: "Empresa A", plan: "pro", active: true },
        summary: { total: 1, ok: 1, degraded: 0, down: 0, unknown: 0 },
        modules: [{ key: "inventario", name: "Inventario", status: "ok", declared: true, data: { records: 3 } }]
      }
    };
  };
  const payload = await fetchModules(BASE, environment({ id: "develop", short: "QA" }), { httpRequest, tenantId: "tenant-a" });
  assert.equal(calls[0].url, "http://api.test/api/v1/apex-control/tenants/tenant-a/modules");
  assert.equal(calls[0].options.headers.authorization, "Bearer jwt-demo");
  assert.equal(payload.source, "api");
  assert.equal(payload.tenant.name, "Empresa A");

  const invalid = await fetchModules(BASE, environment(), { httpRequest, tenantId: "../etc" });
  assert.equal(invalid.reason, "EMPRESA_ID_INVALIDO");
  assert.equal(calls.length, 1, "un id invalido no llega a la red");
});

test("los rechazos entre empresas conservan su codigo y no fingen salud", async () => {
  const denied = await fetchModules(BASE, environment(), {
    tenantId: "tenant-a",
    httpRequest: async () => ({ ok: false, status: 403, json: { code: "CROSS_TENANT_DESHABILITADO" } })
  });
  assert.equal(denied.reason, "CROSS_TENANT_DESHABILITADO");
  assert.equal(denied.modules.every((module) => module.status === "unknown"), true);

  const outside = await fetchModules(BASE, environment(), {
    tenantId: "tenant-a",
    httpRequest: async () => ({ ok: false, status: 403, json: { code: "EMPRESA_FUERA_DE_ALCANCE" } })
  });
  assert.equal(outside.reason, "EMPRESA_FUERA_DE_ALCANCE");

  const missing = await fetchModules(BASE, environment(), {
    tenantId: "tenant-a",
    httpRequest: async () => ({ ok: false, status: 404, json: { code: "EMPRESA_NO_ENCONTRADA" } })
  });
  assert.equal(missing.reason, "EMPRESA_NO_ENCONTRADA");
});

test("el catalogo hereda el estado de los servicios y nunca declara salud propia", async () => {
  const payload = await fetchModules(BASE, environment({ apexToken: "" }), {
    httpRequest: async () => ({ ok: false, status: 401, json: null, error: null })
  });
  const checks = [
    { id: "db", status: "down" },
    { id: "queues", status: "ok" }
  ];
  const enriched = enrichWithChecks(payload, checks, "local");
  const inventario = enriched.modules.find((module) => module.key === "inventario");
  assert.equal(inventario.status, "down");
  assert.equal(inventario.services.find((service) => service.key === "db").status, "down");
  assert.equal(enriched.summary.down, MODULE_CATALOG.length, "todos los modulos dependen de la base");

  const healthy = enrichWithChecks(payload, [{ id: "db", status: "ok" }, { id: "queues", status: "ok" }], "local");
  assert.equal(healthy.modules.find((module) => module.key === "inventario").status, "unknown", "sin API no se afirma que el modulo este sano");
  assert.equal(healthy.summary.unknown, MODULE_CATALOG.length);
});

test("en ambientes remotos los servicios se leen con prefijo de ambiente", async () => {
  assert.equal(checkIdFor("local", "db"), "db");
  assert.equal(checkIdFor("develop", "db"), "develop.db");

  const payload = await fetchModules(BASE, environment({ apexToken: "" }), {
    httpRequest: async () => ({ ok: false, status: 401, json: null, error: null })
  });
  const enriched = enrichWithChecks(payload, [{ id: "main.db", status: "degraded" }, { id: "main.queues", status: "ok" }], "main");
  assert.equal(enriched.modules.find((module) => module.key === "inventario").status, "degraded");
});

test("los chequeos por modulo son informativos y solo el resumen puntua", async () => {
  const payload = await fetchModules(BASE, environment({ apexToken: "" }), {
    httpRequest: async () => ({ ok: false, status: 401, json: null, error: null })
  });
  const enriched = enrichWithChecks(payload, [{ id: "db", status: "down" }, { id: "queues", status: "ok" }], "local");
  const checks = moduleChecks(enriched, { id: "local", short: "LOCAL" });
  const perModule = checks.filter((check) => check.id.startsWith("local.module."));
  const summary = checks.find((check) => check.id === "local.modules");

  assert.equal(perModule.length, MODULE_CATALOG.length);
  assert.equal(perModule.every((check) => check.informational === true && check.optional === true), true);
  assert.equal(perModule.every((check) => check.source === "modules"), true);
  assert.ok(perModule.find((check) => check.moduleKey === "inventario" && check.status === "down"));
  assert.equal(summary.informational, undefined);
  assert.equal(summary.optional, true, "sin datos de API el resumen no puntua el ambiente");
  assert.equal(summary.status, "degraded");
  assert.match(summary.detail, /dependencia caida/);

  const noToken = await fetchModules(BASE, environment({ apexToken: "" }), {
    httpRequest: async () => ({ ok: false, status: 401, json: null, error: null })
  });
  const catalogChecks = moduleChecks(enrichWithChecks(noToken, [], "local"), { id: "local", short: "LOCAL" });
  const catalogSummary = catalogChecks.find((check) => check.id === "local.modules");
  assert.equal(catalogSummary.status, "unknown");
  assert.equal(catalogSummary.optional, true);
});

test("con datos de API el resumen se degrada si hay modulos caidos o degradados", async () => {
  const payload = await fetchModules(BASE, environment(), {
    httpRequest: async () => ({
      ok: true,
      status: 200,
      error: null,
      json: {
        generated_at: "2026-11-03T10:00:00.000Z",
        summary: { total: 3, ok: 1, degraded: 1, down: 1, unknown: 0 },
        modules: [
          { key: "ventas", name: "Ventas", status: "ok" },
          { key: "compras", name: "Compras", status: "degraded" },
          { key: "transporte", name: "Transporte", status: "down" }
        ]
      }
    })
  });
  const checks = moduleChecks(payload, { id: "develop", short: "DEV" });
  const summary = checks.find((check) => check.id === "develop.modules");
  assert.equal(summary.status, "degraded");
  assert.equal(summary.optional, false, "con datos de API el resumen si puntua");
  assert.match(summary.detail, /1\/3 modulos en objetivo/);
  assert.doesNotMatch(summary.detail, /degrad/, "el detalle no usa jerga tecnica sin explicar");
  assert.equal(summary.technical.source, "api");
  assert.equal(summary.technical.configured, true);
});
