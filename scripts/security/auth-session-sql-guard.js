#!/usr/bin/env node
// Guarda en solo lectura del camino de sesion (2026-11-24).
//
// El ingreso con correo y la renovacion de sesion pasaron a decidir en UNA sentencia cada uno. Esa
// sentencia se arma en `apps/api/src/security/authorizationState.js` y llega a la base a traves de
// Prisma, de modo que un error de forma no se ve hasta que alguien intenta entrar a Produccion y
// recibe un 500 en vez de un 401. Este instrumento:
//   1. captura la sentencia y los parametros QUE EL CODIGO MANDA (no una copia, para que no se oxide),
//   2. los ejecuta contra la base del ambiente dentro de una transaccion BEGIN READ ONLY,
//   3. comprueba que devuelve las cuatro columnas del snapshot y cuantas filas trae,
//   4. mide el costo del lado del servidor (no el viaje de red, que mide el Server-Timing).
//
// Las correos nunca salen: el correo con el que se prueba la lectura por email lo elige la propia
// base con una subconsulta y lo unico que se registra es su hash.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseEnv } = require("./recovery-readiness.js");
const { describeTarget, sqlBalance } = require("./auth-email-collision-census.js");

const PSQL = "C:/Program Files/PostgreSQL/16/bin/psql.exe";
const API_SRC = path.join(__dirname, "..", "..", "apps", "api", "src");
const COLUMNAS_SNAPSHOT = ["user", "role", "tenant", "session"];
const PRECUERDA = "@@apex";
// Separador de campos de psql: el caracter 0x1f no aparece en ningun json de estas tablas. Hace falta
// porque el `execute` del snapshot devuelve CUATRO columnas por fila, no un json unico.
const SEPARADOR = String.fromCharCode(0x1f);

// ------------------------------------------------------------------ captura del codigo real
// Se stubbea `core/prisma` en el cache de require para que el modulo de autorizacion mande sus
// sentencias aqui en vez de a la base. Si manana cambia el SQL, cambia lo que se verifica.
function capturarSentencias() {
  const prismaPath = require.resolve(path.join(API_SRC, "core", "prisma"));
  const estadoPath = require.resolve(path.join(API_SRC, "security", "authorizationState"));
  const enviado = [];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { async $queryRawUnsafe(sql, ...params) { enviado.push({ sql, params }); return []; } }
  };
  delete require.cache[estadoPath];
  const estado = require(estadoPath);

  estado.readAuthorizationSnapshotsByEmail("muestra@apexos.test");
  estado.readAuthorizationSnapshot(7, "11111111-1111-4111-8111-111111111111");

  const nombres = ["login_por_correo", "perfil_por_id"];
  return enviado.map((c, i) => ({ nombre: nombres[i] || `lectura_${i}`, sql: c.sql, params: c.params }));
}

// ------------------------------------------------------------------ literales sin sorpresas
// Inlinear un parametro dentro de un .sql es lo unico de este instrumento que puede alterar la
// sintaxis de la base: se aceptan solo las formas que el codigo manda realmente y todo lo demas se
// rechaza. Los valores que vienen de la base van como subconsulta, nunca como texto.
function literal(valor) {
  if (valor === null || valor === undefined) return "null";
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (typeof valor === "boolean") return valor ? "true" : "false";
  const texto = String(valor);
  if (!/^[\w.@+-]{1,254}$/.test(texto)) throw new Error(`parametro_no_admitido:${texto.slice(0, 12)}`);
  return `'${texto.replace(/'/g, "''")}'`;
}

// Los valores reales los elige la base dentro de la propia sesion (una sola sentencia `\gset`): el
// correo con colision si existe, y una sesion viva con su dueno para ejercitar las cuatro columnas.
// El instrumento no recibe credenciales ni imprime direcciones: lo que viaja de vuelta son marcas,
// conteos y la forma de la fila.
const CABECERA = `
select coalesce(
         (select lower(email) from "User" group by lower(email) having count(distinct tenant_id) > 1 order by min(id) limit 1),
         (select lower(email) from "User" order by id limit 1)
       ) as correo,
       coalesce(
         (select s.id::text from "AuthorizationSession" s where s.revoked_at is null and s.expires_at > now() order by s.created_at desc limit 1),
         '11111111-1111-4111-8111-111111111111'
       ) as sid,
       coalesce(
         (select s.user_id from "AuthorizationSession" s where s.revoked_at is null and s.expires_at > now() order by s.created_at desc limit 1),
         (select id from "User" order by id limit 1)
       ) as uid \\gset`;

