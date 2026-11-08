// La ruta publica de Servicios es la unica superficie de apps/web que escribe y lee datos
// sin sesion. Estas pruebas fijan el contrato del candado: no hay llave de servicio ni
// Prisma, la empresa sale de una allowlist, la escritura exige JWT y RLS decide.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

register(new URL("./next-server-stub-loader.mjs", import.meta.url));

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const routeFile = path.join(appDir, "app", "api", "public", "service-requests", "route.ts");
const publicDir = path.join(appDir, "app", "api", "public");
const source = fs.readFileSync(routeFile, "utf8");

const ALLOWED_COMPANY = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY = "22222222-2222-4222-8222-222222222222";
const CLOUD_DB = "postgresql://user:secret@db.apexos.example:5432/apexos";
const LOCAL_DB = "postgresql://user:secret@localhost:5432/apexos";
const LOCAL_API = "http://127.0.0.1:3999";

// El modulo toma el .env de la raiz desde process.cwd(): lo aislamos para que la prueba
// mida solo las variables que ella misma define.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-public-route-"));
process.chdir(workDir);

const route = await import(pathToFileURL(routeFile).href);

const ENV_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_API_URL",
  "API_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "APEXOS_PUBLIC_SERVICE_COMPANY_ID",
  "NEXT_PUBLIC_APEXOS_PUBLIC_COMPANY_ID"
];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function resetEnv(values = {}) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

function cloudEnv(extra = {}) {
  return {
    DATABASE_URL: CLOUD_DB,
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test",
    ...extra
  };
}

function localEnv() {
  return { DATABASE_URL: LOCAL_DB, NEXT_PUBLIC_API_URL: LOCAL_API };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const record = { url: String(url), method: String(init.method || "GET").toUpperCase(), headers: init.headers || {}, body: init.body };
    calls.push(record);
    return handler(record);
  };
  return calls;
}

function requestStub(body, headers = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    headers: { get: (name) => normalized[String(name).toLowerCase()] ?? null },
    json: async () => body
  };
}

function validOrder(overrides = {}) {
  return {
    customer_name: "Ana Perez",
    customer_document: "10203040",
    customer_phone: "3001234567",
    customer_phone_secondary: "3007654321",
    customer_address: "Calle 1 # 2-3",
    customer_neighborhood: "Centro",
    service_store: "Sede 1",
    items: [{ reference_id: "7", service_type: "montaje", quantity: 1 }],
    ...overrides
  };
}

test.after(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

test("la superficie publica no arrastra llave de servicio ni Prisma", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(full);
    }
  };
  walk(publicDir);
  assert.ok(files.length >= 1, "debe existir al menos un handler publico");
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, `${file} no debe nombrar la llave de servicio`);
    assert.doesNotMatch(content, /@prisma\/client|new PrismaClient/, `${file} no debe usar Prisma`);
  }
  assert.doesNotMatch(source, /\/rest\/v1\/companies/, "la empresa no se resuelve enumerando companies");
  assert.doesNotMatch(source, /isAdministrativeRole|metadataAllowsCatalogAdmin|hasAdministrativeSession/, "sin inferencia local de rol administrativo");
  assert.doesNotMatch(source, /resolveCompanyCandidates|resolveCompanyIdFromReference/, "sin resolucion implicita de empresa");
});

test("GET sin allowlist responde 503 y no adivina la empresa", async () => {
  resetEnv(cloudEnv());
  const calls = stubFetch(() => jsonResponse([]));
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /APEXOS_PUBLIC_SERVICE_COMPANY_ID/);
  assert.equal(calls.length, 0);
});

test("GET consulta solo la empresa de la allowlist", async () => {
  resetEnv(cloudEnv({ APEXOS_PUBLIC_SERVICE_COMPANY_ID: ALLOWED_COMPANY }));
  const calls = stubFetch((call) => {
    if (call.url.includes("code=eq.__SERVICE_TYPES__")) {
      return jsonResponse([{ metadata: { service_types: [{ code: "montaje", label: "Montaje", active: true }], service_stores: [{ code: "sede_1", label: "Sede 1", active: true }] } }]);
    }
    return jsonResponse([{ id: "ref-1", company_id: ALLOWED_COMPANY, code: "A1", name: "Referencia" }]);
  });
  const response = await route.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.company_id, ALLOWED_COMPANY);
  assert.equal(body.references.length, 1);
  assert.doesNotMatch(calls.map((call) => call.url).join("\n"), /\/rest\/v1\/companies/);
  const referencesCall = calls.find((call) => call.url.includes("select=id,company_id,code"));
  assert.match(referencesCall.url, new RegExp(`company_id=eq\\.${ALLOWED_COMPANY}`));
  assert.match(calls[0].headers.Authorization, /^Bearer anon-test$/);
});

