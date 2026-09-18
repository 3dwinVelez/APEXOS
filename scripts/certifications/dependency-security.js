const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync, execFileSync } = require("node:child_process");

function argsFrom(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) continue;
    values[entry.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return values;
}

function major(version) {
  return Number(String(version || "0").split(".")[0]);
}

function check(result, name, ok, detail = {}) {
  result.checks.push({ name, status: ok ? "passed" : "failed", detail });
  if (!ok) throw new Error(`Fallo de seguridad de dependencias: ${name}`);
}

function runAudit() {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
  const args = npmExecPath ? [npmExecPath, "audit", "--json"] : ["audit", "--json"];
  const audit = spawnSync(command, args, { cwd: path.resolve(__dirname, "../.."), encoding: "utf8" });
  const output = String(audit.stdout || "").trim();
  if (!output) throw new Error(`npm audit no produjo salida JSON: ${String(audit.stderr || "").trim()}`);
  return JSON.parse(output);
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  const root = path.resolve(__dirname, "../..");
  const output = path.resolve(root, String(args.output || "docs/qa/evidence/dependency-security-20260824/certification.json"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const apiRequire = createRequire(path.join(root, "apps/api/package.json"));
  const versions = {
    next: lock.packages?.["apps/web/node_modules/next"]?.version || null,
    puppeteer_core: lock.packages?.["apps/api/node_modules/puppeteer-core"]?.version || null,
    sharp: lock.packages?.["apps/api/node_modules/sharp"]?.version || null,
    postcss: lock.packages?.["node_modules/postcss"]?.version || null,
    brace_expansion_v1: lock.packages?.["node_modules/brace-expansion"]?.version || null,
    brace_expansion_v5: lock.packages?.["node_modules/nodemon/node_modules/brace-expansion"]?.version || null,
    fast_uri: lock.packages?.["node_modules/fast-uri"]?.version || null,
    ip_address: lock.packages?.["node_modules/ip-address"]?.version || null,
    js_yaml: lock.packages?.["node_modules/js-yaml"]?.version || null,
    nanoid: lock.packages?.["node_modules/nanoid"]?.version || null
  };
  const result = {
    change_id: "dependency-security-20260824",
    environment: "development",
    generated_at: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    versions,
    checks: [],
    status: "running"
  };

  try {
    const audit = runAudit();
    const vulnerabilities = audit.metadata?.vulnerabilities || {};
    check(result, "npm_audit_zero", Number(vulnerabilities.total || 0) === 0, { vulnerabilities });
    check(result, "next_security_line", major(versions.next) >= 16, { version: versions.next });
    check(result, "puppeteer_security_line", major(versions.puppeteer_core) >= 25, { version: versions.puppeteer_core });
    check(result, "sharp_security_line", major(versions.sharp) >= 0 && Number(String(versions.sharp).split(".")[1] || 0) >= 35, { version: versions.sharp });
    const containsExtractZip = Object.keys(lock.packages || {}).some((entry) => entry.endsWith("node_modules/extract-zip"));
    check(result, "extract_zip_removed", !containsExtractZip, {});

    const puppeteer = apiRequire("puppeteer-core");
    const sharp = apiRequire("sharp");
    check(result, "puppeteer_launch_api", typeof puppeteer.launch === "function", {});
    const image = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    check(result, "sharp_binary_operation", image.length > 0, { output_bytes: image.length });
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message };
    throw error;
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  }

  console.log(`CERTIFICACION DE DEPENDENCIAS APROBADA: ${result.checks.length} controles`);
}

main().catch((error) => {
  console.error(`CERTIFICACION DE DEPENDENCIAS FALLIDA: ${error.message}`);
  process.exitCode = 1;
});
