const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// El panel de la marca del mapa de operaciones pintaba un `<Image>` cuyo `src` era
// `metadata.evidence[0].base64_data`. Medido el 2026-11-23, la rama `metadata.evidence` existe en cero
// filas de `TimePunch` en Produccion y en cero en QA, asi que el `src` nunca se pinto: era codigo muerto
// que hacia de filtracion de binarios. Retirarlo sincertificar que lo que queda en su lugar sigue
// viajando al navegador es tan debil como no retirarlo, de modo que esta sonda lee el ARTEFACTO SERVIDO:
// el alt de la rama retirada no puede aparecer en ningun chunk, y el marcador propio de la pantalla si.
//
// Uso:
//   node scripts/certifications/hr-map-inline-evidence-artifact-local.js [--output=<dir>] [--selftest]
// Requiere el build de produccion de apps/web ya ejecutado (next build).

const ROOT = path.resolve(__dirname, "..", "..");
const WEB = path.join(ROOT, "apps", "web");
const MAPA_SOURCE = path.join(WEB, "app", "dashboard", "talento-humano", "mapa", "page.tsx");

const RETIRED_MARKER = "Evidencia operativa";
const SCREEN_MARKER = "Mapa en vivo de rutas y marcaciones";
const REFERENCE_MARKER = "<HrTimelineEvidence evidence={[selectedMark.extra_evidence, selectedMark.identity_evidence]";

const argsFrom = (argv) => {
  const result = {};
  for (const value of argv) {
    if (!value.startsWith("--")) continue;
    const index = value.indexOf("=");
    if (index < 0) result[value.slice(2)] = true;
    else result[value.slice(2, index)] = value.slice(index + 1);
  }
  return result;
};
const args = argsFrom(process.argv.slice(2));
const OUT_DIR = path.resolve(String(args.output || path.join(ROOT, "docs/qa/evidence/hr-map-inline-evidence-20261123")));

function* walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(js|mjs|css|html|txt)$/.test(entry.name)) yield full;
  }
}

function scan(directory, needles) {
  const hits = Object.fromEntries(needles.map((needle) => [needle, []]));
  let files = 0;
  for (const file of walk(directory)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    files += 1;
    for (const needle of needles) {
      if (text.includes(needle)) hits[needle].push(path.relative(directory, file));
    }
  }
  return { files, hits };
}

function runChecks() {
  const checks = [];
  const report = (name, ok, payload) => checks.push({ name, ok: Boolean(ok), ...(payload ? { payload } : {}) });
  const source = fs.readFileSync(MAPA_SOURCE, "utf8");

  report("la_fuente_del_mapa_no_lleva_la_rama_de_binarios", !source.includes(RETIRED_MARKER));
  report("la_fuente_conserva_la_evidencia_por_referencia", source.includes(REFERENCE_MARKER));

  if (!fs.existsSync(path.join(WEB, ".next", "BUILD_ID"))) {
    report("el_bundle_servido_no_lleva_el_alt_retirado", false, { motivo: "apps/web/.next/BUILD_ID no existe: falta next build" });
    report("el_escaner_lee_archivos_de_verdad", false, { motivo: "apps/web/.next/BUILD_ID no existe: falta next build" });
    return { checks, build_id: "", scanned: 0 };
  }

  const buildId = fs.readFileSync(path.join(WEB, ".next", "BUILD_ID"), "utf8").trim();
  const corpus = [
    scan(path.join(WEB, ".next", "static"), [RETIRED_MARKER, SCREEN_MARKER]),
    scan(path.join(WEB, ".next", "server"), [RETIRED_MARKER, SCREEN_MARKER])
  ];
  const scanned = corpus.reduce((total, part) => total + part.files, 0);
  const retiredHits = corpus.flatMap((part) => part.hits[RETIRED_MARKER]);
  const screenHits = corpus.flatMap((part) => part.hits[SCREEN_MARKER]);

  // El verde de una ausencia solo vale si el mismo escaner encuentra otra cadena en el mismo corpus.
  report("el_bundle_servido_no_lleva_el_alt_retirado", scanned > 0 && retiredHits.length === 0, { archivos: scanned, coincidencias: retiredHits });
  report("el_escaner_lee_archivos_de_verdad", scanned > 0 && screenHits.length > 0, { archivos: scanned, chunks_con_la_pantalla: screenHits.slice(0, 3) });
  return { checks, build_id: buildId, scanned };
}