test("PUT sin JWT responde 401 sin tocar la red", async () => {
  resetEnv(cloudEnv({ APEXOS_PUBLIC_SERVICE_COMPANY_ID: ALLOWED_COMPANY }));
  const calls = stubFetch(() => jsonResponse({}));
  const response = await route.PUT(requestStub({ service_stores: [{ code: "sede_1", label: "Sede 1", active: true }] }));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("PUT con sesion invalida responde 401 y no escribe", async () => {
  resetEnv(cloudEnv({ APEXOS_PUBLIC_SERVICE_COMPANY_ID: ALLOWED_COMPANY }));
  const calls = stubFetch((call) => (call.url.includes("/auth/v1/user") ? jsonResponse({ message: "token expirado" }, 401) : jsonResponse({})));
  const response = await route.PUT(requestStub(
    { service_stores: [{ code: "sede_1", label: "Sede 1", active: true }] },
    { authorization: "Bearer token-vencido" }
  ));
  assert.equal(response.status, 401);
  assert.equal(calls.some((call) => call.method !== "GET" && !call.url.includes("/auth/v1/user")), false);
});

test("PUT rechazado por RLS responde 403 y escribe en la empresa de la allowlist", async () => {
  resetEnv(cloudEnv({ APEXOS_PUBLIC_SERVICE_COMPANY_ID: ALLOWED_COMPANY }));
  const calls = stubFetch((call) => {
    if (call.url.includes("/auth/v1/user")) return jsonResponse({ id: "user-1" });
    if (call.method === "POST") return jsonResponse({ code: "42501", message: "new row violates row-level security policy" }, 403);
    return jsonResponse([]);
  });
  const response = await route.PUT(requestStub(
    { service_stores: [{ code: "sede_1", label: "Sede 1", active: true }] },
    { authorization: "Bearer token-admin" }
  ));
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /permiso de administracion/i);
  const write = calls.find((call) => call.method === "POST");
  assert.match(write.url, /\/rest\/v1\/service_references$/);
  assert.equal(JSON.parse(write.body).company_id, ALLOWED_COMPANY);
  assert.equal(write.headers.Authorization, "Bearer token-admin");
});

test("PUT local reenvia el JWT del administrador al API", async () => {
  resetEnv(localEnv());
  const calls = stubFetch(() => jsonResponse([{ code: "sede_1", label: "Sede 1", active: true }]));
  const response = await route.PUT(requestStub(
    { service_stores: [{ code: "sede_1", label: "Sede 1", active: true }] },
    { authorization: "Bearer jwt-operativo" }
  ));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${LOCAL_API}/api/v1/services/service-stores`);
  assert.equal(calls[0].headers.Authorization, "Bearer jwt-operativo");
});

test("GET local delega el catalogo en el API operativo", async () => {
  resetEnv(localEnv());
  const calls = stubFetch(() => jsonResponse({ ok: true, company_id: "tenant-1", references: [], service_types: [], service_stores: [] }));
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).company_id, "tenant-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${LOCAL_API}/api/v1/public/services/catalog`);
});

test("POST local delega en el API y no reenvia la empresa que envia el cliente", async () => {
  resetEnv(localEnv());
  const calls = stubFetch(() => jsonResponse({ ok: true, order: { id: "1", number: "SOL-2026-00001" } }));
  const response = await route.POST(requestStub(validOrder({
    company_id: OTHER_COMPANY,
    company_name: "Otra empresa",
    reference_id: "7",
    service_type: "montaje"
  })));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${LOCAL_API}/api/v1/public/services/orders`);
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.company_id, undefined);
  assert.equal(sent.company_name, undefined);
  assert.equal(sent.customer_document, "10203040");
  assert.equal(sent.items[0].quantity, 1);
});

test("POST valida el formulario antes de tocar la red", async () => {
  resetEnv(localEnv());
  const calls = stubFetch(() => jsonResponse({}));
  const response = await route.POST(requestStub(validOrder({ customer_phone_secondary: "3001234567" })));
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /telefonos de contacto deben ser diferentes/i);
  assert.equal(calls.length, 0);
});
