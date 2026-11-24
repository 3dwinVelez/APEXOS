#!/usr/bin/env node
// Censo en solo lectura: puede el mismo correo pertenecer a más de una empresa?
// Responde si el `findFirst` del login, que no filtra por tenant, es un riesgo vivo o latente.
// La evidencia sale anonimizada: conteos y prefijos de hash, nunca correos ni cadenas de conexion.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseEnv } = require("./recovery-readiness.js");

const PSQL = "C:/Program Files/PostgreSQL/16/bin/psql.exe";
const CENSUS_SQL = `
begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '500ms';
select jsonb_build_object(
  'empresas', (select count(*) from "Tenant"),
  'usuarios', (select count(*) from "User"),
  'correos_distintos', (select count(distinct lower(email)) from "User"),
  'correos_en_varias_empresas', (select count(*) from (select lower(email) as e from "User" group by lower(email) having count(distinct tenant_id) > 1) x),
  'correos_repetidos_dentro_de_la_misma_empresa', (select count(*) from (select lower(email) as e, tenant_id from "User" group by lower(email), tenant_id having count(*) > 1) y),
  'empresas_del_correo_mas_compartido', (select coalesce(max(n), 0) from (select count(distinct tenant_id) as n from "User" group by lower(email)) z),
  'usuarios_inactivos', (select count(*) from "User" where active is false),
  'correos_en_varias_empresas_activos', (select count(*) from (select lower(email) as e from "User" where active is true group by lower(email) having count(distinct tenant_id) > 1) a),
  'empresas_del_correo_activo_mas_compartido', (select coalesce(max(n), 0) from (select count(distinct tenant_id) as n from "User" where active is true group by lower(email)) z),
  'muestras_anonimas', (select coalesce(jsonb_agg(jsonb_build_object('correo_hash', left(md5(w.e), 12), 'empresas', w.n)), '[]'::jsonb) from (select lower(email) as e, count(distinct tenant_id) as n from "User" group by lower(email) having count(distinct tenant_id) > 1 order by n desc limit 5) w),
  'muestras_activas_anonimas', (select coalesce(jsonb_agg(jsonb_build_object('correo_hash', left(md5(v.e), 12), 'empresas', v.n, 'activos', v.a)), '[]'::jsonb) from (select lower(email) as e, count(distinct tenant_id) as n, count(*) filter (where active is true) as a from "User" group by lower(email) having count(distinct tenant_id) > 1 order by n desc limit 8) v)
);
commit;`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i]);
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq >= 0) {
      out[token.slice(0, eq)] = token.slice(eq + 1);
    } else {
      out[token] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    }
  }
  return out;
}

function environmentLabel(file) {
  const base = path.basename(file, ".env");
  return base === "production" ? "production" : base;
}