// El arnes tiene que poder fallar: si el escaner no detecta la cadena que se retiro, la ausencia
// certificada es decorativa. Los dos fixtures sinteticos se escriben en un directorio temporal y se
// leen con la misma funcion que corre contra `.next`.
function selftest() {
  const results = [];
  const report = (name, ok, payload) => results.push({ name, ok: Boolean(ok), ...(payload ? { payload } : {}) });
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-artifact-selftest-"));
  try {
    const conBinario = path.join(fixture, "con-binario", "static", "chunk.js");
    fs.mkdirSync(path.dirname(conBinario), { recursive: true });
    fs.writeFileSync(conBinario, `var a="alt=${RETIRED_MARKER}";var b="${SCREEN_MARKER}";`);
    const detecta = scan(path.join(fixture, "con-binario"), [RETIRED_MARKER, SCREEN_MARKER]);
    report("detecta_la_rama_que_se_quiere_retirar", detecta.files === 1 && detecta.hits[RETIRED_MARKER].length === 1, detecta.hits);

    const limpio = path.join(fixture, "limpio", "static", "chunk.js");
    fs.mkdirSync(path.dirname(limpio), { recursive: true });
    fs.writeFileSync(limpio, `var b="${SCREEN_MARKER}";`);
    const sinRuido = scan(path.join(fixture, "limpio"), [RETIRED_MARKER, SCREEN_MARKER]);
    report("un_fuente_limpio_no_da_falsos_positivos", sinRuido.files === 1 && sinRuido.hits[RETIRED_MARKER].length === 0, sinRuido.hits);

    const vacio = scan(path.join(fixture, "no-existe"), [RETIRED_MARKER]);
    report("un_corpus_vacio_no_puede_certificar_ausencia", vacio.files === 0, vacio);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  return results;
}

function main() {
  if (args.selftest) {
    const results = selftest();
    const failed = results.filter((item) => !item.ok);
    console.log(JSON.stringify({ modo: "selftest", checks: results }, null, 2));
    console.log(failed.length ? `SELFTEST BLOQUEADO (${failed.length} controles del arnes fallan)` : "SELFTEST OK");
    process.exit(failed.length ? 1 : 0);
  }

  const { checks, build_id: buildId, scanned } = runChecks();
  const failed = checks.filter((item) => !item.ok);
  const payload = {
    instrumento: "hr-map-inline-evidence-artifact-local",
    fecha: new Date().toISOString(),
    rama: (() => {
      try {
        return require("node:child_process").execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();
      } catch {
        return "";
      }
    })(),
    build_id: buildId,
    archivos_escaneados: scanned,
    marcadores: { retirado: RETIRED_MARKER, pantalla: SCREEN_MARKER },
    checks,
    passed: checks.filter((item) => item.ok).length,
    failed: failed.length,
    total: checks.length
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outputFile = path.join(OUT_DIR, `artifact-scan-${Date.now()}.json`);
  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  for (const item of checks) console.log(`${item.ok ? "PASS" : "FALLO"} ${item.name}${item.payload ? ` ${JSON.stringify(item.payload)}` : ""}`);
  console.log(`${failed.length ? "BLOQUEADO" : "CERTIFICADO"} ${payload.passed}/${payload.total} · build ${buildId || "sin"} · ${scanned} archivos leidos`);
  console.log(`evidencia: ${path.relative(ROOT, outputFile)}`);
  process.exit(failed.length ? 1 : 0);
}

main();
