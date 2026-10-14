// Regresion LOCAL del cambio del rol Accionista.
//
// El cambio toca supabaseAuth.js, que autentica a TODO usuario que entra con
// Supabase, y su resultado lo consume rbac.js en todos los modulos. Esta
// regresion ejecuta cada suite del API que carga cualquiera de los dos, para
// certificar que admin, marcaciones, viewer, member, roles especiales,
// seleccion de empresa y RBAC de los demas modulos siguen igual.
//
// No usa red ni base de datos: las suites mockean Prisma.
//
// Uso: node scripts/certifications/shareholder-role-regression-local.js --output <json>
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return result;
}

const args = argsFrom(process.argv.slice(2));
const ROOT = path.resolve(__dirname, "../..");
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/shareholder-role-20261013/regression-certification.json"));
const TEST_DIR = path.join(ROOT, "apps/api/test");
const TOUCHED = /security\/supabaseAuth|middleware\/rbac/;

const suites = fs.readdirSync(TEST_DIR)
  .filter((file) => file.endsWith(".test.js"))
  .filter((file) => TOUCHED.test(fs.readFileSync(path.join(TEST_DIR, file), "utf8")))
  .sort();

const result = {
  certification: "shareholder-role-regression-local",
  environment: "LOCAL",
  started_at: new Date().toISOString(),
  criterion: "toda suite de apps/api/test que carga security/supabaseAuth o middleware/rbac",
  suites: []
};

for (const file of suites) {
  const run = spawnSync(process.execPath, ["--test", "--test-timeout=60000", path.join("apps/api/test", file)], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, REDIS_DISABLED: "true", DISABLE_REDIS: "true" },
    timeout: 300000
  });
  const output = `${run.stdout || ""}${run.stderr || ""}`;
  const count = (label) => Number((output.match(new RegExp(`^# ${label} (\\d+)`, "m")) || [])[1] || 0);
  const suite = { file, exit_code: run.status, tests: count("tests"), pass: count("pass"), fail: count("fail"), cancelled: count("cancelled") };
  suite.ok = run.status === 0 && suite.fail === 0 && suite.cancelled === 0 && suite.tests > 0;
  if (!suite.ok) suite.failures = output.split(/\r?\n/).filter((line) => /^not ok/.test(line)).slice(0, 20);
  result.suites.push(suite);
  console.log(`${suite.ok ? "OK  " : "FALLA"} ${file} ${suite.pass}/${suite.tests}`);
}

result.totals = {
  suites: result.suites.length,
  tests: result.suites.reduce((sum, suite) => sum + suite.tests, 0),
  pass: result.suites.reduce((sum, suite) => sum + suite.pass, 0),
  fail: result.suites.reduce((sum, suite) => sum + suite.fail, 0)
};
result.passed = result.suites.length > 0 && result.suites.every((suite) => suite.ok);
result.finished_at = new Date().toISOString();
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(`REGRESION ${result.passed ? "APROBADA" : "FALLIDA"}: ${result.totals.pass}/${result.totals.tests} en ${result.totals.suites} suites`);
process.exit(result.passed ? 0 : 1);
