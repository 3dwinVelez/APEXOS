#!/usr/bin/env node

// Certificacion LOCAL del enlace de la app movil administrable por ambiente.
//
// Que se prueba, y por que cada pata existe:
//   A. ESQUEMA     - la migracion 20261125183000_platform_settings aplicada DOS veces sobre una base
//                    limpia, y su DDL comparado contra lo que Prisma declara (migrate diff). Sin esta
//                    pata el modelo podria vivir solo en el arbol y la nube reventaria el primer acceso.
//   B. SERVICIO    - el API real (server.js + Prisma + Postgres) detras de HTTP: la lectura publica
//                    responde sin sesion, la escritura exige superadministrador, la matriz legacy no
//                    cierra la puerta a quien administra configuracion, y todo cambio deja auditoria.
//   C. NAVEGADOR   - la pantalla de acceso servida por `next start`: el boton cambia de destino cuando
//                    cambia el valor de la base (ANTES respaldo / DESPUES administrado) y vuelve al
//                    respaldo cuando el valor guardado esta torcido. Es la unica pata que demuestra que
//                    lo administrado llega al usuario, no solo al JSON.
//   D. ADMINISTRACION - la ventana «App movil (enlace del acceso)» con sesion real: muestra el ambiente
//                    que declaro el servidor y guarda el enlace.
//   E. MUTACION    - se rompen a proposito dos invariantes del arbol de trabajo y se exige que las
//                    pruebas de contrato se pongan ROJAS; si no se caen, el corte estaba verde por ceguera.
//
// No toca ninguna base remota: aborta si DATABASE_URL no es localhost/127.0.0.1.
//
// Uso:
//   DATABASE_URL="postgresql://apex:<clave>@127.0.0.1:55442/apexos" \
//     node scripts/certifications/mobile-app-url-admin-local.js \
//       --output docs/qa/evidence/url-app-administrable-20261125/local-certification.json --web
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const bcrypt = require("bcrypt");

const arg = (name) => {
  const eq = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : (index >= 0 ? true : undefined);
};

const ROOT = path.resolve(__dirname, "..", "..");
const API_DIR = path.join(ROOT, "apps/api");
const WEB_DIR = path.join(ROOT, "apps/web");
const MIGRATION = path.join(API_DIR, "prisma/migrations/20261125183000_platform_settings/migration.sql");
const SCHEMA = path.join(API_DIR, "prisma/schema.prisma");
const OUTPUT = path.resolve(String(arg("output") || path.join(ROOT, "docs/qa/evidence/url-app-administrable-20261125/local-certification.json")));
const EXPECTED_COMMIT = String(arg("expected-commit") || "");
const WANT_WEB = Boolean(arg("web"));
const WEB_PORT = Number(arg("web-port") || 3311);
const API_PORT = Number(arg("api-port") || 3000);
const KEEP = Boolean(arg("keep"));
const adminUrl = String(process.env.DATABASE_URL || "").trim();
const FALLBACK = "https://appapexos-production.up.railway.app";

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function localDatabaseUrl(value) {
  const url = new URL(value);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "DATABASE_URL debe apuntar a un PostgreSQL LOCAL: esta certificacion no toca la nube");
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "")
  };
}

const capturas = [];
async function capturar(page, nombre, opts) {
  const destino = path.join(path.dirname(OUTPUT), `${nombre}.png`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  // El elemento del dialogo, no la pagina entera: una captura fullPage de 1440x900 pesa medio MB y no
  // muestra nada que el recorte del marco no muestre. El plan de choque de disco del 2026-11-18 sigue en
  // vigor y la evidencia vive en el repositorio.
  const recorte = opts && opts.selector ? await page.$(opts.selector) : null;
  if (recorte) await recorte.screenshot({ path: destino });
  else await page.screenshot({ path: destino, ...(opts || {}) });
  capturas.push(nombre);
  return nombre;
}

function psql(base, database, statement) {
  return execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", base.host, "-p", base.port, "-U", base.user, "-d", database, "-c", statement], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
    env: { ...process.env, PGPASSWORD: base.password }
  }).trim();
}

function psqlFile(base, database, file) {
  return execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", base.host, "-p", base.port, "-U", base.user, "-d", database, "-f", file], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
    env: { ...process.env, PGPASSWORD: base.password }
  }).trim();
}

function buildUrl(base, database) {
  return `postgresql://${encodeURIComponent(base.user)}:${encodeURIComponent(base.password)}@${base.host}:${base.port}/${database}`;
}

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const checks = [];
let stage = "preparacion";

async function registrar(nombre, esperado, tipo, asercion) {
  const registro = { chequeo: nombre, etapa: stage, tipo, esperado };
  checks.push(registro);
  try {
    const detalle = await asercion();
    registro.resultado = "OK";
    registro.detalle = typeof detalle === "string" ? detalle : JSON.stringify(detalle || {});
  } catch (error) {
    registro.resultado = "FALLO";
    registro.detalle = String(error?.response?.data ? JSON.stringify(error.response.data) : error?.message || error).slice(0, 500);
    if (tipo === "producto") throw error;
  }
  console.error(`[${stage}] ${registro.resultado} ${nombre} :: ${String(registro.detalle).slice(0, 180)}`);
}

