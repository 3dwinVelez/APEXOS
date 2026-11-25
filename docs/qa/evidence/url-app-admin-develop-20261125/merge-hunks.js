// Evidencia del porton desarrollo->develop del enlace administrable: prueba que las tres rutas
// que chocan llevan MIS hunks (ni una linea mas) y que las lineas de otros frentes sobreviven.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname);
const sh = (cmd) => execSync(cmd, { encoding: "utf8", maxBuffer: 1e8 }).trim();
const lines = (diff, sign) =>
  diff.split("\n").filter((l) => l.startsWith(sign) && !l.startsWith(sign + sign));
const count = (file, token) => sh(`git grep -c -F "${token}" -- "${file}" || echo 0`).split(":").pop();

const MERGED = [
  "apps/api/prisma/schema.prisma",
  "apps/api/src/middleware/rbac.js",
  "apps/web/app/dashboard/administracion/page.tsx"
];

// Lo que NO es de este frente y vive en develop: si el replay lo borra, promociona un frente ajeno
// o revierte un trabajo de la rama. Cada control dice si la linea debe existir o no.
const AJENAS = {
  "apps/api/prisma/schema.prisma": [
    { token: "model ApexComponent", esperado: "ausente" },
    { token: "model ApexHealthSample", esperado: "ausente" },
    { token: "model ApexEvent", esperado: "ausente" },
    { token: "polling_minutes  Int      @default(15)", esperado: "presente" }
  ],
  "apps/api/src/middleware/rbac.js": [{ token: '"apex-control"', esperado: "ausente" }],
  "apps/web/app/dashboard/administracion/page.tsx": [
    { token: 'title: "Marcaciones"', esperado: "ausente" }
  ]
};

const rutas = MERGED.map((f) => {
  const mine = sh(`git diff c682bdf4 d667276f -- "${f}"`);
  const cand = sh(`git diff origin/develop -- "${f}"`);
  const ma = lines(mine, "+"), ca = lines(cand, "+");
  const mr = lines(mine, "-"), cr = lines(cand, "-");
  return {
    file: f,
    mi_patch: { anadidas: ma.length, quitadas: mr.length },
    candidato_vs_develop: { anadidas: ca.length, quitadas: cr.length },
    anadidas_identicas: JSON.stringify(ma) === JSON.stringify(ca),
    quitadas_identicas: JSON.stringify(mr) === JSON.stringify(cr)
  };
});

const conservacion = MERGED.map((f) => ({
  file: f,
  controles: AJENAS[f].map((c) => {
    const n = Number(count(f, c.token));
    return { token: c.token, esperado: c.esperado, apariciones: n, ok: c.esperado === "presente" ? n > 0 : n === 0 };
  })
}));

const hunksOk = rutas.every((r) => r.anadidas_identicas && r.quitadas_identicas &&
  r.mi_patch.anadidas === r.candidato_vs_develop.anadidas &&
  r.mi_patch.quitadas === r.candidato_vs_develop.quitadas);
const ajenasOk = conservacion.every((c) => c.controles.every((x) => x.ok));

const doc = {
  cambio: "url-app-administrable-develop-20261125",
  ejecutado_en: new Date().toISOString(),
  rama_destino: "origin/develop " + sh("git rev-parse --short origin/develop"),
  criterio: "Tres rutas no pueden llevar el blob de desarrollo: develop tiene lineas de otros frentes (modelos Apex* del frente apex-control, polling_minutes, la fila Marcaciones del panel) y llevar el blob completo los habria promovido sin su propio porton. Aqui se mide que lo que sube son MIS hunks y que ninguna linea ajena se pierde.",
  rutas,
  conservacion_de_lineas_ajenas: conservacion,
  veredicto: hunksOk && ajenasOk
    ? "LOS HUNKS SON LOS MIOSES, NI UNA LINEA MAS, Y CERO LINEA AJENA PERDIDA"
    : "DERIVA: revisar antes de empacar"
};

fs.writeFileSync(path.join(DIR, "merge-hunks.json"), JSON.stringify(doc, null, 2) + "\n");
console.log(doc.veredicto);
console.log(JSON.stringify(rutas.map((r) => `${path.basename(r.file)} +${r.candidato_vs_develop.anadidas}/-${r.candidato_vs_develop.quitadas} identicas=${r.anadidas_identicas && r.quitadas_identicas}`)));
console.log(JSON.stringify(conservacion.map((c) => `${path.basename(c.file)}: ${c.controles.map((x) => `${x.token}=${x.apariciones}${x.ok ? "ok" : "ROTO"}`).join(" ")}`)));
