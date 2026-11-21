#!/usr/bin/env node

/* Flujo real por HTTP: Fastify + Prisma + PostgreSQL local en base efimera. Sin mocks ni escrituras remotas. */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = path.resolve(__dirname, "..", "..");
const output = arg("output") ? path.resolve(arg("output")) : null;
const expectedCommit = arg("expected-commit") || "";
const candidateLabel = arg("candidate") || "";
const keepDb = process.argv.includes("--keep-db");
const adminUrl = String(process.env.DATABASE_URL || "").trim();

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

// La pata de contraste corre con el archivo del arbol de trabajo sustituido por el del target, asi que el
// blob commiteado y el blob efectivamente servido pueden no ser el mismo. La evidencia tiene que decir que
// se ejecuto, no que estaba en HEAD; si no, un rojo mal etiquetado se puede leer como verde del candidato.
function blobMedido(rel) {
  return git(["hash-object", `--path=${rel}`, rel]);
}

function coherenciaArbol(commit) {
  const rutas = ["apps/api/src/modules/admin/service.js", "apps/api/test/admin-user-status-regression.test.js"];
  const en_cabeza = rutas.map((rel) => git(["rev-parse", `${commit}:${rel}`]));
  const medidos = rutas.map((rel) => blobMedido(rel));
  return {
    blob_servicio: en_cabeza[0],
    blob_contrato: en_cabeza[1],
    blob_servicio_medido: medidos[0],
    blob_contrato_medido: medidos[1],
    arbol_de_trabajo_igual_a_cabeza: en_cabeza.every((blob, index) => blob === medidos[index])
  };
}

function localDatabaseUrl(value) {
  const url = new URL(value);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "DATABASE_URL debe apuntar a PostgreSQL local");
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "")
  };
}

function psql(base, database, statement) {
  return execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", base.host, "-p", base.port, "-U", base.user, "-d", database, "-c", statement], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
    env: { ...process.env, PGPASSWORD: base.password }
  }).trim();
}

function buildUrl(base, database) {
  return `postgresql://${encodeURIComponent(base.user)}:${encodeURIComponent(base.password)}@${base.host}:${base.port}/${database}`;
}

