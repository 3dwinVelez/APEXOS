"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { recommendationsFor, tokenVar } = require("../lib/recommendations");

function environment(overrides = {}) {
  return {
    id: "develop",
    short: "QA",
    enabled: true,
    apiBaseUrl: "https://api.test",
    deployed: { commit: "a505e97f9622", modules: 18, version: "2.0" },
    health: { band: "unknown", score: null },
    modules: null,
    activity: null,
    cloud: null,
    ...overrides
  };
}

test("el build sin modulo manda la accion de desplegar, no pedir token", () => {
  const items = recommendationsFor(environment({
    modules: { reason: "MODULO_NO_DESPLEGADO", modules: [] },
    activity: { reason: "MODULO_NO_DESPLEGADO" }
  }));
  assert.equal(items.length, 1);
  assert.equal(items[0].code, "MODULO_NO_DESPLEGADO");
  assert.equal(items[0].priority, "alta");
  assert.match(items[0].title, /QA/);
  assert.match(items[0].action, /a505e97/);
  assert.match(items[0].action, /despliegue/i);
  assert.match(items[0].owner, /git-guardian/);
});

test("falta de token nombra la variable exacta del ambiente", () => {
  const items = recommendationsFor(environment({
    modules: { reason: "SIN_TOKEN", modules: [] },
    activity: { reason: "SIN_TOKEN" }
  }));
  assert.equal(items.length, 1, "no duplica el motivo entre modulos y actividad");
  assert.equal(items[0].code, "SIN_TOKEN");
  assert.equal(items[0].priority, "alta");
  assert.match(items[0].title, new RegExp(tokenVar(environment())));
  assert.match(items[0].command, /\.env\.local/);
  assert.match(items[0].owner, /seguridad/);
});

test("token invalido, sin conexion y cross-tenant tienen acciones distintas", () => {
  const invalid = recommendationsFor(environment({ modules: { reason: "TOKEN_INVALIDO" } }));
  assert.match(invalid[0].action, /JWT/);
  const offline = recommendationsFor(environment({ modules: { reason: "SIN_CONEXION" } }));
  assert.equal(offline[0].code, "SIN_CONEXION");
  assert.match(offline[0].command, /https:\/\/api\.test\/health/);
  const restricted = recommendationsFor(environment({ activity: { reason: "CROSS_TENANT_DESHABILITADO" } }));
  assert.equal(restricted[0].code, "CROSS_TENANT_DESHABILITADO");
  assert.match(restricted[0].action, /APEX_CONTROL_CROSS_TENANT/);
});

test("un 404 generico se traduce al mismo bloqueo de build", () => {
  const items = recommendationsFor(environment({ modules: { reason: "NO_DISPONIBLE" } }));
  assert.equal(items[0].code, "MODULO_NO_DESPLEGADO");

  const porEmpresas = recommendationsFor(environment({
    modules: { reason: null, modules: [] },
    activity: { reason: "NO_DISPONIBLE", tenantsReason: "NO_DISPONIBLE" }
  }));
  assert.equal(porEmpresas[0].code, "MODULO_NO_DESPLEGADO", "la lectura por empresa bloqueada por build usa la misma accion");
  assert.match(porEmpresas[0].owner, /git-guardian|equipo-apexos/);
});

test("la vista por empresa bloqueada tiene su propia accion", () => {
  const noHabilitado = recommendationsFor(environment({ activity: { tenantsReason: "MODULO_NO_HABILITADO" } }));
  assert.equal(noHabilitado[0].code, "MODULO_NO_HABILITADO");
  assert.match(noHabilitado[0].action, /habilita/i);

  const fueraDeAlcance = recommendationsFor(environment({ activity: { tenantsReason: "EMPRESA_FUERA_DE_ALCANCE" } }));
  assert.equal(fueraDeAlcance[0].code, "EMPRESA_FUERA_DE_ALCANCE");
  assert.match(fueraDeAlcance[0].command, /APEX_CONTROL_CROSS_TENANT_TENANTS/);

  const empresaPerdida = recommendationsFor(environment({ activity: { reason: "EMPRESA_NO_ENCONTRADA" } }));
  assert.equal(empresaPerdida[0].code, "EMPRESA_NO_ENCONTRADA");
  assert.equal(empresaPerdida[0].priority, "baja");
});

test("el motivo de empresas se lee aunque la actividad general este sana", () => {
  const items = recommendationsFor(environment({
    modules: { reason: null, modules: [] },
    activity: { reason: null, tenantsReason: "CROSS_TENANT_DESHABILITADO" }
  }));
  assert.deepEqual(items.map((item) => item.code), ["CROSS_TENANT_DESHABILITADO"]);
});

