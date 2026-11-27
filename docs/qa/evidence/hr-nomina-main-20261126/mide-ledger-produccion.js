// Instrumento del porton hr-nomina-horarios-main-20261126.
// Mide en SOLO LECTURA que el despliegue del candidato no puede aplicar DDL en Produccion.
//
// Diferencia con el instrumento del porton anterior (boton-abre-directo): alli el arbol de main
// traia UNA migracion propia pendiente (20261125183000_platform_settings) y el veredicto la
// excluia. Este frente no trae ninguna migracion, asi que la lista de "propias" queda vacia y
// cualquier pendiente que aparezca es deuda ajena y bloquea el despliegue.
//
// Query: GET /rest/v1/_prisma_migrations con la service role del ambiente (config/production.env,
// fuera de git por `.gitignore:7`). Cero sentencias, cero POST/PATCH: leer un ledger no escribe.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const RAIZ = process.cwd();
const SALIDA = path.join(RAIZ, "docs/qa/evidence/hr-nomina-main-20261126/ledger-produccion.json");
const REF_PRODUCCION = "jzbwzmkidfthknsohhnr";
const MIGRACIONES_PROPIAS_DE_ESTE_FRENTE = [];
// El env vive fuera de git: se lee del arbol del puesto, nunca se copia ni se versiona.
const RUTA_ENV = fs.existsSync(path.join(RAIZ, "config/production.env"))
  ? path.join(RAIZ, "config/production.env")
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

// El arbol medido es el del candidato (HEAD de este worktree), no el del puesto.
function migracionesDelArbolMedido(ref) {
  return execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "apps/api/prisma/migrations"], { encoding: "utf8", cwd: RAIZ })
    .split(/\r?\n/).filter((l) => l.endsWith("/migration.sql"))
    .map((l) => l.split("/").slice(-2)[0]).sort();
}

async function main() {
  const env = leerEnv(RUTA_ENV);
  if (!String(env.SUPABASE_URL || "").includes(REF_PRODUCCION)) {
    throw new Error(`config/production.env no apunta al project ref de Produccion (${REF_PRODUCCION}): el instrumento se detiene`);
  }
  const url = new URL(env.SUPABASE_URL + "/rest/v1/_prisma_migrations?select=migration_name,finished_at,applied_steps_count");
  const respuesta = await fetch(url, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!respuesta.ok) throw new Error(`el ledger de Produccion respondio ${respuesta.status}`);
  const filas = await respuesta.json();

  const aplicadas = filas.filter((f) => f.finished_at).map((f) => f.migration_name).sort();
  const sinFinalizar = filas.filter((f) => !f.finished_at).map((f) => f.migration_name);
  const delArbol = migracionesDelArbolMedido("HEAD");
  const delMain = migracionesDelArbolMedido("origin/main");
  const pendientes = delArbol.filter((m) => !aplicadas.includes(m));
  const doc = {
    medido_en: new Date().toISOString(),
    consulta: "GET _prisma_migrations (solo lectura, service role del ambiente)",
    candidato: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: RAIZ }).trim(),
    origin_main: execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8", cwd: RAIZ }).trim(),
    filas_del_ledger: filas.length,
    terminadas: aplicadas.length,
    sin_finalizar: sinFinalizar,
    migraciones_en_el_arbol_del_candidato: delArbol.length,
    migraciones_en_el_arbol_de_origin_main: delMain.length,
    iguales_al_arbol_de_main: delArbol.length === delMain.length && delArbol.every((m, i) => m === delMain[i]),
    aplicaria_en_produccion: pendientes,
    deuda_ajena_del_arbol: pendientes.filter((m) => !MIGRACIONES_PROPIAS_DE_ESTE_FRENTE.includes(m)),
    veredicto: pendientes.length === 0
      ? "CERO DDL: el arbol del candidato no trae ninguna migracion sin aplicar en Produccion"
      : `BLOQUEADO: el despliegue aplicaria ${pendientes.length} migraciones (${pendientes.join(", ")})`,
    // Control de contraste: el mismo calculo sobre el arbol de origin/develop (que si trae las 3
    // migraciones biomtricas) tiene que dar rojo. Un check que no puede fallar no certifica nada.
    control_de_mutacion: (() => {
      const delDevelop = migracionesDelArbolMedido("origin/develop");
      const pendDevelop = delDevelop.filter((m) => !aplicadas.includes(m));
      return {
        arbol: "origin/develop",
        migraciones: delDevelop.length,
        pendientes: pendDevelop,
        pudo_fallar: pendDevelop.length > 0,
        esperado: "rojo: develop trae DDL que Produccion no tiene",
        resultado: pendDevelop.length > 0 ? "rojo (detectado)" : "VERDE INDEBIDO: el instrumento no puede fallar"
      };
    })()
  };
  if (SALIDA && fs.existsSync(SALIDA)) throw new Error(`la evidencia ya existe (${path.basename(SALIDA)}): un rojo no pisa la corrida buena`);
  fs.writeFileSync(SALIDA, JSON.stringify(doc, null, 2) + "\n");
  console.log(doc.veredicto);
  console.log(`ledger ${doc.filas_del_ledger} filas / ${doc.terminadas} terminadas · arbol candidato ${doc.migraciones_en_el_arbol_del_candidato} · arbol main ${doc.migraciones_en_el_arbol_de_origin_main} · pendiente ${pendientes.join(",") || "ninguna"}`);
  console.log(`control de contraste (origin/develop): ${doc.control_de_mutacion.migraciones} migraciones, ${doc.control_de_mutacion.pendientes.length} pendientes -> ${doc.control_de_mutacion.resultado}`);
  if (!doc.control_de_mutacion.pudo_fallar) { console.error("BLOQUEADO: el control de contraste no puede fallar"); process.exit(1); }
}

main().catch((e) => { console.error("BLOQUEADO:", e.message); process.exit(1); });