(async () => {
  if (!adminUrl) throw new Error("DATABASE_URL es obligatorio y debe ser local");
  const base = localDatabaseUrl(adminUrl);
  const commit = git(["rev-parse", "HEAD"]);
  assert.ok(!expectedCommit || commit.startsWith(expectedCommit), `el arbol evaluado es ${commit.slice(0, 12)}, se pidio ${expectedCommit}`);
  const suffix = `${Date.now().toString().slice(-7)}${crypto.randomBytes(2).toString("hex")}`;
  const scratchDb = `apex_admin_inactive_cert_${suffix}`;
  const checks = [];
  let app = null;
  let prisma = null;
  let stage = "preparacion";

  const registrar = async (nombre, detalle, asercion) => {
    const registro = { chequeo: nombre, etapa: stage, esperado: detalle };
    checks.push(registro);
    try {
      const extra = await asercion();
      registro.resultado = "OK";
      registro.detalle = typeof extra === "string" ? extra : JSON.stringify(extra || {});
    } catch (error) {
      registro.resultado = "FALLO";
      registro.detalle = JSON.stringify(error?.response?.data || { error: String(error?.message || error) }).slice(0, 400);
    }
    console.error(`[${stage}] ${registro.resultado} ${nombre} :: ${registro.detalle.slice(0, 180)}`);
  };

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
    const ok = esperado.includes(response.statusCode);
    const failure = new Error(`${method} ${url} -> ${response.statusCode}: ${JSON.stringify(parsed).slice(0, 240)}`);
    failure.response = { data: parsed, status: response.statusCode };
    if (!ok) throw failure;
    return parsed || {};
  };

  try {
    console.error(`[preparacion] creando ${scratchDb}`);
    psql(base, "postgres", `CREATE DATABASE "${scratchDb}"`);
    const scratchUrl = buildUrl(base, scratchDb);
    console.error("[preparacion] prisma db push sobre la base efimera");
    execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "db", "push", "--schema=apps/api/prisma/schema.prisma", "--skip-generate"], {
      encoding: "utf8",
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 600000,
      env: { ...process.env, DATABASE_URL: scratchUrl }
    });
    // prisma db push tipa AuthorizationSession.id como text porque schema.prisma no declara @db.Uuid, pero la
    // migracion versionada 20260727042000_authorization_versions la crea uuid y la instantanea de autorizacion
    // la cruza con cast(... as uuid). Sin este ALTER la efimera no se parece a la base desplegada.
    const alineacion = "apps/api/prisma/migrations/20260727042000_authorization_versions/migration.sql";
    let preparacion = { resultado: "OK", detalle: "" };
    try {
      psql(base, scratchDb, `ALTER TABLE "AuthorizationSession" DROP CONSTRAINT "AuthorizationSession_pkey"
        , ALTER COLUMN "id" TYPE uuid USING "id"::uuid, ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`);
      psql(base, scratchDb, `ALTER TABLE "AuthorizationSession" ADD PRIMARY KEY ("id")`);
      const tipo = psql(base, scratchDb, `select data_type from information_schema.columns where table_name='AuthorizationSession' and column_name='id'`);
      assert.equal(tipo, "uuid", `la columna sigue en ${tipo}`);
      preparacion = { resultado: "OK", detalle: `AuthorizationSession.id = ${tipo}` };
    } catch (error) {
      preparacion = { resultado: "FALLO", detalle: String(error.stderr || error.message).slice(0, 300) };
    }
    checks.push({
      chequeo: "base_efimera_alineada_al_esquema_desplegado",
      etapa: stage,
      resultado: preparacion.resultado,
      detalle: `${scratchDb}: prisma db push + ALTER de ${path.relative(root, alineacion).replace(/\\/g, "/")} (${preparacion.detalle})`
    });

    process.env.DATABASE_URL = scratchUrl;
    process.env.NODE_ENV = "test";
    process.env.DISABLE_REDIS = "true";
    process.env.REDIS_DISABLED = "true";
    process.env.PROMETHEUS_DISABLED = "true";
    process.env.JWT_SECRET ||= "certification-admin-inactive-secret-32-chars";
    process.env.RAILWAY_GIT_COMMIT_SHA = commit;
    console.error("[arranque] cargando apps/api/server.js");
    const build = require(path.join(root, "apps/api/server.js"));
    prisma = require(path.join(root, "apps/api/src/core/prisma.js"));
    app = await build();

    stage = "arranque";
    await registrar("health_ancla_el_commit_evaluado", "200 con commit == HEAD del arbol", async () => {
      const health = await paso("GET", "/health", null, undefined);
      assert.equal(String(health.commit || "").slice(0, 12), commit.slice(0, 12), `health sirve ${health.commit}`);
      return { commit: health.commit };
    });

    stage = "inventario";
    // El gancho contable del alta (/auth/register) llama a apexos_accounting_private.ensure_standard_chart,
    // que escribe contra public.companies: esa tabla vive en el esquema Supabase y no en el de Prisma, asi que
    // el alta de empresa se fija por Prisma y TODO lo certificado vuelve a pasar por HTTP, incluido el login.
    const moduloLicencia = Array.from({ length: 27 }, (_, index) => `M-${String(index + 1).padStart(2, "0")}`);
    async function fijarEmpresa(nombre, correo, clave) {
      const tenant = await prisma.tenant.create({
        data: { name: nombre, industry: "qa", country: "CO", timezone: "America/Bogota", currency: "COP", active_modules: moduloLicencia }
      });
      const role = await prisma.role.create({
        data: { tenant_id: tenant.id, name: "APEX_ADMIN", description: "Administrador principal de la empresa", is_system: true, permissions: { create: [{ module: "*", action: "*" }] } }
      });
      const user = await prisma.user.create({
        data: { tenant_id: tenant.id, name: "Administrador certificador", email: correo, password: await bcrypt.hash(clave, 12), role_id: role.id }
      });
      const sesion = await paso("POST", "/api/v1/auth/login", null, { email: correo, password: clave });
      assert.ok(sesion.token, "el login local debe devolver sesion");
      return { tenant, user, token: sesion.token };
    }
    const emailOwner = `cert.owner.${suffix}@apex.local`;
    const clave = `Cert${suffix}!`;
    let roleId = null;
    let owner = {};
    await registrar("empresa_administradora_con_sesion_local", "tenant con licencia crown, login por HTTP y token", async () => {
      owner = await fijarEmpresa(`CERT INACTIVA ${suffix}`, emailOwner, clave);
      const me = await paso("GET", "/api/v1/auth/me", owner.token);
      const rol = me.role || me.user?.role || "";
      assert.equal(rol, "APEX_ADMIN", `el rol de la sesion es ${rol || "undefined"}`);
      return { tenant: owner.tenant.id, user: owner.user.id, rol };
    });
    const token = owner.token;
    await registrar("el_modulo_admin_esta_habilitado", "GET /admin/roles responde 200 (el filtro de modulo no rechaza)", async () => {
      const roles = await paso("GET", "/api/v1/admin/roles", token);
      const roleRows = Array.isArray(roles) ? roles : roles.items || roles.data || [];
      roleId = (roleRows.find((item) => item.name === "Empleado") || roleRows[0])?.id || null;
      assert.ok(roleId, "el tenant debe tener roles del sistema");
      return { roles: roleRows.length, role_id: roleId };
    });

    stage = "flujo";
    let created = {};
    const targetEmail = `cert.objetivo.${suffix}@apex.local`;
    await registrar("crear_cuenta_objetivo", "201 con active=true", async () => {
      created = await paso("POST", "/api/v1/admin/users", token, {
        name: "Operario certificable",
        email: targetEmail,
        password: clave,
        role_id: roleId,
        company: `CERT INACTIVA ${suffix}`,
        document: `90${suffix}`
      });
      assert.ok(created.id, "falta id en la respuesta");
      assert.equal(created.active, true);
      return { user_id: created.id, role_id: roleId };
    });
    const userId = created.id;

    let desactivado = null;
    await registrar("desactivar_responde_la_fila_inactiva", "200 con active=false", async () => {
      desactivado = await paso("PATCH", `/api/v1/admin/users/${userId}/status`, token, { active: false });
      assert.equal(desactivado.active, false);
      return { activo: desactivado.active };
    });

    await registrar("reactivar_el_mismo_id_no_es_404", "200 con active=true (aqui caia el corte)", async () => {
      const reactivado = await paso("PATCH", `/api/v1/admin/users/${userId}/status`, token, { active: true });
      assert.equal(reactivado.active, true, `reactivo pero quedo ${reactivado.active}`);
      return { user_id: reactivado.id, activo: reactivado.active };
    });

    await registrar("segundo_ciclo_desactivar_reactivar", "idempotencia: dos vueltas seguidas responden 200", async () => {
      for (const active of [false, true, false, true]) {
        const respuesta = await paso("PATCH", `/api/v1/admin/users/${userId}/status`, token, { active });
        assert.equal(respuesta.active, active, `la vuelta a active=${active} no se reflejo`);
      }
      return { ciclos: 2 };
    });

    await registrar("inactivar_de_nuevo_para_poner_la_prueba_del_adjunto", "200 con active=false", async () => {
      const respuesta = await paso("PATCH", `/api/v1/admin/users/${userId}/status`, token, { active: false });
      assert.equal(respuesta.active, false);
      return { activo: respuesta.active };
    });
    await registrar("adjuntar_documento_a_cuenta_inactiva_no_es_404", "201 pese a la soft-delete global", async () => {
      const doc = await paso("POST", `/api/v1/admin/users/${userId}/documents`, token, {
        document_type: "arl",
        file_name: `cert-${suffix}.pdf`,
        storage_path: `certificaciones/${suffix}.pdf`
      }, [201]);
      return { documento: doc?.documents?.at(-1)?.file_name || "registrado" };
    });

    await registrar("reactivar_despues_del_adjunto", "200 con active=true: la cuenta vuelve a la pantalla", async () => {
      const respuesta = await paso("PATCH", `/api/v1/admin/users/${userId}/status`, token, { active: true });
      assert.equal(respuesta.active, true);
      return { activo: respuesta.active };
    });

    stage = "aislamiento";
    let otro = {};
    await registrar("empresa_vecina_con_sesion_propia", "hace falta un vecino para medir la frontera", async () => {
      otro = await fijarEmpresa(`OTRA EMPRESA ${suffix}`, `cert.vecino.${suffix}@apex.local`, clave);
      return { tenant: otro.tenant.id };
    });
    await registrar("otro_tenant_no_reactiva_ni_en_contra_de_soft_delete", "404: la excepcion inactiva no abre la frontera", async () => {
      const respuesta = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/users/${userId}/status`,
        headers: { authorization: `Bearer ${otro.token}`, "content-type": "application/json" },
        payload: JSON.stringify({ active: true })
      });
      assert.equal(respuesta.statusCode, 404, `el vecino obtuvo ${respuesta.statusCode}`);
      return { estado: respuesta.statusCode };
    });

    stage = "persistencia";
    await registrar("el_estado_escrito_es_el_que_lee_la_base", "active=true en el listado y en la fila", async () => {
      const lista = await paso("GET", "/api/v1/admin/users?limit=200", token);
      const filas = Array.isArray(lista) ? lista : lista.items || lista.data || [];
      const fila = filas.find((item) => Number(item.id) === Number(userId));
      assert.ok(fila, `la cuenta reactivada no aparece en el listado (${filas.length} filas: ${filas.map((item) => item.id).join(",")})`);
      assert.equal(fila.active, true, `el listado dice active=${fila.active}`);
      const cruda = await prisma.user.findFirst({ where: { id: Number(userId), __includeInactive: true } });
      assert.equal(cruda?.active, true, `la fila en base dice active=${cruda?.active}`);
      return { user_id: Number(userId), listado: fila.active, columna: cruda?.active };
    });
    await registrar("la_auditoria_deja_las_vueltas", "al menos 4 registros activated/deactivated", async () => {
      const total = await prisma.auditLog.count({ where: { module: "admin", entity_id: String(userId), action: { in: ["activated", "deactivated"] } } });
      assert.ok(total >= 4, `solo hay ${total} movimientos auditados`);
      return { movimientos: total };
    });

    const resultado = {
      certification: "admin-inactive-reactivation-http-local",
      version: 1,
      certification_role: "local_e2e_support",
      environment: "LOCAL",
      status: checks.every((item) => item.resultado === "OK") ? "passed" : "failed",
      fecha: new Date().toISOString(),
      arbol: {
        rama: git(["rev-parse", "--abbrev-ref", "HEAD"]),
        commit,
        candidato_declarado: candidateLabel,
        ...coherenciaArbol(commit)
      },
      base_de_datos: { host: base.host, puerto: base.port, nombre: keepDb ? scratchDb : `${scratchDb} (descartada)` },
      cheques: checks,
      total: checks.length,
      ok: checks.filter((item) => item.resultado === "OK").length,
      fallos: checks.filter((item) => item.resultado === "FALLO").map((item) => item.chequeo),
      limitaciones: [
        "No toca Supabase Auth: certifica la ruta del API contra PostgreSQL local, que es donde vive el defecto de lectura.",
        "No sustituye la medicion en navegador ni la pata QA/Produccion despues del despliegue.",
        "No ejecuta migraciones remotas."
      ]
    };
    if (output) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, `${JSON.stringify(resultado, null, 2)}\n`);
    }
    console.log(JSON.stringify(resultado, null, 2));
    if (resultado.status !== "passed") process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
    if (!keepDb) {
      try {
        psql(base, "postgres", `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${scratchDb}'`);
        psql(base, "postgres", `DROP DATABASE IF EXISTS "${scratchDb}"`);
      } catch (error) {
        console.error(`NO SE PUDO DESCARTAR ${scratchDb}: ${error.message}`);
      }
    }
  }
})()
  .catch((error) => {
    console.error(`CERTIFICACION LOCAL BLOQUEADA: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exitCode = 1;
  })
  // El cron de la torre sigue vivo despues de app.close(): sin salida explicita el proceso no termina.
  .then(() => setTimeout(() => process.exit(process.exitCode || 0), 400));