// Que variable de psql reemplaza a cada parametro capturado. `null` y los enteros siguen literales,
// porque el codigo los manda asi.
function variable(nombre, indice) {
  if (nombre === "login_por_correo" && indice === 1) return ":'correo'";
  if (nombre === "perfil_por_id" && indice === 0) return ":'sid'";
  if (nombre === "perfil_por_id" && indice === 1) return ":uid";
  return null;
}

function bloque(nombre, sql, params) {
  const literales = params.map((p, i) => variable(nombre, i) ?? literal(p));
  return [
    `select '${PRECUERDA} ${nombre} ini ' || (extract(epoch from clock_timestamp()) * 1000)::bigint;`,
    `prepare snap_${nombre} as ${sql};`,
    // `\gdesc` describe la ejecucion sin traer datos: una fila por columna con su nombre y su tipo.
    // Va entre precuerdas porque esas lineas son del formato `nombre<sep>tipo` y hay que leerlas
    // aparte de las filas del snapshot.
    `select '${PRECUERDA} ${nombre} gdes';`,
    `execute snap_${nombre}(${literales.join(", ")}) \\gdesc`,
    `select '${PRECUERDA} ${nombre} gdesfin';`,
    `select '${PRECUERDA} ${nombre} ejecu ' || (extract(epoch from clock_timestamp()) * 1000)::bigint;`,
    `execute snap_${nombre}(${literales.join(", ")});`,
    `select '${PRECUERDA} ${nombre} fin ' || (extract(epoch from clock_timestamp()) * 1000)::bigint;`,
    `deallocate snap_${nombre};`
  ].join("\n");
}

function scriptSql(sentencias) {
  return [
    "begin read only;",
    "set local statement_timeout = '15s';",
    "set local lock_timeout = '500ms';",
    CABECERA,
    ...sentencias.map((s) => bloque(s.nombre, s.sql, s.params)),
    "commit;"
  ].join("\n");
}

// Un script que escriba no es un guard: es un incidente. Se rechaza antes de conectarse, y la base
// tambien lo declara de solo lectura por sesion (ver `entornoHijo`).
function esSoloLectura(script) {
  const sinLiterales = String(script).replace(/'(?:[^']|'')*'/g, "''");
  return !/\b(insert|update|delete|merge|grant|revoke|alter|create|drop|truncate|copy|vacuum)\b/i.test(sinLiterales)
    && /^\s*begin read only;/i.test(String(script))
    && /\bcommit;/i.test(String(script));
}

// `psql -c` manda todo el bloque como una sola consulta simple, asi que el BEGIN explicito cae dentro
// de una transaccion ya abierta y su `read only` se pierde con un aviso. El piso real lo pone el
// servidor: ninguna sentencia escribe en esta sesion, sea cual sea el usuario de la cadena.
function entornoHijo(uri) {
  const url = new URL(uri);
  return {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PGOPTIONS: "-c default_transaction_read_only=on",
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGCONNECT_TIMEOUT: "8",
    PGCLIENTENCODING: "UTF8",
    PGAPPNAME: "apexos_auth_session_sql_guard"
  };
}

