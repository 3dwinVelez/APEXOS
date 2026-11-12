"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCredentialPump, decodeExpiry } = require("../lib/credential");

// Un JWT de prueba con el claim exp que la torre lee para programar la renovacion.
// La firma no importa: aqui se prueba la agenda, no la validacion criptografica.
function jwt(minutesFromNow, extra = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = { exp: nowSeconds + Math.round(minutesFromNow * 60), ...extra };
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.firma`;
}

function fakeStore(persisted = {}) {
  const files = { credential: persisted };
  return {
    files,
    readAux: (name, fallback) => (name in files ? files[name] : fallback),
    writeAux: (name, value) => {
      files[name] = value;
      return true;
    }
  };
}

function towerConfig(overrides = {}) {
  return {
    simulation: false,
    credentials: { marginMs: 600000, retryMs: 60000, deniedRetryMs: 300000, timeoutMs: 1000 },
    environments: {
      local: { id: "local", enabled: true, apiBaseUrl: "http://127.0.0.1:3000", apexToken: "", apexRefresh: "" },
      develop: { id: "develop", enabled: true, apiBaseUrl: "https://api.qa.test", apexToken: "", apexRefresh: "" },
      main: { id: "main", enabled: false, apiBaseUrl: "https://api.prod.test", apexToken: "", apexRefresh: "" }
    },
    ...overrides
  };
}

function fetchReturning(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return { calls, fetchImpl };
}

const okRefresh = (tokenMinutes, rotatedRefresh) => async () => ({
  status: 200,
  ok: true,
  text: async () => JSON.stringify({ token: jwt(tokenMinutes), refresh: rotatedRefresh })
});

test("el JWT vigente que llega en la configuracion no se rota en el arranque", async () => {
  const config = towerConfig();
  const accessToken = jwt(420);
  config.environments.local.apexToken = accessToken;
  config.environments.local.apexRefresh = "refresh-semilla";
  const store = fakeStore();
  const { calls, fetchImpl } = fetchReturning(okRefresh(480, "refresh-rotado"));
  const pump = createCredentialPump({ config, store, fetchImpl });

  await pump.ensure();

  assert.equal(calls.length, 0, "arrancar la torre no debe fabricar una sesion nueva en el puesto");
  assert.equal(pump.statusFor("local").status, "VIGENTE");
  assert.ok(pump.statusFor("local").expiresAt, "la expiracion se lee del propio JWT");
});

test("renueva la credencial del ambiente antes de que venza y la deja viva", async () => {
  const config = towerConfig();
  config.environments.local.apexRefresh = "refresh-semilla";
  const store = fakeStore();
  const { calls, fetchImpl } = fetchReturning(okRefresh(480, "refresh-rotado"));
  const pump = createCredentialPump({ config, store, fetchImpl });

  await pump.ensure();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3000/api/v1/auth/refresh");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { refresh: "refresh-semilla" });
  assert.equal(decodeExpiry(config.environments.local.apexToken) != null, true);
  assert.equal(pump.statusFor("local").status, "RENOVADA");
  assert.equal(pump.statusFor("local").mode, "renovacion");

  // El par rotado se persiste en el dataDir de la torre, no en el archivo del dueño.
  assert.equal(store.files.credential.local.refreshToken, "refresh-rotado");
  assert.equal(config.environments.local.apexRefresh, "refresh-semilla", "no reescribe la configuracion del dueño");
});

test("no vuelve a renovar mientras la credencial persistida tiene margen", async () => {
  const accessToken = jwt(480);
  const config = towerConfig();
  const store = fakeStore({ local: { refreshToken: "refresh-vivo", accessToken, expiresAt: new Date(Date.now() + 7 * 3600 * 1000).toISOString() } });
  const { calls, fetchImpl } = fetchReturning(okRefresh(480, "refresh-rotado"));
  const pump = createCredentialPump({ config, store, fetchImpl });

  await pump.ensure();

  assert.equal(calls.length, 0, "una torre que arranca con credencial vigente no castiga la API");
  assert.equal(pump.statusFor("local").status, "VIGENTE");
  assert.equal(config.environments.local.apexToken, accessToken);
});

test("un refresh rechazado retira la credencial y no se reintenta cada sondeo", async () => {
  const config = towerConfig();
  config.environments.local.apexRefresh = "refresh-revocada";
  config.environments.local.apexToken = jwt(1);
  const store = fakeStore();
  const { calls, fetchImpl } = fetchReturning(async () => ({ status: 401, ok: false, text: async () => JSON.stringify({ code: "TOKEN_INVALIDO" }) }));
  const pump = createCredentialPump({ config, store, fetchImpl });

  await pump.ensure();
  const first = pump.statusFor("local");
  assert.equal(first.status, "REVOCADA");
  assert.equal(first.attempts, 1);
  assert.equal(first.tokenConfigured, false, "no sigue enviando una credencial que la API ya nego");
  assert.equal(config.environments.local.apexToken, "");
  assert.ok(first.nextRetryAt, "respalda el reintento en vez de martillar la API del puesto");

  await pump.ensure();
  assert.equal(calls.length, 1, "el segundo sondeo respalda el respaldo, no repite la llamada");
});

test("un JWT fijo vencido declara el punto de medicion ciego", async () => {
  const config = towerConfig();
  config.environments.local.apexToken = jwt(-5);
  const store = fakeStore();
  const { calls, fetchImpl } = fetchReturning(async () => ({ status: 200, ok: true, text: async () => "{}" }));
  const pump = createCredentialPump({ config, store, fetchImpl });

  await pump.ensure();

  assert.equal(calls.length, 0);
  assert.equal(pump.statusFor("local").status, "TOKEN_VENCIDO");
  assert.equal(config.environments.local.apexToken, "");
});

test("la falta de credencial y la falta de conexion son dictamenes distintos", async () => {
  const config = towerConfig();
  const store = fakeStore();
  const { fetchImpl } = fetchReturning(async () => {
    throw new Error("ECONNREFUSED 127.0.0.1:3000");
  });
  config.environments.local.apexRefresh = "refresh-sin-red";
  const pump = createCredentialPump({ config, store, fetchImpl });

  await pump.ensure();

  assert.equal(pump.statusFor("local").status, "SIN_CONEXION");
  assert.equal(pump.statusFor("develop").status, "SIN_CREDENCIAL");
  assert.equal(pump.statusFor("main").status, "SIN_CREDENCIAL", "el ambiente apagado tambien declara su estado");
});

test("en simulacion la torre no renueva credenciales", async () => {
  const config = towerConfig({ simulation: true });
  config.environments.local.apexRefresh = "refresh-semilla";
  const store = fakeStore();
  const { calls, fetchImpl } = fetchReturning(okRefresh(480, "refresh-rotado"));
  const pump = createCredentialPump({ config, store, fetchImpl });

  await pump.ensure();

  assert.equal(calls.length, 0);
  assert.equal(pump.statusFor("local").status, "SIMULACION");
});

test("el estado publicado no lleva la credencial, solo el dictamen y las horas", async () => {
  const config = towerConfig();
  config.environments.local.apexRefresh = "refresh-secreto";
  const store = fakeStore();
  let issued = "";
  const { fetchImpl } = fetchReturning(async () => {
    issued = jwt(480);
    return { status: 200, ok: true, text: async () => JSON.stringify({ token: issued, refresh: "refresh-nuevo" }) };
  });
  const pump = createCredentialPump({ config, store, fetchImpl });
  await pump.ensure();

  const published = JSON.stringify(pump.status());
  assert.ok(!published.includes("refresh-"), "el dictamen viaja sin tokens al panel");
  assert.ok(!published.includes(issued));
  assert.equal(pump.statusFor("local").refreshConfigured, true);
  assert.match(pump.statusFor("local").reason, /renov/i);
});

test("la accion de credencial manda a un comando que existe", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "..", "..", "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const script = pkg.scripts["control:credential"];
  assert.equal(script, "node apps/control-tower/tools/issue-credential.js");
  assert.ok(fs.existsSync(path.join(root, "apps", "control-tower", "tools", "issue-credential.js")));

  const { refreshVar } = require("../lib/recommendations");
  const config = towerConfig();
  assert.equal(refreshVar(config.environments.local), "ENV_LOCAL_APEX_REFRESH");
});