async function main() {
  if (!adminUrl) throw new Error("DATABASE_URL es obligatorio y debe ser local");
  const base = localDatabaseUrl(adminUrl);
  const commit = git(["rev-parse", "HEAD"]);
  assert.ok(!EXPECTED_COMMIT || commit.startsWith(EXPECTED_COMMIT), `el arbol evaluado es ${commit.slice(0, 12)}, se pidio ${EXPECTED_COMMIT}`);
  const suffix = `${Date.now().toString().slice(-7)}${crypto.randomBytes(2).toString("hex")}`;
  const migDb = `apex_urlmig_${suffix}`;
  const svcDb = `apex_urlsvc_${suffix}`;
  const evidencia = {
    certification: "mobile-app-url-admin-local",
    run_id: RUN_ID,
    environment: "LOCAL",
    rama: git(["branch", "--show-current"]),
    head: commit,
    database_servidor: `${base.host}:${base.port}`,
    started_at: new Date().toISOString(),
    bases_efimeras: [migDb, svcDb],
    migration: path.relative(ROOT, MIGRATION).replace(/\\/g, "/"),
    migration_sha256: crypto.createHash("sha256").update(fs.readFileSync(MIGRATION)).digest("hex"),
    navegador: WANT_WEB ? "puppeteer-core + Edge" : "no ejecutada (--web ausente)",
    checks
  };

  let app = null;
  let prisma = null;
  let web = null;
  let browser = null;

  try {
    // ---------------- A. ESQUEMA ----------------
    stage = "esquema";
    psql(base, "postgres", `CREATE DATABASE "${migDb}"`);
    const migUrl = buildUrl(base, migDb);
    await registrar("migracion_aplicada_en_base_limpia", "psql -f sin errores sobre una base vacia", "producto", () => {
      psqlFile(base, migDb, MIGRATION);
      const columnas = psql(base, migDb, "select string_agg(column_name||':'||data_type, ',' order by ordinal_position) from information_schema.columns where table_name='platform_settings'");
      assert.equal(columnas, "id:integer,key:text,value:jsonb,updated_by:text,created_at:timestamp without time zone,updated_at:timestamp without time zone", `columnas: ${columnas}`);
      return { columnas };
    });
    await registrar("migracion_idempotente", "aplicarla una segunda vez no crea nada ni falla", "producto", () => {
      psqlFile(base, migDb, MIGRATION);
      const tablas = Number(psql(base, migDb, "select count(*) from information_schema.tables where table_name='platform_settings'"));
      const indices = Number(psql(base, migDb, "select count(*) from pg_indexes where tablename='platform_settings'"));
      assert.equal(tablas, 1, `hay ${tablas} tablas platform_settings`);
      assert.equal(indices, 2, `hay ${indices} indices (se esperan pkey + unique de key)`);
      return { tablas, indices };
    });
    await registrar("ddl_igual_al_modelo_prisma", "migrate diff no propone ningun cambio sobre platform_settings", "producto", () => {
      const script = execFileSync(process.execPath, [
        path.join(ROOT, "node_modules/prisma/build/index.js"), "migrate", "diff",
        "--from-url", migUrl, "--to-schema-datamodel", SCHEMA, "--script"
      ], { cwd: API_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000, env: { ...process.env, DATABASE_URL: migUrl } });
      const menciones = script.split("\n").filter((line) => /platform_settings/i.test(line) && !/^--/.test(line));
      assert.deepEqual(menciones, [], `Prisma todavia quiere cambiar la tabla: ${menciones.slice(0, 4).join(" | ")}`);
      return { lineas_de_diff: script.split("\n").filter(Boolean).length, menciones_platform_settings: 0 };
    });

    // ---------------- B. BASE DE SERVICIO ----------------
    stage = "base_de_servicio";
    psql(base, "postgres", `CREATE DATABASE "${svcDb}"`);
    const svcUrl = buildUrl(base, svcDb);
    await registrar("esquema_completo_disponible", "prisma db push + la migracion objetivo reaplicada", "producto", () => {
      execFileSync(process.execPath, [path.join(ROOT, "node_modules/prisma/build/index.js"), "db", "push", `--schema=${SCHEMA}`, "--skip-generate", "--accept-data-loss"], {
        cwd: API_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600000, env: { ...process.env, DATABASE_URL: svcUrl }
      });
      // La tabla bajo prueba tiene que ser la de la migracion versionada, no la que copia db push.
      psql(base, svcDb, 'DROP TABLE IF EXISTS "platform_settings"');
      psqlFile(base, svcDb, MIGRATION);
      const existe = psql(base, svcDb, "select to_regclass('public.platform_settings')::text");
      assert.equal(existe, "platform_settings", `to_regclass devolvio ${existe}`);
      return { tabla: "platform_settings", origen: "apps/api/prisma/migrations/20261125183000_platform_settings/migration.sql" };
    });
    await registrar("authorization_session_alineada_a_la_nube", "id uuid como en la base desplegada", "ambiente", () => {
      psql(base, svcDb, 'ALTER TABLE "AuthorizationSession" DROP CONSTRAINT "AuthorizationSession_pkey", ALTER COLUMN "id" TYPE uuid USING "id"::uuid, ALTER COLUMN "id" SET DEFAULT gen_random_uuid()');
      psql(base, svcDb, 'ALTER TABLE "AuthorizationSession" ADD PRIMARY KEY ("id")');
      const tipo = psql(base, svcDb, "select data_type from information_schema.columns where table_name='AuthorizationSession' and column_name='id'");
      assert.equal(tipo, "uuid", `sigue en ${tipo}`);
      return { tipo };
    });

    process.env.DATABASE_URL = svcUrl;
    process.env.NODE_ENV = "development";
    process.env.DISABLE_REDIS = "true";
    process.env.REDIS_DISABLED = "true";
    process.env.WORKERS_DISABLED = "true";
    process.env.PROMETHEUS_DISABLED = "true";
    process.env.JWT_SECRET ||= "certification-mobile-app-url-secret-32";
    // El ambiente lo declara el servidor: se fuerza 'qa' para probar que la pantalla muestra lo que
    // respondio esta API y no lo que el navegador cree.
    process.env.EXPECTED_ENVIRONMENT = "qa";
    process.env.RAILWAY_GIT_COMMIT_SHA = commit;

    const build = require(path.join(API_DIR, "server.js"));
    prisma = require(path.join(API_DIR, "src/core/prisma.js"));
    app = await build();
    if (WANT_WEB) await app.listen({ port: API_PORT, host: "127.0.0.1" });

    const paso = async (method, url, token, payload, esperado = [200, 201]) => {
      const response = await app.inject({
        method,
        url,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) },
        payload: payload ? JSON.stringify(payload) : undefined
      });
      let parsed = null;
      try {
        parsed = JSON.parse(response.body || "null");
      } catch {
        parsed = { raw: String(response.body || "").slice(0, 200) };
      }
      const failure = new Error(`${method} ${url} -> ${response.statusCode}: ${JSON.stringify(parsed).slice(0, 260)}`);
      failure.response = { data: parsed, status: response.statusCode };
      if (!esperado.includes(response.statusCode)) throw failure;
      return { status: response.statusCode, body: parsed || {}, headers: response.headers };
    };

    stage = "arranque";
    await registrar("health_ancla_el_commit_evaluado", "200 con commit == HEAD del arbol", "producto", async () => {
      const health = await paso("GET", "/health", null, undefined);
      assert.equal(String(health.body.commit || "").slice(0, 12), commit.slice(0, 12), `health sirve ${health.body.commit}`);
      return { commit: health.body.commit };
    });

    // ---------------- siembra ----------------
    stage = "siembra";
    const modulos = Array.from({ length: 27 }, (_, index) => `M-${String(index + 1).padStart(2, "0")}`);
    async function sembrar(empresa, correo, clave, rolNombre, rolMetadata, permisos) {
      const tenant = await prisma.tenant.create({ data: { name: `${empresa} ${RUN_ID}`, industry: "qa", country: "CO", timezone: "America/Bogota", currency: "COP", active_modules: modulos } });
      const role = await prisma.role.create({ data: { tenant_id: tenant.id, name: rolNombre, description: "Certificacion enlace de la app", is_system: true, metadata: rolMetadata, permissions: { create: permisos } } });
      const user = await prisma.user.create({ data: { tenant_id: tenant.id, name: `Cert ${rolNombre}`, email: correo, password: await bcrypt.hash(clave, 10), role_id: role.id, active: true } });
      return { tenant, role, user, correo, clave };
    }
    const superadmin = await sembrar("CERT PLATAFORMA", `cert.super.${suffix}@apexos.local`, "ClaveCert.2026!", "APEX_ADMIN", { role_type: "superadmin" }, [{ module: "*", action: "*" }]);
    const adminEmpresa = await sembrar("CERT EMPRESA", `cert.empresa.${suffix}@apexos.local`, "ClaveCert.2026!", "Administrador de empresa", { role_type: "admin_empresa" }, [{ module: "admin", action: "write" }]);
    const lector = await sembrar("CERT LECTOR", `cert.lector.${suffix}@apexos.local`, "ClaveCert.2026!", "Auditor de configuracion", { role_type: "custom", legacy_permissions: { configuracion: { access: true, view: true, configure: false, administer: false } } }, [{ module: "admin", action: "read" }]);
    await registrar("tres_roles_sembrados", "superadmin, admin de empresa y lector de configuracion", "producto", () => {
      assert.ok(superadmin.user.id && adminEmpresa.user.id && lector.user.id);
      return { roles: ["APEX_ADMIN", "Administrador de empresa", "Auditor de configuracion"] };
    });
    const sesion = async (persona) => {
      const login = await paso("POST", "/api/v1/auth/login", null, { email: persona.correo, password: persona.clave });
      const token = login.body.token || login.body.access_token;
      if (!token) throw new Error(`el login no devolvio token: ${JSON.stringify(login.body).slice(0, 200)}`);
      persona.token = token;
      return token;
    };
    await registrar("login_real_de_los_tres_actores", "200 con token", "producto", async () => {
      await Promise.all([sesion(superadmin), sesion(adminEmpresa), sesion(lector)]);
      return { autenticados: 3 };
    });

    // ---------------- B. FLUJO POR HTTP ----------------
    stage = "lectura_publica";
    await registrar("lectura_publica_sin_sesion", "GET /public/platform/mobile-app responde 200 con un https y no-store", "producto", async () => {
      const leido = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
      assert.match(String(leido.body.url), /^https:\/\//, `url leida: ${leido.body.url}`);
      assert.equal(leido.body.url, FALLBACK, "sin fila guardada el acceso debe ofrecer el destino quemado");
      assert.deepEqual(Object.keys(leido.body), ["url"], `la lectura publica expone mas que la url: ${Object.keys(leido.body)}`);
      assert.match(String(leido.headers["cache-control"] || ""), /no-store/, "un enlace por ambiente cacheado mostraria el destino de otro ambiente");
      return { url: leido.body.url, cache_control: leido.headers["cache-control"] };
    });

    stage = "rbac";
    await registrar("lectura_de_administracion_sin_sesion", "401", "producto", async () => {
      const intento = await paso("GET", "/api/v1/admin/platform/mobile-app", null, undefined, [401]);
      return { status: intento.status };
    });
    await registrar("escritura_sin_sesion", "401 antes de validar el cuerpo", "producto", async () => {
      const intento = await paso("PUT", "/api/v1/admin/platform/mobile-app", null, { url: "https://app.midominio.co" }, [401]);
      return { status: intento.status };
    });
    await registrar("admin_de_empresa_no_puede_escribir", "403 PLATAFORMA_SOLO_SUPERADMIN y cero escrituras", "producto", async () => {
      const antes = await prisma.platformSetting.count();
      const rechazo = await paso("PUT", "/api/v1/admin/platform/mobile-app", adminEmpresa.token, { url: "https://desvio.test" }, [403]);
      assert.equal(rechazo.body.code, "PLATAFORMA_SOLO_SUPERADMIN", `code ${rechazo.body.code}`);
      assert.equal(await prisma.platformSetting.count(), antes, "el rechazo escribio la fila");
      return { status: 403, code: rechazo.body.code };
    });
    await registrar("lector_de_configuracion_lee_y_no_escribe", "200 en GET, 403 CAPACIDAD_ROL_DENEGADA en PUT", "producto", async () => {
      const visto = await paso("GET", "/api/v1/admin/platform/mobile-app", lector.token);
      assert.equal(visto.body.environment, "qa", `ambiente declarado: ${visto.body.environment}`);
      const rechazo = await paso("PUT", "/api/v1/admin/platform/mobile-app", lector.token, { url: "https://otro.test" }, [403]);
      assert.equal(rechazo.body.code, "CAPACIDAD_ROL_DENEGADA", `code ${rechazo.body.code}`);
      return { ambiente: visto.body.environment, code: rechazo.body.code };
    });

    stage = "validacion";
    await registrar("rechaza_direcciones_torcidas", "400 con nombre propio para cada defecto", "producto", async () => {
      const casos = [["http://app.midominio.co", "URL_APP_MOVIL_NO_HTTPS"], ["app.midominio.co", "URL_APP_MOVIL_INVALIDA"], ["", "URL_APP_MOVIL_VACIA"], ["https://user:pass@app.midominio.co", "URL_APP_MOVIL_CON_CREDENCIALES"], ["https://app.midominio.co/#/x", "URL_APP_MOVIL_CON_FRAGMENTO"]];
      const vistos = [];
      for (const [url, code] of casos) {
        const rechazo = await paso("PUT", "/api/v1/admin/platform/mobile-app", superadmin.token, { url }, [400]);
        assert.equal(rechazo.body.code, code, `${url} -> ${rechazo.body.code}, se esperaba ${code}`);
        vistos.push(`${url}:${code}`);
      }
      assert.equal(await prisma.platformSetting.count(), 0, "una escritura rechazada dejo fila");
      return { rechazados: vistos };
    });

    stage = "guardado";
    const configurado = "https://app-certificado.test";
    const filasAuditoria = () => prisma.auditLog.count({ where: { action: "platform.mobile_app.url.updated" } });
    await registrar("superadmin_guarda_y_el_acceso_lo_lee", "200 + ambiente + auditoria + lectura publica con el nuevo valor", "producto", async () => {
      assert.equal(await filasAuditoria(), 0, "ya existian filas de esta accion antes de la corrida");
      const guardado = await paso("PUT", "/api/v1/admin/platform/mobile-app", superadmin.token, { url: `${configurado}/` });
      assert.equal(guardado.body.url, configurado, "no se guardo normalizado");
      assert.equal(guardado.body.environment, "qa");
      const fila = await prisma.platformSetting.findUnique({ where: { key: "mobile_app.url" } });
      assert.deepEqual(fila.value, { url: configurado }, `value: ${JSON.stringify(fila.value)}`);
      assert.equal(fila.updated_by, superadmin.user.email, "la autoria visible debe ser un correo reconocible");
      const leido = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
      assert.equal(leido.body.url, configurado, "el acceso sigue mostrando el respaldo despues de guardar: la cache no se invalido");
      const auditoria = await prisma.auditLog.findFirst({ where: { action: "platform.mobile_app.url.updated" }, orderBy: { id: "desc" } });
      assert.ok(auditoria, "no quedo fila de auditoria");
      assert.equal(await filasAuditoria(), 1, "la escritura no audito exactamente una vez");
      assert.equal(auditoria.user_id, superadmin.user.id);
      assert.equal(auditoria.entity, "PlatformSetting");
      assert.deepEqual(auditoria.old_value, { url: FALLBACK, source: "respaldo" });
      assert.deepEqual(auditoria.new_value, { url: configurado });
      return { url: guardado.body.url, ambiente: guardado.body.environment, updated_by: fila.updated_by, accion: auditoria.action };
    });
    await registrar("la_lectura_de_administracion_declara_autor_y_fecha", "source=base, updated_at y updated_by poblados", "producto", async () => {
      const config = await paso("GET", "/api/v1/admin/platform/mobile-app", superadmin.token);
      assert.equal(config.body.source, "base", `source ${config.body.source}`);
      assert.equal(config.body.url, configurado);
      assert.ok(config.body.updated_at, "updated_at llego vacio");
      assert.equal(config.body.updated_by, superadmin.user.email);
      assert.match(String(config.body.fallback_url), /^https:\/\//);
      return { source: config.body.source, ambiente: config.body.environment, updated_at: config.body.updated_at, updated_by: config.body.updated_by };
    });
    await registrar("restaurar_el_destino_por_defecto_es_express", "200 con restaurada=true y el acceso vuelve al quemado", "producto", async () => {
      const vuelta = await paso("PUT", "/api/v1/admin/platform/mobile-app", superadmin.token, { url: FALLBACK });
      assert.equal(vuelta.body.restaurada, true, "restaurar no se señalo como restauracion");
      const leido = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
      assert.equal(leido.body.url, FALLBACK);
      assert.equal(await filasAuditoria(), 2, "la restauracion no se audito");
      const ultima = await prisma.auditLog.findFirst({ where: { action: "platform.mobile_app.url.updated" }, orderBy: { id: "desc" } });
      assert.deepEqual(ultima.old_value, { url: configurado, source: "base" }, "la auditoria no dice de que enlace se_volvio");
      return { restaurada: vuelta.body.restaurada, old_value: ultima.old_value };
    });
    await registrar("valor_torcido_ya_almacenado_no_rompe_el_acceso", "fila escrita por SQL -> la lectura publica cae al respaldo", "producto", async () => {
      psql(base, svcDb, `insert into "platform_settings" ("key","value","updated_at") values ('mobile_app.url','{"url":"http://roto.test"}', now()) on conflict ("key") do update set "value" = '{"url":"http://roto.test"}'::jsonb`);
      const leido = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
      assert.equal(leido.body.url, FALLBACK, "un valor http guardado a mano dejo el acceso con un enlace que el navegador rechaza");
      psql(base, svcDb, `delete from "platform_settings" where "key" = 'mobile_app.url'`);
      return { leido: leido.body.url };
    });

    // ---------------- C. NAVEGADOR ----------------
    if (WANT_WEB) {
      stage = "navegador_preparacion";
      const buildIdPath = path.join(WEB_DIR, ".next", "BUILD_ID");
      await registrar("build_de_produccion_del_frontend", "apps/web/.next/BUILD_ID existe", "ambiente", () => {
        assert.ok(fs.existsSync(buildIdPath), "no hay build de produccion: correr NEXT_PUBLIC_API_URL=http://127.0.0.1:3000 npx next build en apps/web");
        evidencia.build_id = fs.readFileSync(buildIdPath, "utf8").trim();
        return { build_id: evidencia.build_id };
      });
      await registrar("el_bundle_servido_contiene_la_lectura_administrada", "un chunk de .next cita /api/v1/public/platform/mobile-app", "ambiente", () => {
        const raiz = path.join(WEB_DIR, ".next", "static", "chunks");
        const pila = [raiz];
        let encontrado = null;
        while (pila.length && !encontrado) {
          const directorio = pila.pop();
          for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
            const completo = path.join(directorio, entrada.name);
            if (entrada.isDirectory()) pila.push(completo);
            else if (/\.js$/.test(entrada.name) && fs.readFileSync(completo, "utf8").includes("/api/v1/public/platform/mobile-app")) encontrado = path.relative(WEB_DIR, completo).replace(/\\/g, "/");
          }
        }
        assert.ok(encontrado, "ningun chunk del build contiene el endpoint publico: el bundle es viejo para este cambio");
        return { chunk: encontrado };
      });

      // En Windows node_modules/.bin/next es un shell script: se invoca el JS del paquete con este
      // mismo node, que es lo unico que arranca igual en los tres sistemas.
      const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(WEB_PORT), "-H", "127.0.0.1"], {
        cwd: WEB_DIR,
        env: { ...process.env, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}`, NODE_ENV: "production" },
        stdio: ["ignore", "pipe", "pipe"]
      });
      const webLogs = [];
      child.stdout.on("data", (chunk) => webLogs.push(String(chunk)));
      child.stderr.on("data", (chunk) => webLogs.push(String(chunk)));
      web = { child, logs: webLogs };
      const origen = `http://127.0.0.1:${WEB_PORT}`;
      const deadline = Date.now() + 120000;
      let sirviendo = false;
      while (Date.now() < deadline && !sirviendo) {
        if (child.exitCode !== null) throw new Error(`next start termino antes de servir:\n${webLogs.join("").slice(-2500)}`);
        try {
          sirviendo = (await fetch(`${origen}/login`)).ok;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }
      assert.ok(sirviendo, "el frontend no sirvio /login en 120 s");
      await registrar("frontend_servido", "next start responde /login", "producto", () => ({ url: `${origen}/login`, frontend_served_by: "next start (build de produccion)" }));

      const puppeteer = require(require.resolve("puppeteer-core", { paths: [ROOT] }));
      browser = await puppeteer.launch({
        executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"]
      });
      const UA_ESCRITORIO = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
      const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A155G Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36";

      async function abrirGuia(userAgent) {
        const page = await browser.newPage();
        const ventanillas = [];
        page.on("dialog", async (dialog) => {
          ventanillas.push(dialog.type());
          await dialog.dismiss().catch(() => {});
        });
        await page.setUserAgent(userAgent);
        await page.setViewport(userAgent === UA_ANDROID ? { width: 412, height: 915, isMobile: true } : { width: 1366, height: 900 });
        await page.goto(`${origen}/login`, { waitUntil: "networkidle2", timeout: 90000 });
        await page.evaluate(() => document.querySelector("section[aria-labelledby='app-install-title'] button")?.click());
        await page.waitForSelector("section[role='dialog']", { timeout: 20000 });
        const leido = await page.evaluate(() => {
          const ventana = document.querySelector("section[role='dialog']");
          const enlace = ventana.querySelector("a[href]");
          const nota = ventana.querySelector("p.break-all");
          return { href: enlace?.getAttribute("href") || null, target: enlace?.getAttribute("target") || null, rel: enlace?.getAttribute("rel") || null, texto: nota?.textContent?.trim() || null };
        });
        return { page, ventanillas, leido };
      }

      stage = "navegador_acceso";
      // La lectura publica se cachea en el proceso del API durante `cache_ms` y solo se invalida cuando
      // el cambio entra POR EL API (guardar/restaurar). Un valor escrito a mano en la base, o borrado a
      // mano, puede seguir viendose hasta ese plazo: es el costo de no ir a la base en cada acceso.
      // La ventana de administracion lee siempre fresco y re-estampa la cache, asi que su lectura vale
      // como verificacion de lo que dice la base sin esperar a que venza el TTL.
      const verificarContraBase = async () => {
        const config = await paso("GET", "/api/v1/admin/platform/mobile-app", superadmin.token);
        assert.ok(Number.isInteger(Number(config.body.cache_ms)) && Number(config.body.cache_ms) > 0, `cache_ms declaradas: ${config.body.cache_ms}`);
        return { fuente: config.body.source, url: config.body.url, cache_ms: Number(config.body.cache_ms) };
      };
      await registrar("acceso_de_computador_muestra_el_respaldo_antes_de_administrar", "sin fila en la base, el texto servido es el destino quemado", "producto", async () => {
        psql(base, svcDb, `delete from "platform_settings" where "key" = 'mobile_app.url'`);
        const validada = await verificarContraBase();
        assert.equal(validada.fuente, "respaldo", `la base no esta limpia: la administracion dice ${validada.fuente}`);
        const { page, ventanillas, leido } = await abrirGuia(UA_ESCRITORIO);
        await page.close();
        assert.equal(leido.texto, FALLBACK, `la pantalla mostro ${leido.texto}`);
        assert.equal(leido.href, null, "en computador no puede haber enlace: es el callejon que el aviso evita");
        assert.deepEqual(ventanillas, [], `aparecieron ventanillas nativas: ${ventanillas}`);
        return { texto: leido.texto, href: leido.href, ventanillas: ventanillas.length, fuente_en_base: validada.fuente };
      });
      await registrar("acceso_de_computador_muestra_el_valor_administrado", "despues de guardar por el API, la pantalla cambia de destino sin esperar el TTL", "producto", async () => {
        await paso("PUT", "/api/v1/admin/platform/mobile-app", superadmin.token, { url: configurado });
        const { page, ventanillas, leido } = await abrirGuia(UA_ESCRITORIO);
        await page.close();
        assert.equal(leido.texto, configurado, `la pantalla sigue mostrando ${leido.texto}`);
        assert.deepEqual(ventanillas, [], "el flujo del enlace uso una ventanilla nativa");
        return { texto: leido.texto, antes: FALLBACK, despues: configurado };
      });
      await registrar("celular_abre_el_enlace_administrado", "el ancla lleva el valor de la base, en pestana nueva y sin exponer la ventana", "producto", async () => {
        const { page, leido } = await abrirGuia(UA_ANDROID);
        const captura = await capturar(page, "acceso-celular-enlace-administrado");
        await page.close();
        assert.equal(leido.href, configurado, `href servido: ${leido.href}`);
        assert.equal(leido.target, "_blank");
        assert.equal(leido.rel, "noopener noreferrer");
        return { href: leido.href, target: leido.target, rel: leido.rel, captura };
      });
      await registrar("celular_sigue_abriendo_el_respaldo_si_la_base_queda_torcida", "fila torcida por SQL: la administracion la detecta y el acceso cae al quemado", "producto", async () => {
        psql(base, svcDb, `insert into "platform_settings" ("key","value","updated_at") values ('mobile_app.url','{"url":"http://roto.test"}', now()) on conflict ("key") do update set "value" = '{"url":"http://roto.test"}'::jsonb`);
        const validada = await verificarContraBase();
        assert.equal(validada.fuente, "respaldo", "la administracion no advirtio que el valor guardado no sirve");
        assert.equal(validada.url, FALLBACK, `la administracion mostro ${validada.url}`);
        const { page, leido } = await abrirGuia(UA_ANDROID);
        psql(base, svcDb, `delete from "platform_settings" where "key" = 'mobile_app.url'`);
        await page.close();
        assert.equal(leido.href, FALLBACK, `con valor torcido el celular recibio ${leido.href}`);
        return { href: leido.href, fuente_en_base: validada.fuente, cache_ms: validada.cache_ms };
      });

      // ---------------- D. ADMINISTRACION ----------------
      stage = "navegador_administracion";
      await registrar("la_ventana_de_administracion_muestra_el_ambiente_y_guarda", "sesion real, apartado del catalogo, ambiente 'qa', autor y guardado visible", "producto", async () => {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.goto(`${origen}/login`, { waitUntil: "networkidle2", timeout: 90000 });
        await page.type("input[name='email']", superadmin.correo);
        await page.type("input[name='password']", superadmin.clave);
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Entrar de forma segura"))?.click());
        await page.waitForFunction(() => window.location.pathname.includes("/dashboard"), { timeout: 60000 });
        await page.goto(`${origen}/dashboard/administracion`, { waitUntil: "networkidle2", timeout: 90000 });
        const abierta = await page.evaluate((titulo) => {
          const blanco = [...document.querySelectorAll("button, a, [role='button']")].find((el) => el.textContent.includes(titulo));
          if (!blanco) return false;
          blanco.click();
          return true;
        }, "App móvil");
        assert.ok(abierta, "el apartado «App móvil (enlace del acceso)» no aparece en el catalogo de configuracion");
        await page.waitForSelector("section[role='dialog']", { timeout: 30000 });
        // Se lee el par etiqueta->valor (el <p> siguiente a la etiqueta), no un regex sobre todo el texto:
        // "Ambiente que respondióqaÚltimo cambio" es lo que sale cuando dos elementos van pegados, y ese
        // falso rojo taparia el defecto verdadero.
        const leerVentana = () => page.evaluate(() => {
          const ventana = document.querySelector("section[role='dialog']");
          const texto = ventana.textContent.replace(/\s+/g, " ");
          const parrafos = [...ventana.querySelectorAll("p")].map((p) => p.textContent.replace(/\s+/g, " ").trim());
          // Etiqueta y valor en el MISMO <p> («Quién lo cambió: correo»): hay que partir el parrafo, no
          // tomar el hermano, que es la nota de origen y devolvio un falso rojo de "autor inventado".
          const enLinea = (prefijo) => {
            const linea = parrafos.find((t) => t.startsWith(prefijo));
            return linea ? linea.slice(prefijo.length).replace(/^:\s*/, "") : null;
          };
          const valorDe = (etiqueta) => [...ventana.querySelectorAll("p")]
            .map((p) => ({ t: p.textContent.trim(), s: (p.nextElementSibling?.textContent || "").replace(/\s+/g, " ").trim() }))
            .find((p) => p.t.startsWith(etiqueta))?.s || null;
          return {
            ambiente: valorDe("Ambiente"),
            ultimoCambio: valorDe("Último"),
            autor: enLinea("Quién lo cambió"),
            tieneCampo: Boolean(ventana.querySelector("input[type='url']")),
            valor: ventana.querySelector("input[type='url']")?.value || null,
            avisoAlcance: /Guardar aquí no cambia otros ambientes/.test(texto),
            fuente: /administrado en este ambiente/.test(texto) ? "base" : /aún no se ha administrado/.test(texto) ? "respaldo" : null
          };
        });
        const visto = await leerVentana();
        assert.equal(visto.ambiente, "qa", `la pantalla mostro ambiente "${visto.ambiente}"`);
        assert.ok(visto.tieneCampo, "no hay campo de direccion en la ventana");
        assert.equal(visto.valor, FALLBACK, `el campo arranca en ${visto.valor}`);
        assert.ok(visto.avisoAlcance, "la ventana no dice que el cambio es solo de este ambiente");
        assert.equal(String(visto.autor), "sin cambios todavía", `la ventana no debia inventar un autor: "${visto.autor}"`);
        assert.equal(visto.fuente, "respaldo", `la ventana no distinguia el destino quemado: ${visto.fuente}`);
        await capturar(page, "ventana-admin-antes", { selector: "section[role='dialog']" });
        const nuevo = `https://app-admin-on-line.test`;
        await page.evaluate((valor) => {
          const campo = document.querySelector("section[role='dialog'] input[type='url']");
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          setter.call(campo, valor);
          campo.dispatchEvent(new Event("input", { bubbles: true }));
        }, nuevo);
        await page.evaluate(() => [...document.querySelectorAll("section[role='dialog'] button")].find((b) => b.textContent.includes("Guardar enlace"))?.click());
        await page.waitForFunction(() => /Enlace actualizado|No se pudo guardar|Dirección incompleta/.test(document.body.textContent), { timeout: 45000 });
        const cuerpo = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
        assert.match(cuerpo, /Enlace actualizado/, `el guardado no confirmo: ${cuerpo.slice(0, 200)}`);
        assert.ok(!/No se pudo guardar/.test(cuerpo), "la pantalla reporto fallo al guardar");
        const trasGuardar = await leerVentana();
        assert.equal(trasGuardar.fuente, "base", "guardado el enlace, la ventana sigue diciendo que es el destino por defecto");
        assert.match(String(trasGuardar.autor), /@/, `la ventana no muestra un correo reconocible: "${trasGuardar.autor}"`);
        assert.ok(!/sin cambios todavía/.test(trasGuardar.ultimoCambio || ""), `la ventana sigue diciendo que no hay cambios: "${trasGuardar.ultimoCambio}"`);
        assert.match(String(trasGuardar.ultimoCambio), /\d{1,2}\/\d{1,2}\/\d{4}/, `la fecha del cambio no es una fecha: "${trasGuardar.ultimoCambio}"`);
        assert.equal(trasGuardar.valor, nuevo, `el campo no refleja lo guardado: ${trasGuardar.valor}`);
        const capturaGuardado = await capturar(page, "ventana-admin-despues", { selector: "section[role='dialog']" });
        const confirmacion = await page.evaluate(() => {
          const aviso = [...document.querySelectorAll("div, section, p")].find((el) => /Enlace actualizado/.test(el.textContent) && el.textContent.replace(/\s+/g, " ").length < 220);
          return aviso ? aviso.textContent.replace(/\s+/g, " ").trim() : null;
        });
        const leido = await paso("GET", "/api/v1/public/platform/mobile-app", null, undefined);
        assert.equal(leido.body.url, nuevo, "la pantalla guardo pero el acceso no cambio");
        await page.close();
        return { ambiente: visto.ambiente, autor_antes: visto.autor, autor_despues: trasGuardar.autor, guardado: nuevo, lectura_publica: leido.body.url, confirmacion, captura: capturaGuardado };
      });
    }

    // ---------------- E. CONTROL DE MUTACION ----------------
    stage = "control_de_mutacion";
    const muta = (rel, anterior, nuevo) => {
      const absoluto = path.join(ROOT, rel);
      const original = fs.readFileSync(absoluto, "utf8");
      const shaOriginal = crypto.createHash("sha256").update(original).digest("hex");
      assert.ok(original.includes(anterior), `el ancla del control de mutacion no esta en ${rel}`);
      fs.writeFileSync(absoluto, original.replace(anterior, nuevo), "utf8");
      let rojo = false;
      let salida = "";
      try {
        execFileSync(process.execPath, ["--test", rel.includes("apps/api") ? "apps/api/test/admin-platform-mobile-app-url.test.js" : "apps/web/test/mobile-app-install.test.mjs"], {
          cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 240000, env: { ...process.env, SystemRoot: process.env.SystemRoot || "C:\\Windows" }
        });
      } catch (error) {
        rojo = true;
        salida = String(error.stdout || error.message).split("\n").filter((line) => line.startsWith("not ok")).join(" | ").slice(0, 300);
      } finally {
        fs.writeFileSync(absoluto, original, "utf8");
      }
      const shaRestaurada = crypto.createHash("sha256").update(fs.readFileSync(absoluto, "utf8")).digest("hex");
      assert.equal(shaRestaurada, shaOriginal, `${rel} no se restauro byte a byte`);
      return { rojo, salida, blob_restaurado: shaRestaurada.slice(0, 12) };
    };
    await registrar("romper_la_capacidad_de_escritura_pone_el_contrato_rojo", "quitar requireAdminCapability del PUT => la prueba de contrato falla", "producto", () => {
      const r = muta("apps/api/src/modules/admin/routes.js", 'preHandler: requireAdminCapability("platform_settings", "edit")', "preHandler: async () => {}");
      assert.ok(r.rojo, "el contrato no se cayo al quitar la capacidad de escritura");
      return r;
    });
    await registrar("quemar_el_destino_en_la_banda_pone_el_contrato_rojo", "volver a escribir la URL a mano en el componente => la prueba de contrato falla", "producto", () => {
      const r = muta("apps/web/components/system/AppInstallBand.tsx", "useState(() => mobileAppUrl())", 'useState("https://appapexos-production.up.railway.app")');
      assert.ok(r.rojo, "el contrato no se cayo al quemar el destino en la banda");
      return r;
    });
  } finally {
    const fallosProducto = checks.filter((c) => c.resultado === "FALLO" && c.tipo === "producto");
    const fallosAmbiente = checks.filter((c) => c.resultado === "FALLO" && c.tipo === "ambiente");
    evidencia.terminado_at = new Date().toISOString();
    evidencia.capturas = capturas;
    evidencia.totales = {
      checks: checks.length,
      ok: checks.filter((c) => c.resultado === "OK").length,
      fallo_producto: fallosProducto.length,
      fallo_ambiente: fallosAmbiente.length
    };
    evidencia.certification_status = fallosProducto.length ? "local_failed" : fallosAmbiente.length ? "local_passed_ambiente_parcial" : WANT_WEB ? "local_passed" : "local_passed_sin_navegador";
    evidencia.pendientes = [];
    if (!WANT_WEB) evidencia.pendientes.push("patas C y D (navegador) no ejecutadas en esta corrida");
    if (fallosAmbiente.length) evidencia.pendientes.push(...fallosAmbiente.map((c) => `${c.chequeo}: ${c.detalle.slice(0, 160)}`));
    evidencia.pendientes.push("aplicar la migracion 20261125183000_platform_settings en QA y Produccion (requiere autorizacion expresa del dueno)");
    evidencia.pendientes.push("certificacion en ambiente QA/Produccion con la pantalla de Administracion APEX servida (apexos-qa)");

    if (browser) await browser.close().catch(() => {});
    if (web?.child?.kill) web.child.kill();
    if (prisma) await prisma.$disconnect().catch(() => {});
    if (app) await app.close().catch(() => {});
    if (!KEEP) {
      for (const db of [migDb, svcDb]) {
        try {
          psql(base, "postgres", `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
        } catch (error) {
          evidencia.bases_efimeras_estado = `${db} no se pudo borrar: ${String(error.message).slice(0, 120)}`;
        }
      }
    }
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(evidencia, null, 2)}\n`, "utf8");
    console.log(`\n${evidencia.certification_status} :: ${evidencia.totales.ok}/${evidencia.totales.checks} checks :: ${OUTPUT}`);
    if (evidencia.totales.fallo_producto) {
      console.error(`FALLOS DE PRODUCTO: ${evidencia.totales.fallo_producto}`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    console.error(`BLOQUEADO: ${String(error?.message || error).slice(0, 1200)}`);
    try {
      // El finally de main() ya escribio la evidencia con su veredicto y sus checks: aqui solo se
      // ancla la causa del corte. Reescribir el archivo desde cero borraria los verdes ya ganados.
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      let previa = {};
      try {
        previa = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
      } catch {
        previa = { certification: "mobile-app-url-admin-local", run_id: RUN_ID, checks };
      }
      const bloqueada = {
        ...previa,
        certification_status: previa.certification_status || "bloqueado",
        bloqueado_por: String(error?.message || error).slice(0, 500),
        checks: Array.isArray(previa.checks) && previa.checks.length ? previa.checks : checks
      };
      fs.writeFileSync(OUTPUT, `${JSON.stringify(bloqueada, null, 2)}\n`, "utf8");
    } catch {}
    process.exitCode = 1;
  })
  // El cron de la torre (apex-control) sigue vivo despues de app.close() y de botar la base: sin
  // salida explicita el proceso nunca termina y la evidencia queda escrita pero la corrida no cierra.
  .then(() => setTimeout(() => process.exit(process.exitCode || 0), 500));