function parseSalida(raw, sentencias) {
  const lineas = String(raw || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const salida = sentencias.map((s) => ({ nombre: s.nombre, ok: false, filas: 0, columnas: [], tipos: [], ms_servidor: null, marcas: {} }));
  let activo = null;
  let enDescripcion = false;
  const redondear = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) * 10) / 10) : null);
  for (const linea of lineas) {
    if (linea.startsWith(PRECUERDA)) {
      const [, nombre, estado, valor] = linea.split(/\s+/);
      const registro = salida.find((s) => s.nombre === nombre);
      if (!registro) continue;
      if (valor !== undefined) registro.marcas[estado] = Number(valor);
      if (estado === "ini") activo = registro;
      if (estado === "gdes") enDescripcion = activo === registro;
      if (estado === "gdesfin") enDescripcion = false;
      if (estado === "fin" && activo === registro) {
        activo = null;
        enDescripcion = false;
        // Lo que la base cobra por la sentencia son los milisegundos entre el `execute` de datos y su
        // cierre; el bloque completo incluye el prepare y la descripcion.
        registro.ms_servidor = redondear(registro.marcas.ejecu, registro.marcas.fin);
        registro.ms_bloque = redondear(registro.marcas.ini, registro.marcas.fin);
      }
      continue;
    }
    if (!activo) continue;
    const campos = linea.split(SEPARADOR).map((c) => c.trim());
    if (enDescripcion) {
      // `\gdesc` trae una fila por columna: `nombre<sep>tipo`. Ahi se comprueba, contra la base real,
      // que el snapshot sigue proyectando usuario, rol, empresa y sesion en ese orden.
      if (campos.length === 2) {
        activo.columnas.push(campos[0].toLowerCase());
        activo.tipos.push(campos[1].toLowerCase());
      }
      continue;
    }
    if (campos.length !== COLUMNAS_SNAPSHOT.length) continue;
    const [usuario, rol, empresa, sesion] = campos.map((c) => (c === "null" || c === "" ? null : JSON.parse(c)));
    activo.filas += 1;
    if (activo.filas === 1) {
      // La fila cruda del usuario trae el hash: es exactamente por lo que existe la proyeccion del
      // servicio, y conviene dejarlo consignado en la evidencia.
      activo.trae_hash = Object.prototype.hasOwnProperty.call(usuario || {}, "password");
      activo.empresa = usuario?.tenant_id ?? null;
      activo.rol = rol?.name ?? null;
      activo.permisos = Array.isArray(rol?.permissions) ? rol.permissions.length : null;
      activo.sesion = sesion?.id ? "viva" : null;
    }
  }
  for (const registro of salida) {
    registro.ok = registro.filas > 0 && COLUMNAS_SNAPSHOT.every((c, i) => registro.columnas[i] === c);
  }
  return salida;
}

function verdict(sentencias) {
  if (!sentencias.length) return "SIN_MEDICION";
  if (sentencias.some((s) => !s.ok)) return "SENTENCIA_INVALIDA";
  return "SENTENCIAS_VALIDAS";
}

function runGuard({ envFile, output }) {
  const resolved = path.resolve(envFile);
  if (!fs.existsSync(resolved)) throw new Error(`env_file_no_encontrado:${resolved}`);
  const env = parseEnv(fs.readFileSync(resolved, "utf8"));
  const uri = env.DATABASE_URL || env.DIRECT_URL;
  if (!uri) throw new Error("sin_cadena_de_conexion_en_el_env_file");

  const sentencias = capturarSentencias();
  const script = scriptSql(sentencias);
  if (!esSoloLectura(script)) throw new Error("el script dejo de ser de solo lectura");
  if (!sentencias.every((s) => sqlBalance(s.sql))) throw new Error("sentencia_descuadrada_antes_de_salir_a_la_red");

  // `psql -c` no procesa bien los meta-comandos mezclados con SQL y la cadena es larga: el script se
  // escribe en un temporal del puesto (sin correos: solo variables de psql) y se corre con -f.
  const archivo = path.join(process.env.TEMP || os.tmpdir(), `apex-sql-guard-${process.pid}.sql`);
  fs.writeFileSync(archivo, `${script}\n`);
  let run;
  try {
    run = spawnSync(PSQL, ["-X", "-w", "-q", "-A", "-t", "-F", SEPARADOR, "-v", "ON_ERROR_STOP=1", "-f", archivo], {
      env: entornoHijo(uri),
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      timeout: 45000
    });
  } finally {
    try { fs.unlinkSync(archivo); } catch { }
  }
  if (run.error) throw new Error(`psql_no_arranco:${run.error.code || run.error.message}`);
  if (run.status !== 0) throw new Error(`psql_fallo:${String(run.stderr || "").split(/\r?\n/).find((l) => l.trim()) || "sin detalle"}`);

  const medidas = parseSalida(run.stdout, sentencias);
  const documento = {
    instrumento: "scripts/security/auth-session-sql-guard.js",
    ejecutado_en: new Date().toISOString(),
    ambiente: { env_file: path.basename(resolved), destino: describeTarget(uri) },
    transaccion: "BEGIN READ ONLY + PGOPTIONS default_transaction_read_only=on + statement_timeout 15s + lock_timeout 500ms",
    escrituras: 0,
    columnas_esperadas: COLUMNAS_SNAPSHOT,
    sentencias: medidas.map((m, i) => ({
      ...m,
      archivo: "apps/api/src/security/authorizationState.js",
      parametros: sentencias[i].params.map((p) => (typeof p === "string" && p.includes("@") ? "correo-anonimo" : p))
    })),
    veredicto: verdict(medidas),
    nota: "ms_servidor es tiempo dentro de Postgres; el viaje de red lo mide Server-Timing (~660 ms por sentencia desde Railway)",
    anonimizacion: "los correos los elige la base con subconsulta y nunca se imprimen"
  };
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(path.resolve(output), `${JSON.stringify(documento, null, 2)}\n`);
  }
  return documento;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i]);
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq >= 0) out[token.slice(0, eq)] = token.slice(eq + 1);
    else out[token] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
  }
  return out;
}

