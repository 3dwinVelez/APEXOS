// Evidencia del porton: las dos suites de contrato y la validacion del schema, corridas DENTRO del
// arbol del candidato (no del de origen), para que lo certificado sea el arbol que se promociona.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const run = (cmd) => {
  let out = "";
  let code = 0;
  try {
    out = execSync(cmd, { encoding: "utf8", maxBuffer: 1e8 });
  } catch (e) {
    out = String(e.stdout || "") + String(e.stderr || "");
    code = e.status || 1;
  }
  const pass = Number((out.match(/^# pass (\d+)$/m) || [0, 0])[1]);
  const fail = Number((out.match(/^# fail (\d+)$/m) || [0, 0])[1]);
  return { cmd, stdout: out, exito: code === 0, pass, fail, salidas: out.split("\n").filter((l) => /^# (tests|pass|fail|cancelled)/.test(l)) };
};

const nodetest = "node --experimental-strip-types --no-warnings --test";
const doc = {
  cambio: "url-app-administrable-develop-20261125",
  ejecutado_en: new Date().toISOString(),
  arbol: "candidato " + execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim() +
    " sobre origin/develop " + execSync("git rev-parse --short origin/develop", { encoding: "utf8" }).trim(),
  nota_resolucion: "El worktree no tiene node_modules propio: se resolvio con NODE_PATH hacia el node_modules del arbol principal, sin enlaces ni copias, para no tocar el disco ni repetir la caida del 2026-11-20 (git worktree remove borrando a traves de un enlace).",
  suites: [
    run("node --test apps/api/test/admin-platform-mobile-app-url.test.js"),
    run(`${nodetest} apps/web/test/mobile-app-install.test.mjs`)
  ],
  schema_valido: (() => {
    const r = run('npx --prefix "C:/Users/mq1/Documents/Proyectos/APEXOS/apps/api" prisma validate --schema apps/api/prisma/schema.prisma');
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

doc.veredicto = (doc.suites.every((s) => s.exito && s.fail === 0 && s.pass > 0) && doc.schema_valido.exito)
  ? "AMBAS SUITES VERDES SOBRE EL ARBOL DEL CANDIDATO Y SCHEMA VALIDO"
  : "ROJO: alguna suite falla o el schema no valida";

fs.writeFileSync(path.join(DIR, "suites-candidato.json"), JSON.stringify(doc, null, 2) + "\n");
console.log(doc.veredicto);
console.log(doc.suites.map((s) => `${path.basename(s.cmd.split(" ").pop())} pass=${s.pass} fail=${s.fail} ok=${s.exito}`).join("\n"));
console.log(`schema: ${JSON.stringify(doc.schema_valido)}.crudo=${doc.schema_valido.crudo} exito=${doc.schema_valido.exito}`);
