// Contabilidad del porton a main: se escribe DESPUES del empuje, porque describe la punta empujada.
// Los numero salen de comandos; la narrativa de cada compuerta se copio del resultado de esa corrida.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const g = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const full = (ref) => g(["rev-parse", ref]);
const short = (ref) => g(["rev-parse", "--short", ref]);
const blob = (ref, f) => (g(["ls-tree", ref, "--", f]).split(/\s+/)[2] || null);

const BASE = "backup/premain-boton-20261126";
const CANDIDATO = full("origin/main");
const rutas = g(["diff", "--name-status", `${BASE}..${CANDIDATO}`]).split(/\r?\n/).filter(Boolean)
  .map((l) => { const p = l.split("\t"); return { status: p[0].slice(0, 1), file: p[p.length - 1] }; });
const carry = rutas.filter((r) => blob(CANDIDATO, r.file) === blob("origin/desarrollo", r.file));
const diverge = rutas.filter((r) => blob(CANDIDATO, r.file) !== blob("origin/desarrollo", r.file));
const producto = rutas.filter((r) => /^(apps|scripts)\//.test(r.file));

const doc = {
  change_id: "boton-abre-directo-main-20261126",
  medido_en: new Date().toISOString(),
  puntas: {
    "origin/main_antes": full("backup/premain-boton-20261126"),
    "origin/main_despues": CANDIDATO,
    "origin/develop": full("origin/develop"),
    "origin/desarrollo_al_empacar": "6196d18e42f2731f70df2386a416f6db92de1326"
  },
  respaldo: { tag_local: "backup/premain-boton-20261126", sha: full("backup/premain-boton-20261126") },
  arbol_del_candidato: {
    base: "origin/main " + short("backup/premain-boton-20261126"),
    commits: [
      { sha: "58551b8a", que_hace: "merge `-s ours` con origin/desarrollo: cero bytes cambiados, solo ancla el commit certificado como ancestro" },
      { sha: "39a54b76", que_hace: "el frente completo: 31 rutas de blob liso y 3 rutas con hunks fusionados" },
      { sha: "3848b2ce", que_hace: "evidence del porton: el driver, sus dos corridas y la medició del ledger de Producción" },
      { sha: "0dd67a5b", que_hace: "generador de manifiestos, invariantes de replay y su control de mutación" },
      { sha: "0ec1cff0", que_hace: "plegado de los once archivos de documentación ya publicados en origin/desarrollo: cero rutas de producto" }
    ],
    rutas_del_diff: rutas.length,
    rutas_de_producto_e_instrumentos: producto.length,
    carry_byte_a_byte: carry.length,
    divergentes: diverge.map((r) => r.file),
    nota_divergencia: "Las tres rutas divergentes son las compartidas con otros frentes (schema.prisma, rbac.js, public-routes.js). Estan declaradas una por una en origin_waivers del manifiesto de alcance y su contenido se afirmo por linea: cero lineas de main perdidas y toda linea nueva pertenece al patch de d667276f."
  },
  compuertas: {
    "porton_de_alcance": "ALCANCE DE PROMOCION VALIDO: boton-abre-directo-main-20261126 (45 rutas, transporte por ascendencia del commit certificado, origen verificado contra origin/desarrollo)",
    "aprobacion_qa": "APROBACION QA VALIDA: boton-abre-directo-main-20261126",
    "control_de_mutacion_del_porton": "con origin_waivers vacios el mismo porton responde ALCANCE DE PROMOCION INVALIDO: contenido sin origen en desarrollo, no se promociona: [M:apps/api/prisma/schema.prisma, M:apps/api/src/middleware/rbac.js, M:apps/api/src/modules/admin/public-routes.js]",
    "control_de_mutacion_de_la_aprobacion": "con environment=LOCAL y checks.functional.status=pending responde APROBACION QA BLOQUEADA con las dos lineas `- environment debe ser QA` y `- checks.functional.status debe ser passed`",
    "gobernanza": "sin la bandera: GOBIERNO GIT BLOQUEADO: Promocion develop-to-main requiere APEXOS_PROMOTION_AUTH=AUTORIZO_PROMOVER_DEVELOP_A_MAIN · con la bandera: salida 0",
    "invariantes_de_replay": "INVARIANTES DE REPLAY VALIDAS: 31/31 (spec del porton) y el mismo instrumento sobre el arbol ya plegado",
    "control_de_mutacion_del_instrumento": "CONTROL DE MUTACION VALIDO: 3 derivas medidas",
    "dry_run": "e3c2ad17..0ec1cff0 0ec1cff0 -> main (fast-forward del target certificado, cero fuerza)",
    "empuje": "e3c2ad17..0ec1cff0 confirmado con git ls-remote: refs/heads/main = " + CANDIDATO
  },
  suites: {
    antes_origin_main: "api 20/20 · web 21/21 · sintacticos 3/3 · schema sin PlatformSetting",
    despues_candidato: "api 31/31 · web 40/40 · sintacticos 4/4 · fusionadas 3/3 solo suman · prisma validate 'is valid'",
    archivo_antes: "../evidence/boton-abre-directo-main-20261126/suites-antes.json",
    archivo_despues: "../evidence/boton-abre-directo-main-20261126/suites-despues.json"
  },
  base_de_produccion: {
    lectura: "solo lectura del ledger por REST (GET _prisma_migrations), ninguna sentencia",
    filas: 72,
    terminadas: 71,
    sin_finalizar: ["20260814003500_sales_invoicing_cxc"],
    migraciones_del_arbol_del_candidato: 72,
    unicas_pendientes_en_produccion: ["20261125183000_platform_settings"],
    deuda_ajena_que_subria_un_deploy: [],
    consecuencia: "El pre-deploy del servicio (`npx prisma migrate deploy`) no puede traer mas que la migración propia: las 71 del árbol de main ya están aplicadas. Este portón no ejecutó ninguna escritura en la base; lo que el despliegue haga queda dicho aqui y se comprueba despues.",
    archivo: "../evidence/boton-abre-directo-main-20261126/ledger-produccion.json"
  },
  linea_base_antes_del_despliegue: {
    "health_commit": "e3c2ad171946",
    "GET /api/v1/public/platform/mobile-app": 404,
    medido: "curl contra el host del API de Producción, minutos después del empuje y antes de que el despliegue terminara"
  },
  verificado_local: {
    "rama_trabajo": "desarrollo",
    "candidato": "HEAD despegado en .tmp/wt-main-boton-20261126, sin rama nueva",
    "validadores_usados": "los canonicos de origin/desarrollo (main trae versiones mas viejas de los tres: validate-promotion-scope a98fc805 vs 7d0b5dfa, validate-change-approval-evidence 904132f9 vs 9a0b7651, git-governance-guard 6dfa53f8 vs 21aae5c1)"
  }
};

const salida = process.argv[2] || "docs/qa/evidence/boton-abre-directo-main-20261126/porton-main.json";
fs.writeFileSync(salida, JSON.stringify(doc, null, 2) + "\n");
console.log(`contabilidad escrita en ${salida}: ${rutas.length} rutas, ${carry.length} carry, ${diverge.length} waiver, main ${CANDIDATO.slice(0, 12)}`);