function selftest() {
  const sentencias = capturarSentencias();
  const script = scriptSql(sentencias);
  const controles = [
    { nombre: "el codigo manda dos lecturas (correo e id)", ok: sentencias.length === 2 },
    { nombre: "la lectura por correo baja de lower(u.email)", ok: /lower\(u\.email\)/.test(sentencias[0].sql) },
    { nombre: "la lectura por id sigue usando el snapshot ya desplegado", ok: /where u\.id = cast\(\$2 as int4\)/.test(sentencias[1].sql) },
    { nombre: "ambas sentencias traen usuario, rol, empresa y sesion", ok: sentencias.every((s) => /as "user"/.test(s.sql) && /as "role"/.test(s.sql) && /as "tenant"/.test(s.sql) && /as "session"/.test(s.sql)) },
    { nombre: "una sola sentencia por lectura, con su lateral de permisos", ok: sentencias.every((s) => (s.sql.match(/\bselect\b/gi) || []).length === 2) },
    { nombre: "el script es BEGIN READ ONLY y cierra con COMMIT", ok: /^\s*begin read only;/i.test(script) && /\bcommit;/i.test(script) },
    { nombre: "el script no escribe", ok: esSoloLectura(script) },
    { nombre: "un UPDATE inyectado en el script lo rechaza el propio guard", ok: esSoloLectura(`${script}\nupdate "User" set active = false;`) === false },
    { nombre: "la sesion se abre con read-only del servidor, no solo con el BEGIN", ok: entornoHijo("postgresql://u:p@h:5432/db").PGOPTIONS.includes("default_transaction_read_only=on") },
    { nombre: "la cabecera busca primero un correo que si este en varias empresas", ok: /having count\(distinct tenant_id\) > 1/.test(script) && script.includes("\\gset") },
    { nombre: "los valores reales entran por variable de psql, nunca copiados del codigo", ok: /execute snap_login_por_correo\(null, :'correo', 8\)/.test(script) && /execute snap_perfil_por_id\(:'sid', :uid\)/.test(script) },
    { nombre: "las sentencias estan balanceadas en parentesis y comillas", ok: sentencias.every((s) => sqlBalance(s.sql)) },
    { nombre: "un correo raro no se inlinea: se rechaza", ok: acepta(() => literal("a@b.test")) && rechaza(() => literal("x'); drop table y; --")) },
    { nombre: "el parseo reconoce las marcas, la descripcion y las filas", ok: pruebaParseo() },
    { nombre: "si el snapshot pierde una columna, el guard la declara invalida", ok: pruebaColumnaRota() },
    { nombre: "sin filas no hay veredicto valido", ok: verdict([{ nombre: "x", ok: false }]) === "SENTENCIA_INVALIDA" && verdict([]) === "SIN_MEDICION" }
  ];
  let fallos = 0;
  for (const c of controles) {
    if (!c.ok) fallos += 1;
    console.log(`  ${c.ok ? "OK" : "FALLA"}: ${c.nombre}`);
  }
  console.log(`[guard:selftest] ${controles.length - fallos}/${controles.length} controles`);
  return fallos ? 1 : 0;
}

