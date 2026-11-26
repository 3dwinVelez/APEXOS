// Instrumento del porton a main: mide en SOLO LECTURA que el despliegue no pueda traer deuda ajena.
//
// Por que hace falta: el servicio de API tiene pre-deploy `npx prisma migrate deploy`. Si el arbol que
// se promociona trajera migraciones de otros frentes todavia no aplicadas, empujar a main escribiria
// DDL ajeno en Produccion sin que nadie lo pidiera. La respuesta no se deduce: se cuenta.
//
// Query: GET /rest/v1/_prisma_migrations con la service role del ambiente (config/production.env, que
// esta fuera de git por `.gitignore:7`). Solo lectura: ninguna sentencia, ningun POST/PATCH.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const RAIZ = process.cwd();
const SALIDA = process.env.LEDGER_SALIDA || path.join(RAIZ, "docs/qa/evidence/boton-abre-directo-main-20261126/ledger-produccion.json");
const REF_PRODUCCION = "jzbwzmkidfthknsohhnr";
// El env vive fuera de git (.gitignore:7 config/*.env) y el worktree del candidato no lo trae: se lee
// del arbol del puesto, nunca se copia ni se versiona.
const ARCHIVO_ENV = path.join(RAIZ, "config/production.env").replace(/\\/g, "/");
const RUTA_ENV = fs.existsSync(ARCHIVO_ENV) ? ARCHIVO_ENV
  : "C:/Users/mq1/Documents/Proyectos/APEXOS/config/production.env";

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

async function main() {
const env = leerEnv(RUTA_ENV);
if (!String(env.SUPABASE_URL || "").includes(REF_PRODUCCION)) {
  throw new Error(`config/production.env no apunta al project ref de Produccion (${REF_PRODUCCION}): el instrumento se detiene`);
}

const url = new URL(env.SUPABASE_URL + "/rest/v1/_prisma_migrations?select=migration_name,finished_at,applied_steps_count");
const respuesta = await fetch(url, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
});
if (!respuesta.ok) throw new Error(`el ledger de Produccion respondio ${respuesta.status}`);
const filas = await respuesta.json();

const aplicadas = filas.filter((f) => f.finished_at).map((f) => f.migration_name).sort();
const sinFinalizar = filas.filter((f) => !f.finished_at).map((f) => f.migration_name);

const carpeta = path.join(RAIZ, "apps/api/prisma/migrations");
const delArbol = fs.readdirSync(carpeta, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const pendientes = delArbol.filter((m) => !aplicadas.includes(m));
const doc = {
  medido_en: new Date().toISOString(),
  consulta: "GET _prisma_migrations (solo lectura, service role del ambiente)",
  head_medido: execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", cwd: RAIZ }).trim(),
  origin_main: execFileSync("git", ["rev-parse", "--short", "origin/main"], { encoding: "utf8", cwd: RAIZ }).trim(),
  filas_del_ledger: filas.length,
  terminadas: aplicadas.length,
  sin_finalizar: sinFinalizar,
  migraciones_en_el_arbol_del_candidato: delArbol.length,
  // Lo que un `prisma migrate deploy` del despliegue aplicaria en Produccion:
  aplicaria_en_produccion: pendientes,
  deuda_ajena_del_arbol: pendientes.filter((m) => m !== "20261125183000_platform_settings"),
  migraciones_de_main_no_aplicadas: delArbol
    .filter((m) => !aplicadas.includes(m))
    .filter((m) => m !== "20261125183000_platform_settings"),
  veredicto: pendientes.length === 1 && pendientes[0] === "20261125183000_platform_settings"
    ? "EL DESPLIEGUE SOLO PODRIA APLICAR LA MIGRACION PROPIA: cero deuda ajena en el arbol de main"
    : pendientes.length === 0
      ? "ARBOL Y BASE ALINEADOS: no queda ni una migracion pendiente en el arbol del candidato"
      : `ATENCION: el arbol trae ${pendientes.length} migraciones no aplicadas (${pendientes.join(", ")})`
};
fs.writeFileSync(SALIDA, JSON.stringify(doc, null, 2) + "\n");
console.log(doc.veredicto);
console.log(`ledger ${doc.filas_del_ledger} filas / ${doc.terminadas} terminadas · arbol ${doc.migraciones_en_el_arbol_del_candidato} migraciones · pending ${pendientes.join(",") || "ninguna"}`);
}

main().catch((e) => { console.error("BLOQUEADO:", e.message); process.exit(1); });