test("la credencial vencida es la causa: reemplaza la accion generica de token", () => {
  const items = recommendationsFor(environment({
    modules: { reason: "TOKEN_INVALIDO" },
    credential: { status: "TOKEN_VENCIDO", reason: "El JWT fijo vencio y no hay token de renovacion." }
  }));
  assert.deepEqual(items.map((item) => item.code), ["CREDENCIAL_VENCIDA"], "no duplica el hallazgo con la accion de token");
  assert.equal(items[0].priority, "alta");
  assert.match(items[0].command, /npm run control:credential -- --environment develop/);
  assert.match(items[0].action, /ENV_DEVELOP_APEX_REFRESH/);
});

test("el ambiente sin credencial y el refresh revocado nombran su emision", () => {
  const ausente = recommendationsFor(environment({ credential: { status: "SIN_CREDENCIAL" } }));
  assert.equal(ausente[0].code, "CREDENCIAL_AUSENTE");
  assert.match(ausente[0].action, /sin dato/);

  const revocada = recommendationsFor(environment({ credential: { status: "REVOCADA" } }));
  assert.equal(revocada[0].code, "CREDENCIAL_REVOCADA");
  assert.match(revocada[0].title, /renovaci/i);

  const viva = recommendationsFor(environment({ credential: { status: "VIGENTE", mode: "renovacion" } }));
  assert.deepEqual(viva, [], "una credencial viva no es un hallazgo");
});

test("simulacion no inventa acciones", () => {
  assert.deepEqual(recommendationsFor(environment({
    modules: { reason: "SIMULACION", modules: [] },
    activity: { reason: "SIMULACION" }
  })), []);
});

test("credenciales cloud ausentes se reportan como punto ciego medible", () => {
  const items = recommendationsFor(environment({
    modules: { reason: null, modules: [{ key: "hr", name: "Talento Humano", status: "ok" }] },
    cloud: {
      railway: { configured: true, status: "ok" },
      vercel: { configured: false, status: "unknown" },
      supabase: { configured: true, status: "down", error: "401 Not Authorized" }
    }
  }));
  const codes = items.map((item) => item.code).sort();
  assert.deepEqual(codes, ["CLOUD_ERROR", "CLOUD_SIN_TOKEN"]);
  assert.ok(items.some((item) => /VERCEL_TOKEN/.test(item.title)));
  assert.ok(items.some((item) => /Not Authorized/.test(item.action)));
});

test("modulos caidos y degradados entran por severidad con su dueno", () => {
  const modules = [
    { key: "nomina", name: "Nómina", status: "degraded", detail: "1 servicio degradado" },
    { key: "servicios", name: "Servicios", status: "down", detail: "API de Servicios sin respuesta" },
    { key: "hr", name: "Talento Humano", status: "ok" }
  ];
  const items = recommendationsFor(environment({ modules: { reason: null, modules } }));
  assert.deepEqual(items.map((item) => item.priority), ["alta", "media"]);
  assert.equal(items[0].code, "MODULO_CAIDO");
  assert.match(items[0].owner, /backend/);
  assert.equal(items[1].code, "MODULO_ATENCION");
  assert.match(items[1].owner, /performance/);
});

test("el listado de modulo caido se limita a cinco acciones", () => {
  const modules = Array.from({ length: 8 }, (_value, index) => ({
    key: `m${index}`,
    name: `M${index}`,
    status: "down",
    detail: "sin respuesta"
  }));
  const items = recommendationsFor(environment({ modules: { reason: null, modules } }));
  assert.equal(items.length, 5);
});

test("rendimiento fuera de presupuesto genera accion de performance", () => {
  const soft = recommendationsFor(environment({ modules: { reason: null, modules: [] } }), { performance: { p95: 420, errorRate: 0 } });
  assert.equal(soft.length, 0);
  const hard = recommendationsFor(environment({ modules: { reason: null, modules: [] } }), { performance: { p95: 1800, errorRate: 8 } });
  assert.equal(hard[0].code, "RENDIMIENTO");
  assert.equal(hard[0].priority, "alta");
  assert.match(hard[0].action, /1800 ms/);
});

test("un puntaje en riesgo sin otra causa deja una accion general", () => {
  const items = recommendationsFor(environment({ health: { band: "risk", score: 72 }, modules: { reason: null, modules: [] } }));
  assert.equal(items.length, 1);
  assert.equal(items[0].code, "SALUD");
  assert.match(items[0].title, /72\/100/);
});

test("ambiente desactivado u optimo no produce acciones", () => {
  assert.deepEqual(recommendationsFor(environment({ enabled: false })), []);
  assert.deepEqual(recommendationsFor(environment({
    health: { band: "optimal", score: 92 },
    modules: { reason: null, modules: [{ key: "hr", name: "Talento Humano", status: "ok" }] }
  })), []);
});
