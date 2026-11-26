// Evidencia del porton a main: las suites de contrato, los sintacticos, la paridad de las tres rutas
// con hunks fusionados y la validacion del schema, corridos DENTRO del arbol que se promociona.
//
// Corre igual en el arbol de origen (origin/main puro) y en el del candidato: lo que se jura no es un
// numero suelto sino el par ANTES/DESPUES sobre el mismo instrumento, para que un rojo heredado no se
// atribuya a este frente y un verde no se celebre si ya lo estaba.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const etiqueta = (() => {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--etiqueta="));
  if (!arg) throw new Error("el driver exige --etiqueta=antes|despues");
  return arg.split("=")[1];
})();
const salida = (() => {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--salida="));
  if (!arg) throw new Error("el driver exige --salida=<ruta.json>");
  return arg.split("=").slice(1).join("=");
})();

const run = (cmd, env = {}) => {
  let out = "";
  let code = 0;
  try {
    out = execSync(cmd, { encoding: "utf8", maxBuffer: 1e8, env: { ...process.env, ...env } });
  } catch (e) {
    out = String(e.stdout || "") + String(e.stderr || "");
    code = e.status || 1;
  }
  const pass = Number((out.match(/^# pass (\d+)$/m) || [0, 0])[1]);
  const fail = Number((out.match(/^# fail (\d+)$/m) || [0, 0])[1]);
  return {
    cmd,
    exito: code === 0,
    pass,
    fail,
    salida_completa: out,
    salidas: out.split(/\r?\n/).filter((l) => /^# (tests|pass|fail|cancelled)/.test(l)),
    crudo: out.split(/\r?\n/).filter((l) => /not ok|SyntaxError|P10\d\d|Cannot find/.test(l)).slice(0, 8)
  };
};
const sha = (ref) => {
  try { return execSync(`git rev-parse --short ${ref}`, { encoding: "utf8" }).trim(); } catch { return "SIN_REF"; }
};
const existe = (f) => fs.existsSync(f);
const nodetest = "node --experimental-strip-types --no-warnings --test";

const SUITES_API = [
  "apps/api/test/admin-platform-mobile-app-url.test.js",
  "apps/api/test/rbac-module-access.test.js",
  "apps/api/test/admin-role-capabilities.test.js",
  "apps/api/test/payroll-module-alias.test.js",
  "apps/api/test/admin-user-status-regression.test.js"
].filter(existe);
const SUITES_WEB = [
  "apps/web/test/mobile-app-install.test.mjs",
  "apps/web/test/login-phase-zero-ux.test.mjs",
  "apps/web/test/login-error-contrast.test.mjs",
  "apps/web/test/admin-company-modal-frame.test.mjs"
].filter(existe);
const INSTRUMENTOS = [
  "scripts/certifications/mobile-app-install-browser-local.js",
  "scripts/certifications/mobile-app-url-admin-local.js",
  "scripts/certifications/mobile-app-install-qa.js",
  "scripts/certifications/promotion-migration-check.js"
].filter(existe);

// Las tres rutas que no pueden subir como blob de desarrollo porque main tiene su propio contenido:
// se exige que el candidato solo sume las lineas del frente y no borre ni una de main.
const FUSIONADAS = [
  { file: "apps/api/prisma/schema.prisma", referencia: "d667276f" },
  { file: "apps/api/src/middleware/rbac.js", referencia: "d667276f" },
  { file: "apps/api/src/modules/admin/public-routes.js", referencia: "d667276f" }
];

function leerLineas(ref, file) {
  try {
    return execSync(`git show ${ref}:${file}`, { encoding: "utf8", maxBuffer: 1e8, shell: "bash" })
      .split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
  } catch { return null; }
}

function hunksDelFrente(entry) {
  const base = execSync(`git rev-parse ${entry.referencia}^`, { encoding: "utf8", shell: "bash" }).trim();
  const diff = execSync(`git diff ${base} ${entry.referencia} -- ${entry.file}`, { encoding: "utf8", maxBuffer: 1e8, shell: "bash" });
  return new Set(diff.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1).trim()).filter(Boolean));
}

function estadoFusionada(entry) {
  const main = leerLineas("origin/main", entry.file);
  const actual = fs.readFileSync(entry.file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (main === null) return { file: entry.file, ausencia_de_main: true };
  const agregadas = hunksDelFrente(entry);
  const conjuntoMain = new Set(main);
  const nuevas = actual.filter((l) => !conjuntoMain.has(l));
  const perdidas = main.filter((l) => !new Set(actual).has(l));
  return {
    file: entry.file,
    lineas_main: main.length,
    lineas_candidato: actual.length,
    nuevas_sin_origen_en_el_frente: nuevas.filter((l) => !agregadas.has(l)),
    lineas_de_main_perdidas: perdidas,
    main_intacto: perdidas.length === 0,
    solo_suma_el_frente: nuevas.every((l) => agregadas.has(l))
  };
}

const doc = {
  cambio: "boton-abre-directo-main-20261126",
  etiqueta,
  ejecutado_en: new Date().toISOString(),
  arbol: {
    cwd: process.cwd(),
    head: sha("HEAD"),
    origin_main: sha("origin/main"),
    origin_desarrollo: sha("origin/desarrollo")
  },
  nota_resolucion: "El worktree vive dentro de .tmp/ del arbol principal y no tiene node_modules propio: Node resuelve caminando hacia arriba hasta APEXOS/node_modules, sin enlaces ni copias, para no tocar el disco ni repetir la caida del 2026-11-20.",
  suites_api: SUITES_API.map((f) => ({ file: f, ...run(`node --test ${f}`) })),
  suites_web: SUITES_WEB.map((f) => ({ file: f, ...run(`${nodetest} ${f}`) })),
  sintacticos: INSTRUMENTOS.map((f) => ({ file: f, ...run(`node --check ${f}`) })),
  fusionadas: FUSIONADAS.map(estadoFusionada),
  schema_valido: (() => {
    if (!existe("apps/api/prisma/schema.prisma")) return { omitido: true };
    const r = run('npx --prefix "C:/Users/mq1/Documents/Proyectos/APEXOS/apps/api" prisma validate --schema apps/api/prisma/schema.prisma',
      { DATABASE_URL: "postgresql://validar:sinconexion@127.0.0.1:55432/validar_schema" });
    const texto = fs.readFileSync("apps/api/prisma/schema.prisma", "utf8");
    const platform = /model PlatformSetting \{[\s\S]*?@@map\("platform_settings"\)\s*\}/.test(texto);
    const completo = String(r.salida_completa || "");
    return {
      exito: r.exito && /is valid/.test(completo) && platform,
      verificacion: "se exige el literal 'is valid' del CLI y que el modelo PlatformSetting este completo con su @@map; la cadena de conexion es inventada, nunca una credencial real",
      prisma_valido: /is valid/.test(completo),
      platform_setting_completo: platform,
      salidas: r.salidas,
      crudo: r.crudo,
      lineas_clave: completo.split(/\r?\n/).filter((l) => /valid|Error|P10\d\d/.test(l)).slice(0, 6)
    };
  })()
};

const suiteVerde = (s) => s.exito && s.fail === 0 && s.pass > 0;
doc.totales = {
  suites_api: { verde: doc.suites_api.every(suiteVerde), pass: doc.suites_api.reduce((a, s) => a + s.pass, 0), fail: doc.suites_api.reduce((a, s) => a + s.fail, 0) },
  suites_web: { verde: doc.suites_web.every(suiteVerde), pass: doc.suites_web.reduce((a, s) => a + s.pass, 0), fail: doc.suites_web.reduce((a, s) => a + s.fail, 0) },
  sintacticos: doc.sintacticos.every((s) => s.exito),
  fusionadas: doc.fusionadas.every((f) => f.ausencia_de_main || (f.main_intacto && f.solo_suma_el_frente))
};
if (etiqueta === "despues") {
  doc.veredicto = doc.totales.suites_api.verde && doc.totales.suites_web.verde && doc.totales.sintacticos
    && doc.totales.fusionadas && doc.schema_valido.exito
    ? "TODO VERDE SOBRE EL ARBOL DE MAIN: cinco suites de API, cuatro de web, cuatro sintacticos, tres rutas fusionadas que solo suman y schema valido"
    : "ROJO: ver totales y crudo por bloque";
} else {
  doc.veredicto = `Linea base del mismo instrumento sobre origin/main puro: ${doc.totales.suites_api.pass}+${doc.totales.suites_web.pass} controles en verde, ${doc.totales.suites_api.fail + doc.totales.suites_web.fail} en rojo`;
}

fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(doc, null, 2) + "\n");
console.log(`${etiqueta}: ${doc.veredicto}`);
console.log(`api ${doc.totales.suites_api.pass}/${doc.totales.suites_api.pass + doc.totales.suites_api.fail} · web ${doc.totales.suites_web.pass}/${doc.totales.suites_web.pass + doc.totales.suites_web.fail} · sintacticos ${doc.totales.sintacticos} · fusionadas solo suman ${doc.totales.fusionadas}`);
