// Deja el checksum de la migracion propia en el ledger de Produccion igual al blob de git.
//
// Por que hace falta: el puesto tiene `core.autocrlf=true`, así que el arbol materializado del
// candidato trae el `migration.sql` con CRLF. `prisma migrate deploy` corriendo desde ese arbol
// registro el SHA-256 de los bytes CRLF (670d97...) y no el del blob (34031a...), que es el que
// tiene QA. Un checksum que no coincide con el archivo versionado convierte el proximo contraste
// de ledger en un falso fallo y empuja a "corregir" el ledger en vez del producto.
//
// El valor canónico se saca del blob (`git cat-file`), nunca del arbol de trabajo, para que la
// correccion no dependa de como este configurado el checkout.
//
// Salvaguardas: UNA fila de `_prisma_migrations`, UNA columna (`checksum`), y solo si hoy vale el
// hash CRLF conocido. No toca DDL, no toca datos de clientes, no borra filas.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const RAIZ = process.cwd();
const REF_PRODUCCION = "jzbwzmkidfthknsohhnr";
const MIGRACION = "20261125183000_platform_settings";
const RUTA_SQL = `apps/api/prisma/migrations/${MIGRACION}/migration.sql`;
const HASH_CRLF_ESPERADO = "670d97219a259b4d4c7dd5416eb47f2cbb2fc64b08df29f287fd173f9e9f75d4";
const SALIDA = process.env.CHECKSUM_SALIDA || path.join(RAIZ, "docs/qa/evidence/boton-abre-directo-main-20261126/checksum-corregido.json");

const ARCHIVO_ENV = [path.join(RAIZ, "config/production.env"), "C:/Users/mq1/Documents/Proyectos/APEXOS/config/production.env"]
  .find((r) => fs.existsSync(r));

function leerEnv(ruta) {
  const env = {};
  for (const linea of fs.readFileSync(ruta, "utf8").split(/\r?\n/)) {
    if (!linea || linea.startsWith("#")) continue;
    const i = linea.indexOf("=");
    if (i < 0) continue;
    env[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return env;
}

async function leerFila(env) {
  const u = new URL(`${env.SUPABASE_URL}/rest/v1/_prisma_migrations?select=migration_name,finished_at,applied_steps_count,checksum&migration_name=eq.${MIGRACION}`);
  const r = await fetch(u, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!r.ok) throw new Error(`el ledger respondio ${r.status}`);
  const filas = await r.json();
  if (filas.length !== 1) throw new Error(`esperaba 1 fila y hay ${filas.length}: el instrumento se detiene`);
  return filas[0];
}

async function main() {
  if (!ARCHIVO_ENV) throw new Error("no hay config/production.env en este puesto");
  const env = leerEnv(ARCHIVO_ENV);
  if (!String(env.SUPABASE_URL || "").includes(REF_PRODUCCION)) {
    throw new Error(`el env no apunta al project ref de Produccion (${REF_PRODUCCION}): se detiene sin conectar`);
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL vacio: se detiene sin conectar");

  const blob = execFileSync("git", ["cat-file", "blob", `HEAD:${RUTA_SQL}`], { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 });
  const canonico = crypto.createHash("sha256").update(blob).digest("hex");
  const delArbol = crypto.createHash("sha256").update(fs.readFileSync(path.join(RAIZ, RUTA_SQL))).digest("hex");

  const antes = await leerFila(env);
  const doc = {
    medido_en: new Date().toISOString(),
    migracion: MIGRACION,
    checksum_canonico_del_blob: canonico,
    checksum_del_arbol_de_trabajo: delArbol,
    antes: antes,
    accion: null
  };

  if (antes.checksum === canonico) {
    doc.accion = "NO_HACE_FALTA: el ledger ya tiene el hash del blob";
  } else if (antes.checksum !== HASH_CRLF_ESPERADO) {
    throw new Error(`el ledger tiene un checksum inesperado (${antes.checksum}): no se escribe, hay que mirar primero`);
  } else {
    const sql = `UPDATE "_prisma_migrations" SET "checksum" = '${canonico}' WHERE "migration_name" = '${MIGRACION}' AND "checksum" = '${HASH_CRLF_ESPERADO}';`;
    // El CLI invocado por su entry de Node, no por `npx`: en Windows `npx` es un .bat que exige
    // shell, y con shell la DATABASE_URL (que lleva `&` en la cadena de conexion) se rompe.
    const CLI = path.join(RAIZ, "node_modules/prisma/build/index.js");
    const ejec = spawnSync(process.execPath, [CLI, "db", "execute", "--url", env.DATABASE_URL, "--stdin"], {
      input: sql, encoding: "utf8", cwd: RAIZ
    });
    if (ejec.status !== 0) {
      const salida = [ejec.stdout, ejec.stderr, ejec.error && ejec.error.message].filter(Boolean).join(" ").trim();
      throw new Error(`el UPDATE no se ejecuto (salida completa): ${salida.slice(-400) || "el proceso no produjo salida"}`);
    }
    doc.accion = "UPDATE de UNA fila, UNA columna (checksum), con la guarda del hash anterior en el WHERE";
    doc.despues = await leerFila(env);
    doc.veredicto = doc.despues.checksum === canonico
      ? "LEDGER DE PRODUCCION ALINEADO CON EL BLOB: el checksum ya coincide con QA y con git"
      : `FALLO: el ledger sigue con ${doc.despues.checksum}`;
  }

  fs.writeFileSync(SALIDA, JSON.stringify(doc, null, 2) + "\n");
  console.log(doc.veredicto || doc.accion);
  console.log(`antes ${antes.checksum.slice(0, 12)}… -> canonico ${canonico.slice(0, 12)}… · aplicado ${antes.applied_steps_count} paso(s)`);
}

main().catch((e) => { console.error("BLOQUEADO:", e.message); process.exit(1); });
