// Certificacion del paquete de sesion: una sesion Supabase valida sin contexto de empresa NO
// puede morir. Se mide contra el servidor real escuchando en un socket, no contra un clon del
// catch, y se conserva el caso espejo (credencial invalida sigue siendo 401).
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const outputFlag = process.argv.find((arg) => arg.startsWith("--output="));
const envFlag = process.argv.find((arg) => arg.startsWith("--env-file="));
const OUTPUT = outputFlag
  ? path.resolve(ROOT, outputFlag.slice("--output=".length))
  : path.join(ROOT, "docs", "qa", "evidence", "sesion-admin-produccion-20261108", "certificacion-local.json");

// El servidor real abre Prisma al construirse: sin el .env local no hay base de datos y el
// gate se cae por infraestructura, no por el contrato que se quiere medir.
require(path.join(ROOT, "scripts", "load-env"))(path.resolve(ROOT, envFlag ? envFlag.slice("--env-file=".length) : ".env"));

const TOKEN_SIN_EMPRESA = "usuario-sin-empresa";
const TOKEN_BASURA = "token-que-no-es-nada";

function nowIso() {
  return new Date().toISOString();
}

function startSupabaseStub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const bearer = String(req.headers.authorization || "").replace(/^Bearer /, "");
      if (req.url.startsWith("/auth/v1/user")) {
        // El borde solo reconoce el token de la cuenta sin empresa: cualquier otro sigue
        // siendo credencial invalida y tiene que terminar en 401.
        if (bearer !== TOKEN_SIN_EMPRESA) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: "invalid JWT" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "11111111-2222-3333-4444-555555555555", email: "cert.sesion@apex.local" }));
        return;
      }
      if (req.url.startsWith("/rest/v1/company_users")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function get(apiUrl, authorization) {
  const started = Date.now();
  const response = await fetch(`${apiUrl}/api/v1/admin/roles`, {
    headers: authorization ? { authorization } : {}
  });
  const text = await response.text();
  let code = "";
  try {
    code = String(JSON.parse(text).code || "");
  } catch {
    code = "";
  }
  return { estado: response.status, code, duracion_ms: Date.now() - started };
}

function gitComite() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

(async () => {
  process.env.NODE_ENV = "test";
  process.env.REDIS_DISABLED = "true";
  process.env.DISABLE_REDIS = "true";
  process.env.JWT_SECRET ||= "certification-sesion-secret-with-32-characters-min";
  process.env.PROMETHEUS_DISABLED = "true";

  const stub = await startSupabaseStub();
  process.env.SUPABASE_URL = `http://127.0.0.1:${stub.port}`;
  process.env.SUPABASE_ANON_KEY = "cert-stub-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cert-stub-service-key";
  process.env.SUPABASE_AUTH_CACHE_TTL_MS = "1000";

  const resultados = [];
  const mediciones = {};
  let app = null;

  const registrar = (nombre, ok, detalle) => {
    resultados.push({ chequeo: nombre, resultado: ok ? "OK" : "FALLO", detalle });
    console.log(`  ${ok ? "OK  " : "FALLO"} ${nombre} :: ${detalle}`);
    if (!ok) throw new Error(`CHEQUEO FALLIDO: ${nombre} (${detalle})`);
  };

  try {
    const build = require(path.join(ROOT, "apps", "api", "server.js"));
    app = await build();
    await app.listen({ port: 0, address: "127.0.0.1" });
    const apiUrl = `http://127.0.0.1:${app.server.address().port}`;
    console.log(`API real escuchando en ${apiUrl} (Supabase simulado en 127.0.0.1:${stub.port})`);

    // 1) El flujo que expulsaba: sesion Supabase valida, cero empresas.
    const sinEmpresa = await get(apiUrl, `Bearer ${TOKEN_SIN_EMPRESA}`);
    mediciones.sesion_sin_empresa = sinEmpresa;
    registrar(
      "sesion Supabase valida sin empresa responde 403 y conserva la sesion",
      sinEmpresa.estado === 403 && sinEmpresa.code === "EMPRESA_NO_VINCULADA",
      `${sinEmpresa.estado} ${sinEmpresa.code} en ${sinEmpresa.duracion_ms} ms`
    );

    // 2) El caso espejo: la autenticacion no se aflojo.
    const basura = await get(apiUrl, `Bearer ${TOKEN_BASURA}`);
    mediciones.credencial_invalida = basura;
    registrar(
      "token que no resuelve identidad sigue respondiendo 401 TOKEN_INVALIDO",
      basura.estado === 401 && basura.code === "TOKEN_INVALIDO",
      `${basura.estado} ${basura.code}`
    );

    // 3) Sin credencial alguna: tampoco puede volverse 403.
    const anonimo = await get(apiUrl, "");
    mediciones.anonimo = anonimo;
    registrar(
      "peticion anonima sigue siendo 401",
      anonimo.estado === 401,
      `${anonimo.estado} ${anonimo.code}`
    );

    // 4) El contrato del navegador: ningun 403 puede alcanzar clearSession.
    const pruebaCliente = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--test", "test/session-scope-403.test.mjs"],
      { cwd: path.join(ROOT, "apps", "web"), encoding: "utf8" }
    );
    const salidaCliente = String(pruebaCliente.stdout || "");
    const conteo = (expresion) => (salidaCliente.match(expresion) || []).length;
    registrar(
      "apps/web: contrato de alcance y clearSession solo bajo 401 (5/5)",
      pruebaCliente.status === 0 && /# fail 0/.test(salidaCliente) && /# pass 5/.test(salidaCliente),
      `exit=${pruebaCliente.status} pass=${conteo(/^ok /gm)} ${salidaCliente.split(/\r?\n/).filter((l) => l.startsWith("# tests") || l.startsWith("# fail")).join(" ")}`
    );

    // 5) La cadena del API medida con el decorador real, otra vez, como parte de esta corrida.
    const pruebaApi = spawnSync(
      process.execPath,
      ["--env-file=.env", "--test", "--test-force-exit", "apps/api/test/authorization-status-codes.test.js"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, AUTH_STATUS_INTEGRATION: "1" } }
    );
    const salidaApi = String(pruebaApi.stdout || "");
    registrar(
      "apps/api: authorization-status-codes 6/6 con AUTH_STATUS_INTEGRATION=1",
      pruebaApi.status === 0 && /# fail 0/.test(salidaApi) && /# pass 6/.test(salidaApi),
      salidaApi.split(/\r?\n/).filter((l) => l.startsWith("# tests") || l.startsWith("# pass") || l.startsWith("# fail")).join(" ")
    );

    // 6) El contrato de codigo que se promociona: las cuatro reclasificaciones deben existir.
    const fuentes = {
      server: fs.readFileSync(path.join(ROOT, "apps", "api", "server.js"), "utf8"),
      tenancy: fs.readFileSync(path.join(ROOT, "apps", "api", "src", "middleware", "tenancy.js"), "utf8"),
      rbac: fs.readFileSync(path.join(ROOT, "apps", "api", "src", "middleware", "rbac.js"), "utf8"),
      supabase: fs.readFileSync(path.join(ROOT, "apps", "api", "src", "security", "supabaseAuth.js"), "utf8"),
      cliente: fs.readFileSync(path.join(ROOT, "apps", "web", "lib", "api.ts"), "utf8")
    };
    const contratos = {
      "server.js responde 403 cuando el error trae statusCode 403": /statusCode\) === 403/.test(fuentes.server),
      "server.js usa 500 EMPRESA_NO_RESUELTA al no poder leer el tenant": /EMPRESA_NO_RESUELTA/.test(fuentes.server) && /reply\.code\(500\)/.test(fuentes.server),
      "tenancy.js devuelve 403 EMPRESA_REQUERIDA": /code\.code\(403\)[\s\S]{0,160}EMPRESA_REQUERIDA|403\)\.send\(\{[^}]*EMPRESA_REQUERIDA/.test(fuentes.tenancy),
      "rbac.js no devuelve 401 por rol ausente": !/401\)\.send\(\{[^}]*No autenticado/.test(fuentes.rbac) && (fuentes.rbac.match(/ROL_NO_DEFINIDO/g) || []).length === 4,
      "supabaseAuth.js tipa los rechazos con statusCode 403": /statusCode = 403/.test(fuentes.supabase) && /EMPRESA_NO_VINCULADA/.test(fuentes.supabase),
      "lib/api.ts conoce los codigos de alcance": /SESSION_SCOPE_CODES/.test(fuentes.cliente)
    };
    mediciones.contratos_de_codigo = contratos;
    for (const [nombre, ok] of Object.entries(contratos)) registrar(`contrato de codigo: ${nombre}`, ok, ok ? "presente" : "ausente");
  } finally {
    if (app) await app.close();
    await new Promise((resolve) => stub.server.close(resolve));
  }

  const informe = {
    certificacion: "sesion-administracion-produccion-20261108",
    flujo_certificado: "Abrir Administracion con una sesion Supabase valida sin contexto de empresa",
    ambiente: "local",
    ejecutado_en: nowIso(),
    commit: gitComite(),
    cheques: resultados.length,
    fallos: resultados.filter((item) => item.resultado !== "OK").length,
    mediciones,
    resultados,
    notas: [
      "El servidor real escucha en 127.0.0.1 y el borde de Supabase esta simulado en localhost; no se usan credenciales reales.",
      "No hay medicion contra produccion en esta certificacion: ahi sigue corriendo el build anterior y expulsa hasta la promocion.",
      "El 401 de credencial invalida y el 401 anonimo se miden en la misma corrida para probar que la autenticacion no se aflojo."
    ]
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(informe, null, 2)}\n`);
  console.log(`\nCERTIFICACION OK: ${informe.cheques} cheques, ${informe.fallos} fallos -> ${path.relative(ROOT, OUTPUT)}`);
  // El planificador de cron del servidor sigue vivo despues de app.close(); sin esta salida
  // explicita el proceso queda colgado y el gate nunca devuelve veredicto.
  process.exit(0);
})().catch((error) => {
  console.error(`CERTIFICACION FALLIDA: ${error.message}`);
  process.exit(1);
});