function acepta(fn) { try { fn(); return true; } catch { return false; } }
function rechaza(fn) { try { fn(); return false; } catch { return true; } }

function brutoParseo(columnas = ["user", "role", "tenant", "session"]) {
  const sentencias = [{ nombre: "login_por_correo", sql: "select 1", params: [null, "a@b.test", 8] }];
  const fila = (usuario, rol, empresa, sesion) => [usuario, rol, empresa, sesion].map((c) => JSON.stringify(c)).join(SEPARADOR);
  const cruda = [
    `${PRECUERDA} login_por_correo ini 1000`,
    `${PRECUERDA} login_por_correo gdes`,
    ...columnas.map((c) => [c, "jsonb"].join(SEPARADOR)),
    `${PRECUERDA} login_por_correo gdesfin`,
    `${PRECUERDA} login_por_correo ejecu 1040`,
    fila({ id: 7, password: "$2b$12$x", tenant_id: "e1" }, { name: "Tecnico", permissions: [1, 2] }, { id: "e1" }, null),
    fila({ id: 8, password: "$2b$12$y", tenant_id: "e2" }, null, { id: "e2" }, null),
    `${PRECUERDA} login_por_correo fin 1090`
  ].join("\n");
  return { sentencias, medidas: parseSalida(cruda, sentencias) };
}

function pruebaParseo() {
  const { medidas } = brutoParseo();
  const m = medidas[0] || {};
  return medidas.length === 1
    // Dos filas del MISMO correo: es el caso que el `findFirst` resuelve escogiendo una al azar.
    && m.filas === 2
    && m.ok === true
    && m.columnas.join(",") === "user,role,tenant,session"
    && m.tipos.join(",") === "jsonb,jsonb,jsonb,jsonb"
    // El tiempo del servidor es del execute (1090-1040), no del bloque con prepare y descripcion.
    && m.ms_servidor === 50
    && m.ms_bloque === 90
    && m.trae_hash === true
    && m.permisos === 2
    && m.sesion === null;
}

function pruebaColumnaRota() {
  // Si alguien le quita la empresa al snapshot, el guard tiene que declararlo invalido aunque la
  // sentencia corra y traiga filas.
  const { medidas } = brutoParseo(["user", "role", "sesion"]);
  return medidas[0].filas === 2 && medidas[0].ok === false;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args["--selftest"]) process.exitCode = selftest();
  else if (!args["--env-file"]) {
    console.error("Falta --env-file=config/qa.env | config/production.env (obligatorio: sin el no se sabe que ambiente se guarda)");
    process.exitCode = 2;
  } else {
    try {
      const doc = runGuard({ envFile: args["--env-file"], output: args["--output"] });
      const resumen = doc.sentencias.map((s) => `${s.nombre}=${s.filas} filas/${s.ms_servidor ?? "?"} ms`).join(" | ");
      console.log(`[guard] ${doc.ambiente.destino.base_de_datos}: ${doc.veredicto} | ${resumen}`);
      if (args["--output"]) console.log(`[guard] evidencia: ${path.resolve(args["--output"])}`);
      process.exitCode = doc.veredicto === "SENTENCIAS_VALIDAS" ? 0 : 1;
    } catch (error) {
      console.error(`[guard] error: ${error.message}`);
      process.exitCode = 1;
    }
  }
  return process.exitCode;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { capturarSentencias, literal, variable, scriptSql, esSoloLectura, parseSalida, verdict, runGuard, COLUMNAS_SNAPSHOT, PRECUERDA };