// La cadena vive en el archivo ignorado; aqui solo se conservan los campos que describen el destino,
// nunca el usuario ni la clave. Sin esto el instrumento podia medir un ambiente y declarar el otro.
function describeTarget(uri) {
  const url = new URL(uri);
  return {
    host: url.hostname,
    port: url.port || "5432",
    base_de_datos: decodeURIComponent(url.pathname.replace(/^\//, "")),
    pooler: /pooler/.test(url.hostname),
    sslmode: url.searchParams.get("sslmode") || "sin-declarar"
  };
}

function childEnvironment(uri) {
  const url = new URL(uri);
  return {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    // `psql -c` manda todo el bloque como una consulta simple, asi que el BEGIN READ ONLY explicito cae
    // dentro de una transaccion ya abierta y su clause de solo lectura se pierde con un aviso. El piso
    // real lo pone el servidor.
    PGOPTIONS: "-c default_transaction_read_only=on",
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGCONNECT_TIMEOUT: "8",
    PGCLIENTENCODING: "UTF8",
    PGAPPNAME: "apexos_email_collision_census"
  };
}

// Un parentesis suelto en esta sentencia se paga conectandose a Produccion y recibiendo
// «syntax error at or near ;» sin decir donde. Se comprueba la forma antes de salir a la red.
function sqlBalance(sql) {
  const sinLiterales = String(sql).replace(/'(?:[^']|'')*'/g, "''");
  const abren = (sinLiterales.match(/\(/g) || []).length;
  const cierran = (sinLiterales.match(/\)/g) || []).length;
  const comillas = (String(sql).match(/'/g) || []).length;
  return abren === cierran && comillas % 2 === 0;
}

function verdict(measure) {
  if (!measure || typeof measure.correos_en_varias_empresas !== "number") return "MEDICION_INCOMPLETA";
  if (measure.correos_en_varias_empresas > 0) return "COLISION_VIVA";
  if (measure.correos_repetidos_dentro_de_la_misma_empresa > 0) return "COLISION_DENTRO_DE_EMPRESA";
  return "SIN_COLISION";
}

function parseCensus(raw) {
  const line = String(raw || "").trim().split(/\r?\n/).filter(Boolean).pop();
  if (!line) throw new Error("respuesta_vacia");
  return JSON.parse(line);
}

function runCensus({ envFile, output }) {
  const resolved = path.resolve(envFile);
  if (!fs.existsSync(resolved)) throw new Error(`env_file_no_encontrado:${resolved}`);
  const env = parseEnv(fs.readFileSync(resolved, "utf8"));
  const uri = env.DATABASE_URL || env.DIRECT_URL;
  if (!uri) throw new Error("sin_cadena_de_conexion_en_el_env_file");

  const run = spawnSync(PSQL, ["-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", CENSUS_SQL], {
    env: childEnvironment(uri),
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 30000
  });
  if (run.error) throw new Error(`psql_no_arranco:${run.error.code || run.error.message}`);
  if (run.status !== 0) throw new Error(`psql_fallo:${String(run.stderr || "").split(/\r?\n/)[0]}`);

  const measure = parseCensus(run.stdout);
  const documento = {
    instrumento: "scripts/security/auth-email-collision-census.js",
    ejecutado_en: new Date().toISOString(),
    ambiente: { env_file: path.basename(resolved), etiqueta: environmentLabel(resolved), destino: describeTarget(uri) },
    transaccion: "BEGIN READ ONLY + PGOPTIONS default_transaction_read_only=on + statement_timeout 15s + lock_timeout 500ms",
    escrituras: 0,
    medicion: measure,
    veredicto: verdict(measure),
    anonimizacion: "solo conteos y left(md5(correo),12); la consulta no devuelve correos ni ids"
  };
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(path.resolve(output), `${JSON.stringify(documento, null, 2)}\n`);
  }
  return documento;
}

function selftest() {
  const casos = [
    { nombre: "sin colision", entrada: { correos_en_varias_empresas: 0, correos_repetidos_dentro_de_la_misma_empresa: 0 }, esperado: "SIN_COLISION" },
    { nombre: "correo en dos empresas", entrada: { correos_en_varias_empresas: 2, correos_repetidos_dentro_de_la_misma_empresa: 0 }, esperado: "COLISION_VIVA" },
    { nombre: "correo repetido dentro de la empresa", entrada: { correos_en_varias_empresas: 0, correos_repetidos_dentro_de_la_misma_empresa: 1 }, esperado: "COLISION_DENTRO_DE_EMPRESA" },
    { nombre: "medicion incompleta", entrada: { usuarios: 10 }, esperado: "MEDICION_INCOMPLETA" },
    { nombre: "respuesta vacia", entrada: null, esperado: "MEDICION_INCOMPLETA" }
  ];
  const fallos = casos.filter((c) => verdict(c.entrada) !== c.esperado);
  console.log(`[censo:selftest] ${casos.length - fallos.length}/${casos.length} casos`);
  for (const f of fallos) console.log(`  FALLA ${f.nombre}: se esperaba ${f.esperado} y dio ${verdict(f.entrada)}`);
  try {
    parseCensus("");
    console.log("  FALLA parseCensus deberia rechazar la respuesta vacia");
    process.exitCode = 1;
  } catch {
    console.log("  parseCensus rechaza respuesta vacia: OK");
  }
  const destino = describeTarget("postgresql://usuario:clave@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require");
  const filtrada = JSON.stringify(destino);
  if (filtrada.includes("clave") || filtrada.includes("usuario")) {
    console.log("  FALLA describeTarget filtro credenciales");
    process.exitCode = 1;
  } else {
    console.log("  describeTarget deja solo el destino, sin usuario ni clave: OK");
  }

  // Controles sobre la propia sentencia: el censo corre contra Produccion, asi que su forma
  // se comprueba aqui y no esperando a que el servidor se queje.
  const consultas = [
    { nombre: "el verificador de balance detecta el parentesis suelto", ok: sqlBalance("select (1") === false && sqlBalance("select 1)") === false },
    { nombre: "el verificador no se asusta con un parentesis dentro de un literal", ok: sqlBalance("select '(' , 'a)b'") === true },
    { nombre: "la transaccion es de solo lectura", ok: /^\s*begin read only;/i.test(CENSUS_SQL) && /commit;/i.test(CENSUS_SQL) },
    { nombre: "el servidor, no solo el BEGIN, declara la sesion de solo lectura", ok: childEnvironment("postgresql://u:p@h:5432/db").PGOPTIONS.includes("default_transaction_read_only=on") },
    { nombre: "no escribe: sin INSERT, UPDATE, DELETE, GRANT ni ALTER", ok: !/\b(insert|update|delete|grant|alter|create|drop|truncate)\b/i.test(CENSUS_SQL) },
    { nombre: "la muestra no pide el correo crudo al exterior", ok: !/md5\(lower\(email\)\)/i.test(CENSUS_SQL) && /jsonb_agg\([^)]*w\.e/.test(CENSUS_SQL) },
    { nombre: "la sentencia esta balanceada en parentesis y comillas", ok: sqlBalance(CENSUS_SQL) },
    { nombre: "los conteos vienen de la misma tabla que consulta el login", ok: /from "User"/.test(CENSUS_SQL) && /from "Tenant"/.test(CENSUS_SQL) }
  ];
  for (const c of consultas) console.log(`  ${c.ok ? "OK" : "FALLA"}: ${c.nombre}`);
  if (consultas.some((c) => !c.ok)) process.exitCode = 1;
  return process.exitCode ? 1 : 0;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args["--selftest"]) return selftest();
  if (!args["--env-file"]) {
    console.error("Falta --env-file=config/qa.env | config/production.env (obligatorio: sin el no se sabe que ambiente se mide)");
    return 2;
  }
  try {
    const doc = runCensus({ envFile: args["--env-file"], output: args["--output"] });
    console.log(`[censo] ${doc.ambiente.etiqueta}: ${doc.veredicto} | correos en varias empresas: ${doc.medicion.correos_en_varias_empresas} | usuarios: ${doc.medicion.usuarios}`);
    if (args["--output"]) console.log(`[censo] evidencia: ${path.resolve(args["--output"])}`);
    return doc.veredicto === "COLISION_VIVA" || doc.veredicto === "MEDICION_INCOMPLETA" ? 1 : 0;
  } catch (error) {
    console.error(`[censo] error: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { parseArgs, describeTarget, sqlBalance, verdict, parseCensus, runCensus, CENSUS_SQL };
