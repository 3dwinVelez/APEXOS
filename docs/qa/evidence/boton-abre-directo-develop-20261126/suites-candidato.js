// Evidencia del porton: las dos suites de contrato, los cuatro sintacticos y la validacion del schema,
// corridos DENTRO del arbol del candidato (no del de origen), para que lo certificado sea el arbol que
// se promociona.
//
// Por que hace falta este instrumento aqui: el boton que abre directo vive en AppInstallBand.tsx y su
// contrato en mobile-app-install.test.mjs, pero la certificacion de 137 controles se midio sobre el
// artefacto de desarrollo. En develop el arbol es otro (cientos de commits atras), asi que lo que se
// jura es que ESTE arbol pasa sus contratos y que sus rutas son byte a byte las certificadas.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
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
  return { cmd, stdout: out, exito: code === 0, pass, fail, salidas: out.split("\n").filter((l) => /^# (tests|pass|fail|cancelled)/.test(l)), crudo: out.split("\n").filter((l) => /not ok|Error|P10\d\d|SyntaxError/.test(l)).slice(0, 6) };
};

const sha = (ref) => execSync(`git rev-parse --short ${ref}`, { encoding: "utf8" }).trim();
const nodetest = "node --experimental-strip-types --no-warnings --test";
const INSTRUMENTOS = [
  "scripts/certifications/mobile-app-install-browser-local.js",
  "scripts/certifications/mobile-app-url-admin-local.js",
  "scripts/certifications/mobile-app-install-qa.js",
  "scripts/certifications/mobile-app-url-admin-qa.js"
];

const doc = {
  cambio: "boton-abre-directo-develop-20261126",
  ejecutado_en: new Date().toISOString(),
  arbol: `candidato ${sha("HEAD")} sobre origin/develop ${sha("origin/develop")}, contenido de origin/desarrollo ${sha("origin/desarrollo")}`,
  nota_resolucion: "El worktree vive dentro de .tmp/ del arbol principal y no tiene node_modules propio: Node resuelve caminando hacia arriba hasta APEXOS/node_modules, sin enlaces ni copias, para no tocar el disco ni repetir la caida del 2026-11-20 (git worktree remove borrando a traves de un enlace). packages/ no viaja en este porton y ninguna de sus rutas se toca.",
  suites: [
    run("node --test apps/api/test/admin-platform-mobile-app-url.test.js"),
    run(`${nodetest} apps/web/test/mobile-app-install.test.mjs`)
  ],
  sintacticos: INSTRUMENTOS.map((f) => ({ file: f, ...run(`node --check ${f}`) })),
  // El arnes de navegador contra el ambiente no puede afirmar sin fixture: si alguien le quita la
  // bandera, tiene que negarse a correr. Se verifica el rechazo, no el verde.
  rechazos_del_arnes_de_ambiente: (() => {
    const sinFixture = run("node scripts/certifications/mobile-app-install-qa.js --origin=https://apexos-web-qa-production.up.railway.app --output=docs/qa/evidence/boton-abre-directo-develop-20261126/probe.json");
    const origenProduccion = run("node scripts/certifications/mobile-app-install-qa.js --fixture=no-existe.json --origin=https://app.apexos.com.co --output=docs/qa/evidence/boton-abre-directo-develop-20261126/probe.json");
    return {
      sin_fixture_rechaza: !sinFixture.exito && /fixture/.test(sinFixture.crudo.join("\n")),
      origen_de_produccion_rechaza: !origenProduccion.exito,
      motivo_sin_fixture: sinFixture.crudo.join(" ").slice(0, 160),
      motivo_produccion: origenProduccion.crudo.join(" ").slice(0, 160)
    };
  })(),
  schema_valido: (() => {
    // `prisma validate` no abre conexion: solo necesita que la variable exista para parsear. Se le da
    // un destino inventado del puesto, nunca una cadena de ambiente real, para no leer credenciales.
    const r = run('npx --prefix "C:/Users/mq1/Documents/Proyectos/APEXOS/apps/api" prisma validate --schema apps/api/prisma/schema.prisma',
      { DATABASE_URL: "postgresql://validar:sinconexion@127.0.0.1:55432/validar_schema" });
    const crudo = String(r.stdout);
    const texto = fs.readFileSync("apps/api/prisma/schema.prisma", "utf8");
    const platform = /model PlatformSetting \{[\s\S]*?@@map\("platform_settings"\)\s*\}/.test(texto);
    return {
      exito: r.exito && /is valid/.test(crudo) && !/Error|P10\d\d/.test(crudo) && platform,
      verificacion: "se exige el literal 'is valid' del CLI, ausencia de codigos P10xx y que el modelo PlatformSetting este completo con su @@map",
      prisma_valido: /is valid/.test(crudo),
      sin_error_de_schema: !/Error|P10\d\d/.test(crudo),
      platform_setting_completo: platform,
      crudo: crudo.split("\n").filter((l) => /valid|Error|P10\d\d/.test(l)).join(" | ")
    };
  })()
};

doc.veredicto = (doc.suites.every((s) => s.exito && s.fail === 0 && s.pass > 0)
  && doc.sintacticos.every((s) => s.exito)
  && doc.rechazos_del_arnes_de_ambiente.sin_fixture_rechaza
  && doc.rechazos_del_arnes_de_ambiente.origen_de_produccion_rechaza
  && doc.schema_valido.exito)
  ? "TODO VERDE SOBRE EL ARBOL DEL CANDIDATO: dos suites, cuatro sintacticos, dos rechazos exigidos y schema valido"
  : "ROJO: alguna pata falla sobre el arbol del candidato";

fs.writeFileSync(path.join(DIR, "suites-candidato.json"), JSON.stringify(doc, null, 2) + "\n");
console.log(doc.veredicto);
for (const s of doc.suites) console.log(`${path.basename(s.cmd.split(" ").pop())} pass=${s.pass} fail=${s.fail} ok=${s.exito}`);
for (const s of doc.sintacticos) console.log(`check ${path.basename(s.file)} ok=${s.exito}`);
console.log(`rechazos: ${JSON.stringify(doc.rechazos_del_arnes_de_ambiente)}`);
console.log(`schema: exito=${doc.schema_valido.exito} ${doc.schema_valido.crudo}`);
